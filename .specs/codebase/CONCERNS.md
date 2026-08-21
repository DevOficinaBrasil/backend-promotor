# Codebase Concerns

**Analysis Date:** 2026-08-14 (supersedes 2026-08-04)
**Scope:** Static analysis + a unit-test run. No production traffic, logs, or metrics were available, so performance items carry mechanism and code evidence rather than measured latencies. Integration suites were not run — they write to a live database.

Ordered by risk. Items resolved since the previous audit are marked ✅ and kept for history rather than deleted.

**What changed since 2026-08-04:** the test suite is green again, the dead npm scripts are gone, and the first authenticated routes exist. Against that, a whole delivery subsystem was added — an in-process worker, an outbound provider, and six new environment flags — which brings its own operational concerns, collected in a new section below.

---

## Security Considerations

### Authentication is enforced on 3 of 50 routes

- **Risk:** Every campaign, promoter, route and workshop endpoint is publicly callable. Anyone who can reach the load balancer can read all campaigns, promoters, routes and survey results, and can create, update, and soft-delete any of them.
- **Status:** partially improved. The `/visita` routes added in the notification work **are** protected — `visitaAuthMiddleware` + `limitadorAcao` on `POST /visita/confirmar` and `PUT /visita/endereco`, `limitadorExchange` on the deliberately public `GET /visita/:token`. That is the only authenticated surface.
- **Files:** `middlewares/authMiddleware.ts` (defined, exported, **still never imported anywhere**); `routes/` now has 50 `createDocumentedRoute()` call sites, of which **47 pass `middlewares: []`**.
- **Evidence:** `grep -rn "authMiddleware" --include="*.ts" .` outside tests returns only the definition plus two comments referring to it. `grep -rn "middlewares:" routes/` returns 50 hits; the 3 non-empty ones are all in `routes/VisitaRoute.ts`.
- **Note:** `middlewares/visitaAuthMiddleware.ts` is a working, mounted, tested reference implementation of the same shape. Whoever fixes the general case should read it first — its header comment states outright that `authMiddleware`'s schema does not match what any login in this service issues.
- **Current mitigation:** None in code. The OpenAPI document advertises `security: [{ bearerAuth: [] }]` on every path and `config/openapi.ts:13` registers the `bearerAuth` scheme, so the documentation asserts protection that does not exist. Whatever protection is real today is network-level (VPC/ALB rules) and outside this repository.
- **Recommendations:**
  1. Confirm with infrastructure whether `apipromotores.oficinabrasil.com.br` is publicly reachable. This determines whether the item is critical-now or latent.
  2. Mount `authMiddleware` per router in `api.ts` rather than per route, so future routes are protected by default. Leave `POST /promotor/login` explicitly public.
  3. Resolve the token-shape mismatch first (next item) — mounting the middleware as-is will reject every token the login endpoint issues.
  4. Add a test asserting that an unauthenticated request to a protected route returns 401, so this cannot silently regress.

### Login issues a token the auth middleware cannot accept

- **Risk:** Once authentication is mounted, all promoter logins break. The two halves of the auth flow model different identities.
- **Files:** `middlewares/authMiddleware.ts:17-20` expects `{ user: { ID_USUARIO, NOME, EMAIL, SENHA }, iat }` and resolves `ID_USUARIO` against `usuarioService.getUserById`; `controllers/promotorController.ts` signs a token carrying promoter fields (`ID_PROMOTOR`, `NOME`, `EMAIL`, `CPF`, `ID_CLIENT`) per `docs/LOGIN_PROMOTOR.md:88-91`.
- **Current mitigation:** None — the mismatch is masked only because the middleware never runs.
- **Recommendations:** Decide whether `Promotor` and `Usuario` are one identity or two. If promoters are the API's principals, the middleware should validate a promoter-shaped payload and look up `PromotorService.findPromotorById`. Also note `JwtPayloadSchema` requires `SENHA` inside the token payload — a password field should never be in a JWT; remove it from both the schema and anything that signs it.

### Live-looking credentials are committed to the repository

