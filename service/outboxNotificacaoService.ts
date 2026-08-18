import { AppDataSourceSync } from "../data-source";
import NotificacaoVisita, { StatusNotificacaoVisita } from "../entities/NotificacaoVisita";
import NotificacaoVisitaService, {
  CacheCampanha,
  criarCacheCampanha,
  DesfechoDespacho,
} from "./notificacaoVisitaService";
import { TIMEOUT_ENVIO_MS } from "../channels/whatsappChannel";
import { dentroDaJanelaDeEnvio } from "../utils/agendamento";

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
const CONCORRENCIA_PADRAO = 4;

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
 * Quantas linhas do lote são despachadas ao mesmo tempo.
 *
 * O despacho era estritamente serial, então um provider lento derrubava a vazão
 * do worker inteiro: com timeout de 10s por envio, 20 linhas levavam até 200s e
 * o tique seguinte era pulado. Quatro em paralelo é conservador — o gargalo real
 * é o provider, não este processo — e continua sendo um número, não "todas",
 * porque o lote também respeita o lease (ver `tamanhoLoteSeguro`).
 */
export function concorrencia(): number {
  return inteiroDeEnv("OUTBOX_VISITA_CONCURRENCY", CONCORRENCIA_PADRAO);
}

// Custo de banco por linha despachada (releitura da linha, rota, oficina,
// usuários, campanha, escrita do desfecho). Estimativa folgada de propósito: ela
// só serve para dimensionar o lote, e errar para cima aqui é conservador.
const CUSTO_QUERIES_POR_LINHA_MS = 2_000;

// O lote usa no máximo esta fração do lease. Os 20% restantes cobrem o claim, o
// próprio atraso do cron e a variação do custo por linha.
const FRACAO_SEGURA_DO_LEASE = 0.8;

/** Pior caso de tempo de uma linha: timeout do canal mais o custo de banco. */
export function piorCasoPorLinhaMs(): number {
  return TIMEOUT_ENVIO_MS + CUSTO_QUERIES_POR_LINHA_MS;
}

/**
 * Tamanho de lote que cabe no lease.
 *
 * `tick` despacha as linhas **em série**, e cada envio pode levar até o timeout
 * do canal. Se o lote inteiro demorar mais que `OUTBOX_VISITA_LOCK_LEASE_MINUTES`,
 * o lease das linhas ainda não despachadas vence enquanto o worker trabalha,
 * outro worker as reivindica e a mesma oficina recebe duas mensagens — o
 * problema que `FOR UPDATE SKIP LOCKED` foi posto ali para impedir.
 *
 * Os três valores (lote, timeout, lease) eram independentes e nada os
 * relacionava: subir `OUTBOX_VISITA_BATCH_SIZE` de 20 para 60 era suficiente
 * para duplicar mensagem, sem nenhum sinal. Aqui o lote é capado pelo lease e o
 * corte é logado — quem configurou precisa saber que o número dele não valeu.
 *
 * Nos valores padrão (lote 20, lease 5min, timeout 10s) o teto é exatamente 20,
 * então nada muda até alguém mexer numa das pontas.
 */
