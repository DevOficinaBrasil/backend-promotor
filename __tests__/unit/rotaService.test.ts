import RotaService from '../../service/rotaService';
import { MigrationAwareRepository } from '../../utils/migrationRepository';
import { AppDataSourceSync } from '../../data-source';
import { createMockRepo } from '../helpers/mockMigrationRepo';
import RotaPromotor, { StatusRota } from '../../entities/RotaPromotor';
import CampanhaPromotor, { EstrategiaOrdenacao } from '../../entities/CampanhaPromotor';

jest.mock('../../data-source');
jest.mock('../../utils/migrationRepository');
jest.mock('../../utils/routeOptimizer', () => ({
  optimizeRoute: jest.fn().mockReturnValue({
    order: [{ id: 1, ordem: 1, id_oficina: 100 }],
    totalDistanceKm: 10,
  }),
  fetchOSRMRoute: jest.fn().mockResolvedValue({ distanceKm: 10, geometry: null }),
}));
jest.mock('../../service/geolocationService', () => {
  return jest.fn().mockImplementation(() => ({
    getLatLongByCep: jest.fn().mockResolvedValue({ lat: -25.43, long: -49.27 }),
  }));
});
jest.mock('../../utils/haversine', () => ({
  haversineDistanceKm: jest.fn().mockReturnValue(350),
}));

