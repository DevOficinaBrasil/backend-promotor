# Rotas Segmentadas via CRM

## Problem Statement

A distribuição automática de rotas usa apenas um critério — raio de atuação a partir do endereço do promotor. Oficinas são buscadas via inscrição na comunidade (`getComunityNearbyOficinas`), sem possibilidade de segmentar o público antes de atribuir.

Precisamos aplicar filtros de segmentação do CRM **antes** do cálculo de Haversine, limitando o universo de oficinas àquelas cujos donos atendem critérios definidos pelo operador (ex.: profissão, região, tags, atributos de contato).

O CRM já realiza essa segmentação por comunidade/tenant. O pacote `@obcrm/segmentation` expõe a API necessária (`SegmentDslBuilder`, `definition.preview`, `definition.listFilterOptions`).

## Goals

- [ ] Adicionar coluna `FILTRO_SEGMENTACAO` (jsonb) em `CAMPANHA_PROMOTOR` para persistir a DSL de segmentação junto do vínculo
- [ ] Implementar `getSegmentedNearbyOficinas` — versão da busca de oficinas que usa contatos extraídos do CRM (via `preview`) em vez da cadeia comunidade→usuário
- [ ] Integrar no fluxo de auto-assign existente: se `FILTRO_SEGMENTACAO` estiver preenchido, usar a nova busca; caso contrário, manter comportamento atual (comunidade)
- [ ] Expor endpoint para obter opções de filtro disponíveis (`listFilterOptions`) ao frontend
- [ ] Expor endpoint para persistir/atualizar o filtro de segmentação no vínculo promotor↔campanha

## Contexto Técnico

### Entidades Envolvidas

| Entidade | Schema/Tabela | Papel |
|----------|---------------|-------|
| CampanhaPromotor | `CAMPANHAS_OB.CAMPANHA_PROMOTOR` | Vínculo promotor↔campanha; receberá nova coluna `FILTRO_SEGMENTACAO` |
| Promotor | `CAMPANHAS_OB.PROMOTOR` | CEP, LATITUDE, LONGITUDE do promotor |
| CadastroEmpresa | `dw.cadastro_empresa` | Dados das oficinas (lat, long, endereço) |
| Usuario | `MAIN_REGISTER.USUARIO` | Relaciona `external_user_id` (CRM) → `ID_USUARIO` → `ID_OFICINA` |
| Communities | `OFICINA_PORTAL.COMMUNITIES` | Resolve `EmpresaSlug` → `tenantId` para chamada ao CRM |

### Fluxo de Dados (com segmentação)

```
Operador define filtro no frontend
  → PUT /campanha-promotor/:id/segmentacao  { filtroSegmentacao: DSL JSON }
    → Persiste em CAMPANHA_PROMOTOR.FILTRO_SEGMENTACAO

Auto-assign (existente ou on-demand):
  → Lê CAMPANHA_PROMOTOR (RAIO, FILTRO_SEGMENTACAO)
  → Se FILTRO_SEGMENTACAO != null:
      → Monta definition via SegmentDslBuilder a partir do JSON
      → definition.preview({ tenantId, limit: 5000, accessToken })
      → Extrai external_user_id[] do sampleArray
      → Query: USUARIO.ID_USUARIO IN (...) → cadastro_empresa (lat, long, ...)
      → Aplica Haversine (promotor lat/long, RAIO)
      → Retorna oficinas filtradas + dentro do raio
  → Senão:
      → getComunityNearbyOficinas (fluxo atual, sem mudança)
  → Filtra já atribuídas → createRotas
```

### Relação CRM → Oficina

```
CRM preview.sampleArray[].external_user_id
  = MAIN_REGISTER.USUARIO.ID_USUARIO
  → USUARIO.ID_OFICINA
  → dw.cadastro_empresa.id_oficina
```

### Pacote `@obcrm/segmentation`

