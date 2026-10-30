import OpenAI from "openai";
import { CampanhaBlocoRelatorio, InsightCampo, ResumoCancelamentoGrupo, SecaoRelatorio, SintesesPorSecao } from "../types/promotorRelatorio";
import { Cancelamento, DestaqueCampo, VisaoGeralCampanha } from "../utils/promotorReportCalculos";
import {
  construirInsightsCampo,
  construirResumoCancelamentos,
  contemTextoVerbatim,
  GrupoCancelamentoBruto,
  InsightCampoBruto,
  numerosValidosDaSecao,
  validarSintese,
} from "../utils/promotorReportSinteseValidacao";

// RELPROM-64: "porPromotor" saiu daqui — a síntese dessa seção é
// determinística (`descreverLiderPeriodo`), nunca via IA, desde que a
// validação por existência de número (RELPROM-50) deixou passar uma
// atribuição errada (número real, promotor errado) achada na revisão do PO.
const SECOES: SecaoRelatorio[] = ["visaoGeral", "assertividade", "cancelamentos", "destaques", "proximosPassos"];

const MODELO = "gpt-4o-mini";

// RELPROM-66: mesmo guardrail de vazamento verbatim do OBS já usado em
// `construirResumoCancelamentos`/`construirInsightsCampo` — a síntese geral
// (RELPROM-49) também lê OBS bruto como insumo do prompt pra essas 2 seções.
function observacoesOriginaisDaSecao(secao: SecaoRelatorio, bloco: CampanhaBlocoRelatorio): (string | null | undefined)[] {
  switch (secao) {
    case "cancelamentos":
      return bloco.cancelamentos.map((cancelamento) => cancelamento.obs);
    case "destaques":
      return bloco.destaquesDeCampo.map((destaque) => destaque.obs);
    default:
      return [];
  }
}

function montarPrompt(bloco: CampanhaBlocoRelatorio): string {
  // Só os dados já calculados — a IA nunca recebe a tarefa de somar/contar
  // nada, só de descrever em prosa o que já está pronto (RELPROM-49).
  const dadosPorSecao = {
    visaoGeral: bloco.visaoGeral,
    assertividade: { assertividade: bloco.assertividade, ...bloco.visaoGeral },
    cancelamentos: bloco.cancelamentos,
    destaques: bloco.destaquesDeCampo,
    proximosPassos: bloco.proximosPassos,
  };

  return [
    `Campanha: ${bloco.nomeCampanha}`,
    "Dados já calculados, por seção (JSON):",
    JSON.stringify(dadosPorSecao, null, 2),
    "",
    "Pra cada uma das seções acima, escreva 1 frase curta (máximo ~20 palavras) em português,",
    "descrevendo em prosa o que os dados dessa seção já mostram — nunca calcule, some ou invente",
    "nenhum número que não esteja explicitamente nos dados. Se não houver nada notável numa seção,",
    "pode omitir a chave dela na resposta.",
    "",
    'Responda só com um objeto JSON: {"visaoGeral": "...", "assertividade": "...",',
    '"cancelamentos": "...", "destaques": "...", "proximosPassos": "..."}',
  ].join("\n");
}

function montarPromptResumoCancelamentos(cancelamentos: Cancelamento[]): string {
  const itens = cancelamentos.map((cancelamento, indice) => ({
    indice,
    promotor: cancelamento.nomePromotor,
    oficina: cancelamento.nomeOficina,
    cidade: cancelamento.cidadeOficina,
    justificativaOriginal: cancelamento.obs,
  }));

  return [
    "Cancelamentos do período (JSON, 1 por índice):",
    JSON.stringify(itens, null, 2),
    "",
    "Agrupe os cancelamentos acima por motivo semelhante (ex.: folga do promotor, distância/fora",
    "da área, oficina inexistente/fechada, fora do segmento). Pra cada grupo, escreva 1 frase curta",
    "de justificativa resumindo o motivo comum — nunca invente promotor, oficina ou cidade, e nunca",
    "cite um número diferente da quantidade de cancelamentos daquele grupo. Todo índice tem que",
    "aparecer em exatamente 1 grupo — nenhum de fora, nenhum repetido.",
    "",
    "IMPORTANTE: nunca cite o texto de `justificativaOriginal` palavra por palavra, nem parcialmente —",
    "sempre parafraseie. Nunca infira uma ação, pedido ou intenção do promotor (ex.: \"pediu remarcação\")",
    "que não esteja dita de forma explícita e inequívoca no texto original. Algumas observações podem ser",
    "anotações internas de revisão de cadastro, não relatos de visita — se o conteúdo não parecer uma",
    "justificativa real de cancelamento, não presuma nada sobre ela além do que está escrito.",
    "",
    'Responda só com um objeto JSON: {"grupos": [{"indices": [0, 1], "justificativa": "..."}]}',
  ].join("\n");
}

