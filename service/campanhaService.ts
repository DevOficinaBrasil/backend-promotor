import { AppDataSourceSync } from "../data-source";
import Campanha from "../entities/Campanha";
import CampanhaPromotor, { EstrategiaOrdenacao } from "../entities/CampanhaPromotor";
import RotaPromotor from "../entities/RotaPromotor";
import Oficina from "../entities/Oficina";
import { IsNull } from "typeorm";
import { StatusNotificacaoVisita } from "../entities/NotificacaoVisita";
import { statusEfetivo, rotaListavelParaPromotor } from "../utils/statusNotificacaoVisita";
import {
  DISTINCT_CADASTRO_EMPRESA_POR_OFICINA,
  JOIN_CADASTRO_EMPRESA_POR_ROTA,
  ORDEM_CADASTRO_EMPRESA_POR_OFICINA,
} from "../utils/sqlCadastroEmpresa";

export interface PromotorOficinaData {
  ID_PROMOTOR: number;
  ID_OFICINAS: number[];
}

export default class CampanhaService {
  private static getCampanhaRepo() {
    return AppDataSourceSync.getRepository(Campanha);
  }

  private static getCampanhaPromotorRepo() {
    return AppDataSourceSync.getRepository(CampanhaPromotor);
  }

  /**
   * Builds the nested visit-confirmation status object for one route row of a
   * route-list read (NOTIF-19 / spec P2 AC2).
   *
   * STATUS is always the *effective* status: a stored ENVIADO whose EXPIRA_EM
   * has silently passed must read EXPIRADO here too (spec AC22), or a link
   * nobody ever opened would look live in the promoter app forever. Routes
   * with no notification row return undefined rather than throwing.
   */
  private static montarNotificacaoVisita(fonte: {
    STATUS?: StatusNotificacaoVisita | null;
    EXPIRA_EM?: Date | string | null;
    CONFIRMADO_EM?: Date | string | null;
  }): { STATUS: StatusNotificacaoVisita | undefined; CONFIRMADO_EM: Date | string | null } | undefined {
    if (!fonte.STATUS) {
      return undefined;
    }

    return {
      STATUS: statusEfetivo({
        STATUS: fonte.STATUS,
        EXPIRA_EM: fonte.EXPIRA_EM ? new Date(fonte.EXPIRA_EM) : null,
      }),
      CONFIRMADO_EM: fonte.CONFIRMADO_EM ?? null,
    };
  }

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
    const repo = this.getCampanhaRepo();
    
    const novaCampanha = repo.create(campanhaData);
    const campanhaSalva = await repo.save(novaCampanha);
    
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
    const repo = this.getCampanhaRepo();
    
    // Find the campaign by ID (searches both DBs)
    const campanhaExistente = await repo.findOne({
      where: { ID_CAMPANHA: id }
    });

    if (!campanhaExistente) {
      return null;
    }

    // Update the campaign fields
    Object.assign(campanhaExistente, campanhaData);
    
    const campanhaAtualizada = await repo.save(campanhaExistente);
    
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
    const repo = this.getCampanhaRepo();
    
    // Find the campaign by ID (searches both DBs)
    const campanhaExistente = await repo.findOne({
      where: { ID_CAMPANHA: id }
    });

    if (!campanhaExistente) {
      return null;
    }

    // Soft delete the campaign (always on new DB)
    await repo.softDelete(id);
    
