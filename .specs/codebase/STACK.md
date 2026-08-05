# Tech Stack

**Analyzed:** 2026-08-04
**Source:** `package.json`, `tsconfig.json`, `Dockerfile`, `jest.config.ts`, `data-source.ts`

## Core

- Framework: Express `^5.1.0`
- Language: TypeScript `^5.9.2` (target ES2020, module commonjs, `strict: true` with `strictPropertyInitialization: false`)
- Runtime: Node.js 20 (`node:20-alpine` in `Dockerfile`)
- Package manager: npm (`package-lock.json` present)
- Execution: `ts-node` directly — there is **no build step**. `npm start` → `npx ts-node app.ts`; `npm run dev` → `nodemon app.ts`. Production container runs `npm run start`, i.e. TypeScript is transpiled at runtime.

## Backend

- API style: REST, JSON over HTTP. Routers mounted per domain in `api.ts`.
- Database: PostgreSQL via TypeORM `^0.3.26` + `pg` `^8.16.3`
  - Entities auto-loaded by glob: `entities/*.{ts,js}` (`data-source.ts`)
  - **Two DataSources** during migration: `AppDataSourceSync` (PRD, read-write) and `LegacyDataSource` (legacy, read-only, feature-flagged by `LEGACY_DB_ENABLED`)
  - No TypeORM migrations configured; no `synchronize`. Schema changes are applied via hand-written SQL in `scripts/*.sql`.
- Schemas touched: `CAMPANHAS_OB` (owned), `MAIN_REGISTER` (read), `dw` (read)
- Validation: Zod `^3.23.8` via `middlewares/validation.ts`
- API docs: `@asteasolutions/zod-to-openapi` `^7.1.1` generates OpenAPI 3.0 from the same Zod schemas; served at `/openapi.json` and rendered at `/docs` by Scalar (loaded from jsDelivr CDN inline in `app.ts`, **not** via the `@scalar/express-api-reference` devDependency)
- Authentication: `jsonwebtoken` `^9.0.2` (HS256) in `middlewares/authMiddleware.ts`. Password storage uses reversible AES-256-CBC via `utils/encryption.ts` (Node built-in `crypto`), **not** hashing. See CONCERNS.md.
- CORS: `cors` `^2.8.5`, applied with no options — fully open.

## Testing

- Unit + integration: Jest `^30.0.5` with `ts-jest` `^29.4.1`, `testEnvironment: node`
- E2E: none present (`supertest` `^7.1.4` is installed but unused)
- Coverage: Jest built-in; `entities`, `data-source.ts` and `utils` are excluded via `coveragePathIgnorePatterns`

## External Services

- Database: AWS RDS PostgreSQL (two instances — `us-east-1` PRD, `sa-east-1` legacy)
- Container registry / orchestration: AWS ECR + ECS (`task_definition.tpl.json`, `exemple.env`)
- TLS: RDS global CA bundle downloaded at image build time (`Dockerfile`)
- Local data file: `duckdb/oficinas_data.json` read from disk by `utils/duckdbClient.ts`

No S3, email, queue, or third-party API calls are wired into the running code, despite credentials and SDKs being present. See CONCERNS.md → Dependencies at Risk.

## Development Tools

- Dev server: `nodemon` `^3.1.10`
- Type shims: `@types/*` for express, jest, node, pg, jsonwebtoken, multer, etc.; custom shim in `@types/express`
- Debugging: `.vscode/launch.json`
- Agent tooling: skill definitions duplicated across `.claude/`, `.agents/`, `.cline/`, `.github/skills/`, `.opencode/`

## Declared-but-unused dependencies

The following are in `package.json` but imported nowhere in application code: `playwright`, `openai`, `mongodb`, `mssql`, `mysql2`, `multer`, `aws-sdk`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `ejs`, `pdf-lib`, `pdf-parse`, `xlsx`, `node-cron`, `node-schedule`, `sharp`, `fontkit`, `string-similarity`, `stream-json`, `undici`, `uuid`, `date-fns`, `date-fns-tz`, `fs-extra`, `axios`, `bcrypt`, `supertest`, `@scalar/express-api-reference`.

This is residue from a template or a forked project (`package.json` name is `backend-hijack`). It inflates install time, image size, and vulnerability surface.
