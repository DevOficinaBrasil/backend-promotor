# Rotas Segmentadas via CRM - Design

## Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Frontend — Builder de Filtros                                              │
│                                                                             │
│  1. GET /campanha-promotor/segmentacao/filter-options?tenantId=35           │
│     ← { fieldOptionArray, operatorCatalogArray }                            │
│                                                                             │
│  2. PUT /campanha-promotor/:id/segmentacao                                  │
│     → { filtroSegmentacao: DSL JSON }                                       │
│                                                                             │
│  3. POST /campanha-promotor/:id/segmentacao/preview                         │
│     → { limit?: 20 }                                                        │
│     ← { estimatedCount, hasMore, sampleArray }                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  Auto-assign (PromotorService.autoAssignRotas)                              │
│                                                                             │
│  Para cada CAMPANHA_PROMOTOR:                                               │
│    ┌─ cp.FILTRO_SEGMENTACAO != null? ───────────────────────────────────┐   │
│    │                                                                     │   │
│    │  SIM                                    NÃO                         │   │
│    │  ┌─────────────────────────┐            ┌─────────────────────────┐ │   │
│    │  │ resolveTenantId(slug)   │            │ getComunityNearby       │ │   │
│    │  │ SegmentDslBuilder.from  │            │ Oficinas(lat,lon,raio,  │ │   │
│    │  │   (FILTRO_SEGMENTACAO)  │            │ slug)                   │ │   │
│    │  │ definition.preview()    │            │ (fluxo atual)           │ │   │
│    │  │ → externalUserIds[]     │            └──────────┬──────────────┘ │   │
│    │  │ getSegmentedNearby      │                       │                │   │
│    │  │   Oficinas(lat,lon,     │                       │                │   │
│    │  │   raio, userIds)        │                       │                │   │
│    │  └──────────┬──────────────┘                       │                │   │
│    │             │                                      │                │   │
│    │             ▼                                      ▼                │   │
│    │  ┌───────────────────────────────────────────────────────────────┐  │   │
│    │  │  oficinas[] (mesmo formato)                                   │  │   │
│    │  │  → filtra já atribuídas                                       │  │   │
│    │  │  → RotaService.createRotas(ID_CAMPANHA_PROMOTOR, ids)         │  │   │
│    │  └───────────────────────────────────────────────────────────────┘  │   │
│    └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Decisões de Design

### D1: Coluna jsonb em `CAMPANHA_PROMOTOR`, sem tabela de critérios

O filtro é armazenado como `JSONB` na coluna `FILTRO_SEGMENTACAO` do `CAMPANHA_PROMOTOR`.

**Motivo:** O filtro é lido inteiro, escrito inteiro e nunca consultado por critério isolado. Normalizar adicionaria JOINs sem benefício. Segue o padrão da casa: relacionamento implícito, sem FK nova.

**Trade-off:** Sem índice GIN — não faremos queries filtrando por conteúdo do JSON.

### D2: Novo service `segmentacaoService.ts` para isolar lógica CRM

Toda a interação com `@obcrm/segmentation` fica em `segmentacaoService.ts`. Nem `oficinaService` nem `promotorService` importam o pacote diretamente.

**Motivo:** Isola a dependência externa. Se o pacote mudar ou o CRM ficar indisponível, o ponto de falha é único. Facilita mock nos testes. Segue o padrão de single-responsibility dos services existentes.

**Responsabilidades:**
- `buildDefinitionFromDsl(dsl)` — reconstrói a definition a partir do JSON salvo
- `previewContacts(dsl, tenantId, limit)` — executa preview no CRM
- `listFilterOptions(tenantId)` — retorna opções para o frontend
- `validateDsl(dsl)` — valida com `SegmentValidator`
- `resolveTenantId(empresaSlug)` — query `COMMUNITIES` → `CommunityID`

### D3: `getSegmentedNearbyOficinas` reutiliza formato de retorno

