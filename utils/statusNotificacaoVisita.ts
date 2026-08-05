import { StatusNotificacaoVisita } from "../entities/NotificacaoVisita";

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
