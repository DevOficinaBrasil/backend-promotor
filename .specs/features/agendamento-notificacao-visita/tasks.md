# Agendamento de Envio da Notificação de Visita (Outbox) Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/agendamento-notificacao-visita/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `jest.config.ts`, `CLAUDE.md`. No coverage thresholds are configured, so the strong defaults apply for depth.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Service (`service/*.ts`) | unit | All branches; 1:1 to spec ACs; every listed edge case | `__tests__/unit/*.test.ts` | `npm run test:unit` |
| Claim SQL / data access (`outboxNotificacaoService.claimBatch`) | integration | Concurrency + due-ness + lease-expiry + null-`AVAILABLE_AT` exclusion against the real DB | `__tests__/integration/*.test.ts` | `npm run test:integration` |
| Utils (`utils/*.ts`) | unit | All branches; both timezone and override paths | `__tests__/unit/*.test.ts` | `npm run test:unit` |
| Scripts / CLI (`scripts/*.ts`) | unit | Argument parsing + the `CONFIRMADO` refusal; I/O itself is not asserted | `__tests__/unit/*.test.ts` | `npm run test:unit` |
| Entity / migration SQL / config (`entities`, `scripts/*.sql`, `.env.example`, `package.json`) | none | Build gate only — `jest.config.ts` already excludes `entities` from coverage | - | build gate only |

**Note on `claimBatch`:** it cannot be meaningfully unit-tested. `FOR UPDATE SKIP LOCKED` is behaviour of the database, not of the code, so a mocked data source would assert a string rather than the guarantee (AGND-05) the whole feature rests on. It gets an integration test against the real dev DB, using the `__TEST_` row convention already in `__tests__/integration/`.

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After tasks with unit tests only | `npm run test:unit` |
| Full | After tasks with integration tests | `npm run test:unit && npm run test:integration` |
| Build | After phase completion or config/entity-only tasks | `npx tsc --noEmit && npm test` |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Schema and scheduling primitive

The columns and the "when should this go out" rule. Nothing consumes them yet.

```
T1 → T2 → T3
```

### Phase 2: Enqueue path

Route creation stops sending and starts queueing.

```
T3 → T4 → T5 → T6
```

### Phase 3: Atomic claim

The guarantee the feature exists for.

```
T6 → T7 → T8
```

### Phase 4: Dispatch loop

Claim outcomes become persisted state.

```
T8 → T9 → T10
```

### Phase 5: Wiring and manual operation

Turning it on, and being able to drive it by hand.

```
T10 → T11 → T12 → T13 → T14
```

---

## Task Breakdown

### T1: Migration script for the outbox columns

**What**: Idempotent `ALTER TABLE` adding `AVAILABLE_AT`, `LOCKED_AT`, `LOCKED_BY`, `ATTEMPTS`, the partial index and the `COMMENT ON`s.
**Where**: `scripts/migration-outbox-notificacao-visita.sql`
**Depends on**: None
**Reuses**: `scripts/migration-notificacao-visita.sql` — its header conventions (`ROLLBACK:` note, no blank line or semicolon-bearing comment inside a statement, `IF NOT EXISTS` as a double-run guard)
**Requirement**: AGND-01, AGND-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Four columns added with `IF NOT EXISTS`, `ATTEMPTS` as `integer NOT NULL DEFAULT 0`
- [x] Partial index `IDX_NOTIFICACAO_VISITA_FILA` on `AVAILABLE_AT WHERE STATUS = 'PENDENTE' AND AVAILABLE_AT IS NOT NULL`
- [x] `COMMENT ON` for each column naming its `CRM.integration_outbox` counterpart
- [x] `ROLLBACK:` header present; no statement contains a blank line or a semicolon-bearing comment
- [x] Runs twice in a row against dev without error — applied 2026-08-13, both passes no-op-safe