**Montagem do filtro (DSL):**
```ts
const definition = SegmentDslBuilder
  .create()
  .when(SegmentDslBuilder.<operador>("<campo>", <valor>))
  .and(SegmentDslBuilder.<operador>("<campo>", <valor>))
  .thenInclude("segment_rule_matched")
  .defaultExclude("default_exclude")
  .build();
```

**Preview de contatos:**
```ts
const result = await definition.preview({
  tenantId: <id>,
  limit: 5000,
  includeEstimatedCount: true,
  accessToken: process.env.CRM_API_TOKEN!,
});
// result.sampleArray[].external_user_id → ID_USUARIO
```

**Opções de filtro (alimenta frontend):**
```ts
const options = await definition.listFilterOptions({
  tenantId: <id>,
  attributeLimit: 100,
  tagLimit: 200,
  accessToken: process.env.CRM_API_TOKEN!,
});
// options.fieldOptionArray[] → { path, label, valueType, operatorArray, source }
```

## Schema Change

### Migration: `CAMPANHA_PROMOTOR.FILTRO_SEGMENTACAO`

```sql
ALTER TABLE "CAMPANHAS_OB"."CAMPANHA_PROMOTOR"
  ADD COLUMN "FILTRO_SEGMENTACAO" JSONB DEFAULT NULL;

COMMENT ON COLUMN "CAMPANHAS_OB"."CAMPANHA_PROMOTOR"."FILTRO_SEGMENTACAO"
  IS 'DSL JSON de segmentação CRM aplicada antes do cálculo de raio. Formato @obcrm/segmentation SegmentDynamicDsl.';
```

**Justificativa jsonb:** o filtro é lido inteiro, escrito inteiro e nunca consultado por critério isolado — normalizar adicionaria joins desnecessários.

### Entity Update (`CampanhaPromotor`)

```ts
@Column({ type: "jsonb", nullable: true, name: "FILTRO_SEGMENTACAO" })
FILTRO_SEGMENTACAO?: Record<string, unknown> | null;
```

## Endpoints

### GET `/campanha-promotor/segmentacao/filter-options`

Retorna campos disponíveis para montar filtro no frontend.

**Query params:** `tenantId` (int, obrigatório)

**Response 200:**
```json
{
  "fieldOptionArray": [
    { "path": "contact.timezoneName", "label": "Contact: timezoneName", "valueType": "string", "operatorArray": ["equals","in","exists"], "source": "core" }
  ],
  "operatorCatalogArray": [...]
}
```

### PUT `/campanha-promotor/:id/segmentacao`

Persiste filtro de segmentação no vínculo.

**Body:**
```json
{
  "filtroSegmentacao": {
    "if": { "and": [ { "equals": ["contact.professionalOccupation", "Mecânico"] } ] },
    "then": { "decision": "include", "reason": "segment_rule_matched" },
    "default": { "decision": "exclude", "reason": "default_exclude" }
  }
}
```

Validação: o JSON deve ser uma `SegmentVersionDefinition` válida (`SegmentValidator.validateDefinition`). Rejeitar com 400 se inválida.

**Response 200:** `{ message: "Filtro de segmentação atualizado.", idCampanhaPromotor: <id> }`

### POST `/campanha-promotor/:id/segmentacao/preview`

Preview dos contatos que seriam retornados pelo filtro (sem criar rotas).

**Body:** `{ limit?: number }` (default 20)

**Response 200:**
```json
{
  "estimatedCount": 1495,
  "hasMore": true,
  "sampleArray": [ { "external_user_id": "305623", "fullName": "...", "email": "..." } ]
}
```

## Service Layer

### `oficinaService.getSegmentedNearbyOficinas`

```ts
static async getSegmentedNearbyOficinas(
  latitude: number,
  longitude: number,
  radiusKm: number,
  externalUserIds: number[]
): Promise<NearbyOficina[]>
```

