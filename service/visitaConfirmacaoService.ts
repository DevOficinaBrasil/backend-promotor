import { MoreThan } from "typeorm";
import { AppDataSourceSync } from "../data-source";
import NotificacaoVisita, { StatusNotificacaoVisita } from "../entities/NotificacaoVisita";
import Oficina from "../entities/Oficina";
import RotaPromotor from "../entities/RotaPromotor";
import { statusEfetivo } from "../utils/statusNotificacaoVisita";
import { emitirJwt, hashToken, VisitaJwtPayload } from "../utils/visitaToken";

/** The seven address columns a link-holder may see and correct. Nothing else. */
export const CAMPOS_ENDERECO = [
  "ENDERECO",
  "NUMERO",
  "COMPLEMENTO",
  "BAIRRO",
  "CIDADE",
  "ESTADO",
  "CEP",
] as const;

export type CampoEndereco = (typeof CAMPOS_ENDERECO)[number];

export type EnderecoOficina = Record<CampoEndereco, string | null>;

export type ExchangeResult =
  | {
      state: "PENDING";
      jwt: string;
      oficinaNome: string | null;
      endereco: EnderecoOficina;
    }
  | { state: "ALREADY_CONFIRMED"; oficinaNome: string | null; confirmadoEm: Date | null }
  | { state: "EXPIRED" }
  | { state: "TOKEN_INVALID" };

export type ConfirmResult =
  | { state: "CONFIRMED"; confirmadoEm: Date; enderecoAtualizado: boolean }
  | { state: "ALREADY_CONFIRMED"; confirmadoEm: Date | null }
  | { state: "EXPIRED" }
  | { state: "TOKEN_INVALID" };

export type EnderecoResult =
  | ConfirmResult
  | { state: "VALIDATION_ERROR"; campos: string[] }
  | { state: "ADDRESS_UPDATE_FAILED" };

/** Projects an Oficina row onto the address allowlist, normalising undefined to null. */
function extrairEndereco(oficina: Oficina | null): EnderecoOficina {
  return {
    ENDERECO: oficina?.ENDERECO ?? null,
    NUMERO: oficina?.NUMERO ?? null,
    COMPLEMENTO: oficina?.COMPLEMENTO ?? null,
    BAIRRO: oficina?.BAIRRO ?? null,
    CIDADE: oficina?.CIDADE ?? null,
    ESTADO: oficina?.ESTADO ?? null,
    CEP: oficina?.CEP ?? null,
  };
}

export default class VisitaConfirmacaoService {
  /**
   * Exchanges the WhatsApp link's opaque token for a short-lived, visit-scoped
   * JWT (spec AC14-AC18, AC30).
   *
   * Read-only by design: expiry is decided by statusEfetivo() and the stored
   * STATUS column is never mutated here, so an unopened expired link still
   * reports EXPIRADO on every read path. Re-exchangeable while the visit is
   * live (spec AC15) — only the CONFIRMADO transition is single-use.
   *
   * @param agora - injectable clock so the expiry boundary is testable
   */
  static async trocarToken(rawToken: string, agora: Date = new Date()): Promise<ExchangeResult> {
    // AC16: a malformed token never reaches the database.
    if (typeof rawToken !== "string" || rawToken.trim() === "") {
      return { state: "TOKEN_INVALID" };
    }

    const repo = AppDataSourceSync.getRepository(NotificacaoVisita);
    const notificacao = await repo.findOne({ where: { TOKEN_HASH: hashToken(rawToken) } });

    if (notificacao === null) {
      return { state: "TOKEN_INVALID" };
    }

    const status = statusEfetivo(notificacao, agora);

    if (status === StatusNotificacaoVisita.EXPIRADO) {
      // AC17
      return { state: "EXPIRED" };
    }

    if (status === StatusNotificacaoVisita.CONFIRMADO) {
      // AC18
      return {
        state: "ALREADY_CONFIRMED",
        oficinaNome: (await this.carregarOficina(notificacao))?.NOME_FANTASIA ?? null,
        confirmadoEm: notificacao.CONFIRMADO_EM ?? null,
      };
    }

    // Only a live, dispatched notification is exchangeable. PENDENTE, FALHOU
    // and DISPENSADO rows never had a delivered link to open.
    if (status !== StatusNotificacaoVisita.ENVIADO || notificacao.ID_USUARIO == null) {
      return { state: "TOKEN_INVALID" };
    }

    const oficina = await this.carregarOficina(notificacao);

    // AC14: JWT plus the workshop's name and current registered address.
    // AC30: no visit date is returned — the schema has no per-visit date.
    return {
      state: "PENDING",
      jwt: emitirJwt({
        sub: notificacao.ID_USUARIO,
        ID_NOTIFICACAO_VISITA: notificacao.ID_NOTIFICACAO_VISITA!,
        ID_ROTA_PROMOTOR: notificacao.ID_ROTA_PROMOTOR!,
      }),
      oficinaNome: oficina?.NOME_FANTASIA ?? null,
      endereco: extrairEndereco(oficina),
    };
  }

  /**
   * Applies the ENVIADO→CONFIRMADO transition with its audit fields
   * (spec AC19-AC21).
   *
   * Live state decides, not the JWT's snapshot at issuance: the conditional
   * UPDATE re-checks STATUS and expiry in the same statement, so a JWT minted
   * before EXPIRA_EM passed can no longer confirm a dead visit.
   *
   * @param agora - injectable clock so the expiry boundary is testable
   */
  static async confirmar(
    payload: VisitaJwtPayload,
    ip: string,
    agora: Date = new Date()
  ): Promise<ConfirmResult> {
    return await this.transicionar(payload, ip, false, agora);
  }

