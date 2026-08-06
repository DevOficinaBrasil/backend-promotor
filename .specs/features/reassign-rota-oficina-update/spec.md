# Reatribuição de Rotas ao Atualizar Endereço de Oficina

## Problem Statement

Quando o endereço (CEP) de uma oficina é atualizado, a rota permanece atribuída ao mesmo promotor original. Isso é problemático porque a oficina pode sair do raio de atuação do promotor atual — por exemplo, uma oficina que estava no centro de São Paulo e após update foi parar em Curitiba. Hoje não existe nenhum mecanismo que detecte essa mudança e reatribua a rota para outro promotor da mesma campanha que tenha a oficina dentro do seu raio.

## Goals

- [ ] Criar endpoint `POST /rota/reassign-by-address` que recebe `CEP` e `ID_OFICINA`
- [ ] Geocodificar o novo CEP para obter novas coordenadas (lat/long) da oficina
- [ ] Identificar todas as campanhas ativas em que essa oficina possui rota atribuída
- [ ] Para cada campanha, verificar se a oficina ainda está dentro do raio do promotor atual
- [ ] Se estiver fora do raio: buscar outro promotor da mesma campanha que tenha a oficina dentro do seu raio
- [ ] Reatribuir a rota (soft delete da antiga + criação de nova) para o novo promotor encontrado
- [ ] Se nenhum promotor elegível for encontrado, manter a rota atual e sinalizar no response
- [ ] Retornar relatório detalhado de todas as reatribuições realizadas por campanha

## Non-Goals

- Atualizar o cadastro da oficina em si (entidade `OFICINA` ou `cadastro_empresa`) — o endpoint apenas reatribui rotas
- Alterar rotas com status diferente de `BACKLOG` — rotas em andamento ou finalizadas não são afetadas
- Reotimizar a ordenação das rotas após reatribuição — isso pode ser feito manualmente depois
- Criar promotor ou campanha automaticamente

## Contexto Técnico

### Entidades Envolvidas

| Entidade | Schema/Tabela | Papel |
|----------|---------------|-------|
| RotaPromotor | `CAMPANHAS_OB.ROTA_PROMOTOR` | Rota a ser reatribuída |
| CampanhaPromotor | `CAMPANHAS_OB.CAMPANHA_PROMOTOR` | Vínculo promotor↔campanha com RAIO |
| Promotor | `CAMPANHAS_OB.PROMOTOR` | Coordenadas (LATITUDE/LONGITUDE) do promotor |
| Oficina | `MAIN_REGISTER.OFICINA` | Oficina cujo endereço mudou |
| Campanha | `CAMPANHAS_OB.CAMPANHA` | Campanhas ativas que contêm a oficina |

### Fluxo de Dados

```
POST /rota/reassign-by-address { CEP, ID_OFICINA }
  │
  ├─ 1. Geocodificar CEP → novas coordenadas (lat, long)
  │
  ├─ 2. Buscar todas ROTA_PROMOTOR ativas com ID_OFICINA
  │     WHERE DELETED_AT IS NULL AND STATUS = 'BACKLOG'
  │
  ├─ 3. Para cada rota encontrada:
  │     │
  │     ├─ Carregar CAMPANHA_PROMOTOR → PROMOTOR (lat/long)
  │     │
  │     ├─ Calcular distância Haversine(promotor, novas coords oficina)
  │     │
  │     ├─ Se distância <= CAMPANHA_PROMOTOR.RAIO (default 20km):
  │     │     → Manter rota atual (sem alteração)
  │     │
  │     └─ Se distância > RAIO:
  │           │
  │           ├─ Buscar todos CAMPANHA_PROMOTOR da mesma campanha
  │           │   WHERE DELETED_AT IS NULL AND ID_PROMOTOR != atual
  │           │
  │           ├─ Para cada promotor candidato:
  │           │   Calcular Haversine(candidato, novas coords oficina)
  │           │   Filtrar por distância <= candidato.RAIO
  │           │
  │           ├─ Ordenar candidatos por distância ASC
  │           │   → Selecionar o mais próximo
  │           │
  │           ├─ Soft delete rota antiga
  │           ├─ Criar nova rota no CAMPANHA_PROMOTOR do novo promotor
  │           │
  │           └─ Se nenhum candidato: manter rota + flag "sem_promotor_disponivel"
  │
  └─ 4. Retornar relatório de reatribuições
```

