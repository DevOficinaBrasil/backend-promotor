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
        AND ce.cnpj IN (SELECT DISTINCT "CNPJ" FROM temp_cnpj_sqlserver where "CREATED_AT" > '2026-01-01')
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
}
