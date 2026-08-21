import { AppDataSourceSync } from "../data-source";
import CampanhaPromotor from "../entities/CampanhaPromotor";

export default class CampanhaPromotorService {
  private static getRepo() {
    return AppDataSourceSync.getRepository(CampanhaPromotor);
  }

  static async linkCampanhaPromotor(
    campanhaIds: number | number[], 
    promotorId: number,
    raio?: number,
    filtroSegmentacao?: Record<string, unknown> | null
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
          FILTRO_SEGMENTACAO: filtroSegmentacao ?? null,
        });
        newRelationships.push(campanhaPromotor);
      }
    }
    
    if (newRelationships.length > 0) {
      const savedRelationships = await repo.save(newRelationships);
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

  static async updateFiltroSegmentacao(
    idCampanhaPromotor: number,
    filtro: Record<string, unknown> | null
  ): Promise<CampanhaPromotor | null> {
    const repo = AppDataSourceSync.getRepository(CampanhaPromotor);
    const cp = await repo.findOne({ where: { ID_CAMPANHA_PROMOTOR: idCampanhaPromotor } });
    if (!cp) return null;

    cp.FILTRO_SEGMENTACAO = filtro;
    await repo.save(cp);
    return cp;
  }

  static async getFiltroSegmentacao(
    idCampanhaPromotor: number
  ): Promise<{ filtro: Record<string, unknown> | null; empresaSlug: string | null } | null> {
    const rows = await AppDataSourceSync.query(
      `SELECT cp."FILTRO_SEGMENTACAO", c."EMPRESA_SLUG"
       FROM "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" cp
       INNER JOIN "CAMPANHAS_OB"."CAMPANHA" c ON c."ID_CAMPANHA" = cp."ID_CAMPANHA"
       WHERE cp."ID_CAMPANHA_PROMOTOR" = $1`,
      [idCampanhaPromotor]
    );
    if (rows.length === 0) return null;
    return { filtro: rows[0].FILTRO_SEGMENTACAO, empresaSlug: rows[0].EMPRESA_SLUG };
  }
}
