import { AppDataSourceSync } from "../data-source";
import NotificacaoVisita, {
  CanalNotificacao,
  StatusNotificacaoVisita,
} from "../entities/NotificacaoVisita";
import Campanha from "../entities/Campanha";
import CampanhaPromotor from "../entities/CampanhaPromotor";
import Community from "../entities/Community";
import Oficina from "../entities/Oficina";
import RotaPromotor from "../entities/RotaPromotor";
import Usuario from "../entities/Usuario";
import { getChannel } from "../channels/channelRegistry";
import { avaliarGuardas, enderecoRecente } from "./envioGuards";
import { MigrationAwareRepository } from "../utils/migrationRepository";
import { normalizarTelefone } from "../utils/telefone";
import { gerarLinkToken } from "../utils/visitaToken";
import { proximoHorarioEnvio } from "../utils/agendamento";

// Fallback only. The link's real lifetime is the campaign's END_TIME; this is
// what a campaign without an end date (or one whose rows can't be resolved)
// falls back to, so a data gap never costs a send.
const HORAS_VALIDADE_TOKEN = 168;

export const MOTIVO_ENDERECO_RECENTE = "address recently updated";
export const MOTIVO_SEM_USUARIO = "no usuario linked to oficina";
export const MOTIVO_SEM_TELEFONE = "no recipient with phone";
export const MOTIVO_TELEFONE_INVALIDO = "invalid phone";
export const MOTIVO_OFICINA_INEXISTENTE = "oficina not found";
export const MOTIVO_CAMPANHA_ENCERRADA = "campanha already ended";
export const MOTIVO_NOTIFICACAO_INEXISTENTE = "notificacao not found";
export const MOTIVO_ROTA_INEXISTENTE = "rota not found";

/**
 * Motivos de falha do canal que uma nova tentativa pode resolver. São
 * exatamente os desfechos não determinísticos do provider: telefone inválido ou
 * canal mal configurado falham igual em toda tentativa, então repetir só gasta
 * quota e adia o registro terminal.
 */
const MOTIVOS_TRANSITORIOS = new Set(["network error", "provider error", "provider rate/quota"]);

function ehFalhaTransitoria(reason: string): boolean {
  return MOTIVOS_TRANSITORIOS.has(reason);
}

/**
 * O que o despacho conseguiu decidir sozinho. Quem despacha não decide política
 * de retentativa: devolve a classificação e o dono da fila aplica a dele.
 */
export type DesfechoDespacho =
  | { desfecho: "ENVIADO"; messageId: string | null; providerMessageId: string | null }
  | { desfecho: "DISPENSADO"; motivo: string }
  | { desfecho: "FALHOU_TERMINAL"; erro: string }
  | { desfecho: "FALHOU_TRANSITORIO"; erro: string };

/**
 * Builds the public confirmation URL carried in the WhatsApp message.
 *
 * The spec fixes the link shape but not the env var that holds the frontend
 * host, so the frontend base URL is read from VISITA_CONFIRMACAO_BASE_URL and
 * falls back to API_URL.
 */
function montarConfirmationUrl(rawToken: string): string {
  const base = (process.env.VISITA_CONFIRMACAO_BASE_URL ?? process.env.API_URL ?? "").replace(
    /\/+$/,
    ""
  );
  return `${base}/visita/confirmacao?token=${encodeURIComponent(rawToken)}`;
}

/**
 * What the campaign contributes to the notification: the end date the expiry is
 * pinned to, and the slug of the company the campaign runs for (template
 * variable 2). Both degrade to null independently.
 */
interface DadosCampanha {
  fim: Date | null;
  empresaSlug: string | null;
}

/**
 * Per-batch memo for the campaign chain and the company name.
 *
 * Every route created by one createRotas call shares a single
 * ID_CAMPANHA_PROMOTOR, so without this the same three reads (CampanhaPromotor,
 * Campanha, Community) are repeated identically for every route in the batch.
 * Deliberately caller-scoped and short-lived — a longer-lived cache would go
 * stale against the campaign's END_TIME.
 */
export interface CacheCampanha {
  dados: Map<number, DadosCampanha>;
  nomeEmpresa: Map<string, string | null>;
}

export function criarCacheCampanha(): CacheCampanha {
  return { dados: new Map(), nomeEmpresa: new Map() };
}

