import { CampanhaBlocoRelatorio, SecaoRelatorio } from "../types/promotorRelatorio";

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