O novo método em `oficinaService` retorna o mesmo tipo de `getComunityNearbyOficinas`. Isso permite que `autoAssignRotas` consuma o resultado sem branching após a busca de oficinas.

**Motivo:** O código downstream (filtro de já atribuídas, `createRotas`) opera sobre `{ ID_OFICINA, distance, ... }`. Manter o contrato evita duplicação de lógica.

### D4: Reconstrução da definition a partir do JSON salvo — sem `SegmentDslBuilder`

O `SegmentDslBuilder` é uma fluent API para montar DSL. O JSON armazenado em `FILTRO_SEGMENTACAO` **já é** a DSL final (formato `SegmentDynamicDsl`). Para preview, passamos o JSON diretamente como `ruleDefinition` de um `SegmentVersionSnapshot`, sem reconstruir via builder.

**Motivo:** O builder produz o JSON; não precisamos do builder para consumir o JSON. O `SegmentEvaluator`/preview aceita o formato DSL diretamente via snapshot.

**Implementação:**
```ts
// segmentacaoService.ts
static async previewContacts(
  dsl: SegmentDynamicDsl,
  tenantId: number,
  limit: number
): Promise<PreviewResult> {
  const snapshot: SegmentVersionSnapshot = {
    id: `preview-${Date.now()}`,
    tenantId,
    segmentId: "inline-preview",
    segmentKey: "rotas-segmentadas",
    segmentType: "dynamic",
    versionNumber: 1,
    status: "published",
    ruleDefinition: dsl,
    createdAt: new Date().toISOString(),
  };

  // O build() do SegmentDslBuilder retorna objeto com .preview()
  // Precisamos reconstruir via builder para ter acesso ao .preview()
  const definition = SegmentDslBuilder.fromDsl(dsl).build();
  return definition.preview({
    tenantId,
    limit,
    includeEstimatedCount: true,
    accessToken: process.env.CRM_API_TOKEN!,
  });
}
```

> **Nota:** Verificar se `SegmentDslBuilder.fromDsl()` existe no pacote 0.3.0. Caso não exista, construir o builder programaticamente a partir dos nós da DSL ou usar o construct `new` do preview diretamente. Isso será validado na primeira task de implementação.

### D5: Resolução de `tenantId` via query existente em Communities

O `tenantId` do CRM é o `CommunityID` da tabela `COMMUNITIES`, filtrado por `EmpresaSlug`.

**Motivo:** O `EmpresaSlug` já é o identificador de contexto em todo o fluxo de campanhas. O mapeamento `slug → CommunityID` é 1:1. Reutiliza a mesma tabela sem criar lookup novo.

```sql
SELECT "CommunityID" FROM "OFICINA_PORTAL"."COMMUNITIES"
WHERE "EmpresaSlug" = $1
LIMIT 1
```

### D6: Hard-cap de 5000 IDs no preview — sem paginação na v1

O preview do CRM é chamado com `limit: 5000`. Se `hasMore = true`, logamos warning mas prosseguimos com os IDs recebidos.

**Motivo:** Oficinas dentro do raio de um promotor tipicamente são < 200. Mesmo com 5000 contatos do CRM, após join com `USUARIO` e filtro Haversine, o resultado final será pequeno. Paginar adicionaria complexidade sem ganho prático na v1.

**Trade-off:** Campanhas com segmentos muito amplos (>5000 contatos) podem não processar todos. Aceitável — o raio já limita o resultado final.

### D7: Batches de 1000 IDs no IN do Postgres

A query `USUARIO.ID_USUARIO IN (...)` será particionada em chunks de 1000 IDs. Cada batch retorna oficinas parciais; os resultados são concatenados e deduplicados por `ID_OFICINA` antes do Haversine.

**Motivo:** PostgreSQL não tem limite formal de parâmetros, mas queries com >1000 bind vars degradam no query planner. `ID_USUARIO` já é PK, então a lookup por batch é O(1) por ID.

### D8: Fallback para comunidade se CRM indisponível

