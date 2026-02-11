import CampanhaResultsService from '../../service/campanhaResultsService';
import { AppDataSourceSync } from '../../data-source';
import CampanhaResults from '../../entities/CampanhaResults';
import RotaPromotor from '../../entities/RotaPromotor';
import CampanhaPerguntas from '../../entities/CampanhaPerguntas';

jest.mock('../../data-source');

describe('CampanhaResultsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('saveOrUpdateResult', () => {
    it('should create a new result if none exists', async () => {
      const mockResult = {
        ID_CAMPANHA_RESULTS: 1,
        ID_ROTA: 10,
        ID_PERGUNTA: 5,
        RESPOSTA: 'Test answer',
      };

      const mockResultRepository = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockReturnValue(mockResult),
        save: jest.fn().mockResolvedValue(mockResult),
      };

      const mockRotaRepository = {
        findOne: jest.fn().mockResolvedValue({ ID_ROTA_PROMOTOR: 10 }),
      };

      const mockPerguntaRepository = {
        findOne: jest.fn().mockResolvedValue({ ID_PERGUNTAS: 5 }),
      };

      (AppDataSourceSync.getRepository as jest.Mock)
        .mockImplementation((entity) => {
          if (entity === CampanhaResults) return mockResultRepository;
          if (entity === RotaPromotor) return mockRotaRepository;
          if (entity === CampanhaPerguntas) return mockPerguntaRepository;
          return {};
        });

      const resultData = {
        ID_ROTA: 10,
        ID_PERGUNTA: 5,
        RESPOSTA: 'Test answer',
      };

      const result = await CampanhaResultsService.saveOrUpdateResult(resultData);

      expect(result).toEqual(mockResult);
      expect(mockRotaRepository.findOne).toHaveBeenCalledWith({
        where: { ID_ROTA_PROMOTOR: 10 },
      });
      expect(mockPerguntaRepository.findOne).toHaveBeenCalledWith({
        where: { ID_PERGUNTAS: 5 },
      });
      expect(mockResultRepository.create).toHaveBeenCalledWith(resultData);
      expect(mockResultRepository.save).toHaveBeenCalled();
    });

    it('should update existing result if one exists', async () => {
      const existingResult = {
        ID_CAMPANHA_RESULTS: 1,
        ID_ROTA: 10,
        ID_PERGUNTA: 5,
        RESPOSTA: 'Old answer',
      };

      const updatedResult = {
        ...existingResult,
        RESPOSTA: 'Updated answer',
      };

      const mockResultRepository = {
        findOne: jest.fn().mockResolvedValue(existingResult),
        create: jest.fn(),
        save: jest.fn().mockResolvedValue(updatedResult),
      };

      const mockRotaRepository = {
        findOne: jest.fn().mockResolvedValue({ ID_ROTA_PROMOTOR: 10 }),
      };

      const mockPerguntaRepository = {
        findOne: jest.fn().mockResolvedValue({ ID_PERGUNTAS: 5 }),
      };

      (AppDataSourceSync.getRepository as jest.Mock)
        .mockImplementation((entity) => {
          if (entity === CampanhaResults) return mockResultRepository;
          if (entity === RotaPromotor) return mockRotaRepository;
          if (entity === CampanhaPerguntas) return mockPerguntaRepository;
          return {};
        });

      const resultData = {
        ID_ROTA: 10,
        ID_PERGUNTA: 5,
        RESPOSTA: 'Updated answer',
      };

      const result = await CampanhaResultsService.saveOrUpdateResult(resultData);

      expect(result).toEqual(updatedResult);
      expect(mockResultRepository.create).not.toHaveBeenCalled();
      expect(mockResultRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ RESPOSTA: 'Updated answer' })
      );
    });

    it('should throw error if rota does not exist', async () => {
      const mockResultRepository = {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      };

      const mockRotaRepository = {
        findOne: jest.fn().mockResolvedValue(null),
      };

      const mockPerguntaRepository = {
        findOne: jest.fn(),
      };

      (AppDataSourceSync.getRepository as jest.Mock)
        .mockImplementation((entity) => {
          if (entity === CampanhaResults) return mockResultRepository;
          if (entity === RotaPromotor) return mockRotaRepository;
          if (entity === CampanhaPerguntas) return mockPerguntaRepository;
          return {};
        });

      const resultData = {
        ID_ROTA: 999,
        ID_PERGUNTA: 5,
        RESPOSTA: 'Test answer',
      };

      await expect(CampanhaResultsService.saveOrUpdateResult(resultData))
        .rejects.toThrow('Rota não encontrada.');
    });

    it('should throw error if pergunta does not exist', async () => {
      const mockResultRepository = {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      };

      const mockRotaRepository = {
        findOne: jest.fn().mockResolvedValue({ ID_ROTA_PROMOTOR: 10 }),
      };

      const mockPerguntaRepository = {
        findOne: jest.fn().mockResolvedValue(null),
      };

      (AppDataSourceSync.getRepository as jest.Mock)
        .mockImplementation((entity) => {
          if (entity === CampanhaResults) return mockResultRepository;
          if (entity === RotaPromotor) return mockRotaRepository;
          if (entity === CampanhaPerguntas) return mockPerguntaRepository;
          return {};
        });

      const resultData = {
        ID_ROTA: 10,
        ID_PERGUNTA: 999,
        RESPOSTA: 'Test answer',
      };

      await expect(CampanhaResultsService.saveOrUpdateResult(resultData))
        .rejects.toThrow('Pergunta não encontrada.');
    });
  });

  describe('updateResult', () => {
    it('should update an existing result by ID', async () => {
      const existingResult = {
        ID_CAMPANHA_RESULTS: 1,
        ID_ROTA: 10,
        ID_PERGUNTA: 5,
        RESPOSTA: 'Old answer',
      };

      const updatedResult = {
        ...existingResult,
        RESPOSTA: 'Updated answer',
      };

      const mockResultRepository = {
        findOne: jest.fn().mockResolvedValue(existingResult),
        save: jest.fn().mockResolvedValue(updatedResult),
      };

      const mockRotaRepository = {
        findOne: jest.fn(),
      };

      const mockPerguntaRepository = {
        findOne: jest.fn(),
      };

      (AppDataSourceSync.getRepository as jest.Mock)
        .mockImplementation((entity) => {
          if (entity === CampanhaResults) return mockResultRepository;
          if (entity === RotaPromotor) return mockRotaRepository;
          if (entity === CampanhaPerguntas) return mockPerguntaRepository;
          return {};
        });

      const result = await CampanhaResultsService.updateResult(1, {
        RESPOSTA: 'Updated answer',
      });

      expect(result).toEqual(updatedResult);
      expect(mockResultRepository.findOne).toHaveBeenCalledWith({
        where: { ID_CAMPANHA_RESULTS: 1 },
      });
      expect(mockResultRepository.save).toHaveBeenCalled();
    });

    it('should return null if result does not exist', async () => {
      const mockResultRepository = {
        findOne: jest.fn().mockResolvedValue(null),
        save: jest.fn(),
      };

      const mockRotaRepository = {
        findOne: jest.fn(),
      };

      const mockPerguntaRepository = {
        findOne: jest.fn(),
      };

      (AppDataSourceSync.getRepository as jest.Mock)
        .mockImplementation((entity) => {
          if (entity === CampanhaResults) return mockResultRepository;
          if (entity === RotaPromotor) return mockRotaRepository;
          if (entity === CampanhaPerguntas) return mockPerguntaRepository;
          return {};
        });

      const result = await CampanhaResultsService.updateResult(999, {
        RESPOSTA: 'Updated answer',
      });

      expect(result).toBeNull();
      expect(mockResultRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('findResultById', () => {
    it('should find a result by ID with relations', async () => {
      const mockResult = {
        ID_CAMPANHA_RESULTS: 1,
        ID_ROTA: 10,
        ID_PERGUNTA: 5,
        RESPOSTA: 'Test answer',
        rota: { ID_ROTA_PROMOTOR: 10 },
        pergunta: { ID_PERGUNTAS: 5 },
      };

      const mockRepository = {
        findOne: jest.fn().mockResolvedValue(mockResult),
      };

      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(mockRepository);

      const result = await CampanhaResultsService.findResultById(1);

      expect(result).toEqual(mockResult);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { ID_CAMPANHA_RESULTS: 1 },
        relations: ['rota', 'pergunta'],
      });
    });

    it('should return null if result not found', async () => {
      const mockRepository = {
        findOne: jest.fn().mockResolvedValue(null),
      };

      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(mockRepository);

      const result = await CampanhaResultsService.findResultById(999);

      expect(result).toBeNull();
    });
  });

  describe('getResultsByRotaId', () => {
    it('should get all results for a rota', async () => {
      const mockResults = [
        {
          ID_CAMPANHA_RESULTS: 1,
          ID_ROTA: 10,
          ID_PERGUNTA: 5,
          RESPOSTA: 'Answer 1',
        },
        {
          ID_CAMPANHA_RESULTS: 2,
          ID_ROTA: 10,
          ID_PERGUNTA: 6,
          RESPOSTA: 'Answer 2',
        },
      ];

      const mockRepository = {
        find: jest.fn().mockResolvedValue(mockResults),
      };

      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(mockRepository);

      const result = await CampanhaResultsService.getResultsByRotaId(10);

      expect(result).toEqual(mockResults);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { ID_ROTA: 10 },
        relations: ['rota', 'pergunta'],
        order: {
          CREATED_AT: 'DESC',
        },
      });
    });

    it('should return empty array if no results found', async () => {
      const mockRepository = {
        find: jest.fn().mockResolvedValue([]),
      };

      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(mockRepository);

      const result = await CampanhaResultsService.getResultsByRotaId(999);

      expect(result).toEqual([]);
    });
  });
});