/**
 * Walks RotaPromotor → CampanhaPromotor → Campanha once, for both the end date
 * and the company slug.
 *
 * Every field degrades to null rather than throwing whenever a link in the
 * chain is missing; the caller reads a null `fim` as "use the 168h fallback"
 * rather than as a failure — a campaign data gap must not cost a send.
 *
 * Both entities live in CAMPANHAS_OB, the schema still mid-migration, so reads
 * go through MigrationAwareRepository like every other campaign read
 * (campanhaService, rotaService) instead of a plain repository.
 *
 * Note: Campanha.END_TIME is a plain `timestamp` while EXPIRA_EM is
 * `timestamptz`. The value is carried across as-is, so it lands as the
 * campaign's end instant in the writing session's timezone.
 */
async function resolverDadosCampanha(
  rota: RotaPromotor,
  cache?: CacheCampanha
): Promise<DadosCampanha> {
  const vazio: DadosCampanha = { fim: null, empresaSlug: null };
  const idCampanhaPromotor = rota.ID_CAMPANHA_PROMOTOR;
  if (idCampanhaPromotor == null) {
    return vazio;
  }

  const memoizado = cache?.dados.get(idCampanhaPromotor);
  if (memoizado !== undefined) {
    return memoizado;
  }

  const dados = await lerDadosCampanha(idCampanhaPromotor, vazio);
  cache?.dados.set(idCampanhaPromotor, dados);
  return dados;
}

async function lerDadosCampanha(
  idCampanhaPromotor: number,
  vazio: DadosCampanha
): Promise<DadosCampanha> {
  const campanhaPromotor = await new MigrationAwareRepository<CampanhaPromotor>(
    CampanhaPromotor,
    "ID_CAMPANHA_PROMOTOR"
  ).findOne({ where: { ID_CAMPANHA_PROMOTOR: idCampanhaPromotor } });

  const idCampanha = campanhaPromotor?.ID_CAMPANHA;
  if (idCampanha == null) {
    return vazio;
  }

  const campanha = await new MigrationAwareRepository<Campanha>(
    Campanha,
    "ID_CAMPANHA"
  ).findOne({ where: { ID_CAMPANHA: idCampanha } });

  return {
    fim: normalizarFimCampanha(campanha?.END_TIME),
    empresaSlug: campanha?.EMPRESA_SLUG ?? null,
  };
}

/**
 * TypeORM hands back a Date for a timestamp column, but a raw string can reach
 * here through the legacy merge path, so normalize before any comparison or
 * persistence. An unparseable value degrades to null (168h fallback).
 */
function normalizarFimCampanha(fim: Date | string | null | undefined): Date | null {
  if (fim == null) {
    return null;
  }
  const data = fim instanceof Date ? fim : new Date(fim);
  return Number.isNaN(data.getTime()) ? null : data;
}

/**
 * Company the campaign runs for — template variable 2.
 *
 * Resolved by slug against OFICINA_PORTAL.COMMUNITIES, not by CAMPANHA.ID_CLIENT:
 * that column holds a SQL Server id with no reachable table behind it, so it
 * could never produce a name. Same lookup visitaConfirmacaoService
 * .carregarContexto() does, and degrades the same way — an unresolvable
 * company costs a name in the message, never the send.
 */
async function resolverNomeEmpresa(
  empresaSlug: string | null,
  cache?: CacheCampanha
): Promise<string | null> {
  if (empresaSlug == null) {
    return null;
  }

  const memoizado = cache?.nomeEmpresa.get(empresaSlug);
  if (memoizado !== undefined) {
    return memoizado;
  }

  const community = await AppDataSourceSync.getRepository(Community).findOne({
    where: { EmpresaSlug: empresaSlug },
  });

  const nome = community?.Nome ?? null;
  cache?.nomeEmpresa.set(empresaSlug, nome);
  return nome;
}

/** Composes ERRO_ENVIO so the provider's code is kept alongside the reason (AC8, AC9). */
function comporErroEnvio(reason: string, providerCode: string | null): string {
  return providerCode === null ? reason : `${reason}: ${providerCode}`;
}