**SPEC_DEVIATION**: `LOCKED_BY` is `TEXT`, not the target's `VARCHAR(120)`.
**Reason**: dba-rules for this database forbid `VARCHAR` (see `scripts/migration-notificacao-visita.sql` header). Spec updated to match.

**Status**: ✅ Complete

**Tests**: none
**Gate**: build

**Commit**: `feat(outbox): add migration for notificacao visita outbox columns`

---

### T2: Add the outbox columns to the entity

**What**: Map the four new columns on `NotificacaoVisita`.
**Where**: `entities/NotificacaoVisita.ts`
**Depends on**: T1
**Reuses**: existing column decorators in the same file (`timestamptz`, explicit `name:`)
**Requirement**: AGND-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `AVAILABLE_AT`, `LOCKED_AT` (`timestamptz`, nullable), `LOCKED_BY` (`varchar(120)`, nullable), `ATTEMPTS` (`int`, default 0)
- [ ] Column names match T1's migration exactly
- [ ] `npx tsc --noEmit` clean

**Tests**: none
**Gate**: build

**Commit**: `feat(outbox): map outbox columns on NotificacaoVisita entity`

---

### T3: Scheduling rule (`proximoHorarioEnvio`)

**What**: Next occurrence of `NOTIFICACAO_HORA_ENVIO` in America/São_Paulo strictly after a given instant, with the `OUTBOX_VISITA_ENVIO_IMEDIATO` override.
**Where**: `utils/agendamento.ts`
**Depends on**: T2
**Reuses**: `date-fns-tz` (first use in this repo — see design Risks)
**Requirement**: AGND-02, AGND-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Returns the same day's hour when called before it, the next day's when called after
- [x] Returns the input instant unchanged when `OUTBOX_VISITA_ENVIO_IMEDIATO === '1'`
- [x] Hour configurable; invalid/absent env falls back to `9`
- [x] Tests inject the "now" instant — no dependence on the wall clock
- [x] Gate check passes: `npm run test:unit` — 331/331
- [x] Test count: 10 new tests pass (no silent deletions)
- [x] Extra: suite re-run under `TZ=UTC`, `Asia/Tokyo`, `Europe/Lisbon`, `America/Sao_Paulo` — 10/10 in each, so the rule does not depend on the process timezone (prod ECS runs UTC)

**Status**: ✅ Complete

**Tests**: unit
**Gate**: quick

**Commit**: `feat(outbox): add proximoHorarioEnvio scheduling rule`

---

### T4: `agendarVisita` — enqueue without dispatching

**What**: New service method creating the `PENDENTE` row with `AVAILABLE_AT` set and nothing else resolved.
**Where**: `service/notificacaoVisitaService.ts` (modify)
**Depends on**: T3
**Reuses**: the row-creation block at the top of `notificarVisita`; `finalizar` for the write path
**Requirement**: AGND-01, AGND-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Creates exactly one `PENDENTE` row with `AVAILABLE_AT` from T3
- [x] Resolves no recipient, issues no token, calls no channel — asserted by a test spying on the channel
- [x] Never throws; a write failure resolves to a logged failure, not an exception
- [x] Logs loudly when `OUTBOX_VISITA_ENVIO_IMEDIATO` shortened the schedule
- [x] Gate check passes: `npm run test:unit` — 339/339
- [x] Test count: 8 new tests pass (no silent deletions)

**Status**: ✅ Complete

**Tests**: unit
**Gate**: quick

**Commit**: `feat(outbox): add agendarVisita enqueue path`

---

### T5: Route creation enqueues instead of sending

**What**: Point `notificarRotasCriadas` at `agendarVisita`, drop the now-pointless concurrency pool, and mark `notificarVisita` as non-production.
**Where**: `service/rotaService.ts` (modify)
**Depends on**: T4
**Reuses**: existing per-route try/catch isolation
**Requirement**: AGND-01, AGND-21

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `notificarRotasCriadas` calls `agendarVisita` for every created route — covers all 5 call sites, including `reassignRotasByAddress`
- [x] `NOTIFICACOES_SIMULTANEAS` pool removed; a plain loop replaces it
- [x] Per-route try/catch retained — one bad row never fails route creation
- [x] A test asserts route creation triggers **zero** channel calls (AGND-21)
- [x] Gate check passes: `npm run test:unit` — 341/341
- [x] Test count: 3 new in `rotaService.test.ts`; `rotaServiceVisita.test.ts` retargeted (15 pass)

