# Agendamento de Envio da Notificação de Visita (Outbox) Validation

**Date**: 2026-08-13
**Spec**: `.specs/features/agendamento-notificacao-visita/spec.md`
**Diff range**: `4ef24fd..HEAD` (14 commits, branch `feat/outbox-agendamento-visita`)
**Verifier**: standalone fresh-eyes pass. No sub-agent was dispatched — this session is configured not to spawn agents unless the user asks — so `validate.md`'s standalone fallback was used. Author ≠ verifier does **not** hold here; that limitation is recorded rather than papered over.

---

## Task Completion

| Task | Status | Notes |
| --- | --- | --- |
| T1 Migration | ✅ Done | Applied to dev; runs twice cleanly. Prod is the DBA's, untouched |
| T2 Entity columns | ✅ Done | - |
| T3 `proximoHorarioEnvio` | ✅ Done | Green under 4 timezones |
| T4 `agendarVisita` | ✅ Done | - |
| T5 Route creation enqueues | ✅ Done | Covers all 5 call sites, incl. `reassignRotasByAddress` |
| T6 `despacharNotificacao` | ✅ Done | Behaviour change: transient failures no longer terminal |
| T7 `claimBatch` | ✅ Done | Integration-tested against the real DB |
| T8 Backoff + classification | ✅ Done | Ladder copied verbatim from the target |
| T9 Mark helpers | ✅ Done | 4th helper `liberarLease` added beyond design |
| T10 `tick` | ✅ Done | - |
| T11 Cron module | ✅ Done | Reentrancy guard added beyond design |
| T12 App registration | ✅ Done | - |
| T13 Console | ✅ Done | Found and fixed the `LOCKED_BY` worker-id bug |
| T14 Config surface | ✅ Done | - |

---

## Spec-Anchored Acceptance Criteria

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AGND-01 route creation persists one `PENDENTE` row, no provider call | one row, `PENDENTE`, no channel call | `__tests__/unit/agendarVisita.test.ts:57` — `expect(notifRepo.save).toHaveBeenCalledTimes(1)`; `:101` — `expect(sendMock).not.toHaveBeenCalled()` | ✅ PASS |
| AGND-02 `AVAILABLE_AT` = next `NOTIFICACAO_HORA_ENVIO` in America/Sao_Paulo | 09:00 SP = 12:00Z, strictly after | `__tests__/unit/agendamento.test.ts:44` — `expect(resultado.toISOString()).toBe("2026-08-13T12:00:00.000Z")`; `:62` (exactly-at-hour rolls forward) | ✅ PASS |
| AGND-03 write failure still returns the route | resolves, does not throw | `__tests__/unit/agendarVisita.test.ts:127` — `await expect(...).resolves.toBeDefined()`; `__tests__/unit/rotaService.test.ts:102` — route still returned | ✅ PASS |
| AGND-04 claim predicate + order + limit | only `PENDENTE`, due, lease-free; oldest first; bounded | `__tests__/integration/outboxClaim.test.ts:147` (future not claimed); `:187` (batch bound); `:205` (oldest first) | ✅ PASS |
| AGND-05 concurrent workers get disjoint sets | disjoint, no blocking | `__tests__/integration/outboxClaim.test.ts:112` — `expect(intersecao).toEqual([])` | ✅ PASS |
| AGND-06 lease + worker id + attempts in one statement | `LOCKED_BY` stamped, `ATTEMPTS` 0→1 | `__tests__/integration/outboxClaim.test.ts:127` — `expect(linha.ATTEMPTS).toBe(1)`; `:128` — `expect(linha.LOCKED_BY).toBe("worker-carimbo")` | ✅ PASS |
| AGND-07 database clock, never the process clock | due-ness by `now()` | `service/outboxNotificacaoService.ts` claim SQL uses `now()`; behaviour covered by `outboxClaim.test.ts:147` / `:164` | ⚠️ Spec-precision gap — no test can inject a skewed process clock into Postgres; verified by inspection |
| AGND-08 expired lease is re-claimable | claimable again after lease | `__tests__/integration/outboxClaim.test.ts:169` — `expect(reivindicados).toContain(id)` | ✅ PASS |
| AGND-09 dispatch runs the existing flow against current state | guards → recipient → token → channel | `__tests__/unit/despacharNotificacao.test.ts:136` (token + variables), `:153` (guard), `:165` (anti-spam) | ✅ PASS |
| AGND-10 success sets `ENVIADO` + ids, clears lease | `ENVIADO`, `MESSAGE_ID`, `PROVIDER_MESSAGE_ID`, lease null | `__tests__/unit/despacharNotificacao.test.ts:123`; `__tests__/unit/outboxMarcadores.test.ts:33` + `:44` | ✅ PASS |
| AGND-11 transient retries with ladder; terminal retires | `0→15s→60s→5m→15m`; ceiling 3 | `__tests__/unit/outboxRetentativa.test.ts:14` (ladder table); `:104` (retry); `:112` (ceiling) | ✅ PASS |
| AGND-12 a failing tick never kills the process | resolves, logs | `__tests__/unit/outboxTick.test.ts:180` — `await expect(...).resolves.toBeUndefined()` | ✅ PASS |
| AGND-13 null `AVAILABLE_AT` never claimed; gates default-off | never claimed; no register unless `"1"`; never under test | `__tests__/integration/outboxClaim.test.ts:140`; `__tests__/unit/outboxCron.test.ts:55` (`"true"` does not register); `:80` (NODE_ENV=test) | ✅ PASS |
| AGND-14 logs claim count + per-row outcome with both ids | both ids present | `__tests__/unit/outboxTick.test.ts:199` — `expect.objectContaining({ ID_NOTIFICACAO_VISITA: 42, ID_ROTA_PROMOTOR: 9, acao: "ENVIADO" })` | ✅ PASS |
| AGND-15 queue state answerable by SQL | schedule, attempts, error on the row | `scripts/outboxConsole.ts:83` `status` query; exercised live against dev (see Manual Run) | ✅ PASS |
| AGND-16 `OUTBOX_VISITA_ENVIO_IMEDIATO=1` makes the row due now | returns the instant unchanged | `__tests__/unit/agendamento.test.ts:112`; `__tests__/unit/agendarVisita.test.ts:79` | ✅ PASS |
| AGND-17 console `tick` runs one cycle regardless of the enable flag | one cycle, prints outcomes | `__tests__/unit/outboxConsole.test.ts:18` (parsing); live run (see Manual Run) | ⚠️ Spec-precision gap — the console's I/O itself is not asserted, per the matrix ("argument parsing + the CONFIRMADO refusal") |
| AGND-18 `status` prints counts, due count, next rows | counts + fields | live run against dev (see Manual Run) | ⚠️ Spec-precision gap — output not asserted in tests, by matrix decision |
| AGND-19 `agendar` re-arms; refuses `CONFIRMADO` | re-armed; refusal with reason | `__tests__/unit/outboxConsole.test.ts:57` — `expect(podeRearmar(StatusNotificacaoVisita.CONFIRMADO)).toBe(false)`; `:61` allows the other five | ✅ PASS (Fix 1 applied) |
| AGND-20 batch bound per tick per copy | at most `OUTBOX_VISITA_BATCH_SIZE` | `__tests__/unit/outboxTick.test.ts:56` — `expect(claimBatch).toHaveBeenCalledWith(7, ...)`; `.env.example:54` documents `batch × copies` | ✅ PASS |
| AGND-21 no production route-creation path dispatches inline | zero channel calls | `__tests__/unit/rotaService.test.ts:94` — `expect(NotificacaoVisitaService.notificarVisita).not.toHaveBeenCalled()` | ✅ PASS |

