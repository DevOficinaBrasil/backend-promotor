import CampanhaPerguntasService from '../../service/campanhaPerguntasService';
import { MigrationAwareRepository } from '../../utils/migrationRepository';
import { createMockRepo } from '../helpers/mockMigrationRepo';
import CampanhaPerguntas from '../../entities/CampanhaPerguntas';
import CampanhaPerguntaOpcao from '../../entities/CampanhaPerguntaOpcao';
import Campanha from '../../entities/Campanha';

jest.mock('../../data-source');
jest.mock('../../utils/migrationRepository');

describe('CampanhaPerguntasService', () => {
  const perguntaRepo = createMockRepo();
  const opcaoRepo = createMockRepo();
  const campanhaRepo = createMockRepo();

  beforeEach(() => {
    jest.clearAllMocks();
    (MigrationAwareRepository as jest.Mock).mockImplementation((entity: any) => {
      if (entity === CampanhaPerguntas) return perguntaRepo;
      if (entity === CampanhaPerguntaOpcao) return opcaoRepo;
      if (entity === Campanha) return campanhaRepo;
      return createMockRepo();
    });
  });

  describe('createCampanhaPergunta', () => {
    it('should create a simple pergunta', async () => {
      campanhaRepo.findOne.mockResolvedValue({ ID_CAMPANHA: 1 });
      perguntaRepo.save.mockResolvedValue({ ID_PERGUNTAS: 1, PERGUNTA: 'Test?', ID_CAMPANHA: 1 });

      const result = await CampanhaPerguntasService.createCampanhaPergunta({
        PERGUNTA: 'Test?', ID_CAMPANHA: 1,
      });

      expect(result.ID_PERGUNTAS).toBe(1);
      expect(perguntaRepo.create).toHaveBeenCalled();
      expect(perguntaRepo.save).toHaveBeenCalled();
    });

    it('should create pergunta with opcoes', async () => {
      campanhaRepo.findOne.mockResolvedValue({ ID_CAMPANHA: 1 });
      perguntaRepo.save.mockResolvedValue({ ID_PERGUNTAS: 1, PERGUNTA: 'Pick one', ID_CAMPANHA: 1 });
      opcaoRepo.saveMany.mockResolvedValue([
        { ID_OPCAO: 1, LABEL: 'A', ORDEM: 1 },
        { ID_OPCAO: 2, LABEL: 'B', ORDEM: 2 },
      ]);

      const result = await CampanhaPerguntasService.createCampanhaPergunta(
        { PERGUNTA: 'Pick one', ID_CAMPANHA: 1 },
        [{ LABEL: 'A', ORDEM: 1 }, { LABEL: 'B', ORDEM: 2 }]
      );

      expect(result.opcoes).toHaveLength(2);
      expect(opcaoRepo.create).toHaveBeenCalledTimes(2);
    });

    it('should throw when campanha does not exist', async () => {
      campanhaRepo.findOne.mockResolvedValue(null);

      await expect(CampanhaPerguntasService.createCampanhaPergunta({ PERGUNTA: 'Test?', ID_CAMPANHA: 999 }))
        .rejects.toThrow('Campanha não encontrada.');
    });

    it('should skip campanha validation when ID_CAMPANHA not provided', async () => {
      perguntaRepo.save.mockResolvedValue({ ID_PERGUNTAS: 1, PERGUNTA: 'Test?' });

      await CampanhaPerguntasService.createCampanhaPergunta({ PERGUNTA: 'Test?' });

      expect(campanhaRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('updateCampanhaPergunta', () => {
    it('should update fields', async () => {
      perguntaRepo.findOne.mockResolvedValue({ ID_PERGUNTAS: 1, PERGUNTA: 'Old' });
      perguntaRepo.save.mockResolvedValue({ ID_PERGUNTAS: 1, PERGUNTA: 'New' });

      const result = await CampanhaPerguntasService.updateCampanhaPergunta(1, { PERGUNTA: 'New' });

      expect(result!.PERGUNTA).toBe('New');
    });

    it('should return null when not found', async () => {
      perguntaRepo.findOne.mockResolvedValue(null);
      expect(await CampanhaPerguntasService.updateCampanhaPergunta(999, {})).toBeNull();
    });

    it('should replace opcoes', async () => {
      perguntaRepo.findOne.mockResolvedValue({ ID_PERGUNTAS: 1 });
      perguntaRepo.save.mockResolvedValue({ ID_PERGUNTAS: 1 });
      opcaoRepo.saveMany.mockResolvedValue([{ LABEL: 'New', ORDEM: 1 }]);

      const result = await CampanhaPerguntasService.updateCampanhaPergunta(
        1, {}, [{ LABEL: 'New', ORDEM: 1 }]
      );

      expect(opcaoRepo.softDelete).toHaveBeenCalled();
      expect(result!.opcoes).toHaveLength(1);
    });

    it('should clear opcoes when empty array provided', async () => {
      perguntaRepo.findOne.mockResolvedValue({ ID_PERGUNTAS: 1 });
      perguntaRepo.save.mockResolvedValue({ ID_PERGUNTAS: 1 });

      const result = await CampanhaPerguntasService.updateCampanhaPergunta(1, {}, []);

      expect(result!.opcoes).toEqual([]);
    });

    it('should throw when updating to non-existent campanha', async () => {
      perguntaRepo.findOne.mockResolvedValue({ ID_PERGUNTAS: 1 });
      campanhaRepo.findOne.mockResolvedValue(null);

      await expect(CampanhaPerguntasService.updateCampanhaPergunta(1, { ID_CAMPANHA: 999 }))
        .rejects.toThrow('Campanha não encontrada.');
    });
  });

  describe('deleteCampanhaPergunta', () => {
    it('should soft delete and return', async () => {
      perguntaRepo.findOne.mockResolvedValue({ ID_PERGUNTAS: 1 });

      const result = await CampanhaPerguntasService.deleteCampanhaPergunta(1);

      expect(result).toEqual({ ID_PERGUNTAS: 1 });
      expect(perguntaRepo.softDelete).toHaveBeenCalledWith(1);
    });

    it('should return null when not found', async () => {
      perguntaRepo.findOne.mockResolvedValue(null);
      expect(await CampanhaPerguntasService.deleteCampanhaPergunta(999)).toBeNull();
    });
  });

  describe('findCampanhaPerguntaById', () => {
    it('should find with opcoes relation', async () => {
      perguntaRepo.findOne.mockResolvedValue({ ID_PERGUNTAS: 1, opcoes: [] });

      const result = await CampanhaPerguntasService.findCampanhaPerguntaById(1);

      expect(result).toBeTruthy();
      expect(perguntaRepo.findOne).toHaveBeenCalledWith({
        where: { ID_PERGUNTAS: 1 }, relations: ['opcoes'],
      });
    });

    it('should return null when not found', async () => {
      perguntaRepo.findOne.mockResolvedValue(null);
      expect(await CampanhaPerguntasService.findCampanhaPerguntaById(999)).toBeNull();
    });
  });

  describe('getAllCampanhaPerguntas', () => {
    it('should return list with relations ordered DESC', async () => {
      perguntaRepo.find.mockResolvedValue([{ ID_PERGUNTAS: 1 }]);

      const result = await CampanhaPerguntasService.getAllCampanhaPerguntas();

      expect(result).toHaveLength(1);
      expect(perguntaRepo.find).toHaveBeenCalledWith(expect.objectContaining({
        relations: ['campanha', 'opcoes'], order: { CREATED_AT: 'DESC' },
      }));
    });
  });

  describe('getPerguntasByCampanhaId', () => {
    it('should return perguntas ordered ASC with opcoes', async () => {
      perguntaRepo.find.mockResolvedValue([{ ID_PERGUNTAS: 1, ID_CAMPANHA: 5 }]);

      const result = await CampanhaPerguntasService.getPerguntasByCampanhaId(5);

      expect(result).toHaveLength(1);
      expect(perguntaRepo.find).toHaveBeenCalledWith(expect.objectContaining({
        where: { ID_CAMPANHA: 5 }, relations: ['opcoes'], order: { CREATED_AT: 'ASC' },
      }));
    });

    it('should return empty when none found', async () => {
      perguntaRepo.find.mockResolvedValue([]);
      expect(await CampanhaPerguntasService.getPerguntasByCampanhaId(999)).toEqual([]);
    });
  });
});
