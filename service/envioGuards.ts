// Pre-send guards: the "should we send at all?" policy, kept out of the send
// orchestrator so it is testable independently of the dispatch mechanics.

const MESES_FRESCOR_ENDERECO = 3;

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