  /**
   * Corrects the workshop's address and confirms the visit in one call
   * (spec AC31-AC33).
   *
   * Three guarantees, in this order:
   * 1. Only the seven allowlisted address columns are writable. Any other key
   *    is rejected outright and nothing is written (AC32).
   * 2. The Oficina write happens before the CONFIRMADO transition and must
   *    succeed. A rejected write — including a missing UPDATE grant on
   *    MAIN_REGISTER — leaves the notification STATUS untouched and surfaces a
   *    distinct error, never a false confirmation (AC33).
   * 3. LATITUDE/LONGITUDE are deliberately left alone: no geocoding provider
   *    exists in this codebase, so a corrected address keeps its old pin.
   *
   * @param agora - injectable clock so the expiry boundary is testable
   */
  static async atualizarEndereco(
    payload: VisitaJwtPayload,
    endereco: Record<string, unknown>,
    ip: string,
    agora: Date = new Date()
  ): Promise<EnderecoResult> {
    const permitidos = new Set<string>(CAMPOS_ENDERECO);
    const invalidos = Object.keys(endereco ?? {}).filter((campo) => !permitidos.has(campo));

    // AC32
    if (invalidos.length > 0) {
      return { state: "VALIDATION_ERROR", campos: invalidos };
    }

    const repo = AppDataSourceSync.getRepository(NotificacaoVisita);
    const notificacao = await repo.findOne({
      where: { ID_NOTIFICACAO_VISITA: payload.ID_NOTIFICACAO_VISITA },
    });

    if (notificacao === null) {
      return { state: "TOKEN_INVALID" };
    }

    // A visit that can no longer be confirmed must not cause a registry write.
    const status = statusEfetivo(notificacao, agora);

    if (status === StatusNotificacaoVisita.CONFIRMADO) {
      return { state: "ALREADY_CONFIRMED", confirmadoEm: notificacao.CONFIRMADO_EM ?? null };
    }

    if (status === StatusNotificacaoVisita.EXPIRADO) {
      return { state: "EXPIRED" };
    }

    if (status !== StatusNotificacaoVisita.ENVIADO) {
      return { state: "TOKEN_INVALID" };
    }

    const oficina = await this.carregarOficina(notificacao);

    if (oficina?.ID_OFICINA == null) {
      return { state: "TOKEN_INVALID" };
    }

    try {
      await AppDataSourceSync.getRepository(Oficina).update({ ID_OFICINA: oficina.ID_OFICINA }, endereco);
    } catch (erro) {
      console.error("[visitaConfirmacao] falha ao atualizar endereço da oficina", {
        ID_NOTIFICACAO_VISITA: payload.ID_NOTIFICACAO_VISITA,
        ID_ROTA_PROMOTOR: payload.ID_ROTA_PROMOTOR,
        erro: (erro as Error)?.message,
      });
      return { state: "ADDRESS_UPDATE_FAILED" };
    }

    return await this.transicionar(payload, ip, true, agora);
  }

  protected static async transicionar(
    payload: VisitaJwtPayload,
    ip: string,
    enderecoAtualizado: boolean,
    agora: Date
  ): Promise<ConfirmResult> {
    const repo = AppDataSourceSync.getRepository(NotificacaoVisita);
    const id = payload.ID_NOTIFICACAO_VISITA;

    // One guarded statement, so two concurrent confirms produce exactly one
    // transition (AC21) — the loser simply affects 0 rows. The EXPIRA_EM guard
    // is required, not decorative: expiry is derived rather than stored, so an
    // expired row still reads STATUS='ENVIADO' in the database.
    const resultado = await repo.update(
      {
        ID_NOTIFICACAO_VISITA: id,
        STATUS: StatusNotificacaoVisita.ENVIADO,
        EXPIRA_EM: MoreThan(agora),
      },
      {
        STATUS: StatusNotificacaoVisita.CONFIRMADO,
        CONFIRMADO_EM: agora,
        CONFIRMADO_POR: payload.sub,
        CONFIRMADO_IP: ip,
        ...(enderecoAtualizado ? { ENDERECO_ATUALIZADO: true } : {}),
      }
    );

    if ((resultado.affected ?? 0) > 0) {
      return { state: "CONFIRMED", confirmadoEm: agora, enderecoAtualizado };
    }

    // Zero rows means somebody or something got there first. Re-read rather
    // than guess, so a lost race is never reported as a success.
    const linha = await repo.findOne({ where: { ID_NOTIFICACAO_VISITA: id } });

    if (linha === null) {
      return { state: "TOKEN_INVALID" };
    }

    const status = statusEfetivo(linha, agora);

    if (status === StatusNotificacaoVisita.CONFIRMADO) {
      return { state: "ALREADY_CONFIRMED", confirmadoEm: linha.CONFIRMADO_EM ?? null };
    }

    if (status === StatusNotificacaoVisita.EXPIRADO) {
      return { state: "EXPIRED" };
    }

    return { state: "TOKEN_INVALID" };
  }

  /**
   * Resolves the workshop behind a notification through its route.
   *
   * Returns null when either row is missing rather than failing the exchange:
   * the frontend contract already allows every address field to be null, so a
   * gap in the registry degrades to empty inputs instead of a false
   * "link inválido".
   */
  protected static async carregarOficina(
    notificacao: NotificacaoVisita
  ): Promise<Oficina | null> {
    const rota = await AppDataSourceSync.getRepository(RotaPromotor).findOne({
      where: { ID_ROTA_PROMOTOR: notificacao.ID_ROTA_PROMOTOR },
    });

    if (rota === null || rota.ID_OFICINA == null) {
      return null;
    }

    return await AppDataSourceSync.getRepository(Oficina).findOne({
      where: { ID_OFICINA: rota.ID_OFICINA },
    });
  }
}
