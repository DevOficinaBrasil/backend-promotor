import CampanhaPromotorService from '../../service/campanhaPromotorService';
import { AppDataSourceSync } from '../../data-source';
import { createMockRepo } from '../helpers/mockRepo';
import CampanhaPromotor from '../../entities/CampanhaPromotor';

jest.mock('../../data-source');

describe('CampanhaPromotorService', () => {
  const mockRepo = createMockRepo();

  beforeEach(() => {
    jest.clearAllMocks();
    (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(mockRepo);
  });

  describe('linkCampanhaPromotor', () => {
    it('should link single campaign to promotor with default RAIO', async () => {
      mockRepo.find.mockResolvedValue([]);
      mockRepo.save.mockResolvedValue([{ 
        ID_CAMPANHA_PROMOTOR: 1, 
        ID_CAMPANHA: 10, 
        ID_PROMOTOR: 5, 
        RAIO: 20,
        FILTRO_SEGMENTACAO: null, 
      }]);

      const result = await CampanhaPromotorService.linkCampanhaPromotor(10, 5);

      expect(result).toHaveLength(1);
      expect(mockRepo.create).toHaveBeenCalledWith({ ID_CAMPANHA: 10, ID_PROMOTOR: 5, RAIO: 20, FILTRO_SEGMENTACAO: null });
    });

    it('should link multiple campaigns', async () => {
      mockRepo.find.mockResolvedValue([]);
      mockRepo.save.mockResolvedValue([
        { ID_CAMPANHA: 10, ID_PROMOTOR: 5 },
        { ID_CAMPANHA: 20, ID_PROMOTOR: 5 },
      ]);

      const result = await CampanhaPromotorService.linkCampanhaPromotor([10, 20], 5);

      expect(result).toHaveLength(2);
      expect(mockRepo.create).toHaveBeenCalledTimes(2);
    });

    it('should not create duplicates', async () => {
      mockRepo.find.mockResolvedValue([{ ID_CAMPANHA: 10, ID_PROMOTOR: 5 }]);

      const result = await CampanhaPromotorService.linkCampanhaPromotor(10, 5);

      expect(result).toEqual([]);
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('should use provided RAIO', async () => {
      mockRepo.find.mockResolvedValue([]);
      mockRepo.save.mockResolvedValue([{ RAIO: 50 }]);

      await CampanhaPromotorService.linkCampanhaPromotor(10, 5, 50);

      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ RAIO: 50 }));
    });

    it('should handle empty array input', async () => {
      mockRepo.find.mockResolvedValue([]);

      const result = await CampanhaPromotorService.linkCampanhaPromotor([], 5);

      expect(result).toEqual([]);
    });
  });

  describe('updateRaio', () => {
    it('should update RAIO when relationship exists', async () => {
      const existing = { ID_CAMPANHA_PROMOTOR: 1, RAIO: 20 };
      mockRepo.findOne.mockResolvedValue(existing);
      mockRepo.save.mockResolvedValue({ ...existing, RAIO: 50 });

      const result = await CampanhaPromotorService.updateRaio(1, 50);

      expect(result).toBeTruthy();
      expect(mockRepo.save).toHaveBeenCalled();
    });

    it('should return null when relationship not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const result = await CampanhaPromotorService.updateRaio(999, 50);

      expect(result).toBeNull();
    });
  });

  describe('unlinkCampanhaPromotor', () => {
    it('should remove relationship', async () => {
      const existing = { ID_CAMPANHA_PROMOTOR: 1 };
      mockRepo.findOne.mockResolvedValue(existing);
      mockRepo.remove.mockResolvedValue(existing);

      const result = await CampanhaPromotorService.unlinkCampanhaPromotor(1);

      expect(result).toHaveLength(1);
      expect(mockRepo.remove).toHaveBeenCalledWith(existing);
    });

    it('should return empty array when not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const result = await CampanhaPromotorService.unlinkCampanhaPromotor(999);

      expect(result).toEqual([]);
    });
  });

  describe('getCampanhasByPromotor', () => {
    it('should return campaign IDs', async () => {
      mockRepo.find.mockResolvedValue([
        { ID_CAMPANHA: 10 },
        { ID_CAMPANHA: 20 },
      ]);

      const result = await CampanhaPromotorService.getCampanhasByPromotor(5);

      expect(result).toEqual([10, 20]);
    });

    it('should return empty array when no campaigns', async () => {
      mockRepo.find.mockResolvedValue([]);

      const result = await CampanhaPromotorService.getCampanhasByPromotor(999);

      expect(result).toEqual([]);
    });
  });
});
