# Architecture

**Analyzed:** 2026-08-14 (supersedes 2026-08-04)
**Pattern:** Single-process layered monolith (route → controller → service → TypeORM entity), organized by layer, split by domain within each layer — **plus** a Postgres-backed outbox worker running in the same process on a cron tick.

The single largest change since the 2026-08-04 mapping: this service is no longer request-only. It now has a second entry point (the clock) and its first outbound integration (WhatsApp).

## High-Level Structure

```
HTTP request                                    node-cron tick (*/1 * * * *)
    │                                                    │
    ▼                                                    ▼
app.ts ─ cors() ─ express.json() ─ /openapi.json  schedule/outboxNotificacaoCron.ts
    │              /docs, /ping                          │  gates: NODE_ENV!=test
    ▼                                                    │         OUTBOX_VISITA_ENABLED==="1"
api.ts  (mounts 7 domain routers)                        ▼
    │  /campanha /campanha-perguntas /campanha-    OutboxNotificacaoService.tick()
    │  results /promotor /rota /oficina /visita           │
    ▼                                                    ├── claimBatch()  FOR UPDATE SKIP LOCKED
routes/*Route.ts ── createDocumentedRoute() ──┬─ validateSchema(zod)      │
    │                                          └─ openAPIGenerator        ▼
    │                                                    NotificacaoVisitaService.despacharNotificacao()
    ▼                                                    │  guards → recipient → token → send
controllers/*Controller.ts   HTTP concerns               ▼
    ▼                                            channels/channelRegistry → whatsappChannel
service/*Service.ts          business logic              │  axios POST, 10s timeout
    │                                                    ▼
    ├── AppDataSourceSync.getRepository()  TypeORM repositories (banco único)
    ├── AppDataSourceSync.query()  raw SQL for cross-schema joins and the claim
    └── utils/routeOptimizer.ts    pure geo/TSP functions
    ▼
PostgreSQL: CAMPANHAS_OB (owned) · MAIN_REGISTER (read) · dw (read) · OFICINA_PORTAL (read)
```

`app.ts` starts listening **before** and independently of DataSource initialization — a DB failure logs an error but leaves the server accepting traffic that will then fail per-request. The outbox cron is the exception: it is registered inside the `.then()`, after initialization, because its first tick queries the database immediately.

## Identified Patterns

### Documented route registration

**Location:** `utils/routeDocumentation.ts`, used by all 7 files in `routes/`
**Purpose:** One declaration produces three things: the Express route, the Zod validation middleware, and the OpenAPI path entry.
**Implementation:** `createDocumentedRoute(router, config)` — `config.schemas` feeds both `validateSchema()` and the OpenAPI request body/params/query; `config.documentation.responses` maps status code → description + Zod schema; `config.basePath + config.path` is rewritten `:id` → `{id}` for OpenAPI.
**Example:** `routes/RotaRoute.ts` (POST `/rota/create`)

**Caveat, updated:** of 50 call sites, **47 pass `middlewares: []`**. Only the three `/visita` routes mount anything — `visitaAuthMiddleware` + a rate limiter, or `limitadorExchange` on the public exchange. Every campaign, promoter, route and workshop endpoint is still unauthenticated while advertising `security: [{ bearerAuth: [] }]`. See CONCERNS.md.

### Static-class service layer

**Location:** all files in `service/`
**Purpose:** Business logic isolated from HTTP.
**Implementation:** Classes with only `static` methods, default-exported. No DI, no instantiation, no interfaces. Services are called directly by controllers.
**Example:** `service/promotorService.ts:10` — `export default class PromotorService { static async createPromotor(...) }`

Exception: `service/usuarioService.ts` exports a lowercase object/instance (`usuarioService`) rather than a static class — the sole deviation, consumed by `middlewares/authMiddleware.ts`.

### Dual-datasource repository wrapper

**Location:** `data-source.ts`
**Implementation:** um único `AppDataSourceSync`. Os services obtêm repositórios TypeORM por
`AppDataSourceSync.getRepository(Entidade)`, normalmente através de um getter privado estático
(`private static getPromotorRepo()`), e usam `AppDataSourceSync.query()` para SQL cru.

> Histórico: até 2026-08 existiu um wrapper `MigrationAwareRepository` sobre dois DataSources
> (PRD + legado read-only), com merge de leituras em memória. O fluxo dual foi removido e o
> padrão passou a ser um único banco. Contexto em `.specs/features/database-migration/`.

### Raw SQL for cross-schema work

**Location:** `service/oficinaService.ts`, `service/rotaService.ts`, `service/outboxNotificacaoService.ts`
Parameterized `AppDataSourceSync.query(sql, params)` with `$1..$n`. Column aliases are double-quoted to preserve the SCREAMING_CASE the entities expect. `findNearestOficinas` computes `6371 * acos(...)` inline and orders by it; `claimBatch` is the other significant raw statement.

