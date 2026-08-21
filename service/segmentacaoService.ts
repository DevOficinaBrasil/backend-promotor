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

  /** Teto de contatos por página aceito pela API de preview do CRM. */
  static readonly PREVIEW_PAGE_SIZE = 100;

  /**
   * Percorre TODAS as páginas do preview e devolve os external_user_ids.
   *
   * O `previewContacts` faz uma chamada só, e a API do CRM rejeita `limit > 100`
   * — então recortar a comunidade inteira exige paginar pelo cursor
   * `afterContactId`. Sem isto o filtro parecia atingir no máximo 100 contatos.
   *
   * @param maxContatos teto de segurança; ao ser atingido devolve
   *        `truncado: true` para a tela avisar que a contagem está incompleta.
   */
  static async previewContactsAll(
    dsl: Record<string, unknown>,
    tenantId: number,
    maxContatos: number
  ): Promise<{
    externalUserIds: number[];
    estimatedCount: number;
    truncado: boolean;
    paginas: number;
  }> {
    const externalUserIds: number[] = [];
    const maxPaginas = Math.max(1, Math.ceil(maxContatos / this.PREVIEW_PAGE_SIZE));

    let afterContactId: string | undefined;
    let estimatedCount = 0;
    let hasMore = false;
    let paginas = 0;

    while (paginas < maxPaginas) {
      const result = await previewSegmentDefinition(dsl as any, {
        tenantId,
        limit: this.PREVIEW_PAGE_SIZE,
        afterContactId,
        // A contagem total não muda entre páginas; pedir uma vez evita o custo.
        includeEstimatedCount: paginas === 0,
        accessToken: process.env.CRM_API_TOKEN!,
      });

      paginas += 1;
      if (paginas === 1) {
        estimatedCount = result.estimatedCount ?? 0;
      }

      for (const contato of result.sampleArray as Array<Record<string, unknown>>) {
        const id = parseInt(String(contato.external_user_id), 10);
        if (!isNaN(id)) externalUserIds.push(id);
      }

      hasMore = result.hasMore;
      const ultimo = result.sampleArray[result.sampleArray.length - 1] as
        | Record<string, unknown>
        | undefined;

      // Sem cursor não há como avançar; parar evita repetir a mesma página.
      if (!hasMore || !ultimo?.id) break;
      afterContactId = String(ultimo.id);
    }

    return { externalUserIds, estimatedCount, truncado: hasMore, paginas };
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
