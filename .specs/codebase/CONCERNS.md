# Codebase Concerns

**Analysis Date:** 2026-08-04
**Scope:** Static analysis + one full test run. No production traffic, logs, or metrics were available, so performance items carry mechanism and code evidence rather than measured latencies.

Ordered by risk. The first three sections need owner attention before further feature work.

---

## Security Considerations

### No authentication is enforced on any endpoint

- **Risk:** Every route in the service is publicly callable. Anyone who can reach the load balancer can read all campaigns, promoters, routes and survey results, and can create, update, and soft-delete any of them.
- **Files:** `middlewares/authMiddleware.ts` (defined, exported, **never imported anywhere**); all 6 files in `routes/` pass `middlewares: []` at all 37 `createDocumentedRoute()` call sites.
- **Evidence:** `grep -rn "authMiddleware" --include="*.ts" .` returns exactly one hit — the definition itself. `grep -rn "middlewares:" routes/` returns 37 hits, all `middlewares: []`.
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

## Known Bugs

### Test suite has been red since 2026-07-13

- **Symptoms:** `npm test` → 31 of 41 tests fail across 5 of 6 suites. Only `__tests__/integration/duckdb.test.ts` passes.
- **Trigger:** `npx jest` on a clean checkout of `main`.
- **Error:** `TypeError: (0 , data_source_1.isLegacyEnabled) is not a function` at `utils/migrationRepository.ts:25`, reached from `MigrationAwareRepository`'s constructor.
- **Files:** `__mocks__/data-source.ts`
- **Root cause:** The manual mock exports only `AppDataSourceSync.getRepository`. PR #39 added `LegacyDataSource` and `isLegacyEnabled` to `data-source.ts` and routed services through `MigrationAwareRepository`, whose constructor calls `isLegacyEnabled()`. The mock was never updated, so `jest.mock('../../data-source')` yields a module missing that export.
- **Impact:** Not a production defect — but the suite has provided zero regression protection since PR #39 merged, and it merged red because no CI runs it.
- **Fix:** Extend `__mocks__/data-source.ts` with `LegacyDataSource` and `isLegacyEnabled` (concrete snippet in TESTING.md). Then add a CI workflow that runs `npm test` on pull requests.

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

### `MigrationAwareRepository` is adopted inconsistently

- **Files:** `utils/migrationRepository.ts`; mixed usage visible in `service/promotorService.ts` — wrapper at lines 12-16, 29, 54, 84, 107, 124, 174; raw `AppDataSourceSync.getRepository()` at lines 244, 267, 281
- **Why fragile:** Whether a read sees legacy data depends on which call site you land in. `getCampanhasByPromotor()` (line 267) and `getPromotoresByClientId()` (line 281) are reads that bypass the merge entirely, so they return incomplete results for any promoter still living only in the legacy database. `unlinkCampanhaPromotor()` (line 244) is a write, so bypassing is correct there — but the three read/write cases are visually indistinguishable, which is what makes this easy to get wrong again.
- **Common failures:** Silent under-reporting rather than errors. A promoter appears to have no campaigns, or a client appears to have fewer promoters than it does.
- **Safe modification:** Audit every `AppDataSourceSync.getRepository` call in `service/` and classify it read vs. write. Convert reads to the wrapper. Consider making the wrapper the only permitted entry point in services so the distinction is structural rather than remembered.
- **Test coverage:** None — `utils` is in `coveragePathIgnorePatterns`, and no test exercises the merge or the legacy-failure fallback.

### The server accepts traffic before the database is ready

- **Files:** `app.ts:44-64` (async `initialize()`), `app.ts:71` (`app.listen`, executed immediately and unconditionally)
- **Why fragile:** `listen()` does not wait for `initialize()`, and a DataSource failure is caught and logged without affecting process state. The container stays "healthy" and serves 500s. During a slow start, early requests fail with connection errors instead of being refused.
- **Common failures:** ECS routes traffic to a task that cannot reach the database; failures surface as per-request 500s rather than a failed deployment, so a bad deploy looks like an application bug.
- **Safe modification:** Move `app.listen` inside the `.then()`, and `process.exit(1)` in the `.catch()` so ECS restarts and rolls back. Add a `/health` endpoint that checks `AppDataSourceSync.isInitialized` and wire it to the ECS health check. `.specs/project/STATE.md` already lists this under Deferred Ideas.

---

## Performance and Scaling

No production measurements were available. Each item below states the mechanism and where to measure.

### Cross-region merge reads fetch full result sets from both databases

