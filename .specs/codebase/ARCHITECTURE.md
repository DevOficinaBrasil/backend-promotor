# Architecture

**Analyzed:** 2026-08-04
**Pattern:** Single-process layered monolith (route → controller → service → TypeORM entity), organized by layer, split by domain within each layer.

## High-Level Structure

```
HTTP request
    │
    ▼
app.ts ─── cors() ─── express.json() ─── /openapi.json, /docs, /ping
    │
    ▼
api.ts  (mounts 6 domain routers)
    │  /campanha  /campanha-perguntas  /campanha-results  /promotor  /rota  /oficina
    ▼
routes/*Route.ts ── createDocumentedRoute() ──┬── validateSchema(zod)  [middleware]
    │                                          └── openAPIGenerator.registerPath()  [side effect]
    ▼
controllers/*Controller.ts   HTTP concerns: parse, status codes, error envelope
    ▼
service/*Service.ts          business logic + persistence
    │
    ├── MigrationAwareRepository ──┬── AppDataSourceSync (PRD, read+write)
    │                              └── LegacyDataSource  (legacy, read-only)
    ├── AppDataSourceSync.query()  raw SQL for cross-schema joins
    └── utils/routeOptimizer.ts    pure geo/TSP functions
    ▼
PostgreSQL: CAMPANHAS_OB (owned) · MAIN_REGISTER (read) · dw (read)
```

`app.ts` starts listening **before** and independently of DataSource initialization — a DB failure logs an error but leaves the server accepting traffic that will then fail per-request.

## Identified Patterns

### Documented route registration

**Location:** `utils/routeDocumentation.ts`, used by all 6 files in `routes/`
**Purpose:** One declaration produces three things: the Express route, the Zod validation middleware, and the OpenAPI path entry.
**Implementation:** `createDocumentedRoute(router, config)` — `config.schemas` feeds both `validateSchema()` and the OpenAPI request body/params/query; `config.documentation.responses` maps status code → description + Zod schema; `config.basePath + config.path` is rewritten `:id` → `{id}` for OpenAPI.
**Example:** `routes/RotaRoute.ts:27-62` (POST `/rota/create`)

**Caveat:** `config.middlewares` is `[]` at every one of the 37 call sites, so no authentication runs despite `security: [{ bearerAuth: [] }]` being declared. See CONCERNS.md.

### Static-class service layer

**Location:** all files in `service/`
**Purpose:** Business logic isolated from HTTP.
**Implementation:** Classes with only `static` methods, default-exported. No DI, no instantiation, no interfaces. Services are called directly by controllers.
**Example:** `service/promotorService.ts:10` — `export default class PromotorService { static async createPromotor(...) }`

Exception: `service/usuarioService.ts` exports a lowercase object/instance (`usuarioService`) rather than a static class — the sole deviation, consumed by `middlewares/authMiddleware.ts`.

### Dual-datasource repository wrapper

**Location:** `utils/migrationRepository.ts`
**Purpose:** Serve reads from both the new and legacy database during a zero-downtime migration, while ensuring all writes land only on the new one.
**Implementation:** `MigrationAwareRepository<T>` wraps two TypeORM `Repository<T>` instances.
- `find()` → queries both, merges, dedupes by the PK field passed to the constructor, new DB wins
- `findOne()` → new DB first, falls back to legacy only on miss
- `save`/`saveMany`/`update`/`softDelete`/`remove`/`createQueryBuilder` → new DB only
- Legacy failures are caught and downgraded to a `console.warn`, returning new-DB-only results

Raw-SQL equivalents: `queryBothAndMerge()` and `findOneFromBoth()`, with an optional `legacySql` override for queries whose cross-schema joins do not exist on the legacy instance.

**Adoption is partial.** Within a single service, some methods use the wrapper and others call `AppDataSourceSync.getRepository()` directly — e.g. `service/promotorService.ts` uses `MigrationAwareRepository` in `createPromotor`/`findPromotorById`/`getAllPromotores`, but raw `AppDataSourceSync` in `unlinkCampanhaPromotor:244`, `getCampanhasByPromotor:267`, and `getPromotoresByClientId:281`. Those three are legacy-blind by design for writes, but `getCampanhasByPromotor` and `getPromotoresByClientId` are reads that silently skip legacy data.