export default class NotificacaoVisitaService {
  /**
   * Enqueues one notification for a newly created route (AGND-01).
   *
   * Writes the PENDENTE row with AVAILABLE_AT and stops there: no recipient, no
   * token, no provider call. Everything else happens at dispatch time, hours
   * later, because the guards it depends on (endereço recente, campanha
   * encerrada, antispam) are all time-dependent — evaluating them at import
   * time answers the wrong question.
   *
   * Never throws (AGND-03). Route creation must not fail because a notification
   * could not be queued.
   */
  static async agendarVisita(
    rota: RotaPromotor,
    agora: Date = new Date()
  ): Promise<NotificacaoVisita> {
    const idRota = rota.ID_ROTA_PROMOTOR;
    const disponivelEm = proximoHorarioEnvio(agora);

    if (process.env.OUTBOX_VISITA_ENVIO_IMEDIATO === "1") {
      console.log(
        "[notificacaoVisita] OUTBOX_VISITA_ENVIO_IMEDIATO ativo: notificação nasce vencida",
        { ID_ROTA_PROMOTOR: idRota, AVAILABLE_AT: disponivelEm.toISOString() }
      );
    }

    const repo = AppDataSourceSync.getRepository(NotificacaoVisita);
    const linha = repo.create({
      ID_ROTA_PROMOTOR: idRota,
      CANAL: CanalNotificacao.WHATSAPP,
      STATUS: StatusNotificacaoVisita.PENDENTE,
      AVAILABLE_AT: disponivelEm,
      ATTEMPTS: 0,
    });

    try {
      const salva = await repo.save(linha);
      NotificacaoVisitaService.log("notificação agendada", salva);
      return salva;
    } catch (erro) {
      // Sem linha não há envio, mas a rota já existe e a resposta dela não pode
      // depender disso. Devolve a linha em memória, como o catch de
      // notificarVisita já faz.
      console.error("[notificacaoVisita] falha ao agendar notificação", {
        ID_ROTA_PROMOTOR: idRota,
        erro: (erro as Error)?.message,
      });
      return linha;
    }
  }

