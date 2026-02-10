# DuckDB Integration for Oficinas API

## Overview

The oficinas nearby API (`/oficina/nearby`) has been enhanced to include additional data from a DuckDB database. The DuckDB data includes:

- `flag_engajamento` - Engagement flag (baixo/alto)
- `flag_sentimento` - Sentiment flag (neutro/positivo/negativo)
- `flag_treinamento` - Training flag (baixo/alto)
- `cor_icone` - Icon color (cinza/azul/etc.)

## Database Location

The DuckDB database is located at: `/duckdb/oficinas_mock 1.duckdb`

The database contains a table named `oficinas` with the following structure:
- `id_usuario` - User ID (can be NULL)
- `id_oficina` - Workshop ID (used for joining)
- `flag_engajamento` - Engagement level
- `flag_treinamento` - Training level
- `flag_sentimento` - Sentiment
- `cor_icone` - Icon color

## Implementation Details

### DuckDBClient Utility

A new utility class `DuckDBClient` has been created in `utils/duckdbClient.ts` that:

1. Creates and maintains a singleton DuckDB instance
2. Queries the oficinas table by ID
3. Returns results as a Map for efficient lookup
4. Handles errors gracefully by returning empty data instead of failing

### Service Integration

The `OficinaService.findNearestOficinas()` method has been updated to:

1. Query PostgreSQL for nearby oficinas using the Haversine formula
2. Extract all oficina IDs from the results
3. Query DuckDB for additional data using the IDs
4. Merge the DuckDB data into the PostgreSQL results
5. Provide default values if DuckDB data is not found

### Response Schema

The `OficinaSchema` has been updated to include the new optional fields:
- `flag_engajamento?: string`
- `flag_sentimento?: string`
- `flag_treinamento?: string`
- `cor_icone?: string`

## Testing

### Manual Testing

To test the integration manually:

1. Ensure the DuckDB file exists at `/duckdb/oficinas_mock 1.duckdb`
2. Start the server
3. Make a request to `/oficina/nearby` with authentication:

```bash
curl -X GET "http://localhost:3333/oficina/nearby?latitude=-23.675817&longitude=-46.6800146&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Expected response format:
```json
{
  "message": "Oficinas encontradas com sucesso.",
  "data": [
    {
      "ID_OFICINA": 410815,
      "NOME_FANTASIA": "50.165.954 FABIANO CESAR DA ROSA",
      ...
      "distance": 0,
      "flag_engajamento": "baixo",
      "flag_sentimento": "neutro",
      "flag_treinamento": "alto",
      "cor_icone": "cinza"
    }
  ],
  "count": 1
}
```

### Unit Testing

The DuckDB utility can be tested independently:

```typescript
import { DuckDBClient } from './utils/duckdbClient';

async function test() {
  const data = await DuckDBClient.getOficinaDataByIds([395444, 393991]);
  console.log(data);
}

test();
```

## Error Handling

The integration is designed to be fault-tolerant:

- If DuckDB query fails, it returns an empty Map
- Missing DuckDB data for an oficina results in default values being used
- The PostgreSQL query is independent and will work even if DuckDB fails

## Default Values

When DuckDB data is not available for an oficina:
- `flag_engajamento`: "baixo"
- `flag_sentimento`: "neutro"
- `flag_treinamento`: "baixo"
- `cor_icone`: "cinza"

## Performance Considerations

- DuckDB queries use a Map-based lookup for O(1) merge performance
- The DuckDB instance is reused across requests (singleton pattern)
- Only one DuckDB query is made per API request, regardless of the number of results