- **Risk:** `exemple.env` is tracked in git and contains what appear to be real production values, not placeholders. Anyone with repository read access — including anyone who has ever cloned it — holds them, and git history retains them after any fix.
- **Files:** `exemple.env` (confirmed tracked via `git ls-files`)
- **What is exposed:** production RDS password (identical for the PRD `us-east-1` and legacy `sa-east-1` instances, both as user `root`), full RDS hostnames, an AWS access key ID + secret access key, `JWT_SECRET="fa6igdi3adfvb"` (13 characters — brute-forceable regardless of exposure), the AWS account ID, and ECS role ARNs.
- **Why it slipped through:** `.gitignore` covers `.env`, `.env.*`, and un-ignores `!.env.example`. The filename `exemple.env` (Portuguese-influenced misspelling, extension last) matches none of those patterns. A correct `.env.example` with placeholder values already exists alongside it, so the file is redundant as well as unsafe.
- **Recommendations:**
  1. Treat all listed credentials as compromised and rotate them: RDS passwords, the AWS key pair, and `JWT_SECRET`. Rotating `JWT_SECRET` invalidates outstanding tokens — coordinate with clients.
  2. Delete `exemple.env`; keep `.env.example` as the single reference.
  3. Add `*.env` to `.gitignore` so extension-last variants are caught.
  4. Purge from history (`git filter-repo`) only after rotation, and coordinate — it rewrites every commit hash. Rotation is what actually removes the risk; purging is cleanup.
  5. Move runtime secrets to AWS Secrets Manager or SSM Parameter Store and inject via the ECS task definition.
  6. Stop sharing one `root` account across both databases. The legacy instance is meant to be read-only; give it a role that enforces that in the database rather than by convention.

### Passwords are reversibly encrypted rather than hashed

- **Risk:** `CAMPANHAS_OB.PROMOTOR.SENHA` holds AES-256-CBC ciphertext, not a hash. Anyone with the database dump plus `CRIPTKEY` recovers every plaintext password. Because the same key encrypts every row, one key disclosure exposes all accounts at once, and users who reuse passwords are exposed beyond this system.
- **Files:** `utils/encryption.ts` (`encrypt`/`decrypt`, key = `sha256(CRIPTKEY)`), `service/promotorService.ts:33,67` (encrypt on write), `service/promotorService.ts:146` (decrypt on login)
- **Current mitigation:** Login uses `crypto.timingSafeEqual` after decryption, which does address timing attacks — the concern here is the storage model, not the comparison. `docs/LOGIN_PROMOTOR.md:141` describes this as "senhas são armazenadas de forma criptografada", which is accurate but easy to misread as hashing.
- **Recommendations:** Migrate to `bcrypt` — already a dependency (`^6.0.0`) and currently unused. Hash on write; on login, verify with `bcrypt.compare` and fall back to the legacy decrypt path once, re-hashing on success, so existing users migrate transparently. Remove the decrypt path after a cutover window. Keep `utils/encryption.ts` only if something else genuinely needs reversible encryption.

### CORS accepts every origin

- **Risk:** `app.use(cors())` with no options sends `Access-Control-Allow-Origin: *`, letting any website call the API from a victim's browser. Combined with the missing authentication, any page on the internet can drive this API.
- **Files:** `app.ts:11`
- **Current mitigation:** None. A `CORS_ORIGIN` variable is defined in both env files but never read.
- **Recommendations:** `app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? [], credentials: true }))`.

### Database TLS certificate validation is disabled

- **Risk:** `trustServerCertificate: true` accepts any certificate, removing protection against man-in-the-middle on the database connection — including on the cross-region legacy link, which traverses more network than an in-region one.
- **Files:** `data-source.ts:17-19` (primary), `data-source.ts:35-37` (legacy)
- **Current mitigation:** The `Dockerfile` downloads the RDS CA bundle to `/APP/global-bundle.pem`, but no code references it. The intent was clearly there; the wiring was not finished.
- **Recommendations:** Replace with `ssl: { ca: fs.readFileSync('/APP/global-bundle.pem').toString(), rejectUnauthorized: true }`. Note `trustServerCertificate` is an mssql option and is not doing anything for the `pg` driver in the first place.

### Internal exception messages are returned to clients

- **Risk:** Every controller catch block puts `error.message` in the response body — 35 occurrences across `controllers/`. TypeORM and `pg` errors expose table names, column names, schema names, and constraint names, handing an attacker a schema map.
- **Files:** all 6 files in `controllers/`, e.g. `controllers/rotaController.ts:29-33`
- **Recommendations:** Log the full error server-side with a generated correlation ID; return only a generic message plus that ID. Apply via a shared error-handling helper or an Express error middleware rather than editing 35 sites by hand.