### Envelope response shape

Controllers return `{ message, data? }` on success and `{ message, error? }` on failure. Validation errors use the `{ error, message, details[] }` shape from `middlewares/validation.ts`.

## Data Flow

### Visit notification, end to end *(new — the main flow added since 2026-08-04)*

1. **Enqueue.** A route is created (`POST /rota/create`); `RotaService` calls `NotificacaoVisitaService.agendarVisita`, which inserts a `PENDENTE` row with `AVAILABLE_AT = proximoHorarioEnvio(now, i, n)`. Nothing is sent.
2. **Claim.** A cron tick calls `OutboxNotificacaoService.tick()` → `claimBatch(tamanhoLote(), workerId)`. Due-ness uses the database's `now()`, never the process clock.
3. **Dispatch.** `despacharNotificacao(id)` runs, in order: campaign-ended check (→ `DISPENSADO`, `campanha already ended`, checked before resolving the recipient so it does not pollute anti-spam) → recipient resolution (oficina → usuario → phone, normalized by `utils/telefone.ts`) → `avaliarGuardas` (outstanding notification, recent confirmation, recently-updated address) → link token (`gerarLinkToken`, stored hashed) + scoped JWT → `getChannel(CANAL).send(...)`.
4. **Record.** `acaoDaFila` maps the verdict; the matching mark helper writes `ENVIADO` / retry with backoff / `FALHOU`, or just releases the lease when the dispatcher already persisted the terminal state.
5. **Confirm.** The recipient opens the link → `GET /visita/:token` exchanges the link token for the scoped JWT (`VISITA_SCOPE = "visita:confirmar"`) → `POST /visita/confirmar` and `PUT /visita/endereco` run behind `visitaAuthMiddleware`.

`EXPIRA_EM` is the campaign's `END_TIME`, resolved through `ROTA_PROMOTOR → CAMPANHA_PROMOTOR → CAMPANHA`, with a 168h fallback when the campaign has no end or the chain is broken — missing data must not cost a send.

The WhatsApp template is `atualizacao_dados_visita_oficina` with three ordered variables: user name, company name, link. The company name resolves via `CAMPANHA.EMPRESA_SLUG → OFICINA_PORTAL.COMMUNITIES` (`entities/Community.ts`); an unresolvable name degrades to an empty string rather than blocking the send.

### Nearby workshops (`GET /oficina/nearby`)

Unchanged. Raw SQL joins `dw.cadastro_empresa` → `MAIN_REGISTER.OFICINA`, filters on `status_receita = 'ATIVA'` and the `dw.temp_cnpj_sqlserver` allowlist, orders by Haversine, limits. Enrichment flags are **still hardcoded** to `'neutro'`/`'cinza'`; `DuckDBClient` is imported and never called. See CONCERNS.md.

### Promoter authentication (`POST /promotor/login`)

Unchanged. Zod-validated email/password → lookup across both databases → stored `SENHA` **decrypted** with AES-256-CBC → `crypto.timingSafeEqual` → controller signs a JWT with `JWT_SECRET`. The payload still does not match what `middlewares/authMiddleware.ts` expects; latent only because the middleware is never mounted.

Note the visit flow deliberately does **not** reuse this: `utils/visitaToken.ts` signs with `VISITA_TOKEN_SECRET` (falling back to `JWT_SECRET`) and its own scoped payload, so a token that travels through WhatsApp and sits in a chat history can never mint a login session.

### Route optimization (`POST /rota/optimize`)

Unchanged. Nearest Neighbour seed → 2-opt with endpoints pinned → `ROTA_PROMOTOR.ORDEM` persisted, `CampanhaPromotor.ESTRATEGIA_ORDENACAO = ROTA_OTIMIZADA`. `PUT /rota/reorder` handles `MANUAL` and `PROXIMIDADE_PROMOTOR`. `haversine()` now lives in its own `utils/haversine.ts`.

## Code Organization

**Approach:** Layer-based at the top level, domain-based within each layer. Adding a domain means touching six directories plus a line in `api.ts`. The two new top-level directories (`channels/`, `schedule/`) break that pattern deliberately — they are capability directories, not domain ones, and neither has a route.

**Module boundaries:** Still unenforced — no path aliases in practice, no lint rules, no barrels. Cross-domain calls happen by importing another service directly.

**Domains:** `campanha`, `campanha-perguntas`, `campanha-results`, `promotor`, `rota`, `oficina`, `visita`. `usuario` remains entity + service only (auth support); `notificacao` has entity + services + scheduler but no HTTP surface of its own — it is driven by the clock and by `scripts/outboxConsole.ts`.
