import * as fs from 'fs';
import path from 'path';

interface DuckDBOficinaData {
  id_oficina: number;
  flag_engajamento: string;
  flag_treinamento: string;
  flag_sentimento: string;
  cor_icone: string;
}

export class DuckDBClient {
  private static dataCache: Map<number, DuckDBOficinaData> | null = null;
  private static jsonPath = path.join(__dirname, '..', 'duckdb', 'oficinas_data.json');

  /**
   * Loads the oficinas data from JSON file into memory
   * This is a secure alternative to using the malware-flagged @duckdb/node-api package
   */
  private static loadData(): Map<number, DuckDBOficinaData> {
    if (this.dataCache) {
      return this.dataCache;
    }

    try {
      const jsonData = fs.readFileSync(this.jsonPath, 'utf-8');
      const data: Record<string, DuckDBOficinaData> = JSON.parse(jsonData);
      
      this.dataCache = new Map();
      Object.values(data).forEach(oficina => {
        if (oficina.id_oficina) {
          this.dataCache!.set(oficina.id_oficina, oficina);
        }
      });

      console.log(`Loaded ${this.dataCache.size} oficinas records from JSON`);
      return this.dataCache;
    } catch (error) {
      console.error('Error loading oficinas data from JSON:', error);
      this.dataCache = new Map(); // Return empty map on error
      return this.dataCache;
    }
  }

  /**
   * Queries the oficinas data for a specific set of oficina IDs
   * Now uses a secure JSON-based approach instead of the malware-flagged @duckdb/node-api
   * @param oficinaIds - Array of oficina IDs to query
   * @returns Map of oficina IDs to their data
   */
  static async getOficinaDataByIds(
    oficinaIds: number[]
  ): Promise<Map<number, DuckDBOficinaData>> {
    if (oficinaIds.length === 0) {
      return new Map();
    }

    try {
      // Load data from JSON (cached after first load)
      const allData = this.loadData();

      // Validate IDs and filter
      const validIds = oficinaIds.filter(id => 
        Number.isInteger(id) && id > 0 && Number.isSafeInteger(id)
      );

      if (validIds.length === 0) {
        return new Map();
      }

      // Extract requested IDs
      const result = new Map<number, DuckDBOficinaData>();
      validIds.forEach(id => {
        const data = allData.get(id);
        if (data) {
          result.set(id, data);
        }
      });

      return result;
    } catch (error) {
      console.error('Error querying oficinas data:', error);
      // Return empty map on error to not break the API
      return new Map();
    }
  }

  /**
   * Clears the data cache (useful for testing or reloading data)
   */
  static async close(): Promise<void> {
    this.dataCache = null;
  }

  /**
   * Reloads the data from the JSON file
   */
  static reloadData(): void {
    this.dataCache = null;
    this.loadData();
  }
}
