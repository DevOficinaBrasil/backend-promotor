import CampanhaPromotorService from '../../service/campanhaPromotorService';
import { MigrationAwareRepository } from '../../utils/migrationRepository';
import { AppDataSourceSync } from '../../data-source';
import { createMockRepo } from '../helpers/mockMigrationRepo';

jest.mock('../../data-source');
jest.mock('../../utils/migrationRepository');

describe('CampanhaPromotorService - Segmentação', () => {
  const mockRepo = createMockRepo();
  const mockDirectRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (MigrationAwareRepository as jest.Mock).mockImplementation(() => mockRepo);
    (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(mockDirectRepo);
  });

  describe('linkCampanhaPromotor with FILTRO_SEGMENTACAO', () => {
    const filtro = {
      if: { behavior: { section: 'LEAD_DATA', criterion: 'LEAD_FIELD', value: { fieldKey: 'gender', fieldType: 'text', operator: 'EQUALS', value: 'Masculino' } } },
      then: { decision: 'include', reason: 'matched' },
      default: { decision: 'exclude', reason: 'default' },
    };

    it('should persist FILTRO_SEGMENTACAO when provided', async () => {
      mockRepo.find.mockResolvedValue([]);
      mockRepo.saveMany.mockResolvedValue([{ ID_CAMPANHA_PROMOTOR: 1, FILTRO_SEGMENTACAO: filtro }]);

      await CampanhaPromotorService.linkCampanhaPromotor(10, 5, 20, filtro);

      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        FILTRO_SEGMENTACAO: filtro,
      }));
    });

    it('should set FILTRO_SEGMENTACAO to null when not provided', async () => {
      mockRepo.find.mockResolvedValue([]);
      mockRepo.saveMany.mockResolvedValue([{ ID_CAMPANHA_PROMOTOR: 1 }]);

      await CampanhaPromotorService.linkCampanhaPromotor(10, 5, 20);

      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        FILTRO_SEGMENTACAO: null,
      }));
    });

    it('should set FILTRO_SEGMENTACAO to null when explicitly null', async () => {
      mockRepo.find.mockResolvedValue([]);
      mockRepo.saveMany.mockResolvedValue([{ ID_CAMPANHA_PROMOTOR: 1 }]);

      await CampanhaPromotorService.linkCampanhaPromotor(10, 5, 20, null);

      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        FILTRO_SEGMENTACAO: null,
      }));
    });
  });

  describe('updateFiltroSegmentacao', () => {
    const filtro = {
      if: { behavior: { section: 'LEAD_DATA', criterion: 'LEAD_FIELD', value: { fieldKey: 'gender', fieldType: 'text', operator: 'EQUALS', value: 'Feminino' } } },
      then: { decision: 'include', reason: 'matched' },
      default: { decision: 'exclude', reason: 'default' },
    };

    it('should update filter on existing relationship', async () => {
      const existing = { ID_CAMPANHA_PROMOTOR: 1, FILTRO_SEGMENTACAO: null };
      mockDirectRepo.findOne.mockResolvedValue(existing);
      mockDirectRepo.save.mockResolvedValue({ ...existing, FILTRO_SEGMENTACAO: filtro });

      const result = await CampanhaPromotorService.updateFiltroSegmentacao(1, filtro);

      expect(result).toBeTruthy();
      expect(existing.FILTRO_SEGMENTACAO).toEqual(filtro);
      expect(mockDirectRepo.save).toHaveBeenCalledWith(existing);
    });

    it('should set filter to null to remove it', async () => {
      const existing = { ID_CAMPANHA_PROMOTOR: 1, FILTRO_SEGMENTACAO: { some: 'filter' } };
      mockDirectRepo.findOne.mockResolvedValue(existing);
      mockDirectRepo.save.mockResolvedValue({ ...existing, FILTRO_SEGMENTACAO: null });

      const result = await CampanhaPromotorService.updateFiltroSegmentacao(1, null);

      expect(result).toBeTruthy();
      expect(existing.FILTRO_SEGMENTACAO).toBeNull();
    });

    it('should return null when relationship not found', async () => {
      mockDirectRepo.findOne.mockResolvedValue(null);

      const result = await CampanhaPromotorService.updateFiltroSegmentacao(999, filtro);

      expect(result).toBeNull();
      expect(mockDirectRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('getFiltroSegmentacao', () => {
    it('should return filter and empresaSlug', async () => {
      const filtro = { if: { behavior: {} }, then: {}, default: {} };
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([{
        FILTRO_SEGMENTACAO: filtro,
        EMPRESA_SLUG: 'minha-empresa',
      }]);

      const result = await CampanhaPromotorService.getFiltroSegmentacao(1);

      expect(result).toEqual({
        filtro,
        empresaSlug: 'minha-empresa',
      });
    });

    it('should return null when relationship not found', async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([]);

      const result = await CampanhaPromotorService.getFiltroSegmentacao(999);

      expect(result).toBeNull();
    });

    it('should return null filtro when column is null', async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([{
        FILTRO_SEGMENTACAO: null,
        EMPRESA_SLUG: 'slug',
      }]);

      const result = await CampanhaPromotorService.getFiltroSegmentacao(1);

      expect(result!.filtro).toBeNull();
      expect(result!.empresaSlug).toBe('slug');
    });
  });
});