Se o preview do CRM falhar (timeout, 5xx, token inválido), o auto-assign cai no fluxo de comunidade com log de error.

**Motivo:** Melhor atribuir rotas com critério mais amplo do que não atribuir nenhuma. A segmentação é um refinamento, não um bloqueio.

```ts
try {
  oficinas = await this.getOficinasViaSegmentacao(cp, promotor, slug);
} catch (error) {
  console.error(`Segmentação CRM falhou para CP ${cp.ID_CAMPANHA_PROMOTOR}, fallback para comunidade:`, error);
  oficinas = await OficinaService.getComunityNearbyOficinas(lat, lon, raio, slug);
}
```

### D9: Endpoints na rota existente `/promotor`, não em rota nova

Os 3 endpoints de segmentação são adicionados no `PromotorRoute.ts` existente, pois operam sobre `CAMPANHA_PROMOTOR` — que já é gerenciado via endpoints de promotor (`/promotor/link-campanha`, `/promotor/unlink-campanha-promotor`).

**Motivo:** Consistência com o padrão existente. Não há controller/route dedicados para `CampanhaPromotor`. Criar um novo par só para segmentação fragmentaria a API.

**Paths resultantes:**
- `GET  /promotor/segmentacao/filter-options?tenantId=N`
- `PUT  /promotor/campanha-promotor/:id/segmentacao`
- `POST /promotor/campanha-promotor/:id/segmentacao/preview`

### D10: Validação na escrita, não na leitura

A DSL é validada com `SegmentValidator.validateDefinition("dynamic", dsl)` no PUT. Na leitura (auto-assign), o JSON é consumido sem revalidação.

**Motivo:** Se passou pelo PUT, é válido. Revalidar no hot-path do auto-assign é overhead desnecessário.

## Mudanças por Arquivo

### 1. Migration SQL — `scripts/migration-filtro-segmentacao.sql`

```sql
ALTER TABLE "CAMPANHAS_OB"."CAMPANHA_PROMOTOR"
  ADD COLUMN IF NOT EXISTS "FILTRO_SEGMENTACAO" JSONB DEFAULT NULL;

COMMENT ON COLUMN "CAMPANHAS_OB"."CAMPANHA_PROMOTOR"."FILTRO_SEGMENTACAO"
  IS 'DSL JSON de segmentação CRM aplicada antes do cálculo de raio. Formato @obcrm/segmentation SegmentDynamicDsl.';
```

### 2. `entities/CampanhaPromotor.ts`

Adicionar coluna após `RAIO`:

```ts
@Column({ type: "jsonb", nullable: true, name: "FILTRO_SEGMENTACAO" })
FILTRO_SEGMENTACAO?: Record<string, unknown> | null;
```

### 3. `service/segmentacaoService.ts` (novo)

