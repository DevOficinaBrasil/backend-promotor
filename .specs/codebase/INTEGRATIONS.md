# External Integrations

**Analyzed:** 2026-08-04

This service has a deliberately small integration surface: two PostgreSQL databases and one local data file. Many SDKs and credentials are present in the repository without any corresponding code path — those are listed at the end so they are not mistaken for live integrations.

## Databases

### Primary — PostgreSQL (PRD)

**Purpose:** System of record. All writes, and the authoritative copy of `CAMPANHAS_OB`.
**Implementation:** `AppDataSourceSync` in `data-source.ts`; initialized in `app.ts:44`
**Configuration:** `DB_TYPE`, `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`
**Host:** AWS RDS, `us-east-1`, database `OFICINA_BRASIL`
**Authentication:** username/password. `extra.trustServerCertificate: true` is set — TLS certificate validation is disabled, despite the `Dockerfile` downloading the RDS CA bundle to `/APP/global-bundle.pem` (which nothing then references).
**Entities:** auto-discovered via the `entities/*.{ts,js}` glob
**Schemas accessed:**
- `CAMPANHAS_OB` — owned; campaigns, promoters, routes, questions, results
- `MAIN_REGISTER` — read-only; `OFICINA` master records
- `dw` — read-only; `cadastro_empresa` (workshop registry with geocoordinates), `temp_cnpj_sqlserver` (CNPJ allowlist filter)

### Legacy — PostgreSQL (DEV), read-only

**Purpose:** Serve reads for `CAMPANHAS_OB` rows not yet migrated to PRD. Transitional; retires when the migration completes.
**Implementation:** `LegacyDataSource` in `data-source.ts`; initialized conditionally in `app.ts:49-58`
**Configuration:** `LEGACY_DB_ENABLED` (must be exactly `"true"`), plus `LEGACY_DB_HOST`/`_PORT`/`_USERNAME`/`_PASSWORD`/`_DATABASE`, each falling back to its `DB_*` counterpart when unset
**Host:** AWS RDS, `sa-east-1` (cross-region from primary — this is why merging happens in application memory rather than via a database link)
**Enforcement of read-only:** by convention in `utils/migrationRepository.ts`, not by database grants. `synchronize: false` and `migrationsRun: false` are set, but nothing prevents a direct `LegacyDataSource.getRepository().save()` call.
**Failure behaviour:** initialization failure is caught and logged; the app continues without merge. Per-query failures are caught in `MigrationAwareRepository` and degrade to new-DB-only results with a `console.warn`.

**Access pattern:** never queried directly by services. All access goes through `utils/migrationRepository.ts` — `MigrationAwareRepository` for entity operations, `queryBothAndMerge()` / `findOneFromBoth()` for raw SQL. Full behaviour in ARCHITECTURE.md; migration rationale in `.specs/features/database-migration/` and `.specs/project/STATE.md`.

## Local Data Files

### Workshop enrichment data

**Purpose:** Supplies `flag_engajamento`, `flag_sentimento`, `flag_treinamento`, and `cor_icone` for workshops.
**Implementation:** `utils/duckdbClient.ts` — reads `duckdb/oficinas_data.json` with the Node `fs` module, caches it in a `Map` keyed by workshop ID, O(1) lookup, `reloadData()` to refresh without restart.
**Configuration:** none — the path is hardcoded.
**History:** originally used the `@duckdb/node-api` npm package, which was flagged as malware by the GitHub Security Advisory Database. The package was removed and replaced with this dependency-free JSON reader. See `docs/SECURITY_SUMMARY.md`.
**Regenerating:** export from `duckdb/oficinas_mock 1.duckdb` using Python or the DuckDB CLI per `scripts/exportDuckDBToJSON.md`.

**Current state:** `campanhaService.ts` calls `DuckDBClient.getOficinaDataByIds()`. `oficinaService.ts` imports it at line 3 but never calls it, hardcoding `'neutro'`/`'cinza'` instead (`service/oficinaService.ts:69-78`), so `GET /oficina/nearby` returns constant flags. See CONCERNS.md.

## Outbound HTTP

**None.** No HTTP client is used anywhere in application code. `axios`, `undici`, and `node-fetch` are all installed but unimported.

`RotaService.getGeolocationDataByCep()` (exposed as `POST /rota/geolocation`) resolves CEP → coordinates from the database, not from an external geocoding API.

## Webhooks

None. No inbound webhook handlers exist.

## Background Jobs

**None running.** `node-cron` and `node-schedule` are installed but unimported. There is no scheduler, queue, or worker process. Everything executes inside the request/response cycle, including route optimization (`utils/routeOptimizer.ts` runs Nearest-Neighbour + 2-opt synchronously during `POST /rota/optimize`).

## Deployment Platform

**AWS ECS on EC2 (bridge network mode)**
**Configuration:** `task_definition.tpl.json` (template), `Dockerfile`, and the `ECS Config` block of `exemple.env`
**Image registry:** ECR — `533267433871.dkr.ecr.us-east-1.amazonaws.com/backend-hijack`
**Cluster/service:** `oficina-ecs-prd` / `backend-hijack-service`, 512 CPU units / 1024 MB
**Logs:** CloudWatch, log group `/ecs/td-backend-hijack`, stream prefix `ecs`
**Public endpoint:** `https://apipromotores.oficinabrasil.com.br` (hardcoded as the non-development server URL in `config/openapi.ts:59`)

There is no CI/CD pipeline in this repository — `.github/` contains only agent skill definitions, no workflows. Build and deploy are performed manually or from an external system.

**Port inconsistency:** `app.ts` defaults to `8185`, the `Dockerfile` exposes `3008`, `exemple.env` sets `PORT=3008`, `.env.example` sets `PORT=3333`, and `docs/DOCUMENTACAO_API.md` documents `3333`. Only the `PORT` environment variable actually decides.

## Declared but not integrated

The following have credentials, SDKs, or configuration present in the repository but **no code path**. Treat them as inherited residue from the forked source project, not as integrations:

| Declared | Evidence | Reality |
|---|---|---|
| AWS S3 | `@aws-sdk/client-s3`, `aws-sdk`, `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_BUCKET_NAME` in `exemple.env` | never imported; no upload/download path |
| OpenAI | `openai` dependency | never imported |
| MongoDB | `mongodb` dependency, `importToMongoDev` npm script | never imported; the script file does not exist |
| SQL Server / MySQL | `mssql`, `mysql2` | never imported |
| Email | `ejs`, `templates/*.ejs`, `sendEmailSolicitacoes` npm script | no mail transport installed at all; the script file does not exist |
| File uploads | `multer` | never imported |
| PDF / image / spreadsheet processing | `pdf-lib`, `pdf-parse`, `sharp`, `fontkit`, `xlsx`, plus `imagemagick`/`ghostscript` installed in the `Dockerfile` | never imported |
| Browser automation | `playwright`, five `bots/*` npm scripts | never imported; the `bots/` directory does not exist |

The live AWS credentials in `exemple.env` grant real access regardless of whether this service uses them — see CONCERNS.md → Security Considerations.
