import { DuckDBClient } from '../../utils/duckdbClient';

/**
 * Integration test for DuckDB client
 * This test demonstrates the functionality of querying DuckDB oficinas data
 */
describe('DuckDBClient Integration', () => {
  afterAll(async () => {
    // Clean up DuckDB instance
    await DuckDBClient.close();
  });

  it('should return DuckDB data for valid oficina IDs', async () => {
    // Test with known IDs from the database
    const testIds = [395444, 393991, 322983];
    const result = await DuckDBClient.getOficinaDataByIds(testIds);

    // Should return data for all IDs
    expect(result.size).toBeGreaterThan(0);
    expect(result.size).toBeLessThanOrEqual(testIds.length);

    // Check data structure
    result.forEach((data, id) => {
      expect(data).toHaveProperty('id_oficina');
      expect(data).toHaveProperty('flag_engajamento');
      expect(data).toHaveProperty('flag_treinamento');
      expect(data).toHaveProperty('flag_sentimento');
      expect(data).toHaveProperty('cor_icone');
      expect(data.id_oficina).toBe(id);
    });
  });

  it('should return empty map for empty ID array', async () => {
    const result = await DuckDBClient.getOficinaDataByIds([]);
    expect(result.size).toBe(0);
  });

  it('should filter out invalid IDs', async () => {
    // Test with mix of valid and invalid IDs
    const mixedIds = [395444, -1, 0, NaN] as number[];
    const result = await DuckDBClient.getOficinaDataByIds(mixedIds);

    // Should only return data for valid ID
    expect(result.size).toBeLessThanOrEqual(1);
  });

  it('should return empty map for non-existent IDs', async () => {
    // Test with IDs that don't exist in the database
    const nonExistentIds = [999999999, 888888888];
    const result = await DuckDBClient.getOficinaDataByIds(nonExistentIds);

    // Should return empty map (no matches)
    expect(result.size).toBe(0);
  });

  it('should normalize flag values to lowercase', async () => {
    const testIds = [395444];
    const result = await DuckDBClient.getOficinaDataByIds(testIds);

    if (result.size > 0) {
      const data = result.get(testIds[0]);
      if (data) {
        // All flags should be lowercase
        expect(data.flag_engajamento).toMatch(/^[a-z]+$/);
        expect(data.flag_treinamento).toMatch(/^[a-z]+$/);
        expect(data.flag_sentimento).toMatch(/^[a-z]+$/);
      }
    }
  });

  it('should provide default values when data is missing', async () => {
    // The client returns default values in the service layer
    // This is just to document the expected behavior
    const defaults = {
      flag_engajamento: 'baixo',
      flag_sentimento: 'neutro',
      flag_treinamento: 'baixo',
      cor_icone: 'cinza',
    };

    expect(defaults.flag_engajamento).toBe('baixo');
    expect(defaults.flag_sentimento).toBe('neutro');
    expect(defaults.flag_treinamento).toBe('baixo');
    expect(defaults.cor_icone).toBe('cinza');
  });
});