    return campanhaExistente;
  }

  /**
   * Publica a campanha: é o que a torna visível para o promotor em
   * GET /campanha/ativa. Até aqui ela existe (com vínculos e rotas já
   * distribuídas), mas só o cliente enxerga, montando-a no wizard.
   *
   * @param id - ID da campanha
   * @returns a campanha publicada, ou null se não existir
   * @throws se a campanha não tiver período definido — sem START_TIME/END_TIME
   *         ela nunca seria considerada ativa, então publicar seria um no-op
   *         silencioso.
   */
  static async publicarCampanha(id: number): Promise<Campanha | null> {
    const repo = this.getCampanhaRepo();

    const campanha = await repo.findOne({ where: { ID_CAMPANHA: id } });
    if (!campanha) {
      return null;
    }

    if (!campanha.START_TIME || !campanha.END_TIME) {
      throw new Error(
        'A campanha precisa de data de início e fim para ser publicada.'
      );
    }

    if (campanha.STATUS === 'PUBLICADA') {
      return campanha;
    }

    campanha.STATUS = 'PUBLICADA';
    return repo.save(campanha);
  }

  /**
   * Finds a campaign by ID
   * @param id - The campaign ID to find
   * @returns The campaign or null if not found
   */
  static async findCampanhaById(id: number): Promise<Campanha | null> {
    const repo = this.getCampanhaRepo();
    
    const campanha = await repo.findOne({
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
  ): Promise<(Campanha & { ESTRATEGIA_ORDENACAO: EstrategiaOrdenacao | 'PROXIMIDADE_PROMOTOR'; rotas: RotaPromotor[] }) | null> {
    const currentDatetime = datetime || new Date();
    const cpRepo = this.getCampanhaPromotorRepo();

    // Find all campanha_promotor relationships for this promoter (both DBs)
    const campanhasPromotor = await cpRepo.find({
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

      // Campanha em rascunho ainda está sendo montada no wizard do ob-ads: os
      // vínculos e rotas já existem, mas o promotor não pode enxergá-la.
      if (campanha.STATUS !== 'PUBLICADA') {
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
    // const rotasPromotor = await rotaPromotorRepository.find({
    //   where: {
    //     ID_CAMPANHA_PROMOTOR: activeCampanha.ID_CAMPANHA_PROMOTOR,
    //     DELETED_AT: IsNull(),
    //   },
    //   relations: ['oficina'],
    //   order: { ORDEM: { direction: 'ASC', nulls: 'LAST' } },
    // });

    // Get the rotas for this campaign promoter with oficina data
    const fullRotasQuery = `
      SELECT 
        rp.*,
        ce.latitude as "LATITUDE",
        ce.longitude as "LONGITUDE",
        COALESCE(o."NOME_FANTASIA", ce.razao_social) as "NOME_FANTASIA",
        TRIM(CONCAT(COALESCE(ce.logradouro,''), ' ', COALESCE(ce.rua,''))) as "ENDERECO",
        ce.bairro as "BAIRRO",
        ce.cidade as "CIDADE",
        ce.estado as "ESTADO",
        ce.numero as "NUMERO",
        ce.cep as "CEP",
        ce.cnpj as "CNPJ",
        ce.telefone as "TELEFONE",
        nv."STATUS" as "NOTIFICACAO_STATUS",
        nv."EXPIRA_EM" as "NOTIFICACAO_EXPIRA_EM",
        nv."CONFIRMADO_EM" as "NOTIFICACAO_CONFIRMADO_EM"
      FROM "CAMPANHAS_OB"."ROTA_PROMOTOR" rp
      LEFT JOIN "MAIN_REGISTER"."OFICINA" o
      ON rp."ID_OFICINA" = o."ID_OFICINA"${JOIN_CADASTRO_EMPRESA_POR_ROTA}
      LEFT JOIN "CAMPANHAS_OB"."NOTIFICACAO_VISITA" nv
      ON rp."ID_ROTA_PROMOTOR" = nv."ID_ROTA_PROMOTOR"
      WHERE rp."ID_CAMPANHA_PROMOTOR" = $1
      AND rp."DELETED_AT" IS NULL
      ORDER BY rp."ORDEM" ASC NULLS LAST, rp."ID_ROTA_PROMOTOR" ASC`;

    const rotasPromotor = await AppDataSourceSync.query(fullRotasQuery, [
      activeCampanha.ID_CAMPANHA_PROMOTOR,
    ]);

    // FILT-01 a FILT-05: a lista do app traz só rota cuja confirmação está
    // resolvida, rota sem pedido de confirmação e rota já trabalhada. Filtra
    // antes do enriquecimento para não pagar consulta por rota que não vai sair.
    // Só esta consulta filtra — as duas do dashboard devolvem tudo (FILT-08).
    const rotasVisiveis = rotasPromotor.filter((r: any) =>
      rotaListavelParaPromotor(
        {
          STATUS: r.STATUS,
          notificacao: r.NOTIFICACAO_STATUS
            ? {
                STATUS: r.NOTIFICACAO_STATUS,
                EXPIRA_EM: r.NOTIFICACAO_EXPIRA_EM ? new Date(r.NOTIFICACAO_EXPIRA_EM) : null,
              }
            : null,
        },
        currentDatetime
      )
    );

    // Enrich legacy rotas (without oficina data) from new DB
    const rotasSemOficina = rotasVisiveis.filter((r: any) => r.ID_OFICINA && !r.NOME_FANTASIA);
    if (rotasSemOficina.length > 0) {
      const oficinaIds = [...new Set(rotasSemOficina.map((r: any) => r.ID_OFICINA))];
      const oficinas = await AppDataSourceSync.query(`
        SELECT ${DISTINCT_CADASTRO_EMPRESA_POR_OFICINA}
          ce.id_oficina as "ID_OFICINA",
          ce.latitude as "LATITUDE",
          ce.longitude as "LONGITUDE",
          COALESCE(o."NOME_FANTASIA", ce.razao_social) as "NOME_FANTASIA",
          TRIM(CONCAT(COALESCE(ce.logradouro,''), ' ', COALESCE(ce.rua,''))) as "ENDERECO",
          ce.bairro as "BAIRRO",
          ce.cidade as "CIDADE",
          ce.estado as "ESTADO",
          ce.numero as "NUMERO",
          ce.cep as "CEP",
          ce.cnpj as "CNPJ",
          ce.telefone as "TELEFONE"
        FROM dw.cadastro_empresa ce
        LEFT JOIN "MAIN_REGISTER"."OFICINA" o ON ce.id_oficina = o."ID_OFICINA"
        WHERE ce.id_oficina = ANY($1)
        ${ORDEM_CADASTRO_EMPRESA_POR_OFICINA}
      `, [oficinaIds]);
      const oficinaMap = new Map(oficinas.map((o: any) => [o.ID_OFICINA, o]));
      for (const rota of rotasSemOficina) {
        const oficina = oficinaMap.get(rota.ID_OFICINA);
        if (oficina) {
          Object.assign(rota, oficina);
        }
      }
    }

    // Merge DuckDB data with oficina objects in rotas
    const rotasWithDuckDBData = rotasVisiveis.map((rota : any) => {
      // P2 AC2: every route in the list carries its confirmation status.
      const notificacaoVisita = this.montarNotificacaoVisita({
        STATUS: rota.NOTIFICACAO_STATUS,
        EXPIRA_EM: rota.NOTIFICACAO_EXPIRA_EM,
        CONFIRMADO_EM: rota.NOTIFICACAO_CONFIRMADO_EM,
      });

      if (rota.ID_OFICINA) {

        const payloadOficina = {
          ID_OFICINA: rota.ID_OFICINA,
          LATITUDE: rota.LATITUDE,
          LONGITUDE: rota.LONGITUDE,
          NOME_FANTASIA: rota.NOME_FANTASIA,
          ENDERECO: rota.ENDERECO,
          BAIRRO: rota.BAIRRO,
          CIDADE: rota.CIDADE,
          ESTADO: rota.ESTADO,
          NUMERO: rota.NUMERO,
          CEP: rota.CEP,
          CNPJ: rota.CNPJ,
          TELEFONE: rota.TELEFONE,
        }

        const payloadRota = {
          ID_ROTA_PROMOTOR: rota.ID_ROTA_PROMOTOR,
          ID_OFICINA: rota.ID_OFICINA,
          ID_CAMPANHA_PROMOTOR: rota.ID_CAMPANHA_PROMOTOR,
          STATUS: rota.STATUS,
          SUCCESS: rota.SUCCESS,
          CHECKIN_TIME: rota.CHECKIN_TIME,
          DONE_AT: rota.DONE_AT,
          OBS: rota.OBS,
          REDIRECT: rota.REDIRECT,
          CREATED_BY: rota.CREATED_BY,
          ORDEM: rota.ORDEM,
          UPDATED_AT: rota.UPDATED_AT,
          CREATED_AT: rota.CREATED_AT,
          DELETED_AT: rota.DELETED_AT,
        }
        
        return {
          ...payloadRota,
          ...(notificacaoVisita ? { notificacaoVisita } : {}),
          oficina: {
            ...payloadOficina,
            flag_engajamento: 'neutro',
            flag_sentimento: 'neutro',
            flag_treinamento: 'neutro',
            cor_icone: 'cinza',
          } as Oficina & { flag_engajamento: string; flag_sentimento: string; flag_treinamento: string; cor_icone: string },
        };
      }
      return notificacaoVisita ? { ...rota, notificacaoVisita } : rota;
    });

    return {
      ...campanha,
      ESTRATEGIA_ORDENACAO: activeCampanha.ESTRATEGIA_ORDENACAO || 'PROXIMIDADE_PROMOTOR',
      rotas: rotasWithDuckDBData,
    };
  }

  /**
   * Gets all campaigns (non-deleted)
   * @returns Array of all campaigns
   */
  static async getAllCampanhas(): Promise<Campanha[]> {
    const repo = this.getCampanhaRepo();
    
    const campanhas = await repo.find({
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
    const repo = this.getCampanhaRepo();
    
    const campanha = await repo.findOne({
      where: { ID_CAMPANHA: id },
      relations: ['campanhaPromotores', 'campanhaPromotores.promotor', 'campanhaPromotores.rotasPromotor', 'campanhaPromotores.rotasPromotor.oficina', 'campanhaPromotores.rotasPromotor.notificacaoVisita', 'campanhaPerguntas', 'campanhaPerguntas.opcoes'],
    });

    // P2 AC2: each route in this list reports its *effective* confirmation
    // status, so an expired-but-unopened link never reads as still live.
    for (const campanhaPromotor of campanha?.campanhaPromotores ?? []) {
      for (const rota of campanhaPromotor.rotasPromotor ?? []) {
        if (rota.notificacaoVisita) {
          rota.notificacaoVisita.STATUS = statusEfetivo(rota.notificacaoVisita);
        }
      }
    }

    return campanha;
  }

  /**
   * Gets all campaigns by client ID
   * @param clientId - The client ID
   * @returns Array of campaigns for the client or empty array if none found
   */
  static async getCampanhasByClientId(clientId: number): Promise<Campanha[]> {
    // 1. Get campanhas (from both DBs)
    const campanhas = await AppDataSourceSync.query(
      `SELECT c.*
      FROM "CAMPANHAS_OB"."CAMPANHA" c
      WHERE c."ID_CLIENT" = $1
        AND c."DELETED_AT" IS NULL
      ORDER BY c."CREATED_AT" DESC`,
      [clientId]
    );

    if (!campanhas.length) return [];

    const campanhaIds = campanhas.map((c: any) => c.ID_CAMPANHA);

    // 2. Get campanhaPromotores with promotor
    const campanhaPromotores = await AppDataSourceSync.query(
      `SELECT
        cp.*,
        p."ID_PROMOTOR" as "promotor_ID_PROMOTOR",
        p."NOME" as "promotor_NOME",
        p."EMAIL" as "promotor_EMAIL",
        p."CPF" as "promotor_CPF",
        p."ID_CLIENT" as "promotor_ID_CLIENT",
        p."CREATED_BY" as "promotor_CREATED_BY",
        p."UPDATED_AT" as "promotor_UPDATED_AT",
        p."CREATED_AT" as "promotor_CREATED_AT",
        p."DELETED_AT" as "promotor_DELETED_AT"
      FROM "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" cp
      LEFT JOIN "CAMPANHAS_OB"."PROMOTOR" p ON cp."ID_PROMOTOR" = p."ID_PROMOTOR"
      WHERE cp."ID_CAMPANHA" = ANY($1)
        AND cp."DELETED_AT" IS NULL`,
      [campanhaIds]
    );

    const campanhaPromotorIds = campanhaPromotores
      .filter((cp: any) => cp.ID_CAMPANHA_PROMOTOR)
      .map((cp: any) => cp.ID_CAMPANHA_PROMOTOR);

    // 3. Get rotasPromotor with oficina data from cadastro_empresa + OFICINA
    let rotasPromotor: any[] = [];
    if (campanhaPromotorIds.length > 0) {
      const fullQuery = `
        SELECT 
          rp.*,
          ce.latitude as "oficina_LATITUDE",
          ce.longitude as "oficina_LONGITUDE",
          COALESCE(o."NOME_FANTASIA", ce.razao_social) as "oficina_NOME_FANTASIA",
          TRIM(CONCAT(COALESCE(ce.logradouro,''), ' ', COALESCE(ce.rua,''))) as "oficina_ENDERECO",
          ce.bairro as "oficina_BAIRRO",
          ce.cidade as "oficina_CIDADE",
          ce.estado as "oficina_ESTADO",
          ce.numero as "oficina_NUMERO",
          ce.cep as "oficina_CEP",
          ce.cnpj as "oficina_CNPJ",
          ce.telefone as "oficina_TELEFONE",
          nv."STATUS" as "NOTIFICACAO_STATUS",
          nv."EXPIRA_EM" as "NOTIFICACAO_EXPIRA_EM",
          nv."CONFIRMADO_EM" as "NOTIFICACAO_CONFIRMADO_EM"
        FROM "CAMPANHAS_OB"."ROTA_PROMOTOR" rp
        LEFT JOIN "MAIN_REGISTER"."OFICINA" o ON rp."ID_OFICINA" = o."ID_OFICINA"${JOIN_CADASTRO_EMPRESA_POR_ROTA}
        LEFT JOIN "CAMPANHAS_OB"."NOTIFICACAO_VISITA" nv
          ON rp."ID_ROTA_PROMOTOR" = nv."ID_ROTA_PROMOTOR"
        WHERE rp."ID_CAMPANHA_PROMOTOR" = ANY($1)
          AND rp."DELETED_AT" IS NULL
        ORDER BY rp."ORDEM" ASC NULLS LAST`;

      rotasPromotor = await AppDataSourceSync.query(fullQuery, [campanhaPromotorIds]);

      // Enrich legacy rotas (those without oficina data) with oficina info from new DB
      const rotasSemOficina = rotasPromotor.filter(r => r.ID_OFICINA && !r.oficina_NOME_FANTASIA);
      if (rotasSemOficina.length > 0) {
        const oficinaIds = [...new Set(rotasSemOficina.map(r => r.ID_OFICINA))];
        const oficinas = await AppDataSourceSync.query(`
          SELECT ${DISTINCT_CADASTRO_EMPRESA_POR_OFICINA}
            ce.id_oficina as "ID_OFICINA",
            ce.latitude as "oficina_LATITUDE",
            ce.longitude as "oficina_LONGITUDE",
            COALESCE(o."NOME_FANTASIA", ce.razao_social) as "oficina_NOME_FANTASIA",
            TRIM(CONCAT(COALESCE(ce.logradouro,''), ' ', COALESCE(ce.rua,''))) as "oficina_ENDERECO",
            ce.bairro as "oficina_BAIRRO",
            ce.cidade as "oficina_CIDADE",
            ce.estado as "oficina_ESTADO",
            ce.numero as "oficina_NUMERO",
            ce.cep as "oficina_CEP",
            ce.cnpj as "oficina_CNPJ",
            ce.telefone as "oficina_TELEFONE"
          FROM dw.cadastro_empresa ce
          LEFT JOIN "MAIN_REGISTER"."OFICINA" o ON ce.id_oficina = o."ID_OFICINA"
          WHERE ce.id_oficina = ANY($1)
          ${ORDEM_CADASTRO_EMPRESA_POR_OFICINA}
        `, [oficinaIds]);

        const oficinaMap = new Map(oficinas.map((o: any) => [o.ID_OFICINA, o]));
        for (const rota of rotasSemOficina) {
          const oficina = oficinaMap.get(rota.ID_OFICINA);
          if (oficina) {
            Object.assign(rota, oficina);
          }
        }
      }
    }

    // 4. Get campanhaPerguntas (from both DBs)
    const perguntas = await AppDataSourceSync.query(
      `SELECT cp.*
      FROM "CAMPANHAS_OB"."CAMPANHA_PERGUNTAS" cp
      WHERE cp."ID_CAMPANHA" = ANY($1)
        AND cp."DELETED_AT" IS NULL`,
      [campanhaIds]
    );

    const perguntaIds = perguntas
      .filter((p: any) => p.ID_PERGUNTAS)
      .map((p: any) => p.ID_PERGUNTAS);

    // 5. Get opcoes
    let opcoes: any[] = [];
    if (perguntaIds.length > 0) {
      opcoes = await AppDataSourceSync.query(
        `SELECT o.*
        FROM "CAMPANHAS_OB"."CAMPANHA_PERGUNTA_OPCOES" o
        WHERE o."ID_PERGUNTAS" = ANY($1)
          AND o."DELETED_AT" IS NULL`,
        [perguntaIds]
      );
    }

    // 6. Assemble nested structure
    return campanhas.map((campanha: any) => {
      const campanhaPerguntas = perguntas
        .filter((p: any) => p.ID_CAMPANHA === campanha.ID_CAMPANHA)
        .map((p: any) => ({
          ...p,
          opcoes: opcoes.filter((o: any) => o.ID_PERGUNTAS === p.ID_PERGUNTAS),
        }));

      const promotores = campanhaPromotores
        .filter((cp: any) => cp.ID_CAMPANHA === campanha.ID_CAMPANHA)
        .map((cp: any) => {
          const promotor = {
            ID_PROMOTOR: cp.promotor_ID_PROMOTOR,
            NOME: cp.promotor_NOME,
            EMAIL: cp.promotor_EMAIL,
            CPF: cp.promotor_CPF,
            ID_CLIENT: cp.promotor_ID_CLIENT,
            CREATED_BY: cp.promotor_CREATED_BY,
            UPDATED_AT: cp.promotor_UPDATED_AT,
            CREATED_AT: cp.promotor_CREATED_AT,
            DELETED_AT: cp.promotor_DELETED_AT,
          };

          const rotas = rotasPromotor
            .filter((r: any) => r.ID_CAMPANHA_PROMOTOR === cp.ID_CAMPANHA_PROMOTOR)
            .map((r: any) => {
              // P2 AC1/AC3: the route carries its effective confirmation status.
              // This literal lists its fields one by one - it is not a spread of
              // `r` - so a column added to the query above and not added here is
              // silently dropped.
              const notificacaoVisita = this.montarNotificacaoVisita({
                STATUS: r.NOTIFICACAO_STATUS,
                EXPIRA_EM: r.NOTIFICACAO_EXPIRA_EM,
                CONFIRMADO_EM: r.NOTIFICACAO_CONFIRMADO_EM,
              });

              return {
                ID_ROTA_PROMOTOR: r.ID_ROTA_PROMOTOR,
                ID_OFICINA: r.ID_OFICINA,
                ID_CAMPANHA_PROMOTOR: r.ID_CAMPANHA_PROMOTOR,
                STATUS: r.STATUS,
                SUCCESS: r.SUCCESS,
                CHECKIN_TIME: r.CHECKIN_TIME,
                DONE_AT: r.DONE_AT,
                OBS: r.OBS,
                REDIRECT: r.REDIRECT,
                CREATED_BY: r.CREATED_BY,
                ORDEM: r.ORDEM,
                UPDATED_AT: r.UPDATED_AT,
                CREATED_AT: r.CREATED_AT,
                DELETED_AT: r.DELETED_AT,
                ...(notificacaoVisita ? { notificacaoVisita } : {}),
                oficina: r.ID_OFICINA ? {
                  ID_OFICINA: r.ID_OFICINA,
                  LATITUDE: r.oficina_LATITUDE,
                  LONGITUDE: r.oficina_LONGITUDE,
                  NOME_FANTASIA: r.oficina_NOME_FANTASIA,
                  ENDERECO: r.oficina_ENDERECO,
                  BAIRRO: r.oficina_BAIRRO,
                  CIDADE: r.oficina_CIDADE,
                  ESTADO: r.oficina_ESTADO,
                  NUMERO: r.oficina_NUMERO,
                  CEP: r.oficina_CEP,
                  CNPJ: r.oficina_CNPJ,
                  TELEFONE: r.oficina_TELEFONE,
                } : null,
                };
            });

          return {
            ID_CAMPANHA_PROMOTOR: cp.ID_CAMPANHA_PROMOTOR,
            ID_CAMPANHA: cp.ID_CAMPANHA,
            ID_PROMOTOR: cp.ID_PROMOTOR,
            ESTRATEGIA_ORDENACAO: cp.ESTRATEGIA_ORDENACAO,
            ID_OFICINA_INICIO: cp.ID_OFICINA_INICIO,
            ID_OFICINA_FIM: cp.ID_OFICINA_FIM,
            UPDATED_AT: cp.UPDATED_AT,
            CREATED_AT: cp.CREATED_AT,
            DELETED_AT: cp.DELETED_AT,
            promotor,
            rotasPromotor: rotas,
          };
        });

      return {
        ...campanha,
        campanhaPromotores: promotores,
        campanhaPerguntas,
      };
    });
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
