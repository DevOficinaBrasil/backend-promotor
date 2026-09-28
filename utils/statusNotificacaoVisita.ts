import { OrigemAceite, StatusNotificacaoVisita } from "../entities/NotificacaoVisita";
import { StatusRota } from "../entities/RotaPromotor";

type NotificacaoVisitaStatusFields = {
  STATUS?: StatusNotificacaoVisita;
  EXPIRA_EM?: Date | null;
};

/**
 * Derives the effective status of a NotificacaoVisita row.
 *
 * EXPIRADO is never stored by a transition — nothing sweeps expired rows, so
 * a link nobody opens must still report as expired on every read path. This
 * is the single source of truth for that derivation: STATUS is returned
 * unchanged in every case except a still-ENVIADO row whose EXPIRA_EM has
 * strictly passed.
 *
 * @param n - the row's STATUS and EXPIRA_EM fields
 * @param agora - injectable clock so the expiry boundary is testable without wall-clock dependence
 */
export function statusEfetivo(
  n: NotificacaoVisitaStatusFields,
  agora: Date = new Date()
): StatusNotificacaoVisita | undefined {
  if (
    n.STATUS === StatusNotificacaoVisita.ENVIADO &&
    n.EXPIRA_EM != null &&
    n.EXPIRA_EM.getTime() < agora.getTime()
  ) {
    return StatusNotificacaoVisita.EXPIRADO;
  }

  return n.STATUS;
}

type RotaListavelFields = {
  STATUS?: StatusRota | string | null;
  // ORIGEM_ACEITE não muda a decisão: CONFIRMADO de qualquer origem aparece.
  notificacao?: (NotificacaoVisitaStatusFields & { ORIGEM_ACEITE?: OrigemAceite | null }) | null;
};

/**
 * Decide se uma rota entra na lista do app do promotor (CONV-31 a CONV-33,
 * AD-003, que substitui a regra FILT-01 a FILT-05 de CONFIRMACAO_RESOLVIDA).
 *
 * 1. Rota já trabalhada (`STATUS` diferente de `BACKLOG`) sempre aparece. Sem
 *    isso o promotor faz check-in, dá refresh e a oficina desaparece no meio da
 *    visita, e visitas concluídas sairiam do histórico.
 * 2. Rota em `BACKLOG` só aparece com o convite aceito: status **efetivo**
 *    `CONFIRMADO`, de qualquer `ORIGEM_ACEITE`. Sem notificação, `PENDENTE`,
 *    `ENVIADO`, `EXPIRADO`, `FALHOU`, `DISPENSADO`, `RECUSADO`, `AGUARDANDO`,
 *    `REAGENDADO` ou valor fora do enum ficam fora.
 *
 * `STATUS` nulo ou ausente conta como `BACKLOG` — a coluna tem esse default no
 * banco, então linha sem status é rota que ninguém começou.
 *
 * @param rota - status da rota e, quando existir, os campos da notificação
 * @param agora - relógio injetável, repassado a statusEfetivo()
 */
export function rotaListavelParaPromotor(
  rota: RotaListavelFields,
  agora: Date = new Date()
): boolean {
  const statusRota = rota.STATUS ?? StatusRota.BACKLOG;
  if (statusRota !== StatusRota.BACKLOG) {
    return true;
  }

  if (!rota.notificacao?.STATUS) {
    return false;
  }

  return statusEfetivo(rota.notificacao, agora) === StatusNotificacaoVisita.CONFIRMADO;
}

export type EstadoConvite =
  | "nao_disparada"
  | "agendada"
  | "enviada"
  | "aceita"
  | "aceita_confirmacao_recente"
  | "aceita_convite_vinculado"
  | "aceita_importada"
  | "recusada"
  | "expirada"
  | "falhou"
  | "dispensada"
  | "aguardando";

type EstadoConviteFields = NotificacaoVisitaStatusFields & {
  ORIGEM_ACEITE?: OrigemAceite | null;
};

const ESTADO_POR_ORIGEM: Record<OrigemAceite, EstadoConvite> = {
  [OrigemAceite.REPARADOR]: "aceita",
  [OrigemAceite.CONFIRMACAO_RECENTE]: "aceita_confirmacao_recente",
  [OrigemAceite.CONVITE_VINCULADO]: "aceita_convite_vinculado",
  [OrigemAceite.IMPORTADA]: "aceita_importada",
};

/**
 * Estado do convite de uma rota para o painel do admin (CONV-41). Usa o status
 * efetivo, então `ENVIADO` vencido é `expirada`.
 *
 * `CONFIRMADO` sem origem é linha anterior à migration, que só o reparador
 * gerava. `REAGENDADO` (reservado) conta como agendada, e valor fora do enum
 * aparece como falhou, para o admin investigar.
 */
export function estadoConvite(
  n: EstadoConviteFields | null | undefined,
  agora: Date = new Date()
): EstadoConvite {
  if (!n?.STATUS) {
    return "nao_disparada";
  }

  switch (statusEfetivo(n, agora)) {
    case StatusNotificacaoVisita.PENDENTE:
    case StatusNotificacaoVisita.REAGENDADO:
      return "agendada";
    case StatusNotificacaoVisita.ENVIADO:
      return "enviada";
    case StatusNotificacaoVisita.CONFIRMADO:
      return (n.ORIGEM_ACEITE && ESTADO_POR_ORIGEM[n.ORIGEM_ACEITE]) || "aceita";
    case StatusNotificacaoVisita.RECUSADO:
      return "recusada";
    case StatusNotificacaoVisita.EXPIRADO:
      return "expirada";
    case StatusNotificacaoVisita.DISPENSADO:
      return "dispensada";
    case StatusNotificacaoVisita.FALHOU:
      return "falhou";
    case StatusNotificacaoVisita.AGUARDANDO:
      return "aguardando";
    default:
      return "falhou";
  }
}
