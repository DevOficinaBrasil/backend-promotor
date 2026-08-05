# Notificação de Visita e Confirmação do Reparador Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/notificacao-visita-confirmacao/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: **none**. No `AGENTS.md`, no `CONTRIBUTING.md`, no CI workflows, no `coverageThreshold` in `jest.config.ts`, and no lint/typecheck script in `package.json`. Strong defaults applied.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Pure utility (`utils/*.ts`) | unit | All branches; 1:1 to spec ACs; every listed edge case has a test | `__tests__/unit/*.test.ts` | `npm run test:unit` |
| Guard / policy (`service/envioGuards.ts`) | unit | All branches; 1:1 to spec ACs (NOTIF-27–30); ordering of the expire-then-check sequence asserted | `__tests__/unit/*.test.ts` | `npm run test:unit` |
| Domain service (`service/*.ts`) | unit | All branches; 1:1 to spec ACs; every listed edge case has a test | `__tests__/unit/*.test.ts` | `npm run test:unit` |
| Channel (`channels/*.ts`) | unit | All branches; every provider error-code mapping + both send locks | `__tests__/unit/*.test.ts` | `npm run test:unit` |
| Middleware (`middlewares/*.ts`) | unit | Happy path + every rejection branch (expired / bad signature / wrong scope / missing header) | `__tests__/unit/*.test.ts` | `npm run test:unit` |
| Route / controller (HTTP endpoint) | integration | All routes in scope: happy path + every listed edge case + error/failure paths, driven through `supertest` | `__tests__/integration/*.test.ts` | `npm run test:integration` |
| Entity / Zod schema / SQL migration | none | - (build gate only) | - | build gate only |

`supertest` v7.1.4 and `@types/supertest` are already dependencies — no new package needed for the integration layer.

**Note on coverage reporting:** `jest.config.ts` sets `coveragePathIgnorePatterns: ["entities", "data-source.ts", "utils"]`, so the pure helpers in `utils/` are excluded from the *coverage report*. Their tests still run and still gate — only the percentage output ignores them. Called out so a low coverage number on this feature is not misread as missing tests.

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After tasks with unit tests only | `npm run test:unit` |
| Full | After tasks with integration tests | `npm run test:unit && npm run test:integration` |
| Build | After phase completion or config/entity/schema-only tasks | `npx tsc --noEmit && npm test` |

No lint or format script exists in this project, so the Build gate is TypeScript compilation plus the full Jest suite.

**Baseline (corrected 2026-08-05):** the suite started at 31 failed / 10 passed. T1 takes it to **38 passed / 3 failed**. The 3 remaining failures are a pre-existing DuckDB regression in `campanhaService` (see T1) that predates this feature, touches no file any visita task writes, and is filed as a separate finding.

**Scoped gate — read this before running any gate.** Do **not** require a fully green `npm test` to close a task. The full suite carries those 3 known-red tests, and blocking on them would make an unrelated bug gate this feature. Instead:

- **Quick / Full gates:** run the command and require that **every test belonging to this feature passes**, and that the pre-existing failure count has not grown beyond the 3 documented ones. A 4th failure means you broke something — stop and fix it.
- **Build gate:** `npx tsc --noEmit` must pass **clean, with zero errors** — that part is absolute. `npm test` is then judged by the same rule as above.

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

The diagrams below show **dependency edges**, not execution order. Tasks with no arrow between them still run in numeric order within their phase; the absence of an arrow means neither blocks the other.

### Phase 0: Unblock the gate

```
T1
```

### Phase 1: Data foundation

```
T1 -> T2 -> T3
```

### Phase 2: Pure utilities

```
T1 -> T4
T3 -> T5
T1 -> T6
```

### Phase 3: Channel layer

```
T3 -> T7
T7 -> T8
T4 -> T8
T8 -> T9
```

### Phase 4: Send guards and orchestration

```
T3 -> T10
T10 -> T11
T11 -> T12
T5 -> T12
T6 -> T12
T9 -> T12
T12 -> T13
```

### Phase 5: Confirm domain

```
T5 -> T14
T6 -> T14
T14 -> T15
T15 -> T16
```

### Phase 6: HTTP surface

```
T6 -> T17
T3 -> T18
T14 -> T19
T17 -> T19
T18 -> T19
T15 -> T20
T19 -> T20
T16 -> T21
T20 -> T21
```

### Phase 7: Status exposure (P2)

```
T3 -> T22
T22 -> T23
T23 -> T24
```

---

## Task Breakdown

### T1: Repair the data-source mock and three stale test files