```ts
import { AppDataSourceSync } from "../data-source";
import {
  SegmentDslBuilder,
  SegmentValidator,
  type SegmentVersionDefinition,
} from "@obcrm/segmentation";

export default class SegmentacaoService {
  /**
   * Valida uma DSL de segmentação
   */
  static validateDsl(dsl: SegmentVersionDefinition): { valid: boolean; errors?: string[] } {
    const validator = new SegmentValidator();
    const result = validator.validateDefinition("dynamic", dsl);
    return result.valid
      ? { valid: true }
      : { valid: false, errors: result.errorArray };
  }

  /**
   * Resolve CommunityID (= tenantId do CRM) a partir do EmpresaSlug
   */
  static async resolveTenantId(empresaSlug: string): Promise<number | null> {
    const rows = await AppDataSourceSync.query(
      `SELECT "CommunityID" FROM "OFICINA_PORTAL"."COMMUNITIES" WHERE "EmpresaSlug" = $1 LIMIT 1`,
      [empresaSlug]
    );
    return rows.length > 0 ? rows[0].CommunityID : null;
  }

  /**
   * Executa preview de contatos no CRM via @obcrm/segmentation
   * Retorna lista de external_user_id (= ID_USUARIO)
   */
  static async previewContacts(
    dsl: SegmentVersionDefinition,
    tenantId: number,
    limit: number
  ): Promise<{
    externalUserIds: number[];
    estimatedCount: number;
    hasMore: boolean;
    sampleArray: Array<Record<string, unknown>>;
  }> {
    // Reconstrói definition com .preview() via builder
    const definition = SegmentDslBuilder
      .fromDsl(dsl)  // a ser validado vs. API real do pacote
      .build();

    const result = await definition.preview({
      tenantId,
      limit,
      includeEstimatedCount: true,
      accessToken: process.env.CRM_API_TOKEN!,
    });

    const externalUserIds = result.sampleArray
      .map((c: any) => parseInt(c.external_user_id, 10))
      .filter((id: number) => !isNaN(id));

    return {
      externalUserIds,
      estimatedCount: result.estimatedCount ?? 0,
      hasMore: result.hasMore,
      sampleArray: result.sampleArray,
    };
  }

  /**
   * Retorna opções de filtro disponíveis no CRM para o tenantId
   */
  static async listFilterOptions(tenantId: number): Promise<Record<string, unknown>> {
    // Precisa de uma definition mínima para chamar .listFilterOptions()
    const definition = SegmentDslBuilder
      .create()
      .when(SegmentDslBuilder.exists("contact.id"))
      .thenInclude("placeholder")
      .defaultExclude("placeholder")
      .build();

    return definition.listFilterOptions({
      tenantId,
      attributeLimit: 100,
      tagLimit: 200,
      accessToken: process.env.CRM_API_TOKEN!,
    });
  }
}
```

### 4. `service/oficinaService.ts`

Novo método público — `getSegmentedNearbyOficinas`:

```ts
static async getSegmentedNearbyOficinas(
  latitude: number,
  longitude: number,
  radiusKm: number,
  externalUserIds: number[]
): Promise<Array<{
  ID_OFICINA: number;
  LATITUDE: number;
  LONGITUDE: number;
  NOME_FANTASIA: string;
  ENDERECO: string;
  BAIRRO: string;
  CIDADE: string;
  ESTADO: string;
  NUMERO: string;
  CEP: string;
  CNPJ: string;
  TELEFONE: string;
  distance: number;
}>> {
  if (externalUserIds.length === 0) return [];

  const BATCH_SIZE = 1000;
  const allResults: any[] = [];

  for (let i = 0; i < externalUserIds.length; i += BATCH_SIZE) {
    const batch = externalUserIds.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map((_, idx) => `$${idx + 4}`).join(", ");

    const query = `
      SELECT DISTINCT ON (ce."id_oficina")
        ce."id_oficina" AS "ID_OFICINA",
        ce."latitude" AS "LATITUDE",
        ce."longitude" AS "LONGITUDE",
        ce."razao_social" AS "NOME_FANTASIA",
        CONCAT(ce."logradouro", ' ', ce."rua") AS "ENDERECO",
        ce."bairro" AS "BAIRRO",
        ce."cidade" AS "CIDADE",
        ce."estado" AS "ESTADO",
        ce."numero" AS "NUMERO",
        ce."cep" AS "CEP",
        ce."cnpj" AS "CNPJ",
        ce."telefone" AS "TELEFONE",
        (
          ${EARTH_RADIUS_KM} * acos(
            cos(radians($1)) * cos(radians(ce."latitude")) *
            cos(radians(ce."longitude") - radians($2)) +
            sin(radians($1)) * sin(radians(ce."latitude"))
          )
        ) AS distance
      FROM "MAIN_REGISTER"."USUARIO" us
      INNER JOIN "dw"."cadastro_empresa" ce
        ON ce."id_oficina" = us."ID_OFICINA"
      WHERE us."ID_USUARIO" IN (${placeholders})
        AND ce."longitude" IS NOT NULL
        AND ce."latitude" IS NOT NULL
        AND ce."status_receita" = 'ATIVA'
        AND (
          ${EARTH_RADIUS_KM} * acos(
            cos(radians($1)) * cos(radians(ce."latitude")) *
            cos(radians(ce."longitude") - radians($2)) +
            sin(radians($1)) * sin(radians(ce."latitude"))
          )
        ) <= $3
      ORDER BY ce."id_oficina", distance ASC
    `;

    const results = await AppDataSourceSync.query(query, [
      latitude, longitude, radiusKm, ...batch
    ]);
    allResults.push(...results);
  }

  // Deduplica por ID_OFICINA (batches podem ter overlap)
  const seen = new Set<number>();
  return allResults.filter((r: any) => {
    if (seen.has(r.ID_OFICINA)) return false;
    seen.add(r.ID_OFICINA);
    return true;
  });
}
```

