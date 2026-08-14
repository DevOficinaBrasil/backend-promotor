import { AppDataSourceSync } from "../data-source";
import NotificacaoVisita, { StatusNotificacaoVisita } from "../entities/NotificacaoVisita";
import NotificacaoVisitaService, { DesfechoDespacho } from "./notificacaoVisitaService";

/**
 * Fila de envio das notificações de visita.
 *
 * Espelha `backend-communities/service/outbox/OutboxService`, que roda o mesmo
 * padrão em produção contra `CRM.integration_outbox`. A semântica é a mesma
 * coluna a coluna, então a migração futura ao sistema de entrega compartilhado
 * é um mapeamento, não uma reescrita.
 *
 * A razão de existir é o servidor deste projeto às vezes ser **copiado**: cada
 * cópia rodaria seu próprio cron pelo próprio relógio e mandaria a mesma
 * mensagem duas vezes para a mesma oficina. Aqui nenhuma máquina decide nada —
 * `AVAILABLE_AT <= now()` do banco decide o que está vencido, e
 * `FOR UPDATE SKIP LOCKED` decide de quem é cada linha.
 */

const TAMANHO_LOTE_PADRAO = 20;
const LEASE_MINUTOS_PADRAO = 5;
const MAX_TENTATIVAS_PADRAO = 3;

function inteiroDeEnv(chave: string, padrao: number): number {
  const bruto = process.env[chave];
  if (bruto === undefined || bruto.trim() === "") {
    return padrao;
  }
  const valor = Number(bruto);
  return Number.isInteger(valor) && valor > 0 ? valor : padrao;
}

export function tamanhoLote(): number {
  return inteiroDeEnv("OUTBOX_VISITA_BATCH_SIZE", TAMANHO_LOTE_PADRAO);
}

export function leaseMinutos(): number {
  return inteiroDeEnv("OUTBOX_VISITA_LOCK_LEASE_MINUTES", LEASE_MINUTOS_PADRAO);
}

export function maxTentativas(): number {
  return inteiroDeEnv("OUTBOX_VISITA_MAX_ATTEMPTS", MAX_TENTATIVAS_PADRAO);
}

/**
 * Escada de backoff, copiada verbatim de `OutboxService.computeBackoffMs` do
 * backend-communities. Copiada, e não redesenhada, para que os dois serviços
 * envelheçam igual: 0 → 15s → 60s → 5min → 15min.
 */
export function computeBackoffMs(tentativa: number): number {
  if (tentativa <= 1) return 0;
  if (tentativa === 2) return 15_000;
  if (tentativa === 3) return 60_000;
  if (tentativa === 4) return 5 * 60_000;

  return 15 * 60_000;
}

/**
 * Mesma semântica do alvo: aposenta a linha se a falha não é transitória, ou se
 * já bateu no teto de tentativas.
 */
export function shouldMarkFailed(tentativas: number, transitorio: boolean): boolean {
  return !transitorio || tentativas >= maxTentativas();
}

/** O que a fila faz com uma linha, dado o veredito do despacho. */
export type AcaoFila =
  | { acao: "ENVIADO"; messageId: string | null; providerMessageId: string | null }
  | { acao: "CONCLUIDO" }
  | { acao: "RETENTAR"; erro: string; backoffMs: number }
  | { acao: "FALHOU"; erro: string };

/**
 * Traduz o veredito do despacho na ação da fila.
 *
 * A fila lê o veredito e nunca os motivos do canal: classificar é decisão de
 * quem despacha, retentar é decisão de quem enfileira. É essa fronteira que
 * permite o sistema de entrega compartilhado assumir o agendamento depois sem
 * herdar a política daqui.
 *
 * `DISPENSADO` e `FALHOU_TERMINAL` já foram persistidos pelo despacho, então
 * para a fila os dois são só "acabou, solta o lease".
 */
export function acaoDaFila(desfecho: DesfechoDespacho, tentativas: number): AcaoFila {
  if (desfecho.desfecho === "ENVIADO") {
    return {
      acao: "ENVIADO",
      messageId: desfecho.messageId,
      providerMessageId: desfecho.providerMessageId,
    };
  }

  if (desfecho.desfecho === "DISPENSADO" || desfecho.desfecho === "FALHOU_TERMINAL") {
    return { acao: "CONCLUIDO" };
  }

  if (shouldMarkFailed(tentativas, true)) {
    return { acao: "FALHOU", erro: desfecho.erro };
  }

  return { acao: "RETENTAR", erro: desfecho.erro, backoffMs: computeBackoffMs(tentativas) };
}

/** Identifica qual cópia do servidor está com a linha na mão. */
export function idDoWorker(sufixo = ""): string {
  return `outbox-visita${sufixo}-${process.pid}`;
}