  /**
   * Dispatches one already-queued notification (AGND-09).
   *
   * Runs the flow against state as of *now*, not as of route creation: the
   * guards it depends on (endereço recente, campanha encerrada, antispam) are
   * all time-dependent, so a row queued yesterday can legitimately resolve to
   * DISPENSADO today.
   *
   * Returns a verdict and persists only the domain status — ENVIADO,
   * DISPENSADO, or a terminal FALHOU. It never writes ATTEMPTS, the lease, or
   * AVAILABLE_AT: whoever owns the queue decides whether a transient failure is
   * retried, and that separation is what lets the shared delivery system take
   * over scheduling later without inheriting this service's retry policy.
   *
   * Never throws. An unexpected crash resolves to FALHOU_TRANSITORIO so an
   * unknown fault is retried rather than silently retiring a notification.
   */
  static async despacharNotificacao(
    idNotificacao: number,
    cache?: CacheCampanha
  ): Promise<DesfechoDespacho> {
    const repo = AppDataSourceSync.getRepository(NotificacaoVisita);

    try {
      const notificacaoCarregada = await repo.findOne({
        where: { ID_NOTIFICACAO_VISITA: idNotificacao },
      });

      if (notificacaoCarregada === null) {
        return { desfecho: "FALHOU_TERMINAL", erro: MOTIVO_NOTIFICACAO_INEXISTENTE };
      }

      let notificacao = notificacaoCarregada;

      // A rota vem do banco, não do chamador: quem despacha é o worker, que só
      // conhece o id da linha.
      const rota = await new MigrationAwareRepository<RotaPromotor>(
        RotaPromotor,
        "ID_ROTA_PROMOTOR"
      ).findOne({ where: { ID_ROTA_PROMOTOR: notificacao.ID_ROTA_PROMOTOR } });

      if (rota == null) {
        await this.finalizar(repo, notificacao, {
          STATUS: StatusNotificacaoVisita.FALHOU,
          ERRO_ENVIO: MOTIVO_ROTA_INEXISTENTE,
        });
        return { desfecho: "FALHOU_TERMINAL", erro: MOTIVO_ROTA_INEXISTENTE };
      }

      const oficina = await AppDataSourceSync.getRepository(Oficina).findOne({
        where: { ID_OFICINA: rota.ID_OFICINA },
      });

      if (oficina === null) {
        return await this.encerrarTerminal(repo, notificacao, MOTIVO_OFICINA_INEXISTENTE);
      }

      // Guard 1 (AC26): a workshop updated recently is not asked to re-confirm.
      if (enderecoRecente(oficina)) {
        return await this.encerrarDispensado(repo, notificacao, MOTIVO_ENDERECO_RECENTE);
      }

      // Guard 3: the link cannot outlive its campaign, so a campaign that has
      // already ended has nothing to confirm — the message would arrive with a
      // dead link. Runs before the recipient is resolved so a dead campaign
      // never touches the per-recipient anti-spam state.
      const { fim: fimCampanha, empresaSlug } = await resolverDadosCampanha(rota, cache);

      if (fimCampanha !== null && fimCampanha.getTime() <= Date.now()) {
        return await this.encerrarDispensado(repo, notificacao, MOTIVO_CAMPANHA_ENCERRADA);
      }

      // AC2: most recently touched Usuario first, nulls last, lowest ID as tiebreak.
      // Only the four columns this flow reads are selected: USUARIO is a ~35
      // column table in a read-only schema and every row of the workshop is
      // loaded here, so there is no reason to pull SENHA and the rest across.
      const usuarios = await AppDataSourceSync.getRepository(Usuario).find({
        where: { ID_OFICINA: rota.ID_OFICINA },
        select: {
          ID_USUARIO: true,
          NOME: true,
          CELULAR: true,
          DATA_ALTERACAO: true,
        },
        order: {
          DATA_ALTERACAO: { direction: "DESC", nulls: "LAST" },
          ID_USUARIO: "ASC",
        },
      });

      if (usuarios.length === 0) {
        return await this.encerrarTerminal(repo, notificacao, MOTIVO_SEM_USUARIO);
      }

      const destinatario = usuarios.find((usuario) => (usuario.CELULAR ?? "").trim() !== "");

      // AC3
      if (destinatario === undefined) {
        return await this.encerrarTerminal(repo, notificacao, MOTIVO_SEM_TELEFONE);
      }

      // Guard 2 (AC27-AC29): per-recipient anti-spam.
      const guarda = await avaliarGuardas(destinatario.ID_USUARIO!);
      if (guarda.bloqueado) {
        return await this.encerrarDispensado(repo, notificacao, guarda.motivo!, {
          ID_USUARIO: destinatario.ID_USUARIO,
        });
      }

      // AC4: fail closed on a number that does not normalize.
      const telefone = normalizarTelefone(destinatario.CELULAR);
      if (telefone === null) {
        return await this.encerrarTerminal(repo, notificacao, MOTIVO_TELEFONE_INVALIDO, {
          ID_USUARIO: destinatario.ID_USUARIO,
        });
      }

      // AC5: the token is issued BEFORE dispatch — the message needs its URL —
      // and stays valid whether or not the dispatch succeeds (AC11). Issued at
      // send time, not at enqueue: EXPIRA_EM must not burn part of its window
      // sitting in the queue.
      const { raw, hash } = gerarLinkToken();
      // The link expires with the campaign it belongs to; the 168h window is
      // only what a campaign without an END_TIME falls back to. Guard 3 above
      // already ruled out a fimCampanha in the past, so this is always future.
      const expiraEm =
        fimCampanha ?? new Date(Date.now() + HORAS_VALIDADE_TOKEN * 60 * 60 * 1000);
      const confirmationUrl = montarConfirmationUrl(raw);

      notificacao = await this.finalizar(repo, notificacao, {
        ID_USUARIO: destinatario.ID_USUARIO,
        TELEFONE_NORMALIZADO: telefone,
        TOKEN_HASH: hash,
        EXPIRA_EM: expiraEm,
      });
      NotificacaoVisitaService.log("link token emitido", notificacao);

      NotificacaoVisitaService.log("tentando despachar notificação", notificacao);
      // Template atualizacao_dados_visita_oficina, in order: {{1}} recipient's
      // name, {{2}} company the campaign runs for, {{3}} confirmation link.
      // Order is the template contract — changing it silently reshuffles the
      // message body.
      const resultado = await getChannel(CanalNotificacao.WHATSAPP).send({
        toPhone: telefone,
        variables: [
          destinatario.NOME ?? "",
          (await resolverNomeEmpresa(empresaSlug, cache)) ?? "",
          confirmationUrl,
        ],
      });

      if (resultado.success) {
        // AC7
        const enviada = await this.finalizar(repo, notificacao, {
          STATUS: StatusNotificacaoVisita.ENVIADO,
          ENVIADO_EM: new Date(),
          MESSAGE_ID: resultado.messageId,
          PROVIDER_MESSAGE_ID: resultado.providerMessageId,
        });
        NotificacaoVisitaService.log("notificação enviada", enviada);
        return {
          desfecho: "ENVIADO",
          messageId: resultado.messageId,
          providerMessageId: resultado.providerMessageId,
        };
      }

      const erro = comporErroEnvio(resultado.reason, resultado.providerCode);

      // AC8, AC9: a config or per-recipient problem fails identically on every
      // attempt, so it retires now. Only the provider's non-deterministic
      // failures go back to the queue.
      if (!ehFalhaTransitoria(resultado.reason)) {
        const falhou = await this.finalizar(repo, notificacao, {
          STATUS: StatusNotificacaoVisita.FALHOU,
          ERRO_ENVIO: erro,
        });
        NotificacaoVisitaService.log("falha terminal no envio da notificação", falhou);
        return { desfecho: "FALHOU_TERMINAL", erro };
      }

      // Transitório: só registra o motivo. STATUS segue PENDENTE, e o dono da
      // fila decide entre nova tentativa e aposentadoria no teto.
      const pendente = await this.finalizar(repo, notificacao, { ERRO_ENVIO: erro });
      NotificacaoVisitaService.log("falha transitória no envio da notificação", pendente);
      return { desfecho: "FALHOU_TRANSITORIO", erro };
    } catch (erro) {
      console.error("[notificacaoVisita] erro inesperado no despacho", {
        ID_NOTIFICACAO_VISITA: idNotificacao,
        erro: (erro as Error)?.message,
      });
      return {
        desfecho: "FALHOU_TRANSITORIO",
        erro: `unexpected error: ${(erro as Error)?.message}`,
      };
    }
  }

