# DuckDB Integration for Oficinas API

## Overview

The oficinas nearby API (`/oficina/nearby`) has been enhanced to include additional data from a DuckDB database. The DuckDB data includes:

- `flag_engajamento` - Engagement flag (baixo/alto)
- `flag_sentimento` - Sentiment flag (neutro/positivo/negativo)
- `flag_treinamento` - Training flag (baixo/alto)
- `cor_icone` - Icon color (cinza/azul/etc.)

## ⚠️ Security Note

**IMPORTANT**: The original implementation used `@duckdb/node-api` which was flagged as malware by GitHub security advisories. 

The implementation has been changed to use a **secure JSON-based approach** instead:
- DuckDB data is exported to `duckdb/oficinas_data.json`
- Data is loaded into memory at startup
- No vulnerable packages are used
- Fast O(1) lookups using Map data structure

## Data Source

### JSON File Location
The oficinas data is stored at: `/duckdb/oficinas_data.json`

This JSON file contains oficina data with the structure:
```json
{
  "395444": {
    "id_oficina": 395444,
    "flag_engajamento": "alto",
    "flag_treinamento": "baixo",
    "flag_sentimento": "neutro",
    "cor_icone": "azul"
  }
}
```

### Updating the Data

To update the oficinas data, you need to export it from the DuckDB file:

**Option 1: Using Python with DuckDB**
```python
import duckdb
import json

conn = duckdb.connect('duckdb/oficinas_mock 1.duckdb', read_only=True)
result = conn.execute("""
    SELECT 
        id_oficina,
        LOWER(flag_engajamento) as flag_engajamento,
        LOWER(flag_treinamento) as flag_treinamento,
        LOWER(flag_sentimento) as flag_sentimento,
        cor_icone
    FROM oficinas
    WHERE id_oficina IS NOT NULL
""").fetchall()

data = {}
for row in result:
    data[str(row[0])] = {
        "id_oficina": row[0],
        "flag_engajamento": row[1] or "baixo",
        "flag_treinamento": row[2] or "baixo",
        "flag_sentimento": row[3] or "neutro",
        "cor_icone": row[4] or "cinza"
    }

with open('duckdb/oficinas_data.json', 'w') as f:
    json.dump(data, f, indent=2)

conn.close()
```

**Option 2: Using DuckDB CLI**
```bash
duckdb "duckdb/oficinas_mock 1.duckdb" -json "
SELECT 
    id_oficina,
    LOWER(flag_engajamento) as flag_engajamento,
    LOWER(flag_treinamento) as flag_treinamento,
    LOWER(flag_sentimento) as flag_sentimento,
    cor_icone
FROM oficinas
WHERE id_oficina IS NOT NULL
" > duckdb/oficinas_data.json
```

## Implementation Details

### DuckDBClient Utility

The `DuckDBClient` in `utils/duckdbClient.ts`:

1. Loads the JSON file once at first use (cached in memory)
2. Provides O(1) lookup performance using Map
3. Validates IDs before querying
4. Returns empty data on errors (fault-tolerant)
5. **Zero external dependencies** (uses only Node.js `fs` module)

### Service Integration

The `OficinaService.findNearestOficinas()` method:

1. Queries PostgreSQL for nearby oficinas
2. Extracts oficina IDs from results
3. Queries the JSON data using DuckDBClient
4. Merges data into PostgreSQL results
5. Provides default values if data is missing

### Response Schema

The `OficinaSchema` includes the optional fields:
- `flag_engajamento?: string`
- `flag_sentimento?: string`
- `flag_treinamento?: string`
- `cor_icone?: string`

## Testing

### Manual Testing

```bash
curl -X GET "http://localhost:3333/oficina/nearby?latitude=-23.675817&longitude=-46.6800146&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Expected response:
```json
{
  "message": "Oficinas encontradas com sucesso.",
  "data": [
    {
      "ID_OFICINA": 395444,
      "NOME_FANTASIA": "...",
      "distance": 0,
      "flag_engajamento": "alto",
      "flag_sentimento": "neutro",
      "flag_treinamento": "baixo",
      "cor_icone": "azul"
    }
  ],
  "count": 1
}
```

### Unit Testing

```typescript
import { DuckDBClient } from './utils/duckdbClient';

async function test() {
  const data = await DuckDBClient.getOficinaDataByIds([395444, 393991]);
  console.log(data);
}
```

## Error Handling

The integration is fault-tolerant:
- JSON file errors return an empty Map
- Missing data results in default values
- PostgreSQL query works independently

## Default Values

When data is not available for an oficina:
- `flag_engajamento`: "baixo"
- `flag_sentimento`: "neutro"
- `flag_treinamento`: "baixo"
- `cor_icone`: "cinza"

## Performance Considerations

- **Fast**: Data is loaded into memory once and cached
- **Efficient**: O(1) lookup performance using Map
- **Lightweight**: No database connections or native modules
- **Secure**: No vulnerable packages, pure JavaScript/TypeScript

## Reloading Data

To reload the JSON data without restarting the server:

```typescript
import { DuckDBClient } from './utils/duckdbClient';

// Reload the data
DuckDBClient.reloadData();
```
