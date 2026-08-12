import RotaService from '../../service/rotaService';
import { AppDataSourceSync } from '../../data-source';
import CampanhaPromotor from '../../entities/CampanhaPromotor';
import NotificacaoVisitaService, { criarCacheCampanha } from '../../service/notificacaoVisitaService';
import { StatusNotificacaoVisita } from '../../entities/NotificacaoVisita';

// Deliberately does NOT mock utils/migrationRepository: these tests exercise the
// real MigrationAwareRepository delegating to a mocked AppDataSourceSync, which
// is what proves the notification hook fires on the actual persistence path.
jest.mock('../../data-source');
jest.mock('../../service/notificacaoVisitaService');

// Spec AC1: "WHEN a new RotaPromotor record is created THEN the system SHALL
// create exactly one NotificacaoVisita record ... linked to that
// ID_ROTA_PROMOTOR" — which covers every creation path.
// Spec AC10: "IF the RotaPromotor creation transaction succeeds but the
// notification dispatch throws ... THEN the system SHALL still return the
// created RotaPromotor successfully."

describe('RotaService visit notification hook', () => {
  const notificarVisitaMock = NotificacaoVisitaService.notificarVisita as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    // The automock returns undefined; hand back a real cache so the batch
    // actually shares one, as production does.
    (criarCacheCampanha as jest.Mock).mockReturnValue({
      dados: new Map(),
      nomeEmpresa: new Map(),
    });
    notificarVisitaMock.mockResolvedValue({} as never);
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createRotas', () => {
    it('notifies the single created route', async () => {
      const mockRota = { ID_ROTA_PROMOTOR: 11, ID_CAMPANHA_PROMOTOR: 5, ID_OFICINA: 100 };
      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue({
        create: jest.fn().mockReturnValue(mockRota),
        save: jest.fn().mockResolvedValue(mockRota),
      });

      await RotaService.createRotas(5, 100);

      expect(notificarVisitaMock).toHaveBeenCalledTimes(1);
      expect(notificarVisitaMock).toHaveBeenCalledWith(mockRota, expect.anything());
    });

    it('notifies once per route created in a batch', async () => {
      const mockRotas = [
        { ID_ROTA_PROMOTOR: 1, ID_OFICINA: 100 },
        { ID_ROTA_PROMOTOR: 2, ID_OFICINA: 200 },
        { ID_ROTA_PROMOTOR: 3, ID_OFICINA: 300 },
      ];
      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue({
        create: jest.fn((data) => data),
        save: jest.fn().mockResolvedValue(mockRotas),
      });

      await RotaService.createRotas(5, [100, 200, 300]);

      expect(notificarVisitaMock).toHaveBeenCalledTimes(3);
      expect(notificarVisitaMock).toHaveBeenCalledWith(mockRotas[0], expect.anything());
      expect(notificarVisitaMock).toHaveBeenCalledWith(mockRotas[1], expect.anything());
      expect(notificarVisitaMock).toHaveBeenCalledWith(mockRotas[2], expect.anything());
    });

    // One campaign per batch, so one cache per batch — a cache per route would
    // memoize nothing.
    it('hands every route of a batch the same campaign cache', async () => {
      const mockRotas = [
        { ID_ROTA_PROMOTOR: 1, ID_OFICINA: 100 },
        { ID_ROTA_PROMOTOR: 2, ID_OFICINA: 200 },
        { ID_ROTA_PROMOTOR: 3, ID_OFICINA: 300 },
      ];
      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue({
        create: jest.fn((data) => data),
        save: jest.fn().mockResolvedValue(mockRotas),
      });

      await RotaService.createRotas(5, [100, 200, 300]);

      const caches = new Set(notificarVisitaMock.mock.calls.map((chamada) => chamada[1]));
      expect(caches.size).toBe(1);
    });

    // The send is a network call inside the request cycle: routes go through a
    // bounded pool, never all at once and never strictly one at a time.
    it('dispatches a large batch with bounded concurrency', async () => {
      const mockRotas = Array.from({ length: 12 }, (_, i) => ({
        ID_ROTA_PROMOTOR: i + 1,
        ID_OFICINA: 100 + i,
      }));
      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue({
        create: jest.fn((data) => data),
        save: jest.fn().mockResolvedValue(mockRotas),
      });

      let emVoo = 0;
      let picoEmVoo = 0;
      notificarVisitaMock.mockImplementation(async () => {
        emVoo += 1;
        picoEmVoo = Math.max(picoEmVoo, emVoo);
        await new Promise((resolve) => setImmediate(resolve));
        emVoo -= 1;
        return {} as never;
      });

      await RotaService.createRotas(5, mockRotas.map((r) => r.ID_OFICINA));

      expect(notificarVisitaMock).toHaveBeenCalledTimes(12);
      expect(picoEmVoo).toBeGreaterThan(1);
      expect(picoEmVoo).toBeLessThanOrEqual(5);
    });

    it('still returns the created route when the notification rejects', async () => {
      const mockRota = { ID_ROTA_PROMOTOR: 11, ID_CAMPANHA_PROMOTOR: 5, ID_OFICINA: 100 };
      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue({
        create: jest.fn().mockReturnValue(mockRota),
        save: jest.fn().mockResolvedValue(mockRota),
      });
      notificarVisitaMock.mockRejectedValue(new Error('notificação falhou'));

      const resultado = await RotaService.createRotas(5, 100);

      expect(resultado).toEqual(mockRota);
    });
  });

  describe('createRotaWithCampanhaPromotor', () => {
    const mockCampanhaPromotor = { ID_CAMPANHA_PROMOTOR: 1 };
    const mockRotas = [
      { ID_ROTA_PROMOTOR: 21, ID_OFICINA: 100 },
      { ID_ROTA_PROMOTOR: 22, ID_OFICINA: 200 },
    ];

    function montarTransacao() {
      const manager = {
        create: jest.fn((entity, data) =>
          entity === CampanhaPromotor ? mockCampanhaPromotor : data
        ),
        save: jest.fn(async (data) =>
          Array.isArray(data) ? mockRotas : mockCampanhaPromotor
        ),
      };
      (AppDataSourceSync.transaction as jest.Mock) = jest.fn(async (callback) =>
        callback(manager)
      );
    }

    it('notifies once per route created inside the transaction', async () => {
      montarTransacao();

      await RotaService.createRotaWithCampanhaPromotor(10, 20, [100, 200]);

      expect(notificarVisitaMock).toHaveBeenCalledTimes(2);
      expect(notificarVisitaMock).toHaveBeenCalledWith(mockRotas[0], expect.anything());
      expect(notificarVisitaMock).toHaveBeenCalledWith(mockRotas[1], expect.anything());
    });

    it('still returns the created routes when the notification rejects', async () => {
      montarTransacao();
      notificarVisitaMock.mockRejectedValue(new Error('notificação falhou'));

      const resultado = await RotaService.createRotaWithCampanhaPromotor(10, 20, [100, 200]);

      expect(resultado).toEqual({
        campanhaPromotor: mockCampanhaPromotor,
        rotas: mockRotas,
      });
    });
  });

  describe('updateRotaWorkshops', () => {
    const novaRota = { ID_ROTA_PROMOTOR: 31, ID_CAMPANHA_PROMOTOR: 5, ID_OFICINA: 300 };

    function montarRepo() {
      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue({
        find: jest.fn().mockResolvedValue([
          { ID_ROTA_PROMOTOR: 30, ID_OFICINA: 100 },
        ]),
        create: jest.fn((data) => data),
        save: jest.fn().mockResolvedValue([novaRota]),
        softDelete: jest.fn().mockResolvedValue(undefined),
      });
    }

    it('notifies each route added by editing the campaign', async () => {
      montarRepo();

      const resultado = await RotaService.updateRotaWorkshops(5, [100, 300]);

      expect(resultado.created).toEqual([novaRota]);
      expect(notificarVisitaMock).toHaveBeenCalledTimes(1);
      expect(notificarVisitaMock).toHaveBeenCalledWith(novaRota, expect.anything());
    });

    it('does not notify when no new workshop was added', async () => {
      montarRepo();

      await RotaService.updateRotaWorkshops(5, [100]);

      expect(notificarVisitaMock).not.toHaveBeenCalled();
    });

    it('still returns the created routes when the notification rejects', async () => {
      montarRepo();
      notificarVisitaMock.mockRejectedValue(new Error('notificação falhou'));

      const resultado = await RotaService.updateRotaWorkshops(5, [100, 300]);

      expect(resultado.created).toEqual([novaRota]);
      expect(resultado.deleted).toEqual([]);
    });
  });
});

