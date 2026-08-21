# External Integrations

**Analyzed:** 2026-08-14 (supersedes 2026-08-04)

The 2026-08-04 mapping recorded "no outbound HTTP, no background jobs". Both statements are now false: this service calls a WhatsApp provider and runs a cron-driven outbox worker in-process. Everything else about the integration surface is unchanged.

## Databases

### Primary — PostgreSQL (PRD)

**Purpose:** System of record. All writes, and the authoritative copy of `CAMPANHAS_OB`.
**Implementation:** `AppDataSourceSync` in `data-source.ts`; initialized in `app.ts`
**Configuration:** `DB_TYPE`, `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`
**Host:** AWS RDS, `us-east-1`, database `OFICINA_BRASIL`
**Authentication:** username/password. `extra.trustServerCertificate: true` is set — TLS certificate validation is disabled, despite the `Dockerfile` downloading the RDS CA bundle to `/APP/global-bundle.pem` (which nothing references). Note `trustServerCertificate` is an mssql option and does nothing for the `pg` driver anyway.
**Entities:** auto-discovered via the `entities/*.{ts,js}` glob
**Schemas accessed:**
- `CAMPANHAS_OB` — owned; campaigns, promoters, routes, questions, results, **`NOTIFICACAO_VISITA`**
- `MAIN_REGISTER` — read-only; `OFICINA` master records, `USUARIO` (notification recipients)
- `dw` — read-only; `cadastro_empresa` (workshop registry with geocoordinates), `temp_cnpj_sqlserver` (CNPJ allowlist filter)
- `OFICINA_PORTAL` — read-only; `COMMUNITIES` (47 rows), resolves the company name from `CAMPANHA.EMPRESA_SLUG`. Added 2026-08-12. The lowercase `oficinaportal.communities` copy (9 rows) exists on the same instance and is **stale — do not use it**; it lacks `authomix`, the slug of the only active campaign.

### Banco legado — removido (2026-08-14)

O segundo DataSource (`LegacyDataSource`, read-only, ativado por `LEGACY_DB_ENABLED`) e o wrapper
`utils/migrationRepository.ts` foram removidos. Só existe `AppDataSourceSync`; não há mais merge de
leituras entre bancos nem variáveis `LEGACY_DB_*`. Contexto em `.specs/features/database-migration/`.


### WhatsApp message provider *(new since 2026-08-04)*

**Purpose:** Deliver the visit-confirmation message.
**Implementation:** `channels/whatsappChannel.ts` — `axios.post` to `${WHATSAPP_BASE_URL}/api/v1/messages/send-template`, 10s timeout, `Authorization` header from `WHATSAPP_API_KEY`.
**Template:** `atualizacao_dados_visita_oficina`, language `pt_BR`, three ordered variables — user name, company name, confirmation link. **The order is the contract**; changing it silently corrupts every message.
**Configuration:** `WHATSAPP_BASE_URL`, `WHATSAPP_API_KEY`, `WHATSAPP_ACCOUNT_ID`, `WHATSAPP_TEMPLATE_NAME_VISITA`, `WHATSAPP_SEND_ENABLED` (must be exactly `"true"`), `WHATSAPP_TEST_PHONE_OVERRIDE`

**Send gates, in order:**
1. `NODE_ENV === "test"` → never sends, unconditionally. No suite can reach a real recipient.
2. `NODE_ENV === "development"` blocks the send **unless** the base URL points at the local mock or `WHATSAPP_TEST_PHONE_OVERRIDE` is set.
3. `WHATSAPP_SEND_ENABLED !== "true"` → records `channel not configured`.

`WHATSAPP_TEST_PHONE_OVERRIDE` redirects every message to one number so the flow can be exercised against the real provider without messaging a user. **In production it would swallow every legitimate notification** — leave it empty there.

**Error classification** (the adapter's job, not the queue's):
| Provider code | Bucket | Queue behaviour |
|---|---|---|
| `TOKEN_MISSING`, `TOKEN_INVALID`, `TOKEN_EXPIRED`, `ACCOUNT_DENIED`, `SCOPE_DENIED`, `ACCOUNT_NOT_FOUND`, `TEMPLATE_NOT_FOUND` | configuration | terminal — no recipient would ever succeed |
| `RATE_LIMITED`, `QUOTA_EXCEEDED` | rate/quota | transient — retried with backoff |
| network error / 5xx / unknown | transient | retried with backoff |

The provider's error envelope is not pinned down, so three plausible shapes are accepted (`error` as string, `error.code`, top-level `code`); anything else yields `null` and maps to a generic failure. `logarFalhaEnvio` writes a full diagnostic block on failure (URL, HTTP status, network code, duration, destination, template, provider code, response body truncated at 2,000 chars) — never the API key. Without it a 4xx becomes an unexplainable `FALHOU` row.

**Local development:** `npm run whatsapp:mock` starts `scripts/whatsappMockServer.ts`; point `WHATSAPP_BASE_URL` at it.

`RotaService.getGeolocationDataByCep()` (`POST /rota/geolocation`) still resolves CEP → coordinates from the database, not from an external geocoding API.

## Local Data Files

### Workshop enrichment data

