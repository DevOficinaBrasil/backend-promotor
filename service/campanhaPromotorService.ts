import { AppDataSourceSync } from "../data-source";
import CampanhaPromotor from "../entities/CampanhaPromotor";
import { MigrationAwareRepository } from "../utils/migrationRepository";

export default class CampanhaPromotorService {
  private static getRepo() {
    return new MigrationAwareRepository<CampanhaPromotor>(CampanhaPromotor, "ID_CAMPANHA_PROMOTOR");
  }

  static async linkCampanhaPromotor(
    campanhaIds: number | number[], 
    promotorId: number,
    raio?: number
  ): Promise<CampanhaPromotor[]> {
    const repo = this.getRepo();
    
    const idsArray = Array.isArray(campanhaIds) ? campanhaIds : [campanhaIds];
    
    const existingRelationships = await repo.find({
      where: {
        ID_PROMOTOR: promotorId,
      },
    });
    
    const existingCampanhaIds = new Set(
      existingRelationships.map(rel => rel.ID_CAMPANHA!)
    );
    
    const newRelationships: CampanhaPromotor[] = [];
    
    for (const campanhaId of idsArray) {
      if (!existingCampanhaIds.has(campanhaId)) {
        const campanhaPromotor = repo.create({
          ID_CAMPANHA: campanhaId,
          ID_PROMOTOR: promotorId,
          RAIO: raio ?? 20,
        });
        newRelationships.push(campanhaPromotor);
      }
    }
    
    if (newRelationships.length > 0) {
      const savedRelationships = await repo.saveMany(newRelationships);
      return savedRelationships;
    }
    
    return [];
  }

  static async updateRaio(
    idCampanhaPromotor: number,
    raio: number
  ): Promise<CampanhaPromotor | null> {
    const campanhaPromotorRepository = AppDataSourceSync.getRepository(CampanhaPromotor);
    const relationship = await campanhaPromotorRepository.findOne({
      where: {
        ID_CAMPANHA_PROMOTOR: idCampanhaPromotor,
      },
    });

    if (relationship) {
      relationship.RAIO = raio;
      await campanhaPromotorRepository.save(relationship);
      return relationship;
    }

    return null;
  }

  static async unlinkCampanhaPromotor(
    idCampanhaPromotor: number
  ): Promise<CampanhaPromotor[]> {
    const campanhaPromotorRepository = AppDataSourceSync.getRepository(CampanhaPromotor);
    
    const relationshipToRemove = await campanhaPromotorRepository.findOne({
      where: {
        ID_CAMPANHA_PROMOTOR: idCampanhaPromotor,
      },
    });

    if (relationshipToRemove) {
      await campanhaPromotorRepository.remove(relationshipToRemove);
      return [relationshipToRemove];
    }

    return [];
  }

  static async getCampanhasByPromotor(promotorId: number): Promise<number[]> {
    const campanhaPromotorRepository = AppDataSourceSync.getRepository(CampanhaPromotor);
    const relationships = await campanhaPromotorRepository.find({
      where: { ID_PROMOTOR: promotorId },
      select: ["ID_CAMPANHA"],
    });
    return relationships.map(rel => rel.ID_CAMPANHA!);
  }
}
