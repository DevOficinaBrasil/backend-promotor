// Pre-send guards: the "should we send at all?" policy, kept out of the send
// orchestrator so it is testable independently of the dispatch mechanics.

import { LessThan, MoreThanOrEqual } from "typeorm";
import { AppDataSourceSync } from "../data-source";
import NotificacaoVisita, { StatusNotificacaoVisita } from "../entities/NotificacaoVisita";

const MESES_FRESCOR_ENDERECO = 3;
const MESES_CONFIRMACAO_RECENTE = 3;

export const MOTIVO_PENDENTE = "recipient has outstanding notification";
export const MOTIVO_CONFIRMADO_RECENTE = "recipient confirmed recently";

export interface GuardaResultado {
  bloqueado: boolean;
  motivo?: string;
}

/** Calendar-month subtraction, so "3 months" tracks the calendar, not 90 fixed days. */
function mesesAtras(agora: Date, meses: number): Date {
  const limite = new Date(agora.getTime());
  limite.setMonth(limite.getMonth() - meses);
  return limite;
}

/**
 * True when the workshop's record was updated within the last 3 months, in
 * which case the reparador is not asked to re-confirm the address (spec AC26).
 *
 * A NULL/absent DATA_ALTERACAO counts as stale, never fresh: the guard only
 * skips on a positive, recent timestamp (spec edge case). The parameter type
 * is structural rather than Pick<Oficina, "DATA_ALTERACAO"> because TypeORM
 * hands back null for the column while the entity declares it optional.
 *
 * @param agora - injectable clock so the 3-month boundary is testable
 */
export function enderecoRecente(
  oficina: { DATA_ALTERACAO?: Date | null },
  agora: Date = new Date()
): boolean {
  const alteradoEm = oficina.DATA_ALTERACAO;

  if (alteradoEm == null) {
    return false;
  }

  return alteradoEm.getTime() >= mesesAtras(agora, MESES_FRESCOR_ENDERECO).getTime();
}

/**
 * Decides whether this recipient may be messaged at all (spec AC27-AC29).
 *
 * Scoped to the person, not the workshop: a blocking row on ANY Oficina blocks
 * the send, because the guard protects the individual's phone from repeat
 * messages.
 *
 * Order is load-bearing. The opportunistic EXPIRADO persist runs FIRST (AC27),
 * so a row that has already lapsed is never counted as outstanding by the
 * check that follows. Reversing the two would let a just-expired row falsely
 * block a legitimate send.
 *
 * @param agora - injectable clock so the expiry and 3-month windows are testable
 */
export async function avaliarGuardas(
  idUsuario: number,
  agora: Date = new Date()
): Promise<GuardaResultado> {
  const repo = AppDataSourceSync.getRepository(NotificacaoVisita);

  // 1. Opportunistic cleanup (AC27) — MUST precede the outstanding check below.
  // Nothing sweeps expired rows, so this scan is the only thing that lets the
  // stored column self-heal for an active recipient.
  await repo.update(
    {
      ID_USUARIO: idUsuario,
      STATUS: StatusNotificacaoVisita.ENVIADO,
      EXPIRA_EM: LessThan(agora),
    },
    { STATUS: StatusNotificacaoVisita.EXPIRADO }
  );

  // 2. Outstanding request (AC28). The EXPIRA_EM filter is kept in addition to
  // step 1 so a failed or partial persist can never resurrect an expired row
  // as outstanding.
  const pendente = await repo.findOne({
    where: {
      ID_USUARIO: idUsuario,
      STATUS: StatusNotificacaoVisita.ENVIADO,
      EXPIRA_EM: MoreThanOrEqual(agora),
    },
  });

  if (pendente !== null) {
    return { bloqueado: true, motivo: MOTIVO_PENDENTE };
  }

  // 3. Recent confirmation (AC29).
  const confirmadaRecente = await repo.findOne({
    where: {
      ID_USUARIO: idUsuario,
      STATUS: StatusNotificacaoVisita.CONFIRMADO,
      CONFIRMADO_EM: MoreThanOrEqual(mesesAtras(agora, MESES_CONFIRMACAO_RECENTE)),
    },
  });

  if (confirmadaRecente !== null) {
    return { bloqueado: true, motivo: MOTIVO_CONFIRMADO_RECENTE };
  }

  return { bloqueado: false };
}
