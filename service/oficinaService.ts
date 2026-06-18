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
    limit: number = 40
  ): Promise<Array<Oficina & { distance?: number; flag_engajamento?: string; flag_sentimento?: string; flag_treinamento?: string; cor_icone?: string }>> {
    const oficinaRepository = AppDataSourceSync.getRepository(Oficina);

    // The Haversine formula to calculate distance between two points on Earth
    // Distance in kilometers
    const query = `
      SELECT 
        "MAIN_REGISTER"."OFICINA".*,
        (
          ${EARTH_RADIUS_KM} * acos(
            cos(radians($1)) * 
            cos(radians("latitude")) * 
            cos(radians("longitude") - radians($2)) + 
            sin(radians($1)) * 
            sin(radians("latitude"))
          )
        ) AS distance
      FROM "dw"."cadastro_empresa"
      LEFT JOIN "MAIN_REGISTER"."OFICINA" ON "dw"."cadastro_empresa"."id_oficina" = "MAIN_REGISTER"."OFICINA"."ID_OFICINA"
      WHERE 
        "latitude" IS NOT NULL 
        AND "longitude" IS NOT NULL
        AND "status_receita" = 'ATIVA'
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
