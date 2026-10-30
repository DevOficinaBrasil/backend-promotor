import OpenAI from "openai";
import { CampanhaBlocoRelatorio, ResumoCancelamentoGrupo, SecaoRelatorio, SintesesPorSecao } from "../types/promotorRelatorio";
import { Cancelamento } from "../utils/promotorReportCalculos";
import { construirResumoCancelamentos, GrupoCancelamentoBruto, numerosValidosDaSecao, validarSintese } from "../utils/promotorReportSinteseValidacao";

const SECOES: SecaoRelatorio[] = ["visaoGeral", "assertividade", "porPromotor", "cancelamentos", "destaques", "proximosPassos"];

const MODELO = "gpt-4o-mini";

function montarPrompt(bloco: CampanhaBlocoRelatorio): string {
  // Só os dados já calculados — a IA nunca recebe a tarefa de somar/contar
  // nada, só de descrever em prosa o que já está pronto (RELPROM-49).
  const dadosPorSecao = {
    visaoGeral: bloco.visaoGeral,
    assertividade: { assertividade: bloco.assertividade, ...bloco.visaoGeral },
    porPromotor: bloco.porPromotor,
    cancelamentos: bloco.cancelamentos,
    destaques: bloco.destaquesDeCampo,
    proximosPassos: bloco.proximosPassos,
  };

  return [
    `Campanha: ${bloco.nomeCampanha}`,
    "Dados já calculados, por seção (JSON):",
    JSON.stringify(dadosPorSecao, null, 2),
    "",
    "Pra cada uma das 6 seções acima, escreva 1 frase curta (máximo ~20 palavras) em português,",
    "descrevendo em prosa o que os dados dessa seção já mostram — nunca calcule, some ou invente",
    "nenhum número que não esteja explicitamente nos dados. Se não houver nada notável numa seção,",
    "pode omitir a chave dela na resposta.",
    "",
    'Responda só com um objeto JSON: {"visaoGeral": "...", "assertividade": "...", "porPromotor": "...",',
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
    'Responda só com um objeto JSON: {"grupos": [{"indices": [0, 1], "justificativa": "..."}]}',
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
        if (validarSintese(texto, numerosValidosDaSecao(secao, bloco))) {
          validadas[secao] = texto.trim();
        }
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
}
