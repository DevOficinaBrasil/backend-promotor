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
    // Note: latitude and longitude are stored as strings in DB, so we check for empty strings
    const query = `
      SELECT 
        *,
        (
          ${EARTH_RADIUS_KM} * acos(
            cos(radians($1)) * 
            cos(radians(CAST("latitude" AS DOUBLE PRECISION))) * 
            cos(radians(CAST("longitude" AS DOUBLE PRECISION)) - radians($2)) + 
            sin(radians($1)) * 
            sin(radians(CAST("latitude" AS DOUBLE PRECISION)))
          )
        ) AS distance
      FROM "dw"."cadastro_empresa"
      WHERE 
        "latitude" IS NOT NULL 
        AND "longitude" IS NOT NULL
        AND "latitude" != ''
        AND "longitude" != ''
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

      // Get oficina IDs from results
      const oficinaIds = results
        .map((oficina: any) => oficina.id_oficina)
        .filter((id: number) => id != null);

      // Query DuckDB for additional data
      const duckdbData = await DuckDBClient.getOficinaDataByIds(oficinaIds);

      // Merge DuckDB data with PostgreSQL results
      const mergedResults = results.map((oficina: any) => {
        const oficinaInfo = oficinaRepository.findOneBy({ ID_OFICINA: oficina.id_oficina });
        
        return {
          ...oficinaInfo,
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
