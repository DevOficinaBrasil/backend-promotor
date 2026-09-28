import { AppDataSourceSync } from "../data-source";
import Oficina from "../entities/Oficina";
import { DuckDBClient } from "../utils/duckdbClient";
import { ligacaoCadastroEmpresa } from "../utils/sqlCadastroEmpresa";
import { resolverTelefone, CandidatoUsuarioTelefone } from "../utils/telefone";
import { estadoConvite, EstadoConvite } from "../utils/statusNotificacaoVisita";
import { StatusNotificacaoVisita } from "../entities/NotificacaoVisita";

// Earth's radius in kilometers (used for Haversine formula)
const EARTH_RADIUS_KM = 6371;

/** Região já resolvida: UF + cidade, ou centro (do CEP) + raio em km. */
export type RegiaoResolvida =
  | { uf: string; cidade: string }
  | { lat: number; lon: number; raioKm: number };

/** Oficina da base Oficina Brasil devolvida à tela de admin (CONV-09). */
export interface OficinaSegmentada {
  ID_OFICINA: number;
  NOME: string;
  CIDADE: string;
  ESTADO: string;
  CEP: string;
  LATITUDE: number;
  LONGITUDE: number;
  membroComunidade: boolean;
  importada: boolean;
  temWhatsapp: boolean;
  recusouNestaCampanha: boolean;
  rotaAtual: {
    ID_ROTA_PROMOTOR: number;
    ID_CAMPANHA_PROMOTOR: number;
    promotorNome: string | null;
    estado: EstadoConvite;
  } | null;
}

// Mesmos pares do `translate` no SQL: os dois lados precisam casar.
const ACENTOS = "áàâãäéèêëíìîïóòôõöúùûüç";
const SEM_ACENTOS = "aaaaaeeeeiiiiooooouuuuc";

/** Cidade em minúsculas e sem acento, igual ao `translate(lower(trim(...)))` do SQL. */
export function normalizarCidade(cidade: string): string {
  return Array.from(cidade.trim().toLowerCase())
    .map((c) => {
      const i = ACENTOS.indexOf(c);
      return i >= 0 ? SEM_ACENTOS[i] : c;
    })
    .join("");
}

export default class OficinaService {
  /**
   * Finds the nearest oficinas based on latitude and longitude
   * Uses the Haversine formula to calculate distance
   * Joins with DuckDB data to add flag_engajamento, flag_sentimento, flag_treinamento, and cor_icone
   * @param latitude - Reference latitude
   * @param longitude - Reference longitude
   * @param limit - Maximum number of results (default: 40)
   * @returns Array of oficinas sorted by distance with DuckDB data
   */
  static async findNearestOficinas(
    latitude: number,
    longitude: number,
    limit: number = 70
  ): Promise<Array<Oficina & { distance?: number; flag_engajamento?: string; flag_sentimento?: string; flag_treinamento?: string; cor_icone?: string }>> {

    // The Haversine formula to calculate distance between two points on Earth
    // Distance in kilometers
    const query = `
      SELECT 
        ce.id_oficina as "ID_OFICINA",
        ce.latitude as "LATITUDE",
        ce.longitude as "LONGITUDE",
        COALESCE(o."NOME_FANTASIA", ce.razao_social) as "NOME_FANTASIA",
        CONCAT(ce.logradouro, ' ', ce.rua) as "ENDERECO",
        ce.bairro as "BAIRRO",
        ce.cidade as "CIDADE",
        ce.estado as "ESTADO",
        ce.numero as "NUMERO",
        ce.cep as "CEP",
        ce.cnpj as "CNPJ",
        ce.telefone as "TELEFONE",
        (
          ${EARTH_RADIUS_KM} * acos(
            cos(radians($1)) * 
            cos(radians(ce.latitude)) *
            cos(radians(ce.longitude) - radians($2)) +
            sin(radians($1)) *
            sin(radians(ce.latitude))
          )
        ) AS distance
      FROM "dw"."cadastro_empresa" ce
      LEFT JOIN "MAIN_REGISTER"."OFICINA" o
      ON  ce.id_oficina = o."ID_OFICINA"
      WHERE
        ce.latitude IS NOT NULL
        AND ce.longitude IS NOT NULL
        AND ce.status_receita = 'ATIVA'
        AND ce.cnpj IN (SELECT DISTINCT "CNPJ" FROM dw.temp_cnpj_sqlserver where "CREATED_AT" > '2026-01-01')
      ORDER BY distance ASC
      LIMIT $3
    `;

    try {
      const results = await AppDataSourceSync.query(query, [
        latitude,
        longitude,
        limit,
      ]);

      // Merge DuckDB data with PostgreSQL results
      const mergedResults = results.map((oficina: any) => {
        
        return {
          ...oficina,
          flag_engajamento: 'neutro',
          flag_sentimento: 'neutro',
          flag_treinamento: 'neutro',
          cor_icone: 'cinza',
        };
      });

      return mergedResults;
    } catch (error) {
      console.error(
        `Error finding nearest oficinas (lat: ${latitude}, lon: ${longitude}, limit: ${limit}):`,
        error
      );
      throw error;
    }
  }

