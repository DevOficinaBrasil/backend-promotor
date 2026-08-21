# Project Structure

**Analyzed:** 2026-08-14 (supersedes 2026-08-04)
**Root:** `/Users/augustodearrudakono/Documents/backend-promotor`
**Size:** ~12,600 lines of TypeScript across 76 source files + 44 test files
**Branch mapped:** `merge/visit-notification+auto-assign`

Growth since the 2026-08-04 mapping is almost entirely one feature: the **visit-notification flow** (`/visita`, WhatsApp channel, Postgres outbox, scheduler). Everything under "New since 2026-08-04" below did not exist then.

## Directory Tree

```
backend-promotor/
├── app.ts                      # entrypoint: express, cors, /docs, /openapi.json, /ping, listen, registrarOutboxCron() 
├── api.ts                      # mounts the 7 domain routers
├── data-source.ts              # AppDataSourceSync (único DataSource da aplicação)
├── package.json                # name: "backend-hijack"
├── tsconfig.json · jest.config.ts
├── Dockerfile                  # node:20-alpine, EXPOSE 3008, runs ts-node
├── task_definition.tpl.json    # ECS task definition template
├── exemple.env                 # ⚠ tracked in git, contains live-looking secrets
├── .env.example                # placeholder values (the safe one) — now documents the outbox/visita vars
├── api_docs.json               # generated OpenAPI snapshot (stale relative to code)
│
├── routes/                     # 7 files — endpoint declaration + OpenAPI metadata (50 routes)
├── controllers/                # 7 files — HTTP concerns only
├── service/                    # 13 files — business logic + persistence
├── entities/                   # 12 files — TypeORM models
├── schemas/                    # 9 files — Zod, doubles as validation + OpenAPI
├── middlewares/                # authMiddleware.ts (unused), visitaAuthMiddleware.ts (mounted), validation.ts
├── channels/                   # ← NEW: outbound notification senders (ChannelSender port + WhatsApp adapter)
├── schedule/                   # ← NEW: outboxNotificacaoCron.ts (node-cron tick source)
├── utils/                      # 11 files — cross-cutting helpers
├── config/                     # openapi.ts — OpenAPI registry singleton
├── types/ · @types/            # ModeloType.ts; express request augmentation
│
├── __tests__/                  # unit/ (30) + integration/ (10) + helpers/
├── __mocks__/                  # data-source.ts (repaired — see TESTING.md)
│
├── docs/                       # 10 hand-written markdown docs (predate .specs/, partly stale)
├── scripts/                    # 4 .sql migrations, 5 .ts utilities, 1 .md guide
├── duckdb/ · templates/ · assets/
│
└── .specs/                     # spec-driven workflow state
    ├── project/STATE.md        # decision log — 17 decisions, the outbox rationale lives here
    ├── LESSONS.md
    ├── features/               # 8 feature specs
    └── codebase/               # ← these documents
```

Agent skill definitions are duplicated across `.claude/`, `.agents/`, `.cline/`, `.opencode/`, and `.github/skills/`. Tooling config, not application code — they dominate `git status` noise.

## New since 2026-08-04

**`channels/`** — the service's first outbound integration, structured as a port + adapter.
- `ChannelSender.ts` — the port: `ChannelSendParams`, discriminated-union `ChannelSendResult` (`{success:true,…}` | `{success:false, reason, providerCode}`)
- `whatsappChannel.ts` — the adapter: axios POST to `${WHATSAPP_BASE_URL}/api/v1/messages/send-template`, 10s timeout, provider error-code classification (config vs. rate vs. transient), plus a verbose failure log (`logarFalhaEnvio`)
- `channelRegistry.ts` — `Map<CanalNotificacao, ChannelSender>`; adding a channel is one file plus one map entry, never a call-site change

**`schedule/`** — `outboxNotificacaoCron.ts`. `node-cron` tick source, registered from `app.ts` *after* the DataSource initializes. Two gates: `NODE_ENV=test` never registers; `OUTBOX_VISITA_ENABLED` must be exactly `"1"`. Re-entrancy guarded by a closure flag so a slow batch cannot stack ticks.

**Visit-notification services:**
- `service/notificacaoVisitaService.ts` (537 lines) — `agendarVisita` (enqueue), `despacharNotificacao` (send-time work), `notificarVisita`
- `service/outboxNotificacaoService.ts` (345 lines) — `claimBatch` (`FOR UPDATE SKIP LOCKED`), `tick`, backoff ladder, the four mark helpers
- `service/envioGuards.ts` — anti-spam and address-freshness guards, evaluated at send time
- `service/visitaConfirmacaoService.ts` (409 lines) — token exchange, confirmation, address update

**Visit-notification support:** `utils/agendamento.ts` (send-window scheduling), `utils/visitaToken.ts` (link token + scoped JWT), `utils/statusNotificacaoVisita.ts`, `utils/telefone.ts` (BR phone normalization + DDD allowlist), `utils/haversine.ts` (extracted from `routeOptimizer`), `entities/NotificacaoVisita.ts`, `entities/Community.ts`, `middlewares/visitaAuthMiddleware.ts`, `routes/VisitaRoute.ts` + `controllers/visitaController.ts` + `schemas/visita.ts`.

**Scripts:** `outboxConsole.ts` (manual `status` / `tick` / `agendar`, wired to npm scripts), `whatsappMockServer.ts` (local provider stand-in), `mint-visita-link.ts` and `db-query.ts` (both untracked at time of writing), `migration-notificacao-visita.sql`, `migration-outbox-notificacao-visita.sql`, `migration-empresa-slug-campanha.sql`.

## Module Organization

