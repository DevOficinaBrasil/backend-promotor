import { DuckDBInstance } from '@duckdb/node-api';
import path from 'path';

interface DuckDBOficinaData {
  id_oficina: number;
  flag_engajamento: string;
  flag_treinamento: string;
  flag_sentimento: string;
  cor_icone: string;
}

export class DuckDBClient {
  private static instance: DuckDBInstance | null = null;
  private static dbPath = path.join(__dirname, '..', 'duckdb', 'oficinas_mock 1.duckdb');

  /**
   * Gets or creates a DuckDB instance
   */
  private static async getInstance(): Promise<DuckDBInstance> {
    if (!this.instance) {
      this.instance = await DuckDBInstance.create(this.dbPath);
    }
    return this.instance;
  }

  /**
   * Queries the oficinas table in DuckDB for a specific set of oficina IDs
   * @param oficinaIds - Array of oficina IDs to query
   * @returns Map of oficina IDs to their DuckDB data
   */
  static async getOficinaDataByIds(
    oficinaIds: number[]
  ): Promise<Map<number, DuckDBOficinaData>> {
    if (oficinaIds.length === 0) {
      return new Map();
    }

    try {
      const instance = await this.getInstance();
      const connection = await instance.connect();

      // Build IN clause with direct values (DuckDB doesn't support parameterized IN clauses well)
      const query = `
        SELECT 
          id_oficina,
          flag_engajamento,
          flag_treinamento,
          flag_sentimento,
          cor_icone
        FROM oficinas
        WHERE id_oficina IN (${oficinaIds.join(', ')})
      `;

      const result = await connection.run(query);

      // Get column names
      const columnNames: string[] = [];
      for (let i = 0; i < result.columnCount; i++) {
        columnNames.push(result.columnName(i));
      }

      // Get rows
      const rows = await result.getRows();

      // Convert to map for efficient lookup
      const dataMap = new Map<number, DuckDBOficinaData>();

      rows.forEach((row: any) => {
        const obj: any = {};
        columnNames.forEach((colName, idx) => {
          // Convert BigInt to Number for id_oficina
          obj[colName] = typeof row[idx] === 'bigint' ? Number(row[idx]) : row[idx];
        });

        if (obj.id_oficina) {
          dataMap.set(obj.id_oficina, {
            id_oficina: obj.id_oficina,
            flag_engajamento: obj.flag_engajamento?.toLowerCase() || 'baixo',
            flag_treinamento: obj.flag_treinamento?.toLowerCase() || 'baixo',
            flag_sentimento: obj.flag_sentimento?.toLowerCase() || 'neutro',
            cor_icone: obj.cor_icone || 'cinza',
          });
        }
      });

      return dataMap;
    } catch (error) {
      console.error('Error querying DuckDB:', error);
      // Return empty map on error to not break the API
      return new Map();
    }
  }

  /**
   * Closes the DuckDB instance (call on application shutdown)
   */
  static async close(): Promise<void> {
    if (this.instance) {
      // DuckDB instance doesn't have a close method in this version
      // Just set to null to allow garbage collection
      this.instance = null;
    }
  }
}