  public static async getComunityNearbyOficinas(
    latitude: number,
    longitude: number,
    radiusKm: number,
    empresaSlug: string
  ): Promise<Array<{
    ID_OFICINA: number;
    LATITUDE: number;
    LONGITUDE: number;
    NOME_FANTASIA: string;
    ENDERECO: string;
    BAIRRO: string;
    CIDADE: string;
    ESTADO: string;
    NUMERO: string;
    CEP: string;
    CNPJ: string;
    TELEFONE: string;
    distance: number;
  }>> {
    // O ramo `OFICINA_IMPORTADA` (oficinas vinculadas ao cliente sem usuário,
    // CON26-162) lê lat/long direto de MAIN_REGISTER.OFICINA, não de
    // dw.cadastro_empresa: uma oficina recém-importada tipicamente ainda não
    // tem linha no DW (ETL externo, em lote). O import garante LATITUDE/
    // LONGITUDE preenchidos antes de criar o vínculo, então essa fonte é
    // confiável para o filtro de raio. Sem filtro de status_receita/ATIVO
    // neste ramo — ver Risks & Concerns em design.md.
    const query = `
      SELECT DISTINCT ON ("ID_OFICINA") * FROM (
        (
          SELECT DISTINCT ON (us."ID_OFICINA")
            us."ID_OFICINA" AS "ID_OFICINA",
            ce."latitude" AS "LATITUDE",
            ce."longitude" AS "LONGITUDE",
            ce."razao_social"::text AS "NOME_FANTASIA",
            CONCAT(ce."logradouro", ' ', ce."rua")::text AS "ENDERECO",
            ce."bairro"::text AS "BAIRRO",
            ce."cidade"::text AS "CIDADE",
            ce."estado"::text AS "ESTADO",
            ce."numero"::text AS "NUMERO",
            ce."cep"::text AS "CEP",
            ce."cnpj"::text AS "CNPJ",
            ce."telefone"::text AS "TELEFONE",
            (
              ${EARTH_RADIUS_KM} * acos(
                cos(radians($2)) * cos(radians(ce."latitude")) *
                cos(radians(ce."longitude") - radians($3)) +
                sin(radians($2)) * sin(radians(ce."latitude"))
              )
            ) AS distance
          FROM "OFICINA_PORTAL"."COMMUNITIES" cm
          INNER JOIN "MAIN_REGISTER"."USUARIO_COMMUNITY" uc
            ON cm."CommunityID" = uc."id_community"
          INNER JOIN "MAIN_REGISTER"."USUARIO" us
            ON us."ID_USUARIO" = uc."id_usuario"
          LEFT JOIN "MAIN_REGISTER"."OFICINA" o
            ON o."ID_OFICINA" = us."ID_OFICINA"${ligacaoCadastroEmpresa('o', 'us."ID_OFICINA"')}
          WHERE cm."EmpresaSlug" = $1
            AND ce."longitude" IS NOT NULL
            AND ce."latitude" IS NOT NULL
            AND ce.cnpj_int IS NOT NULL
            AND ce."status_receita" = 'ATIVA'
            AND (
              ${EARTH_RADIUS_KM} * acos(
                cos(radians($2)) * cos(radians(ce."latitude")) *
                cos(radians(ce."longitude") - radians($3)) +
                sin(radians($2)) * sin(radians(ce."latitude"))
              )
            ) <= $4
          ORDER BY us."ID_OFICINA", distance ASC
        )
        UNION ALL
        (
          SELECT
            oi."ID_OFICINA" AS "ID_OFICINA",
            o."LATITUDE"::double precision AS "LATITUDE",
            o."LONGITUDE"::double precision AS "LONGITUDE",
            o."NOME_FANTASIA"::text AS "NOME_FANTASIA",
            o."ENDERECO"::text AS "ENDERECO",
            o."BAIRRO"::text AS "BAIRRO",
            o."CIDADE"::text AS "CIDADE",
            o."ESTADO"::text AS "ESTADO",
            o."NUMERO"::text AS "NUMERO",
            o."CEP"::text AS "CEP",
            o."CNPJ"::text AS "CNPJ",
            o."TELEFONE"::text AS "TELEFONE",
            (
              ${EARTH_RADIUS_KM} * acos(
                cos(radians($2)) * cos(radians(o."LATITUDE"::double precision)) *
                cos(radians(o."LONGITUDE"::double precision) - radians($3)) +
                sin(radians($2)) * sin(radians(o."LATITUDE"::double precision))
              )
            ) AS distance
          FROM "CAMPANHAS_OB"."OFICINA_IMPORTADA" oi
          INNER JOIN "MAIN_REGISTER"."OFICINA" o
            ON o."ID_OFICINA" = oi."ID_OFICINA"
          WHERE oi."EMPRESA_SLUG" = $1
            AND oi."DELETED_AT" IS NULL
            AND o."LATITUDE" IS NOT NULL
            AND o."LONGITUDE" IS NOT NULL
            AND (
              ${EARTH_RADIUS_KM} * acos(
                cos(radians($2)) * cos(radians(o."LATITUDE"::double precision)) *
                cos(radians(o."LONGITUDE"::double precision) - radians($3)) +
                sin(radians($2)) * sin(radians(o."LATITUDE"::double precision))
              )
            ) <= $4
        )
      ) combinado
      ORDER BY "ID_OFICINA", distance ASC
    `;

    try {
      const results = await AppDataSourceSync.query(query, [
        empresaSlug,
        latitude,
        longitude,
        radiusKm,
      ]);

      return results;
    } catch (error) {
      console.error(
        `Error finding community nearby oficinas (lat: ${latitude}, lon: ${longitude}, radius: ${radiusKm}km, slug: ${empresaSlug}):`,
        error
      );
      throw error;
    }
  }

