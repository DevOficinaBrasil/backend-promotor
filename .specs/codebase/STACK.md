# Tech Stack

**Analyzed:** 2026-08-14 (supersedes 2026-08-04)
**Source:** `package.json`, `tsconfig.json`, `Dockerfile`, `jest.config.ts`, `data-source.ts`

## Core

- Framework: Express `^5.1.0`
- Language: TypeScript `^5.9.2` (target ES2020, module commonjs, `strict: true` with `strictPropertyInitialization: false`)
- Runtime: Node.js 20 (`node:20-alpine` in `Dockerfile`)
- Package manager: npm (`package-lock.json` present)
- Execution: `ts-node` directly — there is **no build step**. `npm start` → `npx ts-node app.ts`; `npm run dev` → `nodemon app.ts`. Production container runs `npm run start`, i.e. TypeScript is transpiled at runtime.

## Backend

- API style: REST, JSON over HTTP. Seven routers mounted per domain in `api.ts`.
- Database: PostgreSQL via TypeORM `^0.3.26` + `pg` `^8.16.3`
  - Entities auto-loaded by glob: `entities/*.{ts,js}` (`data-source.ts`)
  - **Two DataSources** during migration: `AppDataSourceSync` (PRD, read-write) and `LegacyDataSource` (legacy, read-only, feature-flagged by `LEGACY_DB_ENABLED="true"`)
  - No TypeORM migrations configured; no `synchronize`. Schema changes are hand-written SQL in `scripts/*.sql`, applied manually.
- Schemas touched: `CAMPANHAS_OB` (owned), `MAIN_REGISTER` (read), `dw` (read), `OFICINA_PORTAL` (read — added 2026-08-12 for `COMMUNITIES`)
- Validation: Zod `^3.23.8` via `middlewares/validation.ts`
- API docs: `@asteasolutions/zod-to-openapi` `^7.1.1` generates OpenAPI 3.0 from the same Zod schemas; served at `/openapi.json`, rendered at `/docs` by Scalar loaded from jsDelivr inline in `app.ts` (**not** via the `@scalar/express-api-reference` devDependency)
- Authentication: `jsonwebtoken` `^9.0.2` (HS256). Two separate token systems now exist:
  - `middlewares/authMiddleware.ts` — general API auth, **never mounted**
  - `utils/visitaToken.ts` + `middlewares/visitaAuthMiddleware.ts` — scoped confirmation token (`visita:confirmar`), signed with `VISITA_TOKEN_SECRET`, **mounted on 2 of 3 `/visita` routes**
  Password storage still uses reversible AES-256-CBC via `utils/encryption.ts`, not hashing. See CONCERNS.md.
- Rate limiting: `express-rate-limit` `^8.6.2` — used **only** on `/visita` (60s window, 20 requests per visit)
- Scheduling: `node-cron` `^4.2.1` in `schedule/outboxNotificacaoCron.ts`. `node-schedule` remains installed and unused.
- Time zones: `date-fns-tz` `^3.2.0` in `utils/agendamento.ts` (`America/Sao_Paulo`). Plain `date-fns` is installed and unused.
- Outbound HTTP: `axios` `^1.11.0` in `channels/whatsappChannel.ts`, 10s timeout. `undici` and `node-fetch` remain installed and unused.
- CORS: `cors` `^2.8.5`, applied with no options — fully open.

## Testing

- Unit + integration: Jest with `ts-jest` `^29.4.1`, `testEnvironment: node`
  - `package.json` and `package-lock.json` both pin `jest@29.7.0`; the local `node_modules` currently resolves `30.1.3`, so the working tree is out of sync with the lockfile. Reinstall before trusting a local-only test result.
- HTTP-level tests: `supertest` `^7.1.4` — **now actually used** (visit-flow integration suites), unlike at the last mapping
- Coverage: Jest built-in. `coveragePathIgnorePatterns` is now `["entities", "data-source.ts"]` — the blanket `utils` exclusion was removed, so `migrationRepository`, `encryption`, `routeOptimizer`, `agendamento` and `visitaToken` are visible in coverage reports again.
- `transform` sets `diagnostics.ignoreDiagnostics: [5103]`

## External Services

- Database: AWS RDS PostgreSQL (two instances — `us-east-1` PRD, `sa-east-1` legacy)
- **WhatsApp provider** (new): `POST ${WHATSAPP_BASE_URL}/api/v1/messages/send-template`, template `atualizacao_dados_visita_oficina`, language `pt_BR`. Local stand-in: `scripts/whatsappMockServer.ts`.
- Container registry / orchestration: AWS ECR + ECS (`task_definition.tpl.json`)
- TLS: RDS global CA bundle downloaded at image build time (`Dockerfile`), still referenced by nothing
- Local data file: `duckdb/oficinas_data.json` read from disk by `utils/duckdbClient.ts`

No S3, email, or queue integration exists despite credentials and SDKs being present. See CONCERNS.md → Dependencies at Risk.

## Development Tools

- Dev server: `nodemon` `^3.1.10`
- Manual operations console: `npm run outbox:status | outbox:tick | outbox:agendar` (`scripts/outboxConsole.ts`); `npm run whatsapp:mock`
- Type shims: `@types/*`; custom shim in `@types/express`
- Debugging: `.vscode/launch.json`
- Agent tooling: skill definitions duplicated across `.claude/`, `.agents/`, `.cline/`, `.github/skills/`, `.opencode/`

## Declared-but-unused dependencies

Newly **in use** since the 2026-08-04 mapping: `axios`, `node-cron`, `date-fns-tz`, `express-rate-limit`, `supertest`.

Still imported nowhere in application code: `playwright`, `openai`, `mongodb`, `mssql`, `mysql2`, `multer`, `aws-sdk`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `ejs`, `pdf-lib`, `pdf-parse`, `xlsx`, `node-schedule`, `sharp`, `fontkit`, `string-similarity`, `stream-json`, `undici`, `node-fetch`, `uuid`, `date-fns`, `fs-extra`, `bcrypt`, `@scalar/express-api-reference`.

Residue from a forked project (`package.json` name is still `backend-hijack`). Keep `bcrypt` — it is the intended fix for the password-hashing concern. The dead npm script entries that pointed at a nonexistent `bots/` directory were removed in `9df64f4`.
