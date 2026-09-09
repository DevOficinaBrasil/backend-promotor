import OficinaService from '../../service/oficinaService';
import { AppDataSourceSync } from '../../data-source';

jest.mock('../../data-source');

describe('OficinaService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findNearestOficinas', () => {
    it('should return oficinas with distance and default flags', async () => {
      const mockResults = [
        { ID_OFICINA: 1, NOME_FANTASIA: 'Oficina A', distance: 5.2 },
        { ID_OFICINA: 2, NOME_FANTASIA: 'Oficina B', distance: 10.1 },
      ];
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue(mockResults);

      const result = await OficinaService.findNearestOficinas(-23.55, -46.63);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        ID_OFICINA: 1,
        flag_engajamento: 'neutro',
        flag_sentimento: 'neutro',
        flag_treinamento: 'neutro',
        cor_icone: 'cinza',
      });
      expect(AppDataSourceSync.query).toHaveBeenCalledWith(
        expect.stringContaining('cadastro_empresa'),
        [-23.55, -46.63, 70]
      );
    });

    it('should respect custom limit', async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([]);

      await OficinaService.findNearestOficinas(-23.55, -46.63, 10);

      expect(AppDataSourceSync.query).toHaveBeenCalledWith(
        expect.any(String),
        [-23.55, -46.63, 10]
      );
    });

    it('should rethrow database errors', async () => {
      (AppDataSourceSync.query as jest.Mock).mockRejectedValue(new Error('DB error'));

      await expect(OficinaService.findNearestOficinas(-23.55, -46.63))
        .rejects.toThrow('DB error');
    });
  });

  describe('getComunityNearbyOficinas', () => {
    it('should return oficinas filtered by radius and slug', async () => {
      const mockResults = [
        { ID_OFICINA: 1, distance: 8.5 },
      ];
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue(mockResults);

      const result = await OficinaService.getComunityNearbyOficinas(-23.55, -46.63, 20, 'empresa-test');

      expect(result).toEqual(mockResults);
      expect(AppDataSourceSync.query).toHaveBeenCalledWith(
        expect.stringContaining('COMMUNITIES'),
        ['empresa-test', -23.55, -46.63, 20]
      );
    });

    it('should return empty array when no oficinas in range', async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([]);

      const result = await OficinaService.getComunityNearbyOficinas(-23.55, -46.63, 1, 'slug');

      expect(result).toEqual([]);
    });

    it('should rethrow database errors', async () => {
      (AppDataSourceSync.query as jest.Mock).mockRejectedValue(new Error('DB error'));

      await expect(OficinaService.getComunityNearbyOficinas(-23.55, -46.63, 20, 'slug'))
        .rejects.toThrow('DB error');
    });

    it('should include the OFICINA_IMPORTADA branch so oficinas linked without a user are considered (IMPORT-20)', async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([]);

      await OficinaService.getComunityNearbyOficinas(-23.55, -46.63, 20, 'empresa-test');

      expect(AppDataSourceSync.query).toHaveBeenCalledWith(
        expect.stringContaining('OFICINA_IMPORTADA'),
        ['empresa-test', -23.55, -46.63, 20]
      );
    });
  });

  describe('getCommunityOficinas', () => {
    it('should list oficinas for the given slug', async () => {
      const mockResults = [{ ID_OFICINA: 1 }];
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue(mockResults);

      const result = await OficinaService.getCommunityOficinas('empresa-test');

      expect(result).toEqual(mockResults);
      expect(AppDataSourceSync.query).toHaveBeenCalledWith(
        expect.stringContaining('COMMUNITIES'),
        ['empresa-test']
      );
    });

    it('should include the OFICINA_IMPORTADA branch so oficinas linked without a user are considered (IMPORT-20)', async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([]);

      await OficinaService.getCommunityOficinas('empresa-test');

      expect(AppDataSourceSync.query).toHaveBeenCalledWith(
        expect.stringContaining('OFICINA_IMPORTADA'),
        ['empresa-test']
      );
    });

    it('should rethrow database errors', async () => {
      (AppDataSourceSync.query as jest.Mock).mockRejectedValue(new Error('DB error'));

      await expect(OficinaService.getCommunityOficinas('empresa-test')).rejects.toThrow(
        'DB error'
      );
    });
  });

  describe('countCommunityOficinas', () => {
    it('should return the total count for the given slug', async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([{ total: 7 }]);

      const result = await OficinaService.countCommunityOficinas('empresa-test');

      expect(result).toBe(7);
      expect(AppDataSourceSync.query).toHaveBeenCalledWith(
        expect.stringContaining('COMMUNITIES'),
        ['empresa-test']
      );
    });

    it('should return 0 when the query returns no rows', async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([]);

      const result = await OficinaService.countCommunityOficinas('empresa-test');

      expect(result).toBe(0);
    });

    it('should include the OFICINA_IMPORTADA branch so oficinas linked without a user are counted (IMPORT-20)', async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([{ total: 0 }]);

      await OficinaService.countCommunityOficinas('empresa-test');

      expect(AppDataSourceSync.query).toHaveBeenCalledWith(
        expect.stringContaining('OFICINA_IMPORTADA'),
        ['empresa-test']
      );
    });

    it('should rethrow database errors', async () => {
      (AppDataSourceSync.query as jest.Mock).mockRejectedValue(new Error('DB error'));

      await expect(OficinaService.countCommunityOficinas('empresa-test')).rejects.toThrow(
        'DB error'
      );
    });
  });
});