  public static async getSegmentedNearbyOficinas(
    latitude: number,
    longitude: number,
    radiusKm: number,
    externalUserIds: number[]
  ): Promise<Array<{
    ID_OFICINA: number;
    LATITUDE: number;
    LONGITUDE: number;
    NOME_FANTASIA: string;
    ENDERECO: string;
    BAIRRO: string;
    CIDADE: string;
    ESTADO: string;
    NUMERO: string;
    CEP: string;
    CNPJ: string;
    TELEFONE: string;
    distance: number;
  }>> {
    if (externalUserIds.length === 0) return [];

    const BATCH_SIZE = 1000;
    const allResults: any[] = [];

    for (let i = 0; i < externalUserIds.length; i += BATCH_SIZE) {
      const batch = externalUserIds.slice(i, i + BATCH_SIZE);
      const placeholders = batch.map((_, idx) => `$${idx + 4}`).join(", ");

      const query = `
        SELECT DISTINCT ON (us."ID_OFICINA")
          us."ID_OFICINA" AS "ID_OFICINA",
          ce."latitude" AS "LATITUDE",
          ce."longitude" AS "LONGITUDE",
          ce."razao_social" AS "NOME_FANTASIA",
          CONCAT(ce."logradouro", ' ', ce."rua") AS "ENDERECO",
          ce."bairro" AS "BAIRRO",
          ce."cidade" AS "CIDADE",
          ce."estado" AS "ESTADO",
          ce."numero" AS "NUMERO",
          ce."cep" AS "CEP",
          ce."cnpj" AS "CNPJ",
          ce."telefone" AS "TELEFONE",
          (
            ${EARTH_RADIUS_KM} * acos(
              cos(radians($1)) * cos(radians(ce."latitude")) *
              cos(radians(ce."longitude") - radians($2)) +
              sin(radians($1)) * sin(radians(ce."latitude"))
            )
          ) AS distance
        FROM "MAIN_REGISTER"."USUARIO" us
        LEFT JOIN "MAIN_REGISTER"."OFICINA" o
          ON o."ID_OFICINA" = us."ID_OFICINA"${ligacaoCadastroEmpresa('o', 'us."ID_OFICINA"')}
        WHERE us."ID_USUARIO" IN (${placeholders})
          AND ce."longitude" IS NOT NULL
          AND ce."latitude" IS NOT NULL
          AND ce.cnpj_int IS NOT NULL
          AND ce."status_receita" = 'ATIVA'
          AND (
            ${EARTH_RADIUS_KM} * acos(
              cos(radians($1)) * cos(radians(ce."latitude")) *
              cos(radians(ce."longitude") - radians($2)) +
              sin(radians($1)) * sin(radians(ce."latitude"))
            )
          ) <= $3
        ORDER BY us."ID_OFICINA", distance ASC
      `;

      try {
        const results = await AppDataSourceSync.query(query, [
          latitude, longitude, radiusKm, ...batch
        ]);
        allResults.push(...results);
      } catch (error) {
        console.error(
          `Error finding segmented nearby oficinas (lat: ${latitude}, lon: ${longitude}, radius: ${radiusKm}km, batch ${i / BATCH_SIZE + 1}):`,
          error
        );
        throw error;
      }
    }

    // Deduplica por ID_OFICINA (batches podem ter overlap)
    const seen = new Set<number>();
    return allResults.filter((r: any) => {
      if (seen.has(r.ID_OFICINA)) return false;
      seen.add(r.ID_OFICINA);
      return true;
    });
  }

