import { StatusRota } from "../entities/RotaPromotor";

/**
 * Rota em `AGUARDANDO` está estacionada: pertence ao promotor e continua
 * reservando a oficina na exclusividade da campanha, mas o resto do sistema a
 * ignora — app do promotor, dashboard do cliente, relatório, otimização de
 * ordem e despacho de notificação. Volta a valer quando o STATUS vira BACKLOG.
 *
 * Não confundir com `StatusNotificacaoVisita.AGUARDANDO` (notificação que segue
 * um convite já enviado).
 */
export function rotaEstacionada(status: StatusRota | string | null | undefined): boolean {
  return status === StatusRota.AGUARDANDO;
}

/** Predicado SQL de rota não estacionada para o alias informado (STATUS nulo conta como BACKLOG). */
export function sqlRotaNaoEstacionada(aliasRota = "rp"): string {
  return `${aliasRota}."STATUS"::text IS DISTINCT FROM '${StatusRota.AGUARDANDO}'`;
}
