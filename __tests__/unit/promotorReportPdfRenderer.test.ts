import { PDFDocument, PDFPage } from "pdf-lib";
import PromotorReportPdfRenderer from "../../service/promotorReportPdfRenderer";
import { RelatorioPromotorData } from "../../types/promotorRelatorio";

const DADOS: RelatorioPromotorData = {
  idCliente: 10,
  nomeCliente: "SKF",
  periodo: { inicio: new Date("2026-10-09T00:00:00-03:00"), fim: new Date("2026-10-22T23:59:59-03:00") },
  campanhas: [
    {
      idCampanha: 1,
      nomeCampanha: "Campanha SKF",
      visaoGeral: { concluidas: 71, canceladas: 21, abertasNaRota: 132 },
      visitasPorDia: [
        { dia: "13/10", diaSemana: "ter", concluidas: 2, canceladas: 0 },
        { dia: "14/10", diaSemana: "qua", concluidas: 4, canceladas: 0 },
        { dia: "15/10", diaSemana: "qui", concluidas: 52, canceladas: 16 },
      ],
      assertividade: 77,
      porPromotor: [
        { idPromotor: 1, nomePromotor: "Willian Ferreira", concluidasPeriodo: 15, canceladasPeriodo: 0, concluidasAcumulado: 18, abertasNaRota: 11 },
      ],
      cancelamentos: [
        { idPromotor: 2, nomePromotor: "José Maria Jr.", nomeOficina: "Real Car", cidadeOficina: "Belo Horizonte/MG", obs: "Promotor de folga" },
      ],
      destaquesDeCampo: [
        { status: "cancelada", idPromotor: 2, nomePromotor: "José Maria Jr.", nomeOficina: "Real Car", cidadeOficina: "Belo Horizonte/MG", obs: "Promotor de folga" },
      ],
      proximosPassos: { abertasNaRota: 132, canceladasARedistribuir: 21, promotoresSemRegistro: 1 },
    },
  ],
};

let drawTextSpy: jest.SpyInstance;

beforeEach(() => {
  // Spia a API real do pdf-lib (sem mockar o módulo) -- confirma o texto
  // efetivamente mandado pro PDF, na ordem real de desenho (topo->baixo).
  drawTextSpy = jest.spyOn(PDFPage.prototype, "drawText");
});

afterEach(() => drawTextSpy.mockRestore());

function textosDesenhados(): string[] {
  return drawTextSpy.mock.calls.map((chamada) => chamada[0] as string);
}