- **Problem:** `MigrationAwareRepository.find()` runs the same query against `us-east-1` and `sa-east-1`, awaits both, and merges in application memory. Latency is the slower of the two — a cross-region round trip, typically ~110-130 ms between those regions before query time. `find()` also passes the caller's `options` verbatim to both, so any `take`/`skip` is applied per database and the merged result can exceed the requested page size while still missing rows.
- **Files:** `utils/migrationRepository.ts:35-49`, `queryBothAndMerge` at `:165-198`
- **Cause:** Deliberate — cross-region prevents database links, and the design assumed low volume (`.specs/project/STATE.md` records "<5k registros").
- **Improvement path:** This is transitional and disappears when the migration completes, which is the real fix. Until then: measure `LegacyDataSource` query time separately; do not introduce pagination through this wrapper without handling the per-database `take` problem; and complete the migration rather than optimizing around it.

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

### 28 declared dependencies are never imported

- **Risk:** Each unused package is installed into the production image and contributes to the vulnerability surface without providing value. This is not hypothetical here: the `@duckdb/node-api` malware incident documented in `docs/SECURITY_SUMMARY.md` arrived through exactly this channel.
- **Files:** `package.json`
- **Unused:** `playwright`, `openai`, `mongodb`, `mssql`, `mysql2`, `multer`, `aws-sdk`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `ejs`, `pdf-lib`, `pdf-parse`, `xlsx`, `node-cron`, `node-schedule`, `sharp`, `fontkit`, `string-similarity`, `stream-json`, `undici`, `uuid`, `date-fns`, `date-fns-tz`, `fs-extra`, `axios`, `bcrypt`, `supertest`, `@scalar/express-api-reference`
- **Impact:** Slower installs and builds, a larger image, and a much larger `npm audit` surface. `playwright` alone pulls browser binaries.
- **Migration plan:** Remove all except `bcrypt` (needed for the password-hashing fix) and `supertest` (needed if HTTP tests are added). The `Dockerfile` also installs `imagemagick` and `ghostscript` for image and PDF work that no longer exists — remove those too.

### TypeScript is transpiled at runtime in production

- **Risk:** `npm start` runs `npx ts-node app.ts`, so the production container compiles on boot. Type errors become runtime startup failures rather than build failures, startup is slower, and `typescript` plus `ts-node` ship in the production image.
- **Files:** `package.json:7`, `Dockerfile` (`CMD ["npm", "run", "start"]`)
- **Impact:** No build gate exists anywhere — nothing runs `tsc` before deployment, and `tsconfig.json` excludes `__tests__` so test files are never type-checked at all.
- **Migration plan:** Add `"build": "tsc"` and `"start": "node dist/app.js"`. Use a multi-stage `Dockerfile` that builds and then copies only `dist/` and production dependencies. Note `outDir: "./dist"` is already configured and `dist` is already in `.gitignore` — the intent was there.

---

## Tech Debt

### `package.json` references nine files that do not exist

- **Issue:** `scrapAutoDoc`, `scrapStartMyCar`, `autodocToOB`, `vectorizeManuals`, `vinculateToPeca` point into a `bots/` directory that is absent; `importToMongoDev`, `aproveSolicitacoes`, `sendEmailSolicitacoes` point at missing files in `scripts/`.
- **Files:** `package.json:18-25`
- **Impact:** Mostly cosmetic — but it explains most of the unused-dependency list above, and it makes the script list untrustworthy.
- **Note:** `.specs/project/STATE.md` names `npx ts-node scripts/migrate-data.ts` as the **next action** for the database migration, and that file does not exist either. Whoever resumes the migration needs to know it must be written first.
- **Fix approach:** Delete the dead script entries. Confirm the migration script's status before assuming the migration can proceed.

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

**Untested, in rough priority order:**

| Area | Risk | Priority |
|---|---|---|
| `middlewares/authMiddleware.ts` | Auth is the largest open risk and has zero tests; the token-shape mismatch would have been caught by one | High |
| `utils/encryption.ts` | Password round-trip and malformed-input handling; guards against silent breakage during the bcrypt migration | High |
| `utils/migrationRepository.ts` | Merge correctness, dedup by PK, legacy-failure fallback — the core of the active migration | High |
| Controllers (all 6) | HTTP status codes, error envelopes, 404 paths — no controller has any test | High |
| Routes / Zod schemas | No test asserts that a malformed body is rejected with 400 | Medium |
| `utils/routeOptimizer.ts` | Pure functions, trivial to test, currently zero coverage; endpoint pinning and 2-opt correctness | Medium |
| `service/oficinaService.ts` | Raw SQL and distance ordering; the hardcoded-flags bug would have been caught | Medium |

**Why the gaps persist:** `coveragePathIgnorePatterns` excludes `utils` entirely, so coverage reports do not reveal these holes. `supertest` is installed but unused, so there is no HTTP-level harness. And with no CI, nothing enforces any of it — the suite merged to `main` broken.

**Difficulty:** Low for `routeOptimizer` and `encryption` (pure functions). Medium for controllers and middleware (needs `supertest` plus a mocked service layer). The existing manual-mock pattern in `__mocks__/data-source.ts` extends to cover them once it is repaired.

---

_Concerns audit: 2026-08-04_
_Update as issues are fixed or new ones discovered_
