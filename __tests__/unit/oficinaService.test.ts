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

    it('should cast every text column on both UNION branches to a common type (Verifier fix: type-mismatch risk)', async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([]);

      await OficinaService.getComunityNearbyOficinas(-23.55, -46.63, 20, 'empresa-test');

      const query = (AppDataSourceSync.query as jest.Mock).mock.calls[0][0] as string;
      const castCount = (query.match(/::text/g) || []).length;
      // 9 text columns (NOME_FANTASIA, ENDERECO, BAIRRO, CIDADE, ESTADO, NUMERO,
      // CEP, CNPJ, TELEFONE) cast on each of the 3 UNION branches (community,
      // OFICINA_IMPORTADA, Ultracar match) = 27. A lower count means at least
      // one column lost its cast on some branch (the exact regression a
      // discrimination-sensor mutation found before this test existed).
      expect(castCount).toBe(27);
    });

    it('should include the Ultracar-match branch so an oficina appears even outside the slug community (ULTRACAR-01/02/04)', async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([]);

      await OficinaService.getComunityNearbyOficinas(-23.55, -46.63, 20, 'empresa-test');

      const query = (AppDataSourceSync.query as jest.Mock).mock.calls[0][0] as string;
      const ultracarBranch = query.slice(query.indexOf('ultracar_process.enterprise__tb_company'));
      expect(query).toContain('ultracar_process.enterprise__tb_company');
      expect(ultracarBranch).not.toContain('EMPRESA_SLUG');
    });

    it('should dedupe the 3 branches by ID_OFICINA via the outer DISTINCT ON (ULTRACAR-04/07)', async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([]);

      await OficinaService.getComunityNearbyOficinas(-23.55, -46.63, 20, 'empresa-test');

      const query = (AppDataSourceSync.query as jest.Mock).mock.calls[0][0] as string;
      expect(query).toMatch(/SELECT DISTINCT ON \("ID_OFICINA"\) \* FROM/);
      expect((query.match(/UNION ALL/g) || []).length).toBe(2);
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

    it('should cast every text column on both UNION branches to a common type (Verifier fix: type-mismatch risk)', async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([]);

      await OficinaService.getCommunityOficinas('empresa-test');

      const query = (AppDataSourceSync.query as jest.Mock).mock.calls[0][0] as string;
      const castCount = (query.match(/::text/g) || []).length;
      expect(castCount).toBe(27);
    });

    it('should include the Ultracar-match branch so an oficina appears even outside the slug community (ULTRACAR-01/02/04)', async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([]);

      await OficinaService.getCommunityOficinas('empresa-test');

      const query = (AppDataSourceSync.query as jest.Mock).mock.calls[0][0] as string;
      const ultracarBranch = query.slice(query.indexOf('ultracar_process.enterprise__tb_company'));
      expect(query).toContain('ultracar_process.enterprise__tb_company');
      expect(ultracarBranch).not.toContain('EMPRESA_SLUG');
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

    it('should count the Ultracar-match branch without duplicating an oficina already in the community (ULTRACAR-01/02/07)', async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([{ total: 3 }]);

      await OficinaService.countCommunityOficinas('empresa-test');

      const query = (AppDataSourceSync.query as jest.Mock).mock.calls[0][0] as string;
      const ultracarBranch = query.slice(query.indexOf('ultracar_process.enterprise__tb_company'));
      expect(query).toContain('ultracar_process.enterprise__tb_company');
      expect(ultracarBranch).not.toContain('EMPRESA_SLUG');
      expect(query).toMatch(/COUNT\(DISTINCT "ID_OFICINA"\)/);
    });

    it('should rethrow database errors', async () => {
      (AppDataSourceSync.query as jest.Mock).mockRejectedValue(new Error('DB error'));

      await expect(OficinaService.countCommunityOficinas('empresa-test')).rejects.toThrow(
        'DB error'
      );
    });
  });

  describe('getCommunityOficinasSegmentadas', () => {
    it('should return an empty array without querying when externalUserIds is empty', async () => {
      const result = await OficinaService.getCommunityOficinasSegmentadas('empresa-test', []);

      expect(result).toEqual([]);
      expect(AppDataSourceSync.query).not.toHaveBeenCalled();
    });

    it('should list oficinas for the given slug and user ids (community branch)', async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([{ ID_OFICINA: 1 }]);

      const result = await OficinaService.getCommunityOficinasSegmentadas('empresa-test', [10, 20]);

      expect(result).toEqual([{ ID_OFICINA: 1 }]);
      expect(AppDataSourceSync.query).toHaveBeenCalledWith(
        expect.stringContaining('COMMUNITIES'),
        ['empresa-test', 10, 20]
      );
    });

    it('should include the Ultracar-match branch, wrapped with the same DISTINCT ON used by the other 3 methods (ULTRACAR-01/02/04)', async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([]);

      await OficinaService.getCommunityOficinasSegmentadas('empresa-test', [10]);

      const query = (AppDataSourceSync.query as jest.Mock).mock.calls[0][0] as string;
      expect(query).toMatch(/SELECT DISTINCT ON \("ID_OFICINA"\) \* FROM/);
      expect((query.match(/UNION ALL/g) || []).length).toBe(1);
      const ultracarBranch = query.slice(query.indexOf('ultracar_process.enterprise__tb_company'));
      expect(query).toContain('ultracar_process.enterprise__tb_company');
      expect(ultracarBranch).not.toContain('EMPRESA_SLUG');
    });

    it('should dedupe an oficina seen in more than one batch (overlap across batches/branches)', async () => {
      const ids = Array.from({ length: 1001 }, (_, i) => i + 1);
      (AppDataSourceSync.query as jest.Mock)
        .mockResolvedValueOnce([{ ID_OFICINA: 1 }, { ID_OFICINA: 2 }])
        .mockResolvedValueOnce([{ ID_OFICINA: 2 }, { ID_OFICINA: 3 }]);

      const result = await OficinaService.getCommunityOficinasSegmentadas('empresa-test', ids);

      expect(AppDataSourceSync.query).toHaveBeenCalledTimes(2);
      expect(result.map((r: any) => r.ID_OFICINA)).toEqual([1, 2, 3]);
    });

    it('should rethrow database errors', async () => {
      (AppDataSourceSync.query as jest.Mock).mockRejectedValue(new Error('DB error'));

      await expect(
        OficinaService.getCommunityOficinasSegmentadas('empresa-test', [10])
      ).rejects.toThrow('DB error');
    });
  });
});