**Diferença chave vs. `getComunityNearbyOficinas`:**
- Remove a cadeia `COMMUNITIES → USUARIO_COMMUNITY` — não filtra por comunidade
- Filtra diretamente por `USUARIO.ID_USUARIO IN (...)` — IDs vindos do CRM preview
- Batch de 1000 IDs por query
- Parâmetros posicionais: `$1=lat, $2=lon, $3=raio, $4...$N=userIds`

### 5. `service/campanhaPromotorService.ts`

Dois novos métodos:

```ts
static async updateFiltroSegmentacao(
  idCampanhaPromotor: number,
  filtro: Record<string, unknown> | null
): Promise<CampanhaPromotor | null> {
  const repo = AppDataSourceSync.getRepository(CampanhaPromotor);
  const cp = await repo.findOne({ where: { ID_CAMPANHA_PROMOTOR: idCampanhaPromotor } });
  if (!cp) return null;

  cp.FILTRO_SEGMENTACAO = filtro;
  await repo.save(cp);
  return cp;
}

static async getFiltroSegmentacao(
  idCampanhaPromotor: number
): Promise<{ filtro: Record<string, unknown> | null; empresaSlug: string | null } | null> {
  const rows = await AppDataSourceSync.query(
    `SELECT cp."FILTRO_SEGMENTACAO", c."EMPRESA_SLUG"
     FROM "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" cp
     INNER JOIN "CAMPANHAS_OB"."CAMPANHA" c ON c."ID_CAMPANHA" = cp."ID_CAMPANHA"
     WHERE cp."ID_CAMPANHA_PROMOTOR" = $1`,
    [idCampanhaPromotor]
  );
  if (rows.length === 0) return null;
  return { filtro: rows[0].FILTRO_SEGMENTACAO, empresaSlug: rows[0].EMPRESA_SLUG };
}
```

### 6. `service/promotorService.ts` — adaptação de `autoAssignRotas`

```ts
private static async autoAssignRotas(
  promotor: Promotor,
  campanhaPromotores: CampanhaPromotor[],
  empresaSlug: string
): Promise<{ rotasCriadas: number; error?: string }> {
  let totalRotasCriadas = 0;

  for (const cp of campanhaPromotores) {
    try {
      const raio = cp.RAIO ?? 20;
      let oficinas;

      if (cp.FILTRO_SEGMENTACAO) {
        try {
          oficinas = await this.getOficinasViaSegmentacao(
            cp.FILTRO_SEGMENTACAO, empresaSlug,
            promotor.LATITUDE!, promotor.LONGITUDE!, raio
          );
        } catch (error) {
          console.error(
            `Segmentação CRM falhou para CP ${cp.ID_CAMPANHA_PROMOTOR}, fallback para comunidade:`,
            error
          );
          oficinas = await OficinaService.getComunityNearbyOficinas(
            promotor.LATITUDE!, promotor.LONGITUDE!, raio, empresaSlug
          );
        }
      } else {
        oficinas = await OficinaService.getComunityNearbyOficinas(
          promotor.LATITUDE!, promotor.LONGITUDE!, raio, empresaSlug
        );
      }

      // ... resto do método inalterado (filtro assigned + createRotas) ...
    } catch (error) {
      console.error(`Auto-assign rotas failed for CP ${cp.ID_CAMPANHA_PROMOTOR}:`, error);
      return { rotasCriadas: totalRotasCriadas, error: 'Erro na auto-atribuição de rotas.' };
    }
  }
  return { rotasCriadas: totalRotasCriadas };
}

private static async getOficinasViaSegmentacao(
  dsl: Record<string, unknown>,
  empresaSlug: string,
  latitude: number,
  longitude: number,
  radiusKm: number
) {
  const tenantId = await SegmentacaoService.resolveTenantId(empresaSlug);
  if (!tenantId) throw new Error(`TenantId não encontrado para slug: ${empresaSlug}`);

  const PREVIEW_LIMIT = 5000;
  const preview = await SegmentacaoService.previewContacts(
    dsl as any, tenantId, PREVIEW_LIMIT
  );

  if (preview.hasMore) {
    console.warn(
      `Preview CRM retornou hasMore=true para CP com slug ${empresaSlug}. ` +
      `Processando apenas ${preview.externalUserIds.length} de ~${preview.estimatedCount} contatos.`
    );
  }

  return OficinaService.getSegmentedNearbyOficinas(
    latitude, longitude, radiusKm, preview.externalUserIds
  );
}
```

