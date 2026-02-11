import PromotorService from '../../service/promotorService';
import { AppDataSourceSync } from '../../data-source';
import Promotor from '../../entities/Promotor';
import CampanhaPromotor from '../../entities/CampanhaPromotor';

jest.mock('../../data-source');
jest.mock('../../utils/encryption', () => ({
  encrypt: jest.fn((password) => `encrypted_${password}`),
  decrypt: jest.fn((password) => password.replace('encrypted_', '')),
}));

describe('PromotorService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createPromotor', () => {
    it('should create a promotor without campaign associations', async () => {
      const mockPromotor = {
        ID_PROMOTOR: 1,
        NOME: 'Test Promotor',
        EMAIL: 'test@example.com',
        SENHA: 'encrypted_password123',
      };

      const mockRepository = {
        create: jest.fn().mockReturnValue(mockPromotor),
        save: jest.fn().mockResolvedValue(mockPromotor),
      };

      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(mockRepository);

      const promotorData = {
        NOME: 'Test Promotor',
        EMAIL: 'test@example.com',
        SENHA: 'password123',
      };

      const result = await PromotorService.createPromotor(promotorData);

      expect(result).toEqual(mockPromotor);
      expect(mockRepository.create).toHaveBeenCalledWith({
        NOME: 'Test Promotor',
        EMAIL: 'test@example.com',
        SENHA: 'encrypted_password123',
      });
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should create a promotor with a single campaign ID', async () => {
      const mockPromotor = {
        ID_PROMOTOR: 1,
        NOME: 'Test Promotor',
        EMAIL: 'test@example.com',
      };

      const mockCampanhaPromotor = {
        ID_CAMPANHA_PROMOTOR: 1,
        ID_CAMPANHA: 10,
        ID_PROMOTOR: 1,
      };

      const mockPromotorRepository = {
        create: jest.fn().mockReturnValue(mockPromotor),
        save: jest.fn().mockResolvedValue(mockPromotor),
      };

      const mockCampanhaPromotorRepository = {
        find: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockReturnValue(mockCampanhaPromotor),
        save: jest.fn().mockResolvedValue([mockCampanhaPromotor]),
      };

      (AppDataSourceSync.getRepository as jest.Mock)
        .mockImplementation((entity) => {
          if (entity === Promotor) return mockPromotorRepository;
          if (entity === CampanhaPromotor) return mockCampanhaPromotorRepository;
          return {};
        });

      const promotorData = {
        NOME: 'Test Promotor',
        EMAIL: 'test@example.com',
      };

      const result = await PromotorService.createPromotor(promotorData, 10);

      expect(result).toEqual(mockPromotor);
      expect(mockCampanhaPromotorRepository.find).toHaveBeenCalledWith({
        where: {
          ID_PROMOTOR: 1,
        },
      });
      expect(mockCampanhaPromotorRepository.create).toHaveBeenCalledWith({
        ID_CAMPANHA: 10,
        ID_PROMOTOR: 1,
      });
      expect(mockCampanhaPromotorRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should create a promotor with multiple campaign IDs', async () => {
      const mockPromotor = {
        ID_PROMOTOR: 1,
        NOME: 'Test Promotor',
        EMAIL: 'test@example.com',
      };

      const mockRelationships = [
        { ID_CAMPANHA_PROMOTOR: 1, ID_CAMPANHA: 10, ID_PROMOTOR: 1 },
        { ID_CAMPANHA_PROMOTOR: 2, ID_CAMPANHA: 20, ID_PROMOTOR: 1 },
        { ID_CAMPANHA_PROMOTOR: 3, ID_CAMPANHA: 30, ID_PROMOTOR: 1 },
      ];

      const mockPromotorRepository = {
        create: jest.fn().mockReturnValue(mockPromotor),
        save: jest.fn().mockResolvedValue(mockPromotor),
      };

      const mockCampanhaPromotorRepository = {
        find: jest.fn().mockResolvedValue([]),
        create: jest.fn((data) => ({ ...data, ID_CAMPANHA_PROMOTOR: Math.random() })),
        save: jest.fn().mockResolvedValue(mockRelationships),
      };

      (AppDataSourceSync.getRepository as jest.Mock)
        .mockImplementation((entity) => {
          if (entity === Promotor) return mockPromotorRepository;
          if (entity === CampanhaPromotor) return mockCampanhaPromotorRepository;
          return {};
        });

      const promotorData = {
        NOME: 'Test Promotor',
        EMAIL: 'test@example.com',
      };

      const result = await PromotorService.createPromotor(promotorData, [10, 20, 30]);

      expect(result).toEqual(mockPromotor);
      expect(mockCampanhaPromotorRepository.find).toHaveBeenCalledWith({
        where: {
          ID_PROMOTOR: 1,
        },
      });
      expect(mockCampanhaPromotorRepository.create).toHaveBeenCalledTimes(3);
      expect(mockCampanhaPromotorRepository.save).toHaveBeenCalledTimes(1); // Bulk save
    });
  });

  describe('linkCampanhaPromotor', () => {
    it('should link a promotor to a single campaign', async () => {
      const mockCampanhaPromotor = {
        ID_CAMPANHA_PROMOTOR: 1,
        ID_CAMPANHA: 10,
        ID_PROMOTOR: 5,
      };

      const mockRepository = {
        find: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockReturnValue(mockCampanhaPromotor),
        save: jest.fn().mockResolvedValue([mockCampanhaPromotor]),
      };

      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(mockRepository);

      const result = await PromotorService.linkCampanhaPromotor(10, 5);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockCampanhaPromotor);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: {
          ID_PROMOTOR: 5,
        },
      });
      expect(mockRepository.create).toHaveBeenCalledWith({
        ID_CAMPANHA: 10,
        ID_PROMOTOR: 5,
      });
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should link a promotor to multiple campaigns', async () => {
      const mockRelationships = [
        { ID_CAMPANHA_PROMOTOR: 1, ID_CAMPANHA: 10, ID_PROMOTOR: 5 },
        { ID_CAMPANHA_PROMOTOR: 2, ID_CAMPANHA: 20, ID_PROMOTOR: 5 },
        { ID_CAMPANHA_PROMOTOR: 3, ID_CAMPANHA: 30, ID_PROMOTOR: 5 },
      ];

      const mockRepository = {
        find: jest.fn().mockResolvedValue([]),
        create: jest.fn((data) => ({ ...data, ID_CAMPANHA_PROMOTOR: Math.random() })),
        save: jest.fn().mockResolvedValue(mockRelationships),
      };

      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(mockRepository);

      const result = await PromotorService.linkCampanhaPromotor([10, 20, 30], 5);

      expect(result).toHaveLength(3);
      expect(mockRepository.create).toHaveBeenCalledTimes(3);
      expect(mockRepository.save).toHaveBeenCalledTimes(1); // Bulk save
    });

    it('should not create duplicate relationships', async () => {
      const existingRelationship = {
        ID_CAMPANHA_PROMOTOR: 1,
        ID_CAMPANHA: 10,
        ID_PROMOTOR: 5,
      };

      const mockRepository = {
        find: jest.fn().mockResolvedValue([existingRelationship]),
        create: jest.fn(),
        save: jest.fn(),
      };

      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(mockRepository);

      const result = await PromotorService.linkCampanhaPromotor(10, 5);

      expect(result).toHaveLength(0);
      expect(mockRepository.create).not.toHaveBeenCalled();
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should handle mix of existing and new relationships', async () => {
      const existingRelationship = {
        ID_CAMPANHA_PROMOTOR: 1,
        ID_CAMPANHA: 10,
        ID_PROMOTOR: 5,
      };

      const newRelationship = {
        ID_CAMPANHA_PROMOTOR: 2,
        ID_CAMPANHA: 20,
        ID_PROMOTOR: 5,
      };

      const mockRepository = {
        find: jest.fn().mockResolvedValue([existingRelationship]),
        create: jest.fn().mockReturnValue(newRelationship),
        save: jest.fn().mockResolvedValue([newRelationship]),
      };

      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(mockRepository);

      const result = await PromotorService.linkCampanhaPromotor([10, 20], 5);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(newRelationship);
      expect(mockRepository.create).toHaveBeenCalledTimes(1);
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPromotoresByClientId', () => {
    it('should get all promoters by client ID', async () => {
      const mockPromotores = [
        {
          ID_PROMOTOR: 1,
          NOME: 'Promotor 1',
          EMAIL: 'promotor1@example.com',
          ID_CLIENT: 100,
        },
        {
          ID_PROMOTOR: 2,
          NOME: 'Promotor 2',
          EMAIL: 'promotor2@example.com',
          ID_CLIENT: 100,
        },
      ];

      const mockRepository = {
        find: jest.fn().mockResolvedValue(mockPromotores),
      };

      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(mockRepository);

      const result = await PromotorService.getPromotoresByClientId(100);

      expect(result).toEqual(mockPromotores);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { ID_CLIENT: 100 },
        order: {
          CREATED_AT: 'DESC',
        },
      });
    });

    it('should return empty array if no promoters found for client ID', async () => {
      const mockRepository = {
        find: jest.fn().mockResolvedValue([]),
      };

      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(mockRepository);

      const result = await PromotorService.getPromotoresByClientId(999);

      expect(result).toEqual([]);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { ID_CLIENT: 999 },
        order: {
          CREATED_AT: 'DESC',
        },
      });
    });
  });
});
