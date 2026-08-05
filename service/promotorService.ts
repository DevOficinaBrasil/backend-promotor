

import { AppDataSourceSync } from "../data-source";
import { In } from "typeorm";
import Promotor from "../entities/Promotor";
import CampanhaPromotor from "../entities/CampanhaPromotor";
import { encrypt, decrypt } from "../utils/encryption";
import { MigrationAwareRepository } from "../utils/migrationRepository";
import GeolocationService from "./geolocationService";
import CampanhaPromotorService from "./campanhaPromotorService";
import OficinaService from "./oficinaService";
import RotaService from "./rotaService";

export default class PromotorService {
  private static getPromotorRepo() {
    return new MigrationAwareRepository<Promotor>(Promotor, "ID_PROMOTOR");
  }

  private static getCampanhaPromotorRepo() {
    return new MigrationAwareRepository<CampanhaPromotor>(CampanhaPromotor, "ID_CAMPANHA_PROMOTOR");
  }

  private static async includeLatLongToPromotor(promotor: Promotor): Promise<Promotor> 
  {
    const geolocationService = new GeolocationService();

    const latLong = await geolocationService.getLatLongByCep(promotor.CEP as string);

    if(latLong) 
    {
      promotor.LATITUDE = latLong.lat.toString();
      promotor.LONGITUDE = latLong.long.toString();
    }

    return promotor;
  }

  /**
   * Creates a new promoter in the database
   * @param promotorData - The promoter data to create
   * @param campanhaIds - Optional campaign ID or array of campaign IDs to associate
   * @returns The created promoter
   */
  static async createPromotor(
    promotorData: Partial<Promotor>, 
    campanhaIds?: number | number[],
    raio?: number,
    empresaSlug?: string
  ): Promise<{ promotor: Promotor; autoAssignResult?: { rotasCriadas: number; error?: string } }> {
    const repo = this.getPromotorRepo();
    
    // Encrypt password if provided
    if (promotorData.SENHA) {
      promotorData.SENHA = encrypt(promotorData.SENHA);
    }
    
    const novoPromotor = repo.create(promotorData);

    if(novoPromotor.CEP) {
      await this.includeLatLongToPromotor(novoPromotor);
    }

    const promotorSalvo = await repo.save(novoPromotor);

    let campanhaPromotores: CampanhaPromotor[] = [];
    let autoAssignResult: { rotasCriadas: number; error?: string } | undefined;
    if (campanhaIds !== undefined) {
      const result = await this.linkCampanhaPromotor(campanhaIds, promotorSalvo.ID_PROMOTOR!, raio, empresaSlug);
      campanhaPromotores = result.campanhaPromotores;
      autoAssignResult = result.autoAssignResult;
    }
    
    return { promotor: promotorSalvo, autoAssignResult };
  }

  private static async autoAssignRotas(
    promotor: Promotor,
    campanhaPromotores: CampanhaPromotor[],
    empresaSlug: string
  ): Promise<{ rotasCriadas: number; error?: string }> {
    let totalRotasCriadas = 0;

    for (const cp of campanhaPromotores) {
      try {
        const raio = cp.RAIO ?? 20;
        const oficinas = await OficinaService.getComunityNearbyOficinas(
          parseFloat(promotor.LATITUDE!),
          parseFloat(promotor.LONGITUDE!),
          raio,
          empresaSlug
        );

        if (oficinas.length > 0) {
          const assignedOficinas = await RotaService.getOficinasAssignedInCampanha(cp.ID_CAMPANHA!);
          const assignedSet = new Set(assignedOficinas);
          const availableOficinaIds = oficinas
            .map((o: any) => o.ID_OFICINA)
            .filter((id: number) => !assignedSet.has(id));

          if (availableOficinaIds.length > 0) {
            await RotaService.createRotas(cp.ID_CAMPANHA_PROMOTOR!, availableOficinaIds);
            totalRotasCriadas += availableOficinaIds.length;
            console.log(`Auto-assigned ${availableOficinaIds.length} rotas for CAMPANHA_PROMOTOR ${cp.ID_CAMPANHA_PROMOTOR} (${oficinas.length - availableOficinaIds.length} already assigned)`);
          }
        }
      } catch (error) {
        console.error(`Auto-assign rotas failed for CAMPANHA_PROMOTOR ${cp.ID_CAMPANHA_PROMOTOR}:`, error);
        return { rotasCriadas: totalRotasCriadas, error: 'Erro na auto-atribuição de rotas.' };
      }
    }

    return { rotasCriadas: totalRotasCriadas };
  }

