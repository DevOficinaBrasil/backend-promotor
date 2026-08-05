# Project Structure

**Analyzed:** 2026-08-04
**Root:** `/Users/augustodearrudakono/Documents/backend-promotor`
**Size:** ~9,300 lines of TypeScript across 43 source files

## Directory Tree

```
backend-promotor/
├── app.ts                      # entrypoint: express app, cors, /docs, /openapi.json, /ping, listen
├── api.ts                      # mounts the 6 domain routers
├── data-source.ts              # AppDataSourceSync (PRD) + LegacyDataSource (legacy, read-only)
├── package.json                # name: "backend-hijack"
├── tsconfig.json
├── jest.config.ts
├── Dockerfile                  # node:20-alpine, EXPOSE 3008, runs ts-node
├── task_definition.tpl.json    # ECS task definition template
├── exemple.env                 # ⚠ tracked in git, contains live-looking secrets
├── .env.example                # placeholder values (the safe one)
├── api_docs.json               # generated OpenAPI snapshot
│
├── routes/                     # 6 files — endpoint declaration + OpenAPI metadata
├── controllers/                # 6 files — HTTP concerns only
├── service/                    # 7 files — business logic + persistence
├── entities/                   # 10 files — TypeORM models
├── schemas/                    # 8 files — Zod, doubles as validation + OpenAPI
├── middlewares/                # authMiddleware.ts (unused), validation.ts
├── utils/                      # 5 files — cross-cutting helpers
├── config/                     # openapi.ts — OpenAPI registry singleton
├── types/ · @types/            # ModeloType.ts; express request augmentation
│
├── __tests__/                  # unit/ (5) + integration/ (1)
├── __mocks__/                  # data-source.ts
│
├── docs/                       # 10 hand-written markdown docs
├── scripts/                    # 2 .sql migrations, 1 .ts validator, 1 .md guide
├── duckdb/                     # oficinas_data.json + source .duckdb file
├── templates/                  # 2 .ejs email templates (unreferenced)
├── assets/                     # fonts/, img/, pdf/ (unreferenced)
│
└── .specs/                     # spec-driven workflow state
    ├── project/STATE.md
    ├── features/database-migration/{spec,design,tasks}.md
    └── codebase/               # ← these documents
```

Agent skill definitions are duplicated across `.claude/`, `.agents/`, `.cline/`, `.opencode/`, and `.github/skills/`. They are tooling config, not application code.

## Module Organization

### HTTP layer

**Purpose:** Declare endpoints, validate input, shape responses.
**Location:** `routes/`, `controllers/`, `middlewares/`
**Key files:** `utils/routeDocumentation.ts` (`createDocumentedRoute`, the single registration primitive), `middlewares/validation.ts` (Zod → 400 envelope), `api.ts` (mount table)

### Business layer

**Purpose:** Domain rules, persistence orchestration.
**Location:** `service/`
**Key files:** `campanhaService.ts` (largest — campaign CRUD plus promoter/workshop linking), `rotaService.ts` (route lifecycle, optimization, reordering, CEP geolocation), `oficinaService.ts` (nearest-workshop search), `promotorService.ts` (CRUD, login, campaign linking), `usuarioService.ts` (auth support only — no route)

### Data layer

**Purpose:** Schema mapping and connection management.
**Location:** `entities/`, `data-source.ts`, `utils/migrationRepository.ts`
**Key files:** `RotaPromotor.ts` (central entity — the visit record), `CampanhaPromotor.ts` (N:N join carrying ordering strategy), `CadastroEmpresa.ts` (maps `dw.cadastro_empresa`, added for the migration)

### Contract layer

**Purpose:** One definition serving validation, typing, and documentation.
**Location:** `schemas/`, `config/openapi.ts`
**Key files:** `schemas/common.ts` (`ErrorResponseSchema`, `SuccessResponseSchema` — shared by every route), `config/openapi.ts` (registry singleton, declares `bearerAuth` security scheme)

`schemas/versao.ts` has no corresponding entity, service, controller, or route — orphaned.

## Where Things Live