function montarPromptInsightsCampo(destaques: DestaqueCampo[], visaoGeral: VisaoGeralCampanha): string {
  const itens = destaques.map((destaque, indice) => ({
    indice,
    status: destaque.status,
    cidade: destaque.cidadeOficina,
    observacao: destaque.obs,
  }));

  return [
    "Visão geral da campanha (JSON):",
    JSON.stringify(visaoGeral, null, 2),
    "",
    "Destaques de campo com observação registrada, 1 por índice (JSON):",
    JSON.stringify(itens, null, 2),
    "",
    "Identifique no máximo 4 padrões/temas notáveis entre as observações acima (ex.: oficinas que não",
    "existem mais, rotas fora da área do promotor, oficinas fora do perfil do cliente, poucas",
    "observações registradas). Pra cada tema, escolha os índices dos destaques que pertencem a ele",
    "(um destaque só pode entrar em 1 tema) e escreva um título curto + 1-2 frases descrevendo o",
    "padrão. Só cite números presentes nos dados acima (contagens dos destaques, por cidade, ou os",
    "contadores da visão geral) — nunca invente ou calcule um número novo. Não é preciso cobrir",
    "todos os destaques, só os temas mais notáveis.",
    "",
    "IMPORTANTE: nunca cite o texto de `observacao` palavra por palavra, nem parcialmente — sempre",
    "parafraseie, descrevendo só o padrão objetivo (contagens, categorias, cidades). Nunca infira uma",
    "ação, pedido ou intenção do promotor (ex.: \"pediu remarcação\") que não esteja dita de forma",
    "explícita e inequívoca no texto original — observações podem estar desatualizadas ou ser anotações",
    "internas de revisão de cadastro, não relatos de campo reais; se o conteúdo não parecer uma",
    "observação de visita genuína, não presuma nada sobre ela além do que está escrito.",
    "",
    'Responda só com um objeto JSON: {"insights": [{"titulo": "...", "indices": [0, 1], "descricao": "..."}]}',
  ].join("\n");
}

/**
 * Gera 1 frase curta de síntese por seção (RELPROM-49), via 1 única chamada
 * à OpenAI por bloco de campanha (não 6). Nunca lança — qualquer falha
 * (rede, timeout, JSON inválido) retorna `{}` (RELPROM-51); cada frase passa
 * por `validarSintese` antes de entrar no retorno (RELPROM-50).
 */
export default class PromotorReportSintese {
  static async gerarSinteses(bloco: CampanhaBlocoRelatorio): Promise<SintesesPorSecao> {
    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const resposta = await client.chat.completions.create({
        model: MODELO,
        response_format: { type: "json_object" },
        temperature: 0.3,
        messages: [{ role: "user", content: montarPrompt(bloco) }],
      });

      const conteudo = resposta.choices[0]?.message?.content;
      if (!conteudo) return {};

      const bruto = JSON.parse(conteudo) as Partial<Record<SecaoRelatorio, unknown>>;
      const validadas: SintesesPorSecao = {};

      for (const secao of SECOES) {
        const texto = bruto[secao];
        if (typeof texto !== "string" || texto.trim().length === 0) continue;
        if (!validarSintese(texto, numerosValidosDaSecao(secao, bloco))) continue;
        if (contemTextoVerbatim(texto, observacoesOriginaisDaSecao(secao, bloco))) continue;
        validadas[secao] = texto.trim();
      }

      return validadas;
    } catch (erro) {
      console.error("[promotorReportSintese] falha ao gerar sintese por ia", {
        idCampanha: bloco.idCampanha,
        erro: (erro as Error)?.message,
      });
      return {};
    }
  }

  /**
   * Resumo de cancelamentos agrupado por motivo (RELPROM-53/54), via 1
   * chamada à OpenAI que só decide o agrupamento (índices) + a justificativa
   * de cada grupo — promotor/oficina/cidade nunca vêm da IA. Nunca lança;
   * `null` em qualquer falha (chamada, parse, ou `construirResumoCancelamentos`
   * rejeitar), sinalizando pro chamador usar a tabela detalhada (RELPROM-55/57).
   */
  static async gerarResumoCancelamentos(cancelamentos: Cancelamento[]): Promise<ResumoCancelamentoGrupo[] | null> {
    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const resposta = await client.chat.completions.create({
        model: MODELO,
        response_format: { type: "json_object" },
        temperature: 0.3,
        messages: [{ role: "user", content: montarPromptResumoCancelamentos(cancelamentos) }],
      });

      const conteudo = resposta.choices[0]?.message?.content;
      if (!conteudo) return null;

      const bruto = JSON.parse(conteudo) as { grupos?: GrupoCancelamentoBruto[] };
      if (!Array.isArray(bruto.grupos)) return null;

      return construirResumoCancelamentos(cancelamentos, bruto.grupos);
    } catch (erro) {
      console.error("[promotorReportSintese] falha ao gerar resumo de cancelamentos por ia", {
        erro: (erro as Error)?.message,
      });
      return null;
    }
  }

  /**
   * Até 4 insights (título + descrição) resumindo os padrões mais notáveis
   * dos destaques do campo (RELPROM-58/60), via 1 chamada à OpenAI que só
   * escolhe quais destaques formam cada insight — nunca inventa contagem.
   * Nunca lança; `null` em qualquer falha (chamada, parse, ou
   * `construirInsightsCampo` rejeitar), sinalizando pro chamador usar a
   * listagem de cards individuais (RELPROM-61/63).
   */
  static async gerarInsightsCampo(destaques: DestaqueCampo[], visaoGeral: VisaoGeralCampanha): Promise<InsightCampo[] | null> {
    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const resposta = await client.chat.completions.create({
        model: MODELO,
        response_format: { type: "json_object" },
        temperature: 0.3,
        messages: [{ role: "user", content: montarPromptInsightsCampo(destaques, visaoGeral) }],
      });

      const conteudo = resposta.choices[0]?.message?.content;
      if (!conteudo) return null;

      const bruto = JSON.parse(conteudo) as { insights?: InsightCampoBruto[] };
      if (!Array.isArray(bruto.insights)) return null;

      return construirInsightsCampo(destaques, visaoGeral, bruto.insights);
    } catch (erro) {
      console.error("[promotorReportSintese] falha ao gerar insights de destaques do campo por ia", {
        erro: (erro as Error)?.message,
      });
      return null;
    }
  }
}
