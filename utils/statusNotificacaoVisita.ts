import { StatusNotificacaoVisita } from "../entities/NotificacaoVisita";
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
  notificacao?: NotificacaoVisitaStatusFields | null;
};

/**
 * Status de confirmação que liberam a rota para a lista do app de campo
 * (FILT-01). Nos três não há mais resposta a esperar: a oficina confirmou, o
 * envio foi deliberadamente suprimido, ou a entrega falhou em definitivo.
 */
const CONFIRMACAO_RESOLVIDA: ReadonlySet<StatusNotificacaoVisita> = new Set([
  StatusNotificacaoVisita.CONFIRMADO,
  StatusNotificacaoVisita.DISPENSADO,
  StatusNotificacaoVisita.FALHOU,
]);

/**
 * Decide se uma rota entra na lista do app do promotor (FILT-01 a FILT-05).
 *
 * Regra, na ordem em que é aplicada:
 *
 * 1. Rota já trabalhada (`STATUS` diferente de `BACKLOG`) sempre aparece. Sem
 *    isso o promotor faz check-in, dá refresh e a oficina desaparece no meio da
 *    visita, e visitas concluídas sairiam do histórico.
 * 2. Rota sem linha em `NOTIFICACAO_VISITA` aparece: nunca houve pedido de
 *    confirmação, logo não há nada a aguardar.
 * 3. O resto é decidido pelo status **efetivo** — `ENVIADO` vencido lê como
 *    `EXPIRADO` aqui, igual em toda outra leitura.
 *
 * `REAGENDADO` e qualquer valor fora do enum não aparecem: erra para o lado de
 * não mandar o promotor a uma visita cujo estado o sistema não interpreta.
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
    return true;
  }

  const status = statusEfetivo(rota.notificacao, agora);
  return status != null && CONFIRMACAO_RESOLVIDA.has(status);
}