// NOTIF-19 (P2 AC1, AC2): "WHEN the dashboard requests route details for a
// RotaPromotor THEN the system SHALL include the linked NotificacaoVisita
// STATUS and CONFIRMADO_EM (if set) in the response." The status must be the
// *effective* one (spec AC22) — derived via statusEfetivo(), never the raw
// stored column — so an unopened expired link never reads as still ENVIADO.
describe('RotaService.getRotaByIdWithRelations — visit confirmation status', () => {
  function montarRepo(findOneResult: unknown) {
    const findOne = jest.fn().mockResolvedValue(findOneResult);
    (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue({
      findOne,
    });
    return findOne;
  }

  it("adds 'notificacaoVisita' to the relations array passed to findOne", async () => {
    const findOne = montarRepo({ ID_ROTA_PROMOTOR: 1 });

    await RotaService.getRotaByIdWithRelations(1);

    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        relations: expect.arrayContaining(['notificacaoVisita']),
      })
    );
  });

  it('reports EXPIRADO — not the stored ENVIADO — for an unopened expired notification', async () => {
    montarRepo({
      ID_ROTA_PROMOTOR: 1,
      notificacaoVisita: {
        STATUS: StatusNotificacaoVisita.ENVIADO,
        EXPIRA_EM: new Date('2020-01-01T00:00:00Z'), // long past
      },
    });

    const rota = await RotaService.getRotaByIdWithRelations(1);

    expect(rota!.notificacaoVisita!.STATUS).toBe(StatusNotificacaoVisita.EXPIRADO);
  });

  it('leaves a still-valid ENVIADO status unchanged', async () => {
    const futuro = new Date(Date.now() + 1000 * 60 * 60);
    montarRepo({
      ID_ROTA_PROMOTOR: 1,
      notificacaoVisita: {
        STATUS: StatusNotificacaoVisita.ENVIADO,
        EXPIRA_EM: futuro,
      },
    });

    const rota = await RotaService.getRotaByIdWithRelations(1);

    expect(rota!.notificacaoVisita!.STATUS).toBe(StatusNotificacaoVisita.ENVIADO);
  });

  it('includes CONFIRMADO_EM on the returned notificacaoVisita when set', async () => {
    const confirmadoEm = new Date('2026-02-01T10:00:00Z');
    montarRepo({
      ID_ROTA_PROMOTOR: 1,
      notificacaoVisita: {
        STATUS: StatusNotificacaoVisita.CONFIRMADO,
        EXPIRA_EM: new Date('2020-01-01T00:00:00Z'),
        CONFIRMADO_EM: confirmadoEm,
      },
    });

    const rota = await RotaService.getRotaByIdWithRelations(1);

    expect(rota!.notificacaoVisita!.CONFIRMADO_EM).toBe(confirmadoEm);
    // CONFIRMADO past its expiry must stay CONFIRMADO, not flip to EXPIRADO.
    expect(rota!.notificacaoVisita!.STATUS).toBe(StatusNotificacaoVisita.CONFIRMADO);
  });

  it('degrades gracefully — no throw — for a route with no notification row', async () => {
    montarRepo({ ID_ROTA_PROMOTOR: 1, notificacaoVisita: undefined });

    await expect(RotaService.getRotaByIdWithRelations(1)).resolves.toEqual({
      ID_ROTA_PROMOTOR: 1,
      notificacaoVisita: undefined,
    });
  });

  it('returns null without throwing when the route itself is not found', async () => {
    montarRepo(null);

    await expect(RotaService.getRotaByIdWithRelations(999)).resolves.toBeNull();
  });
});
