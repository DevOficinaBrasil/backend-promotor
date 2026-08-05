import { statusEfetivo } from '../../utils/statusNotificacaoVisita';
import { StatusNotificacaoVisita } from '../../entities/NotificacaoVisita';

// Spec: AC22 — effective EXPIRADO status is derived at read time from
// STATUS = 'ENVIADO' AND EXPIRA_EM < now(), via one shared helper, not
// written by a stored transition. Every other STATUS/EXPIRA_EM combination
// must be returned unchanged.
describe('statusEfetivo', () => {
  const clock = (iso: string) => () => new Date(iso);

  it('returns ENVIADO unchanged when EXPIRA_EM is still in the future', () => {
    const result = statusEfetivo(
      { STATUS: StatusNotificacaoVisita.ENVIADO, EXPIRA_EM: new Date('2026-01-10T00:00:00Z') },
      clock('2026-01-01T00:00:00Z')()
    );
    expect(result).toBe(StatusNotificacaoVisita.ENVIADO);
  });

  it('returns EXPIRADO when STATUS is ENVIADO and EXPIRA_EM has passed', () => {
    const result = statusEfetivo(
      { STATUS: StatusNotificacaoVisita.ENVIADO, EXPIRA_EM: new Date('2026-01-01T00:00:00Z') },
      clock('2026-01-10T00:00:00Z')()
    );
    expect(result).toBe(StatusNotificacaoVisita.EXPIRADO);
  });

  it('returns ENVIADO unchanged at the exact expiry boundary instant (not strictly past)', () => {
    const boundary = new Date('2026-01-10T00:00:00.000Z');
    const result = statusEfetivo(
      { STATUS: StatusNotificacaoVisita.ENVIADO, EXPIRA_EM: boundary },
      new Date(boundary.getTime())
    );
    expect(result).toBe(StatusNotificacaoVisita.ENVIADO);
  });

  it('returns EXPIRADO one millisecond past the exact expiry boundary', () => {
    const boundary = new Date('2026-01-10T00:00:00.000Z');
    const result = statusEfetivo(
      { STATUS: StatusNotificacaoVisita.ENVIADO, EXPIRA_EM: boundary },
      new Date(boundary.getTime() + 1)
    );
    expect(result).toBe(StatusNotificacaoVisita.EXPIRADO);
  });

  it('returns CONFIRMADO unchanged even when EXPIRA_EM is long past', () => {
    const result = statusEfetivo(
      { STATUS: StatusNotificacaoVisita.CONFIRMADO, EXPIRA_EM: new Date('2020-01-01T00:00:00Z') },
      clock('2026-01-01T00:00:00Z')()
    );
    expect(result).toBe(StatusNotificacaoVisita.CONFIRMADO);
  });

  it('returns DISPENSADO unchanged regardless of EXPIRA_EM', () => {
    const result = statusEfetivo(
      { STATUS: StatusNotificacaoVisita.DISPENSADO, EXPIRA_EM: new Date('2020-01-01T00:00:00Z') },
      clock('2026-01-01T00:00:00Z')()
    );
    expect(result).toBe(StatusNotificacaoVisita.DISPENSADO);
  });

  it('returns ENVIADO unchanged when EXPIRA_EM is null', () => {
    const result = statusEfetivo(
      { STATUS: StatusNotificacaoVisita.ENVIADO, EXPIRA_EM: null },
      clock('2026-01-01T00:00:00Z')()
    );
    expect(result).toBe(StatusNotificacaoVisita.ENVIADO);
  });

  it('returns PENDENTE unchanged (never derives EXPIRADO for a non-ENVIADO status)', () => {
    const result = statusEfetivo(
      { STATUS: StatusNotificacaoVisita.PENDENTE, EXPIRA_EM: new Date('2020-01-01T00:00:00Z') },
      clock('2026-01-01T00:00:00Z')()
    );
    expect(result).toBe(StatusNotificacaoVisita.PENDENTE);
  });

  it('defaults the clock to the current time when agora is not provided', () => {
    const future = new Date(Date.now() + 60_000);
    const result = statusEfetivo({ STATUS: StatusNotificacaoVisita.ENVIADO, EXPIRA_EM: future });
    expect(result).toBe(StatusNotificacaoVisita.ENVIADO);
  });
});