### `SKIP_AUTH` escape hatch

- **Risk:** `authMiddleware` returns `next()` unconditionally when `SKIP_AUTH === "true"` and `NODE_ENV === "development"`. The double condition is reasonable, but it means a misconfigured `NODE_ENV` in a deployed environment disables authentication silently.
- **Files:** `middlewares/authMiddleware.ts:42-44`; commented out in `exemple.env:26`
- **Recommendations:** Once auth is actually mounted, log a loud startup warning whenever the bypass is active, and consider failing startup if `SKIP_AUTH=true` is seen alongside a production-looking `DB_HOST`.

---

## Operational Concerns — notification delivery *(new since 2026-08-04)*

The outbox worker is well-guarded against duplicate delivery. The residual risks are all configuration-shaped: every one of them fails **silently**, which is what makes them worth listing.

### `OUTBOX_VISITA_ENABLED=true` leaves the worker dead

- **Risk:** The flag is compared against `"1"`. The other flags in this same `.env` (`WHATSAPP_SEND_ENABLED`, `LEGACY_DB_ENABLED`) are compared against `"true"`, so writing `true` here is the natural mistake. Nothing sends, no error is raised, and the notification rows simply accumulate as `PENDENTE`.
- **Files:** `schedule/outboxNotificacaoCron.ts` (`outboxHabilitado`)
- **Current mitigation:** deliberate and adequate — startup logs the raw value read and prints `worker não registrado — OUTBOX_VISITA_ENABLED precisa ser exatamente "1"`. Check that line after any deploy.
- **Recommendation:** if a third convention ever appears, normalize all of them through one helper rather than adding a third spelling.

### `WHATSAPP_TEST_PHONE_OVERRIDE` set in production swallows every notification

- **Risk:** The variable redirects *all* messages to a single number. It exists so the flow can be exercised against the real provider without messaging a user, and setting it also lifts the `NODE_ENV=development` send block. In production it would silently misdeliver every legitimate notification while reporting success.
- **Files:** `channels/whatsappChannel.ts`
- **Current mitigation:** `.env.example` documents it as LOCAL/STAGING ONLY; the failure log flags `(OVERRIDE DE TESTE)` on the destination line.
- **Recommendation:** refuse to start, or refuse to send, when the override is set and `NODE_ENV === "production"`. A comment is not a guard.

### The provider call ceiling scales with task count, not with configuration

- **Risk:** `OUTBOX_VISITA_BATCH_SIZE` is per tick **per server copy**. Every ECS task that boots with the flag on becomes another worker — safe for correctness (`SKIP LOCKED` keeps the sets disjoint) but multiplicative for provider load: the real ceiling is `batch × task count` per tick, 20/minute/task at the defaults.
- **Files:** `service/outboxNotificacaoService.ts` (`tamanhoLote`), `task_definition.tpl.json`
- **Recommendation:** size the batch against the service's desired-count, not against one machine. Revisit before any import in the thousands. The send window (`NOTIFICACAO_HORA_ENVIO`/`_FIM`) is the other lever — a batch spread across a window is the actual defence against a burst.

### The worker shares a process with the API

- **Risk:** Ticks run in the same Node process that serves HTTP. A slow batch competes with request handling on one event loop.
- **Files:** `app.ts` (`registrarOutboxCron()` inside the DataSource `.then()`), `schedule/outboxNotificacaoCron.ts`
- **Current mitigation:** substantial and deliberate — `tick()` never throws, every row has its own `try/catch`, a closure flag prevents overlapping ticks, and the channel has a 10s timeout. The worst case is latency, not a crash.
- **Recommendation:** leave it. Splitting out a worker task is the answer only if batch sizes grow by an order of magnitude; monitor tick duration first.

### Pending schema migration

- **Risk:** `scripts/migration-outbox-notificacao-visita.sql` adds `AVAILABLE_AT`, `LOCKED_AT`, `LOCKED_BY`, `ATTEMPTS` and a partial index by `ALTER`. Until the DBA runs it in production, `claimBatch` fails against a table without those columns.
- **Files:** `scripts/migration-outbox-notificacao-visita.sql`, `.specs/project/STATE.md`
- **Note:** the `AVAILABLE_AT IS NOT NULL` predicate in the claim exists specifically so the worker's first deploy does not re-send every historical row. Do not "simplify" it away.

