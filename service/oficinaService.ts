import { AppDataSourceSync } from "../data-source";
import Oficina from "../entities/Oficina";

export default class OficinaService {
  /**
   * Finds the nearest oficinas based on latitude and longitude
   * Uses the Haversine formula to calculate distance
   * @param latitude - Reference latitude
   * @param longitude - Reference longitude
   * @param limit - Maximum number of results (default: 40)
   * @returns Array of oficinas sorted by distance
   */
  static async findNearestOficinas(
    latitude: number,
    longitude: number,
    limit: number = 40
  ): Promise<Array<Oficina & { distance?: number }>> {
    const oficinaRepository = AppDataSourceSync.getRepository(Oficina);

    // The Haversine formula to calculate distance between two points on Earth
    // Distance in kilometers
    // Note: LATITUDE and LONGITUDE are stored as strings in DB, so we check for empty strings
    const query = `
      SELECT 
        *,
        (
          6371 * acos(
            cos(radians($1)) * 
            cos(radians(CAST(LATITUDE AS DOUBLE PRECISION))) * 
            cos(radians(CAST(LONGITUDE AS DOUBLE PRECISION)) - radians($2)) + 
            sin(radians($1)) * 
            sin(radians(CAST(LATITUDE AS DOUBLE PRECISION)))
          )
        ) AS distance
      FROM "MAIN_REGISTER"."OFICINA"
      WHERE 
        LATITUDE IS NOT NULL 
        AND LONGITUDE IS NOT NULL
        AND LATITUDE != ''
        AND LONGITUDE != ''
      ORDER BY distance ASC
      LIMIT $3
    `;

    try {
      const results = await AppDataSourceSync.query(query, [
        latitude,
        longitude,
        limit,
      ]);

      return results;
    } catch (error) {
      console.error("Error finding nearest oficinas:", error);
      throw error;
    }
  }
}