### HTTP layer
**Location:** `routes/`, `controllers/`, `middlewares/`
**Key files:** `utils/routeDocumentation.ts` (`createDocumentedRoute`, the single registration primitive), `middlewares/validation.ts` (Zod → 400 envelope), `api.ts` (mount table)

### Business layer
**Location:** `service/`
**Key files:** `campanhaService.ts`, `rotaService.ts` (route lifecycle, optimization, reordering, CEP geolocation — also the enqueue trigger point), `notificacaoVisitaService.ts` (largest new file), `outboxNotificacaoService.ts`, `oficinaService.ts`, `promotorService.ts`, `usuarioService.ts` (auth support only)

### Dispatch layer *(new)*
**Location:** `channels/`, `schedule/`
**Purpose:** Move work out of the request cycle and out to a provider. This is the first code in the repo that runs on a clock rather than on a request.

### Data layer
**Location:** `entities/`, `data-source.ts`
**Key files:** `RotaPromotor.ts` (the visit record), `CampanhaPromotor.ts` (N:N join carrying ordering strategy), `NotificacaoVisita.ts` (notification + outbox row in one table), `Community.ts` (`OFICINA_PORTAL.COMMUNITIES`, resolves the company name by `EMPRESA_SLUG`), `CadastroEmpresa.ts` (`dw`)

### Contract layer
**Location:** `schemas/`, `config/openapi.ts`
**Key files:** `schemas/common.ts` (shared error/success envelopes), `schemas/visita.ts`, `config/openapi.ts`

`schemas/versao.ts` still has no entity, service, controller, or route — orphaned.

## Where Things Live

**Campaigns (`/campanha`, `/campanha-perguntas`, `/campanha-results`):** `routes/Campanha*Route.ts` · `service/campanha*Service.ts` · `entities/Campanha*.ts` · `schemas/campanha*.ts` · `docs/ENTIDADES_CAMPANHAS.md`

**Promoters (`/promotor`):** `routes/PromotorRoute.ts` (9 routes) · `service/promotorService.ts` · `utils/encryption.ts` · `entities/Promotor.ts` · `docs/LOGIN_PROMOTOR.md`

**Routes / visits (`/rota`):** `routes/RotaRoute.ts` (10 routes) · `service/rotaService.ts` · `utils/routeOptimizer.ts` + `utils/haversine.ts` · `entities/RotaPromotor.ts` · `docs/SPEC_ORDENACAO_ROTAS.md`, `docs/DESIGN_ORDENACAO_ROTAS.md`

**Workshops (`/oficina`):** `routes/OficinaRoute.ts` (2 routes) · `service/oficinaService.ts` · `utils/duckdbClient.ts` · `entities/Oficina.ts` + `CadastroEmpresa.ts`

**Visit confirmation (`/visita`)** — *the only authenticated surface:*
- Endpoints: `GET /visita/:token` (exchange, `limitadorExchange`), `POST /visita/confirmar`, `PUT /visita/endereco` (both `visitaAuthMiddleware` + `limitadorAcao`)
- Logic: `service/visitaConfirmacaoService.ts`
- Auth: `middlewares/visitaAuthMiddleware.ts`, `utils/visitaToken.ts` (`VISITA_SCOPE = "visita:confirmar"`, signed with `VISITA_TOKEN_SECRET`)
- Spec: `.specs/features/notificacao-visita-confirmacao/`

**Notification dispatch (no HTTP surface):**
- Enqueue: `NotificacaoVisitaService.agendarVisita`, scheduled by `utils/agendamento.ts::proximoHorarioEnvio`
- Drain: `schedule/outboxNotificacaoCron.ts` → `OutboxNotificacaoService.tick` → `claimBatch` → `despacharNotificacao` → `channels/`
- Manual drive: `npm run outbox:status | outbox:tick | outbox:agendar`
- Data: `entities/NotificacaoVisita.ts` (`CAMPANHAS_OB.NOTIFICACAO_VISITA`)
- Spec: `.specs/features/agendamento-notificacao-visita/`; rationale in `.specs/project/STATE.md` (2026-08-13 entries)

**Authentication (general API):** `middlewares/authMiddleware.ts` — **still defined and never imported.** See CONCERNS.md.

## Special Directories

**`duckdb/`** — `oficinas_data.json` is the runtime lookup table read by `utils/duckdbClient.ts`; `oficinas_mock 1.duckdb` is the source it is exported from (note the space in the filename). Regeneration: `scripts/exportDuckDBToJSON.md`.

**`scripts/`** — hand-run SQL and utilities, not an automated migration system. All `.sql` files are applied manually. The SQL files follow house rules established on 2026-08-13: idempotent (`IF NOT EXISTS`), a `ROLLBACK:` header comment, and no blank line or semicolon-bearing comment inside a statement (the SQL client used here truncates the script at those points).

`scripts/migrate-data.ts` — named as the next action in `.specs/project/STATE.md` — **still does not exist.**

**`docs/`** — narrative documentation predating `.specs/`. Partly stale; nothing in it describes the visit-notification flow, which is specced in `.specs/features/` instead.

**`templates/`, `assets/`** — EJS templates, fonts, images and PDFs with no code path referencing them. Inherited from the forked source project.

**`.specs/`** — `project/STATE.md` is the decision log (17 entries; the four 2026-08-13 ones carry the outbox architecture rationale). `features/` now holds 8 specs: `database-migration`, `notificacao-visita-confirmacao`, `agendamento-notificacao-visita`, `auto-assign-rotas`, `reassign-rota-oficina-update`, `assign-oficina-community-signup`, `unit-tests-overhaul`, plus this `codebase/` mapping.
