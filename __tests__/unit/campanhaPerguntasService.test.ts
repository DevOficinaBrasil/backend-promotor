import CampanhaPerguntasService from '../../service/campanhaPerguntasService';
import { AppDataSourceSync } from '../../data-source';
import CampanhaPerguntas from '../../entities/CampanhaPerguntas';

jest.mock('../../data-source');

describe('CampanhaPerguntasService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getPerguntasByCampanhaId', () => {
    it('should return all perguntas for a specific campanha', async () => {
      const campanhaId = 1;
      const mockPerguntas = [
        {
          ID_PERGUNTAS: 1,
          ID_CAMPANHA: campanhaId,
          PERGUNTA: 'Qual é a sua opinião?',
          TIPO: 'String',
          CREATED_AT: new Date('2026-01-01'),
          UPDATED_AT: new Date('2026-01-01'),
        },
        {
          ID_PERGUNTAS: 2,
          ID_CAMPANHA: campanhaId,
          PERGUNTA: 'Quantas unidades?',
          TIPO: 'Integer',
          CREATED_AT: new Date('2026-01-02'),
          UPDATED_AT: new Date('2026-01-02'),
        },
      ];

      const mockRepository = {
        find: jest.fn().mockResolvedValue(mockPerguntas),
      };

      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(mockRepository);

      const result = await CampanhaPerguntasService.getPerguntasByCampanhaId(campanhaId);

      expect(AppDataSourceSync.getRepository).toHaveBeenCalledWith(CampanhaPerguntas);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { ID_CAMPANHA: campanhaId },
        order: {
          CREATED_AT: 'ASC',
        },
      });
      expect(result).toEqual(mockPerguntas);
      expect(result).toHaveLength(2);
    });

    it('should return empty array if no perguntas found for campanha', async () => {
      const campanhaId = 999;
      const mockPerguntas: CampanhaPerguntas[] = [];

      const mockRepository = {
        find: jest.fn().mockResolvedValue(mockPerguntas),
      };

      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(mockRepository);

      const result = await CampanhaPerguntasService.getPerguntasByCampanhaId(campanhaId);

      expect(AppDataSourceSync.getRepository).toHaveBeenCalledWith(CampanhaPerguntas);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { ID_CAMPANHA: campanhaId },
        order: {
          CREATED_AT: 'ASC',
        },
      });
      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });
});