export default class OutboxNotificacaoService {
  private static repo() {
    return AppDataSourceSync.getRepository(NotificacaoVisita);
  }

  /**
   * Um ciclo da fila: reivindica o que venceu, despacha cada linha e grava o
   * desfecho.
   *
   * Nunca lança (AGND-12). Roda dentro do processo da API, então uma falha de
   * banco no meio da madrugada não pode derrubar quem atende request. Cada linha
   * tem seu próprio try/catch: uma oficina com dado ruim não custa o lote
   * inteiro.
   *
   * Uma exceção no despacho vira nova tentativa, não fim de linha — o teto de
   * ATTEMPTS é que aposenta a linha, e ele já foi incrementado no claim, então
   * nem uma linha que derruba o worker toda vez repete para sempre.
   */
  static async tick(sufixoWorker = ""): Promise<void> {
    const workerId = idDoWorker(sufixoWorker);
    let ids: number[] = [];

    try {
      ids = await OutboxNotificacaoService.claimBatch(tamanhoLote(), workerId);
    } catch (erro) {
      console.error("[outboxNotificacao] falha no tick ao reivindicar lote", {
        workerId,
        erro: (erro as Error)?.message,
      });
      return;
    }

    if (ids.length === 0) {
      return;
    }

    console.log("[outboxNotificacao] notificações reivindicadas", {
      workerId,
      quantidade: ids.length,
      ids,
    });

    for (const id of ids) {
      try {
        await OutboxNotificacaoService.processarLinha(id);
      } catch (erro) {
        // O catch de dentro já cobre o despacho; este pega falha do próprio
        // registro do desfecho, que não pode interromper o resto do lote.
        console.error("[outboxNotificacao] falha ao processar notificação", {
          ID_NOTIFICACAO_VISITA: id,
          erro: (erro as Error)?.message,
        });
      }
    }
  }

  /** Despacha uma linha reivindicada e grava o desfecho. */
  private static async processarLinha(id: number): Promise<void> {
    const linha = await this.repo().findOne({ where: { ID_NOTIFICACAO_VISITA: id } });
    const tentativas = linha?.ATTEMPTS ?? 1;
    const idRota = linha?.ID_ROTA_PROMOTOR ?? null;

    let desfecho: DesfechoDespacho;
    try {
      desfecho = await NotificacaoVisitaService.despacharNotificacao(id);
    } catch (erro) {
      // despacharNotificacao já promete não lançar; se lançar mesmo assim, a
      // falha é desconhecida e portanto transitória — aposentar em silêncio
      // seria perder uma notificação por um bug nosso.
      desfecho = {
        desfecho: "FALHOU_TRANSITORIO",
        erro: `dispatch throw: ${(erro as Error)?.message}`,
      };
    }

    const acao = acaoDaFila(desfecho, tentativas);

    switch (acao.acao) {
      case "ENVIADO":
        await OutboxNotificacaoService.marcarEnviado(id, acao.messageId, acao.providerMessageId);
        break;
      case "CONCLUIDO":
        await OutboxNotificacaoService.liberarLease(id);
        break;
      case "RETENTAR":
        await OutboxNotificacaoService.marcarRetentativa(id, acao.erro, acao.backoffMs);
        break;
      case "FALHOU":
        await OutboxNotificacaoService.marcarFalhou(id, acao.erro);
        break;
    }

    console.log("[outboxNotificacao] desfecho da notificação", {
      ID_NOTIFICACAO_VISITA: id,
      ID_ROTA_PROMOTOR: idRota,
      tentativas,
      acao: acao.acao,
    });
  }

  /**
   * Envio concluído: grava os identificadores do provider e solta o lease.
   */
  static async marcarEnviado(
    id: number,
    messageId: string | null,
    providerMessageId: string | null
  ): Promise<void> {
    await this.repo().update(
      { ID_NOTIFICACAO_VISITA: id },
      {
        STATUS: StatusNotificacaoVisita.ENVIADO,
        ENVIADO_EM: new Date(),
        MESSAGE_ID: messageId,
        PROVIDER_MESSAGE_ID: providerMessageId,
        LOCKED_AT: null,
        LOCKED_BY: null,
      }
    );
  }

  /**
   * Linha resolvida pelo despacho (DISPENSADO ou FALHOU terminal): o STATUS já
   * está gravado, então aqui só se solta o lease. Escrever o STATUS de novo
   * apagaria o motivo que o despacho registrou.
   */
  static async liberarLease(id: number): Promise<void> {
    await this.repo().update(
      { ID_NOTIFICACAO_VISITA: id },
      { LOCKED_AT: null, LOCKED_BY: null }
    );
  }

