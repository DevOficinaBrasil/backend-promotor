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
    
    // Encrypt password if provided
    if (promotorData.SENHA) {
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

    // Encrypt password if being updated
    if (promotorData.SENHA) {
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

  /**
   * Finds a promoter by email
   * @param email - The promoter email to find
   * @returns The promoter or null if not found
   */
  static async findPromotorByEmail(email: string): Promise<Promotor | null> {
    const promotorRepository = AppDataSourceSync.getRepository(Promotor);
    
    const promotor = await promotorRepository.findOne({
      where: { EMAIL: email }
    });

    return promotor;
  }

  /**
   * Validates promoter login credentials
   * @param email - The promoter email
   * @param senha - The plain text password
   * @returns The promoter if credentials are valid, null otherwise
   */
  static async loginPromotor(email: string, senha: string): Promise<Promotor | null> {
    const promotor = await this.findPromotorByEmail(email);
    
    if (!promotor || !promotor.SENHA) {
      return null;
    }

    // Decrypt the stored password and compare with the provided password
    try {
      const decryptedPassword = decrypt(promotor.SENHA);
      
      // Use crypto.timingSafeEqual for constant-time comparison to prevent timing attacks
      const crypto = require('crypto');
      const expectedBuffer = Buffer.from(decryptedPassword, 'utf8');
      const providedBuffer = Buffer.from(senha, 'utf8');
      
      // Ensure buffers are the same length for timingSafeEqual
      if (expectedBuffer.length !== providedBuffer.length) {
        return null;
      }
      
      if (crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
        return promotor;
      }
    } catch (error) {
      // Log error with context but don't expose details
      console.error('Error during login credential validation:', error instanceof Error ? error.message : 'Unknown error');
    }
    
    return null;
  }

  /**
   * Gets all promoters (non-deleted)
   * @returns Array of all promoters
   */
  static async getAllPromotores(): Promise<Promotor[]> {
    const promotorRepository = AppDataSourceSync.getRepository(Promotor);
    
    const promotores = await promotorRepository.find({
      order: {
        CREATED_AT: 'DESC',
      },
    });

    return promotores;
  }
}