### 7. `schemas/promotor.ts` (ou novo `schemas/segmentacao.ts`)

```ts
export const FiltroSegmentacaoSchema = z.object({
  if: z.record(z.unknown()),
  then: z.object({
    decision: z.enum(["include", "exclude"]),
    reason: z.string().optional(),
  }),
  default: z.object({
    decision: z.enum(["include", "exclude"]),
    reason: z.string().optional(),
  }),
}).passthrough();

export const UpdateFiltroSegmentacaoSchema = z.object({
  filtroSegmentacao: FiltroSegmentacaoSchema.nullable(),
});

export const PreviewSegmentacaoSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
});

export const FilterOptionsQuerySchema = z.object({
  tenantId: z.coerce.number().int().positive(),
});
```

Validação Zod é superficial (shape check). A validação semântica profunda (`SegmentValidator`) ocorre no service.

### 8. `controllers/promotorController.ts`

Três novos handlers:

```ts
static getFilterOptions = async (req: Request, res: Response) => {
  const { tenantId } = req.validatedQuery;
  const options = await SegmentacaoService.listFilterOptions(tenantId);
  return res.json(options);
};

static updateFiltroSegmentacao = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { filtroSegmentacao } = req.body;

  // Validação semântica via SegmentValidator
  if (filtroSegmentacao) {
    const validation = SegmentacaoService.validateDsl(filtroSegmentacao);
    if (!validation.valid) {
      return res.status(400).json({
        message: "Filtro de segmentação inválido.",
        details: validation.errors,
      });
    }
  }

  const result = await CampanhaPromotorService.updateFiltroSegmentacao(id, filtroSegmentacao);
  if (!result) return res.status(404).json({ message: "Vínculo não encontrado." });

  return res.json({
    message: "Filtro de segmentação atualizado.",
    idCampanhaPromotor: id,
  });
};

static previewSegmentacao = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { limit } = req.body;

  const data = await CampanhaPromotorService.getFiltroSegmentacao(id);
  if (!data) return res.status(404).json({ message: "Vínculo não encontrado." });
  if (!data.filtro) return res.status(400).json({ message: "Nenhum filtro definido." });
  if (!data.empresaSlug) return res.status(400).json({ message: "Campanha sem EMPRESA_SLUG." });

  const tenantId = await SegmentacaoService.resolveTenantId(data.empresaSlug);
  if (!tenantId) return res.status(400).json({ message: "Comunidade não encontrada." });

  const preview = await SegmentacaoService.previewContacts(data.filtro as any, tenantId, limit ?? 20);
  return res.json({
    estimatedCount: preview.estimatedCount,
    hasMore: preview.hasMore,
    sampleArray: preview.sampleArray,
  });
};
```

