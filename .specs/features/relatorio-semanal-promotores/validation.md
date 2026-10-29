# Relatório Semanal de Promotores Validation

## Validation: relatorio-semanal-promotores - FAIL ❌

**Date**: 2026-10-29
**Spec**: `.specs/features/relatorio-semanal-promotores/spec.md`
**Diff range**: `backend-promotor` `9a5ee0d..HEAD` (includes fix commit `dd99b6e`) · `backend-ob-ads` `69a645bb..HEAD`
**Verifier**: independent sub-agent (author ≠ verifier) — **2nd iteration of fix→re-verify (max 3)**

## Validation verdict: FAIL ❌ — both gaps from round 1 (RELPROM-09, RELPROM-27) are genuinely resolved, but a full re-check (including a new discrimination-sensor pass over the fixed code) found 1 new, minor, evidence-only gap: the template half of the RELPROM-09 fix has a surviving mutant. Everything else (39/39 ACs incl. the 2 previously-failing ones, both build gates, 81+23 tests, code quality) is solid.

---

## Task Completion

All 22 tasks (T01–T22) still marked `✅ Complete` in `tasks.md`; the fix commit `dd99b6e` updated T11, T15, T16's "Done when" notes in place (documenting the Verifier fix) without reopening task status. Confirmed against the real diff: `git diff --stat 9a5ee0d..HEAD` / `git diff --stat 69a645bb..HEAD` match exactly the files each task claims to touch — no undisclosed changes.

| Task | Status | Notes |
| --- | --- | --- |
| T01 | ✅ Done | Spike documented in design.md risk table; `scripts/spike-playwright-ec2.ts` present |
| T02–T07 | ✅ Done | backend-ob-ads: guard, 2 services, 2 routes, SQL script — all present, tests pass |
| T08–T09 | ✅ Done | Entity + migration SQL present |
| T10–T11 | ✅ Done | `utils/promotorReportCalculos.ts` — fix commit re-verified (see AC table) |
| T12–T18 | ✅ Done | Integration client, recipients guard, PDF renderer (template fix re-verified), orchestration service (1-campaign test added) |
| T19–T22 | ✅ Done | Cron, wiring, manual route/controller, wiring — unchanged by the fix commit |

---

## Spec-Anchored Acceptance Criteria

Full re-derivation of all 39 RELPROM ACs + edge cases was repeated this round (not just the 2 previously-failing ones). Only rows that changed since round 1, or that needed re-confirmation, are annotated; all others were re-checked against the current `file:line` and are unchanged from round 1's PASS verdict.

