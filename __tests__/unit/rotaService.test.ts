import RotaService from '../../service/rotaService';
import { AppDataSourceSync } from '../../data-source';
import RotaPromotor from '../../entities/RotaPromotor';
import CampanhaPromotor from '../../entities/CampanhaPromotor';

jest.mock('../../data-source');

describe('RotaService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createRotaWithCampanhaPromotor', () => {
    it('should create a campaign promoter and multiple routes', async () => {
      const mockCampanhaPromotor = {
        ID_CAMPANHA_PROMOTOR: 1,
        ID_PROMOTOR: 10,
        ID_CAMPANHA: 20,
      };

      const mockRotas = [
        {
          ID_ROTA_PROMOTOR: 1,
          ID_CAMPANHA_PROMOTOR: 1,
          ID_OFICINA: 100,
          CREATED_BY: 5,
        },
        {
          ID_ROTA_PROMOTOR: 2,
          ID_CAMPANHA_PROMOTOR: 1,
          ID_OFICINA: 200,
          CREATED_BY: 5,
        },
        {
          ID_ROTA_PROMOTOR: 3,
          ID_CAMPANHA_PROMOTOR: 1,
          ID_OFICINA: 300,
          CREATED_BY: 5,
        },
      ];

      const mockCampanhaPromotorRepository = {
        create: jest.fn().mockReturnValue(mockCampanhaPromotor),
        save: jest.fn().mockResolvedValue(mockCampanhaPromotor),
      };

      const mockRotaRepository = {
        create: jest.fn((data) => ({ ...data, ID_ROTA_PROMOTOR: Math.random() })),
        save: jest.fn().mockResolvedValue(mockRotas),
      };

      (AppDataSourceSync.getRepository as jest.Mock)
        .mockImplementation((entity) => {
          if (entity === CampanhaPromotor) return mockCampanhaPromotorRepository;
          if (entity === RotaPromotor) return mockRotaRepository;
          return {};
        });

      const result = await RotaService.createRotaWithCampanhaPromotor(
        10, // ID_PROMOTOR
        20, // ID_CAMPANHA
        [100, 200, 300], // ID_OFICINA array
        5 // CREATED_BY
      );

      expect(result).toEqual({
        campanhaPromotor: mockCampanhaPromotor,
        rotas: mockRotas,
      });

      // Verify CampanhaPromotor creation
      expect(mockCampanhaPromotorRepository.create).toHaveBeenCalledWith({
        ID_PROMOTOR: 10,
        ID_CAMPANHA: 20,
      });
      expect(mockCampanhaPromotorRepository.save).toHaveBeenCalled();

      // Verify Rota creation
      expect(mockRotaRepository.create).toHaveBeenCalledTimes(3);
      expect(mockRotaRepository.create).toHaveBeenCalledWith({
        ID_CAMPANHA_PROMOTOR: 1,
        ID_OFICINA: 100,
        CREATED_BY: 5,
      });
      expect(mockRotaRepository.create).toHaveBeenCalledWith({
        ID_CAMPANHA_PROMOTOR: 1,
        ID_OFICINA: 200,
        CREATED_BY: 5,
      });
      expect(mockRotaRepository.create).toHaveBeenCalledWith({
        ID_CAMPANHA_PROMOTOR: 1,
        ID_OFICINA: 300,
        CREATED_BY: 5,
      });
      expect(mockRotaRepository.save).toHaveBeenCalledTimes(1); // Bulk save
    });

    it('should create a campaign promoter and single route without CREATED_BY', async () => {
      const mockCampanhaPromotor = {
        ID_CAMPANHA_PROMOTOR: 2,
        ID_PROMOTOR: 15,
        ID_CAMPANHA: 25,
      };

      const mockRotas = [
        {
          ID_ROTA_PROMOTOR: 4,
          ID_CAMPANHA_PROMOTOR: 2,
          ID_OFICINA: 150,
        },
      ];

      const mockCampanhaPromotorRepository = {
        create: jest.fn().mockReturnValue(mockCampanhaPromotor),
        save: jest.fn().mockResolvedValue(mockCampanhaPromotor),
      };

      const mockRotaRepository = {
        create: jest.fn((data) => ({ ...data, ID_ROTA_PROMOTOR: 4 })),
        save: jest.fn().mockResolvedValue(mockRotas),
      };

      (AppDataSourceSync.getRepository as jest.Mock)
        .mockImplementation((entity) => {
          if (entity === CampanhaPromotor) return mockCampanhaPromotorRepository;
          if (entity === RotaPromotor) return mockRotaRepository;
          return {};
        });

      const result = await RotaService.createRotaWithCampanhaPromotor(
        15, // ID_PROMOTOR
        25, // ID_CAMPANHA
        [150] // ID_OFICINA array with single item
      );

      expect(result).toEqual({
        campanhaPromotor: mockCampanhaPromotor,
        rotas: mockRotas,
      });

      // Verify CampanhaPromotor creation
      expect(mockCampanhaPromotorRepository.create).toHaveBeenCalledWith({
        ID_PROMOTOR: 15,
        ID_CAMPANHA: 25,
      });
      expect(mockCampanhaPromotorRepository.save).toHaveBeenCalled();

      // Verify Rota creation without CREATED_BY
      expect(mockRotaRepository.create).toHaveBeenCalledTimes(1);
      expect(mockRotaRepository.create).toHaveBeenCalledWith({
        ID_CAMPANHA_PROMOTOR: 2,
        ID_OFICINA: 150,
        CREATED_BY: undefined,
      });
      expect(mockRotaRepository.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('createRotas', () => {
    it('should create a single route', async () => {
      const mockRota = {
        ID_ROTA_PROMOTOR: 1,
        ID_CAMPANHA_PROMOTOR: 5,
        ID_OFICINA: 100,
        CREATED_BY: 10,
      };

      const mockRepository = {
        create: jest.fn().mockReturnValue(mockRota),
        save: jest.fn().mockResolvedValue(mockRota),
      };

      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(mockRepository);

      const result = await RotaService.createRotas(5, 100, 10);

      expect(result).toEqual(mockRota);
      expect(mockRepository.create).toHaveBeenCalledWith({
        ID_CAMPANHA_PROMOTOR: 5,
        ID_OFICINA: 100,
        CREATED_BY: 10,
      });
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should create multiple routes with array of oficina IDs', async () => {
      const mockRotas = [
        { ID_ROTA_PROMOTOR: 1, ID_CAMPANHA_PROMOTOR: 5, ID_OFICINA: 100 },
        { ID_ROTA_PROMOTOR: 2, ID_CAMPANHA_PROMOTOR: 5, ID_OFICINA: 200 },
      ];

      const mockRepository = {
        create: jest.fn((data) => ({ ...data, ID_ROTA_PROMOTOR: Math.random() })),
        save: jest.fn().mockResolvedValue(mockRotas),
      };

      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(mockRepository);

      const result = await RotaService.createRotas(5, [100, 200]);

      expect(result).toEqual(mockRotas);
      expect(mockRepository.create).toHaveBeenCalledTimes(2);
      expect(mockRepository.save).toHaveBeenCalled();
    });
  });
});
