import { AppDataSourceSync } from "../data-source";
import NotificacaoVisita, {
  CanalNotificacao,
  StatusNotificacaoVisita,
} from "../entities/NotificacaoVisita";
import Oficina from "../entities/Oficina";
import RotaPromotor from "../entities/RotaPromotor";
import Usuario from "../entities/Usuario";
import { getChannel } from "../channels/channelRegistry";
import { avaliarGuardas, enderecoRecente } from "./envioGuards";
import { normalizarTelefone } from "../utils/telefone";
import { gerarLinkToken } from "../utils/visitaToken";

const HORAS_VALIDADE_TOKEN = 168;

export const MOTIVO_ENDERECO_RECENTE = "address recently updated";
export const MOTIVO_SEM_USUARIO = "no usuario linked to oficina";
export const MOTIVO_SEM_TELEFONE = "no recipient with phone";
export const MOTIVO_TELEFONE_INVALIDO = "invalid phone";
export const MOTIVO_OFICINA_INEXISTENTE = "oficina not found";

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

/** Composes ERRO_ENVIO so the provider's code is kept alongside the reason (AC8, AC9). */
function comporErroEnvio(reason: string, providerCode: string | null): string {
  return providerCode === null ? reason : `${reason}: ${providerCode}`;
}

export default class NotificacaoVisitaService {
  /**
   * Full send flow for one created route: create the row, run the pre-send
   * guards, resolve a recipient, issue the link token and dispatch.
   *
   * Never throws. Every failure path resolves to a persisted row so the caller
   * (RotaService) cannot be broken by a notification problem, even without its
   * own try/catch (spec AC10).
   */
  static async notificarVisita(rota: RotaPromotor): Promise<NotificacaoVisita> {
    const repo = AppDataSourceSync.getRepository(NotificacaoVisita);
    const idRota = rota.ID_ROTA_PROMOTOR;
    let notificacao: NotificacaoVisita | null = null;

    try {
      // AC1: exactly one row per route, created in PENDENTE before anything else.
      notificacao = await repo.save(
        repo.create({
          ID_ROTA_PROMOTOR: idRota,
          CANAL: CanalNotificacao.WHATSAPP,
          STATUS: StatusNotificacaoVisita.PENDENTE,
        })
      );
      NotificacaoVisitaService.log("notificação criada em PENDENTE", notificacao);

      const oficina = await AppDataSourceSync.getRepository(Oficina).findOne({
        where: { ID_OFICINA: rota.ID_OFICINA },
      });

      if (oficina === null) {
        return await this.finalizar(repo, notificacao, {
          STATUS: StatusNotificacaoVisita.FALHOU,
          ERRO_ENVIO: MOTIVO_OFICINA_INEXISTENTE,
        });
      }

      // Guard 1 (AC26): a workshop updated recently is not asked to re-confirm.
      if (enderecoRecente(oficina)) {
        return await this.finalizar(repo, notificacao, {
          STATUS: StatusNotificacaoVisita.DISPENSADO,
          ERRO_ENVIO: MOTIVO_ENDERECO_RECENTE,
        });
      }

      // AC2: most recently touched Usuario first, nulls last, lowest ID as tiebreak.
      const usuarios = await AppDataSourceSync.getRepository(Usuario).find({
        where: { ID_OFICINA: rota.ID_OFICINA },
        order: {
          DATA_ALTERACAO: { direction: "DESC", nulls: "LAST" },
          ID_USUARIO: "ASC",
        },
      });

      if (usuarios.length === 0) {
        return await this.finalizar(repo, notificacao, {
          STATUS: StatusNotificacaoVisita.FALHOU,
          ERRO_ENVIO: MOTIVO_SEM_USUARIO,
        });
      }

      const destinatario = usuarios.find((usuario) => (usuario.CELULAR ?? "").trim() !== "");

      // AC3
      if (destinatario === undefined) {
        return await this.finalizar(repo, notificacao, {
          STATUS: StatusNotificacaoVisita.FALHOU,
          ERRO_ENVIO: MOTIVO_SEM_TELEFONE,
        });
      }

      // Guard 2 (AC27-AC29): per-recipient anti-spam.
      const guarda = await avaliarGuardas(destinatario.ID_USUARIO!);
      if (guarda.bloqueado) {
        return await this.finalizar(repo, notificacao, {
          ID_USUARIO: destinatario.ID_USUARIO,
          STATUS: StatusNotificacaoVisita.DISPENSADO,
          ERRO_ENVIO: guarda.motivo,
        });
      }

      // AC4: fail closed on a number that does not normalize.
      const telefone = normalizarTelefone(destinatario.CELULAR);
      if (telefone === null) {
        return await this.finalizar(repo, notificacao, {
          ID_USUARIO: destinatario.ID_USUARIO,
          STATUS: StatusNotificacaoVisita.FALHOU,
          ERRO_ENVIO: MOTIVO_TELEFONE_INVALIDO,
        });
      }

      // AC5: the token is issued BEFORE dispatch — the message needs its URL —
      // and stays valid whether or not the dispatch succeeds (AC11).
      const { raw, hash } = gerarLinkToken();
      const expiraEm = new Date(Date.now() + HORAS_VALIDADE_TOKEN * 60 * 60 * 1000);
      const confirmationUrl = montarConfirmationUrl(raw);

      notificacao = await this.finalizar(repo, notificacao, {
        ID_USUARIO: destinatario.ID_USUARIO,
        TELEFONE_NORMALIZADO: telefone,
        TOKEN_HASH: hash,
        EXPIRA_EM: expiraEm,
      });
      NotificacaoVisitaService.log("link token emitido", notificacao);

      NotificacaoVisitaService.log("tentando despachar notificação", notificacao);
      const resultado = await getChannel(CanalNotificacao.WHATSAPP).send({
        toPhone: telefone,
        variables: [oficina.NOME_FANTASIA ?? "", confirmationUrl],
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
        return enviada;
      }

      // AC8, AC9, AC11-AC13
      const falhou = await this.finalizar(repo, notificacao, {
        STATUS: StatusNotificacaoVisita.FALHOU,
        ERRO_ENVIO: comporErroEnvio(resultado.reason, resultado.providerCode),
      });
      NotificacaoVisitaService.log("falha no envio da notificação", falhou);
      return falhou;
    } catch (erro) {
      console.error("[notificacaoVisita] erro inesperado no envio", {
        ID_ROTA_PROMOTOR: idRota,
        ID_NOTIFICACAO_VISITA: notificacao?.ID_NOTIFICACAO_VISITA ?? null,
        erro: (erro as Error)?.message,
      });

      const linha =
        notificacao ??
        new NotificacaoVisita({
          ID_ROTA_PROMOTOR: idRota,
          CANAL: CanalNotificacao.WHATSAPP,
        });
      linha.STATUS = StatusNotificacaoVisita.FALHOU;
      linha.ERRO_ENVIO = `unexpected error: ${(erro as Error)?.message}`;

      try {
        return await repo.save(linha);
      } catch {
        // The datasource itself is unavailable; returning the in-memory row is
        // all that is left, and still must not throw at the caller.
        return linha;
      }
    }
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