  /**
   * Nova tentativa: mantém PENDENTE, registra o motivo e empurra AVAILABLE_AT
   * pela escada de backoff. Soltar o lease é o que devolve a linha para a fila.
   *
   * Não toca em ATTEMPTS de propósito. O alvo faz isso em
   * `OutboxPublisher.ts:116`, onde o handler de falha de lote reescreve
   * `attempts` para 1: a contagem real se perde e uma linha que derruba o lote
   * repete para sempre em vez de se aposentar no teto.
   */
  static async marcarRetentativa(id: number, erro: string, backoffMs: number): Promise<void> {
    await this.repo().update(
      { ID_NOTIFICACAO_VISITA: id },
      {
        STATUS: StatusNotificacaoVisita.PENDENTE,
        ERRO_ENVIO: erro,
        AVAILABLE_AT: new Date(Date.now() + backoffMs),
        LOCKED_AT: null,
        LOCKED_BY: null,
      }
    );
  }

  /** Teto de tentativas atingido: aposenta a linha e solta o lease. */
  static async marcarFalhou(id: number, erro: string): Promise<void> {
    await this.repo().update(
      { ID_NOTIFICACAO_VISITA: id },
      {
        STATUS: StatusNotificacaoVisita.FALHOU,
        ERRO_ENVIO: erro,
        LOCKED_AT: null,
        LOCKED_BY: null,
      }
    );
  }

  /**
   * Reivindica até `tamanho` notificações vencidas, marcando cada uma como sua.
   *
   * Mesma forma do `lockBatchForPublish` do alvo: CTE `picked` com
   * `FOR UPDATE SKIP LOCKED`, depois `UPDATE ... FROM picked`. `SKIP LOCKED` é
   * o que torna a cópia de servidor inofensiva — linha já travada por outro
   * worker é pulada, não esperada, então dois workers simultâneos recebem
   * conjuntos disjuntos e nenhum bloqueia o outro.
   *
   * Duas divergências deliberadas em relação ao alvo:
   *
   * 1. `ATTEMPTS` é incrementado **aqui**, no claim, e não ao fim do despacho.
   *    Processo morto no meio ainda queima tentativa, então uma linha que
   *    derruba o worker se aposenta no teto em vez de repetir para sempre.
   * 2. Devolve só o id. O alvo devolve todas as colunas e gasta ~90 linhas
   *    (`normalizeLockedRow`, `toText`) se defendendo de driver que responde
   *    array posicional; uma coluna inteira não precisa disso, e quem despacha
   *    relê a linha pelo repositório de sempre.
   *
   * `AVAILABLE_AT IS NOT NULL` exclui as linhas anteriores ao outbox, que já
   * foram despachadas inline pelo fluxo antigo. Sem esse predicado, o primeiro
   * deploy do worker reenviaria todo o histórico de uma vez.
   */
  static async claimBatch(tamanho: number, workerId: string): Promise<number[]> {
    if (tamanho <= 0) {
      return [];
    }

    const linhas = await AppDataSourceSync.query(
      `
      WITH picked AS (
        SELECT "ID_NOTIFICACAO_VISITA"
          FROM "CAMPANHAS_OB"."NOTIFICACAO_VISITA"
         WHERE "STATUS" = 'PENDENTE'
           AND "AVAILABLE_AT" IS NOT NULL
           AND "AVAILABLE_AT" <= now()
           AND ("LOCKED_AT" IS NULL OR "LOCKED_AT" < now() - ($2 || ' minutes')::interval)
         ORDER BY "AVAILABLE_AT" ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
      )
      UPDATE "CAMPANHAS_OB"."NOTIFICACAO_VISITA" n
         SET "LOCKED_AT" = now(),
             "LOCKED_BY" = $3,
             "ATTEMPTS" = n."ATTEMPTS" + 1,
             "UPDATED_AT" = now()
        FROM picked
       WHERE n."ID_NOTIFICACAO_VISITA" = picked."ID_NOTIFICACAO_VISITA"
      RETURNING n."ID_NOTIFICACAO_VISITA"
      `,
      [tamanho, leaseMinutos(), workerId]
    );

    // UPDATE ... RETURNING pode voltar como [linhas, contagem] dependendo do
    // driver; o alvo trata o mesmo caso.
    const registros = Array.isArray(linhas) && Array.isArray(linhas[0]) ? linhas[0] : linhas;

    if (!Array.isArray(registros)) {
      return [];
    }

    return registros
      .map((linha: { ID_NOTIFICACAO_VISITA?: number | string }) =>
        Number(linha?.ID_NOTIFICACAO_VISITA)
      )
      .filter((id: number) => Number.isInteger(id));
  }
}