  /**
   * Lists ALL active oficinas from a client's community (no radius filter).
   * Same source/columns as getComunityNearbyOficinas, without the Haversine clause.
   * Used by the campaign wizard map to plot uncovered ("sem promotor") oficinas.
   * @param empresaSlug - Community EmpresaSlug
   */
  public static async getCommunityOficinas(empresaSlug: string): Promise<Array<{
    ID_OFICINA: number;
    LATITUDE: number;
    LONGITUDE: number;
    NOME_FANTASIA: string;
    ENDERECO: string;
    BAIRRO: string;
    CIDADE: string;
    ESTADO: string;
    NUMERO: string;
    CEP: string;
    CNPJ: string;
    TELEFONE: string;
  }>> {
    // Ver comentário em getComunityNearbyOficinas sobre o ramo OFICINA_IMPORTADA.
    const query = `
      SELECT DISTINCT ON ("ID_OFICINA") * FROM (
        (
          SELECT DISTINCT ON (us."ID_OFICINA")
            us."ID_OFICINA" AS "ID_OFICINA",
            ce."latitude" AS "LATITUDE",
            ce."longitude" AS "LONGITUDE",
            ce."razao_social"::text AS "NOME_FANTASIA",
            CONCAT(ce."logradouro", ' ', ce."rua")::text AS "ENDERECO",
            ce."bairro"::text AS "BAIRRO",
            ce."cidade"::text AS "CIDADE",
            ce."estado"::text AS "ESTADO",
            ce."numero"::text AS "NUMERO",
            ce."cep"::text AS "CEP",
            ce."cnpj"::text AS "CNPJ",
            ce."telefone"::text AS "TELEFONE"
          FROM "OFICINA_PORTAL"."COMMUNITIES" cm
          INNER JOIN "MAIN_REGISTER"."USUARIO_COMMUNITY" uc
            ON cm."CommunityID" = uc."id_community"
          INNER JOIN "MAIN_REGISTER"."USUARIO" us
            ON us."ID_USUARIO" = uc."id_usuario"
          LEFT JOIN "MAIN_REGISTER"."OFICINA" o
            ON o."ID_OFICINA" = us."ID_OFICINA"${ligacaoCadastroEmpresa('o', 'us."ID_OFICINA"')}
          WHERE cm."EmpresaSlug" = $1
            AND ce."longitude" IS NOT NULL
            AND ce."latitude" IS NOT NULL
            AND ce.cnpj_int IS NOT NULL
            AND ce."status_receita" = 'ATIVA'
        )
        UNION ALL
        (
          SELECT
            oi."ID_OFICINA" AS "ID_OFICINA",
            o."LATITUDE"::double precision AS "LATITUDE",
            o."LONGITUDE"::double precision AS "LONGITUDE",
            o."NOME_FANTASIA"::text AS "NOME_FANTASIA",
            o."ENDERECO"::text AS "ENDERECO",
            o."BAIRRO"::text AS "BAIRRO",
            o."CIDADE"::text AS "CIDADE",
            o."ESTADO"::text AS "ESTADO",
            o."NUMERO"::text AS "NUMERO",
            o."CEP"::text AS "CEP",
            o."CNPJ"::text AS "CNPJ",
            o."TELEFONE"::text AS "TELEFONE"
          FROM "CAMPANHAS_OB"."OFICINA_IMPORTADA" oi
          INNER JOIN "MAIN_REGISTER"."OFICINA" o
            ON o."ID_OFICINA" = oi."ID_OFICINA"
          WHERE oi."EMPRESA_SLUG" = $1
            AND oi."DELETED_AT" IS NULL
            AND o."LATITUDE" IS NOT NULL
            AND o."LONGITUDE" IS NOT NULL
        )
      ) combinado
      ORDER BY "ID_OFICINA"
    `;

    try {
      return await AppDataSourceSync.query(query, [empresaSlug]);
    } catch (error) {
      console.error(
        `Error listing community oficinas (slug: ${empresaSlug}):`,
        error
      );
      throw error;
    }
  }

