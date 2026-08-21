import { statusEfetivo, rotaListavelParaPromotor } from '../../utils/statusNotificacaoVisita';
import { StatusRota } from '../../entities/RotaPromotor';
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

// FILT-01 a FILT-05 (spec: filtro-rotas-por-confirmacao). A lista do app de
// campo traz só rota cuja confirmação está resolvida, rota sem pedido de
// confirmação e rota já trabalhada.
describe('rotaListavelParaPromotor', () => {
  const AGORA = new Date('2026-08-05T12:00:00.000Z');
  const EXPIRA_PASSADO = new Date('2026-08-01T12:00:00.000Z');
  const EXPIRA_FUTURO = new Date('2026-08-12T12:00:00.000Z');

  const backlogCom = (STATUS: StatusNotificacaoVisita, EXPIRA_EM: Date | null = EXPIRA_FUTURO) => ({
    STATUS: StatusRota.BACKLOG,
    notificacao: { STATUS, EXPIRA_EM },
  });

  // FILT-01 / AC1
  it.each([
    StatusNotificacaoVisita.CONFIRMADO,
    StatusNotificacaoVisita.DISPENSADO,
    StatusNotificacaoVisita.FALHOU,
  ])('lista rota BACKLOG com confirmacao resolvida: %s', (status) => {
    expect(rotaListavelParaPromotor(backlogCom(status), AGORA)).toBe(true);
  });

  // FILT-02 / AC2
  it.each([StatusNotificacaoVisita.PENDENTE, StatusNotificacaoVisita.ENVIADO])(
    'esconde rota BACKLOG que ainda aguarda resposta: %s',
    (status) => {
      expect(rotaListavelParaPromotor(backlogCom(status), AGORA)).toBe(false);
    }
  );

  // FILT-02 / AC2 + AC8: decide pelo status efetivo, não pelo bruto.
  it('esconde rota BACKLOG cujo ENVIADO ja venceu (efetivo EXPIRADO)', () => {
    expect(
      rotaListavelParaPromotor(
        backlogCom(StatusNotificacaoVisita.ENVIADO, EXPIRA_PASSADO),
        AGORA
      )
    ).toBe(false);
  });

  it('esconde rota BACKLOG com EXPIRADO gravado', () => {
    expect(rotaListavelParaPromotor(backlogCom(StatusNotificacaoVisita.EXPIRADO), AGORA)).toBe(
      false
    );
  });

  // FILT-03 / AC3
  it('esconde rota BACKLOG com REAGENDADO, valor reservado sem significado definido', () => {
    expect(rotaListavelParaPromotor(backlogCom(StatusNotificacaoVisita.REAGENDADO), AGORA)).toBe(
      false
    );
  });

  it('esconde rota BACKLOG com status fora do enum', () => {
    expect(
      rotaListavelParaPromotor(
        { STATUS: StatusRota.BACKLOG, notificacao: { STATUS: 'INVENTADO' as any, EXPIRA_EM: null } },
        AGORA
      )
    ).toBe(false);
  });

  // FILT-04 / AC4: rota já trabalhada aparece com qualquer status de notificação.
  it.each([
    StatusRota.A_CAMINHO,
    StatusRota.EM_ANDAMENTO,
    StatusRota.FINALIZADO,
    StatusRota.CANCELADO,
  ])('lista rota ja trabalhada (%s) mesmo com notificacao ENVIADO', (statusRota) => {
    expect(
      rotaListavelParaPromotor(
        {
          STATUS: statusRota,
          notificacao: { STATUS: StatusNotificacaoVisita.ENVIADO, EXPIRA_EM: EXPIRA_FUTURO },
        },
        AGORA
      )
    ).toBe(true);
  });

  // FILT-05 / AC5 + edge case do banco legado.
  it('lista rota sem linha de notificacao', () => {
    expect(rotaListavelParaPromotor({ STATUS: StatusRota.BACKLOG }, AGORA)).toBe(true);
    expect(rotaListavelParaPromotor({ STATUS: StatusRota.BACKLOG, notificacao: null }, AGORA)).toBe(
      true
    );
  });

  // Decisão registrada: STATUS nulo/ausente conta como BACKLOG (default do banco).
  it('trata rota sem STATUS como BACKLOG e aplica o filtro', () => {
    expect(
      rotaListavelParaPromotor(
        { notificacao: { STATUS: StatusNotificacaoVisita.ENVIADO, EXPIRA_EM: EXPIRA_FUTURO } },
        AGORA
      )
    ).toBe(false);
    expect(
      rotaListavelParaPromotor(
        {
          STATUS: null,
          notificacao: { STATUS: StatusNotificacaoVisita.CONFIRMADO, EXPIRA_EM: null },
        },
        AGORA
      )
    ).toBe(true);
  });

  // Edge case: CONFIRMADO sem CONFIRMADO_EM não muda a decisão.
  it('lista rota CONFIRMADO mesmo sem EXPIRA_EM', () => {
    expect(
      rotaListavelParaPromotor(backlogCom(StatusNotificacaoVisita.CONFIRMADO, null), AGORA)
    ).toBe(true);
  });
});
