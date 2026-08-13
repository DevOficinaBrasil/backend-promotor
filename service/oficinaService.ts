import { AppDataSourceSync } from "../data-source";
import Oficina from "../entities/Oficina";
import { DuckDBClient } from "../utils/duckdbClient";

// Earth's radius in kilometers (used for Haversine formula)
const EARTH_RADIUS_KM = 6371;

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
    const query = `
      SELECT DISTINCT ON (ce."id_oficina")
        ce."id_oficina" AS "ID_OFICINA",
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
      INNER JOIN "dw"."cadastro_empresa" ce
        ON ce."id_oficina" = us."ID_OFICINA"
      WHERE cm."EmpresaSlug" = $1
        AND ce."longitude" IS NOT NULL
        AND ce."latitude" IS NOT NULL
        AND ce."status_receita" = 'ATIVA'
        AND (
          ${EARTH_RADIUS_KM} * acos(
            cos(radians($2)) * cos(radians(ce."latitude")) *
            cos(radians(ce."longitude") - radians($3)) +
            sin(radians($2)) * sin(radians(ce."latitude"))
          )
        ) <= $4
      ORDER BY ce."id_oficina", distance ASC
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
        SELECT DISTINCT ON (ce."id_oficina")
          ce."id_oficina" AS "ID_OFICINA",
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
        INNER JOIN "dw"."cadastro_empresa" ce
          ON ce."id_oficina" = us."ID_OFICINA"
        WHERE us."ID_USUARIO" IN (${placeholders})
          AND ce."longitude" IS NOT NULL
          AND ce."latitude" IS NOT NULL
          AND ce."status_receita" = 'ATIVA'
          AND (
            ${EARTH_RADIUS_KM} * acos(
              cos(radians($1)) * cos(radians(ce."latitude")) *
              cos(radians(ce."longitude") - radians($2)) +
              sin(radians($1)) * sin(radians(ce."latitude"))
            )
          ) <= $3
        ORDER BY ce."id_oficina", distance ASC
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
}
