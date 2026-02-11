import { AppDataSourceSync } from "../data-source";
import Campanha from "../entities/Campanha";
import CampanhaPromotor from "../entities/CampanhaPromotor";
import RotaPromotor from "../entities/RotaPromotor";
import Oficina from "../entities/Oficina";
import { Between, LessThanOrEqual, MoreThanOrEqual, IsNull } from "typeorm";
import { DuckDBClient } from "../utils/duckdbClient";

export interface PromotorOficinaData {
  ID_PROMOTOR: number;
  ID_OFICINAS: number[];
}

export default class CampanhaService {
  /**
   * Creates a new campaign in the database
   * @param campanhaData - The campaign data to create
   * @param promotores - Optional array of promoters with their oficinas to link
   * @returns The created campaign
   */
  static async createCampanha(
    campanhaData: Partial<Campanha>,
    promotores?: PromotorOficinaData[]
  ): Promise<Campanha> {
    const campanhaRepository = AppDataSourceSync.getRepository(Campanha);
    
    const novaCampanha = campanhaRepository.create(campanhaData);
    const campanhaSalva = await campanhaRepository.save(novaCampanha);
    
    // If promotores data is provided, create the relationships
    if (promotores && promotores.length > 0 && campanhaSalva.ID_CAMPANHA) {
      await this.linkPromotoresToCampanha(campanhaSalva.ID_CAMPANHA, promotores);
    }
    
    return campanhaSalva;
  }

  /**
   * Updates an existing campaign in the database
   * @param id - The campaign ID to update
   * @param campanhaData - The campaign data to update
   * @param promotores - Optional array of promoters with their oficinas to link (replaces existing links)
   * @returns The updated campaign or null if not found
   */
  static async updateCampanha(
    id: number,
    campanhaData: Partial<Campanha>,
    promotores?: PromotorOficinaData[]
  ): Promise<Campanha | null> {
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
    
    // If promotores data is provided, update the relationships
    if (promotores && promotores.length > 0) {
      // First, soft delete existing relationships for this campaign
      await this.removePromotoresFromCampanha(id);
      
      // Then create new relationships
      await this.linkPromotoresToCampanha(id, promotores);
    }
    
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
   * Joins with DuckDB data to add flag_engajamento, flag_sentimento, flag_treinamento, and cor_icone to oficinas
   * @param idPromotor - The promoter ID
   * @param datetime - Optional datetime to check (defaults to current time)
   * @returns The active campaign with rotas array (each rota includes nested oficina with DuckDB data) or null if not found
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

    // Get oficina IDs from rotas
    const oficinaIds = rotasPromotor
      .map((rota) => rota.oficina?.ID_OFICINA)
      .filter((id): id is number => id != null);

    // Query DuckDB for additional oficina data
    const duckdbData = await DuckDBClient.getOficinaDataByIds(oficinaIds);

    // Merge DuckDB data with oficina objects in rotas
    const rotasWithDuckDBData = rotasPromotor.map((rota) => {
      if (rota.oficina && rota.oficina.ID_OFICINA) {
        const duckData = duckdbData.get(rota.oficina.ID_OFICINA);
        
        return {
          ...rota,
          oficina: {
            ...rota.oficina,
            flag_engajamento: duckData?.flag_engajamento || 'baixo',
            flag_sentimento: duckData?.flag_sentimento || 'neutro',
            flag_treinamento: duckData?.flag_treinamento || 'baixo',
            cor_icone: duckData?.cor_icone || 'cinza',
          } as Oficina & { flag_engajamento: string; flag_sentimento: string; flag_treinamento: string; cor_icone: string },
        };
      }
      return rota;
    });

    return {
      ...campanha,
      rotas: rotasWithDuckDBData,
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

  /**
   * Links promoters and their oficinas to a campaign
   * @param campanhaId - The campaign ID
   * @param promotores - Array of promoters with their oficinas
   */
  static async linkPromotoresToCampanha(
    campanhaId: number,
    promotores: PromotorOficinaData[]
  ): Promise<void> {
    const campanhaPromotorRepository = AppDataSourceSync.getRepository(CampanhaPromotor);
    const rotaPromotorRepository = AppDataSourceSync.getRepository(RotaPromotor);

    for (const promotorData of promotores) {
      // Create CampanhaPromotor relationship
      const campanhaPromotor = campanhaPromotorRepository.create({
        ID_CAMPANHA: campanhaId,
        ID_PROMOTOR: promotorData.ID_PROMOTOR,
      });
      
      const campanhaPromotorSalvo = await campanhaPromotorRepository.save(campanhaPromotor);

      // Create RotaPromotor for each oficina
      if (campanhaPromotorSalvo.ID_CAMPANHA_PROMOTOR) {
        for (const idOficina of promotorData.ID_OFICINAS) {
          const rotaPromotor = rotaPromotorRepository.create({
            ID_CAMPANHA_PROMOTOR: campanhaPromotorSalvo.ID_CAMPANHA_PROMOTOR,
            ID_OFICINA: idOficina,
          });
          
          await rotaPromotorRepository.save(rotaPromotor);
        }
      }
    }
  }

  /**
   * Removes (soft deletes) all promoter relationships for a campaign
   * @param campanhaId - The campaign ID
   */
  static async removePromotoresFromCampanha(campanhaId: number): Promise<void> {
    const campanhaPromotorRepository = AppDataSourceSync.getRepository(CampanhaPromotor);
    const rotaPromotorRepository = AppDataSourceSync.getRepository(RotaPromotor);

    // Find all CampanhaPromotor relationships for this campaign
    const campanhaPromotores = await campanhaPromotorRepository.find({
      where: { ID_CAMPANHA: campanhaId, DELETED_AT: IsNull() },
    });

    // Soft delete all associated RotaPromotor records
    for (const campanhaPromotor of campanhaPromotores) {
      if (campanhaPromotor.ID_CAMPANHA_PROMOTOR) {
        const rotasPromotor = await rotaPromotorRepository.find({
          where: { 
            ID_CAMPANHA_PROMOTOR: campanhaPromotor.ID_CAMPANHA_PROMOTOR,
            DELETED_AT: IsNull(),
          },
        });

        for (const rota of rotasPromotor) {
          if (rota.ID_ROTA_PROMOTOR) {
            await rotaPromotorRepository.softDelete(rota.ID_ROTA_PROMOTOR);
          }
        }
        
        // Soft delete the CampanhaPromotor relationship
        await campanhaPromotorRepository.softDelete(campanhaPromotor.ID_CAMPANHA_PROMOTOR);
      }
    }
  }
}
