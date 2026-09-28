import { statusEfetivo, rotaListavelParaPromotor, estadoConvite } from '../../utils/statusNotificacaoVisita';
import { StatusRota } from '../../entities/RotaPromotor';
import { StatusNotificacaoVisita, OrigemAceite } from '../../entities/NotificacaoVisita';

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

// FILT-01 a FILT-05 (spec: filtro-rotas-por-confirmacao), substituídos por
// CONV-31 a CONV-33 (spec: disparo-convite-visita-admin, AD-003): rota em
// BACKLOG só entra na lista do app com o convite aceito (CONFIRMADO, de
// qualquer origem). Rota já trabalhada entra sempre.
describe('rotaListavelParaPromotor', () => {
  const AGORA = new Date('2026-08-05T12:00:00.000Z');
  const EXPIRA_PASSADO = new Date('2026-08-01T12:00:00.000Z');
  const EXPIRA_FUTURO = new Date('2026-08-12T12:00:00.000Z');

  const backlogCom = (STATUS: StatusNotificacaoVisita, EXPIRA_EM: Date | null = EXPIRA_FUTURO) => ({
    STATUS: StatusRota.BACKLOG,
    notificacao: { STATUS, EXPIRA_EM },
  });

  // CONV-31 (era FILT-01 / AC1): só CONFIRMADO entra, de qualquer origem.
  it.each([
    [null],
    [OrigemAceite.REPARADOR],
    [OrigemAceite.CONFIRMACAO_RECENTE],
    [OrigemAceite.CONVITE_VINCULADO],
    [OrigemAceite.IMPORTADA],
  ])('lista rota BACKLOG CONFIRMADO com origem %s', (ORIGEM_ACEITE) => {
    expect(
      rotaListavelParaPromotor(
        {
          STATUS: StatusRota.BACKLOG,
          notificacao: { STATUS: StatusNotificacaoVisita.CONFIRMADO, EXPIRA_EM: EXPIRA_FUTURO, ORIGEM_ACEITE },
        },
        AGORA
      )
    ).toBe(true);
  });

  // CONV-32 (era FILT-01 / AC1, que listava DISPENSADO e FALHOU): AD-003 tirou
  // DISPENSADO e FALHOU da lista, e RECUSADO e AGUARDANDO também ficam fora.
  it.each([
    StatusNotificacaoVisita.DISPENSADO,
    StatusNotificacaoVisita.FALHOU,
    StatusNotificacaoVisita.RECUSADO,
    StatusNotificacaoVisita.AGUARDANDO,
  ])('esconde rota BACKLOG sem aceite: %s', (status) => {
    expect(rotaListavelParaPromotor(backlogCom(status), AGORA)).toBe(false);
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

  // CONV-32 (era FILT-05 / AC5, que listava rota sem notificação): AD-003 —
  // rota em BACKLOG sem notificação não foi aceita, então sai da lista.
  it('esconde rota BACKLOG sem linha de notificacao', () => {
    expect(rotaListavelParaPromotor({ STATUS: StatusRota.BACKLOG }, AGORA)).toBe(false);
    expect(rotaListavelParaPromotor({ STATUS: StatusRota.BACKLOG, notificacao: null }, AGORA)).toBe(
      false
    );
  });

  // CONV-33: rota já trabalhada sem notificação continua aparecendo.
  it('lista rota ja trabalhada sem linha de notificacao', () => {
    expect(rotaListavelParaPromotor({ STATUS: StatusRota.FINALIZADO, notificacao: null }, AGORA)).toBe(
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

// CONV-41 (disparo-convite-visita-admin, P2 AC1): estado de cada convite para o
// painel do admin, um dos 12 estados do design.
describe('estadoConvite', () => {
  const AGORA = new Date('2026-08-05T12:00:00.000Z');
  const PASSADO = new Date('2026-08-01T12:00:00.000Z');
  const FUTURO = new Date('2026-08-12T12:00:00.000Z');

  it('rota sem notificação é nao_disparada', () => {
    expect(estadoConvite(null, AGORA)).toBe('nao_disparada');
    expect(estadoConvite(undefined, AGORA)).toBe('nao_disparada');
  });

  it.each([
    [{ STATUS: StatusNotificacaoVisita.PENDENTE }, 'agendada'],
    [{ STATUS: StatusNotificacaoVisita.ENVIADO, EXPIRA_EM: FUTURO }, 'enviada'],
    [{ STATUS: StatusNotificacaoVisita.CONFIRMADO, ORIGEM_ACEITE: OrigemAceite.REPARADOR }, 'aceita'],
    [
      { STATUS: StatusNotificacaoVisita.CONFIRMADO, ORIGEM_ACEITE: OrigemAceite.CONFIRMACAO_RECENTE },
      'aceita_confirmacao_recente',
    ],
    [
      { STATUS: StatusNotificacaoVisita.CONFIRMADO, ORIGEM_ACEITE: OrigemAceite.CONVITE_VINCULADO },
      'aceita_convite_vinculado',
    ],
    [{ STATUS: StatusNotificacaoVisita.CONFIRMADO, ORIGEM_ACEITE: OrigemAceite.IMPORTADA }, 'aceita_importada'],
    [{ STATUS: StatusNotificacaoVisita.RECUSADO }, 'recusada'],
    [{ STATUS: StatusNotificacaoVisita.EXPIRADO }, 'expirada'],
    [{ STATUS: StatusNotificacaoVisita.FALHOU }, 'falhou'],
    [{ STATUS: StatusNotificacaoVisita.DISPENSADO }, 'dispensada'],
    [{ STATUS: StatusNotificacaoVisita.AGUARDANDO }, 'aguardando'],
  ])('%o vira %s', (notificacao, estado) => {
    expect(estadoConvite(notificacao, AGORA)).toBe(estado);
  });

  // Mesmo status efetivo de toda leitura: ENVIADO vencido é expirada.
  it('ENVIADO com EXPIRA_EM vencido é expirada', () => {
    expect(estadoConvite({ STATUS: StatusNotificacaoVisita.ENVIADO, EXPIRA_EM: PASSADO }, AGORA)).toBe('expirada');
  });

  // Spec-precision gap: o design não diz como mostrar REAGENDADO (reservado) nem
  // valor fora do enum. REAGENDADO é um agendamento, valor desconhecido aparece
  // como falhou, para o admin investigar em vez de ver a rota como saudável.
  it('REAGENDADO é agendada e valor desconhecido é falhou', () => {
    expect(estadoConvite({ STATUS: StatusNotificacaoVisita.REAGENDADO }, AGORA)).toBe('agendada');
    expect(estadoConvite({ STATUS: 'INVENTADO' as any }, AGORA)).toBe('falhou');
  });

  // Linha CONFIRMADO anterior à migration (sem origem) veio do reparador.
  it('CONFIRMADO sem origem é aceita', () => {
    expect(estadoConvite({ STATUS: StatusNotificacaoVisita.CONFIRMADO, ORIGEM_ACEITE: null }, AGORA)).toBe('aceita');
  });
});
