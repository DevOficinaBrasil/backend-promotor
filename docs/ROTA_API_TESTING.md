# Rota API - Manual Testing Guide

This guide provides example requests for testing the Rota APIs.

## Endpoints

### 1. Create Route(s)
**POST** `/rota/create`

Creates one or multiple routes for a campaign promoter.

#### Request Body (Single Route)
```json
{
  "ID_CAMPANHA_PROMOTOR": 1,
  "ID_OFICINA": 100,
  "CREATED_BY": 10
}
```

#### Request Body (Multiple Routes - Batch)
```json
{
  "ID_CAMPANHA_PROMOTOR": 1,
  "ID_OFICINA": [100, 101, 102, 103],
  "CREATED_BY": 10
}
```

#### Response (201 Created)
```json
{
  "message": "Rotas criadas com sucesso.",
  "data": [
    {
      "ID_ROTA_PROMOTOR": 1,
      "ID_CAMPANHA_PROMOTOR": 1,
      "ID_OFICINA": 100,
      "STATUS": "BACKLOG",
      "CREATED_BY": 10,
      "CREATED_AT": "2026-02-10T17:00:00Z",
      "UPDATED_AT": "2026-02-10T17:00:00Z"
    },
    ...
  ]
}
```

---

### 2. Update Route Workshops
**PUT** `/rota/workshops`

Updates workshops for a route (campaign promoter). Soft deletes old workshop links and creates new ones.

#### Request Body
```json
{
  "ID_CAMPANHA_PROMOTOR": 1,
  "ID_OFICINA": [100, 105, 106]
}
```

#### Response (200 OK)
```json
{
  "message": "Oficinas da rota atualizadas com sucesso.",
  "data": {
    "created": [
      {
        "ID_ROTA_PROMOTOR": 5,
        "ID_CAMPANHA_PROMOTOR": 1,
        "ID_OFICINA": 105,
        "STATUS": "BACKLOG",
        "CREATED_AT": "2026-02-10T17:05:00Z",
        "UPDATED_AT": "2026-02-10T17:05:00Z"
      },
      {
        "ID_ROTA_PROMOTOR": 6,
        "ID_CAMPANHA_PROMOTOR": 1,
        "ID_OFICINA": 106,
        "STATUS": "BACKLOG",
        "CREATED_AT": "2026-02-10T17:05:00Z",
        "UPDATED_AT": "2026-02-10T17:05:00Z"
      }
    ],
    "deleted": [2, 3, 4]
  }
}
```

---

### 3. Update Route Options
**PUT** `/rota/:id/options`

Updates a route's options (STATUS, SUCCESS, CHECKIN_TIME, DONE_AT, OBS). All fields are optional.

#### Request Body (Full Update)
```json
{
  "STATUS": "FINALIZADO",
  "SUCCESS": true,
  "CHECKIN_TIME": "2026-02-10T08:30:00Z",
  "DONE_AT": "2026-02-10T17:00:00Z",
  "OBS": "Visita realizada com sucesso. Cliente satisfeito."
}
```

#### Request Body (Partial Update)
```json
{
  "STATUS": "EM ANDANMENTO",
  "CHECKIN_TIME": "2026-02-10T08:30:00Z"
}
```

#### Response (200 OK)
```json
{
  "message": "Rota atualizada com sucesso.",
  "data": {
    "ID_ROTA_PROMOTOR": 1,
    "ID_CAMPANHA_PROMOTOR": 1,
    "ID_OFICINA": 100,
    "STATUS": "FINALIZADO",
    "SUCCESS": true,
    "CHECKIN_TIME": "2026-02-10T08:30:00Z",
    "DONE_AT": "2026-02-10T17:00:00Z",
    "OBS": "Visita realizada com sucesso. Cliente satisfeito.",
    "CREATED_BY": 10,
    "CREATED_AT": "2026-02-10T17:00:00Z",
    "UPDATED_AT": "2026-02-10T17:05:00Z"
  }
}
```

---

## Status Values

The STATUS field accepts the following values:
- `BACKLOG`
- `A CAMINHO`
- `EM ANDANMENTO` (note: this is the database value with typo)
- `FINALIZADO`
- `CANCELADO`

---

## Error Responses

### 400 Bad Request
```json
{
  "message": "Validation error message",
  "error": "Details about validation errors"
}
```

### 401 Unauthorized
```json
{
  "message": "Unauthorized - token missing or invalid"
}
```

### 404 Not Found
```json
{
  "message": "Rota não encontrada."
}
```

### 500 Internal Server Error
```json
{
  "message": "Erro interno ao processar requisição.",
  "error": "Error details"
}
```

---

## Authentication

All endpoints require authentication. Include the Bearer token in the Authorization header:

```
Authorization: Bearer <your-token-here>
```

---

## cURL Examples

### Create Single Route
```bash
curl -X POST http://localhost:3000/rota/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "ID_CAMPANHA_PROMOTOR": 1,
    "ID_OFICINA": 100,
    "CREATED_BY": 10
  }'
```

### Create Multiple Routes (Batch)
```bash
curl -X POST http://localhost:3000/rota/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "ID_CAMPANHA_PROMOTOR": 1,
    "ID_OFICINA": [100, 101, 102],
    "CREATED_BY": 10
  }'
```

### Update Workshops
```bash
curl -X PUT http://localhost:3000/rota/workshops \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "ID_CAMPANHA_PROMOTOR": 1,
    "ID_OFICINA": [100, 105, 106]
  }'
```

### Update Route Options
```bash
curl -X PUT http://localhost:3000/rota/1/options \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "STATUS": "FINALIZADO",
    "SUCCESS": true,
    "CHECKIN_TIME": "2026-02-10T08:30:00Z",
    "DONE_AT": "2026-02-10T17:00:00Z",
    "OBS": "Visita realizada com sucesso."
  }'
```
