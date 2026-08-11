# Atribuição Automática de Oficina ao Promotor na Inscrição em Comunidade

## Problem Statement

Quando uma oficina (reparador) se inscreve na comunidade de um cliente, ela não é automaticamente atribuída a nenhum promotor. Isso significa que um novo reparador pode ficar sem cobertura de visita até que alguém manualmente o adicione a uma rota. Precisamos de um endpoint que, ao receber a notificação de inscrição na comunidade, geocodifique o CEP da oficina e a atribua automaticamente ao promotor cuja rota (campanha ativa) alcance aquele CEP dentro do raio configurado.

## Goals

- [ ] Criar endpoint `POST /rota/assign-oficina-community` que recebe `ID_OFICINA` e `empresaSlug`
- [ ] Geocodificar o CEP da oficina para obter coordenadas (lat/long)
- [ ] Identificar todas as campanhas ativas (`START_TIME <= now <= END_TIME`) vinculadas ao cliente (`empresaSlug`)
- [ ] Para cada campanha ativa, buscar todos os promotores com coordenadas e raio configurado
- [ ] Filtrar promotores cujo raio alcança a oficina (distância Haversine <= RAIO)
- [ ] Desempate por menor distância quando múltiplos promotores alcançam a oficina
- [ ] Criar rota (`ROTA_PROMOTOR`) vinculando a oficina ao `CAMPANHA_PROMOTOR` vencedor
- [ ] Retornar resultado detalhado por campanha (atribuída, sem promotor disponível)

## Non-Goals

- Criar promotor ou campanha automaticamente
- Atribuir oficina a campanhas encerradas (`END_TIME < now`)
- Reordenar rotas existentes após atribuição
- Atualizar dados cadastrais da oficina
- Notificar o promotor sobre a nova rota (será feito pelo fluxo existente de `notificarRotasCriadas`)

## Contexto Técnico

### Entidades Envolvidas

| Entidade | Schema/Tabela | Papel |
|----------|---------------|-------|
| Oficina | `MAIN_REGISTER.OFICINA` | Oficina que se inscreveu na comunidade |
| CadastroEmpresa | `dw.cadastro_empresa` | Dados confiáveis (lat, long, CEP) |
| RotaPromotor | `CAMPANHAS_OB.ROTA_PROMOTOR` | Rota criada vinculando oficina ao promotor |
| CampanhaPromotor | `CAMPANHAS_OB.CAMPANHA_PROMOTOR` | Vínculo promotor↔campanha com RAIO |
| Promotor | `CAMPANHAS_OB.PROMOTOR` | Coordenadas (LATITUDE/LONGITUDE) do promotor |
| Campanha | `CAMPANHAS_OB.CAMPANHA` | Campanhas ativas (START_TIME/END_TIME) + **EMPRESA_SLUG** (novo campo) |

### Fluxo de Dados

```
POST /rota/assign-oficina-community { ID_OFICINA, empresaSlug }
  │
  ├─ 1. Buscar oficina e obter coordenadas (CEP → lat/long via geolocation)
  │     - Usar GeolocationService.getLatLongByCep(oficina.CEP)
  │     - Se oficina já tem LATITUDE/LONGITUDE em cadastro_empresa, usar direto
  │
  ├─ 2. Buscar campanhas ativas do cliente (empresaSlug)
  │     - Query direta em CAMPANHA.EMPRESA_SLUG = empresaSlug
  │     - Filtrar: START_TIME <= NOW() <= END_TIME AND DELETED_AT IS NULL
  │
  ├─ 3. Para cada campanha ativa:
  │     │
  │     ├─ 3a. Verificar se oficina já está atribuída nesta campanha
  │     │       (SELECT em ROTA_PROMOTOR WHERE ID_OFICINA AND campanha)
  │     │       → Se sim: skip (idempotência)
  │     │
  │     ├─ 3b. Buscar todos CAMPANHA_PROMOTOR da campanha com promotor que tem coordenadas
  │     │       - INNER JOIN PROMOTOR (LATITUDE IS NOT NULL, LONGITUDE IS NOT NULL)
  │     │       - DELETED_AT IS NULL
  │     │
  │     ├─ 3c. Calcular distância Haversine entre cada promotor e a oficina
  │     │
  │     ├─ 3d. Filtrar promotores cujo raio (CAMPANHA_PROMOTOR.RAIO, default 20km) >= distância
  │     │
  │     ├─ 3e. Desempate: selecionar promotor com MENOR distância
  │     │
  │     └─ 3f. Criar ROTA_PROMOTOR vinculando oficina ao CAMPANHA_PROMOTOR vencedor
  │           - RotaService.createRotas(ID_CAMPANHA_PROMOTOR, ID_OFICINA)
  │           - Isso já dispara notificação via notificarRotasCriadas
  │
  └─ 4. Retornar resultado
```

### Critérios de Desempate

| Cenário | Comportamento |
|---------|--------------|
| Múltiplos promotores alcançam a oficina | Atribuir ao promotor com **menor distância** |
| Nenhum promotor alcança a oficina | Não é erro — oficina fica sem rota, será reavaliada se um promotor mudar de CEP |
| Oficina já atribuída na campanha | Skip (idempotência) — não duplicar rota |
| Campanha encerrada (END_TIME < now) | Ignorar — não recebe reparador novo |

### Determinação de Campanha Ativa

Uma campanha é considerada ativa quando:
```typescript
const now = new Date();
campanha.START_TIME <= now && campanha.END_TIME >= now && campanha.DELETED_AT === null
```

