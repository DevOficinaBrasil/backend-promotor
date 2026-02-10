import { AppDataSourceSync } from "../data-source";
import Campanha from "../entities/Campanha";
import CampanhaPromotor from "../entities/CampanhaPromotor";
import RotaPromotor from "../entities/RotaPromotor";
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
   * @returns The active campaign with oficinas array or null if not found
   */
  static async getActiveCampanhaByPromotor(
    idPromotor: number,
    datetime?: Date
  ): Promise<(Campanha & { oficinas: { ID_OFICINA: number }[] }) | null> {
    const currentDatetime = datetime || new Date();
    const campanhaRepository = AppDataSourceSync.getRepository(Campanha);
    const campanhaPromotorRepository = AppDataSourceSync.getRepository(CampanhaPromotor);
    const rotaPromotorRepository = AppDataSourceSync.getRepository(RotaPromotor);

    // Find the campanha_promotor relationship for this promoter
    const campanhaPromotor = await campanhaPromotorRepository.findOne({
      where: {
        ID_PROMOTOR: idPromotor,
        DELETED_AT: IsNull(),
      },
      relations: ['campanha'],
    });

    if (!campanhaPromotor || !campanhaPromotor.campanha) {
      return null;
    }

    // Check if the campaign is active (current datetime is between START_TIME and END_TIME)
    const campanha = campanhaPromotor.campanha;
    
    // If START_TIME or END_TIME is not set, the campaign is not considered active
    if (!campanha.START_TIME || !campanha.END_TIME) {
      return null;
    }

    // Check if current datetime is within the campaign period
    if (currentDatetime < campanha.START_TIME || currentDatetime > campanha.END_TIME) {
      return null;
    }

    // Get the oficinas (workshops) for this campaign promoter
    const rotasPromotor = await rotaPromotorRepository.find({
      where: {
        ID_CAMPANHA_PROMOTOR: campanhaPromotor.ID_CAMPANHA_PROMOTOR,
        DELETED_AT: IsNull(),
      },
    });

    // Extract oficina IDs
    const oficinas = rotasPromotor
      .filter(rota => rota.ID_OFICINA !== undefined && rota.ID_OFICINA !== null)
      .map(rota => ({ ID_OFICINA: rota.ID_OFICINA! }));

    return {
      ...campanha,
      oficinas,
    };
  }
}