  /**
   * Counts ALL active oficinas from a client's community (no radius filter).
   * Same source/joins as getCommunityOficinas, aggregated instead of listed.
   * @param empresaSlug - Community EmpresaSlug
   */
  public static async countCommunityOficinas(empresaSlug: string): Promise<number> {
    // Ver comentário em getComunityNearbyOficinas sobre o ramo OFICINA_IMPORTADA.
    const query = `
      SELECT COUNT(DISTINCT "ID_OFICINA")::int AS "total" FROM (
        (
          SELECT us."ID_OFICINA" AS "ID_OFICINA"
          FROM "OFICINA_PORTAL"."COMMUNITIES" cm
          INNER JOIN "MAIN_REGISTER"."USUARIO_COMMUNITY" uc
            ON cm."CommunityID" = uc."id_community"
          INNER JOIN "MAIN_REGISTER"."USUARIO" us
            ON us."ID_USUARIO" = uc."id_usuario"
          LEFT JOIN "MAIN_REGISTER"."OFICINA" o
            ON o."ID_OFICINA" = us."ID_OFICINA"${ligacaoCadastroEmpresa('o', 'us."ID_OFICINA"')}
          WHERE cm."EmpresaSlug" = $1
            AND ce."longitude" IS NOT NULL
            AND ce."latitude" IS NOT NULL
            AND ce.cnpj_int IS NOT NULL
            AND ce."status_receita" = 'ATIVA'
        )
        UNION ALL
        (
          SELECT oi."ID_OFICINA" AS "ID_OFICINA"
          FROM "CAMPANHAS_OB"."OFICINA_IMPORTADA" oi
          INNER JOIN "MAIN_REGISTER"."OFICINA" o
            ON o."ID_OFICINA" = oi."ID_OFICINA"
          WHERE oi."EMPRESA_SLUG" = $1
            AND oi."DELETED_AT" IS NULL
            AND o."LATITUDE" IS NOT NULL
            AND o."LONGITUDE" IS NOT NULL
        )
      ) combinado
    `;

    try {
      const rows = await AppDataSourceSync.query(query, [empresaSlug]);
      return rows[0]?.total ?? 0;
    } catch (error) {
      console.error(
        `Error counting community oficinas (slug: ${empresaSlug}):`,
        error
      );
      throw error;
    }
  }

