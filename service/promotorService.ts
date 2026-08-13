

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
import SegmentacaoService from "./segmentacaoService";
import { haversineDistanceKm } from "../utils/haversine";
import Oficina from "../entities/Oficina";

export default class PromotorService {
  private static getPromotorRepo() {
    return new MigrationAwareRepository<Promotor>(Promotor, "ID_PROMOTOR");
  }

  // private static getCampanhaPromotorRepo() {
  //   return new MigrationAwareRepository<CampanhaPromotor>(CampanhaPromotor, "ID_CAMPANHA_PROMOTOR");
  // }

  private static async includeLatLongToPromotor(promotor: Promotor): Promise<Promotor> 
  {
    const geolocationService = new GeolocationService();

    const latLong = await geolocationService.getLatLongByCep(promotor.CEP as string);

    if(latLong) 
    {
      promotor.LATITUDE = latLong.lat;
      promotor.LONGITUDE = latLong.long;
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
    empresaSlug?: string,
    filtroSegmentacao?: Record<string, unknown> | null
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
      const result = await this.linkCampanhaPromotor(campanhaIds, promotorSalvo.ID_PROMOTOR!, raio, empresaSlug, filtroSegmentacao);
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
        let oficinas;

        if (cp.FILTRO_SEGMENTACAO) {
          try {
            oficinas = await this.getOficinasViaSegmentacao(
              cp.FILTRO_SEGMENTACAO, empresaSlug,
              promotor.LATITUDE!, promotor.LONGITUDE!, raio
            );
          } catch (error) {
            console.error(
              `Segmentação CRM falhou para CP ${cp.ID_CAMPANHA_PROMOTOR}, fallback para comunidade:`,
              error
            );
            oficinas = await OficinaService.getComunityNearbyOficinas(
              promotor.LATITUDE!, promotor.LONGITUDE!, raio, empresaSlug
            );
          }
        } else {
          oficinas = await OficinaService.getComunityNearbyOficinas(
            promotor.LATITUDE!, promotor.LONGITUDE!, raio, empresaSlug
          );
        }

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

  private static async getOficinasViaSegmentacao(
    dsl: Record<string, unknown>,
    empresaSlug: string,
    latitude: number,
    longitude: number,
    radiusKm: number
  ) {
    const tenantId = await SegmentacaoService.resolveTenantId(empresaSlug);
    if (!tenantId) throw new Error(`TenantId não encontrado para slug: ${empresaSlug}`);

    const PREVIEW_LIMIT = 100;
    const preview = await SegmentacaoService.previewContacts(dsl, tenantId, PREVIEW_LIMIT);

    if (preview.hasMore) {
      console.warn(
        `Preview CRM retornou hasMore=true para slug ${empresaSlug}. ` +
        `Processando apenas ${preview.externalUserIds.length} de ~${preview.estimatedCount} contatos.`
      );
    }

    return OficinaService.getSegmentedNearbyOficinas(
      latitude, longitude, radiusKm, preview.externalUserIds
    );
  }

  /**
   * Updates an existing promoter in the database
   * @param id - The promoter ID to update
   * @param promotorData - The promoter data to update
   * @returns The updated promoter or null if not found
   */
  static async updatePromotor(
    id: number, 
    promotorData: Partial<Promotor>, 
    empresaSlug?: string,
    filtroSegmentacao?: Record<string, unknown> | null,
    raio?: number
  ): Promise<{ promotor: Promotor; autoAssignResult?: { rotasCriadas: number; error?: string } } | null> {
    const repo = this.getPromotorRepo();
    
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

    const cepAlterado = promotorData.CEP !== undefined && promotorData.CEP !== promotorExistente.CEP;
    const raioAlterado = raio !== undefined;
    const filtroAlterado = filtroSegmentacao !== undefined;

    // Atualiza RAIO em todos os vínculos campanha-promotor ativos
    if (raioAlterado) {
      await this.updateRaioEmCampanhaPromotores(id, raio);
    }

    // Atualiza FILTRO_SEGMENTACAO em todos os vínculos campanha-promotor ativos
    if (filtroAlterado) {
      await this.updateFiltroEmCampanhaPromotores(id, filtroSegmentacao);
    }

    // Update the promoter fields
    Object.assign(promotorExistente, promotorData);

    if (cepAlterado) {
      await this.includeLatLongToPromotor(promotorExistente);
    }
    
    const promotorAtualizado = await repo.save(promotorExistente);

    // Recalcula rotas se CEP, raio ou filtro mudaram
    let autoAssignResult: { rotasCriadas: number; error?: string } | undefined;
    const devReassignar = cepAlterado || raioAlterado || filtroAlterado;
    if (devReassignar && promotorAtualizado.LATITUDE && promotorAtualizado.LONGITUDE) {
      autoAssignResult = await this.reassignRotasAfterCepChange(promotorAtualizado, empresaSlug);
    }
    
    return { promotor: promotorAtualizado, autoAssignResult };
  }

  private static async updateFiltroEmCampanhaPromotores(
    idPromotor: number,
    filtroSegmentacao: Record<string, unknown> | null
  ): Promise<void> {
    await AppDataSourceSync.query(
      `UPDATE "CAMPANHAS_OB"."CAMPANHA_PROMOTOR"
       SET "FILTRO_SEGMENTACAO" = $1, "UPDATED_AT" = NOW()
       WHERE "ID_PROMOTOR" = $2 AND "DELETED_AT" IS NULL`,
      [filtroSegmentacao ? JSON.stringify(filtroSegmentacao) : null, idPromotor]
    );
  }

  private static async updateRaioEmCampanhaPromotores(
    idPromotor: number,
    raio: number
  ): Promise<void> {
    await AppDataSourceSync.query(
      `UPDATE "CAMPANHAS_OB"."CAMPANHA_PROMOTOR"
       SET "RAIO" = $1, "UPDATED_AT" = NOW()
       WHERE "ID_PROMOTOR" = $2 AND "DELETED_AT" IS NULL`,
      [raio, idPromotor]
    );
  }

  private static async reassignRotasAfterCepChange(
    promotor: Promotor,
    empresaSlug?: string
  ): Promise<{ rotasCriadas: number; error?: string }> {
    const campanhaPromotorRepo = AppDataSourceSync.getRepository(CampanhaPromotor);
    const allCampanhaPromotores = await campanhaPromotorRepo.find({
      where: { ID_PROMOTOR: promotor.ID_PROMOTOR },
      relations: ["campanha"],
    });

    // Only process active campaigns
    const now = new Date();
    const campanhaPromotores = allCampanhaPromotores.filter(cp => {
      const campanha = cp.campanha;
      if (!campanha?.START_TIME || !campanha?.END_TIME) return false;
      return now >= new Date(campanha.START_TIME) && now <= new Date(campanha.END_TIME);
    });

    if (campanhaPromotores.length === 0) {
      return { rotasCriadas: 0 };
    }

    // Capture oficinas assigned to this promoter before removing them
    const freedOficinasPorCampanha = new Map<number, number[]>();
    for (const cp of campanhaPromotores) {
      const rotas = await AppDataSourceSync.query(
        `SELECT "ID_OFICINA" FROM "CAMPANHAS_OB"."ROTA_PROMOTOR" 
         WHERE "ID_CAMPANHA_PROMOTOR" = $1 AND "DELETED_AT" IS NULL`,
        [cp.ID_CAMPANHA_PROMOTOR]
      );
      freedOficinasPorCampanha.set(cp.ID_CAMPANHA!, rotas.map((r: any) => r.ID_OFICINA));
    }

    // Remove existing routes for all campaign associations
    for (const cp of campanhaPromotores) {
      await RotaService.removeCampanhaPromotorRota(cp.ID_CAMPANHA_PROMOTOR!);
    }

    // Resolve empresaSlug from existing campaign data if not provided
    const slug = empresaSlug ?? await this.resolveEmpresaSlugFromCampanha(campanhaPromotores[0].ID_CAMPANHA!);

    let result: { rotasCriadas: number; error?: string } = { rotasCriadas: 0 };
    if (slug) {
      result = await this.autoAssignRotas(promotor, campanhaPromotores, slug);
    }

    // Redistribute freed oficinas to all promoters (including changed one) in the same campaigns
    await this.redistributeFreedOficinas(freedOficinasPorCampanha);

    return result;
  }

  private static async resolveEmpresaSlugFromCampanha(idCampanha: number): Promise<string | null> {
    try {
      const rows = await AppDataSourceSync.query(
        `SELECT DISTINCT cm."EmpresaSlug"
         FROM "CAMPANHAS_OB"."ROTA_PROMOTOR" rp
         INNER JOIN "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" cp ON rp."ID_CAMPANHA_PROMOTOR" = cp."ID_CAMPANHA_PROMOTOR"
         INNER JOIN "MAIN_REGISTER"."USUARIO" us ON us."ID_OFICINA" = rp."ID_OFICINA"
         INNER JOIN "MAIN_REGISTER"."USUARIO_COMMUNITY" uc ON us."ID_USUARIO" = uc."id_usuario"
         INNER JOIN "OFICINA_PORTAL"."COMMUNITIES" cm ON cm."CommunityID" = uc."id_community"
         WHERE cp."ID_CAMPANHA" = $1
         LIMIT 1`,
        [idCampanha]
      );
      return rows.length > 0 ? rows[0].EmpresaSlug : null;
    } catch (error) {
      console.error('Failed to resolve EmpresaSlug from campaign:', error);
      return null;
    }
  }

  private static async redistributeFreedOficinas(
    freedOficinasPorCampanha: Map<number, number[]>
  ): Promise<void> {
    const campanhaPromotorRepo = AppDataSourceSync.getRepository(CampanhaPromotor);
    const oficinaRepo = AppDataSourceSync.getRepository(Oficina);
    const now = new Date();

    for (const [idCampanha, freedOficinaIds] of freedOficinasPorCampanha) {
      if (freedOficinaIds.length === 0) continue;

      // Skip inactive campaigns
      const campanhaRows = await AppDataSourceSync.query(
        `SELECT "START_TIME", "END_TIME" FROM "CAMPANHAS_OB"."CAMPANHA" WHERE "ID_CAMPANHA" = $1 AND "DELETED_AT" IS NULL LIMIT 1`,
        [idCampanha]
      );
      if (campanhaRows.length === 0) continue;
      const camp = campanhaRows[0];
      if (!camp.START_TIME || !camp.END_TIME) continue;
      if (now < new Date(camp.START_TIME) || now > new Date(camp.END_TIME)) continue;

      // Check which of the freed oficinas are still unassigned
      const assignedOficinas = await RotaService.getOficinasAssignedInCampanha(idCampanha);
      const assignedSet = new Set(assignedOficinas);
      const unassignedIds = freedOficinaIds.filter(id => !assignedSet.has(id));

      if (unassignedIds.length === 0) continue;

      // Load coordinates of unassigned oficinas
      const oficinas = await oficinaRepo.findBy({ ID_OFICINA: In(unassignedIds) });
      const oficinasWithCoords = oficinas.filter(o => o.LATITUDE && o.LONGITUDE);

      if (oficinasWithCoords.length === 0) continue;

      // Find all promoters in this campaign
      const allCPs = await campanhaPromotorRepo.find({
        where: { ID_CAMPANHA: idCampanha }
      });

      for (const cp of allCPs) {

        const promotor = await this.findPromotorById(cp.ID_PROMOTOR!);
        if (!promotor?.LATITUDE || !promotor?.LONGITUDE) continue;

        const raio = cp.RAIO ?? 20;

        // Re-check what's still unassigned (previous iteration may have assigned some)
        const currentAssigned = await RotaService.getOficinasAssignedInCampanha(idCampanha);
        const currentAssignedSet = new Set(currentAssigned);

        const oficinasParaAtribuir = oficinasWithCoords
          .filter(o => !currentAssignedSet.has(o.ID_OFICINA!))
          .filter(o => {
            const dist = haversineDistanceKm(
              promotor.LATITUDE!, promotor.LONGITUDE!,
              parseFloat(o.LATITUDE!), parseFloat(o.LONGITUDE!)
            );
            return dist <= raio;
          })
          .map(o => o.ID_OFICINA!);

        if (oficinasParaAtribuir.length > 0) {
          try {
            await RotaService.createRotas(cp.ID_CAMPANHA_PROMOTOR!, oficinasParaAtribuir);
            console.log(`Redistributed ${oficinasParaAtribuir.length} freed oficinas to CAMPANHA_PROMOTOR ${cp.ID_CAMPANHA_PROMOTOR}`);
          } catch (error) {
            console.error(`Redistribute failed for CAMPANHA_PROMOTOR ${cp.ID_CAMPANHA_PROMOTOR}:`, error);
          }
        }
      }
    }
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
    empresaSlug?: string,
    filtroSegmentacao?: Record<string, unknown> | null
  ): 
    Promise<{ campanhaPromotores: CampanhaPromotor[]; autoAssignResult?: { rotasCriadas: number; error?: string } }> 
  {
    const campanhaPromotores = await CampanhaPromotorService.linkCampanhaPromotor(campanhaIds, promotorId, raio, filtroSegmentacao);

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
