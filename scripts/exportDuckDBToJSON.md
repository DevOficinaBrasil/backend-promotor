# Export DuckDB to JSON

Due to security concerns with the `@duckdb/node-api` package (flagged as malware), we use a JSON-based approach instead.

## Option 1: Using Python with duckdb package

```python
import duckdb
import json

# Connect to DuckDB
conn = duckdb.connect('duckdb/oficinas_mock 1.duckdb', read_only=True)

# Query all data
result = conn.execute("""
    SELECT 
        id_oficina,
        flag_engajamento,
        flag_treinamento,
        flag_sentimento,
        cor_icone
    FROM oficinas
    WHERE id_oficina IS NOT NULL
""").fetchall()

# Get column names
columns = [desc[0] for desc in conn.description]

# Convert to JSON
data = {}
for row in result:
    oficina_id = row[0]
    data[str(oficina_id)] = {
        columns[i]: (row[i].lower() if isinstance(row[i], str) and i > 0 else row[i])
        for i in range(len(columns))
    }

# Write to JSON file
with open('duckdb/oficinas_data.json', 'w') as f:
    json.dump(data, f, indent=2)

print(f"Exported {len(data)} records to oficinas_data.json")
conn.close()
```

## Option 2: Using DuckDB CLI

```bash
duckdb "duckdb/oficinas_mock 1.duckdb" -json < EOF > duckdb/oficinas_data.json
SELECT 
    id_oficina,
    flag_engajamento,
    flag_treinamento,
    flag_sentimento,
    cor_icone
FROM oficinas
WHERE id_oficina IS NOT NULL;
EOF
```

## Option 3: Use CSV Export (simplest)

```bash
duckdb "duckdb/oficinas_mock 1.duckdb" << EOF
COPY (
    SELECT 
        id_oficina,
        LOWER(flag_engajamento) as flag_engajamento,
        LOWER(flag_treinamento) as flag_treinamento,
        LOWER(flag_sentimento) as flag_sentimento,
        cor_icone
    FROM oficinas
    WHERE id_oficina IS NOT NULL
) TO 'duckdb/oficinas_data.csv' (HEADER, DELIMITER ',');
EOF
```

Then convert CSV to JSON in Node.js at build time if needed.