### P1: Relatório semanal correto e completo

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| RELPROM-01 | PDF = 1 capa + 1 bloco/campanha, 6 seções nesta ordem | `templates/relatorioPromotor.ts:136-152` (`renderizarBlocoCampanha` concatenates sections in order, now incl. `renderizarDestaques`'s 2 sub-sections) + `__tests__/unit/promotorReportPdfRenderer.test.ts:41-44` | ✅ PASS |
| RELPROM-02–RELPROM-08 | (unchanged logic/tests this round) | `promotorReportCalculos.test.ts` various | ✅ PASS (re-confirmed, no change) |
| **RELPROM-09** | destaques: concluída/cancelada c/ OBS no período, **agrupada por status** (concluída com observação / cancelada com justificativa), sem interpretação | **Calc layer**: `utils/promotorReportCalculos.ts:165-194` — `listarDestaquesDeCampo` now partitions into `concluidas`/`canceladas` arrays during the loop and returns `[...concluidas, ...canceladas]` (fixed; no longer input-order `push`). Proven by **new** test `__tests__/unit/promotorReportCalculos.test.ts:175-187` (`"agrupa por status mesmo com entrada intercalada..."`) which feeds deliberately interleaved input (`CANCELADO, FINALIZADO, CANCELADO, FINALIZADO`) and asserts `destaques.map(d=>d.status)` equals `["concluida","concluida","cancelada","cancelada"]` — this is a real, non-circumventable proof of grouping (re-ran independently, confirmed passing; **mutation-killed**, see Sensor §1). **Template layer**: `templates/relatorioPromotor.ts:110-122` — `renderizarDestaques` now filters into 2 arrays and renders 2 labeled `<h3>`/`<ul>` sub-sections ("Concluídas com observação" / "Canceladas com justificativa"), matching spec wording literally. **However**: no test exercises this template-level split with mixed-status input or asserts items land under the correct heading — `promotorReportPdfRenderer.test.ts`'s fixture has only 1 `destaquesDeCampo` item (status `"cancelada"`), and the integration test (`promotorRelatorio.test.ts`) mocks the renderer entirely (returns a fixed `%PDF-1.4` buffer, never touches real HTML). Confirmed by **new sensor mutation #2 (template swap) SURVIVING** — see Sensor §2. | ⚠️ **PASS (behavior) / Sensor gap (test coverage)** — see Fix 3 below |
| RELPROM-10–RELPROM-13 | (unchanged) | `promotorReportCalculos.test.ts` / `promotorReportServiceEnvio.test.ts` | ✅ PASS (re-confirmed) |
| RELPROM-26 | 2+ campanhas ativas → 1 bloco/campanha, sem agregar | `promotorReportService.test.ts` (2-campaign case, now at different line numbers after the 1-campaign test was inserted above it) + `promotorReportPdfRenderer.test.ts:64-76` | ✅ PASS |
| **RELPROM-27** | exatamente 1 campanha ativa → bloco único, identificado pelo nome | **Fixed**: new dedicated test `__tests__/unit/promotorReportService.test.ts:29-40` (`"cliente com exatamente 1 campanha ativa monta 1 unico bloco..."`) mocks exactly 1 active campaign row and asserts `resultado.campanhas` has length 1, `idCampanha === 1`, `nomeCampanha === "Campanha Unica"` — direct `file:line` citation now exists, closing the evidence-or-zero gap. Re-ran independently: passes (`√ cliente com exatamente 1 campanha ativa monta 1 unico bloco...`). | ✅ PASS |
| RELPROM-28–RELPROM-31 | (unchanged) | `promotorReportRecipients.test.ts` | ✅ PASS (re-confirmed) |

### P2 / P3 / P4 / Edge Cases

No code in these layers was touched by the fix commit (`git diff --stat` for `dd99b6e` shows only `tasks.md`, 2 test files, `templates/relatorioPromotor.ts`, `utils/promotorReportCalculos.ts`). Re-ran the full corresponding test files this round (see Gate Check) — all still pass with the same assertions cited in round 1's report (RELPROM-14 through RELPROM-39, RELPROM-23/24/25, and the 3 uncategorized edge cases). No regressions found; no re-litigation needed since the underlying code and tests are byte-identical to round 1's evidence except where noted above.

**Status**: ✅ 39/39 ACs behaviorally met · ⚠️ 1 evidence/discrimination gap remains on RELPROM-09's template half (code is correct; test coverage for that specific layer is not)

---

## Discrimination Sensor

Scratch isolation: `git worktree add --detach ../scratch-verify-promotor2 HEAD` in `backend-promotor` (node_modules linked via `mklink /J` junction, not copied). No `git stash` used.

- Baseline `git status --porcelain` (backend-promotor, before sensor work): `M .specs/LESSONS.md`, `M .specs/lessons.json`, `?? .specs/features/relatorio-semanal-promotores/validation.md` (pre-existing from this validation session itself).
- Post-cleanup `git status --porcelain`: identical to baseline. `git worktree list` shows only the main worktree after `git worktree remove --force`.

This round's sensor deliberately targets the code the fix commit changed (per task instruction), since that's the highest-risk new surface this iteration:

| # | File:line (scratch) | Description | Killed? |
| --- | --- | --- | --- |
| 1 | `utils/promotorReportCalculos.ts:194` | `listarDestaquesDeCampo`: swapped group order `[...concluidas, ...canceladas]` → `[...canceladas, ...concluidas]` (still "grouped", but violates the spec's literal section order: concluídas before canceladas) | ✅ Killed — new RELPROM-09 test fails: `Expected ["concluida","concluida","cancelada","cancelada"], Received ["cancelada","cancelada","concluida","concluida"]` |
| 2 | `templates/relatorioPromotor.ts:112-113` | `renderizarDestaques`: swapped which filter feeds which labeled sub-section (`concluidas` variable now holds items with `status==="cancelada"` and vice versa) — a status-grouping bug that would put cancelled visits under the "Concluídas com observação" heading in the actual PDF | ❌ **SURVIVED** — `promotorReportPdfRenderer.test.ts` (5/5 still pass) and `promotorReportService*.test.ts` never inspect rendered HTML section content; `promotorRelatorio.test.ts` (integration) mocks the renderer entirely. No test in scope exercises `renderizarDestaques`'s label-to-content mapping. → **Fix task created (Fix 3)** |

Previously-killed mutations from round 1 (unchanged code this round, not re-executed since the fix commit didn't touch these files/lines — listed for continuity, still valid evidence):

| # | File:line | Description | Killed? |
| --- | --- | --- | --- |
| 3 | `utils/promotorReportCalculos.ts` (period boundary, `dentroDoPeriodo`) | Upper bound `<=` → `<` (breaks RELPROM-25 inclusive boundary) | ✅ Killed (round 1) |
| 4 | `utils/promotorReportCalculos.ts` (`calcularAssertividade`) | `return "N/A"` → `return 0` for zero-denominator case | ✅ Killed (round 1) |
| 5 | `service/promotorReportService.ts` (`processarRelatorioCliente` catch) | Re-throw instead of isolating failure (removes RELPROM-17 isolation) | ✅ Killed (round 1) |

**Sensor depth**: lightweight (2 new mutations this round + 3 carried-forward from round 1, default tier)
**Result this round**: 1/2 new mutations killed, **1 survived** → sensor is not fully discriminating for the template half of the RELPROM-09 fix → **FAIL**

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ — fix commit only touches what's needed to close the 2 reported gaps (plus the 2 test files and tasks.md notes) |
| Surgical changes | ✅ — `git diff --stat dd99b6e` = 5 files, all directly implicated by the gaps |
| No scope creep | ✅ — no unrelated refactors in the fix commit |
| Matches patterns | ✅ — partition-then-concatenate mirrors the rest of the file's pure-function style; template split mirrors existing `<section>`/`<ul>` conventions |
| Spec-anchored outcome check (asserted values match spec) | ⚠️ — RELPROM-09 calc layer fully proven; template layer not directly proven (Sensor gap) |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ for calc/service layers; ⚠️ template-rendering layer has a documented coverage hole for this one function |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — both new tests cite RELPROM-09 / RELPROM-27 in their names |
| Documented guidelines followed: none found in either repo (confirmed no `AGENTS.md`/`CONTRIBUTING.md`) — strong defaults applied | ✅ |

---

## Edge Cases

- [x] RELPROM-23 (ob-ads indisponível → isolamento por cliente): unchanged, re-confirmed
- [x] RELPROM-24 (OBS > 500 chars trunca): unchanged, re-confirmed
- [x] RELPROM-25 (corte superior inclusivo): unchanged, re-confirmed, mutation-killed (carried forward)
- [x] Promotor sem movimentação mas com rota aberta: unchanged, re-confirmed
- [x] E-mail inválido na lista de teste: unchanged, re-confirmed
- [x] `NODE_ENV` indefinido: unchanged, re-confirmed

---

## Gate Check

- **Gate command (backend-promotor)**: `npx tsc --noEmit` — 0 errors in feature files; same 2 pre-existing, unrelated errors in `__tests__/unit/segmentacaoCampanhaPromotor.test.ts` (missing `utils/migrationRepository`/`helpers/mockMigrationRepo`), confirmed still present and still out of scope
- **Gate command (backend-ob-ads)**: `npx tsc --noEmit` — 0 errors
- **Jest (backend-promotor)**, each file re-run individually with `--runInBand` (test-memory constraint):
  - `__tests__/unit/promotorReportCalculos.test.ts` — **24 passed** (was 23 in round 1; +1 new RELPROM-09 test)
  - `__tests__/unit/promotorReportService.test.ts` — **6 passed** (was 5; +1 new RELPROM-27 test)
  - `__tests__/unit/promotorReportServiceEnvio.test.ts` — 9 passed
  - `__tests__/unit/promotorReportServiceLote.test.ts` — 4 passed
  - `__tests__/unit/promotorReportRecipients.test.ts` — 6 passed
  - `__tests__/unit/obAdsIntegrationClient.test.ts` — 10 passed
  - `__tests__/unit/promotorReportPdfRenderer.test.ts` — 5 passed
  - `__tests__/unit/promotorRelatorioCron.test.ts` — 7 passed
  - `__tests__/integration/promotorRelatorio.test.ts` — 12 passed
  - **Total**: 83 passed, 0 failed, 0 skipped (was 81 in round 1; +2 net new tests from the fix)
- **Jest (backend-ob-ads)** (unchanged by this fix, re-run to confirm no regression):
  - `src/tests/internalApiKeyGuard.test.ts` — 4 passed
  - `src/tests/moduloClientesService.test.ts` — 4 passed
  - `src/tests/adminResolverService.test.ts` — 4 passed
  - `src/tests/internalModulosRoutes.test.ts` — 6 passed
  - `src/tests/internalEmailRoutes.test.ts` — 5 passed
  - **Total**: 23 passed, 0 failed, 0 skipped
- **Test count before this fix commit**: 81 (backend-promotor) + 23 (backend-ob-ads) = 104
- **Test count after this fix commit**: 83 + 23 = 106
- **Delta**: +2 new tests (both directly closing round-1 gaps — no test deleted or weakened)
- **Skipped tests**: none
- **Failures**: none (production-tree runs); mutation #1 and #2 runs on scratch behaved as expected (#1 failed as intended = killed; #2 did NOT fail = survived, see Sensor)

---

## Fix Plans

### Fix 3: RELPROM-09 (template layer) — surviving mutant, no test proves label-to-content mapping

- **Root cause**: `renderizarDestaques` in `templates/relatorioPromotor.ts:110-122` correctly filters `destaquesDeCampo` into `concluidas`/`canceladas` and renders them under 2 distinct `<h3>` headings — but no test feeds mixed-status input through the renderer and asserts each item appears under its correct heading. `promotorReportPdfRenderer.test.ts`'s only `destaquesDeCampo` fixture has a single `"cancelada"` item; the integration test mocks the renderer entirely. A mutation that swaps which filter feeds which heading (verified this round) survives with 0 test failures, meaning a future refactor could silently mislabel which visits are "concluídas" vs "canceladas" in the actual PDF without any test catching it.
- **Fix task**: In `__tests__/unit/promotorReportPdfRenderer.test.ts`, extend the `DADOS` fixture (or add a new test) with `destaquesDeCampo` containing both a `"concluida"` and a `"cancelada"` item with distinguishable `obs` text; assert the rendered HTML places the `"concluida"` item's text after the "Concluídas com observação" heading and before "Canceladas com justificativa", and the `"cancelada"` item's text after the latter heading (e.g., via substring-index comparison on the HTML string, or a lightweight HTML-section split).
- **Priority**: Minor (current behavior is correct; this closes a regression-detection gap, not a live bug).

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| RELPROM-01 through RELPROM-39 (all 39) | ⚠️ 37 Verified / 1 Needs Fix / 1 Needs test (round 1) | ✅ Verified (all 39, behaviorally) — RELPROM-09's template-rendering layer flagged with an open test-coverage gap (Fix 3), tracked separately from AC correctness |

---

## Summary

**Overall**: ⚠️ Issues (1 new, minor, evidence-only gap found this round)

**Spec-anchored check**: 39/39 ACs matched spec outcome with direct evidence, including the 2 previously-failing ones (RELPROM-09, RELPROM-27), now closed
**Sensor**: 1/2 new mutations killed (1 survived — template layer); 3/3 round-1 mutations remain valid (unchanged code)
**Gate**: 106 passed (83 backend-promotor + 23 backend-ob-ads), 0 failed, 0 skipped; `tsc --noEmit` clean in both repos (2 pre-existing, unrelated errors in backend-promotor, unchanged from round 1)

**What works**: Both round-1 gaps are genuinely fixed, not papered over — RELPROM-09's calculation layer now has a test that actually proves grouping (interleaved input, exact expected order), and RELPROM-27 has a direct, dedicated test for the 1-campaign case. A full re-check of all 39 ACs plus edge cases found no regressions anywhere else in either repo; both build gates are clean and all 106 tests pass. The fix commit is surgical (5 files, all directly implicated).

**Issues found**:
1. (New, this round) RELPROM-09's template-rendering fix (`templates/relatorioPromotor.ts`'s `renderizarDestaques`) is behaviorally correct but has no test proving the grouping is rendered correctly into the right labeled section — confirmed by a surviving sensor mutation. See Fix 3.

**Next steps**: Route Fix 3 back to an implementer (small, single-file test addition); re-verify afterward. This is iteration 2 of the fix→re-verify cycle (max 3) — 1 more iteration is available if needed. Nothing here blocks the feature from functioning correctly in production today; this is purely about closing a regression-detection blind spot before calling the feature done.
