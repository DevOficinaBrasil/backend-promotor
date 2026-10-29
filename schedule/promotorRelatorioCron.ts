import cron from "node-cron";
import PromotorReportService from "../service/promotorReportService";
import { calcularPeriodoSemanal } from "../utils/promotorReportCalculos";

/**
 * Disparo semanal do relatório de promotores (CON26-325, RELPROM-14).
 * Mesmo padrão de `schedule/outboxNotificacaoCron.ts`: node-cron, trava dupla
 * (NODE_ENV=test sempre aborta; flag precisa ser exatamente "1"), lock de
 * sobreposição por closure.
 */

const TAG = "[promotorRelatorioCron]";
const FUSO = "America/Sao_Paulo";
/** Toda sexta-feira às 07:00, horário de Brasília — antes do expediente. */
const EXPRESSAO_PADRAO = "0 7 * * 5";

export function promotorRelatorioHabilitado(): boolean {
  return process.env.PROMOTOR_RELATORIO_ENABLED === "1";
}

export function registrarPromotorRelatorioCron(): void {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  const habilitado = promotorRelatorioHabilitado();
  const expressao = process.env.PROMOTOR_RELATORIO_CRON_EXPRESSION || EXPRESSAO_PADRAO;

  console.log(`${TAG} configuração`, {
    habilitado,
    PROMOTOR_RELATORIO_ENABLED: process.env.PROMOTOR_RELATORIO_ENABLED ?? "(não definido)",
    expressao,
  });

  if (!habilitado) {
    console.log(`${TAG} worker não registrado — PROMOTOR_RELATORIO_ENABLED precisa ser exatamente "1"`);
    return;
  }

  // Um tique por vez: uma execução lenta não pode empilhar em cima de si mesma.
  let emExecucao = false;

  cron.schedule(
    expressao,
    async () => {
      if (emExecucao) {
        console.log(`${TAG} execução anterior ainda rodando, pulando esta`);
        return;
      }

      emExecucao = true;
      try {
        const periodo = calcularPeriodoSemanal(new Date());
        await PromotorReportService.processarClientesElegiveis(periodo);
      } finally {
        emExecucao = false;
      }
    },
    { timezone: FUSO }
  );

  console.log(`${TAG} worker registrado`, { expressao, fuso: FUSO });
}