**What**: Restore the missing mock exports, then update the 6 assertions left stranded by superseded production behavior, so the suite returns to a true green baseline.
**Where**: `__mocks__/data-source.ts`
**Depends on**: None
**Reuses**: The real export shape in `data-source.ts`
**Requirement**: Prerequisite (not a spec requirement — unblocks every gate below)

**Scope correction (2026-08-05).** This task originally required a 41/41 green suite before the feature could start. That requirement was wrong and has been dropped — it turned a pre-existing, unrelated bug into a blocker for this feature.

What was actually found: the `isLegacyEnabled is not a function` crash fires at construction time, *before* each test's own logic runs, so it was masking 6 further failures. `.specs/project/STATE.md` and `.specs/codebase/TESTING.md` both record all 31 failures as one root cause; **both are wrong** and should be corrected separately.

| File | Test asserts | Reality | Verdict |
| --- | --- | --- | --- |
| `__tests__/unit/campanhaResultsService.test.ts` (1 test) | `.leftJoin('rota.campanhaPromotor', …)` | `.leftJoinAndSelect(…)` (`service/campanhaResultsService.ts:163`) — strict superset | Stale test → fix in scope |
| `__tests__/unit/campanhaPerguntasService.test.ts` (2 tests) | `find()` without `relations` | `relations: ['opcoes']` (`service/campanhaPerguntasService.ts:184`) — additive | Stale test → fix in scope |
| `__tests__/unit/campanhaService.test.ts` (3 tests) | DuckDB enrichment merged into oficinas | Production calls `getOficinaDataByIds` **nowhere**; `db90b5a` deleted it and hardcoded `'neutro'`/`'cinza'` | **Production regression — tests are correct. OUT OF SCOPE, do not touch** |

The 3 `campanhaService` tests fail because the feature they cover was silently removed, not because they are stale. Rewriting them would erase real coverage; restoring the DuckDB call would change live endpoint output. Neither belongs in this feature — it is filed as a separate finding.

**Done when**:

- [x] Mock exports `isLegacyEnabled` (a `jest.fn()` defaulting to `false`), `LegacyDataSource` (with `isInitialized` and `getRepository`), and `AppDataSourceSync.transaction`/`.query`
- [x] The 3 genuinely-stale assertions in `campanhaResultsService.test.ts` and `campanhaPerguntasService.test.ts` updated to the current production contract, preserving each test's original intent
- [x] `__tests__/unit/campanhaService.test.ts` left **untouched**
- [x] No test removed, no `it.skip`/`xit` introduced — count stays at 41
- [x] `npm test` reports **38 passed / 3 failed**, the 3 being the documented DuckDB regression
- [x] `npx tsc --noEmit` passes clean (after the prerequisite `fix(build)` commit correcting `tsconfig.json`'s invalid `ignoreDeprecations` value)

**Tests**: none
**Gate**: build (see the scoped-gate note under Gate Check Commands)

**Commit**: `fix(tests): restore data-source mock and realign two stale service assertions`

**Status**: ✅ Complete

---

### T2: Create the NOTIFICACAO_VISITA migration

**What**: Raw-SQL migration creating the table with both indexes, matching the schema in design.md.
**Where**: `scripts/migration-notificacao-visita.sql`
**Depends on**: T1
**Reuses**: `scripts/migration-ordenacao-rotas.sql` conventions
**Requirement**: NOTIF-01, NOTIF-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Table matches design.md exactly, including `ID_USUARIO`/`TOKEN_HASH`/`EXPIRA_EM` nullable and `ENDERECO_ATUALIZADO BOOLEAN NOT NULL DEFAULT FALSE`
- [x] `UNIQUE` constraint on `ID_ROTA_PROMOTOR`; unique index on `TOKEN_HASH`; composite index on `(ID_USUARIO, STATUS)`
- [x] Uses `IF NOT EXISTS` throughout, per the existing migration's style
- [x] Gate check passes: `npx tsc --noEmit && npm test`

**Tests**: none
**Gate**: build

**Commit**: `feat(db): add NOTIFICACAO_VISITA table migration`

**Status**: ✅ Complete

---

### T3: Create the NotificacaoVisita entity

**What**: TypeORM entity plus the `StatusNotificacaoVisita` and `CanalNotificacao` enums.
**Where**: `entities/NotificacaoVisita.ts`
**Depends on**: T2
**Reuses**: `entities/RotaPromotor.ts` decorator style
**Requirement**: NOTIF-01, NOTIF-16, NOTIF-26

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Every column from T2's migration is represented with matching nullability
- [x] `StatusNotificacaoVisita` includes `DISPENSADO` and the reserved `REAGENDADO`
- [x] `@ManyToOne` to `RotaPromotor` with `@JoinColumn`, mirroring the `Oficina` relation pattern
- [x] Gate check passes: `npx tsc --noEmit && npm test`

**Tests**: none
**Gate**: build

**Commit**: `feat(entities): add NotificacaoVisita entity`

**Status**: ✅ Complete

---

### T4: Implement Brazilian phone normalization

**What**: Pure function normalizing `CELULAR` to digits-only `55DDDNNNNNNNNN`, rejecting anything that is not a valid 10–11 digit Brazilian number.
**Where**: `utils/telefone.ts`
**Depends on**: T1
**Reuses**: Nothing — new pure utility
**Requirement**: NOTIF-06 (spec AC4)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Strips separators, parentheses, `+`, and spaces; prefixes `55` when absent; never double-prefixes an already-`55` number
- [x] Returns null (fail closed) for non-numeric junk, invalid DDD, and wrong digit counts — spec edge case "IF CELULAR contains non-numeric characters or an invalid DDD"
- [x] Tests cover 10-digit landline-style, 11-digit mobile, already-prefixed, masked `(11) 99999-8888`, empty, and invalid-DDD inputs
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 15 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(utils): add Brazilian phone normalization`

**Status**: ✅ Complete

---

### T5: Implement the effective-status helper

**What**: Pure `statusEfetivo()` deriving `EXPIRADO` from `STATUS` + `EXPIRA_EM`, with an injectable clock.
**Where**: `utils/statusNotificacaoVisita.ts`
**Depends on**: T3
**Reuses**: `entities/NotificacaoVisita` types
**Requirement**: NOTIF-17 (spec AC22)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Returns `EXPIRADO` only when `STATUS === 'ENVIADO'` and `EXPIRA_EM` is non-null and in the past
- [x] Returns `STATUS` unchanged for every other combination, including `CONFIRMADO` past its expiry and a null `EXPIRA_EM`
- [x] Clock is injectable so the boundary case is tested without wall-clock dependence
- [x] Tests cover: unexpired `ENVIADO`, expired `ENVIADO`, exact-boundary, `CONFIRMADO` past expiry, `DISPENSADO`, null `EXPIRA_EM`
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 9 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(utils): add effective notification status helper`

**Status**: ✅ Complete

---

### T6: Implement link-token and visit-JWT utilities

**What**: Opaque link-token generation/hashing plus scoped JWT sign/verify for the visit flow.
**Where**: `utils/visitaToken.ts`
**Depends on**: T1
**Reuses**: `utils/encryption.ts` crypto primitives; `controllers/promotorController.ts:164` JWT signing pattern; `JWT_SECRET`
**Requirement**: NOTIF-11, NOTIF-24, NOTIF-25 (spec AC5, AC14, AC19–20)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `gerarLinkToken()` returns `{ raw, hash }` with `raw` from `crypto.randomBytes(32)` base64url-encoded and `hash` its SHA-256 hex
- [x] `emitirJwt()` signs with `JWT_SECRET`, `expiresIn: "30m"`, scope `visita:confirmar`, and the `ID_NOTIFICACAO_VISITA`/`ID_ROTA_PROMOTOR` claims
- [x] `verificarJwt()` verifies signature and expiry, then Zod-parses the payload; throws on bad signature, expiry, or wrong scope
- [x] Tests cover: token uniqueness across calls, hash determinism, round-trip sign→verify, tampered signature, expired token, missing/incorrect scope
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 12 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(utils): add visit link-token and scoped JWT helpers`

**Status**: ✅ Complete

---

### T7: Define the channel sender interface

**What**: `ChannelSender` interface and the `ChannelSendResult` discriminated result type.
**Where**: `channels/ChannelSender.ts`
**Depends on**: T3
**Reuses**: `CanalNotificacao` from the entity
**Requirement**: NOTIF-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `send()` signature matches design.md
- [x] Result type distinguishes success (with `messageId`/`providerMessageId`) from failure (with a reason string)
- [x] Gate check passes: `npx tsc --noEmit && npm test`

**Tests**: none
**Gate**: build

**Commit**: `feat(channels): define ChannelSender interface`

**Status**: ✅ Complete

---

### T8: Implement the WhatsApp channel

**What**: `ChannelSender` implementation calling `send-template` via axios, with both send locks and the full provider error-code mapping.
**Where**: `channels/whatsappChannel.ts`
**Depends on**: T4, T7
**Reuses**: `utils/telefone.ts`; axios (already a dependency, first use in this codebase)
**Requirement**: NOTIF-06, NOTIF-08, NOTIF-21, NOTIF-22, NOTIF-23 (spec AC6–AC13)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Posts to `{WHATSAPP_BASE_URL}/api/v1/messages/send-template` with the exact body and `Authorization: Bearer` header from spec AC6
- [x] Explicit axios timeout set (10s) so a hung provider cannot stall route creation
- [x] `NODE_ENV === "test"` forces the no-op path **unconditionally**, overriding `WHATSAPP_SEND_ENABLED=true` — asserted by a dedicated test
- [x] `WHATSAPP_SEND_ENABLED !== "true"` takes the no-op path; missing `WHATSAPP_ACCOUNT_ID`/`WHATSAPP_TEMPLATE_NAME_VISITA` likewise
- [x] Provider codes map per spec AC8/AC9: config-type → `"channel not configured"`, rate/quota → captured code, `VALIDATION_ERROR` → `"invalid payload"`
- [x] Network error, timeout, and non-JSON response all resolve to a failure result rather than throwing
- [x] Tests assert **no HTTP call is made** in every locked path (axios mocked and asserted not called)
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 24 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(channels): implement WhatsApp send-template channel`

**Note**: the config gate also fails closed on a missing `WHATSAPP_BASE_URL`/`WHATSAPP_API_KEY` — a superset of AC11's two named vars, since AC6 cannot build the call without them. An unmapped provider code yields `"provider error"`; the spec does not define wording for codes outside its three groups (spec-precision gap).

**Status**: ✅ Complete

---

### T9: Implement the channel registry

**What**: `CanalNotificacao` → `ChannelSender` lookup.
**Where**: `channels/channelRegistry.ts`
**Depends on**: T8
**Reuses**: `channels/ChannelSender.ts`, `channels/whatsappChannel.ts`
**Requirement**: NOTIF-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `getChannel(CanalNotificacao.WHATSAPP)` returns the WhatsApp sender
- [x] An unregistered enum value throws a clearly-worded programmer error
- [x] Tests cover both branches
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 2 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(channels): add channel registry`

**Status**: ✅ Complete

---

### T10: Implement the address-freshness guard

**What**: `enderecoRecente()` — true when `Oficina.DATA_ALTERACAO` falls within the last 3 months, treating null as stale.
**Where**: `service/envioGuards.ts`
**Depends on**: T3
**Reuses**: `entities/Oficina` types
**Requirement**: NOTIF-27 (spec AC26)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Returns true only for a non-null timestamp within 3 months; null returns false (stale), per the spec edge case
- [x] Clock injectable; boundary at exactly 3 months asserted
- [x] Tests cover: recent, exactly-at-boundary, older, null
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 7 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(service): add address-freshness send guard`

**Note**: the spec does not pin the boundary instant, so exactly-3-months-old is treated as fresh (inclusive) and asserted by a test at the boundary and one millisecond before it.

**Status**: ✅ Complete

---

### T11: Implement the per-recipient anti-spam guard

**What**: `avaliarGuardas()` — persists `EXPIRADO` to that recipient's stale rows, then blocks on an outstanding or recently-confirmed notification.
**Where**: `service/envioGuards.ts` (modify)
**Depends on**: T10
**Reuses**: `utils/statusNotificacaoVisita.ts`, `AppDataSourceSync`
**Requirement**: NOTIF-28, NOTIF-29, NOTIF-30 (spec AC27–AC29)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The `EXPIRADO` persist runs **before** the outstanding check — asserted by a test where a just-expired row must NOT block a new send
- [x] Blocks with `"recipient has outstanding notification"` for an unexpired `ENVIADO` on any Oficina
- [x] Blocks with `"recipient confirmed recently"` for a `CONFIRMADO` within 3 months on any Oficina
- [x] Does not block on `FALHOU`, `DISPENSADO`, `EXPIRADO`, or a confirmation older than 3 months
- [x] Scoped per `ID_USUARIO`, not per Oficina — asserted by a test with two different Oficinas sharing a recipient
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 14 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(service): add per-recipient anti-spam send guards`

**Note**: ordering is pinned two ways — a lapsed row is persisted `EXPIRADO` and does not block, and an explicit invocation-order assertion fails if the persist is moved after the outstanding check. The outstanding query also keeps its own `EXPIRA_EM` filter, so a failed persist can never resurrect an expired row as outstanding.

**Status**: ✅ Complete

---

### T12: Implement the notification send orchestrator

**What**: `notificarVisita()` — the full send flow from row creation through dispatch outcome, wired to the guards and channel registry. Never throws.
**Where**: `service/notificacaoVisitaService.ts`
**Depends on**: T5, T6, T9, T11
**Reuses**: `service/envioGuards.ts`, `channels/channelRegistry.ts`, `utils/visitaToken.ts`, `utils/telefone.ts`
**Requirement**: NOTIF-01, NOTIF-03, NOTIF-04, NOTIF-09, NOTIF-11, NOTIF-18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Creates the row in `PENDENTE`, then updates through the write sequence in design.md
- [ ] Guard order: address-freshness → recipient resolution → anti-spam → phone normalization → token → dispatch
- [ ] Recipient resolution orders by `DATA_ALTERACAO DESC NULLS LAST`, then `ID_USUARIO ASC` (spec AC2)
- [ ] `FALHOU` + `"no recipient with phone"` when nobody qualifies; `"no usuario linked to oficina"` for the zero-Usuario edge case
- [ ] Link token issued **before** dispatch and survives a failed send (spec AC5, AC11)
- [ ] **Never throws** — every failure path resolves to a persisted row; asserted by a test forcing the channel to reject
- [ ] Logs creation, token issuance, dispatch attempt, and result with both IDs (spec AC24)
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: at least 12 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(service): add visit notification send orchestrator`

---

### T13: Hook notification into all three route-creation paths

**What**: Call the orchestrator after route creation in `createRotas`, `createRotaWithCampanhaPromotor`, and `updateRotaWorkshops`, isolated by try/catch.
**Where**: `service/rotaService.ts` (modify)
**Depends on**: T12
**Reuses**: Existing `RotaService` structure
**Requirement**: NOTIF-02, NOTIF-07 (spec AC1, AC10)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] All three creation paths notify — `updateRotaWorkshops` included (the path missed in the design's first draft)
- [ ] Each call wrapped so a notification failure never propagates; route creation still returns successfully — asserted per path by forcing the orchestrator to reject
- [ ] Batch creation notifies once per created route
- [ ] Existing `rotaService` tests still pass unmodified
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: at least 6 new tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(service): trigger visit notification on route creation`

---

### T14: Implement token exchange

**What**: `trocarToken()` — hash lookup, branch on effective status, issue a JWT and return workshop name plus current address.
**Where**: `service/visitaConfirmacaoService.ts`
**Depends on**: T5, T6
**Reuses**: `utils/visitaToken.ts`, `utils/statusNotificacaoVisita.ts`
**Requirement**: NOTIF-24, NOTIF-31 (spec AC14–18, AC30)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Returns `PENDING` with a JWT, workshop name, and the seven address fields — and **no visit date** (spec AC30)
- [ ] Returns `ALREADY_CONFIRMED` (with `CONFIRMADO_EM`), `EXPIRED`, and `TOKEN_INVALID` as distinct states, none issuing a JWT
- [ ] Expiry decided via `statusEfetivo()`, and the stored `STATUS` column is **not** mutated by this read
- [ ] Re-exchangeable: two successive calls on a live token both return a JWT (spec AC15)
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: at least 8 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(service): add visit token exchange`

---

### T15: Implement the confirm action

**What**: `confirmar()` — guarded atomic transition to `CONFIRMADO` with audit fields.
**Where**: `service/visitaConfirmacaoService.ts` (modify)
**Depends on**: T14
**Reuses**: `utils/statusNotificacaoVisita.ts`
**Requirement**: NOTIF-12, NOTIF-15, NOTIF-25 (spec AC19–21)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Conditional `UPDATE ... WHERE STATUS='ENVIADO' AND "EXPIRA_EM" > now()` — the expiry guard asserted by a test where a JWT issued pre-expiry is presented post-expiry and must be rejected
- [ ] Sets `CONFIRMADO_EM`, `CONFIRMADO_POR` (JWT `sub`), `CONFIRMADO_IP`
- [ ] `rowCount = 0` re-reads and returns `ALREADY_CONFIRMED` or `EXPIRED` — never a false success
- [ ] Concurrent double-confirm yields exactly one transition (spec AC21)
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: at least 7 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(service): add visit confirmation action`

---

### T16: Implement address correction

**What**: `atualizarEndereco()` — allowlisted write to `MAIN_REGISTER.OFICINA`, then the same confirm transition with `ENDERECO_ATUALIZADO`.
**Where**: `service/visitaConfirmacaoService.ts` (modify)
**Depends on**: T15
**Reuses**: `entities/Oficina.ts`, the T15 transition logic
**Requirement**: NOTIF-32, NOTIF-33 (spec AC31–33)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] **`UPDATE` grant on `MAIN_REGISTER.OFICINA` verified against a real (non-production) database before this task is marked done.** Nothing in this codebase has ever written to that schema — if the grant is missing, STOP and escalate rather than shipping a runtime failure
- [ ] Only `ENDERECO`, `NUMERO`, `COMPLEMENTO`, `BAIRRO`, `CIDADE`, `ESTADO`, `CEP` are writable; any other key is rejected — asserted by a test attempting to change `CNPJ`, `TELEFONE`, and `STATUS`
- [ ] Oficina write happens **first**; if it fails, `NotificacaoVisita` STATUS is left untouched and a distinct error is returned — no false confirmation (spec AC33), asserted by a test forcing the write to reject
- [ ] On success: same `CONFIRMADO` transition and audit fields as T15, plus `ENDERECO_ATUALIZADO = true`
- [ ] `LATITUDE`/`LONGITUDE` untouched (documented consequence)
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: at least 8 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(service): add address correction with audited confirmation`

---

### T17: Implement the visit JWT middleware

**What**: Express middleware verifying the visit-scoped JWT and attaching its payload.
**Where**: `middlewares/visitaAuthMiddleware.ts`
**Depends on**: T6
**Reuses**: `middlewares/authMiddleware.ts` structure (header parsing, 401/403 split) — **not** its payload schema
**Requirement**: NOTIF-25 (spec AC19–20)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] 401 for missing or malformed `Authorization` header; 403 for invalid signature, expired, or wrong scope
- [ ] Attaches the parsed payload to the request on success
- [ ] Uses its own Zod payload schema, independent of `authMiddleware`'s known-mismatched one
- [ ] Tests cover every rejection branch plus the happy path
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: at least 6 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(middleware): add visit-scoped JWT middleware`

---

### T18: Define the visit Zod schemas

**What**: Request/response schemas for all three endpoints, including the address allowlist shape.
**Where**: `schemas/visita.ts`
**Depends on**: T3
**Reuses**: `schemas/rota.ts` and `schemas/common.ts` conventions
**Requirement**: NOTIF-32

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Token param, address-update body (`.strict()` so unknown keys are rejected), and response schemas for each state defined
- [ ] Reuses `ErrorResponseSchema` from `schemas/common.ts`
- [ ] Gate check passes: `npx tsc --noEmit && npm test`

**Tests**: none
**Gate**: build

**Commit**: `feat(schemas): add visit confirmation schemas`

---

### T19: Wire the token-exchange endpoint

**What**: `GET /visita/:token` — controller handler, route registration with the per-visit rate limiter, and mounting in `api.ts`.
**Where**: `controllers/visitaController.ts`, `routes/VisitaRoute.ts`, `api.ts`
**Depends on**: T14, T17, T18
**Reuses**: `createDocumentedRoute`, `rotaController.ts` envelope pattern
**Requirement**: NOTIF-10, NOTIF-13, NOTIF-24

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `express-rate-limit` installed and configured with a **custom `keyGenerator`** keyed on the link token — never `req.ip` (which resolves to the ALB)
- [ ] Router mounted at `/visita` in `api.ts` alongside the existing six domains
- [ ] Integration tests via `supertest` cover: valid token → 200 + JWT + name + address, already-confirmed → 200 `ALREADY_CONFIRMED` with no JWT, expired → 410, malformed → 404, and 429 after exceeding the limit
- [ ] Response contains no visit-date field (spec AC30)
- [ ] Gate check passes: `npm run test:unit && npm run test:integration`
- [ ] Test count: at least 6 integration tests pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `feat(api): add GET /visita/:token exchange endpoint`

---

### T20: Wire the confirm endpoint

**What**: `POST /visita/confirmar` — JWT-authenticated confirm action.
**Where**: `controllers/visitaController.ts` (modify), `routes/VisitaRoute.ts` (modify)
**Depends on**: T15, T19
**Reuses**: T19's router and rate limiter; `visitaAuthMiddleware`
**Requirement**: NOTIF-12, NOTIF-25

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Route mounted with `visitaAuthMiddleware`; rate limiter keyed on the JWT's `ID_NOTIFICACAO_VISITA`
- [ ] Integration tests cover: valid JWT → 200 + `CONFIRMADO`, missing header → 401, bad signature → 403, expired JWT → 403, second confirm → 409, and a full `GET`→`POST` round trip
- [ ] Gate check passes: `npm run test:unit && npm run test:integration`
- [ ] Test count: at least 6 integration tests pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `feat(api): add POST /visita/confirmar endpoint`

---

### T21: Wire the address-correction endpoint

**What**: `PUT /visita/endereco` — JWT-authenticated address correction that also confirms.
**Where**: `controllers/visitaController.ts` (modify), `routes/VisitaRoute.ts` (modify)
**Depends on**: T16, T20
**Reuses**: T19's router and rate limiter; `visitaAuthMiddleware`; `schemas/visita.ts`
**Requirement**: NOTIF-32, NOTIF-33

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Integration tests cover: valid correction → 200 + `CONFIRMADO` + `ENDERECO_ATUALIZADO`, non-allowlisted field → 400 with no Oficina write, missing JWT → 401, already-confirmed → 409, and Oficina write failure → error state with STATUS unchanged
- [ ] A test asserts the `Oficina` row actually received only the address columns
- [ ] Gate check passes: `npm run test:unit && npm run test:integration`
- [ ] Test count: at least 6 integration tests pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `feat(api): add PUT /visita/endereco correction endpoint`

---

### T22: Add the inverse relation on RotaPromotor

**What**: `@OneToOne` from `RotaPromotor` to `NotificacaoVisita` so route reads can eager-load status.
**Where**: `entities/RotaPromotor.ts` (modify)
**Depends on**: T3
**Reuses**: Existing relation decorators in the same file
**Requirement**: NOTIF-19

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Inverse relation declared without altering any existing column or relation
- [ ] Gate check passes: `npx tsc --noEmit && npm test`

**Tests**: none
**Gate**: build

**Commit**: `feat(entities): add NotificacaoVisita relation to RotaPromotor`

---

### T23: Expose confirmation status on route reads

**What**: Load the relation in route reads and map it through `statusEfetivo()` before returning.
**Where**: `service/rotaService.ts` (modify)
**Depends on**: T22
**Reuses**: `utils/statusNotificacaoVisita.ts`; the existing `relations` array in `getRotaByIdWithRelations`
**Requirement**: NOTIF-19 (spec P2 AC1, AC2)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `'notificacaoVisita'` added to the relations array in `getRotaByIdWithRelations`
- [ ] Returned status goes through `statusEfetivo()` — a test asserts an unopened expired row reads `EXPIRADO`, not `ENVIADO` (the staleness bug this exists to prevent)
- [ ] `CONFIRMADO_EM` included when set; routes with no notification row degrade gracefully rather than throwing
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: at least 5 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(service): expose visit confirmation status on route reads`