  /**
   * Oficinas ATIVAS da comunidade que também atendem à segmentação do CRM.
   *
   * É o `getCommunityOficinas` cruzado com os contatos que o filtro retornou —
   * sem raio nem centro, porque no wizard a segmentação é definida antes de
   * existir promotor. Serve à camada de oficinas do mapa; a atribuição de rotas
   * continua passando por `getSegmentedNearbyOficinas`, que aplica o raio.
   */
  public static async getCommunityOficinasSegmentadas(
    empresaSlug: string,
    externalUserIds: number[]
  ): Promise<Array<{
    ID_OFICINA: number;
    LATITUDE: number;
    LONGITUDE: number;
    NOME_FANTASIA: string;
    ENDERECO: string;
    BAIRRO: string;
    CIDADE: string;
    ESTADO: string;
    NUMERO: string;
    CEP: string;
    CNPJ: string;
    TELEFONE: string;
  }>> {
    if (externalUserIds.length === 0) return [];

    const BATCH_SIZE = 1000;
    const agregado: any[] = [];
    const vistos = new Set<number>();

    for (let i = 0; i < externalUserIds.length; i += BATCH_SIZE) {
      const lote = externalUserIds.slice(i, i + BATCH_SIZE);
      const placeholders = lote.map((_, idx) => `$${idx + 2}`).join(", ");

      const query = `
        SELECT DISTINCT ON (us."ID_OFICINA")
          us."ID_OFICINA" AS "ID_OFICINA",
          ce."latitude" AS "LATITUDE",
          ce."longitude" AS "LONGITUDE",
          ce."razao_social" AS "NOME_FANTASIA",
          CONCAT(ce."logradouro", ' ', ce."rua") AS "ENDERECO",
          ce."bairro" AS "BAIRRO",
          ce."cidade" AS "CIDADE",
          ce."estado" AS "ESTADO",
          ce."numero" AS "NUMERO",
          ce."cep" AS "CEP",
          ce."cnpj" AS "CNPJ",
          ce."telefone" AS "TELEFONE"
        FROM "OFICINA_PORTAL"."COMMUNITIES" cm
        INNER JOIN "MAIN_REGISTER"."USUARIO_COMMUNITY" uc
          ON cm."CommunityID" = uc."id_community"
        INNER JOIN "MAIN_REGISTER"."USUARIO" us
          ON us."ID_USUARIO" = uc."id_usuario"
        LEFT JOIN "MAIN_REGISTER"."OFICINA" o
          ON o."ID_OFICINA" = us."ID_OFICINA"${ligacaoCadastroEmpresa('o', 'us."ID_OFICINA"')}
        WHERE cm."EmpresaSlug" = $1
          AND us."ID_USUARIO" IN (${placeholders})
          AND ce."longitude" IS NOT NULL
          AND ce."latitude" IS NOT NULL
          AND ce.cnpj_int IS NOT NULL
          AND ce."status_receita" = 'ATIVA'
        ORDER BY us."ID_OFICINA"
      `;

      try {
        const linhas = await AppDataSourceSync.query(query, [empresaSlug, ...lote]);
        // Lotes diferentes podem trazer a mesma oficina (vários usuários por
        // oficina), então o DISTINCT ON de cada lote não basta.
        for (const linha of linhas) {
          if (vistos.has(linha.ID_OFICINA)) continue;
          vistos.add(linha.ID_OFICINA);
          agregado.push(linha);
        }
      } catch (error) {
        console.error(
          `Error listing segmented community oficinas (slug: ${empresaSlug}):`,
          error
        );
        throw error;
      }
    }

    return agregado;
  }