**Existing tests changed (user-approved retarget):** `rotaService.test.ts` and
`rotaServiceVisita.test.ts` asserted `notificarVisita`; both now assert
`agendarVisita`. Two tests in `rotaServiceVisita.test.ts` covered behaviour this
task deliberately removed — the per-batch campaign cache and the bounded
dispatch pool, which existed only because the send was inline. The pool test was
rewritten to assert every route of a large batch is queued; the cache test was
dropped, since `agendarVisita` takes no cache.

**Status**: ✅ Complete

**Tests**: unit
**Gate**: quick

**Commit**: `refactor(outbox): enqueue notifications instead of sending inline`

---

### T6: `despacharNotificacao` — dispatch by id, returning a verdict

**What**: Split the guards-onward half of `notificarVisita` into a method that loads a row by id and returns `ENVIADO | DISPENSADO | FALHOU_TERMINAL | FALHOU_TRANSITORIO` without deciding retry policy.
**Where**: `service/notificacaoVisitaService.ts` (modify)
**Depends on**: T5
**Reuses**: the entire existing guard → recipient → token → channel body
**Requirement**: AGND-09, AGND-21

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Loads the row by `ID_NOTIFICACAO_VISITA` and runs the existing flow unchanged
- [x] Returns a verdict; persists status only for terminal domain outcomes, never retry state
- [x] Guard outcomes (`DISPENSADO`) and non-transient failures classify as terminal
- [x] An unexpected throw classifies as `FALHOU_TRANSITORIO` so unknown crashes retry rather than silently retiring
- [x] `notificarVisita` still works, now as `agendar` + `despachar`
- [x] `notificarVisita`'s doc comment states it is for tests and the manual console only (AGND-21)
- [x] Gate check passes: `npm run test:unit` — 356/356
- [x] Test count: 15 new in `despacharNotificacao.test.ts`; legacy suite adapted (33 pass)

**Existing tests changed:** `notificacaoVisitaService.test.ts` needed three
kinds of update. (a) Fixtures: dispatch reloads the row and route by id, so the
mocks gained `notifRepo.findOne` and a `RotaPromotor` migration repo. (b) The
enqueued row now carries `AVAILABLE_AT` and `ATTEMPTS`, so the creation
assertion includes them. (c) **Behaviour, per AGND-11**: a `network error` or an
unexpected throw used to persist terminal `FALHOU`; it now leaves the row
`PENDENTE` with the reason recorded, because retiring a notification is the
queue's decision at the ceiling. Three tests were rewritten to assert the new
contract; none were weakened or deleted.

**Status**: ✅ Complete

**Tests**: unit
**Gate**: quick

**Commit**: `refactor(outbox): split despacharNotificacao out of notificarVisita`

---

### T7: `claimBatch` — the atomic claim

**What**: The CTE + `UPDATE … FROM picked` claim with `FOR UPDATE SKIP LOCKED`, returning claimed ids.
**Where**: `service/outboxNotificacaoService.ts` (new)
**Depends on**: T6
**Reuses**: `OutboxService.lockBatchForPublish` (shape); `AppDataSourceSync.query`
**Requirement**: AGND-04, AGND-05, AGND-06, AGND-07, AGND-08, AGND-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Claims only `PENDENTE` + non-null `AVAILABLE_AT` + due + lease-free rows, ordered by `AVAILABLE_AT`, limited by `OUTBOX_VISITA_BATCH_SIZE`
- [x] Sets `LOCKED_AT`, `LOCKED_BY` and increments `ATTEMPTS` in the same statement
- [x] Due-ness and lease expiry use `now()` from the database, never `Date.now()`
- [x] Integration test: two concurrent claims return **disjoint** id sets (AGND-05)
- [x] Integration test: a row with null `AVAILABLE_AT` is never claimed (AGND-13)
- [x] Integration test: a row whose `LOCKED_AT` is older than the lease is re-claimable (AGND-08)
- [x] Test rows hang off real routes with no notification, and only the notifications created here are deleted in `afterAll`
- [x] Gate check passes: unit 356/356 + 14/14 new integration
- [x] Test count: 14 new integration tests pass (no silent deletions)