### Endpoint

```
POST /rota/reassign-by-address
```

**Request Body:**

```json
{
  "CEP": "80010-000",
  "ID_OFICINA": 12345
}
```

**Response 200 (sucesso):**

```json
{
  "message": "Reatribuição de rotas concluída.",
  "data": {
    "oficina": {
      "ID_OFICINA": 12345,
      "novo_cep": "80010-000",
      "nova_latitude": -25.4284,
      "nova_longitude": -49.2733
    },
    "campanhas_processadas": 3,
    "reatribuicoes": [
      {
        "ID_CAMPANHA": 10,
        "promotor_anterior": { "ID_PROMOTOR": 1, "NOME": "João", "distancia_km": 350.2 },
        "promotor_novo": { "ID_PROMOTOR": 5, "NOME": "Maria", "distancia_km": 8.4 },
        "rota_removida": 101,
        "rota_criada": 205,
        "status": "reatribuida"
      },
      {
        "ID_CAMPANHA": 15,
        "promotor_anterior": { "ID_PROMOTOR": 3, "NOME": "Carlos", "distancia_km": 12.0 },
        "promotor_novo": null,
        "rota_removida": null,
        "rota_criada": null,
        "status": "mantida_dentro_do_raio"
      },
      {
        "ID_CAMPANHA": 22,
        "promotor_anterior": { "ID_PROMOTOR": 2, "NOME": "Ana", "distancia_km": 280.5 },
        "promotor_novo": null,
        "rota_removida": null,
        "rota_criada": null,
        "status": "sem_promotor_disponivel"
      }
    ],
    "resumo": {
      "mantidas": 1,
      "reatribuidas": 1,
      "sem_promotor_disponivel": 1
    }
  }
}
```

**Response 400:**

```json
{ "message": "ID_OFICINA e CEP são obrigatórios." }
```

**Response 404:**

```json
{ "message": "Nenhuma rota ativa encontrada para a oficina informada." }
```

### Schema de Validação (Zod)

```typescript
const ReassignByAddressSchema = z.object({
  CEP: z.string().min(8).max(10),
  ID_OFICINA: z.coerce.number().int().positive(),
});

const ReassignByAddressResponseSchema = z.object({
  message: z.string(),
  data: z.object({
    oficina: z.object({
      ID_OFICINA: z.number(),
      novo_cep: z.string(),
      nova_latitude: z.number(),
      nova_longitude: z.number(),
    }),
    campanhas_processadas: z.number(),
    reatribuicoes: z.array(z.object({
      ID_CAMPANHA: z.number(),
      promotor_anterior: z.object({
        ID_PROMOTOR: z.number(),
        NOME: z.string(),
        distancia_km: z.number(),
      }),
      promotor_novo: z.object({
        ID_PROMOTOR: z.number(),
        NOME: z.string(),
        distancia_km: z.number(),
      }).nullable(),
      rota_removida: z.number().nullable(),
      rota_criada: z.number().nullable(),
      status: z.enum(["reatribuida", "mantida_dentro_do_raio", "sem_promotor_disponivel"]),
    })),
    resumo: z.object({
      mantidas: z.number(),
      reatribuidas: z.number(),
      sem_promotor_disponivel: z.number(),
    }),
  }),
});
```

### Cálculo Haversine (reutilizar constante existente)

```typescript
// EARTH_RADIUS_KM = 6371 (já definido em oficinaService.ts)
function haversineDistanceKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

### Otimização: Query Única para Candidatos por Campanha

Em vez de N queries por campanha, uma única query pode retornar todos os promotores candidatos de todas as campanhas afetadas, com distância pré-calculada:

```sql
SELECT 
  cp."ID_CAMPANHA_PROMOTOR",
  cp."ID_CAMPANHA",
  cp."ID_PROMOTOR",
  cp."RAIO",
  p."NOME",
  p."LATITUDE",
  p."LONGITUDE",
  (
    6371 * acos(
      cos(radians($1)) * cos(radians(CAST(p."LATITUDE" AS FLOAT))) *
      cos(radians(CAST(p."LONGITUDE" AS FLOAT)) - radians($2)) +
      sin(radians($1)) * sin(radians(CAST(p."LATITUDE" AS FLOAT)))
    )
  ) AS distancia_km
