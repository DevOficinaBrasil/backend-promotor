import RotaService from '../../service/rotaService';
import { AppDataSourceSync } from '../../data-source';
import CampanhaPromotor from '../../entities/CampanhaPromotor';
import NotificacaoVisitaService from '../../service/notificacaoVisitaService';
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
  const agendarVisitaMock = NotificacaoVisitaService.agendarVisita as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    agendarVisitaMock.mockResolvedValue({} as never);
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createRotas', () => {
    it('queues the single created route', async () => {
      const mockRota = { ID_ROTA_PROMOTOR: 11, ID_CAMPANHA_PROMOTOR: 5, ID_OFICINA: 100 };
      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue({
        create: jest.fn().mockReturnValue(mockRota),
        save: jest.fn().mockResolvedValue(mockRota),
      });

      await RotaService.createRotas(5, 100);

      expect(agendarVisitaMock).toHaveBeenCalledTimes(1);
      expect(agendarVisitaMock).toHaveBeenCalledWith(mockRota, 0, 1);
    });

    it('queues once per route created in a batch', async () => {
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

      expect(agendarVisitaMock).toHaveBeenCalledTimes(3);
      expect(agendarVisitaMock).toHaveBeenCalledWith(mockRotas[0], 0, 3);
      expect(agendarVisitaMock).toHaveBeenCalledWith(mockRotas[1], 1, 3);
      expect(agendarVisitaMock).toHaveBeenCalledWith(mockRotas[2], 2, 3);
    });

    // Every route of a large batch is queued, with no pool bounding the work:
    // enqueue is one insert, so the concurrency limit that used to guard a
    // request full of 10s provider calls has nothing left to guard (AGND-01).
    it('queues every route of a large batch', async () => {
      const mockRotas = Array.from({ length: 12 }, (_, i) => ({
        ID_ROTA_PROMOTOR: i + 1,
        ID_OFICINA: 100 + i,
      }));
      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue({
        create: jest.fn((data) => data),
        save: jest.fn().mockResolvedValue(mockRotas),
      });

      await RotaService.createRotas(5, mockRotas.map((r) => r.ID_OFICINA));

      expect(agendarVisitaMock).toHaveBeenCalledTimes(12);
      expect(agendarVisitaMock).toHaveBeenCalledWith(mockRotas[11], 11, 12);
    });

    it('still returns the created route when the notification rejects', async () => {
      const mockRota = { ID_ROTA_PROMOTOR: 11, ID_CAMPANHA_PROMOTOR: 5, ID_OFICINA: 100 };
      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue({
        create: jest.fn().mockReturnValue(mockRota),
        save: jest.fn().mockResolvedValue(mockRota),
      });
      agendarVisitaMock.mockRejectedValue(new Error('notificação falhou'));

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

    it('queues once per route created inside the transaction', async () => {
      montarTransacao();

      await RotaService.createRotaWithCampanhaPromotor(10, 20, [100, 200]);

      expect(agendarVisitaMock).toHaveBeenCalledTimes(2);
      expect(agendarVisitaMock).toHaveBeenCalledWith(mockRotas[0], 0, 2);
      expect(agendarVisitaMock).toHaveBeenCalledWith(mockRotas[1], 1, 2);
    });

    it('still returns the created routes when the notification rejects', async () => {
      montarTransacao();
      agendarVisitaMock.mockRejectedValue(new Error('notificação falhou'));

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

    it('queues each route added by editing the campaign', async () => {
      montarRepo();

      const resultado = await RotaService.updateRotaWorkshops(5, [100, 300]);

      expect(resultado.created).toEqual([novaRota]);
      expect(agendarVisitaMock).toHaveBeenCalledTimes(1);
      expect(agendarVisitaMock).toHaveBeenCalledWith(novaRota, 0, 1);
    });

    it('does not queue when no new workshop was added', async () => {
      montarRepo();

      await RotaService.updateRotaWorkshops(5, [100]);

      expect(agendarVisitaMock).not.toHaveBeenCalled();
    });

    it('still returns the created routes when the notification rejects', async () => {
      montarRepo();
      agendarVisitaMock.mockRejectedValue(new Error('notificação falhou'));

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