**Environment finding**: dev has the FK `NOTIFICACAO_VISITA_ID_ROTA_PROMOTOR_fkey`,
which `STATE.md` (2026-08-07) records as removed and which
`scripts/migration-notificacao-visita.sql` does not create. Dev's schema diverges
from the versioned migration, so the tests hang off real routes instead of
inventing `ID_ROTA_PROMOTOR` values.

**Status**: ✅ Complete

**Tests**: integration
**Gate**: full

**Commit**: `feat(outbox): add claimBatch with FOR UPDATE SKIP LOCKED`

---

### T8: Retry classification and backoff

**What**: `computeBackoffMs`, `shouldMarkFailed`, and the transient-vs-terminal map from `ChannelSendResult.reason`.
**Where**: `service/outboxNotificacaoService.ts` (modify)
**Depends on**: T7
**Reuses**: `OutboxService.computeBackoffMs` (verbatim), `shouldMarkFailed` semantics
**Requirement**: AGND-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Ladder is `0 → 15s → 60s → 5m → 15m`, matching the target exactly
- [x] `network error`, `provider error`, `provider rate/quota` classify transient — landed in T6 as `ehFalhaTransitoria`, since the verdict is produced where the channel result is read
- [x] `invalid phone`, `channel not configured` and every guard outcome classify terminal
- [x] `shouldMarkFailed(attempts, transitorio)` returns true when not transient **or** at the ceiling
- [x] Gate check passes: `npm run test:unit` — 374/374
- [x] Test count: 18 new tests pass (no silent deletions)

**Deviation from the design**: the design put the transient/terminal map in this
file. It lives in `notificacaoVisitaService` instead (T6), because that is where
`ChannelSendResult.reason` is read; the queue consumes the resulting verdict via
`acaoDaFila` and never re-reads channel reasons. Same boundary, fewer places that
know the channel's vocabulary.

**Status**: ✅ Complete

**Tests**: unit
**Gate**: quick

**Commit**: `feat(outbox): add retry classification and backoff ladder`

---

### T9: Mark helpers

**What**: `markEnviado`, `markRetry`, `markFalhou` — persist an outcome and release the lease.
**Where**: `service/outboxNotificacaoService.ts` (modify)
**Depends on**: T8
**Reuses**: `finalizar` in `notificacaoVisitaService`; the target's `markPublished`/`markRetry`/`markFailed`
**Requirement**: AGND-10, AGND-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `marcarEnviado` sets `ENVIADO`, `ENVIADO_EM`, `MESSAGE_ID`, `PROVIDER_MESSAGE_ID`, clears `LOCKED_AT`/`LOCKED_BY`
- [x] `marcarRetentativa` keeps `PENDENTE`, clears the lease, writes `ERRO_ENVIO`, pushes `AVAILABLE_AT` by the ladder
- [x] `marcarRetentativa` never rewrites `ATTEMPTS` — the bug not inherited from `OutboxPublisher.ts:116`, asserted by its own test
- [x] `marcarFalhou` sets `FALHOU` with `ERRO_ENVIO` and clears the lease
- [x] Gate check passes: `npm run test:unit` — 383/383
- [x] Test count: 9 new tests pass (no silent deletions)