---

## Known Bugs

### ✅ Test suite red since 2026-07-13 — RESOLVED

- **Was:** `npm test` → 31 of 41 tests failing with `TypeError: (0 , data_source_1.isLegacyEnabled) is not a function`, because `__mocks__/data-source.ts` did not export the members PR #39 added to `data-source.ts`.
- **Now:** the manual mock exports `AppDataSourceSync` (with `query` and `transaction`), `LegacyDataSource`, and `isLegacyEnabled`. Unit suite verified 2026-08-14: **29 suites / 432 tests passing**.
- **Residual:** three legacy integration suites (`rotaService`, `campanhaPromotorService`, `campanhaResultsService`) still fail at teardown on inherited foreign keys without `ON DELETE` — pre-existing, per `.specs/project/STATE.md`, not re-verified in this pass.
- **Still open:** there is no CI. Nothing prevents this from recurring; that is what actually let the suite stay broken for three weeks.

### `GET /oficina/nearby` returns constant enrichment flags

- **Symptoms:** Every workshop comes back with `flag_engajamento`, `flag_sentimento`, and `flag_treinamento` = `'neutro'` and `cor_icone` = `'cinza'`, regardless of the underlying data. Any client colouring markers by these fields renders everything grey.
- **Files:** `service/oficinaService.ts:69-78`; the unused import is at `service/oficinaService.ts:3`
- **Root cause:** The `DuckDBClient.getOficinaDataByIds()` call was replaced with hardcoded literals. `campanhaService.ts` still performs the real lookup, so the two endpoints disagree about the same workshops. Note the hardcoded defaults also differ from the documented ones — `docs/DUCKDB_INTEGRATION.md:169-173` specifies `'baixo'` for engagement and training, not `'neutro'`.
- **Documentation drift:** `docs/DUCKDB_INTEGRATION.md:106-112` describes this method as merging DuckDB data. It does not.
- **Recommendations:** Establish whether this was a deliberate rollback (performance? data quality?) or an accidental leftover from the raw-SQL refactor in PR #37/#38. If deliberate, remove the dead import and correct the doc. If accidental, restore the lookup. Either way the two services should agree.

---

## Fragile Areas

### `RotaPromotor` maps two relations onto one foreign-key column

- **Files:** `entities/RotaPromotor.ts:100-106`
- **Why fragile:** `oficina` (→ `MAIN_REGISTER.OFICINA`) and `cadastroEmpresa` (→ `dw.cadastro_empresa`) both declare `@JoinColumn({ name: "ID_OFICINA" })`. One column is treated as a foreign key into two different tables in two different schemas. This only works while both tables share an identical ID space, which is an undocumented invariant no constraint enforces — `dw.cadastro_empresa` is an external warehouse table this service does not control.
- **Common failures:** Loading `relations: ['oficina']` versus `relations: ['cadastroEmpresa']` returns different data for the same row; if the ID spaces ever diverge, one silently resolves to `null` or, worse, to an unrelated record. TypeORM may also generate surprising SQL when both relations are requested together.
- **Safe modification:** Do not add cascades or eager loading to either relation. When adding a query that joins workshops, state explicitly which of the two tables is authoritative for that use case. Prefer the raw-SQL approach already used in `findNearestOficinas` over entity relations for cross-schema reads.
- **Test coverage:** None. No entity or relation-loading tests exist.

### ~~`MigrationAwareRepository` is adopted inconsistently~~ (resolvido)

A inconsistência vinha de dois caminhos de acesso a dados coexistindo (wrapper vs. repositório
direto), com semânticas de leitura diferentes. Com a remoção do fluxo dual em 2026-08-14 existe um
único caminho — `AppDataSourceSync.getRepository()` — e a distinção deixou de existir.

### The `STATUS` CHECK constraint and the TypeScript enum must be changed together