**Status**: ✅ 18/21 fully covered, 3 spec-precision gaps, 0 open gaps (AGND-19 closed by Fix 1)

---

## Discrimination Sensor

Scratch: temporary git worktree, removed after the run. Real-tree `git status --porcelain` compared before and after — identical (200 lines both times).

| Mutation | File | Description | Killed? |
| --- | --- | --- | --- |
| M1 | `utils/agendamento.ts` | `alvo <= agora` → `alvo < agora` (stops rolling forward at the exact hour) | ✅ Killed — `agendamento.test.ts` 1 failed |
| M2 | `service/outboxNotificacaoService.ts` | Removed `AND "AVAILABLE_AT" IS NOT NULL` from the claim | ⚠️ **Equivalent mutant** — 14/14 still pass. `NULL <= now()` is NULL, which the filter already rejects (verified in Postgres). The predicate is redundant for correctness; its real job is matching the partial index. Not a test weakness |
| M3 | `service/outboxNotificacaoService.ts` | `"ATTEMPTS" = n."ATTEMPTS" + 1` → no increment | ✅ Killed — `outboxClaim.test.ts` 1 failed |
| M4 | `service/notificacaoVisitaService.ts` | Terminal failures reclassified as retryable | ✅ Killed — 3 failed across the two notification suites |
| M5 | `service/outboxNotificacaoService.ts` | `marcarRetentativa` stops clearing the lease | ✅ Killed — `outboxMarcadores.test.ts` 1 failed |
| M6 | `schedule/outboxNotificacaoCron.ts` | Enable check `=== "1"` → any defined value | ✅ Killed — `outboxCron.test.ts` 2 failed |