**Fourth helper added**: `liberarLease`. `DISPENSADO` and terminal `FALHOU` are
already persisted by the dispatch, so the queue must only release the row —
rewriting STATUS there would overwrite the reason the dispatch recorded.

**Status**: ✅ Complete

**Tests**: unit
**Gate**: quick

**Commit**: `feat(outbox): add mark helpers for dispatch outcomes`

---

### T10: `tick` — claim, dispatch, record

**What**: The loop: claim a batch, dispatch each row, route the verdict to the right mark helper, never throw.
**Where**: `service/outboxNotificacaoService.ts` (modify)
**Depends on**: T9
**Reuses**: `T6.despacharNotificacao`; `OutboxPublisher`'s loop structure (minus its attempt-reset bug)
**Requirement**: AGND-12, AGND-14, AGND-15, AGND-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Claims at most `OUTBOX_VISITA_BATCH_SIZE` rows per call (AGND-20)
- [x] Each row is dispatched inside its own try/catch; one bad row never aborts the batch
- [x] A row that throws is treated as transient and retried, with the real attempt count read from the row
- [x] Never throws to its caller (AGND-12) — asserted for a failing claim and a failing mark helper
- [x] Logs claim count and per-row outcome with `ID_NOTIFICACAO_VISITA` + `ID_ROTA_PROMOTOR` (AGND-14)
- [x] Gate check passes: `npm run test:unit` — 396/396
- [x] Test count: 13 new tests pass (no silent deletions)

**Status**: ✅ Complete

**Tests**: unit
**Gate**: quick

**Commit**: `feat(outbox): add tick loop driving claim and dispatch`

---

### T11: Cron registration and its gates

**What**: `node-cron` registration with the `OUTBOX_VISITA_ENABLED` and `NODE_ENV=test` gates, plus the worker id.
**Where**: `schedule/outboxNotificacaoCron.ts` (new)
**Depends on**: T10
**Reuses**: `backend-communities/schedule/crons/OutboxPublisher.ts` structure
**Requirement**: AGND-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Registers on `OUTBOX_VISITA_CRON_EXPRESSION` (default `*/1 * * * *`)
- [x] Does not start unless `OUTBOX_VISITA_ENABLED === '1'` — a test asserts `"true"` does **not** register
- [x] Does not start under `NODE_ENV=test`, regardless of any other value
- [x] Worker id is `outbox-visita-${process.pid}`
- [x] Startup logs the parsed enabled flag, so `=true` cannot fail silently
- [x] Gate check passes: `npm run test:unit` — 405/405
- [x] Test count: 9 new tests pass (no silent deletions)

**Added beyond the design**: a reentrancy guard, so a batch slower than the cron
interval cannot stack ticks on itself. It lives in the registration closure, not
at module level, so it cannot leak between registrations.

**Status**: ✅ Complete

**Tests**: unit
**Gate**: quick

**Commit**: `feat(outbox): add outbox cron module behind env gates`

---

### T12: Register the cron in the API process

**What**: Call `registrarOutboxCron()` during app startup so every running copy becomes a worker.
**Where**: `app.ts` (modify)
**Depends on**: T11
**Reuses**: existing startup sequence in `app.ts`
**Requirement**: AGND-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `registrarOutboxCron()` invoked once at startup, after the data source is initialised
- [ ] Server still boots with the flag unset — registration is a no-op, not a crash
- [ ] Gate check passes: `npx tsc --noEmit && npm test`

**Tests**: none
**Gate**: build

**Commit**: `feat(outbox): register outbox cron on app startup`

---

### T13: Manual outbox console

