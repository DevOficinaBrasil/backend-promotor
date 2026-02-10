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

      // Validate all IDs are valid numbers to prevent SQL injection
      const validIds = oficinaIds.filter(id => 
        Number.isInteger(id) && id > 0 && Number.isSafeInteger(id)
      );

      if (validIds.length === 0) {
        return new Map();
      }

      // Build IN clause with validated numeric values
      const query = `
        SELECT 
          id_oficina,
          flag_engajamento,
          flag_treinamento,
          flag_sentimento,
          cor_icone
        FROM oficinas
        WHERE id_oficina IN (${validIds.join(', ')})
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

      rows.forEach((row: unknown[]) => {
        const obj: Record<string, unknown> = {};
        columnNames.forEach((colName, idx) => {
          // Convert BigInt to Number for id_oficina
          obj[colName] = typeof row[idx] === 'bigint' ? Number(row[idx]) : row[idx];
        });

        const idOficina = obj.id_oficina;
        if (typeof idOficina === 'number') {
          dataMap.set(idOficina, {
            id_oficina: idOficina,
            flag_engajamento: typeof obj.flag_engajamento === 'string' ? obj.flag_engajamento.toLowerCase() : 'baixo',
            flag_treinamento: typeof obj.flag_treinamento === 'string' ? obj.flag_treinamento.toLowerCase() : 'baixo',
            flag_sentimento: typeof obj.flag_sentimento === 'string' ? obj.flag_sentimento.toLowerCase() : 'neutro',
            cor_icone: typeof obj.cor_icone === 'string' ? obj.cor_icone : 'cinza',
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