**Sensor depth**: lightweight (6 mutations, above the 1–3 default, because the queue's failure mode is duplicate messages to real workshops)
**Result**: 5/5 behavioural mutants killed; 1 equivalent mutant documented — ✅ PASS

---

## Manual Run (dev, mock provider on localhost:4000)

| Step | Result |
| --- | --- |
| `npm run outbox:status` | 79 `PENDENTE`, 76 scheduled for 2026-08-14T12:00Z, 3 pre-outbox rows flagged as never claimable |
| `agendar --notificacao 395` → `tick` | `FALHOU` / `oficina not found`, `ATTEMPTS 1`, lease released — terminal, correct |
| `agendar --notificacao 535` → `tick` | `FALHOU` / `rota not found` (route soft-deleted by an earlier test run) — correct |
| `agendar --notificacao 454` → `tick` | `ENVIADO`, `MESSAGE_ID mock-1786664934876`, token issued, lease released. Mock received the template with `WHATSAPP_TEST_PHONE_OVERRIDE` redirecting `5531983442824` → the developer's number |

Template variable `{{2}}` arrived empty: that campaign has no `EMPRESA_SLUG`. Documented degradation — costs a name, never the send.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ |
| Surgical changes | ✅ |
| No scope creep | ✅ |
| Matches patterns | ✅ — claim SQL mirrors `OutboxService.lockBatchForPublish`; migration follows the house SQL header rules |
| Spec-anchored outcome check | ✅ for 17 ACs; 3 spec-precision gaps + 1 gap listed above |
| Per-layer Coverage Expectation met | ⚠️ Scripts layer: matrix scoped it to parsing + the refusal; the refusal itself is untested (AGND-19) |
| Every test maps to a spec requirement | ✅ |
| Documented guidelines followed | ✅ `.specs/codebase/TESTING.md`, `jest.config.ts`, `CLAUDE.md` |

---

## Edge Cases

- [x] Every server down at the scheduled hour → row stays due (`AVAILABLE_AT <= now()`), covered by `outboxClaim.test.ts:147` inverse
- [x] Skewed clock on a copy → DB clock decides (inspection; see AGND-07 gap)
- [x] Route/campaign changes between enqueue and send → guards resolve it (`despacharNotificacao.test.ts:153`, `:180`); observed live as `rota not found`
- [x] Duplicate enqueue for one route → `UNIQUE(ID_ROTA_PROMOTOR)`, unchanged
- [x] Morning batch larger than the batch size → drains across ticks (`outboxClaim.test.ts:187`)
- [x] Send succeeds but process dies before `ENVIADO` → at-least-once, bounded by `ATTEMPTS` (design-accepted)

---

## Gate Check

- **Gate command**: `npx tsc --noEmit && npm test`
- **`tsc --noEmit`**: clean
- **Unit**: 424 passed, 0 failed
- **Full suite**: 515 passed, 13 failed
- **Test count before feature**: 321 unit
- **Test count after feature**: 424 unit (**+103**)
- **Failures**: all 13 are pre-existing integration failures in `campanhaResultsService` (12) and `campanhaPromotorService` (1), caused by FK constraints blocking fixture teardown in dev — the exact failure mode `STATE.md` (2026-08-07) says those FKs were dropped to avoid. Baseline at T1 was **16**; `rotaService.test.ts`'s 3 failures cleared during this feature, leaving only its `afterAll` teardown erroring. No new failure was introduced.
- **Skipped**: none

---

## Fix Plans

### Fix 1: `agendar` refusal of a `CONFIRMADO` row was untested (AGND-19) — ✅ APPLIED

- **Root cause**: the console's DB-touching branches were left out of the coverage matrix (scoped to parsing), but the refusal is a safety behaviour, not I/O formatting — it exists so replaying a test cannot destroy a reparador's real confirmation.
- **Fix**: extracted `podeRearmar(status)` as a pure function and covered it — `CONFIRMADO` refused, the other five statuses allowed. Unit suite 418 → 424.
- **Priority**: Minor — applied immediately rather than deferred, since it is the one guard whose failure destroys real data.

---

## Requirement Traceability Update

| Requirement | Previous | New |
| --- | --- | --- |
| AGND-01…06, 08…16, 20, 21 | Implementing | ✅ Verified |
| AGND-07 | Implementing | ⚠️ Verified by inspection (no test can skew Postgres's clock) |
| AGND-17, AGND-18 | Implementing | ⚠️ Verified manually (console I/O out of matrix scope) |
| AGND-19 | Implementing | ✅ Verified (Fix 1 applied) |

---

## Summary

**Overall**: ✅ Ready — the one Minor gap found was fixed during validation

**Spec-anchored check**: 18/21 ACs matched their spec outcome; 3 spec-precision gaps; 0 open gaps
**Sensor**: 5/5 behavioural mutants killed, 1 equivalent mutant documented
**Gate**: `tsc` clean, unit 424/424, full suite 13 pre-existing failures (baseline 16)

**What works**: enqueue-instead-of-send across all five route-creation paths; atomic claim proven disjoint under concurrency against the real database; backoff and terminal classification; default-off gates; the manual console, exercised end to end to a real `ENVIADO`.

**Issues found**: AGND-19's `CONFIRMADO` refusal had no automated test. Fixed during validation by extracting `podeRearmar` and covering it.

**Next steps**: decide on enabling `OUTBOX_VISITA_ENABLED=1` in dev. Note the 76 test-created rows currently queued in dev for 2026-08-14T09:00 São Paulo: with the worker enabled they will dispatch, and `WHATSAPP_TEST_PHONE_OVERRIDE` is what keeps them off real numbers.