describe("PromotorReportPdfRenderer.renderizarPdf", () => {
  it("retorna um Buffer de PDF valido — RELPROM-01", async () => {
    const resultado = await PromotorReportPdfRenderer.renderizarPdf(DADOS);

    expect(Buffer.isBuffer(resultado)).toBe(true);
    expect(resultado.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("desenha o nome do cliente e de cada campanha", async () => {
    await PromotorReportPdfRenderer.renderizarPdf(DADOS);

    const textos = textosDesenhados();
    expect(textos).toContain("SKF");
    // O nome da campanha vai no eyebrow de cada seção ("VISÃO GERAL — CAMPANHA SKF" etc.), em maiúsculas.
    expect(textos.some((t) => t.toUpperCase().includes("CAMPANHA SKF"))).toBe(true);
  });

  it("desenha os contadores da visao geral e dos proximos passos", async () => {
    await PromotorReportPdfRenderer.renderizarPdf(DADOS);

    const textos = textosDesenhados();
    expect(textos).toContain("71");
    expect(textos).toContain("21");
    expect(textos).toContain("132");
  });

  it("gera 1 capa + 6 paginas de secao por campanha, 1 bloco por campanha (RELPROM-26)", async () => {
    const dadosComDuasCampanhas: RelatorioPromotorData = {
      ...DADOS,
      campanhas: [DADOS.campanhas[0], { ...DADOS.campanhas[0], idCampanha: 2, nomeCampanha: "Campanha Outra" }],
    };

    const resultado = await PromotorReportPdfRenderer.renderizarPdf(dadosComDuasCampanhas);

    const doc = await PDFDocument.load(resultado);
    expect(doc.getPageCount()).toBe(13); // 1 capa + 6 secoes x 2 campanhas
    const textos = textosDesenhados().map((t) => t.toUpperCase());
    expect(textos.some((t) => t.includes("CAMPANHA SKF"))).toBe(true);
    expect(textos.some((t) => t.includes("CAMPANHA OUTRA"))).toBe(true);
  });

  it("gera 1 capa + 6 paginas de secao pra 1 campanha unica (RELPROM-27)", async () => {
    const resultado = await PromotorReportPdfRenderer.renderizarPdf(DADOS);

    const doc = await PDFDocument.load(resultado);
    expect(doc.getPageCount()).toBe(7); // 1 capa + 6 secoes
  });

  it("coloca cada destaque sob o titulo correto, mesmo com status misto — RELPROM-09", async () => {
    const dadosComDestaquesMistos: RelatorioPromotorData = {
      ...DADOS,
      campanhas: [
        {
          ...DADOS.campanhas[0],
          destaquesDeCampo: [
            { status: "concluida", idPromotor: 1, nomePromotor: "Willian", nomeOficina: "Oficina A", cidadeOficina: "São Paulo/SP", obs: "Obs concluida unica" },
            { status: "cancelada", idPromotor: 2, nomePromotor: "José", nomeOficina: "Oficina B", cidadeOficina: "Belo Horizonte/MG", obs: "Obs cancelada unica" },
          ],
        },
      ],
    };

    await PromotorReportPdfRenderer.renderizarPdf(dadosComDestaquesMistos);

    const textos = textosDesenhados();
    const indiceConcluidas = textos.indexOf("Concluídas com observação");
    const indiceCanceladas = textos.indexOf("Canceladas com justificativa");
    const indiceObsConcluida = textos.findIndex((t) => t.includes("Obs concluida unica"));
    const indiceObsCancelada = textos.findIndex((t) => t.includes("Obs cancelada unica"));

    expect(indiceConcluidas).toBeGreaterThanOrEqual(0);
    expect(indiceCanceladas).toBeGreaterThan(indiceConcluidas);
    // A ordem real de desenho (topo->baixo) é a ordem das chamadas: a
    // observação "concluida" tem de ser desenhada entre os 2 titulos.
    expect(indiceObsConcluida).toBeGreaterThan(indiceConcluidas);
    expect(indiceObsConcluida).toBeLessThan(indiceCanceladas);
    expect(indiceObsCancelada).toBeGreaterThan(indiceCanceladas);
  });

  it("quebra observacoes longas em varias linhas, sem cortar o texto (RELPROM-24 ja trunca em 500, aqui so garante leitura)", async () => {
    const obsLonga = "palavra ".repeat(40).trim(); // bem maior que 1 linha de pagina A4
    const dados: RelatorioPromotorData = {
      ...DADOS,
      campanhas: [
        {
          ...DADOS.campanhas[0],
          destaquesDeCampo: [
            { status: "concluida", idPromotor: 1, nomePromotor: "P", nomeOficina: "O", cidadeOficina: "C/UF", obs: obsLonga },
          ],
        },
      ],
    };

    await PromotorReportPdfRenderer.renderizarPdf(dados);

    const textosComPalavra = textosDesenhados().filter((t) => t.includes("palavra"));
    expect(textosComPalavra.length).toBeGreaterThan(1); // quebrou em mais de 1 linha
  });

  it("desenha o grafico por dia empilhado com valor combinado e o dia de pico em destaque — RELPROM-44", async () => {
    await PromotorReportPdfRenderer.renderizarPdf(DADOS);

    const textos = textosDesenhados();
    expect(textos).toContain("52 + 16"); // dia com concluidas + canceladas combinados
    expect(textos).toContain("2"); // dia so com concluidas, sem "+"
    expect(textos).toContain("15/10 (qui)"); // dia de pico (mais concluidas) com dia da semana
    expect(textos).toContain("13/10"); // dia sem destaque, sem sufixo de dia da semana
  });

  it("cabecalho da secao de destaques sempre mostra 'O que os promotores registraram no app' — RELPROM-59", async () => {
    await PromotorReportPdfRenderer.renderizarPdf(DADOS);

    const textos = textosDesenhados();
    expect(textos).toContain("O que os promotores registraram no app");
    expect(textos).not.toContain("Observações registradas pelos promotores");
  });

  it("desenha ate 4 insights (titulo + descricao) quando insightsCampo esta presente, sem os cards — RELPROM-58", async () => {
    const dados: RelatorioPromotorData = {
      ...DADOS,
      campanhas: [
        {
          ...DADOS.campanhas[0],
          insightsCampo: [
            { titulo: "Base com oficinas que não existem mais", descricao: "6 oficinas fechadas ou inexistentes no período." },
          ],
        },
      ],
    };

    await PromotorReportPdfRenderer.renderizarPdf(dados);

    const textos = textosDesenhados();
    expect(textos).toContain("Base com oficinas que não existem mais");
    expect(textos).toContain("6 oficinas fechadas ou inexistentes no período.");
    expect(textos).not.toContain("Concluídas com observação");
    expect(textos).not.toContain("Canceladas com justificativa");
  });

  it("cai pra listagem de cards individuais quando insightsCampo esta ausente — RELPROM-61", async () => {
    await PromotorReportPdfRenderer.renderizarPdf(DADOS);

    const textos = textosDesenhados();
    expect(textos).toContain("Canceladas com justificativa");
  });

  it("usa a tabela resumo agrupada quando resumoCancelamentos esta presente — RELPROM-53", async () => {
    const dados: RelatorioPromotorData = {
      ...DADOS,
      campanhas: [
        {
          ...DADOS.campanhas[0],
          cancelamentos: [
            { idPromotor: 2, nomePromotor: "José", nomeOficina: "Real Car", cidadeOficina: "Belo Horizonte/MG", obs: "Folga" },
            { idPromotor: 2, nomePromotor: "José", nomeOficina: "Ricar", cidadeOficina: "Belo Horizonte/MG", obs: "Folga" },
          ],
          resumoCancelamentos: [
            { promotor: "José", oficinas: ["Real Car", "Ricar"], cidade: "Belo Horizonte/MG", justificativa: "2 oficinas canceladas por folga do promotor" },
          ],
        },
      ],
    };

    await PromotorReportPdfRenderer.renderizarPdf(dados);

    const textos = textosDesenhados();
    expect(textos).toContain("2 oficinas: Real Car, Ricar"); // formatado deterministicamente, nunca texto cru
    expect(textos).toContain("2 oficinas canceladas por folga do promotor");
    expect(textos.filter((t) => t === "Ricar")).toHaveLength(0); // nao lista cada oficina em linha separada
  });

  it("cai pra tabela detalhada (1 linha por cancelamento) quando resumoCancelamentos esta ausente — RELPROM-55", async () => {
    await PromotorReportPdfRenderer.renderizarPdf(DADOS);

    const textos = textosDesenhados();
    expect(textos).toContain("José Maria Jr.");
    expect(textos).toContain("Real Car");
  });

  it("desenha a sintese de cada secao, logo apos a linha de destaque e antes do conteudo deterministico — RELPROM-52", async () => {
    const dados: RelatorioPromotorData = {
      ...DADOS,
      campanhas: [
        {
          ...DADOS.campanhas[0],
          sintesesPorSecao: {
            visaoGeral: "Sintese da visao geral",
            assertividade: "Sintese da assertividade",
            porPromotor: "Sintese por promotor",
            cancelamentos: "Sintese dos cancelamentos",
            destaques: "Sintese dos destaques",
            proximosPassos: "Sintese dos proximos passos",
          },
        },
      ],
    };

    await PromotorReportPdfRenderer.renderizarPdf(dados);

    const textos = textosDesenhados();
    for (const sintese of [
      "Sintese da visao geral",
      "Sintese da assertividade",
      "Sintese por promotor",
      "Sintese dos cancelamentos",
      "Sintese dos destaques",
      "Sintese dos proximos passos",
    ]) {
      expect(textos).toContain(sintese);
    }

    // Na visao geral, a sintese vem antes do rotulo do 1o card (conteudo deterministico).
    const indiceSintese = textos.indexOf("Sintese da visao geral");
    const indiceCard = textos.indexOf("Visitas concluídas");
    expect(indiceSintese).toBeLessThan(indiceCard);
  });

  it("sem sintesesPorSecao, nao desenha nenhum texto extra nem quebra o pdf — RELPROM-51", async () => {
    const resultado = await PromotorReportPdfRenderer.renderizarPdf(DADOS);

    const doc = await PDFDocument.load(resultado);
    expect(doc.getPageCount()).toBe(7); // 1 capa + 6 secoes, sem pagina extra por causa da sintese ausente
  });
});
