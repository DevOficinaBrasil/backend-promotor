# Campanha Promotor Linking Feature

## Overview
The campaign creation and editing APIs now support an optional parameter to link promoters and their workshops (oficinas) to a campaign in a single operation.

## API Changes

### Create Campaign (POST /campanha/create)

#### Request Body (with optional promotores)

```json
{
  "NOME": "Campanha de Teste",
  "OBJETIVO": "Aumentar vendas",
  "ID_CLIENT": 1,
  "START_TIME": "2026-01-01T00:00:00Z",
  "END_TIME": "2026-12-31T23:59:59Z",
  "CREATED_BY": "admin@example.com",
  "promotores": [
    {
      "ID_PROMOTOR": 5,
      "ID_OFICINAS": [100, 200, 300]
    },
    {
      "ID_PROMOTOR": 10,
      "ID_OFICINAS": [400, 500]
    }
  ]
}
```

#### Request Body (without promotores - backwards compatible)

```json
{
  "NOME": "Campanha de Teste",
  "OBJETIVO": "Aumentar vendas",
  "ID_CLIENT": 1,
  "START_TIME": "2026-01-01T00:00:00Z",
  "END_TIME": "2026-12-31T23:59:59Z",
  "CREATED_BY": "admin@example.com"
}
```

### Update Campaign (PUT /campanha/edit/:id)

#### Request Body (with optional promotores)

```json
{
  "NOME": "Campanha Atualizada",
  "promotores": [
    {
      "ID_PROMOTOR": 5,
      "ID_OFICINAS": [100, 200]
    }
  ]
}
```

**Note:** When updating with promotores, all existing promoter-oficina links for the campaign will be replaced with the new ones.

#### Request Body (without promotores - backwards compatible)

```json
{
  "NOME": "Campanha Atualizada",
  "OBJETIVO": "Novo objetivo"
}
```

**Note:** When updating without promotores, existing promoter-oficina links remain unchanged.

## What Happens Behind the Scenes

When `promotores` is provided:

1. **On Creation:**
   - Campaign is created
   - For each promoter in the array:
     - A `CAMPANHA_PROMOTOR` relationship is created
     - For each oficina ID:
       - A `ROTA_PROMOTOR` is created linking the promoter to that oficina for this campaign

2. **On Update:**
   - Campaign fields are updated
   - All existing `ROTA_PROMOTOR` records for the campaign are soft-deleted
   - All existing `CAMPANHA_PROMOTOR` records for the campaign are soft-deleted
   - New relationships are created as per the provided data

## Validation

The `promotores` field has the following validation rules:

- **Optional**: The field is completely optional
- **Array**: Must be an array if provided
- **ID_PROMOTOR**: Must be a positive integer
- **ID_OFICINAS**: Must be an array of at least one positive integer

## Examples

### Example 1: Create a campaign with two promoters

```bash
curl -X POST http://localhost:3000/campanha/create \
  -H "Content-Type: application/json" \
  -d '{
    "NOME": "Summer Campaign 2026",
    "OBJETIVO": "Increase market share",
    "ID_CLIENT": 1,
    "START_TIME": "2026-06-01T00:00:00Z",
    "END_TIME": "2026-08-31T23:59:59Z",
    "promotores": [
      {
        "ID_PROMOTOR": 5,
        "ID_OFICINAS": [100, 200, 300]
      },
      {
        "ID_PROMOTOR": 10,
        "ID_OFICINAS": [400, 500]
      }
    ]
  }'
```

### Example 2: Update campaign and change promoter assignments

```bash
curl -X PUT http://localhost:3000/campanha/edit/1 \
  -H "Content-Type: application/json" \
  -d '{
    "NOME": "Updated Summer Campaign 2026",
    "promotores": [
      {
        "ID_PROMOTOR": 5,
        "ID_OFICINAS": [100, 200]
      },
      {
        "ID_PROMOTOR": 15,
        "ID_OFICINAS": [600, 700]
      }
    ]
  }'
```

### Example 3: Update campaign without changing promoter assignments

```bash
curl -X PUT http://localhost:3000/campanha/edit/1 \
  -H "Content-Type: application/json" \
  -d '{
    "NOME": "Updated Campaign Name Only"
  }'
```

## Response Format

The response format remains the same as before. The created/updated campaign object is returned:

```json
{
  "message": "Campanha criada com sucesso.",
  "data": {
    "ID_CAMPANHA": 1,
    "NOME": "Summer Campaign 2026",
    "OBJETIVO": "Increase market share",
    "ID_CLIENT": 1,
    "START_TIME": "2026-06-01T00:00:00.000Z",
    "END_TIME": "2026-08-31T23:59:59.000Z",
    "CREATED_BY": null,
    "CREATED_AT": "2026-02-11T05:50:00.000Z",
    "UPDATED_AT": "2026-02-11T05:50:00.000Z"
  }
}
```

To see the linked promoters and oficinas, use the `GET /campanha/:id` endpoint which returns the campaign with all its relationships.

## Backwards Compatibility

This feature is fully backwards compatible:
- Existing API calls without the `promotores` field will continue to work as before
- The field is completely optional
- Existing code does not need to be modified