---

### T24: Extend route response schemas

**What**: Add the confirmation-status fields to the rota response schemas so they appear in the OpenAPI contract.
**Where**: `schemas/rota.ts` (modify)
**Depends on**: T23
**Reuses**: Existing schema conventions in the same file
**Requirement**: NOTIF-19

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Response schemas include the nested status object as optional
- [ ] `/openapi.json` still generates without error
- [ ] Gate check passes: `npx tsc --noEmit && npm test`

**Tests**: none
**Gate**: build

**Commit**: `feat(schemas): expose visit confirmation status in rota responses`

---

## Phase Execution Map

Phases run in sequence; tasks within a phase run in numeric order. (Rendered as a table rather than an arrow diagram so it is not mistaken for — or parsed as — a second dependency graph.)

| Order | Phase | Tasks |
| --- | --- | --- |
| 1 | Phase 0: Unblock the gate | T1 |
| 2 | Phase 1: Data foundation | T2, T3 |
| 3 | Phase 2: Pure utilities | T4, T5, T6 |
| 4 | Phase 3: Channel layer | T7, T8, T9 |
| 5 | Phase 4: Send guards and orchestration | T10, T11, T12, T13 |
| 6 | Phase 5: Confirm domain | T14, T15, T16 |
| 7 | Phase 6: HTTP surface | T17, T18, T19, T20, T21 |
| 8 | Phase 7: Status exposure (P2) | T22, T23, T24 |