**What**: `status`, `tick` and `agendar` subcommands for driving the queue by hand.
**Where**: `scripts/outboxConsole.ts` (new)
**Depends on**: T12
**Reuses**: CLI shape of `scripts/db-query.ts`; `OutboxNotificacaoService` directly
**Requirement**: AGND-17, AGND-18, AGND-19

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `status` prints counts by STATUS, rows due now, and the next rows with `AVAILABLE_AT`/`ATTEMPTS`/`LOCKED_BY`/`ERRO_ENVIO`
- [ ] `tick` runs one cycle in the foreground and prints each outcome, ignoring `OUTBOX_VISITA_ENABLED`
- [ ] `agendar --rota ID` / `--notificacao ID` re-arms a row (`AVAILABLE_AT = now()`, lease cleared, terminal → `PENDENTE` with `ATTEMPTS = 0`)
- [ ] `agendar` refuses a `CONFIRMADO` row and explains why (AGND-19)
- [ ] Console worker id is `outbox-visita-cli-${process.pid}`
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: ≥5 new tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(outbox): add manual outbox console`

---

### T14: Configuration surface

**What**: npm scripts for the console and the seven env vars documented in `.env.example`.
**Where**: `package.json` (modify), `.env.example` (modify)
**Depends on**: T13
**Reuses**: the `whatsapp:mock` script convention
**Requirement**: AGND-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `outbox:status`, `outbox:tick`, `outbox:agendar` scripts added
- [ ] All seven variables documented with defaults and the `'1'` convention called out
- [ ] `OUTBOX_VISITA_BATCH_SIZE`'s comment states the worst-case rate `batch × copies` per tick (AGND-20)
- [ ] `OUTBOX_VISITA_ENVIO_IMEDIATO` marked local-only, with its production consequence spelled out
- [ ] Gate check passes: `npx tsc --noEmit && npm test`

**Tests**: none
**Gate**: build

**Commit**: `chore(outbox): add console scripts and document env vars`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1 ------→ T2 ------→ T3
Phase 2:  T4 ------→ T5 ------→ T6
Phase 3:  T7 ------→ T8
Phase 4:  T9 ------→ T10
Phase 5:  T11 -----→ T12 -----→ T13 -----→ T14
```

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: Migration script | 1 file | ✅ Granular |
| T2: Entity columns | 1 file | ✅ Granular |
| T3: `proximoHorarioEnvio` | 1 function | ✅ Granular |
| T4: `agendarVisita` | 1 method | ✅ Granular |
| T5: Route creation enqueues | 1 call site + 1 doc comment | ✅ Granular |
| T6: `despacharNotificacao` | 1 method (extraction) | ✅ Granular |
| T7: `claimBatch` | 1 method | ✅ Granular |
| T8: Classification + backoff | 3 pure functions, same file | ⚠️ Cohesive — OK |
| T9: Mark helpers | 3 methods, same file, same shape | ⚠️ Cohesive — OK |
| T10: `tick` | 1 method | ✅ Granular |
| T11: Cron module | 1 file | ✅ Granular |
| T12: App registration | 1 line | ✅ Granular |
| T13: Console | 1 file (3 subcommands) | ⚠️ Cohesive — OK |
| T14: Config surface | 2 config files | ⚠️ Cohesive — OK |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | (no inbound arrow) | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |
| T12 | T11 | T11 → T12 | ✅ Match |
| T13 | T12 | T12 → T13 | ✅ Match |
| T14 | T13 | T13 → T14 | ✅ Match |

No dependency points at a later phase.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | migration SQL | none | none | ✅ OK |
| T2 | entity | none | none | ✅ OK |
| T3 | utils | unit | unit | ✅ OK |
| T4 | service | unit | unit | ✅ OK |
| T5 | service | unit | unit | ✅ OK |
| T6 | service | unit | unit | ✅ OK |
| T7 | claim SQL / data access | integration | integration | ✅ OK |
| T8 | service | unit | unit | ✅ OK |
| T9 | service | unit | unit | ✅ OK |
| T10 | service | unit | unit | ✅ OK |
| T11 | service wiring (cron module) | unit | unit | ✅ OK |
| T12 | app bootstrap (1 call) | none | none | ✅ OK |
| T13 | scripts / CLI | unit | unit | ✅ OK |
| T14 | config | none | none | ✅ OK |