- **Files:** `entities/NotificacaoVisita.ts` (`StatusNotificacaoVisita`, 7 members), `scripts/migration-notificacao-visita.sql` (`CHK_NOTIFICACAO_VISITA_STATUS`)
- **Why fragile:** the constraint enumerates the same 7 values. Adding a status in TypeScript without an `ALTER` makes the first write of that status raise a constraint violation at runtime — and the paths that write the less obvious statuses are exactly the ones nobody exercises by hand. This already bit once during the DBA review: a proposed 4-value constraint would have made every anti-spam-blocked send (`DISPENSADO`) throw.
- **Safe modification:** change the enum and the migration in the same commit. `REAGENDADO` is reserved (NOTIF-26) and currently has no code path — do not assume unused means removable.
- **Test coverage:** the status logic is covered (`statusNotificacaoVisita.test.ts`, `envioGuards.test.ts`); the constraint itself is not, because no test runs the migration.

### The WhatsApp template's variable order is an unversioned contract

- **Files:** `channels/whatsappChannel.ts`, provider-side template `atualizacao_dados_visita_oficina`
- **Why fragile:** the three variables are positional — user name, company name, link. The provider holds the template; this repository holds the order. Nothing links them, and a mismatch produces a well-formed message with the values in the wrong slots, delivered successfully. It already changed once (2026-08-11, from 2 variables to 3).
- **Common failures:** silent misdelivery. There is no error, no failed row, and no way to detect it from this side.
- **Safe modification:** treat any template change as a coordinated deploy, and send one message to `WHATSAPP_TEST_PHONE_OVERRIDE` before enabling the batch.

### The server accepts traffic before the database is ready

- **Files:** `app.ts:44-64` (async `initialize()`), `app.ts:71` (`app.listen`, executed immediately and unconditionally)
- **Why fragile:** `listen()` does not wait for `initialize()`, and a DataSource failure is caught and logged without affecting process state. The container stays "healthy" and serves 500s. During a slow start, early requests fail with connection errors instead of being refused.
- **Common failures:** ECS routes traffic to a task that cannot reach the database; failures surface as per-request 500s rather than a failed deployment, so a bad deploy looks like an application bug.
- **Safe modification:** Move `app.listen` inside the `.then()`, and `process.exit(1)` in the `.catch()` so ECS restarts and rolls back. Add a `/health` endpoint that checks `AppDataSourceSync.isInitialized` and wire it to the ECS health check. `.specs/project/STATE.md` already lists this under Deferred Ideas.

---

## Performance and Scaling

No production measurements were available. Each item below states the mechanism and where to measure.

### ~~Cross-region merge reads fetch full result sets from both databases~~ (resolvido)

O merge em memória entre `us-east-1` e `sa-east-1` (e o problema de `take`/`skip` aplicado por
banco) desapareceu com a remoção do fluxo dual em 2026-08-14. Toda leitura agora bate num único
banco, e paginação via `find()` volta a se comportar como o TypeORM documenta.

### Route optimization runs synchronously inside the request

- **Problem:** `POST /rota/optimize` executes Nearest Neighbour plus 2-opt in the request thread. 2-opt is O(n²) per improvement pass and loops until no improvement is found, so cost grows sharply with the number of workshops on a route and is not bounded by iteration count or time.
- **Files:** `utils/routeOptimizer.ts:29-59` (`twoOptImprove`), invoked from `service/rotaService.ts` via `optimizeAndSaveRoute`
- **Cause:** Node is single-threaded; a long optimization blocks the event loop for every other in-flight request on that task.
- **Improvement path:** Establish the real distribution of workshops per route first — if it is reliably small (tens), this is a non-issue and should be left alone. If routes can reach hundreds of stops, add an iteration cap or time budget to the 2-opt loop, and consider moving the work off the request path.

### `findNearestOficinas` scans and sorts without spatial indexing

- **Problem:** The Haversine distance is computed as a SQL expression over every candidate row, then `ORDER BY distance` sorts the whole set before `LIMIT` — no index can serve this. The `WHERE` clause also contains a correlated-looking `IN (SELECT DISTINCT "CNPJ" FROM dw.temp_cnpj_sqlserver WHERE "CREATED_AT" > '2026-01-01')` subquery over a table this service does not own.
- **Files:** `service/oficinaService.ts:26-59`
- **Cause:** Standard trade-off for distance queries without PostGIS.
- **Improvement path:** Run `EXPLAIN ANALYZE` against production data before changing anything. If it is slow, the usual fixes are a bounding-box pre-filter on `latitude`/`longitude` (indexable) to shrink the candidate set before the trig runs, and materializing the CNPJ allowlist. PostGIS with a GiST index is the proper solution if this becomes a core access path.
- **Note:** The hardcoded date literal `'2026-01-01'` in the filter will need revisiting as data ages.