### 9. `routes/PromotorRoute.ts`

Três novas rotas, com Zod validation middleware:

```ts
// Segmentação — filter-options
createDocumentedRoute(router, { ... })
  .get("/segmentacao/filter-options", validate(FilterOptionsQuerySchema, "query"), PromotorController.getFilterOptions);

// Segmentação — update filtro
createDocumentedRoute(router, { ... })
  .put("/campanha-promotor/:id/segmentacao", validate(UpdateFiltroSegmentacaoSchema), PromotorController.updateFiltroSegmentacao);

// Segmentação — preview
createDocumentedRoute(router, { ... })
  .post("/campanha-promotor/:id/segmentacao/preview", validate(PreviewSegmentacaoSchema), PromotorController.previewSegmentacao);
```

## Fluxo Detalhado — Auto-assign com Segmentação

```
1. autoAssignRotas(promotor, [cp1, cp2], "slug-empresa")

2. Para cp1 (FILTRO_SEGMENTACAO = { if: { equals: [...] }, then: ..., default: ... }):
   a. resolveTenantId("slug-empresa") → 35
   b. previewContacts(dsl, 35, 5000)
      → POST CRM /api/automacao/internal/segments/preview
      ← { sampleArray: [{ external_user_id: "305623" }, ...], hasMore: false, estimatedCount: 120 }
   c. externalUserIds = [305623, 363474, ...]
   d. getSegmentedNearbyOficinas(-23.5, -46.6, 20, [305623, 363474, ...])
      → SQL: USUARIO.ID_USUARIO IN (305623, 363474, ...)
              JOIN cadastro_empresa
              WHERE Haversine <= 20km
      ← [{ ID_OFICINA: 101, distance: 5.2 }, { ID_OFICINA: 203, distance: 12.1 }]
   e. getOficinasAssignedInCampanha(cp1.ID_CAMPANHA)
      → Set { 101 } (já atribuída)
   f. availableIds = [203]
   g. createRotas(cp1.ID_CAMPANHA_PROMOTOR, [203])

3. Para cp2 (FILTRO_SEGMENTACAO = null):
   a. getComunityNearbyOficinas(-23.5, -46.6, 20, "slug-empresa")
      → fluxo atual, sem mudança
```

## Considerações de Performance

| Operação | Volume típico | Impacto |
|----------|---------------|---------|
| CRM preview (HTTP) | 1 chamada por CP com filtro | ~50-200ms (rede externa) |
| SQL `IN (userIds)` | 1-5 batches de 1000 IDs | ~10-50ms por batch (PK lookup) |
| Haversine no SQL | < 5000 oficinas | Negligível (computed inline) |
| Dedup `ID_OFICINA` | < 200 resultados após raio | Negligível (Set in-memory) |

O gargalo é a chamada HTTP ao CRM. Como o auto-assign já é best-effort com log, a latência adicional (~200ms) é aceitável.

## Dependências de Implementação

```
Migration SQL  ←(precede)→  Entity update
      ↓
segmentacaoService.ts  ←(sem dependência de)→  Schema Zod
      ↓
oficinaService.getSegmentedNearbyOficinas
      ↓
campanhaPromotorService (novos métodos)
      ↓
promotorService.autoAssignRotas (adaptação)
      ↓
controller + routes (endpoints)
```

## Pontos a Validar na Implementação

1. **`SegmentDslBuilder.fromDsl()`** — Verificar se o pacote 0.3.0 expõe este método. Caso contrário, construir definition manualmente montando o snapshot e usando `preview()` do objeto retornado por `build()` com a DSL passada na condition tree.
2. **`definition.listFilterOptions()` sem filtro real** — Confirmar que uma definition placeholder (`exists("contact.id")`) funciona para obter as opções. Se não, verificar se há método estático no pacote.
3. **Token CRM** — Confirmar que `process.env.CRM_API_TOKEN` é válido e tem permissão para os endpoints de preview e filter-options.