**Purpose:** Supplies `flag_engajamento`, `flag_sentimento`, `flag_treinamento`, `cor_icone`.
**Implementation:** `utils/duckdbClient.ts` reads `duckdb/oficinas_data.json` with Node `fs`, caches it in a `Map` keyed by workshop ID, `reloadData()` to refresh without restart.
**History:** originally the `@duckdb/node-api` package, flagged as malware by the GitHub Security Advisory Database; replaced with this dependency-free JSON reader. See `docs/SECURITY_SUMMARY.md`.
**Current state:** `campanhaService.ts` calls `getOficinaDataByIds()`. `oficinaService.ts` imports it and never calls it, hardcoding `'neutro'`/`'cinza'` — unchanged since the last mapping. See CONCERNS.md.

## Webhooks

None inbound. The WhatsApp provider's delivery receipts, if any, are not consumed — `PROVIDER_MESSAGE_ID` is stored but nothing reads it back.

## Background Jobs

### Visit-notification outbox worker *(new since 2026-08-04)*

**Purpose:** Drain `CAMPANHAS_OB.NOTIFICACAO_VISITA` and send what is due.
**Implementation:** `schedule/outboxNotificacaoCron.ts` (`node-cron`) → `OutboxNotificacaoService.tick()`. Registered from `app.ts` **after** the DataSource initializes, in the same process that serves HTTP.
**Configuration:**
| Variable | Default | Notes |
|---|---|---|
| `OUTBOX_VISITA_ENABLED` | — | Must be exactly `"1"`. `"true"` leaves the worker dead; the startup log prints the value read, precisely because that mistake is invisible otherwise. |
| `OUTBOX_VISITA_CRON_EXPRESSION` | `*/1 * * * *` | |
| `OUTBOX_VISITA_BATCH_SIZE` | `20` | Rows per tick **per server copy**. Provider ceiling = batch × copies per tick. |
| `OUTBOX_VISITA_LOCK_LEASE_MINUTES` | `5` | Must stay well above the channel's 10s timeout. |
| `OUTBOX_VISITA_MAX_ATTEMPTS` | `3` | Attempts before a transient failure becomes terminal `FALHOU`. |
| `NOTIFICACAO_HORA_ENVIO` | `9` | Send-window start, `America/Sao_Paulo`. |
| `NOTIFICACAO_HORA_ENVIO_FIM` | empty | Window end. Empty or ≤ start → everything fires on the hour. Set, the batch spreads: route *i* of *n* at `inicio + (fim-inicio)*i/n`. |
| `OUTBOX_VISITA_ENVIO_IMEDIATO` | `0` | **Local only.** `"1"` makes every notification due immediately, restoring send-at-import — exactly what the outbox removed. |

The `OUTBOX_VISITA_*` prefix is deliberate: `.env` files are copied between machines here, and unprefixed names (as used by `backend-communities`) would let one copied file switch on both this worker and the other service's EventBridge publisher.

**Safety properties:** `NODE_ENV=test` never registers the cron. Concurrency is safe by `FOR UPDATE SKIP LOCKED`, so every extra server copy is simply another worker. `tick()` never throws. A closure flag prevents overlapping ticks.

**Manual operation:** `npm run outbox:status` (queue counts + the would-be recipient), `npm run outbox:tick` (one cycle by hand), `npm run outbox:agendar`.

Route optimization still runs synchronously inside `POST /rota/optimize` — that work was not moved off the request path.

## Deployment Platform

**AWS ECS on EC2 (bridge network mode)**
**Configuration:** `task_definition.tpl.json`, `Dockerfile`, ECS block of the env files
**Image registry:** ECR — `533267433871.dkr.ecr.us-east-1.amazonaws.com/backend-hijack`
**Cluster/service:** `oficina-ecs-prd` / `backend-hijack-service`, 512 CPU units / 1024 MB
**Logs:** CloudWatch, log group `/ecs/td-backend-hijack`, stream prefix `ecs`
**Public endpoint:** `https://apipromotores.oficinabrasil.com.br`

No CI/CD pipeline in this repository — `.github/` contains only agent skill definitions. Build and deploy are manual or external.

**Deployment note for the outbox:** every task copy that boots with `OUTBOX_VISITA_ENABLED=1` becomes another worker. That is safe by design, but it multiplies the provider call ceiling (`OUTBOX_VISITA_BATCH_SIZE` × task count per tick). Account for the desired-count when sizing the batch.

**Port inconsistency (unchanged):** `app.ts` defaults to `8185`, the `Dockerfile` exposes `3008`, `.env.example` sets `PORT=3333`, `docs/DOCUMENTACAO_API.md` documents `3333`. Only the `PORT` environment variable decides.

## Declared but not integrated

Credentials, SDKs, or configuration present with **no code path**. Inherited residue from the forked source project:

| Declared | Evidence | Reality |
|---|---|---|
| AWS S3 | `@aws-sdk/client-s3`, `aws-sdk`, `AWS_*` env vars | never imported |
| OpenAI | `openai` dependency | never imported |
| MongoDB | `mongodb` dependency | never imported |
| SQL Server / MySQL | `mssql`, `mysql2` | never imported |
| Email | `ejs`, `templates/*.ejs` | no mail transport installed at all |
| File uploads | `multer` | never imported |
| PDF / image / spreadsheet | `pdf-lib`, `pdf-parse`, `sharp`, `fontkit`, `xlsx`, plus `imagemagick`/`ghostscript` in the `Dockerfile` | never imported |
| Browser automation | `playwright` | never imported |

The live AWS credentials in `exemple.env` grant real access regardless of whether this service uses them — see CONCERNS.md → Security Considerations.
