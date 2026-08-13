import { AppDataSourceSync } from "../data-source";
import {
  SegmentValidator,
  previewSegmentDefinition,
  listSegmentFilterOptions,
} from "@obcrm/segmentation";

export default class SegmentacaoService {
  static validateDsl(dsl: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const validator = new SegmentValidator();
    const result = validator.validateDefinition("dynamic", dsl as any);
    return result.valid
      ? { valid: true }
      : { valid: false, errors: result.errorArray };
  }

  static async resolveTenantId(empresaSlug: string): Promise<number | null> {
    const rows = await AppDataSourceSync.query(
      `SELECT "CommunityID" FROM "OFICINA_PORTAL"."COMMUNITIES" WHERE "EmpresaSlug" = $1 LIMIT 1`,
      [empresaSlug]
    );
    return rows.length > 0 ? rows[0].CommunityID : null;
  }

  static async resolveTenantIdByCampanha(idCampanha: number): Promise<number | null> {
    const rows = await AppDataSourceSync.query(
      `SELECT cm."CommunityID"
       FROM "CAMPANHAS_OB"."CAMPANHA" c
       INNER JOIN "OFICINA_PORTAL"."COMMUNITIES" cm ON cm."EmpresaSlug" = c."EMPRESA_SLUG"
       WHERE c."ID_CAMPANHA" = $1 AND c."EMPRESA_SLUG" IS NOT NULL
       LIMIT 1`,
      [idCampanha]
    );
    return rows.length > 0 ? rows[0].CommunityID : null;
  }

  static async previewContacts(
    dsl: Record<string, unknown>,
    tenantId: number,
    limit: number
  ): Promise<{
    externalUserIds: number[];
    estimatedCount: number;
    hasMore: boolean;
    sampleArray: Array<Record<string, unknown>>;
  }> {
    const result = await previewSegmentDefinition(dsl as any, {
      tenantId,
      limit,
      includeEstimatedCount: true,
      accessToken: process.env.CRM_API_TOKEN!,
    });

    const externalUserIds = result.sampleArray
      .map((c: any) => parseInt(c.external_user_id, 10))
      .filter((id: number) => !isNaN(id));

    return {
      externalUserIds,
      estimatedCount: result.estimatedCount ?? 0,
      hasMore: result.hasMore,
      sampleArray: result.sampleArray,
    };
  }

  static async listFilterOptions(tenantId: number): Promise<Record<string, unknown>> {
    return listSegmentFilterOptions({
      tenantId,
      attributeLimit: 100,
      tagLimit: 200,
      accessToken: process.env.CRM_API_TOKEN!,
    });
  }
}