export function tamanhoLoteSeguro(): number {
  const configurado = tamanhoLote();
  // Com N linhas em paralelo, o pior caso do lote é ceil(lote / N) ondas, então o
  // teto acompanha a concorrência.
  const teto = Math.max(
    1,
    Math.floor(
      (leaseMinutos() * 60_000 * FRACAO_SEGURA_DO_LEASE * concorrencia()) / piorCasoPorLinhaMs()
    )
  );

  if (configurado <= teto) {
    return configurado;
  }

  console.warn("[outboxNotificacao] lote reduzido para caber no lease", {
    OUTBOX_VISITA_BATCH_SIZE: configurado,
    OUTBOX_VISITA_LOCK_LEASE_MINUTES: leaseMinutos(),
    OUTBOX_VISITA_CONCURRENCY: concorrencia(),
    piorCasoPorLinhaMs: piorCasoPorLinhaMs(),
    loteUsado: teto,
  });

  return teto;
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

/**
 * O que o claim devolve por linha. `tentativas` e `ID_ROTA_PROMOTOR` vêm do
 * próprio `RETURNING`: antes, o processamento relia a linha só para pegar esses
 * dois campos, e `despacharNotificacao` a lia de novo em seguida.
 */
export interface LinhaReivindicada {
  id: number;
  tentativas: number;
  idRota: number | null;
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
  static async tick(sufixoWorker = "", agora: Date = new Date()): Promise<void> {
    const workerId = idDoWorker(sufixoWorker);

    // Fora do horário comercial não se despacha nada, mesmo com linha vencida na
    // fila: mensagem de madrugada é o que gera bloqueio e denúncia, e é isso que
    // derruba a qualidade do número na Meta. Nada é reivindicado, então nenhuma
    // linha queima tentativa por causa da hora.
    if (!dentroDaJanelaDeEnvio(agora)) {
      return;
    }

    let linhas: LinhaReivindicada[] = [];

    try {
      linhas = await OutboxNotificacaoService.claimBatch(tamanhoLoteSeguro(), workerId);
    } catch (erro) {
      console.error("[outboxNotificacao] falha no tick ao reivindicar lote", {
        workerId,
        erro: (erro as Error)?.message,
      });
      return;
    }

    if (linhas.length === 0) {
      return;
    }

    console.log("[outboxNotificacao] notificações reivindicadas", {
      workerId,
      quantidade: linhas.length,
      ids: linhas.map((linha) => linha.id),
    });

    // Um cache por lote: as linhas de uma mesma campanha resolviam
    // CampanhaPromotor, Campanha e Community de novo a cada despacho. É de vida
    // curta de propósito — um cache mais longo envelheceria contra o END_TIME da
    // campanha.
    const cache = criarCacheCampanha();

    // Trabalhadores puxando da mesma fila: cada um pega a próxima linha quando
    // termina a sua, então uma oficina lenta não segura as outras. Serial era o
    // que limitava a vazão a uma linha por timeout do provider.
    const fila = [...linhas];
    const trabalhador = async (): Promise<void> => {
      for (;;) {
        const linha = fila.shift();
        if (linha === undefined) {
          return;
        }

        try {
          await OutboxNotificacaoService.processarLinha(linha, cache);
        } catch (erro) {
          // O catch de dentro já cobre o despacho; este pega falha do próprio
          // registro do desfecho, que não pode interromper o resto do lote.
          console.error("[outboxNotificacao] falha ao processar notificação", {
            ID_NOTIFICACAO_VISITA: linha.id,
            erro: (erro as Error)?.message,
          });
        }
      }
    };

    const trabalhadores = Math.min(concorrencia(), fila.length);
    await Promise.all(Array.from({ length: trabalhadores }, () => trabalhador()));
  }

  /** Despacha uma linha reivindicada e grava o desfecho. */
  private static async processarLinha(
    linha: LinhaReivindicada,
    cache?: CacheCampanha
  ): Promise<void> {
    const { id, tentativas, idRota } = linha;

    let desfecho: DesfechoDespacho;
    try {
      desfecho = await NotificacaoVisitaService.despacharNotificacao(id, cache);
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
   * 2. Devolve o id, ATTEMPTS e ID_ROTA_PROMOTOR — só o que a fila usa para
   *    decidir e para logar. O alvo devolve todas as colunas e gasta ~90 linhas
   *    (`normalizeLockedRow`, `toText`) se defendendo de driver que responde
   *    array posicional; três colunas não precisam disso, e quem despacha relê a
   *    linha inteira pelo repositório de sempre.
   *
   * `AVAILABLE_AT IS NOT NULL` exclui as linhas anteriores ao outbox, que já
   * foram despachadas inline pelo fluxo antigo. Sem esse predicado, o primeiro
   * deploy do worker reenviaria todo o histórico de uma vez.
   */
  static async claimBatch(tamanho: number, workerId: string): Promise<LinhaReivindicada[]> {
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
      RETURNING n."ID_NOTIFICACAO_VISITA", n."ATTEMPTS", n."ID_ROTA_PROMOTOR"
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
      .map((linha: {
        ID_NOTIFICACAO_VISITA?: number | string;
        ATTEMPTS?: number | string;
        ID_ROTA_PROMOTOR?: number | string | null;
      }) => ({
        id: Number(linha?.ID_NOTIFICACAO_VISITA),
        // ATTEMPTS já foi incrementado pelo próprio claim, então este é o número
        // da tentativa em curso — o mesmo que a releitura devolvia.
        tentativas: Number.isFinite(Number(linha?.ATTEMPTS)) ? Number(linha?.ATTEMPTS) : 1,
        idRota:
          linha?.ID_ROTA_PROMOTOR == null || linha.ID_ROTA_PROMOTOR === ""
            ? null
            : Number(linha.ID_ROTA_PROMOTOR),
      }))
      .filter((linha: LinhaReivindicada) => Number.isInteger(linha.id));
  }
}
