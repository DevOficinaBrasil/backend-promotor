import { AppDataSourceSync } from "../data-source";
import Promotor from "../entities/Promotor";
import { encrypt, decrypt } from "../utils/encryption";

export default class PromotorService {
  /**
   * Creates a new promoter in the database
   * @param promotorData - The promoter data to create
   * @returns The created promoter
   */
  static async createPromotor(promotorData: Partial<Promotor>): Promise<Promotor> {
    const promotorRepository = AppDataSourceSync.getRepository(Promotor);
    
    // Encrypt password if provided and not empty (preserving original password as-is)
    if (promotorData.SENHA && promotorData.SENHA !== "") {
      promotorData.SENHA = encrypt(promotorData.SENHA);
    }
    
    const novoPromotor = promotorRepository.create(promotorData);
    const promotorSalvo = await promotorRepository.save(novoPromotor);
    
    return promotorSalvo;
  }

  /**
   * Updates an existing promoter in the database
   * @param id - The promoter ID to update
   * @param promotorData - The promoter data to update
   * @returns The updated promoter or null if not found
   */
  static async updatePromotor(id: number, promotorData: Partial<Promotor>): Promise<Promotor | null> {
    const promotorRepository = AppDataSourceSync.getRepository(Promotor);
    
    // Find the promoter by ID
    const promotorExistente = await promotorRepository.findOne({
      where: { ID_PROMOTOR: id }
    });

    if (!promotorExistente) {
      return null;
    }

    // Encrypt password if being updated and not empty (preserving original password as-is)
    if (promotorData.SENHA && promotorData.SENHA !== "") {
      promotorData.SENHA = encrypt(promotorData.SENHA);
    }

    // Update the promoter fields
    Object.assign(promotorExistente, promotorData);
    
    const promotorAtualizado = await promotorRepository.save(promotorExistente);
    
    return promotorAtualizado;
  }

  /**
   * Soft deletes a promoter by ID
   * @param id - The promoter ID to delete
   * @returns The deleted promoter or null if not found
   */
  static async deletePromotor(id: number): Promise<Promotor | null> {
    const promotorRepository = AppDataSourceSync.getRepository(Promotor);
    
    // Find the promoter by ID
    const promotorExistente = await promotorRepository.findOne({
      where: { ID_PROMOTOR: id }
    });

    if (!promotorExistente) {
      return null;
    }

    // Soft delete the promoter
    await promotorRepository.softDelete(id);
    
    return promotorExistente;
  }

  /**
   * Finds a promoter by ID
   * @param id - The promoter ID to find
   * @returns The promoter or null if not found
   */
  static async findPromotorById(id: number): Promise<Promotor | null> {
    const promotorRepository = AppDataSourceSync.getRepository(Promotor);
    
    const promotor = await promotorRepository.findOne({
      where: { ID_PROMOTOR: id }
    });

    return promotor;
  }
}
