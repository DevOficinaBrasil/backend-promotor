import cron from "node-cron";
import OutboxNotificacaoService, { idDoWorker } from "../service/outboxNotificacaoService";

/**
 * Fonte de tique da fila de notificações de visita.
 *
 * Usa `node-cron`, igual ao `OutboxPublisher` do backend-communities. Cron aqui
 * é seguro justamente porque não decide nada além de *quando olhar*: quem decide
 * o que cada worker leva é o `FOR UPDATE SKIP LOCKED` do claim. É por isso que
 * copiar o servidor deixou de ser problema — antes, cada cópia disparava pelo
 * próprio relógio e mandava a mesma mensagem duas vezes.
 */

const TAG = "[outboxNotificacaoCron]";
const EXPRESSAO_PADRAO = "*/1 * * * *";

export function outboxHabilitado(): boolean {
  return process.env.OUTBOX_VISITA_ENABLED === "1";
}

/**
 * Registra o cron, se for para registrar.
 *
 * Duas travas, na ordem em que importam:
 *
 * 1. `NODE_ENV=test` nunca roda worker, em nenhuma configuração — espelha a
 *    trava incondicional do `whatsappChannel`, para que uma suíte não dispare
 *    envio de verdade.
 * 2. `OUTBOX_VISITA_ENABLED` precisa ser exatamente `"1"`, convenção herdada do
 *    outbox do backend-communities. Vale notar que as outras flags deste repo
 *    usam `"true"` (`whatsappChannel.ts:111`), então o log de startup imprime o
 *    valor lido: worker morto em silêncio por causa de `=true` é exatamente o
 *    tipo de erro que não se descobre olhando o processo.
 */
export function registrarOutboxCron(): void {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  const habilitado = outboxHabilitado();
  const expressao = process.env.OUTBOX_VISITA_CRON_EXPRESSION || EXPRESSAO_PADRAO;

  console.log(`${TAG} configuração da fila`, {
    habilitado,
    OUTBOX_VISITA_ENABLED: process.env.OUTBOX_VISITA_ENABLED ?? "(não definido)",
    expressao,
    workerId: idDoWorker(),
  });

  if (!habilitado) {
    console.log(`${TAG} worker não registrado — OUTBOX_VISITA_ENABLED precisa ser exatamente "1"`);
    return;
  }

  // Um tique por vez: um lote lento não pode empilhar ticks em cima de si mesmo.
  // O estado é da closure e não do módulo, para não vazar entre registros.
  let emExecucao = false;

  cron.schedule(expressao, async () => {
    if (emExecucao) {
      console.log(`${TAG} tique anterior ainda rodando, pulando este`);
      return;
    }

    emExecucao = true;
    try {
      await OutboxNotificacaoService.tick();
    } finally {
      emExecucao = false;
    }
  });

  console.log(`${TAG} worker registrado`, { expressao, workerId: idDoWorker() });
}