---

## Dependencies at Risk

### 25 declared dependencies are never imported

- **Risk:** Each unused package is installed into the production image and contributes to the vulnerability surface without providing value. This is not hypothetical here: the `@duckdb/node-api` malware incident documented in `docs/SECURITY_SUMMARY.md` arrived through exactly this channel.
- **Files:** `package.json`
- **Unused:** `playwright`, `openai`, `mongodb`, `mssql`, `mysql2`, `multer`, `aws-sdk`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `ejs`, `pdf-lib`, `pdf-parse`, `xlsx`, `node-schedule`, `sharp`, `fontkit`, `string-similarity`, `stream-json`, `undici`, `node-fetch`, `uuid`, `date-fns`, `fs-extra`, `bcrypt`, `@scalar/express-api-reference`
- **Now genuinely used** (remove from any cleanup list): `axios`, `node-cron`, `date-fns-tz`, `express-rate-limit`, `supertest`
- **Impact:** Slower installs and builds, a larger image, and a much larger `npm audit` surface. `playwright` alone pulls browser binaries.
- **Migration plan:** Remove all except `bcrypt` (the intended password-hashing fix). Note the near-duplicates now that some siblings are in use — `date-fns` is dead while `date-fns-tz` is load-bearing; `undici` and `node-fetch` are dead while `axios` is load-bearing; `node-schedule` is dead while `node-cron` is load-bearing. Do not remove by family. The `Dockerfile` also installs `imagemagick` and `ghostscript` for work that does not exist — remove those too.
- **Lockfile drift:** `package.json`/`package-lock.json` pin `jest@29.7.0` but the working `node_modules` resolves `30.1.3`. Reinstall before trusting a local test result.

### TypeScript is transpiled at runtime in production

- **Risk:** `npm start` runs `npx ts-node app.ts`, so the production container compiles on boot. Type errors become runtime startup failures rather than build failures, startup is slower, and `typescript` plus `ts-node` ship in the production image.
- **Files:** `package.json:7`, `Dockerfile` (`CMD ["npm", "run", "start"]`)
- **Impact:** No build gate exists anywhere — nothing runs `tsc` before deployment, and `tsconfig.json` excludes `__tests__` so test files are never type-checked at all.
- **Migration plan:** Add `"build": "tsc"` and `"start": "node dist/app.js"`. Use a multi-stage `Dockerfile` that builds and then copies only `dist/` and production dependencies. Note `outDir: "./dist"` is already configured and `dist` is already in `.gitignore` — the intent was there.

---

## Tech Debt

### ✅ `package.json` referenced nine files that do not exist — RESOLVED

- **Was:** `scrapAutoDoc`, `scrapStartMyCar`, `autodocToOB`, `vectorizeManuals`, `vinculateToPeca`, `importToMongoDev`, `aproveSolicitacoes`, `sendEmailSolicitacoes` pointed at an absent `bots/` directory and missing `scripts/` files.
- **Now:** removed in `9df64f4` ("removendo scripts inexistentes do package.json"). The script list is trustworthy; new entries (`outbox:status`, `outbox:tick`, `outbox:agendar`, `whatsapp:mock`) all resolve.

### `scripts/migrate-data.ts` does not exist

- **Issue:** `.specs/project/STATE.md` names `npx ts-node scripts/migrate-data.ts` as the **next action** for the database migration. The file has never existed.
- **Impact:** The documented next step of the zero-downtime migration cannot be executed. The migration has been parked in dual-mode since 2026-07-13 as a result, and every cross-region merge read pays for it (see Performance below).
- **Fix approach:** Establish whether the script was lost or never written, then write it before resuming. Until then, treat the migration's "Next" line in STATE.md as blocked, not pending.

### `README.md` documents commands and files that do not exist

- **Issue:** The README instructs `npm run build`, `npm run migration:run`, `npm run dev`, `npm start`, `npm test`, `npm run test:e2e`, and `docker-compose up -d`. Of these, only `npm run dev`, `npm start`, and `npm test` exist. There is no build script, no TypeORM migration setup, no e2e script, and no `docker-compose.yml`.
- **Files:** `README.md:14-29`
- **Impact:** A new contributor's first four commands fail. Onboarding cost, and it erodes trust in the rest of the documentation.
- **Fix approach:** Rewrite against actual scripts. Document that schema changes are applied by hand from `scripts/*.sql`, since that is the real process.