describe('RotaService', () => {
  const rotaRepo = createMockRepo();
  const cpRepo = createMockRepo();

  beforeEach(() => {
    jest.clearAllMocks();
    (MigrationAwareRepository as jest.Mock).mockImplementation((entity: any) => {
      if (entity === RotaPromotor) return rotaRepo;
      if (entity === CampanhaPromotor) return cpRepo;
      return createMockRepo();
    });
  });

  describe('createRotas', () => {
    it('should create single route', async () => {
      rotaRepo.save.mockResolvedValue({ ID_ROTA_PROMOTOR: 1, ID_CAMPANHA_PROMOTOR: 5, ID_OFICINA: 100 });

      const result = await RotaService.createRotas(5, 100);

      expect(rotaRepo.create).toHaveBeenCalledWith({ ID_CAMPANHA_PROMOTOR: 5, ID_OFICINA: 100, CREATED_BY: undefined });
      expect(result).toHaveProperty('ID_ROTA_PROMOTOR', 1);
    });

    it('should create batch routes', async () => {
      rotaRepo.saveMany.mockResolvedValue([
        { ID_ROTA_PROMOTOR: 1, ID_OFICINA: 100 },
        { ID_ROTA_PROMOTOR: 2, ID_OFICINA: 200 },
      ]);

      const result = await RotaService.createRotas(5, [100, 200]);

      expect(rotaRepo.create).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });
  });

  describe('createRotaWithCampanhaPromotor', () => {
    it('should use transaction', async () => {
      const mockManager = {
        create: jest.fn().mockReturnValue({ ID_CAMPANHA_PROMOTOR: 1 }),
        save: jest.fn()
          .mockResolvedValueOnce({ ID_CAMPANHA_PROMOTOR: 1 })
          .mockResolvedValueOnce([{ ID_ROTA_PROMOTOR: 1 }]),
      };
      (AppDataSourceSync.transaction as jest.Mock).mockImplementation((cb: Function) => cb(mockManager));

      const result = await RotaService.createRotaWithCampanhaPromotor(10, 20, [100]);

      expect(AppDataSourceSync.transaction).toHaveBeenCalled();
      expect(result.campanhaPromotor).toBeTruthy();
      expect(result.rotas).toBeTruthy();
    });
  });

  describe('updateRotaWorkshops', () => {
    it('should add new and remove old workshops', async () => {
      rotaRepo.find.mockResolvedValue([
        { ID_ROTA_PROMOTOR: 1, ID_OFICINA: 100, DELETED_AT: null },
        { ID_ROTA_PROMOTOR: 2, ID_OFICINA: 200, DELETED_AT: null },
      ]);
      rotaRepo.saveMany.mockResolvedValue([{ ID_ROTA_PROMOTOR: 3, ID_OFICINA: 300 }]);

      const result = await RotaService.updateRotaWorkshops(1, [100, 300]);

      // 200 should be deleted, 300 should be created
      expect(rotaRepo.softDelete).toHaveBeenCalled();
      expect(result.created).toHaveLength(1);
      expect(result.deleted).toHaveLength(1);
    });

    it('should handle no changes needed', async () => {
      rotaRepo.find.mockResolvedValue([
        { ID_ROTA_PROMOTOR: 1, ID_OFICINA: 100, DELETED_AT: null },
      ]);

      const result = await RotaService.updateRotaWorkshops(1, [100]);

      expect(result.created).toEqual([]);
      expect(result.deleted).toEqual([]);
    });
  });

  describe('updateRotaOptions', () => {
    it('should update options', async () => {
      rotaRepo.findOne.mockResolvedValue({ ID_ROTA_PROMOTOR: 1, STATUS: 'BACKLOG' });
      rotaRepo.save.mockResolvedValue({ ID_ROTA_PROMOTOR: 1, STATUS: 'FINALIZADO' });

      const result = await RotaService.updateRotaOptions(1, { STATUS: StatusRota.FINALIZADO });

      expect(result!.STATUS).toBe('FINALIZADO');
    });

    it('should return null when not found', async () => {
      rotaRepo.findOne.mockResolvedValue(null);
      expect(await RotaService.updateRotaOptions(999, {})).toBeNull();
    });
  });

  describe('findRotaById', () => {
    it('should find by ID', async () => {
      rotaRepo.findOne.mockResolvedValue({ ID_ROTA_PROMOTOR: 1 });
      expect(await RotaService.findRotaById(1)).toEqual({ ID_ROTA_PROMOTOR: 1 });
    });

    it('should return null when not found', async () => {
      rotaRepo.findOne.mockResolvedValue(null);
      expect(await RotaService.findRotaById(999)).toBeNull();
    });
  });

  describe('getOficinasAssignedInCampanha', () => {
    it('should return oficina IDs', async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([
        { ID_OFICINA: 100 }, { ID_OFICINA: 200 },
      ]);

      const result = await RotaService.getOficinasAssignedInCampanha(1);

      expect(result).toEqual([100, 200]);
    });

    it('should return empty array', async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([]);
      expect(await RotaService.getOficinasAssignedInCampanha(999)).toEqual([]);
    });
  });

  describe('reorderRotas', () => {
    it('should reorder manually', async () => {
      rotaRepo.find.mockResolvedValue([{ ID_ROTA_PROMOTOR: 1 }]);
      cpRepo.update.mockResolvedValue(undefined);
      rotaRepo.update.mockResolvedValue(undefined);
      // After reorder, return updated
      rotaRepo.find.mockResolvedValueOnce([{ ID_ROTA_PROMOTOR: 1 }])
        .mockResolvedValueOnce([{ ID_ROTA_PROMOTOR: 1, ORDEM: 1, ID_OFICINA: 100 }]);

      const result = await RotaService.reorderRotas(1, EstrategiaOrdenacao.MANUAL, [
        { ID_ROTA_PROMOTOR: 1, ORDEM: 1 },
      ]);

      expect(result.ESTRATEGIA_ORDENACAO).toBe(EstrategiaOrdenacao.MANUAL);
    });

    it('should throw when manual without array', async () => {
      rotaRepo.find.mockResolvedValue([{ ID_ROTA_PROMOTOR: 1 }]);

      await expect(RotaService.reorderRotas(1, EstrategiaOrdenacao.MANUAL))
        .rejects.toThrow('Estratégia MANUAL exige array de rotas com ORDEM.');
    });

    it('should clear ORDEM for PROXIMIDADE_PROMOTOR', async () => {
      rotaRepo.find.mockResolvedValue([{ ID_ROTA_PROMOTOR: 1, ORDEM: 5 }]);
      cpRepo.update.mockResolvedValue(undefined);
      rotaRepo.update.mockResolvedValue(undefined);
      rotaRepo.find.mockResolvedValueOnce([{ ID_ROTA_PROMOTOR: 1, ORDEM: 5 }])
        .mockResolvedValueOnce([{ ID_ROTA_PROMOTOR: 1, ORDEM: null, ID_OFICINA: 100 }]);

      const result = await RotaService.reorderRotas(1, EstrategiaOrdenacao.PROXIMIDADE_PROMOTOR);

      expect(rotaRepo.update).toHaveBeenCalledWith(1, { ORDEM: undefined });
      expect(result.ESTRATEGIA_ORDENACAO).toBe(EstrategiaOrdenacao.PROXIMIDADE_PROMOTOR);
    });
  });

  describe('removeCampanhaPromotorRota', () => {
    it('should hard delete all rotas', async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue(undefined);

      await RotaService.removeCampanhaPromotorRota(1);

      expect(AppDataSourceSync.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM'),
        [1]
      );
    });
  });

  describe('reassignRotasByAddress', () => {
    const { haversineDistanceKm } = require('../../utils/haversine');

    it('should throw NOT_FOUND when no active routes', async () => {
      rotaRepo.find.mockResolvedValue([]);

      await expect(RotaService.reassignRotasByAddress('80010-000', 123))
        .rejects.toThrow('NOT_FOUND');
    });

    it('should keep route when within radius', async () => {
      haversineDistanceKm.mockReturnValue(10); // within default 20km

      rotaRepo.find.mockResolvedValue([{
        ID_ROTA_PROMOTOR: 1,
        ID_OFICINA: 123,
        STATUS: StatusRota.BACKLOG,
        campanhaPromotor: {
          ID_CAMPANHA: 1,
          ID_CAMPANHA_PROMOTOR: 10,
          RAIO: 20,
          promotor: { ID_PROMOTOR: 5, NOME: 'João', LATITUDE: '-23.55', LONGITUDE: '-46.63' },
        },
      }]);
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([]);

      const result = await RotaService.reassignRotasByAddress('80010-000', 123);

      expect(result.reatribuicoes[0].status).toBe('mantida_dentro_do_raio');
    });

    it('should reassign when out of radius with available candidate', async () => {
      haversineDistanceKm
        .mockReturnValueOnce(350)  // current promotor distance (out of range)
        .mockReturnValueOnce(15);  // candidate distance (in range)

      rotaRepo.find.mockResolvedValue([{
        ID_ROTA_PROMOTOR: 1,
        ID_OFICINA: 123,
        STATUS: StatusRota.BACKLOG,
        campanhaPromotor: {
          ID_CAMPANHA: 1,
          ID_CAMPANHA_PROMOTOR: 10,
          RAIO: 20,
          promotor: { ID_PROMOTOR: 5, NOME: 'João', LATITUDE: '-23.55', LONGITUDE: '-46.63' },
        },
      }]);
      // getCandidatosPorCampanhas
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([
        { ID_CAMPANHA_PROMOTOR: 20, ID_CAMPANHA: 1, ID_PROMOTOR: 8, NOME: 'Maria', RAIO: 20, LATITUDE: '-25.43', LONGITUDE: '-49.27' },
      ]);
      // transaction
      const mockManager = {
        softDelete: jest.fn(),
        create: jest.fn().mockReturnValue({ ID_CAMPANHA_PROMOTOR: 20, ID_OFICINA: 123 }),
        save: jest.fn().mockResolvedValue({ ID_ROTA_PROMOTOR: 99 }),
      };
      (AppDataSourceSync.transaction as jest.Mock).mockImplementation((cb: Function) => cb(mockManager));

      const result = await RotaService.reassignRotasByAddress('80010-000', 123);

      expect(result.reatribuicoes[0].status).toBe('reatribuida');
      expect(result.reatribuicoes[0].promotor_novo!.ID_PROMOTOR).toBe(8);
      expect(result.resumo.reatribuidas).toBe(1);
    });

    it('should report sem_promotor_disponivel when no candidate in range', async () => {
      haversineDistanceKm.mockReturnValue(350); // all out of range

      rotaRepo.find.mockResolvedValue([{
        ID_ROTA_PROMOTOR: 1,
        ID_OFICINA: 123,
        STATUS: StatusRota.BACKLOG,
        campanhaPromotor: {
          ID_CAMPANHA: 1,
          ID_CAMPANHA_PROMOTOR: 10,
          RAIO: 20,
          promotor: { ID_PROMOTOR: 5, NOME: 'João', LATITUDE: '-23.55', LONGITUDE: '-46.63' },
        },
      }]);
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([]);

      const result = await RotaService.reassignRotasByAddress('80010-000', 123);

      expect(result.reatribuicoes[0].status).toBe('sem_promotor_disponivel');
    });
  });
});