Execution is strictly sequential - there is no intra-phase parallelism.

**Suggested batching** (24 tasks → 4 workers at ~7 tasks each, whole phases only):

| Batch | Phases | Tasks | Count | Character |
| --- | --- | --- | --- | --- |
| 1 | 0, 1, 2 | T1–T6 | 6 | Mechanical: mock fix, migration, entity, pure helpers |
| 2 | 3, 4 | T7–T13 | 7 | Core domain: channel + send orchestration and guards |
| 3 | 5, 6 | T14–T21 | 8 | Core domain + HTTP: confirm flow and all three endpoints |
| 4 | 7 | T22–T24 | 3 | Mechanical: read-path status exposure |

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 1 mock file | ✅ Granular |
| T2 | 1 migration file | ✅ Granular |
| T3 | 1 entity | ✅ Granular |
| T4 | 1 pure function | ✅ Granular |
| T5 | 1 pure function | ✅ Granular |
| T6 | 1 file, 4 cohesive token functions | ⚠️ OK — one concern (visit tokens), one file |
| T7 | 1 interface | ✅ Granular |
| T8 | 1 class | ✅ Granular |
| T9 | 1 registry | ✅ Granular |
| T10 | 1 function | ✅ Granular |
| T11 | 1 function (same file as T10) | ✅ Granular |
| T12 | 1 orchestrator method | ✅ Granular |
| T13 | 3 call sites, 1 file | ⚠️ OK — one concern (the notification hook), cohesive |
| T14 | 1 service method | ✅ Granular |
| T15 | 1 service method | ✅ Granular |
| T16 | 1 service method | ✅ Granular |
| T17 | 1 middleware | ✅ Granular |
| T18 | 1 schema file | ✅ Granular |
| T19 | 1 endpoint (3 files) | ⚠️ Justified — an HTTP endpoint is untestable until controller + route + mount exist together; the template lists "one API endpoint" as a valid task unit. Splitting would leave unverified code, which the co-location rules forbid |
| T20 | 1 endpoint (2 files) | ⚠️ Justified — same reason |
| T21 | 1 endpoint (2 files) | ⚠️ Justified — same reason |
| T22 | 1 entity change | ✅ Granular |
| T23 | 1 service change | ✅ Granular |
| T24 | 1 schema change | ✅ Granular |