### Relação empresaSlug → Campanhas

A ligação entre `empresaSlug` e campanhas é direta via o campo `CAMPANHA.EMPRESA_SLUG` (novo campo a ser adicionado na tabela). O `ID_CLIENT` de CAMPANHA (base SQL Server) não tem de-para com o `ID_CLIENT` da tabela COMMUNITIES (PostgreSQL).

```sql
SELECT c."ID_CAMPANHA", c."NOME"
FROM "CAMPANHAS_OB"."CAMPANHA" c
WHERE c."EMPRESA_SLUG" = $1
  AND c."DELETED_AT" IS NULL
  AND c."START_TIME" <= NOW()
  AND c."END_TIME" >= NOW()
```

## API Contract

### Request

```
POST /rota/assign-oficina-community
Content-Type: application/json

{
  "ID_OFICINA": 12345,
  "empresaSlug": "empresa-exemplo"
}
```

### Response — Sucesso (200)

```json
{
  "success": true,
  "oficina": {
    "ID_OFICINA": 12345,
    "CEP": "01310100",
    "latitude": -23.5611,
    "longitude": -46.6564
  },
  "campanhas_processadas": 2,
  "atribuicoes": [
    {
      "ID_CAMPANHA": 10,
      "NOME_CAMPANHA": "Campanha SP 2026",
      "status": "atribuida",
      "promotor": {
        "ID_PROMOTOR": 5,
        "NOME": "João Silva",
        "distancia_km": 8.3
      },
      "ID_ROTA_PROMOTOR": 987
    },
    {
      "ID_CAMPANHA": 11,
      "NOME_CAMPANHA": "Campanha Nacional",
      "status": "sem_promotor_disponivel",
      "promotor": null,
      "ID_ROTA_PROMOTOR": null
    }
  ],
  "resumo": {
    "atribuidas": 1,
    "sem_promotor_disponivel": 1,
    "ja_atribuida": 0
  }
}
```

### Response — Oficina não encontrada (404)

```json
{
  "success": false,
  "error": "Oficina não encontrada."
}
```

### Response — CEP sem coordenadas (422)

```json
{
  "success": false,
  "error": "Não foi possível geocodificar o CEP da oficina."
}
```

### Response — Nenhuma campanha ativa (200)

```json
{
  "success": true,
  "oficina": {
    "ID_OFICINA": 12345,
    "CEP": "01310100",
    "latitude": -23.5611,
    "longitude": -46.6564
  },
  "campanhas_processadas": 0,
  "atribuicoes": [],
  "resumo": {
    "atribuidas": 0,
    "sem_promotor_disponivel": 0,
    "ja_atribuida": 0
  }
}
```

## Validation Schema (Zod)

```typescript
import { z } from "zod";

export const AssignOficinaCommunitySchema = z.object({
  ID_OFICINA: z.number().int().positive(),
  empresaSlug: z.string().min(1).max(100),
});
```

## Acceptance Criteria

- **AC1**: Endpoint recebe `ID_OFICINA` + `empresaSlug` e retorna resultado detalhado
- **AC2**: Oficina é geocodificada a partir do CEP (ou coordenadas existentes em `cadastro_empresa`)
- **AC3**: Apenas campanhas ativas (`START_TIME <= now <= END_TIME`, `DELETED_AT IS NULL`) são consideradas
- **AC4**: Desempate entre múltiplos promotores é feito por menor distância Haversine
- **AC5**: Se nenhum promotor alcança a oficina, retorna `sem_promotor_disponivel` sem erro
- **AC6**: Se a oficina já está atribuída na campanha, retorna `ja_atribuida` sem duplicar
- **AC7**: Rota criada dispara notificação automática via fluxo existente (`notificarRotasCriadas`)
- **AC8**: Campanhas encerradas (`END_TIME < now`) não recebem nova atribuição
- **AC9**: Endpoint é idempotente — chamadas repetidas não criam rotas duplicadas
- **AC10**: RAIO default de 20km quando `CAMPANHA_PROMOTOR.RAIO` é null

## Edge Cases

| Caso | Comportamento Esperado |
|------|----------------------|
| Oficina sem CEP e sem coordenadas | Retornar 422 |
| empresaSlug inexistente | Retornar 200 com 0 campanhas processadas |
| Oficina já atribuída em todas as campanhas | Retornar 200 com todas `ja_atribuida` |
| Promotor sem coordenadas | Ignorar esse promotor no cálculo |
| Dois promotores à mesma distância exata | Qualquer um (determinístico pelo ORDER BY do ID) |
| Campanha sem nenhum promotor vinculado | `sem_promotor_disponivel` |

## Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `entities/Campanha.ts` | Modificar | Adicionar campo `EMPRESA_SLUG` |
| `scripts/migration-empresa-slug-campanha.sql` | Criar | Migration para adicionar coluna `EMPRESA_SLUG` na tabela CAMPANHA |
| `service/rotaService.ts` | Modificar | Adicionar método `assignOficinaFromCommunitySignup` |
| `controllers/rotaController.ts` | Modificar | Adicionar handler para o novo endpoint |
| `routes/RotaRoute.ts` | Modificar | Registrar rota `POST /assign-oficina-community` |
| `schemas/rota.ts` | Modificar | Adicionar `AssignOficinaCommunitySchema` e response schemas |
| `__tests__/unit/rotaService.test.ts` | Modificar | Testes unitários do novo método |
