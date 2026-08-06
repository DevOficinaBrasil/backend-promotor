import CampanhaService from '../../service/campanhaService';
import { MigrationAwareRepository, queryBothAndMerge } from '../../utils/migrationRepository';
import { AppDataSourceSync } from '../../data-source';
import { createMockRepo } from '../helpers/mockMigrationRepo';
import Campanha from '../../entities/Campanha';
import CampanhaPromotor from '../../entities/CampanhaPromotor';
import RotaPromotor from '../../entities/RotaPromotor';

jest.mock('../../data-source');
jest.mock('../../utils/migrationRepository');
jest.mock('../../utils/duckdbClient');

describe('CampanhaService', () => {
  const campanhaRepo = createMockRepo();
  const cpRepo = createMockRepo();
  const rotaRepo = createMockRepo();
  const mockDirectRepo = {
    create: jest.fn((data: any) => data),
    save: jest.fn((data: any) => Promise.resolve(data)),
    find: jest.fn(),
    findOne: jest.fn(),
    softDelete: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (MigrationAwareRepository as jest.Mock).mockImplementation((entity: any) => {
      if (entity === Campanha) return campanhaRepo;
      if (entity === CampanhaPromotor) return cpRepo;
      if (entity === RotaPromotor) return rotaRepo;
      return createMockRepo();
    });
    (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(mockDirectRepo);
  });

  describe('createCampanha', () => {
    it('should create campaign without promotores', async () => {
      campanhaRepo.save.mockResolvedValue({ ID_CAMPANHA: 1, NOME: 'Test' });

      const result = await CampanhaService.createCampanha({ NOME: 'Test' });

      expect(result.ID_CAMPANHA).toBe(1);
      expect(campanhaRepo.create).toHaveBeenCalled();
    });

    it('should create campaign with promotores and oficinas', async () => {
      campanhaRepo.save.mockResolvedValue({ ID_CAMPANHA: 1, NOME: 'Test' });
      mockDirectRepo.save.mockResolvedValue({ ID_CAMPANHA_PROMOTOR: 10 });

      await CampanhaService.createCampanha(
        { NOME: 'Test' },
        [{ ID_PROMOTOR: 5, ID_OFICINAS: [100, 200] }]
      );

      expect(mockDirectRepo.save).toHaveBeenCalled();
    });
  });

  describe('updateCampanha', () => {
    it('should return null when campaign not found', async () => {
      campanhaRepo.findOne.mockResolvedValue(null);

      const result = await CampanhaService.updateCampanha(999, { NOME: 'X' });

      expect(result).toBeNull();
    });

    it('should update campaign fields', async () => {
      campanhaRepo.findOne.mockResolvedValue({ ID_CAMPANHA: 1, NOME: 'Old' });
      campanhaRepo.save.mockResolvedValue({ ID_CAMPANHA: 1, NOME: 'New' });

      const result = await CampanhaService.updateCampanha(1, { NOME: 'New' });

      expect(result!.NOME).toBe('New');
    });

    it('should replace promotores when provided', async () => {
      campanhaRepo.findOne.mockResolvedValue({ ID_CAMPANHA: 1, NOME: 'Test' });
      campanhaRepo.save.mockResolvedValue({ ID_CAMPANHA: 1, NOME: 'Test' });
      // removePromotoresFromCampanha
      mockDirectRepo.find.mockResolvedValue([]);
      // linkPromotoresToCampanha
      mockDirectRepo.save.mockResolvedValue({ ID_CAMPANHA_PROMOTOR: 10 });

      await CampanhaService.updateCampanha(
        1, { NOME: 'Test' }, [{ ID_PROMOTOR: 5, ID_OFICINAS: [100] }]
      );

      expect(campanhaRepo.save).toHaveBeenCalled();
    });
  });

  describe('deleteCampanha', () => {
    it('should soft delete and return', async () => {
      campanhaRepo.findOne.mockResolvedValue({ ID_CAMPANHA: 1 });

      const result = await CampanhaService.deleteCampanha(1);

      expect(result).toEqual({ ID_CAMPANHA: 1 });
      expect(campanhaRepo.softDelete).toHaveBeenCalledWith(1);
    });

    it('should return null when not found', async () => {
      campanhaRepo.findOne.mockResolvedValue(null);
      expect(await CampanhaService.deleteCampanha(999)).toBeNull();
    });
  });

  describe('findCampanhaById', () => {
    it('should find by ID', async () => {
      campanhaRepo.findOne.mockResolvedValue({ ID_CAMPANHA: 1 });
      expect(await CampanhaService.findCampanhaById(1)).toEqual({ ID_CAMPANHA: 1 });
    });

    it('should return null when not found', async () => {
      campanhaRepo.findOne.mockResolvedValue(null);
      expect(await CampanhaService.findCampanhaById(999)).toBeNull();
    });
  });

  describe('getAllCampanhas', () => {
    it('should return ordered list', async () => {
      campanhaRepo.find.mockResolvedValue([{ ID_CAMPANHA: 1 }, { ID_CAMPANHA: 2 }]);

      const result = await CampanhaService.getAllCampanhas();

      expect(result).toHaveLength(2);
      expect(campanhaRepo.find).toHaveBeenCalledWith(expect.objectContaining({
        order: { CREATED_AT: 'DESC' },
      }));
    });
  });

  describe('getCampanhaByIdWithRelations', () => {
    it('should load deep relations', async () => {
      campanhaRepo.findOne.mockResolvedValue({ ID_CAMPANHA: 1, campanhaPromotores: [] });

      await CampanhaService.getCampanhaByIdWithRelations(1);

      expect(campanhaRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({
        where: { ID_CAMPANHA: 1 },
        relations: expect.arrayContaining(['campanhaPromotores', 'campanhaPerguntas']),
      }));
    });
  });

  describe('getActiveCampanhaByPromotor', () => {
    it('should return null when no active campaign', async () => {
      cpRepo.find.mockResolvedValue([]);

      const result = await CampanhaService.getActiveCampanhaByPromotor(10);

      expect(result).toBeNull();
    });

    it('should return campaign with rotas when active', async () => {
      const now = new Date('2026-06-15');
      cpRepo.find.mockResolvedValue([{
        ID_CAMPANHA_PROMOTOR: 1,
        ID_PROMOTOR: 10,
        DELETED_AT: null,
        ESTRATEGIA_ORDENACAO: 'PROXIMIDADE_PROMOTOR',
        campanha: {
          ID_CAMPANHA: 1,
          NOME: 'Active',
          START_TIME: new Date('2026-01-01'),
          END_TIME: new Date('2026-12-31'),
        },
      }]);
      (queryBothAndMerge as jest.Mock).mockResolvedValue([
        { ID_ROTA_PROMOTOR: 1, ID_OFICINA: 100, ID_CAMPANHA_PROMOTOR: 1, STATUS: 'BACKLOG', NOME_FANTASIA: 'Ofc A' },
      ]);

      const result = await CampanhaService.getActiveCampanhaByPromotor(10, now);

      expect(result).not.toBeNull();
      expect(result!.NOME).toBe('Active');
      expect(result!.rotas).toHaveLength(1);
    });
  });

  describe('getCampanhasByClientId', () => {
    it('should return empty when no campaigns', async () => {
      (queryBothAndMerge as jest.Mock).mockResolvedValue([]);

      const result = await CampanhaService.getCampanhasByClientId(100);

      expect(result).toEqual([]);
    });

    it('should return assembled nested structure', async () => {
      (queryBothAndMerge as jest.Mock)
        .mockResolvedValueOnce([{ ID_CAMPANHA: 1, NOME: 'Test', ID_CLIENT: 100 }]) // campanhas
        .mockResolvedValueOnce([]) // campanhaPromotores
        .mockResolvedValueOnce([]); // perguntas

      const result = await CampanhaService.getCampanhasByClientId(100);

      expect(result).toHaveLength(1);
      expect(result[0].ID_CAMPANHA).toBe(1);
    });
  });
});