`validate_tasks.py` emits multi-file `Where` warnings for T19–T21; those are the three justified endpoint tasks above, not granularity failures.

## Diagram-Definition Cross-Check

| Task | Depends On (body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | (no incoming edge) | ✅ Match |
| T2 | T1 | `T1 -> T2` | ✅ Match |
| T3 | T2 | `T2 -> T3` | ✅ Match |
| T4 | T1 | `T1 -> T4` | ✅ Match |
| T5 | T3 | `T3 -> T5` | ✅ Match |
| T6 | T1 | `T1 -> T6` | ✅ Match |
| T7 | T3 | `T3 -> T7` | ✅ Match |
| T8 | T4, T7 | `T7 -> T8`, `T4 -> T8` | ✅ Match |
| T9 | T8 | `T8 -> T9` | ✅ Match |
| T10 | T3 | `T3 -> T10` | ✅ Match |
| T11 | T10 | `T10 -> T11` | ✅ Match |
| T12 | T5, T6, T9, T11 | `T11 -> T12`, `T5 -> T12`, `T6 -> T12`, `T9 -> T12` | ✅ Match |
| T13 | T12 | `T12 -> T13` | ✅ Match |
| T14 | T5, T6 | `T5 -> T14`, `T6 -> T14` | ✅ Match |
| T15 | T14 | `T14 -> T15` | ✅ Match |
| T16 | T15 | `T15 -> T16` | ✅ Match |
| T17 | T6 | `T6 -> T17` | ✅ Match |
| T18 | T3 | `T3 -> T18` | ✅ Match |
| T19 | T14, T17, T18 | `T14 -> T19`, `T17 -> T19`, `T18 -> T19` | ✅ Match |
| T20 | T15, T19 | `T15 -> T20`, `T19 -> T20` | ✅ Match |
| T21 | T16, T20 | `T16 -> T21`, `T20 -> T21` | ✅ Match |
| T22 | T3 | `T3 -> T22` | ✅ Match |
| T23 | T22 | `T22 -> T23` | ✅ Match |
| T24 | T23 | `T23 -> T24` | ✅ Match |

No task depends on a later phase. Verified by `validate_tasks.py`: **0 errors**, 10 warnings — the 6 `Tests: none` entries confirmed against the matrix's "none" layers, and the 3 multi-file `Where` warnings justified in the granularity table above.

## Test Co-location Validation

| Task | Code Layer | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | test infrastructure | none | none | ✅ OK |
| T2 | SQL migration | none | none | ✅ OK |
| T3 | entity | none | none | ✅ OK |
| T4 | pure utility | unit | unit | ✅ OK |
| T5 | pure utility | unit | unit | ✅ OK |
| T6 | pure utility | unit | unit | ✅ OK |
| T7 | interface (types only) | none | none | ✅ OK |
| T8 | channel | unit | unit | ✅ OK |
| T9 | channel | unit | unit | ✅ OK |
| T10 | guard/policy | unit | unit | ✅ OK |
| T11 | guard/policy | unit | unit | ✅ OK |
| T12 | domain service | unit | unit | ✅ OK |
| T13 | domain service | unit | unit | ✅ OK |
| T14 | domain service | unit | unit | ✅ OK |
| T15 | domain service | unit | unit | ✅ OK |
| T16 | domain service | unit | unit | ✅ OK |
| T17 | middleware | unit | unit | ✅ OK |
| T18 | Zod schema | none | none | ✅ OK |
| T19 | route/controller | integration | integration | ✅ OK |
| T20 | route/controller | integration | integration | ✅ OK |
| T21 | route/controller | integration | integration | ✅ OK |
| T22 | entity | none | none | ✅ OK |
| T23 | domain service | unit | unit | ✅ OK |
| T24 | Zod schema | none | none | ✅ OK |

No violations. Every `Tests: none` corresponds to a layer the matrix marks "none".
