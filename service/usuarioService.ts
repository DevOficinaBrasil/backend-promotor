import { AppDataSourceSync } from "../data-source";
import Usuario from "../entities/Usuario";

export class UsuarioService {
  /**
   * Gets a user by their ID
   * @param id - The user ID
   * @returns The user or null if not found
   */
  async getUserById(id: number): Promise<Usuario | null> {
    const usuarioRepository = AppDataSourceSync.getRepository(Usuario);
    
    const usuario = await usuarioRepository.findOne({
      where: { ID_USUARIO: id }
    });

    return usuario;
  }
}

export const usuarioService = new UsuarioService();
