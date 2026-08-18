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
    ├── MigrationAwareRepository ──┬── AppDataSourceSync (PRD, read+write)
    │                              └── LegacyDataSource  (legacy, read-only)
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
**Implementation:** Classes with only `static` members, default-exported. No DI, no instantiation, no interfaces.
**Exception:** `service/usuarioService.ts` exports a lowercase object instance.

The newer services keep the class but also export free functions alongside it — `envioGuards.ts` is functions only (`avaliarGuardas`, `enderecoRecente`), and `outboxNotificacaoService.ts` exports both the class and its pure decision helpers (`computeBackoffMs`, `shouldMarkFailed`, `acaoDaFila`, `tamanhoLote`). This is deliberate: the pure functions are the parts under unit test.

### Port + adapter for outbound channels *(new)*

**Location:** `channels/`
**Purpose:** Keep provider specifics out of the dispatch logic, and make the channel swappable per `NotificacaoVisita.CANAL`.
**Implementation:** `ChannelSender` is the port — one `send(params): Promise<ChannelSendResult>` where the result is a discriminated union (`{success:true, messageId, providerMessageId}` | `{success:false, reason, providerCode}`). `channelRegistry.ts` holds a `Map<CanalNotificacao, ChannelSender>` and throws only on an unregistered enum value, which is a programmer error rather than a runtime condition. `whatsappChannel.ts` is the sole adapter.
**Classification lives in the adapter, not the queue:** the channel maps provider error codes into `reason` buckets (`TOKEN_INVALID`/`TEMPLATE_NOT_FOUND`/… → configuration; `RATE_LIMITED`/`QUOTA_EXCEEDED` → rate; network/5xx → transient). The queue reads only the verdict.

### Outbox on Postgres *(new)*

**Location:** `service/outboxNotificacaoService.ts`, `schedule/outboxNotificacaoCron.ts`, `utils/agendamento.ts`
**Purpose:** Move the send out of the request cycle and make duplicate delivery impossible when the server is copied.

`NOTIFICACAO_VISITA` is both the audit record and the queue row — one table, no second store. The outbox columns are `AVAILABLE_AT`, `LOCKED_AT`, `LOCKED_BY`, `ATTEMPTS`.

**Claim** (`claimBatch`): CTE `picked` selecting `STATUS='PENDENTE' AND AVAILABLE_AT IS NOT NULL AND AVAILABLE_AT <= now()` with an expired-lease escape, `ORDER BY AVAILABLE_AT`, `LIMIT $1`, `FOR UPDATE SKIP LOCKED`; then `UPDATE … FROM picked` stamping `LOCKED_AT`/`LOCKED_BY` and incrementing `ATTEMPTS`, `RETURNING` the id.

Three details carry the design:
- **`SKIP LOCKED` is what makes a copied server safe** — two workers get disjoint sets and neither blocks the other. No leader election, no per-machine config.
- **`ATTEMPTS` increments at claim time, not after dispatch.** A process killed mid-send still burns an attempt, so a row that crashes the worker retires at the ceiling instead of looping forever.
- **`AVAILABLE_AT IS NOT NULL` excludes pre-outbox rows.** Without it, the worker's first deploy would re-send the entire history at once.

**Decide** (`acaoDaFila`): pure function mapping a dispatch verdict to a queue action — `ENVIADO`, `CONCLUIDO` (dispensado/terminal, already persisted by the dispatcher), `RETENTAR`, `FALHOU`. Backoff ladder copied verbatim from `backend-communities`' `OutboxService`: `0 → 15s → 60s → 5min → 15min`.

**Tick** (`tick`): never throws. Per-row `try/catch` so one bad workshop does not cost the batch, and a claim failure returns quietly rather than killing the process that also serves requests. The cron wrapper holds a closure re-entrancy flag so a slow batch cannot stack ticks on itself.

**Schedule** (`proximoHorarioEnvio`): a route created today always sends in **tomorrow's** window (`America/Sao_Paulo`), never "whenever ops imported". With `NOTIFICACAO_HORA_ENVIO_FIM` set above the start hour, a batch of n is spread as `inicio + (fim-inicio)*i/n` — `i/n` and not `i/(n-1)`, so the last item lands strictly inside the window. `OUTBOX_VISITA_ENVIO_IMEDIATO="1"` returns `agora` unchanged, for local testing only.

### Send-time evaluation *(new)*

Guards, recipient resolution and token issuance run in `despacharNotificacao`, at send time — not when the route is created. All three are time-dependent (address freshness, campaign already ended, per-recipient anti-spam), so evaluating them at 09:00 is *more* correct than evaluating them at import. The accepted side effect: a route created today can legitimately become `DISPENSADO` tomorrow. It also keeps `EXPIRA_EM` from burning part of its window sitting in the queue.

### Dual-datasource repository wrapper

**Location:** `utils/migrationRepository.ts` — unchanged since the last mapping.
`MigrationAwareRepository<T>` wraps two TypeORM repositories: `find()` queries both and dedupes by PK with the new DB winning; `findOne()` tries new first, falls back to legacy on miss; every write goes to the new DB only. Legacy failures degrade to a `console.warn` and new-DB-only results. Raw-SQL equivalents: `queryBothAndMerge()`, `findOneFromBoth()`.

**Adoption is still partial** — within one service some methods use the wrapper and others call `AppDataSourceSync.getRepository()` directly (see CONCERNS.md). Note the outbox deliberately uses the raw `AppDataSourceSync` throughout: the queue is a write path on the owned schema, and a merged read of queue state would be meaningless.

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
