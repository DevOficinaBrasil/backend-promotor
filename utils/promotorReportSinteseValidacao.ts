import { CampanhaBlocoRelatorio, ResumoCancelamentoGrupo, SecaoRelatorio } from "../types/promotorRelatorio";
import { Cancelamento } from "./promotorReportCalculos";

/**
 * Guardrail anti-alucinação da síntese gerada por IA (RELPROM-50). Puro, sem
 * dependência de rede — testável sem mockar a OpenAI.
 */

/** Todo número (inteiro, decimal ou percentual — "77%" vira 77) presente no texto. */
export function extrairNumeros(texto: string): number[] {
  const encontrados = texto.match(/\d+(\.\d+)?/g);
  return encontrados ? encontrados.map(Number) : [];
}

/**
 * Uma frase é válida se não citar nenhum número, ou se todo número citado
 * estiver no conjunto de números já calculados daquela seção — nunca o
 * contrário (RELPROM-50: 1 número fora descarta a frase inteira).
 */
export function validarSintese(texto: string, numerosValidos: number[]): boolean {
  const numerosDaFrase = extrairNumeros(texto);
  if (numerosDaFrase.length === 0) return true;
  return numerosDaFrase.every((numero) => numerosValidos.includes(numero));
}

/** Monta o conjunto de números "permitidos" numa frase de síntese pra cada seção. */
export function numerosValidosDaSecao(secao: SecaoRelatorio, bloco: CampanhaBlocoRelatorio): number[] {
  switch (secao) {
    case "visaoGeral":
      return [bloco.visaoGeral.concluidas, bloco.visaoGeral.canceladas, bloco.visaoGeral.abertasNaRota];

    case "assertividade": {
      const { concluidas, canceladas } = bloco.visaoGeral;
      const numeros = [concluidas, canceladas, concluidas + canceladas];
      if (typeof bloco.assertividade === "number") numeros.push(bloco.assertividade);
      return numeros;
    }

    case "porPromotor": {
      const numeros: number[] = [];
      let totalConcluidasPeriodo = 0;
      let totalCanceladasPeriodo = 0;
      let totalConcluidasAcumulado = 0;
      let totalAbertasNaRota = 0;
      for (const linha of bloco.porPromotor) {
        numeros.push(linha.concluidasPeriodo, linha.canceladasPeriodo, linha.concluidasAcumulado, linha.abertasNaRota);
        totalConcluidasPeriodo += linha.concluidasPeriodo;
        totalCanceladasPeriodo += linha.canceladasPeriodo;
        totalConcluidasAcumulado += linha.concluidasAcumulado;
        totalAbertasNaRota += linha.abertasNaRota;
      }
      numeros.push(totalConcluidasPeriodo, totalCanceladasPeriodo, totalConcluidasAcumulado, totalAbertasNaRota);
      return numeros;
    }

    case "cancelamentos":
      return [bloco.cancelamentos.length];

    case "destaques": {
      const concluidas = bloco.destaquesDeCampo.filter((destaque) => destaque.status === "concluida").length;
      const canceladas = bloco.destaquesDeCampo.filter((destaque) => destaque.status === "cancelada").length;
      return [concluidas, canceladas, bloco.destaquesDeCampo.length];
    }

    case "proximosPassos":
      return [
        bloco.proximosPassos.abertasNaRota,
        bloco.proximosPassos.canceladasARedistribuir,
        bloco.proximosPassos.promotoresSemRegistro,
      ];

    default:
      return [];
  }
}

/** Shape cru devolvido pela IA — só agrupamento (índices) + justificativa, nunca promotor/oficina/cidade (RELPROM-54). */
export interface GrupoCancelamentoBruto {
  indices: number[];
  justificativa: string;
}

/**
 * Valida o agrupamento bruto da IA e monta as linhas prontas pra desenhar
 * (RELPROM-54 a 56). `null` quando os índices não cobrirem cada cancelamento
 * exatamente 1 vez, ou quando a justificativa de algum grupo citar um número
 * que não bate com o tamanho daquele grupo — nessas falhas, o chamador deve
 * cair pra tabela detalhada (RELPROM-55).
 */
export function construirResumoCancelamentos(
  cancelamentos: Cancelamento[],
  gruposBrutos: GrupoCancelamentoBruto[]
): ResumoCancelamentoGrupo[] | null {
  if (gruposBrutos.length === 0) return null;

  const cobertura = new Array(cancelamentos.length).fill(false);
  for (const grupo of gruposBrutos) {
    for (const indice of grupo.indices) {
      if (indice < 0 || indice >= cancelamentos.length || cobertura[indice]) return null;
      cobertura[indice] = true;
    }
  }
  if (cobertura.some((coberto) => !coberto)) return null;

  const resultado: ResumoCancelamentoGrupo[] = [];
  for (const grupo of gruposBrutos) {
    if (!validarSintese(grupo.justificativa, [grupo.indices.length])) return null;

    const itens = grupo.indices.map((indice) => cancelamentos[indice]);
    const promotores = new Set(itens.map((item) => item.nomePromotor));
    const cidades = new Set(itens.map((item) => item.cidadeOficina));

    resultado.push({
      promotor: promotores.size === 1 ? itens[0].nomePromotor : "Vários",
      oficinas: itens.map((item) => item.nomeOficina),
      cidade: cidades.size === 1 ? itens[0].cidadeOficina : "Várias",
      justificativa: grupo.justificativa,
    });
  }

  return resultado;
}
