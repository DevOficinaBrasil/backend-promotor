import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { RelatorioPromotorData, CampanhaBlocoRelatorio } from "../types/promotorRelatorio";
import { Cancelamento, DestaqueCampo, descreverDiaPico, LinhaPromotor, PontoVisitasPorDia } from "../utils/promotorReportCalculos";

/**
 * Gera o PDF do relatório desenhando direto com `pdf-lib` (sem navegador —
 * trocado de Playwright porque o Chromium precisa de um binário + libs de
 * sistema instalados no ambiente de execução, frágil demais pra um cron de
 * produção; ver design.md, Risks & Concerns). Fontes padrão do `pdf-lib`
 * (Helvetica): embutir a fonte de marca (Montserrat) exigiria instalar
 * `@pdf-lib/fontkit` à parte (não é o `fontkit` puro já presente no
 * `package.json`) — sem AC pedindo fidelidade visual exata, não se justifica.
 *
 * Layout espelha a organização, a ordem e as proporções do modelo anexado ao
 * CON26-325: página no formato slide widescreen (960x540pt, não A4 — o
 * modelo é um deck, não um documento), 1 seção por página (capa escura →
 * visão geral clara (com gráfico por dia) → assertividade escura → por
 * promotor clara → cancelamentos clara → destaques clara → próximos passos
 * escura), paleta navy/verde-limão/menta e cards grandes.
 */

const LARGURA_PAGINA = 960; // formato slide widescreen (13.33x7.5in a 72dpi), como o modelo
const ALTURA_PAGINA = 540;
const MARGEM = 40;
const LARGURA_UTIL = LARGURA_PAGINA - 2 * MARGEM;

// Paleta aproximada do modelo (sem o arquivo de design original, não é
// pixel-perfect, mas mantém a mesma lógica: navy escuro, verde-limão de
// destaque, menta claro pros cards secundários).
const COR_NAVY = rgb(0.043, 0.122, 0.302); // #0B1F4D
const COR_NAVY_CLARA = rgb(0.11, 0.2, 0.42); // card escuro sobre página escura
const COR_VERDE = rgb(0.569, 0.812, 0.243); // #91CF3E — eyebrow, números grandes, linha de destaque
const COR_MENTA = rgb(0.886, 0.953, 0.925); // #E2F3EC — card/zebra claro
const COR_BRANCA = rgb(1, 1, 1);
const COR_TEXTO = COR_NAVY; // corpo de texto em página clara usa navy, não preto puro
const COR_TEXTO_CLARO = rgb(0.85, 0.88, 0.95); // texto secundário em página escura
const COR_CINZA = rgb(0.4, 0.42, 0.46); // texto secundário em página clara
const COR_GRAFICO_CANCELADAS = rgb(0.65, 0.71, 0.91); // azul-lavanda — barra empilhada de canceladas, igual ao modelo
const COR_BORDA = rgb(0.85, 0.87, 0.9); // linha de base do gráfico

type EstiloPagina = "clara" | "escura";

interface Cursor {
  doc: PDFDocument;
  pagina: PDFPage;
  y: number;
  fonte: PDFFont;
  fonteNegrito: PDFFont;
  estilo: EstiloPagina;
}

function criarPagina(doc: PDFDocument, estilo: EstiloPagina): PDFPage {
  const pagina = doc.addPage([LARGURA_PAGINA, ALTURA_PAGINA]);
  if (estilo === "escura") {
    pagina.drawRectangle({ x: 0, y: 0, width: LARGURA_PAGINA, height: ALTURA_PAGINA, color: COR_NAVY });
  }
  return pagina;
}

/** Começa uma seção nova em página própria (1 seção por página, como no modelo). */
function iniciarSecao(cursor: Cursor, estilo: EstiloPagina): void {
  cursor.estilo = estilo;
  cursor.pagina = criarPagina(cursor.doc, estilo);
  cursor.y = ALTURA_PAGINA - MARGEM;
}

/** Cria página nova (mesmo estilo da atual) se não houver espaço pra `altura` a partir do y atual. */
function garantirEspaco(cursor: Cursor, altura: number): void {
  if (cursor.y - altura < MARGEM) {
    cursor.pagina = criarPagina(cursor.doc, cursor.estilo);
    cursor.y = ALTURA_PAGINA - MARGEM;
  }
}