**Comportamento:**
1. Recebe `externalUserIds` (já extraídos do CRM preview)
2. Query: `MAIN_REGISTER.USUARIO` WHERE `ID_USUARIO IN (...)` → join `dw.cadastro_empresa` ON `id_oficina`
3. Filtra `status_receita = 'ATIVA'`, lat/long NOT NULL
4. Aplica Haversine com `latitude`, `longitude`, `radiusKm`
5. Retorna mesmo formato de `getComunityNearbyOficinas`

**Chunk de IDs:** se `externalUserIds.length > 1000`, quebrar em batches de 1000 (limite prático de parâmetros IN no Postgres).

### `campanhaPromotorService` — novos métodos

- `updateFiltroSegmentacao(idCampanhaPromotor, filtro)` — valida DSL, persiste jsonb
- `getFiltroSegmentacao(idCampanhaPromotor)` — lê o filtro salvo

### `promotorService.autoAssignRotas` — adaptação

Adicionar branch condicional:
```
se cp.FILTRO_SEGMENTACAO != null:
  → montar definition a partir do JSON
  → preview({ tenantId resolvido do slug, limit: 5000 })
  → extrair externalUserIds
  → getSegmentedNearbyOficinas(lat, lon, raio, externalUserIds)
senão:
  → getComunityNearbyOficinas (comportamento atual)
```

### Resolução de tenantId

O `tenantId` necessário para chamar o CRM preview será resolvido a partir do `EmpresaSlug` da campanha:
```sql
SELECT "CommunityID" FROM "OFICINA_PORTAL"."COMMUNITIES" WHERE "EmpresaSlug" = $1
```

`CommunityID` = `tenantId` no CRM.

## Regras de Negócio

1. `FILTRO_SEGMENTACAO` é **opcional**. Quando `NULL`, o auto-assign funciona exatamente como hoje (comunidade + raio).
2. Quando preenchido, o filtro do CRM é aplicado **antes** do Haversine — reduz universo de oficinas.
3. O filtro deve ser validado com `SegmentValidator` no momento da escrita (PUT). Filtro inválido = 400.
4. Preview do CRM é limitado a `limit: 5000` no auto-assign (hard-cap). Se `hasMore = true`, log de warning — oficinas além do limite não serão processadas nesta execução.
5. O `accessToken` para o CRM vem de `process.env.CRM_API_TOKEN` — não trafega pelo frontend.
6. Filtros existentes não afetam rotas já criadas; aplicam-se apenas em novas atribuições.

## Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| Preview retorna muitos IDs (>5000) e perde oficinas | Hard-cap + log warning; futuramente paginar |
| CRM indisponível no momento do auto-assign | Catch com fallback para fluxo comunidade + log error |
| Query IN com milhares de IDs lenta | Batches de 1000 + index em `USUARIO.ID_USUARIO` (já PK) |
| Filtro salvo fica desatualizado vs. CRM | Filtro é DSL declarativa — avaliado em runtime contra dados frescos |

## Fora de Escopo

- UI/frontend do builder de filtros (apenas contrato de API é definido aqui)
- Reprocessamento retroativo de rotas existentes ao mudar filtro
- Paginação de preview (v1 usa hard-cap de 5000)
- Notificações ao promotor sobre mudança de filtro

## Acceptance Criteria

1. Promotor com `FILTRO_SEGMENTACAO` preenchido recebe apenas oficinas de donos que atendem aos critérios do segmento **E** estão dentro do raio
2. Promotor sem `FILTRO_SEGMENTACAO` continua recebendo oficinas pelo fluxo de comunidade (regressão zero)
3. PUT com DSL inválida retorna 400 com detalhes de validação
4. Preview retorna contatos sem criar rotas
5. Filter-options retorna campos do CRM para o frontend montar o builder
6. Migration é idempotente (`ADD COLUMN IF NOT EXISTS` ou guard no script)