### Two environment example files disagree

- **Issue:** `.env.example` (safe placeholders, `PORT=3333`) and `exemple.env` (real values, `PORT=3008`) both exist. `docs/DOCUMENTACAO_API.md` documents port 3333, `docs/LOGIN_PROMOTOR.md` documents 8185, `app.ts` defaults to 8185, and the `Dockerfile` exposes 3008.
- **Files:** `.env.example`, `exemple.env`, `app.ts:71`, `Dockerfile`, `docs/DOCUMENTACAO_API.md:340`, `docs/LOGIN_PROMOTOR.md:84`
- **Impact:** Confusion about which port to use locally; `exemple.env` is also the security exposure above.
- **Fix approach:** Delete `exemple.env`. Pick one port, align `.env.example`, `Dockerfile`, the `app.ts` default, and the docs.
- **Also:** `.env.example` omits `CRIPTKEY`, which `utils/encryption.ts:7` throws on at import time if absent. Following the documented setup produces a crash on startup. Add it.

### Orphaned files with no code path

- **Issue:** `schemas/versao.ts` has no entity, service, controller, or route. `templates/*.ejs` has no mail transport installed. `assets/fonts`, `assets/img`, `assets/pdf` are referenced nowhere. `types/ModeloType.ts` belongs to a domain (vehicle models) this service does not implement.
- **Impact:** Misleads readers about the service's scope; inflates the image.
- **Fix approach:** Delete. Recover from git history if ever needed.

### Naming inconsistency across the repository

- **Issue:** The directory is `backend-promotor`; `package.json` says `backend-hijack`; ECR, ECS, and CloudWatch resources all use `backend-hijack`; the OpenAPI title says "Backend Promotor API". `routes/` files are PascalCase while `controllers/` and `service/` are camelCase. Code comments mix English and Portuguese, sometimes in one file.
- **Files:** `package.json:2`, `exemple.env:41-49`, `config/openapi.ts:49`, `routes/*`
- **Impact:** Grep and log correlation are harder; new contributors cannot tell which name is canonical.
- **Fix approach:** Decide the canonical service name and align `package.json` at minimum. Renaming AWS resources is disruptive — document the mapping instead if renaming is not worth it. Pick one language for comments going forward.

---

## Test Coverage Gaps

Coverage has improved substantially — 432 unit tests across 29 suites, plus HTTP-level integration suites via `supertest`. The visit-notification subsystem is the best-tested code in the repository (guards, backoff, claim, channel, token, middleware, scheduling, console). The gaps that remain are all in the **older** code.

**Untested, in rough priority order:**

| Area | Risk | Priority |
|---|---|---|
| `utils/migrationRepository.ts` | Merge correctness, dedup by PK, legacy-failure fallback — the core of the active migration | High |
| `middlewares/validation.ts` / Zod schemas | No test asserts that a malformed body is rejected with 400 | Medium |
| `utils/routeOptimizer.ts` | Pure functions, trivial to test, zero coverage; endpoint pinning and 2-opt correctness. (`haversine` was extracted and **is** tested) | Medium |
| Controllers (all 6) | HTTP status codes, error envelopes, 404 paths — no controller has any test | High |
| Routes / Zod schemas | No test asserts that a malformed body is rejected with 400 | Medium |
| `utils/routeOptimizer.ts` | Pure functions, trivial to test, currently zero coverage; endpoint pinning and 2-opt correctness | Medium |
| `service/oficinaService.ts` | Raw SQL and distance ordering; the hardcoded-flags bug would have been caught | Medium |

**What changed:** `coveragePathIgnorePatterns` no longer excludes `utils`, so these holes now show up in a coverage report instead of being hidden. `supertest` is wired up, so the HTTP harness the previous audit asked for exists — it is simply only pointed at `/visita`.

**Why the gaps persist:** with no CI, nothing enforces any of it.

**Difficulty:** Low for `routeOptimizer` and `encryption` (pure functions). Low-to-medium for the remaining controllers — copy the pattern from `__tests__/integration/visitaConfirmar.test.ts` and the repaired `__mocks__/data-source.ts`, both of which already do exactly this.

---

_Concerns audit: 2026-08-14 (previous: 2026-08-04)_
_Update as issues are fixed or new ones discovered_