function formatarData(data: Date): string {
  return data.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function truncarTexto(texto: string, fonte: PDFFont, tamanho: number, larguraMax: number): string {
  if (fonte.widthOfTextAtSize(texto, tamanho) <= larguraMax) return texto;
  let truncado = texto;
  while (truncado.length > 1 && fonte.widthOfTextAtSize(`${truncado}…`, tamanho) > larguraMax) {
    truncado = truncado.slice(0, -1);
  }
  return `${truncado}…`;
}

/** Quebra `texto` em linhas que cabem em `larguraMax`, sem cortar palavras. */
function quebrarLinhas(texto: string, fonte: PDFFont, tamanho: number, larguraMax: number): string[] {
  const palavras = texto.split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let linhaAtual = "";

  for (const palavra of palavras) {
    const tentativa = linhaAtual ? `${linhaAtual} ${palavra}` : palavra;
    if (fonte.widthOfTextAtSize(tentativa, tamanho) <= larguraMax) {
      linhaAtual = tentativa;
    } else {
      if (linhaAtual) linhas.push(linhaAtual);
      linhaAtual = fonte.widthOfTextAtSize(palavra, tamanho) <= larguraMax ? palavra : truncarTexto(palavra, fonte, tamanho, larguraMax);
    }
  }
  if (linhaAtual) linhas.push(linhaAtual);
  return linhas.length > 0 ? linhas : [""];
}

/** Eyebrow verde + headline grande em negrito — mesmo padrão em toda seção do modelo. */
function desenharCabecalhoSecao(cursor: Cursor, eyebrow: string, headline: string): void {
  const corTexto = cursor.estilo === "escura" ? COR_BRANCA : COR_NAVY;

  cursor.pagina.drawText(eyebrow.toUpperCase(), { x: MARGEM, y: cursor.y, size: 10, font: cursor.fonteNegrito, color: COR_VERDE });
  cursor.y -= 24;

  for (const linha of quebrarLinhas(headline, cursor.fonteNegrito, 20, LARGURA_UTIL)) {
    cursor.pagina.drawText(linha, { x: MARGEM, y: cursor.y, size: 20, font: cursor.fonteNegrito, color: corTexto });
    cursor.y -= 24;
  }
  cursor.y -= 10;
}

function desenharLinhaDestaque(cursor: Cursor): void {
  cursor.pagina.drawRectangle({ x: MARGEM, y: cursor.y, width: 44, height: 3, color: COR_VERDE });
  cursor.y -= 18;
}

interface Card {
  numero: string;
  rotulo: string;
}

/**
 * Cards grandes lado a lado. Em página clara, o 1º card vem escuro (métrica
 * principal, igual ao modelo); em página escura, todos vêm no mesmo tom.
 */
function desenharCards(cursor: Cursor, cards: Card[]): void {
  const alturaCard = 78;
  const espaco = 12;
  const larguraCard = (LARGURA_UTIL - espaco * (cards.length - 1)) / cards.length;

  garantirEspaco(cursor, alturaCard + 14);
  const yTopo = cursor.y;

  cards.forEach((card, indice) => {
    const x = MARGEM + indice * (larguraCard + espaco);
    const ehCardEscuro = cursor.estilo === "escura" || indice === 0;
    const corFundo = ehCardEscuro ? (cursor.estilo === "escura" ? COR_NAVY_CLARA : COR_NAVY) : COR_MENTA;
    const corNumero = ehCardEscuro ? COR_VERDE : COR_NAVY;
    const corRotulo = ehCardEscuro ? COR_TEXTO_CLARO : COR_CINZA;

    cursor.pagina.drawRectangle({ x, y: yTopo - alturaCard, width: larguraCard, height: alturaCard, color: corFundo });
    cursor.pagina.drawText(card.numero, { x: x + 14, y: yTopo - 38, size: 28, font: cursor.fonteNegrito, color: corNumero });
    for (const [indiceLinha, linha] of quebrarLinhas(card.rotulo, cursor.fonte, 9, larguraCard - 28).entries()) {
      cursor.pagina.drawText(linha, { x: x + 14, y: yTopo - 54 - indiceLinha * 11, size: 9, font: cursor.fonte, color: corRotulo });
    }
  });

  cursor.y = yTopo - alturaCard - 20;
}

/** Caixa de destaque (callout) — usada na assertividade e no resumo de cancelamentos. */
function desenharCallout(cursor: Cursor, texto: string): void {
  const padding = 12;
  const corFundo = cursor.estilo === "escura" ? COR_NAVY_CLARA : COR_MENTA;
  const corTexto = cursor.estilo === "escura" ? COR_BRANCA : COR_NAVY;
  const linhas = quebrarLinhas(texto, cursor.fonteNegrito, 10.5, LARGURA_UTIL - padding * 2);
  const altura = linhas.length * 14 + padding * 2;

  garantirEspaco(cursor, altura + 10);
  cursor.pagina.drawRectangle({ x: MARGEM, y: cursor.y - altura, width: LARGURA_UTIL, height: altura, color: corFundo });
  linhas.forEach((linha, indice) => {
    cursor.pagina.drawText(linha, { x: MARGEM + padding, y: cursor.y - padding - 10 - indice * 14, size: 10.5, font: cursor.fonteNegrito, color: corTexto });
  });
  cursor.y -= altura + 16;
}

/**
 * Frase curta de síntese gerada por IA (RELPROM-49/52), quando existir pra
 * essa seção — reaproveita o visual de `desenharCallout`. Sem síntese, não
 * desenha nada (sem espaço em branco sobrando).
 */
function desenharSintese(cursor: Cursor, texto: string | undefined): void {
  if (!texto) return;
  desenharCallout(cursor, texto);
}

function desenharSubtitulo(cursor: Cursor, titulo: string, espacoAcima = 10): void {
  garantirEspaco(cursor, 18 + espacoAcima);
  cursor.y -= espacoAcima;
  const corTexto = cursor.estilo === "escura" ? COR_BRANCA : COR_NAVY;
  cursor.pagina.drawText(titulo, { x: MARGEM, y: cursor.y, size: 11, font: cursor.fonteNegrito, color: corTexto });
  cursor.y -= 16;
}

/**
 * Gráfico de barras empilhadas — concluídas (base) + canceladas (topo) por
 * dia, igual ao modelo. Só pontos com atividade entram (ver
 * `agruparVisitasPorDia`). O dia com mais concluídas vem com o rótulo em
 * negrito + dia da semana, igual ao destaque do modelo.
 */
function desenharGraficoPorDia(cursor: Cursor, pontos: PontoVisitasPorDia[], totalConcluidasPeriodo: number): void {
  desenharSubtitulo(cursor, "Visitas por dia");

  const alturaBarras = 90;
  const alturaGrafico = alturaBarras + 56;

  garantirEspaco(cursor, alturaGrafico + 16);

  if (pontos.length === 0) {
    cursor.pagina.drawText("Sem visitas registradas no período.", { x: MARGEM, y: cursor.y - 10, size: 9, font: cursor.fonte, color: COR_CINZA });
    cursor.y -= alturaGrafico;
    return;
  }

  const destaque = descreverDiaPico(pontos, totalConcluidasPeriodo);
  const yBase = cursor.y - alturaBarras;
  const larguraGrupo = LARGURA_UTIL / pontos.length;
  const larguraBarra = Math.max(16, Math.min(44, larguraGrupo - 28));
  const maiorTotal = Math.max(1, ...pontos.map((ponto) => ponto.concluidas + ponto.canceladas));

  cursor.pagina.drawLine({ start: { x: MARGEM, y: yBase }, end: { x: MARGEM + LARGURA_UTIL, y: yBase }, thickness: 1, color: COR_BORDA });

  pontos.forEach((ponto, indice) => {
    const xCentro = MARGEM + indice * larguraGrupo + larguraGrupo / 2;
    const xBarra = xCentro - larguraBarra / 2;
    const alturaConcluidas = (ponto.concluidas / maiorTotal) * alturaBarras;
    const alturaCanceladas = (ponto.canceladas / maiorTotal) * alturaBarras;

    if (ponto.concluidas > 0) {
      cursor.pagina.drawRectangle({ x: xBarra, y: yBase, width: larguraBarra, height: alturaConcluidas, color: COR_NAVY });
    }
    if (ponto.canceladas > 0) {
      cursor.pagina.drawRectangle({ x: xBarra, y: yBase + alturaConcluidas, width: larguraBarra, height: alturaCanceladas, color: COR_GRAFICO_CANCELADAS });
    }

    const textoValor = ponto.concluidas > 0 && ponto.canceladas > 0 ? `${ponto.concluidas} + ${ponto.canceladas}` : String(ponto.concluidas || ponto.canceladas);
    const larguraValor = cursor.fonteNegrito.widthOfTextAtSize(textoValor, 9.5);
    cursor.pagina.drawText(textoValor, {
      x: xCentro - larguraValor / 2,
      y: yBase + alturaConcluidas + alturaCanceladas + 4,
      size: 9.5,
      font: cursor.fonteNegrito,
      color: COR_NAVY,
    });

    const ehDiaDestaque = destaque?.dia === ponto.dia;
    const textoDia = ehDiaDestaque ? `${ponto.dia} (${ponto.diaSemana})` : ponto.dia;
    const fonteDia = ehDiaDestaque ? cursor.fonteNegrito : cursor.fonte;
    const larguraDia = fonteDia.widthOfTextAtSize(textoDia, 8.5);
    cursor.pagina.drawText(textoDia, { x: xCentro - larguraDia / 2, y: yBase - 16, size: 8.5, font: fonteDia, color: ehDiaDestaque ? COR_NAVY : COR_CINZA });
  });

  const yLegenda = yBase - 38;
  cursor.pagina.drawRectangle({ x: MARGEM, y: yLegenda, width: 9, height: 9, color: COR_NAVY });
  cursor.pagina.drawText("Concluídas", { x: MARGEM + 13, y: yLegenda + 1, size: 8.5, font: cursor.fonte, color: COR_CINZA });
  cursor.pagina.drawRectangle({ x: MARGEM + 95, y: yLegenda, width: 9, height: 9, color: COR_GRAFICO_CANCELADAS });
  cursor.pagina.drawText("Canceladas", { x: MARGEM + 108, y: yLegenda + 1, size: 8.5, font: cursor.fonte, color: COR_CINZA });

  if (destaque) {
    // 1 linha só: a legenda deixa espaço de sobra numa página widescreen.
    const xLegendaFim = MARGEM + 108 + cursor.fonte.widthOfTextAtSize("Canceladas", 8.5) + 20;
    const [primeiraLinha] = quebrarLinhas(destaque.texto, cursor.fonte, 8.5, MARGEM + LARGURA_UTIL - xLegendaFim);
    cursor.pagina.drawText(primeiraLinha, { x: xLegendaFim, y: yLegenda + 1, size: 8.5, font: cursor.fonte, color: COR_CINZA });
  }

  cursor.y = yLegenda - 20;
}

interface ColunaTabela {
  titulo: string;
  largura: number;
}

/** Tabela com cabeçalho navy + texto branco e zebra menta, igual ao modelo (sem bordas de grade). */
function desenharTabela(cursor: Cursor, colunas: ColunaTabela[], linhas: string[][], mensagemVazia: string): void {
  const alturaLinha = 20;
  const larguraTotal = colunas.reduce((soma, coluna) => soma + coluna.largura, 0);

  const desenharCabecalho = () => {
    garantirEspaco(cursor, alturaLinha * 2);
    cursor.pagina.drawRectangle({ x: MARGEM, y: cursor.y - alturaLinha, width: larguraTotal, height: alturaLinha, color: COR_NAVY });
    let x = MARGEM;
    for (const coluna of colunas) {
      cursor.pagina.drawText(coluna.titulo, { x: x + 8, y: cursor.y - alturaLinha + 6, size: 9, font: cursor.fonteNegrito, color: COR_BRANCA });
      x += coluna.largura;
    }
    cursor.y -= alturaLinha;
  };

  desenharCabecalho();

  if (linhas.length === 0) {
    garantirEspaco(cursor, alturaLinha);
    cursor.pagina.drawText(mensagemVazia, { x: MARGEM + 8, y: cursor.y - alturaLinha + 6, size: 9, font: cursor.fonte, color: COR_CINZA });
    cursor.y -= alturaLinha;
  } else {
    linhas.forEach((linha, indiceLinha) => {
      const paginaAntes = cursor.pagina;
      garantirEspaco(cursor, alturaLinha);
      if (cursor.pagina !== paginaAntes) desenharCabecalho();

      if (indiceLinha % 2 === 1) {
        cursor.pagina.drawRectangle({ x: MARGEM, y: cursor.y - alturaLinha, width: larguraTotal, height: alturaLinha, color: COR_MENTA });
      }
      let x = MARGEM;
      linha.forEach((valor, indiceColuna) => {
        const coluna = colunas[indiceColuna];
        const textoTruncado = truncarTexto(valor, cursor.fonte, 9, coluna.largura - 16);
        cursor.pagina.drawText(textoTruncado, { x: x + 8, y: cursor.y - alturaLinha + 6, size: 9, font: cursor.fonte, color: COR_TEXTO });
        x += coluna.largura;
      });
      cursor.y -= alturaLinha;
    });
  }

  cursor.y -= 18;
}

function desenharCapa(cursor: Cursor, dados: RelatorioPromotorData): void {
  // Não chama iniciarSecao: a página escura inicial já foi criada em
  // construirPdf e vira a própria capa — criar outra aqui deixaria a
  // primeira em branco, sobrando no PDF final.
  cursor.y = ALTURA_PAGINA - 110;

  cursor.pagina.drawText("RELATÓRIO SEMANAL DE PROMOTORES", { x: MARGEM, y: cursor.y, size: 11, font: cursor.fonteNegrito, color: COR_VERDE });
  cursor.y -= 42;
  cursor.pagina.drawText(dados.nomeCliente, { x: MARGEM, y: cursor.y, size: 30, font: cursor.fonteNegrito, color: COR_BRANCA });
  cursor.y -= 30;
  cursor.pagina.drawText(`Período: ${formatarData(dados.periodo.inicio)} a ${formatarData(dados.periodo.fim)}`, {
    x: MARGEM,
    y: cursor.y,
    size: 12,
    font: cursor.fonte,
    color: COR_TEXTO_CLARO,
  });

  cursor.pagina.drawRectangle({ x: MARGEM, y: MARGEM + 20, width: 44, height: 3, color: COR_VERDE });
  cursor.pagina.drawText(`Gerado em ${formatarData(new Date())}`, { x: MARGEM, y: MARGEM + 4, size: 9, font: cursor.fonte, color: COR_TEXTO_CLARO });
}

function desenharVisaoGeral(cursor: Cursor, bloco: CampanhaBlocoRelatorio): void {
  iniciarSecao(cursor, "clara");
  desenharCabecalhoSecao(
    cursor,
    `Visão geral — ${bloco.nomeCampanha}`,
    `${bloco.visaoGeral.concluidas} oficinas visitadas no período`
  );
  desenharLinhaDestaque(cursor);
  desenharSintese(cursor, bloco.sintesesPorSecao?.visaoGeral);
  desenharCards(cursor, [
    { numero: String(bloco.visaoGeral.concluidas), rotulo: "Visitas concluídas" },
    { numero: String(bloco.visaoGeral.canceladas), rotulo: "Canceladas" },
    { numero: String(bloco.visaoGeral.abertasNaRota), rotulo: "Abertas na rota" },
  ]);
  desenharGraficoPorDia(cursor, bloco.visitasPorDia, bloco.visaoGeral.concluidas);
}

function desenharAssertividade(cursor: Cursor, bloco: CampanhaBlocoRelatorio): void {
  iniciarSecao(cursor, "escura");
  desenharCabecalhoSecao(cursor, `Assertividade — ${bloco.nomeCampanha}`, "Visitas concluídas sobre visitas encerradas");
  desenharLinhaDestaque(cursor);
  desenharSintese(cursor, bloco.sintesesPorSecao?.assertividade);

  garantirEspaco(cursor, 80);
  const texto = bloco.assertividade === "N/A" ? "N/A" : `${bloco.assertividade}%`;
  cursor.pagina.drawText(texto, { x: MARGEM, y: cursor.y - 44, size: 64, font: cursor.fonteNegrito, color: COR_VERDE });
  cursor.y -= 90;

  const encerradas = bloco.visaoGeral.concluidas + bloco.visaoGeral.canceladas;
  desenharCallout(
    cursor,
    `${bloco.visaoGeral.concluidas} concluídas de ${encerradas} visitas encerradas no período (concluídas + canceladas).`
  );
}

function desenharPorPromotor(cursor: Cursor, bloco: CampanhaBlocoRelatorio): void {
  iniciarSecao(cursor, "clara");
  desenharCabecalhoSecao(cursor, `Performance por promotor — ${bloco.nomeCampanha}`, `${bloco.porPromotor.length} promotores na campanha`);
  desenharLinhaDestaque(cursor);
  desenharSintese(cursor, bloco.sintesesPorSecao?.porPromotor);

  const colunas: ColunaTabela[] = [
    { titulo: "Promotor", largura: 260 },
    { titulo: "Concl. (período)", largura: 150 },
    { titulo: "Canc. (período)", largura: 150 },
    { titulo: "Concl. (acum.)", largura: 150 },
    { titulo: "Abertas", largura: LARGURA_UTIL - 260 - 150 - 150 - 150 },
  ];
  const linhas = bloco.porPromotor.map((promotor: LinhaPromotor) => [
    promotor.nomePromotor,
    String(promotor.concluidasPeriodo),
    String(promotor.canceladasPeriodo),
    String(promotor.concluidasAcumulado),
    String(promotor.abertasNaRota),
  ]);
  desenharTabela(cursor, colunas, linhas, "Sem promotores nesta campanha.");
}

/** "N oficinas: nome1, nome2, ..." quando agrupado, ou só o nome quando é 1 só — nunca texto cru da IA. */
function formatarOficinas(oficinas: string[]): string {
  return oficinas.length === 1 ? oficinas[0] : `${oficinas.length} oficinas: ${oficinas.join(", ")}`;
}

function desenharCancelamentos(cursor: Cursor, bloco: CampanhaBlocoRelatorio): void {
  iniciarSecao(cursor, "clara");
  desenharCabecalhoSecao(cursor, `Cancelamentos — ${bloco.nomeCampanha}`, `${bloco.cancelamentos.length} cancelamentos no período`);
  desenharLinhaDestaque(cursor);
  desenharSintese(cursor, bloco.sintesesPorSecao?.cancelamentos);

  const colunas: ColunaTabela[] = [
    { titulo: "Promotor", largura: 180 },
    { titulo: "Oficina(s)", largura: 180 },
    { titulo: "Cidade", largura: 180 },
    { titulo: "Justificativa", largura: LARGURA_UTIL - 180 - 180 - 180 },
  ];

  // RELPROM-53/55: usa o resumo agrupado por IA quando disponível e válido;
  // senão cai pra tabela detalhada de hoje, 1 linha por cancelamento.
  const linhas =
    bloco.resumoCancelamentos && bloco.resumoCancelamentos.length > 0
      ? bloco.resumoCancelamentos.map((grupo) => [grupo.promotor, formatarOficinas(grupo.oficinas), grupo.cidade, grupo.justificativa])
      : bloco.cancelamentos.map((cancelamento: Cancelamento) => [
          cancelamento.nomePromotor,
          cancelamento.nomeOficina,
          cancelamento.cidadeOficina,
          cancelamento.obs ?? "—",
        ]);
  desenharTabela(cursor, colunas, linhas, "Nenhum cancelamento no período.");

  if (bloco.cancelamentos.length > 0) {
    desenharCallout(cursor, `${bloco.cancelamentos.length} oficinas canceladas no período, listadas acima com a justificativa de cada promotor.`);
  }
}

/** Card de observação — 1 por visita com OBS, com barra lateral colorida por status. */
function desenharCardDestaque(cursor: Cursor, item: DestaqueCampo): void {
  const padding = 8;
  const corBarra = item.status === "concluida" ? COR_VERDE : COR_NAVY;
  const cabecalho = `${item.nomePromotor} — ${item.nomeOficina} (${item.cidadeOficina})`;
  const linhasCabecalho = quebrarLinhas(cabecalho, cursor.fonteNegrito, 9.5, LARGURA_UTIL - padding * 2 - 6);
  const linhasObs = quebrarLinhas(item.obs, cursor.fonte, 9, LARGURA_UTIL - padding * 2 - 6);
  const altura = (linhasCabecalho.length + linhasObs.length) * 12 + padding * 2;

  garantirEspaco(cursor, altura + 8);
  cursor.pagina.drawRectangle({ x: MARGEM, y: cursor.y - altura, width: LARGURA_UTIL, height: altura, color: COR_MENTA });
  cursor.pagina.drawRectangle({ x: MARGEM, y: cursor.y - altura, width: 4, height: altura, color: corBarra });

  let yLinha = cursor.y - padding - 8;
  for (const linha of linhasCabecalho) {
    cursor.pagina.drawText(linha, { x: MARGEM + padding + 6, y: yLinha, size: 9.5, font: cursor.fonteNegrito, color: COR_NAVY });
    yLinha -= 12;
  }
  for (const linha of linhasObs) {
    cursor.pagina.drawText(linha, { x: MARGEM + padding + 6, y: yLinha, size: 9, font: cursor.fonte, color: COR_CINZA });
    yLinha -= 12;
  }

  cursor.y -= altura + 8;
}

/** RELPROM-09: 2 sub-seções, concluídas e canceladas, nunca 1 lista única intercalada. */
function desenharDestaques(cursor: Cursor, bloco: CampanhaBlocoRelatorio): void {
  iniciarSecao(cursor, "clara");
  desenharCabecalhoSecao(cursor, `Destaques do campo — ${bloco.nomeCampanha}`, "Observações registradas pelos promotores");
  desenharLinhaDestaque(cursor);
  desenharSintese(cursor, bloco.sintesesPorSecao?.destaques);

  const concluidas = bloco.destaquesDeCampo.filter((destaque) => destaque.status === "concluida");
  const canceladas = bloco.destaquesDeCampo.filter((destaque) => destaque.status === "cancelada");

  desenharSubtitulo(cursor, "Concluídas com observação");
  if (concluidas.length === 0) {
    garantirEspaco(cursor, 14);
    cursor.pagina.drawText("Nenhuma.", { x: MARGEM, y: cursor.y, size: 9, font: cursor.fonte, color: COR_CINZA });
    cursor.y -= 18;
  } else {
    for (const item of concluidas) desenharCardDestaque(cursor, item);
  }

  desenharSubtitulo(cursor, "Canceladas com justificativa", 18);
  if (canceladas.length === 0) {
    garantirEspaco(cursor, 14);
    cursor.pagina.drawText("Nenhuma.", { x: MARGEM, y: cursor.y, size: 9, font: cursor.fonte, color: COR_CINZA });
    cursor.y -= 18;
  } else {
    for (const item of canceladas) desenharCardDestaque(cursor, item);
  }
}

function desenharProximosPassos(cursor: Cursor, bloco: CampanhaBlocoRelatorio): void {
  iniciarSecao(cursor, "escura");
  desenharCabecalhoSecao(cursor, `Próximos passos — ${bloco.nomeCampanha}`, "O que vem a seguir");
  desenharLinhaDestaque(cursor);
  desenharSintese(cursor, bloco.sintesesPorSecao?.proximosPassos);
  desenharCards(cursor, [
    { numero: String(bloco.proximosPassos.abertasNaRota), rotulo: "Oficinas abertas na rota" },
    { numero: String(bloco.proximosPassos.canceladasARedistribuir), rotulo: "Canceladas a redistribuir" },
    { numero: String(bloco.proximosPassos.promotoresSemRegistro), rotulo: "Promotores sem registro" },
  ]);
}

function desenharBlocoCampanha(cursor: Cursor, bloco: CampanhaBlocoRelatorio): void {
  desenharVisaoGeral(cursor, bloco);
  desenharAssertividade(cursor, bloco);
  desenharPorPromotor(cursor, bloco);
  desenharCancelamentos(cursor, bloco);
  desenharDestaques(cursor, bloco);
  desenharProximosPassos(cursor, bloco);
}

/** Gera o PDF completo: 1 capa + 6 páginas de seção por campanha (RELPROM-01, RELPROM-26, RELPROM-27). */
export async function construirPdf(dados: RelatorioPromotorData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const fonteNegrito = await doc.embedFont(StandardFonts.HelveticaBold);

  const cursor: Cursor = { doc, pagina: criarPagina(doc, "escura"), y: ALTURA_PAGINA - MARGEM, fonte, fonteNegrito, estilo: "escura" };

  desenharCapa(cursor, dados);
  for (const bloco of dados.campanhas) {
    desenharBlocoCampanha(cursor, bloco);
  }

  return doc.save();
}
