import OpenAI from "openai";
import { CampanhaBlocoRelatorio, SecaoRelatorio, SintesesPorSecao } from "../types/promotorRelatorio";
import { numerosValidosDaSecao, validarSintese } from "../utils/promotorReportSinteseValidacao";

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
}
