import CampanhaResultsService from '../../service/campanhaResultsService';
import { AppDataSourceSync } from '../../data-source';
import { createMockRepo } from '../helpers/mockRepo';
import CampanhaResults from '../../entities/CampanhaResults';
import RotaPromotor from '../../entities/RotaPromotor';
import CampanhaPerguntas from '../../entities/CampanhaPerguntas';

jest.mock('../../data-source');

describe('CampanhaResultsService', () => {
  const resultRepo = createMockRepo();
  const rotaRepo = createMockRepo();
  const perguntaRepo = createMockRepo();

  beforeEach(() => {
    jest.clearAllMocks();
    (AppDataSourceSync.getRepository as jest.Mock).mockImplementation((entity: any) => {
      if (entity === CampanhaResults) return resultRepo;
      if (entity === RotaPromotor) return rotaRepo;
      if (entity === CampanhaPerguntas) return perguntaRepo;
      return createMockRepo();
    });
  });

  describe('saveOrUpdateResult', () => {
    it('should create new result when none exists', async () => {
      rotaRepo.findOne.mockResolvedValue({ ID_ROTA_PROMOTOR: 10 });
      perguntaRepo.findOne.mockResolvedValue({ ID_PERGUNTAS: 5 });
      resultRepo.findOne.mockResolvedValue(null);
      resultRepo.save.mockResolvedValue({ ID_CAMPANHA_RESULTS: 1, ID_ROTA: 10, ID_PERGUNTA: 5, RESPOSTA: 'Test' });

      const result = await CampanhaResultsService.saveOrUpdateResult({
        ID_ROTA: 10, ID_PERGUNTA: 5, RESPOSTA: 'Test',
      });

      expect(result.ID_CAMPANHA_RESULTS).toBe(1);
      expect(resultRepo.create).toHaveBeenCalled();
    });

    it('should update existing result', async () => {
      rotaRepo.findOne.mockResolvedValue({ ID_ROTA_PROMOTOR: 10 });
      perguntaRepo.findOne.mockResolvedValue({ ID_PERGUNTAS: 5 });
      resultRepo.findOne.mockResolvedValue({ ID_CAMPANHA_RESULTS: 1, ID_ROTA: 10, ID_PERGUNTA: 5, RESPOSTA: 'Old' });
      resultRepo.save.mockResolvedValue({ ID_CAMPANHA_RESULTS: 1, RESPOSTA: 'Updated' });

      const result = await CampanhaResultsService.saveOrUpdateResult({
        ID_ROTA: 10, ID_PERGUNTA: 5, RESPOSTA: 'Updated',
      });

      expect(result.RESPOSTA).toBe('Updated');
      expect(resultRepo.create).not.toHaveBeenCalled();
    });

    it('should throw when rota not found', async () => {
      rotaRepo.findOne.mockResolvedValue(null);

      await expect(CampanhaResultsService.saveOrUpdateResult({ ID_ROTA: 999, RESPOSTA: 'X' }))
        .rejects.toThrow('Rota não encontrada.');
    });

    it('should throw when pergunta not found', async () => {
      rotaRepo.findOne.mockResolvedValue({ ID_ROTA_PROMOTOR: 10 });
      perguntaRepo.findOne.mockResolvedValue(null);

      await expect(CampanhaResultsService.saveOrUpdateResult({ ID_ROTA: 10, ID_PERGUNTA: 999, RESPOSTA: 'X' }))
        .rejects.toThrow('Pergunta não encontrada.');
    });
  });

  describe('updateResult', () => {
    it('should update existing result', async () => {
      resultRepo.findOne.mockResolvedValue({ ID_CAMPANHA_RESULTS: 1, RESPOSTA: 'Old' });
      resultRepo.save.mockResolvedValue({ ID_CAMPANHA_RESULTS: 1, RESPOSTA: 'New' });

      const result = await CampanhaResultsService.updateResult(1, { RESPOSTA: 'New' });

      expect(result!.RESPOSTA).toBe('New');
    });

    it('should return null when not found', async () => {
      resultRepo.findOne.mockResolvedValue(null);
      expect(await CampanhaResultsService.updateResult(999, { RESPOSTA: 'X' })).toBeNull();
    });

    it('should validate rota on update', async () => {
      resultRepo.findOne.mockResolvedValue({ ID_CAMPANHA_RESULTS: 1 });
      rotaRepo.findOne.mockResolvedValue(null);

      await expect(CampanhaResultsService.updateResult(1, { ID_ROTA: 999 }))
        .rejects.toThrow('Rota não encontrada.');
    });

    it('should validate pergunta on update', async () => {
      resultRepo.findOne.mockResolvedValue({ ID_CAMPANHA_RESULTS: 1 });
      perguntaRepo.findOne.mockResolvedValue(null);

      await expect(CampanhaResultsService.updateResult(1, { ID_PERGUNTA: 999 }))
        .rejects.toThrow('Pergunta não encontrada.');
    });
  });

  describe('findResultById', () => {
    it('should find with relations', async () => {
      resultRepo.findOne.mockResolvedValue({ ID_CAMPANHA_RESULTS: 1 });

      await CampanhaResultsService.findResultById(1);

      expect(resultRepo.findOne).toHaveBeenCalledWith({
        where: { ID_CAMPANHA_RESULTS: 1 }, relations: ['rota', 'pergunta'],
      });
    });

    it('should return null when not found', async () => {
      resultRepo.findOne.mockResolvedValue(null);
      expect(await CampanhaResultsService.findResultById(999)).toBeNull();
    });
  });

  describe('getResultsByRotaId', () => {
    it('should return results ordered DESC', async () => {
      resultRepo.find.mockResolvedValue([{ ID_CAMPANHA_RESULTS: 1 }]);

      const results = await CampanhaResultsService.getResultsByRotaId(10);

      expect(results).toHaveLength(1);
      expect(resultRepo.find).toHaveBeenCalledWith(expect.objectContaining({
        where: { ID_ROTA: 10 }, relations: ['rota', 'pergunta'],
      }));
    });

    it('should return empty when none found', async () => {
      resultRepo.find.mockResolvedValue([]);
      expect(await CampanhaResultsService.getResultsByRotaId(999)).toEqual([]);
    });
  });

  describe('getResultsByCampanhaId', () => {
    it('should query with joins', async () => {
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([{ ID_CAMPANHA_RESULTS: 1 }]),
      };
      resultRepo.createQueryBuilder.mockReturnValue(mockQb);

      const results = await CampanhaResultsService.getResultsByCampanhaId(5);

      expect(results).toHaveLength(1);
      expect(resultRepo.createQueryBuilder).toHaveBeenCalledWith('result');
      expect(mockQb.where).toHaveBeenCalledWith(
        'campanhaPromotor.ID_CAMPANHA = :campanhaId', { campanhaId: 5 }
      );
    });

    it('should return empty when none found', async () => {
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      resultRepo.createQueryBuilder.mockReturnValue(mockQb);

      expect(await CampanhaResultsService.getResultsByCampanhaId(999)).toEqual([]);
    });
  });
});