### Raw SQL for cross-schema work

**Location:** `service/oficinaService.ts:26-59`, `service/rotaService.ts`
**Purpose:** TypeORM relations cannot express joins that span `dw`, `MAIN_REGISTER`, and `CAMPANHAS_OB`, nor Haversine distance ordering.
**Implementation:** Parameterized `AppDataSourceSync.query(sql, params)` with `$1..$n` placeholders. Column aliases are double-quoted to preserve the SCREAMING_CASE the entities expect.
**Example:** `findNearestOficinas` computes `6371 * acos(...)` inline and orders by it.

### Envelope response shape

Every controller returns `{ message: string, data?: unknown }` on success and `{ message: string, error?: string }` on failure. Validation errors bypass this and use the `{ error, message, details[] }` shape from `middlewares/validation.ts`.

## Data Flow

### Nearby workshops (`GET /oficina/nearby`)

1. `routes/OficinaRoute.ts` validates `latitude`/`longitude`/`limit` query params into `req.validatedQuery`
2. `controllers/oficinaController.ts` reads them and calls `OficinaService.findNearestOficinas(lat, lon, limit = 70)`
3. Raw SQL joins `dw.cadastro_empresa` → `MAIN_REGISTER.OFICINA`, filters to `status_receita = 'ATIVA'` and CNPJs present in `dw.temp_cnpj_sqlserver` with `CREATED_AT > '2026-01-01'`, orders by Haversine distance, limits
4. Results are decorated with `flag_engajamento` / `flag_sentimento` / `flag_treinamento` / `cor_icone`

Step 4 is **currently hardcoded** to `'neutro'`/`'cinza'` (`service/oficinaService.ts:69-78`). `DuckDBClient` is imported at line 3 but never called. `docs/DUCKDB_INTEGRATION.md` describes the enrichment as live; it is not.

### Promoter authentication (`POST /promotor/login`)

1. Zod validates `EMAIL` + `SENHA`
2. `PromotorService.loginPromotor` looks up the promoter by email (checks both databases)
3. Stored `SENHA` is **decrypted** with AES-256-CBC (`utils/encryption.ts`), key derived as `sha256(CRIPTKEY)`
4. Plaintext comparison via `crypto.timingSafeEqual`, guarded by a length pre-check that returns `null` on mismatch
5. Controller signs a JWT with `JWT_SECRET`, strips `SENHA`, returns token + promoter

The token issued here carries promoter fields, while `middlewares/authMiddleware.ts` expects a payload shaped `{ user: { ID_USUARIO, NOME, EMAIL, SENHA }, iat }` and resolves it against `usuarioService.getUserById`. These two are not the same identity model. Since the middleware is never mounted, the mismatch is currently latent rather than breaking.

### Route optimization (`POST /rota/optimize`)

1. `RotaService.optimizeAndSaveRoute(ID_CAMPANHA_PROMOTOR, ID_OFICINA_INICIO, ID_OFICINA_FIM)`
2. Coordinates loaded for the promoter's workshops
3. `utils/routeOptimizer.ts` — Nearest Neighbour seed, then 2-opt improvement with endpoints pinned, distances via `haversine()`
4. Resulting order persisted to `ROTA_PROMOTOR.ORDEM`; `CampanhaPromotor.ESTRATEGIA_ORDENACAO` set to `ROTA_OTIMIZADA`

Alternative strategies are handled by `PUT /rota/reorder`: `MANUAL` accepts explicit `{ ID_ROTA_PROMOTOR, ORDEM }` pairs; `PROXIMIDADE_PROMOTOR` clears all `ORDEM` values and defers ordering to the client.

## Code Organization

**Approach:** Layer-based at the top level, domain-based within each layer. Adding a domain means touching six directories (`entities/`, `schemas/`, `service/`, `controllers/`, `routes/`, plus a line in `api.ts`).

**Module boundaries:** There are no enforced boundaries — no path aliases beyond `@/*`, no lint rules, no index barrels. Cross-domain calls happen by importing another service directly (e.g. `campanhaService` imports `DuckDBClient` and campaign/promoter entities alike).

**Domains:** `campanha`, `campanha-perguntas`, `campanha-results`, `promotor`, `rota`, `oficina`. `usuario` exists as an entity and service but has no route, controller, or schema — it is auth-support only.