  /**
   * Full send flow for one created route: queue the row, then dispatch it
   * immediately.
   *
   * NÃO usar em caminho de produção de criação de rota (AGND-21): despacha
   * inline, que é exatamente o comportamento que o outbox removeu. Existe para
   * os testes e para o console manual, onde "agenda e envia agora" é o que se
   * quer. `RotaService` chama `agendarVisita`.
   */
  static async notificarVisita(
    rota: RotaPromotor,
    cache?: CacheCampanha
  ): Promise<NotificacaoVisita> {
    const agendada = await this.agendarVisita(rota);
    const id = agendada.ID_NOTIFICACAO_VISITA;

    if (id === undefined) {
      return agendada;
    }

    await this.despacharNotificacao(id, cache);

    const repo = AppDataSourceSync.getRepository(NotificacaoVisita);
    const atual = await repo.findOne({ where: { ID_NOTIFICACAO_VISITA: id } });
    return atual ?? agendada;
  }

  /** Terminal FALHOU: persists the reason and reports it, no retry. */
  private static async encerrarTerminal(
    repo: ReturnType<typeof AppDataSourceSync.getRepository<NotificacaoVisita>>,
    notificacao: NotificacaoVisita,
    erro: string,
    extra: Partial<NotificacaoVisita> = {}
  ): Promise<DesfechoDespacho> {
    await this.finalizar(repo, notificacao, {
      ...extra,
      STATUS: StatusNotificacaoVisita.FALHOU,
      ERRO_ENVIO: erro,
    });
    return { desfecho: "FALHOU_TERMINAL", erro };
  }

  /** DISPENSADO: deliberate suppression, never a failure. */
  private static async encerrarDispensado(
    repo: ReturnType<typeof AppDataSourceSync.getRepository<NotificacaoVisita>>,
    notificacao: NotificacaoVisita,
    motivo: string,
    extra: Partial<NotificacaoVisita> = {}
  ): Promise<DesfechoDespacho> {
    await this.finalizar(repo, notificacao, {
      ...extra,
      STATUS: StatusNotificacaoVisita.DISPENSADO,
      ERRO_ENVIO: motivo,
    });
    return { desfecho: "DISPENSADO", motivo };
  }

  private static async finalizar(
    repo: ReturnType<typeof AppDataSourceSync.getRepository<NotificacaoVisita>>,
    notificacao: NotificacaoVisita,
    patch: Partial<NotificacaoVisita>
  ): Promise<NotificacaoVisita> {
    Object.assign(notificacao, patch);
    return await repo.save(notificacao);
  }

  /** AC24: every lifecycle event carries both IDs for traceability. */
  private static log(mensagem: string, notificacao: NotificacaoVisita): void {
    console.log(`[notificacaoVisita] ${mensagem}`, {
      ID_ROTA_PROMOTOR: notificacao.ID_ROTA_PROMOTOR,
      ID_NOTIFICACAO_VISITA: notificacao.ID_NOTIFICACAO_VISITA,
    });
  }
}