  /**
   * Oficinas da base Oficina Brasil (tenant 15 do CRM) que estão na região,
   * a partir dos `external_user_id` que o CRM devolveu (CONV-08, CONV-09).
   *
   * Mesma ligação de `getCommunityOficinasSegmentadas` (USUARIO → OFICINA →
   * dw.cadastro_empresa), mas sem exigir a comunidade: as flags dizem se a
   * oficina é membro da comunidade do slug, importada para ele, já está em rota
   * nesta campanha ou recusou convite aqui. `temWhatsapp` sai de
   * `resolverTelefone`, a mesma regra do despacho (CONV-43), sobre todos os
   * usuários da oficina na ordem do despacho.
   */
  public static async getOficinasBaseSegmentadas(
    externalUserIds: number[],
    regiao: RegiaoResolvida,
    ctx: { idCampanha: number; empresaSlug: string | null }
  ): Promise<OficinaSegmentada[]> {
    if (externalUserIds.length === 0) return [];

    const fixos: unknown[] = [ctx.idCampanha, ctx.empresaSlug];
    let filtroRegiao: string;
    if ("uf" in regiao) {
      fixos.push(regiao.uf.trim().toUpperCase(), normalizarCidade(regiao.cidade));
      filtroRegiao = `ce.estado = $3
          AND translate(lower(trim(ce.cidade)), '${ACENTOS}', '${SEM_ACENTOS}') = $4`;
    } else {
      fixos.push(regiao.lat, regiao.lon, regiao.raioKm);
      filtroRegiao = `(
            ${EARTH_RADIUS_KM} * acos(LEAST(1.0, GREATEST(-1.0,
              cos(radians($3)) * cos(radians(ce.latitude)) *
              cos(radians(ce.longitude) - radians($4)) +
              sin(radians($3)) * sin(radians(ce.latitude))
            )))
          ) <= $5`;
    }

    const BATCH_SIZE = 1000;
    const agregado: OficinaSegmentada[] = [];
    const vistos = new Set<number>();

    for (let i = 0; i < externalUserIds.length; i += BATCH_SIZE) {
      const lote = externalUserIds.slice(i, i + BATCH_SIZE);
      const placeholders = lote.map((_, idx) => `$${idx + fixos.length + 1}`).join(", ");

      const query = `
        SELECT DISTINCT ON (us."ID_OFICINA")
          us."ID_OFICINA" AS "ID_OFICINA",
          COALESCE(o."NOME_FANTASIA", ce.razao_social) AS "NOME",
          ce.cidade AS "CIDADE",
          ce.estado AS "ESTADO",
          ce.cep AS "CEP",
          ce.latitude AS "LATITUDE",
          ce.longitude AS "LONGITUDE",
          o."TELEFONE" AS "OFICINA_TELEFONE",
          ce.telefone AS "CADASTRO_TELEFONE",
          (
            SELECT COALESCE(json_agg(json_build_object(
                     'ID_USUARIO', u_tel."ID_USUARIO",
                     'CELULAR', u_tel."CELULAR",
                     'TELEFONE', u_tel."TELEFONE")
                   ORDER BY u_tel."DATA_ALTERACAO" DESC NULLS LAST, u_tel."ID_USUARIO" ASC), '[]'::json)
              FROM "MAIN_REGISTER"."USUARIO" u_tel
             WHERE u_tel."ID_OFICINA" = us."ID_OFICINA"
          ) AS "USUARIOS",
          EXISTS (
            SELECT 1
              FROM "MAIN_REGISTER"."USUARIO" u_cm
              JOIN "MAIN_REGISTER"."USUARIO_COMMUNITY" uc ON uc."id_usuario" = u_cm."ID_USUARIO"
              JOIN "OFICINA_PORTAL"."COMMUNITIES" cm ON cm."CommunityID" = uc."id_community"
             WHERE u_cm."ID_OFICINA" = us."ID_OFICINA"
               AND cm."EmpresaSlug" = $2
          ) AS "MEMBRO_COMUNIDADE",
          EXISTS (
            SELECT 1
              FROM "CAMPANHAS_OB"."OFICINA_IMPORTADA" oi
             WHERE oi."ID_OFICINA" = us."ID_OFICINA"
               AND oi."EMPRESA_SLUG" = $2
               AND oi."DELETED_AT" IS NULL
          ) AS "IMPORTADA",
          EXISTS (
            SELECT 1
              FROM "CAMPANHAS_OB"."ROTA_PROMOTOR" rp_rec
              JOIN "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" cp_rec
                ON cp_rec."ID_CAMPANHA_PROMOTOR" = rp_rec."ID_CAMPANHA_PROMOTOR"
              JOIN "CAMPANHAS_OB"."NOTIFICACAO_VISITA" nv_rec
                ON nv_rec."ID_ROTA_PROMOTOR" = rp_rec."ID_ROTA_PROMOTOR"
             WHERE rp_rec."ID_OFICINA" = us."ID_OFICINA"
               AND cp_rec."ID_CAMPANHA" = $1
               AND nv_rec."STATUS" = '${StatusNotificacaoVisita.RECUSADO}'
          ) AS "RECUSOU_NESTA_CAMPANHA",
          rota."ID_ROTA_PROMOTOR" AS "ROTA_ID_ROTA_PROMOTOR",
          rota."ID_CAMPANHA_PROMOTOR" AS "ROTA_ID_CAMPANHA_PROMOTOR",
          rota."PROMOTOR_NOME" AS "ROTA_PROMOTOR_NOME",
          rota."NV_STATUS" AS "ROTA_NV_STATUS",
          rota."NV_EXPIRA_EM" AS "ROTA_NV_EXPIRA_EM",
          rota."NV_ORIGEM_ACEITE" AS "ROTA_NV_ORIGEM_ACEITE"
        FROM "MAIN_REGISTER"."USUARIO" us
        LEFT JOIN "MAIN_REGISTER"."OFICINA" o
          ON o."ID_OFICINA" = us."ID_OFICINA"${ligacaoCadastroEmpresa('o', 'us."ID_OFICINA"')}
        LEFT JOIN LATERAL (
          SELECT rp."ID_ROTA_PROMOTOR", rp."ID_CAMPANHA_PROMOTOR",
                 p."NOME" AS "PROMOTOR_NOME",
                 nv."STATUS" AS "NV_STATUS",
                 nv."EXPIRA_EM" AS "NV_EXPIRA_EM",
                 nv."ORIGEM_ACEITE" AS "NV_ORIGEM_ACEITE"
            FROM "CAMPANHAS_OB"."ROTA_PROMOTOR" rp
            JOIN "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" cp
              ON cp."ID_CAMPANHA_PROMOTOR" = rp."ID_CAMPANHA_PROMOTOR"
            LEFT JOIN "CAMPANHAS_OB"."PROMOTOR" p
              ON p."ID_PROMOTOR" = cp."ID_PROMOTOR"
            LEFT JOIN "CAMPANHAS_OB"."NOTIFICACAO_VISITA" nv
              ON nv."ID_ROTA_PROMOTOR" = rp."ID_ROTA_PROMOTOR"
           WHERE rp."ID_OFICINA" = us."ID_OFICINA"
             AND cp."ID_CAMPANHA" = $1
             AND rp."DELETED_AT" IS NULL
             AND cp."DELETED_AT" IS NULL
           ORDER BY rp."ID_ROTA_PROMOTOR" DESC
           LIMIT 1
        ) rota ON TRUE
        WHERE us."ID_USUARIO" IN (${placeholders})
          AND us."ID_OFICINA" IS NOT NULL
          AND ce.latitude IS NOT NULL
          AND ce.longitude IS NOT NULL
          AND ce.cnpj_int IS NOT NULL
          AND ce.status_receita = 'ATIVA'
          AND ${filtroRegiao}
        ORDER BY us."ID_OFICINA"
      `;

      const linhas = await AppDataSourceSync.query(query, [...fixos, ...lote]);
      // Vários usuários por oficina podem cair em lotes diferentes.
      for (const linha of linhas) {
        const idOficina = Number(linha.ID_OFICINA);
        if (vistos.has(idOficina)) continue;
        vistos.add(idOficina);
        agregado.push(OficinaService.mapearOficinaSegmentada(linha));
      }
    }

    return agregado;
  }