  /**
   * Updates an existing promoter in the database
   * @param id - The promoter ID to update
   * @param promotorData - The promoter data to update
   * @returns The updated promoter or null if not found
   */
  static async updatePromotor(id: number, promotorData: Partial<Promotor>, raio?: number): Promise<Promotor | null> {
    const repo = this.getPromotorRepo();
    
    // Find the promoter by ID (searches both DBs)
    const promotorExistente = await repo.findOne({
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

    // atualiza a latitude e longitude se o CEP foi alterado
    if(promotorData.CEP != promotorExistente.CEP) {
      await this.includeLatLongToPromotor(promotorExistente);
    }
    
    const promotorAtualizado = await repo.save(promotorExistente);
    
    return promotorAtualizado;
  }

  /**
   * Soft deletes a promoter by ID
   * @param id - The promoter ID to delete
   * @returns The deleted promoter or null if not found
   */
  static async deletePromotor(id: number): Promise<Promotor | null> {
    const repo = this.getPromotorRepo();
    
    // Find the promoter by ID (searches both DBs)
    const promotorExistente = await repo.findOne({
      where: { ID_PROMOTOR: id }
    });

    if (!promotorExistente) {
      return null;
    }

    // Soft delete the promoter (always on new DB)
    await repo.softDelete(id);
    
    return promotorExistente;
  }

  /**
   * Finds a promoter by ID
   * @param id - The promoter ID to find
   * @returns The promoter or null if not found
   */
  static async findPromotorById(id: number): Promise<Promotor | null> {
    const repo = this.getPromotorRepo();
    
    const promotor = await repo.findOne({
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
    const repo = this.getPromotorRepo();
    
    const promotor = await repo.findOne({
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
    const repo = this.getPromotorRepo();
    
    const promotores = await repo.find({
      order: {
        CREATED_AT: 'DESC',
      },
    });

    return promotores;
  }

// Delegações para CampanhaPromotorService (mantidas para retrocompatibilidade)
  static async linkCampanhaPromotor(
    campanhaIds: number | number[], 
    promotorId: number,
    raio?: number,
    empresaSlug?: string
  ): 
    Promise<{ campanhaPromotores: CampanhaPromotor[]; autoAssignResult?: { rotasCriadas: number; error?: string } }> 
  {
    const campanhaPromotores = await CampanhaPromotorService.linkCampanhaPromotor(campanhaIds, promotorId, raio);

    let autoAssignResult: { rotasCriadas: number; error?: string } | undefined;

    if (empresaSlug && campanhaPromotores.length > 0) 
    {
      const promotor = await this.findPromotorById(promotorId);
    
      if (promotor?.LATITUDE && promotor?.LONGITUDE) {
        autoAssignResult = await this.autoAssignRotas(promotor, campanhaPromotores, empresaSlug);
      }
    }

    return { campanhaPromotores, autoAssignResult };
  }

  static async updateCampanhaPromotorRaio(
    idCampanhaPromotor: number,
    raio: number
  ): Promise<CampanhaPromotor | null> {
    return CampanhaPromotorService.updateRaio(idCampanhaPromotor, raio);
  }

  static async unlinkCampanhaPromotor(
    idCampanhaPromotor: number
  ): Promise<CampanhaPromotor[]> {
    await RotaService.removeCampanhaPromotorRota(idCampanhaPromotor);
    return CampanhaPromotorService.unlinkCampanhaPromotor(idCampanhaPromotor);
  }

  static async getCampanhasByPromotor(promotorId: number): Promise<number[]> {
    return CampanhaPromotorService.getCampanhasByPromotor(promotorId);
  }

  /**
   * Gets all promotors by client ID
   * @param clientId - The client ID
   * @returns Array of promotors
   */
  static async getPromotoresByClientId(clientId: number): Promise<Promotor[]> {
    const promotorRepository = AppDataSourceSync.getRepository(Promotor);
    
    const promotores = await promotorRepository.find({
      where: { ID_CLIENT: clientId },
      order: {
        CREATED_AT: 'DESC',
      },
    });

    return promotores;
  }
}
