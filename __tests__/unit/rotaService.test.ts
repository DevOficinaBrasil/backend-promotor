import RotaService from '../../service/rotaService';
import { AppDataSourceSync } from '../../data-source';
import RotaPromotor from '../../entities/RotaPromotor';
import CampanhaPromotor from '../../entities/CampanhaPromotor';
import NotificacaoVisitaService from '../../service/notificacaoVisitaService';

jest.mock('../../data-source');
jest.mock('../../service/notificacaoVisitaService');

describe('RotaService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createRotaWithCampanhaPromotor', () => {
    it('should create a campaign promoter and multiple routes', async () => {
      const mockCampanhaPromotor = {
        ID_CAMPANHA_PROMOTOR: 1,
        ID_PROMOTOR: 10,
        ID_CAMPANHA: 20,
      };

      const mockRotas = [
        {
          ID_ROTA_PROMOTOR: 1,
          ID_CAMPANHA_PROMOTOR: 1,
          ID_OFICINA: 100,
          CREATED_BY: 5,
        },
        {
          ID_ROTA_PROMOTOR: 2,
          ID_CAMPANHA_PROMOTOR: 1,
          ID_OFICINA: 200,
          CREATED_BY: 5,
        },
        {
          ID_ROTA_PROMOTOR: 3,
          ID_CAMPANHA_PROMOTOR: 1,
          ID_OFICINA: 300,
          CREATED_BY: 5,
        },
      ];

      const mockTransactionalEntityManager = {
        create: jest.fn((entity, data) => {
          if (entity === CampanhaPromotor) return mockCampanhaPromotor;
          return { ...data, ID_ROTA_PROMOTOR: Math.random() };
        }),
        save: jest.fn((data) => {
          if (Array.isArray(data)) return Promise.resolve(mockRotas);
          return Promise.resolve(mockCampanhaPromotor);
        }),
      };

      (AppDataSourceSync.transaction as jest.Mock) = jest.fn(async (callback) => {
        return await callback(mockTransactionalEntityManager);
      });

      const result = await RotaService.createRotaWithCampanhaPromotor(
        10, // ID_PROMOTOR
        20, // ID_CAMPANHA
        [100, 200, 300], // ID_OFICINA array
        5 // CREATED_BY
      );

      expect(result).toEqual({
        campanhaPromotor: mockCampanhaPromotor,
        rotas: mockRotas,
      });

      // Verify transaction was called
      expect(AppDataSourceSync.transaction).toHaveBeenCalled();

      // Verify CampanhaPromotor creation
      expect(mockTransactionalEntityManager.create).toHaveBeenCalledWith(CampanhaPromotor, {
        ID_PROMOTOR: 10,
        ID_CAMPANHA: 20,
      });

      // Verify Rota creation
      expect(mockTransactionalEntityManager.create).toHaveBeenCalledWith(RotaPromotor, {
        ID_CAMPANHA_PROMOTOR: 1,
        ID_OFICINA: 100,
        CREATED_BY: 5,
      });
      expect(mockTransactionalEntityManager.create).toHaveBeenCalledWith(RotaPromotor, {
        ID_CAMPANHA_PROMOTOR: 1,
        ID_OFICINA: 200,
        CREATED_BY: 5,
      });
      expect(mockTransactionalEntityManager.create).toHaveBeenCalledWith(RotaPromotor, {
        ID_CAMPANHA_PROMOTOR: 1,
        ID_OFICINA: 300,
        CREATED_BY: 5,
      });
    });

    it('should create a campaign promoter and single route without CREATED_BY', async () => {
      const mockCampanhaPromotor = {
        ID_CAMPANHA_PROMOTOR: 2,
        ID_PROMOTOR: 15,
        ID_CAMPANHA: 25,
      };

      const mockRotas = [
        {
          ID_ROTA_PROMOTOR: 4,
          ID_CAMPANHA_PROMOTOR: 2,
          ID_OFICINA: 150,
        },
      ];

      const mockTransactionalEntityManager = {
        create: jest.fn((entity, data) => {
          if (entity === CampanhaPromotor) return mockCampanhaPromotor;
          return { ...data, ID_ROTA_PROMOTOR: 4 };
        }),
        save: jest.fn((data) => {
          if (Array.isArray(data)) return Promise.resolve(mockRotas);
          return Promise.resolve(mockCampanhaPromotor);
        }),
      };

      (AppDataSourceSync.transaction as jest.Mock) = jest.fn(async (callback) => {
        return await callback(mockTransactionalEntityManager);
      });

      const result = await RotaService.createRotaWithCampanhaPromotor(
        15, // ID_PROMOTOR
        25, // ID_CAMPANHA
        [150] // ID_OFICINA array with single item
      );

      expect(result).toEqual({
        campanhaPromotor: mockCampanhaPromotor,
        rotas: mockRotas,
      });

      // Verify transaction was called
      expect(AppDataSourceSync.transaction).toHaveBeenCalled();

      // Verify CampanhaPromotor creation
      expect(mockTransactionalEntityManager.create).toHaveBeenCalledWith(CampanhaPromotor, {
        ID_PROMOTOR: 15,
        ID_CAMPANHA: 25,
      });

      // Verify Rota creation without CREATED_BY
      expect(mockTransactionalEntityManager.create).toHaveBeenCalledWith(RotaPromotor, {
        ID_CAMPANHA_PROMOTOR: 2,
        ID_OFICINA: 150,
        CREATED_BY: undefined,
      });
    });
  });

  describe('createRotas', () => {
    it('should create a single route', async () => {
      const mockRota = {
        ID_ROTA_PROMOTOR: 1,
        ID_CAMPANHA_PROMOTOR: 5,
        ID_OFICINA: 100,
        CREATED_BY: 10,
      };

      const mockRepository = {
        create: jest.fn().mockReturnValue(mockRota),
        save: jest.fn().mockResolvedValue(mockRota),
      };

      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(mockRepository);

      const result = await RotaService.createRotas(5, 100, 10);

      expect(result).toEqual(mockRota);
      expect(mockRepository.create).toHaveBeenCalledWith({
        ID_CAMPANHA_PROMOTOR: 5,
        ID_OFICINA: 100,
        CREATED_BY: 10,
      });
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should create multiple routes with array of oficina IDs', async () => {
      const mockRotas = [
        { ID_ROTA_PROMOTOR: 1, ID_CAMPANHA_PROMOTOR: 5, ID_OFICINA: 100 },
        { ID_ROTA_PROMOTOR: 2, ID_CAMPANHA_PROMOTOR: 5, ID_OFICINA: 200 },
      ];

      const mockRepository = {
        create: jest.fn((data) => ({ ...data, ID_ROTA_PROMOTOR: Math.random() })),
        save: jest.fn().mockResolvedValue(mockRotas),
      };

      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(mockRepository);

      const result = await RotaService.createRotas(5, [100, 200]);

      expect(result).toEqual(mockRotas);
      expect(mockRepository.create).toHaveBeenCalledTimes(2);
      expect(mockRepository.save).toHaveBeenCalled();
    });
  });
});

// Spec AC1: "WHEN a new RotaPromotor record is created THEN the system SHALL
// create exactly one NotificacaoVisita record ... linked to that
// ID_ROTA_PROMOTOR" — which covers all three creation paths, including
// updateRotaWorkshops.
// Spec AC10: "IF the RotaPromotor creation transaction succeeds but the
// notification dispatch throws ... THEN the system SHALL still return the
// created RotaPromotor successfully."
describe('RotaService visit notification hook', () => {
  const notificarVisitaMock = NotificacaoVisitaService.notificarVisita as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
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
      expect(notificarVisitaMock).toHaveBeenCalledWith(mockRota);
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
      expect(notificarVisitaMock).toHaveBeenCalledWith(mockRotas[0]);
      expect(notificarVisitaMock).toHaveBeenCalledWith(mockRotas[1]);
      expect(notificarVisitaMock).toHaveBeenCalledWith(mockRotas[2]);
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
      expect(notificarVisitaMock).toHaveBeenCalledWith(mockRotas[0]);
      expect(notificarVisitaMock).toHaveBeenCalledWith(mockRotas[1]);
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
      expect(notificarVisitaMock).toHaveBeenCalledWith(novaRota);
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
