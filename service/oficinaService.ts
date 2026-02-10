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
    // Note: LATITUDE and LONGITUDE are stored as strings in DB, so we check for empty strings
    const query = `
      SELECT 
        *,
        (
          ${EARTH_RADIUS_KM} * acos(
            cos(radians($1)) * 
            cos(radians(CAST("LATITUDE" AS DOUBLE PRECISION))) * 
            cos(radians(CAST("LONGITUDE" AS DOUBLE PRECISION)) - radians($2)) + 
            sin(radians($1)) * 
            sin(radians(CAST("LATITUDE" AS DOUBLE PRECISION)))
          )
        ) AS distance
      FROM "MAIN_REGISTER"."OFICINA"
      WHERE 
        "LATITUDE" IS NOT NULL 
        AND "LONGITUDE" IS NOT NULL
        AND "LATITUDE" != ''
        AND "LONGITUDE" != ''
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
        .map((oficina: any) => oficina.ID_OFICINA)
        .filter((id: number) => id != null);

      // Query DuckDB for additional data
      const duckdbData = await DuckDBClient.getOficinaDataByIds(oficinaIds);

      // Merge DuckDB data with PostgreSQL results
      const mergedResults = results.map((oficina: any) => {
        const duckData = duckdbData.get(oficina.ID_OFICINA);
        
        return {
          ...oficina,
          flag_engajamento: duckData?.flag_engajamento || 'baixo',
          flag_sentimento: duckData?.flag_sentimento || 'neutro',
          flag_treinamento: duckData?.flag_treinamento || 'baixo',
          cor_icone: duckData?.cor_icone || 'cinza',
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
