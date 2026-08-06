import { UsuarioService } from '../../service/usuarioService';
import { AppDataSourceSync } from '../../data-source';
import Usuario from '../../entities/Usuario';

jest.mock('../../data-source');

describe('UsuarioService', () => {
  let service: UsuarioService;
  const mockRepository = {
    findOne: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsuarioService();
    (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(mockRepository);
  });

  describe('getUserById', () => {
    it('should return user when found', async () => {
      const mockUser = { ID_USUARIO: 1, NOME: 'Test' };
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.getUserById(1);

      expect(result).toEqual(mockUser);
      expect(AppDataSourceSync.getRepository).toHaveBeenCalledWith(Usuario);
      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { ID_USUARIO: 1 } });
    });

    it('should return null when not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getUserById(999);

      expect(result).toBeNull();
    });
  });
});