  private static mapearOficinaSegmentada(linha: any): OficinaSegmentada {
    const usuarios: CandidatoUsuarioTelefone[] = Array.isArray(linha.USUARIOS) ? linha.USUARIOS : [];
    const telefone = resolverTelefone({
      usuarios,
      oficinaTelefone: linha.OFICINA_TELEFONE,
      cadastroTelefone: linha.CADASTRO_TELEFONE,
    });

    const rotaAtual =
      linha.ROTA_ID_ROTA_PROMOTOR == null
        ? null
        : {
            ID_ROTA_PROMOTOR: Number(linha.ROTA_ID_ROTA_PROMOTOR),
            ID_CAMPANHA_PROMOTOR: Number(linha.ROTA_ID_CAMPANHA_PROMOTOR),
            promotorNome: linha.ROTA_PROMOTOR_NOME ?? null,
            estado: estadoConvite(
              linha.ROTA_NV_STATUS == null
                ? null
                : {
                    STATUS: linha.ROTA_NV_STATUS,
                    EXPIRA_EM:
                      linha.ROTA_NV_EXPIRA_EM == null ? null : new Date(linha.ROTA_NV_EXPIRA_EM),
                    ORIGEM_ACEITE: linha.ROTA_NV_ORIGEM_ACEITE ?? null,
                  }
            ),
          };

    return {
      ID_OFICINA: Number(linha.ID_OFICINA),
      NOME: linha.NOME,
      CIDADE: linha.CIDADE,
      ESTADO: linha.ESTADO,
      CEP: linha.CEP,
      LATITUDE: Number(linha.LATITUDE),
      LONGITUDE: Number(linha.LONGITUDE),
      membroComunidade: linha.MEMBRO_COMUNIDADE === true,
      importada: linha.IMPORTADA === true,
      temWhatsapp: telefone?.telefone != null,
      recusouNestaCampanha: linha.RECUSOU_NESTA_CAMPANHA === true,
      rotaAtual,
    };
  }
}