FROM "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" cp
INNER JOIN "CAMPANHAS_OB"."PROMOTOR" p
  ON cp."ID_PROMOTOR" = p."ID_PROMOTOR"
WHERE cp."ID_CAMPANHA" = ANY($3)
  AND cp."DELETED_AT" IS NULL
  AND p."DELETED_AT" IS NULL
  AND p."LATITUDE" IS NOT NULL
  AND p."LONGITUDE" IS NOT NULL
HAVING distancia_km <= COALESCE(cp."RAIO", 20)
ORDER BY cp."ID_CAMPANHA", distancia_km ASC
```

> **Nota:** Como `LATITUDE`/`LONGITUDE` do Promotor são `varchar`, é necessário CAST para FLOAT.

### Regras de Negócio

1. **Apenas rotas BACKLOG** são elegíveis para reatribuição. Rotas com status `A CAMINHO`, `EM ANDAMENTO`, `FINALIZADO` ou `CANCELADO` não são afetadas.
2. **RAIO default = 20km** quando `CAMPANHA_PROMOTOR.RAIO` é NULL.
3. **Promotor mais próximo vence** — em caso de múltiplos candidatos, o que tiver menor distância Haversine à oficina é selecionado.
4. **Soft delete + create** — a rota antiga recebe soft delete e uma nova rota é criada no `CAMPANHA_PROMOTOR` do novo promotor, preservando histórico.
5. **Transacional por campanha** — cada reatribuição por campanha deve ser atômica (soft delete + create no mesmo transaction).
6. **Idempotente** — chamar o endpoint múltiplas vezes com o mesmo CEP não deve duplicar rotas. A verificação de distância no raio garante isso (se já reatribuído, o novo promotor estará dentro do raio).

### Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `schemas/rota.ts` | Modificar | Adicionar `ReassignByAddressSchema` e response schema |
| `service/rotaService.ts` | Modificar | Adicionar método `reassignRotasByAddress` |
| `controllers/rotaController.ts` | Modificar | Adicionar handler `reassignByAddress` |
| `routes/RotaRoute.ts` | Modificar | Registrar novo endpoint `POST /reassign-by-address` |
| `utils/haversine.ts` | Criar | Extrair função Haversine reutilizável (opcional, pode ficar inline) |
| `__tests__/unit/rotaService.test.ts` | Criar | Testes unitários para o fluxo de reatribuição |

### Dependências de Serviço

- `GeolocationService.getLatLongByCep(cep)` — geocodificação do novo CEP
- `RotaService` — busca e manipulação de rotas
- `MigrationAwareRepository` — acesso a dados com suporte a migração

### Casos de Teste

| Caso | Input | Esperado |
|------|-------|----------|
| Oficina em 1 campanha, promotor atual fora do raio, candidato disponível | CEP novo distante | Reatribuição para promotor mais próximo |
| Oficina em 1 campanha, promotor atual dentro do raio | CEP próximo | Rota mantida, status `mantida_dentro_do_raio` |
| Oficina em 3 campanhas, fora do raio em 2 | CEP médio | 2 reatribuições, 1 mantida |
| Oficina fora do raio, nenhum candidato disponível | CEP muito distante | Status `sem_promotor_disponivel` |
| Oficina sem rotas ativas (todas soft deleted) | Qualquer CEP | Response 404 |
| Oficina com rotas EM ANDAMENTO | CEP distante | Rotas EM ANDAMENTO ignoradas, apenas BACKLOG afetada |
| CEP inválido / não geocodificável | CEP "00000-000" | Response 400 com erro de geocodificação |
| Chamada idempotente (mesmo CEP 2x) | Mesmo CEP | Segunda chamada não duplica rotas |