**Campaigns (`/campanha`, `/campanha-perguntas`, `/campanha-results`):**
- Endpoints: `routes/CampanhaRoute.ts`, `CampanhaPerguntasRoute.ts`, `CampanhaResultsRoute.ts`
- Logic: `service/campanhaService.ts`, `campanhaPerguntasService.ts`, `campanhaResultsService.ts`
- Data: `entities/Campanha.ts`, `CampanhaPerguntas.ts`, `CampanhaPerguntaOpcao.ts`, `CampanhaResults.ts`, `CampanhaPromotor.ts`
- Contracts: `schemas/campanha.ts`, `campanhaPerguntas.ts`, `campanhaResults.ts`
- Reference: `docs/ENTIDADES_CAMPANHAS.md`, `docs/campanha-promotor-linking.md`

**Promoters (`/promotor`):**
- Endpoints: `routes/PromotorRoute.ts` (9 routes — the largest surface)
- Logic: `service/promotorService.ts`; password crypto in `utils/encryption.ts`
- Data: `entities/Promotor.ts`
- Reference: `docs/LOGIN_PROMOTOR.md`

**Routes / visits (`/rota`):**
- Endpoints: `routes/RotaRoute.ts` (8 routes)
- Logic: `service/rotaService.ts`; TSP heuristics in `utils/routeOptimizer.ts`
- Data: `entities/RotaPromotor.ts`
- Reference: `docs/SPEC_ORDENACAO_ROTAS.md`, `docs/DESIGN_ORDENACAO_ROTAS.md`, `docs/ROTA_API_TESTING.md`; schema change in `scripts/migration-ordenacao-rotas.sql`

**Workshops (`/oficina`):**
- Endpoints: `routes/OficinaRoute.ts` (1 route — `GET /nearby`)
- Logic: `service/oficinaService.ts` (raw Haversine SQL); enrichment client in `utils/duckdbClient.ts`
- Data: `entities/Oficina.ts` (`MAIN_REGISTER`), `entities/CadastroEmpresa.ts` (`dw`)
- Reference: `docs/ENTIDADE_OFICINA.md`, `docs/DUCKDB_INTEGRATION.md`, `docs/SECURITY_SUMMARY.md`

**Authentication:**
- Middleware: `middlewares/authMiddleware.ts` — **defined but never imported**
- Login endpoint: `POST /promotor/login` in `routes/PromotorRoute.ts`
- User lookup: `service/usuarioService.ts`, `entities/Usuario.ts`
- Crypto: `utils/encryption.ts` (AES-256-CBC), `jsonwebtoken` in the middleware and login controller

**Configuration:**
- Runtime: environment variables via `dotenv`, loaded in `app.ts` and `data-source.ts`
- Connections: `data-source.ts`
- Deployment: `Dockerfile`, `task_definition.tpl.json`
- Env reference: `.env.example` (safe) and `exemple.env` (unsafe — see CONCERNS.md)

## Special Directories

**`duckdb/`** — `oficinas_data.json` is the runtime lookup table read by `utils/duckdbClient.ts`; `oficinas_mock 1.duckdb` is the source of truth it is exported from (note the space in the filename). Regeneration steps: `scripts/exportDuckDBToJSON.md`.

**`scripts/`** — hand-run SQL and utilities, not an automated migration system. `create_campanha_pergunta_opcoes.sql` and `migration-ordenacao-rotas.sql` must be applied manually. `validateCampanhasEntities.ts` checks entity/schema alignment. Nine `package.json` script entries point at files in `bots/` and `scripts/` that **do not exist**, including `scripts/migrate-data.ts`, which `.specs/project/STATE.md` names as the next action.

**`docs/`** — narrative documentation predating `.specs/`. Partly stale; see CONCERNS.md for specific drift.

**`templates/`, `assets/`** — EJS email templates, fonts, images and PDFs with no code path referencing them. Inherited from the source project this repo was forked from.

**`.specs/`** — spec-driven workflow state. `project/STATE.md` is the decision log; `features/database-migration/` holds the only feature spec written so far.
