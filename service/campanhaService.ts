import { AppDataSourceSync } from "../data-source";
import Campanha from "../entities/Campanha";
import CampanhaPromotor from "../entities/CampanhaPromotor";
import RotaPromotor from "../entities/RotaPromotor";
import Oficina from "../entities/Oficina";
import { Between, LessThanOrEqual, MoreThanOrEqual, IsNull } from "typeorm";

export default class CampanhaService {
  /**
   * Creates a new campaign in the database
   * @param campanhaData - The campaign data to create
   * @returns The created campaign
   */
  static async createCampanha(campanhaData: Partial<Campanha>): Promise<Campanha> {
    const campanhaRepository = AppDataSourceSync.getRepository(Campanha);
    
    const novaCampanha = campanhaRepository.create(campanhaData);
    const campanhaSalva = await campanhaRepository.save(novaCampanha);
    
    return campanhaSalva;
  }

  /**
   * Updates an existing campaign in the database
   * @param id - The campaign ID to update
   * @param campanhaData - The campaign data to update
   * @returns The updated campaign or null if not found
   */
  static async updateCampanha(id: number, campanhaData: Partial<Campanha>): Promise<Campanha | null> {
    const campanhaRepository = AppDataSourceSync.getRepository(Campanha);
    
    // Find the campaign by ID
    const campanhaExistente = await campanhaRepository.findOne({
      where: { ID_CAMPANHA: id }
    });

    if (!campanhaExistente) {
      return null;
    }

    // Update the campaign fields
    Object.assign(campanhaExistente, campanhaData);
    
    const campanhaAtualizada = await campanhaRepository.save(campanhaExistente);
    
    return campanhaAtualizada;
  }

  /**
   * Soft deletes a campaign by ID
   * @param id - The campaign ID to delete
   * @returns The deleted campaign or null if not found
   */
  static async deleteCampanha(id: number): Promise<Campanha | null> {
    const campanhaRepository = AppDataSourceSync.getRepository(Campanha);
    
    // Find the campaign by ID
    const campanhaExistente = await campanhaRepository.findOne({
      where: { ID_CAMPANHA: id }
    });

    if (!campanhaExistente) {
      return null;
    }

    // Soft delete the campaign
    await campanhaRepository.softDelete(id);
    
    return campanhaExistente;
  }

  /**
   * Finds a campaign by ID
   * @param id - The campaign ID to find
   * @returns The campaign or null if not found
   */
  static async findCampanhaById(id: number): Promise<Campanha | null> {
    const campanhaRepository = AppDataSourceSync.getRepository(Campanha);
    
    const campanha = await campanhaRepository.findOne({
      where: { ID_CAMPANHA: id }
    });

    return campanha;
  }

  /**
   * Gets the active campaign for a promoter based on current datetime
   * @param idPromotor - The promoter ID
   * @param datetime - Optional datetime to check (defaults to current time)
   * @returns The active campaign with rotas array (each rota includes nested oficina) or null if not found
   */
  static async getActiveCampanhaByPromotor(
    idPromotor: number,
    datetime?: Date
  ): Promise<(Campanha & { rotas: RotaPromotor[] }) | null> {
    const currentDatetime = datetime || new Date();
    const campanhaRepository = AppDataSourceSync.getRepository(Campanha);
    const campanhaPromotorRepository = AppDataSourceSync.getRepository(CampanhaPromotor);
    const rotaPromotorRepository = AppDataSourceSync.getRepository(RotaPromotor);

    // Find all campanha_promotor relationships for this promoter
    const campanhasPromotor = await campanhaPromotorRepository.find({
      where: {
        ID_PROMOTOR: idPromotor,
        DELETED_AT: IsNull(),
      },
      relations: ['campanha'],
    });

    // Filter to find active campaigns (current datetime is between START_TIME and END_TIME)
    const activeCampanha = campanhasPromotor.find((cp) => {
      const campanha = cp.campanha;
      
      // If START_TIME or END_TIME is not set, the campaign is not considered active
      if (!campanha || !campanha.START_TIME || !campanha.END_TIME) {
        return false;
      }

      // Check if current datetime is within the campaign period
      return currentDatetime >= campanha.START_TIME && currentDatetime <= campanha.END_TIME;
    });

    if (!activeCampanha || !activeCampanha.campanha) {
      return null;
    }

    const campanha = activeCampanha.campanha;

    // Get the rotas (routes) for this campaign promoter with join to OFICINA table
    const rotasPromotor = await rotaPromotorRepository.find({
      where: {
        ID_CAMPANHA_PROMOTOR: activeCampanha.ID_CAMPANHA_PROMOTOR,
        DELETED_AT: IsNull(),
      },
      relations: ['oficina'],
    });

    return {
      ...campanha,
      rotas: rotasPromotor,
    };
  }

  /**
   * Gets all campaigns (non-deleted)
   * @returns Array of all campaigns
   */
  static async getAllCampanhas(): Promise<Campanha[]> {
    const campanhaRepository = AppDataSourceSync.getRepository(Campanha);
    
    const campanhas = await campanhaRepository.find({
      order: {
        CREATED_AT: 'DESC',
      },
    });

    return campanhas;
  }

  /**
   * Gets a campaign by ID with its relationships
   * @param id - The campaign ID
   * @returns The campaign with related promoters and questions, or null if not found
   */
  static async getCampanhaByIdWithRelations(id: number): Promise<Campanha | null> {
    const campanhaRepository = AppDataSourceSync.getRepository(Campanha);
    
    const campanha = await campanhaRepository.findOne({
      where: { ID_CAMPANHA: id },
      relations: ['campanhaPromotores', 'campanhaPromotores.promotor', 'campanhaPromotores.rotasPromotor', 'campanhaPromotores.rotasPromotor.oficina', 'campanhaPerguntas'],
    });

    return campanha;
  }

  /**
   * Gets all campaigns by client ID
   * @param clientId - The client ID
   * @returns Array of campaigns for the client or empty array if none found
   */
  static async getCampanhasByClientId(clientId: number): Promise<Campanha[]> {
    const campanhaRepository = AppDataSourceSync.getRepository(Campanha);
    
    const campanhas = await campanhaRepository.find({
      where: { ID_CLIENT: clientId },
      relations: ['campanhaPromotores', 'campanhaPromotores.promotor', 'campanhaPromotores.rotasPromotor', 'campanhaPromotores.rotasPromotor.oficina', 'campanhaPerguntas'],
      order: {
        CREATED_AT: 'DESC',
      },
    });

    return campanhas;
  }
}
