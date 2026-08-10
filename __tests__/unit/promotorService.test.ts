import PromotorService from '../../service/promotorService';
import { MigrationAwareRepository } from '../../utils/migrationRepository';
import { AppDataSourceSync } from '../../data-source';
import { createMockRepo } from '../helpers/mockMigrationRepo';
import Promotor from '../../entities/Promotor';
import CampanhaPromotor from '../../entities/CampanhaPromotor';
import CampanhaPromotorService from '../../service/campanhaPromotorService';
import OficinaService from '../../service/oficinaService';
import RotaService from '../../service/rotaService';
import Oficina from '../../entities/Oficina';

jest.mock('../../data-source');
jest.mock('../../utils/migrationRepository');
jest.mock('../../utils/encryption', () => ({
  encrypt: jest.fn((pw: string) => `enc_${pw}`),
  decrypt: jest.fn((pw: string) => pw.replace('enc_', '')),
}));
jest.mock('../../service/geolocationService', () => {
  return jest.fn().mockImplementation(() => ({
    getLatLongByCep: jest.fn().mockResolvedValue({ lat: -23.55, long: -46.63 }),
  }));
});
jest.mock('../../service/campanhaPromotorService', () => ({
  __esModule: true,
  default: {
    linkCampanhaPromotor: jest.fn().mockResolvedValue([]),
    unlinkCampanhaPromotor: jest.fn().mockResolvedValue([]),
    getCampanhasByPromotor: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('../../service/oficinaService');
jest.mock('../../service/rotaService', () => ({
  __esModule: true,
  default: {
    getOficinasAssignedInCampanha: jest.fn().mockResolvedValue([]),
    createRotas: jest.fn().mockResolvedValue([]),
    removeCampanhaPromotorRota: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('PromotorService', () => {
  const promotorRepo = createMockRepo();
  const cpRepo = createMockRepo();
  const mockDirectRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (MigrationAwareRepository as jest.Mock).mockImplementation((entity: any) => {
      if (entity === Promotor) return promotorRepo;
      if (entity === CampanhaPromotor) return cpRepo;
      return createMockRepo();
    });
    (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(mockDirectRepo);
  });

  describe('createPromotor', () => {
    it('should create promotor and encrypt password', async () => {
      promotorRepo.save.mockResolvedValue({ ID_PROMOTOR: 1, NOME: 'Test', SENHA: 'enc_pass' });

      const result = await PromotorService.createPromotor({ NOME: 'Test', SENHA: 'pass' });

      expect(result.promotor.SENHA).toBe('enc_pass');
    });

    it('should geocode CEP', async () => {
      promotorRepo.save.mockResolvedValue({
        ID_PROMOTOR: 1, CEP: '01001-000', LATITUDE: '-23.55', LONGITUDE: '-46.63',
      });

      const result = await PromotorService.createPromotor({ NOME: 'Test', CEP: '01001-000' });

      expect(result.promotor.ID_PROMOTOR).toBe(1);
    });

    it('should create without campaigns when none provided', async () => {
      promotorRepo.save.mockResolvedValue({ ID_PROMOTOR: 1, NOME: 'Test' });

      const result = await PromotorService.createPromotor({ NOME: 'Test' });

      expect(result.promotor.ID_PROMOTOR).toBe(1);
      expect(result.autoAssignResult).toBeUndefined();
    });

    // Auto-assign reaches the workshop notification only through
    // RotaService.createRotas, which notifies once per created route
    // (rotaServiceVisita.test.ts). This asserts the link in that chain.
    it('auto-assigns the unassigned nearby oficinas through createRotas', async () => {
      promotorRepo.save.mockResolvedValue({
        ID_PROMOTOR: 1, NOME: 'Test', CEP: '01001-000',
        LATITUDE: '-23.55', LONGITUDE: '-46.63',
      });
      promotorRepo.findOne.mockResolvedValue({
        ID_PROMOTOR: 1, LATITUDE: '-23.55', LONGITUDE: '-46.63',
      });
      (CampanhaPromotorService.linkCampanhaPromotor as jest.Mock).mockResolvedValue([
        { ID_CAMPANHA_PROMOTOR: 7, ID_CAMPANHA: 3, RAIO: 20 },
      ]);
      (OficinaService.getComunityNearbyOficinas as jest.Mock).mockResolvedValue([
        { ID_OFICINA: 100 }, { ID_OFICINA: 200 }, { ID_OFICINA: 300 },
      ]);
      // 200 is already taken by another promotor in this campaign.
      (RotaService.getOficinasAssignedInCampanha as jest.Mock).mockResolvedValue([200]);

      const result = await PromotorService.createPromotor(
        { NOME: 'Test', CEP: '01001-000' }, 3, 20, 'empresa-x'
      );

      expect(RotaService.createRotas).toHaveBeenCalledTimes(1);
      expect(RotaService.createRotas).toHaveBeenCalledWith(7, [100, 300]);
      expect(result.autoAssignResult).toEqual({ rotasCriadas: 2 });
    });

    it('reports the auto-assign error without failing promoter creation', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      promotorRepo.save.mockResolvedValue({
        ID_PROMOTOR: 1, NOME: 'Test', LATITUDE: '-23.55', LONGITUDE: '-46.63',
      });
      promotorRepo.findOne.mockResolvedValue({
        ID_PROMOTOR: 1, LATITUDE: '-23.55', LONGITUDE: '-46.63',
      });
      (CampanhaPromotorService.linkCampanhaPromotor as jest.Mock).mockResolvedValue([
        { ID_CAMPANHA_PROMOTOR: 7, ID_CAMPANHA: 3, RAIO: 20 },
      ]);
      (OficinaService.getComunityNearbyOficinas as jest.Mock).mockRejectedValue(
        new Error('oficina service fora do ar')
      );

      const result = await PromotorService.createPromotor(
        { NOME: 'Test' }, 3, 20, 'empresa-x'
      );

      expect(result.promotor.ID_PROMOTOR).toBe(1);
      expect(result.autoAssignResult).toEqual({
        rotasCriadas: 0,
        error: 'Erro na auto-atribuição de rotas.',
      });
      expect(RotaService.createRotas).not.toHaveBeenCalled();
    });
  });

  describe('updatePromotor', () => {
    it('should update fields', async () => {
      promotorRepo.findOne.mockResolvedValue({ ID_PROMOTOR: 1, NOME: 'Old' });
      promotorRepo.save.mockResolvedValue({ ID_PROMOTOR: 1, NOME: 'New' });

      const result = await PromotorService.updatePromotor(1, { NOME: 'New' });

      expect(result!.promotor.NOME).toBe('New');
    });

    it('should return null when not found', async () => {
      promotorRepo.findOne.mockResolvedValue(null);
      expect(await PromotorService.updatePromotor(999, { NOME: 'X' })).toBeNull();
    });

    it('should encrypt new password', async () => {
      promotorRepo.findOne.mockResolvedValue({ ID_PROMOTOR: 1 });
      promotorRepo.save.mockResolvedValue({ ID_PROMOTOR: 1, SENHA: 'enc_newpass' });

      await PromotorService.updatePromotor(1, { SENHA: 'newpass' });

      expect(promotorRepo.save).toHaveBeenCalled();
    });

    it('should not reassign rotas when CEP is unchanged', async () => {
      promotorRepo.findOne.mockResolvedValue({ ID_PROMOTOR: 1, CEP: '01001-000' });
      promotorRepo.save.mockResolvedValue({ ID_PROMOTOR: 1, CEP: '01001-000' });

      const result = await PromotorService.updatePromotor(1, { CEP: '01001-000' });

      expect(result!.autoAssignResult).toBeUndefined();
      expect(RotaService.removeCampanhaPromotorRota).not.toHaveBeenCalled();
    });

    it('should reassign rotas when CEP changes', async () => {
      promotorRepo.findOne
        .mockResolvedValueOnce({ ID_PROMOTOR: 1, CEP: '01001-000' }) // findOne in updatePromotor
        .mockResolvedValueOnce({ ID_PROMOTOR: 1, LATITUDE: '-23.55', LONGITUDE: '-46.63' }); // findPromotorById in redistributeFreedOficinas
      promotorRepo.save.mockResolvedValue({
        ID_PROMOTOR: 1, CEP: '02002-000', LATITUDE: '-23.55', LONGITUDE: '-46.63',
      });

      const mockCpRepo = { find: jest.fn(), findOne: jest.fn(), findBy: jest.fn() };
      const mockOficinaRepo = { findBy: jest.fn().mockResolvedValue([]) };
      (AppDataSourceSync.getRepository as jest.Mock).mockImplementation((entity: any) => {
        if (entity === CampanhaPromotor) return mockCpRepo;
        if (entity === Oficina) return mockOficinaRepo;
        return mockDirectRepo;
      });
      mockCpRepo.find.mockResolvedValue([
        { ID_CAMPANHA_PROMOTOR: 10, ID_CAMPANHA: 5, ID_PROMOTOR: 1, RAIO: 15 },
      ]);
      (AppDataSourceSync.query as jest.Mock)
        .mockResolvedValueOnce([{ ID_OFICINA: 100 }, { ID_OFICINA: 200 }]); // capture existing rotas

      (OficinaService.getComunityNearbyOficinas as jest.Mock).mockResolvedValue([
        { ID_OFICINA: 300 }, { ID_OFICINA: 400 },
      ]);
      (RotaService.getOficinasAssignedInCampanha as jest.Mock)
        .mockResolvedValueOnce([]) // autoAssignRotas check
        .mockResolvedValueOnce([300, 400]); // redistributeFreedOficinas check (freed oficinas now reassigned)

      const result = await PromotorService.updatePromotor(1, { CEP: '02002-000' }, 'empresa-x');

      expect(RotaService.removeCampanhaPromotorRota).toHaveBeenCalledWith(10);
      expect(RotaService.createRotas).toHaveBeenCalledWith(10, [300, 400]);
      expect(result!.autoAssignResult).toEqual({ rotasCriadas: 2 });
    });

    it('should return rotasCriadas 0 when promotor has no campaigns', async () => {
      promotorRepo.findOne.mockResolvedValue({ ID_PROMOTOR: 1, CEP: '01001-000' });
      promotorRepo.save.mockResolvedValue({
        ID_PROMOTOR: 1, CEP: '02002-000', LATITUDE: '-23.55', LONGITUDE: '-46.63',
      });

      const mockCpRepo = { find: jest.fn().mockResolvedValue([]) };
      (AppDataSourceSync.getRepository as jest.Mock).mockImplementation((entity: any) => {
        if (entity === CampanhaPromotor) return mockCpRepo;
        return mockDirectRepo;
      });

      const result = await PromotorService.updatePromotor(1, { CEP: '02002-000' }, 'empresa-x');

      expect(result!.autoAssignResult).toEqual({ rotasCriadas: 0 });
      expect(RotaService.removeCampanhaPromotorRota).not.toHaveBeenCalled();
    });

    it('should resolve empresaSlug from campaign when not provided', async () => {
      promotorRepo.findOne
        .mockResolvedValueOnce({ ID_PROMOTOR: 1, CEP: '01001-000' })
        .mockResolvedValueOnce({ ID_PROMOTOR: 1, LATITUDE: '-23.55', LONGITUDE: '-46.63' });
      promotorRepo.save.mockResolvedValue({
        ID_PROMOTOR: 1, CEP: '02002-000', LATITUDE: '-23.55', LONGITUDE: '-46.63',
      });

      const mockCpRepo = { find: jest.fn(), findBy: jest.fn() };
      const mockOficinaRepo = { findBy: jest.fn().mockResolvedValue([]) };
      (AppDataSourceSync.getRepository as jest.Mock).mockImplementation((entity: any) => {
        if (entity === CampanhaPromotor) return mockCpRepo;
        if (entity === Oficina) return mockOficinaRepo;
        return mockDirectRepo;
      });
      mockCpRepo.find.mockResolvedValue([
        { ID_CAMPANHA_PROMOTOR: 10, ID_CAMPANHA: 5, ID_PROMOTOR: 1, RAIO: 20 },
      ]);
      (AppDataSourceSync.query as jest.Mock)
        .mockResolvedValueOnce([]) // capture existing rotas (none)
        .mockResolvedValueOnce([{ EmpresaSlug: 'resolved-slug' }]); // resolveEmpresaSlugFromCampanha

      (OficinaService.getComunityNearbyOficinas as jest.Mock).mockResolvedValue([
        { ID_OFICINA: 500 },
      ]);
      (RotaService.getOficinasAssignedInCampanha as jest.Mock).mockResolvedValue([]);

      // empresaSlug not provided — should resolve from DB
      const result = await PromotorService.updatePromotor(1, { CEP: '02002-000' });

      expect(RotaService.createRotas).toHaveBeenCalledWith(10, [500]);
      expect(result!.autoAssignResult).toEqual({ rotasCriadas: 1 });
    });

    it('should redistribute freed oficinas to other promoters within radius', async () => {
      // Promotor 1 changes CEP, freeing oficinas 100 and 200
      promotorRepo.findOne
        .mockResolvedValueOnce({ ID_PROMOTOR: 1, CEP: '01001-000' }) // updatePromotor findOne
        .mockResolvedValueOnce({ ID_PROMOTOR: 1, LATITUDE: '-23.56', LONGITUDE: '-46.64' }) // findPromotorById for CP 10 (redistrib)
        .mockResolvedValueOnce({ ID_PROMOTOR: 2, LATITUDE: '-23.55', LONGITUDE: '-46.63' }); // findPromotorById for CP 20 (redistrib)
      promotorRepo.save.mockResolvedValue({
        ID_PROMOTOR: 1, CEP: '09999-000', LATITUDE: '-23.56', LONGITUDE: '-46.64',
      });

      const mockCpRepo = { find: jest.fn() };
      // Oficinas 100 and 200 are very close to promotor 2
      const mockOficinaRepo = {
        findBy: jest.fn().mockResolvedValue([
          { ID_OFICINA: 100, LATITUDE: '-23.551', LONGITUDE: '-46.631' },
          { ID_OFICINA: 200, LATITUDE: '-23.552', LONGITUDE: '-46.632' },
        ]),
      };
      (AppDataSourceSync.getRepository as jest.Mock).mockImplementation((entity: any) => {
        if (entity === CampanhaPromotor) return mockCpRepo;
        if (entity === Oficina) return mockOficinaRepo;
        return mockDirectRepo;
      });
      // Promotor 1 has one campaign association
      mockCpRepo.find
        .mockResolvedValueOnce([
          { ID_CAMPANHA_PROMOTOR: 10, ID_CAMPANHA: 5, ID_PROMOTOR: 1, RAIO: 20 },
        ])
        // All CPs in campaign 5 (for redistribution)
        .mockResolvedValueOnce([
          { ID_CAMPANHA_PROMOTOR: 10, ID_CAMPANHA: 5, ID_PROMOTOR: 1, RAIO: 20 },
          { ID_CAMPANHA_PROMOTOR: 20, ID_CAMPANHA: 5, ID_PROMOTOR: 2, RAIO: 20 },
        ]);

      (AppDataSourceSync.query as jest.Mock)
        .mockResolvedValueOnce([{ ID_OFICINA: 100 }, { ID_OFICINA: 200 }]); // capture freed oficinas

      // autoAssignRotas: no nearby oficinas at new location
      (OficinaService.getComunityNearbyOficinas as jest.Mock).mockResolvedValue([]);
      (RotaService.getOficinasAssignedInCampanha as jest.Mock)
        .mockResolvedValueOnce([]) // redistribution: check what's assigned (nothing after removal)
        .mockResolvedValueOnce([]); // redistribution second CP check

      const result = await PromotorService.updatePromotor(1, { CEP: '09999-000' }, 'empresa-x');

      expect(RotaService.removeCampanhaPromotorRota).toHaveBeenCalledWith(10);
      // Oficinas 100 and 200 should be redistributed to promotor 2 (CP 20)
      expect(RotaService.createRotas).toHaveBeenCalledWith(20, [100, 200]);
      expect(result!.autoAssignResult).toEqual({ rotasCriadas: 0 });
    });

    it('should not reassign when CEP changes but geocoding returns no coordinates', async () => {
      const GeolocationService = require('../../service/geolocationService');
      GeolocationService.mockImplementationOnce(() => ({
        getLatLongByCep: jest.fn().mockResolvedValue(null),
      }));

      promotorRepo.findOne.mockResolvedValue({ ID_PROMOTOR: 1, CEP: '01001-000' });
      promotorRepo.save.mockResolvedValue({
        ID_PROMOTOR: 1, CEP: '02002-000', LATITUDE: undefined, LONGITUDE: undefined,
      });

      const result = await PromotorService.updatePromotor(1, { CEP: '02002-000' });

      expect(result!.autoAssignResult).toBeUndefined();
      expect(RotaService.removeCampanhaPromotorRota).not.toHaveBeenCalled();
    });
  });

  describe('deletePromotor', () => {
    it('should soft delete', async () => {
      promotorRepo.findOne.mockResolvedValue({ ID_PROMOTOR: 1 });

      const result = await PromotorService.deletePromotor(1);

      expect(result).toEqual({ ID_PROMOTOR: 1 });
      expect(promotorRepo.softDelete).toHaveBeenCalledWith(1);
    });

    it('should return null when not found', async () => {
      promotorRepo.findOne.mockResolvedValue(null);
      expect(await PromotorService.deletePromotor(999)).toBeNull();
    });
  });

  describe('findPromotorById', () => {
    it('should find by ID', async () => {
      promotorRepo.findOne.mockResolvedValue({ ID_PROMOTOR: 1 });
      expect(await PromotorService.findPromotorById(1)).toEqual({ ID_PROMOTOR: 1 });
    });

    it('should return null when not found', async () => {
      promotorRepo.findOne.mockResolvedValue(null);
      expect(await PromotorService.findPromotorById(999)).toBeNull();
    });
  });

  describe('findPromotorByEmail', () => {
    it('should find by email', async () => {
      promotorRepo.findOne.mockResolvedValue({ ID_PROMOTOR: 1, EMAIL: 'a@b.com' });
      expect(await PromotorService.findPromotorByEmail('a@b.com')).toBeTruthy();
    });

    it('should return null when not found', async () => {
      promotorRepo.findOne.mockResolvedValue(null);
      expect(await PromotorService.findPromotorByEmail('x@y.com')).toBeNull();
    });
  });

  describe('loginPromotor', () => {
    it('should return promotor with valid credentials', async () => {
      promotorRepo.findOne.mockResolvedValue({
        ID_PROMOTOR: 1, EMAIL: 'a@b.com', SENHA: 'enc_pass123',
      });

      const result = await PromotorService.loginPromotor('a@b.com', 'pass123');

      expect(result).toBeTruthy();
      expect(result!.ID_PROMOTOR).toBe(1);
    });

    it('should return null with wrong password', async () => {
      promotorRepo.findOne.mockResolvedValue({
        ID_PROMOTOR: 1, EMAIL: 'a@b.com', SENHA: 'enc_correct',
      });

      const result = await PromotorService.loginPromotor('a@b.com', 'wrong');

      expect(result).toBeNull();
    });

    it('should return null when email not found', async () => {
      promotorRepo.findOne.mockResolvedValue(null);
      expect(await PromotorService.loginPromotor('x@y.com', 'pass')).toBeNull();
    });

    it('should return null when promotor has no password', async () => {
      promotorRepo.findOne.mockResolvedValue({ ID_PROMOTOR: 1, SENHA: null });
      expect(await PromotorService.loginPromotor('a@b.com', 'pass')).toBeNull();
    });
  });

  describe('getAllPromotores', () => {
    it('should return ordered list', async () => {
      promotorRepo.find.mockResolvedValue([{ ID_PROMOTOR: 1 }]);

      const result = await PromotorService.getAllPromotores();

      expect(result).toHaveLength(1);
      expect(promotorRepo.find).toHaveBeenCalledWith(expect.objectContaining({
        order: { CREATED_AT: 'DESC' },
      }));
    });
  });

  describe('getPromotoresByClientId', () => {
    it('should return promotores by client', async () => {
      mockDirectRepo.find.mockResolvedValue([{ ID_PROMOTOR: 1, ID_CLIENT: 100 }]);

      const result = await PromotorService.getPromotoresByClientId(100);

      expect(result).toHaveLength(1);
    });

    it('should return empty when none found', async () => {
      mockDirectRepo.find.mockResolvedValue([]);
      expect(await PromotorService.getPromotoresByClientId(999)).toEqual([]);
    });
  });
});
