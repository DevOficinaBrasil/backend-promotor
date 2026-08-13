import { AppDataSourceSync } from "../data-source";

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

/** Identifica qual cópia do servidor está com a linha na mão. */
export function idDoWorker(sufixo = ""): string {
  return `outbox-visita${sufixo}-${process.pid}`;
}

export default class OutboxNotificacaoService {
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
