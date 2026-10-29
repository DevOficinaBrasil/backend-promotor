# Relatório Semanal de Promotores Validation

## Validation: relatorio-semanal-promotores - PASS ✅

**Date**: 2026-10-29 (original 3-iteration round) — **updated 2026-10-29, Phase 6 addendum below**
**Spec**: `.specs/features/relatorio-semanal-promotores/spec.md`
**Diff range**: `backend-promotor` `9a5ee0d..HEAD` (34 files changed, includes all 3 fix commits: `dd99b6e`, `b0a033a`, plus the earlier round-2 evidence baseline) · `backend-ob-ads` `69a645bb..HEAD` (6 files changed) — **plus Phase 6**: `backend-promotor` `72e8df5..HEAD` (4 commits, 11 files) · `backend-ob-ads` `0ed7be63..HEAD` (2 commits, 5 files). See "Phase 6 — AD-006 / SKF-only (pós-Execute)" section at the end of this report for the focused delta verification.
**Verifier**: independent sub-agent (author ≠ verifier) — **3rd and final iteration of fix→re-verify (max 3) for the original 39 RELPROM; separate focused verification pass for Phase 6 (RELPROM-40..43)**

## Validation verdict: PASS ✅ — the single gap carried from round 2 (RELPROM-09 template-layer surviving mutant) is now closed. The fix commit `b0a033a` ("testa posicao correta dos destaques mistos") added exactly 1 new test to `__tests__/unit/promotorReportPdfRenderer.test.ts` and touched no production code. I independently re-injected the exact mutation that survived in round 2 (swap which filter feeds which `<h3>`) on a safe in-place/revert basis and confirmed it now fails the test suite (mutant killed). All 39 RELPROM ACs + edge cases re-derived against spec-defined outcomes, both build gates clean, 107 tests pass (84 backend-promotor + 23 backend-ob-ads), 0 failed, 0 skipped. **Phase 6 (AD-006 / SKF-only, verified separately below) adds RELPROM-40..43, all covered, 0 gaps, overall verdict remains PASS.**

---

## Environment Sanity (pre-flight, per task instructions)

- `backend-promotor`: `ls node_modules | wc -l` → **524** top-level entries (scoped namespaces like `@types`, `@babel` count as 1 folder each, so this is not directly comparable to npm's own "933 packages" install summary from the earlier `npm ci` recovery — that count includes nested/transitive packages). Confirmed healthy via `npm ls --depth=0` (exit 0, 63 top-level deps, **zero** `UNMET`/`missing`/`invalid`/`extraneous` entries) and via a full passing run of all 9 feature test files (84/84 passed) plus `npx tsc --noEmit`.
- `backend-ob-ads`: `ls node_modules | wc -l` → **626**, `npm ls --depth=0` clean (exit 0, no unmet/missing/invalid), all 5 feature test files pass (23/23).
- `git status --porcelain` was clean in `backend-promotor` before any sensor work.
- **No junction/symlink was used anywhere in this validation run.** The discrimination sensor mutation was applied directly to the tracked file in the main worktree (not a separate scratch worktree), run, confirmed, then reverted via `Edit` back to the original content — this avoids the node_modules/junction class of incident entirely, per the explicit safety instruction for this round.
- Post-sensor sanity: `git status --porcelain` in `backend-promotor` is empty again (matches the pre-sensor baseline), `ls node_modules | wc -l` unchanged at 524, and the mutated test file was re-run and confirmed passing again after the revert (6/6). `backend-ob-ads` was not touched by the sensor; its `node_modules` count (626) and `git status` (clean) are unchanged.
- **Conclusion: no new node_modules incident occurred this round. Both repos' environments are healthy.**

---

## Task Completion

All 22 tasks (T01–T22) remain `✅ Complete` in `tasks.md`. The round-3 fix commit `b0a033a` only updated T15's "Done when" note (documenting the round-2 Verifier fix) and added the new test — it did not reopen any task status. `git diff --stat dd99b6e..HEAD` confirms the commit touches only: `.specs/LESSONS.md`, `.specs/lessons.json`, `tasks.md`, `validation.md`, and `__tests__/unit/promotorReportPdfRenderer.test.ts` (31 lines added) — **no production code changed**, consistent with the nature of the gap (test-coverage hole, not a behavior bug).

| Task | Status | Notes |
| --- | --- | --- |
| T01 | ✅ Done | Spike documented in design.md risk table |
| T02–T07 | ✅ Done | backend-ob-ads: guard, 2 services, 2 routes, SQL script — all present, tests pass (23/23 re-run this round) |
| T08–T09 | ✅ Done | Entity + migration SQL present, unchanged |
| T10–T11 | ✅ Done | `utils/promotorReportCalculos.ts` — unchanged since round 2, re-confirmed (24 tests pass) |
| T12–T18 | ✅ Done | Integration client, recipients guard, PDF renderer (**template test gap now closed**), orchestration service — unchanged production code since round 2 |
| T19–T22 | ✅ Done | Cron, wiring, manual route/controller, wiring — unchanged |

---

## Spec-Anchored Acceptance Criteria

Full re-derivation of all 39 RELPROM ACs was performed. Since round 3's fix touched only a test file (no production code change), the outcomes for 38/39 ACs are byte-identical to round 2's independently-verified evidence; only RELPROM-09 changed status (sensor gap → fully closed). All citations below were re-confirmed by direct file read and/or re-run this round.

### P1: Relatório semanal correto e completo

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| RELPROM-01 | PDF = 1 capa + 1 bloco/campanha, 6 seções nesta ordem | `templates/relatorioPromotor.ts:140-152` (`renderizarBlocoCampanha` concatenates visão geral → assertividade → por promotor → cancelamentos → destaques → próximos passos) + `__tests__/unit/promotorReportPdfRenderer.test.ts:41-44` (`expect(resultado.subarray(0,5)...).toBe("%PDF-")`) | ✅ PASS |
| RELPROM-02 | concluídas = `FINALIZADO` com `DONE_AT` no período, por campanha | `__tests__/unit/promotorReportCalculos.test.ts:34` — `expect(resultado.concluidas).toBe(...)` | ✅ PASS |
| RELPROM-03 | canceladas = `CANCELADO` com data de cancelamento no período | `__tests__/unit/promotorReportCalculos.test.ts:45` | ✅ PASS |
| RELPROM-04 | abertas na rota = `BACKLOG`/`A_CAMINHO`, exclui `AGUARDANDO`, foto atual | `__tests__/unit/promotorReportCalculos.test.ts:55` | ✅ PASS |
| RELPROM-05 | assertividade = concluídas/(concluídas+canceladas), % arredondado | `__tests__/unit/promotorReportCalculos.test.ts:85` | ✅ PASS |
| RELPROM-06 | denominador 0 → "N/A" | `__tests__/unit/promotorReportCalculos.test.ts:89` — `expect(resultado).toBe("N/A")` | ✅ PASS |
| RELPROM-07 | tabela por promotor inclui linhas zeradas | `__tests__/unit/promotorReportCalculos.test.ts:103` + "inclui promotor com tudo zerado, sem omitir a linha" (same block) | ✅ PASS |
| RELPROM-08 | cancelamentos listados com promotor/oficina/cidade/OBS | `__tests__/unit/promotorReportCalculos.test.ts:131` | ✅ PASS |
| **RELPROM-09** | destaques: concluída/cancelada c/ OBS, **agrupada por status**, sem interpretação | **Calc layer**: `utils/promotorReportCalculos.ts` `listarDestaquesDeCampo` (partition-then-concat) — `__tests__/unit/promotorReportCalculos.test.ts:161,175` (interleaved-input test, exact expected order). **Template layer**: `templates/relatorioPromotor.ts:111-124` `renderizarDestaques` (2 filtered arrays → 2 labeled `<h3>`/`<ul>`) — **now proven** by `__tests__/unit/promotorReportPdfRenderer.test.ts:78-107` ("coloca cada destaque sob o h3 correto, mesmo com status misto"), which feeds 1 `"concluida"` + 1 `"cancelada"` item with distinguishable `obs` text and asserts, via substring-index comparison on the rendered HTML, that each item's text falls strictly between the correct pair of headings. **Independently re-confirmed this round**: injecting the exact round-2 surviving mutation (swap which filter feeds which heading) now fails this test (see Sensor §1) — the gap is closed, not just claimed closed. | ✅ PASS (fully closed, calc + template both proven) |
| RELPROM-10 | próximos passos: abertas/canceladas a redistribuir/promotores sem registro | `__tests__/unit/promotorReportCalculos.test.ts:239` | ✅ PASS |
| RELPROM-11 | e-mail enviado a todos `IS_ADMIN=1` do cliente | `__tests__/unit/promotorReportServiceEnvio.test.ts:59` | ✅ PASS |
| RELPROM-12 | nenhum admin resolvido → não envia, registra falha | `__tests__/unit/promotorReportServiceEnvio.test.ts:91` | ✅ PASS |
| RELPROM-13 | sem visitas no período → gera normalmente, contadores zero | `__tests__/unit/promotorReportCalculos.test.ts:79` ("retorna tudo zerado para lista vazia") | ✅ PASS |
| RELPROM-26 | 2+ campanhas ativas → 1 bloco/campanha, sem agregar | `__tests__/unit/promotorReportService.test.ts:41` + `promotorReportPdfRenderer.test.ts:64-76` | ✅ PASS |
| RELPROM-27 | exatamente 1 campanha ativa → bloco único | `__tests__/unit/promotorReportService.test.ts:29` ("cliente com exatamente 1 campanha ativa monta 1 unico bloco...") | ✅ PASS |
| RELPROM-28 | fora de produção → só lista fixa de teste, nunca admins reais | `__tests__/unit/promotorReportRecipients.test.ts:18` | ✅ PASS |
| RELPROM-29 | fora de produção → loga quem seriam os admins reais | `__tests__/unit/promotorReportRecipients.test.ts:27` | ✅ PASS |
| RELPROM-30 | lista de teste vazia fora de produção → não envia, trata como falha | `__tests__/unit/promotorReportRecipients.test.ts:45` + `promotorReportServiceEnvio.test.ts:101` | ✅ PASS |
| RELPROM-31 | em produção → só admins reais, nunca a lista de teste | `__tests__/unit/promotorReportRecipients.test.ts:11` | ✅ PASS |

### P2: Disparo manual via endpoint administrativo

| Criterion | `file:line` + assertion | Result |
| --- | --- | --- |
| RELPROM-32 | `__tests__/integration/promotorRelatorio.test.ts:44` (401 sem token) + `:59` (200 com PDF) | ✅ PASS |
| RELPROM-33 | `__tests__/integration/promotorRelatorio.test.ts:69` (janela padrão 7 dias) | ✅ PASS |
| RELPROM-34 | `__tests__/integration/promotorRelatorio.test.ts:76` (período customizado) | ✅ PASS |
| RELPROM-35 | Mesma função `PromotorReportService.gerarRelatorioCliente` chamada pelo controller e pelo cron (`service/promotorReportService.ts`, sem duplicação de lógica) — reaproveitamento confirmado por leitura direta do controller | ✅ PASS |
| RELPROM-36 | `__tests__/integration/promotorRelatorio.test.ts:59` (PDF retorna independente do envio) | ✅ PASS |
| RELPROM-37 | `__tests__/integration/promotorRelatorio.test.ts:95` (enviarEmail=false repassado) | ✅ PASS |
| RELPROM-38 | `__tests__/unit/promotorReportServiceEnvio.test.ts:71` (preview sem enviar/gravar) | ✅ PASS |
| RELPROM-39 | `__tests__/integration/promotorRelatorio.test.ts:119` (404 sem módulo) — "sem campanha ativa" tratado como RELPROM-13/22 (SPEC_DEVIATION documentada em tasks.md T21, spec.md atualizado) | ✅ PASS |

### P3: Execução automática semanal

| Criterion | `file:line` + assertion | Result |
| --- | --- | --- |
| RELPROM-14 | `__tests__/unit/promotorRelatorioCron.test.ts:60` (registra com expressão sexta 07:00) | ✅ PASS |
| RELPROM-15 | `__tests__/unit/promotorReportCalculos.test.ts:220` (janela 7 dias, corte quinta 23:59:59.999) | ✅ PASS |
| RELPROM-16 | `__tests__/unit/promotorRelatorioCron.test.ts:37,52` (flag != "1", NODE_ENV=test) | ✅ PASS |
| RELPROM-17 | `__tests__/unit/promotorReportServiceLote.test.ts:54` + `promotorReportServiceEnvio.test.ts:81,110` (isolamento de falha por cliente) | ✅ PASS |
| RELPROM-18 | `__tests__/unit/promotorReportServiceEnvio.test.ts:59` (grava auditoria com STATUS) + índice único parcial em `scripts/migration-promotor-relatorio-envio.sql` (idempotência, revisão manual) | ✅ PASS |
| RELPROM-19 | `__tests__/unit/promotorReportServiceLote.test.ts:37` (resumo: elegíveis/enviados/falharam) | ✅ PASS |

### P4: Escalável para qualquer cliente

| Criterion | `file:line` + assertion | Result |
| --- | --- | --- |
| RELPROM-20 | `backend-ob-ads/src/tests/moduloClientesService.test.ts` (listarClientesHabilitados por módulo) + `scripts SQL` T07 | ✅ PASS |
| RELPROM-21 | Nenhuma lista hardcoded de clientes — `ObAdsIntegrationClient.listarClientesHabilitados` consulta dinamicamente via T05, confirmado por leitura de `service/obAdsIntegrationClient.ts` e `service/promotorReportService.ts` (`processarClientesElegiveis`) | ✅ PASS |
| RELPROM-22 | `__tests__/unit/promotorReportService.test.ts:20` (campanhas: [] sem erro) | ✅ PASS |

### Edge Cases

| Edge case | `file:line` | Result |
| --- | --- | --- |
| RELPROM-23 (integração ob-ads indisponível → isola falha) | `__tests__/unit/promotorReportServiceEnvio.test.ts:110` | ✅ PASS |
| RELPROM-24 (OBS > 500 chars trunca) | `__tests__/unit/promotorReportCalculos.test.ts:201` | ✅ PASS |
| RELPROM-25 (corte superior inclusivo) | `__tests__/unit/promotorReportCalculos.test.ts:73` | ✅ PASS |
| Promotor sem movimentação mas rota aberta | `__tests__/unit/promotorReportCalculos.test.ts:103` block (linha zerada não omitida) | ✅ PASS |
| E-mail inválido na lista de teste | `__tests__/unit/promotorReportRecipients.test.ts` ("filtra e-mail invalido da lista de teste, sem derrubar os demais") | ✅ PASS |
| `NODE_ENV` indefinido → modo seguro | `__tests__/unit/promotorReportRecipients.test.ts` ("NODE_ENV indefinido conta como nao-producao") | ✅ PASS |

**Status**: ✅ 39/39 ACs covered with direct `file:line` evidence matching the spec-defined outcome. No spec-precision gaps.

---

## Discrimination Sensor

**Isolation method (revised for this round, per explicit safety instruction)**: no scratch worktree, no junction/symlink. The mutation was applied directly to the tracked file `templates/relatorioPromotor.ts` in the main `backend-promotor` checkout (git status was confirmed clean beforehand), the single affected test file was run, the result recorded, and the file was immediately reverted via `Edit` back to its original content. This fully avoids the node_modules/junction class of risk that caused the round-1→round-2 incident, since no separate worktree or `node_modules` link was ever created.

- Baseline `git status --porcelain` (backend-promotor, before sensor work): empty (clean).
- Post-revert `git status --porcelain`: empty (matches baseline exactly).

| # | File:line | Description | Killed? |
| --- | --- | --- | --- |
| 1 | `templates/relatorioPromotor.ts:112-113` (`renderizarDestaques`) | Swapped which filter feeds which labeled sub-section: `concluidas` variable holds `status === "cancelada"` items and vice versa (the exact mutation that **survived** in round 2) | ✅ **Killed** — `__tests__/unit/promotorReportPdfRenderer.test.ts` fails: `expect(indiceObsConcluida).toBeLessThan(indiceCanceladas)` → `Expected: < 3195, Received: 3314` (1 failed, 5 passed, was 6/6 passing before mutation) |

Carried-forward mutations from prior rounds (code unchanged since round 2, not re-executed — listed for continuity, still valid evidence):

| # | File:line | Description | Killed? |
| --- | --- | --- | --- |
| 2 | `utils/promotorReportCalculos.ts:194` | `listarDestaquesDeCampo`: swapped group order | ✅ Killed (round 2) |
| 3 | `utils/promotorReportCalculos.ts` (`dentroDoPeriodo`) | Upper bound `<=` → `<` (breaks RELPROM-25) | ✅ Killed (round 1) |
| 4 | `utils/promotorReportCalculos.ts` (`calcularAssertividade`) | `return "N/A"` → `return 0` | ✅ Killed (round 1) |
| 5 | `service/promotorReportService.ts` (catch) | Re-throw instead of isolating failure | ✅ Killed (round 1) |

**Sensor depth**: lightweight (1 new mutation this round, targeted precisely at the round-2 survivor; 4 carried-forward from prior rounds remain valid since the underlying code is unchanged)
**Result this round**: 1/1 new mutation killed → **the round-2 gap is confirmed closed** → **PASS**

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ — round-3 fix commit (`b0a033a`) only adds 1 test, no production code touched |
| Surgical changes | ✅ — `git diff --stat dd99b6e..HEAD` = 5 files (2 spec-bookkeeping files, tasks.md note, validation.md, 1 test file) |
| No scope creep | ✅ |
| Matches patterns | ✅ — new test follows the file's existing `describe`/`it` + RELPROM-tag naming convention |
| Spec-anchored outcome check (asserted values match spec) | ✅ — all 39 ACs, including RELPROM-09's template layer, now have a direct assertion matching the spec's literal grouping requirement |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — new test's name cites RELPROM-09 explicitly |
| Documented guidelines followed: none found in either repo (`AGENTS.md`/`CONTRIBUTING.md` absent) — strong defaults applied | ✅ |

---

## Gate Check

- **Gate command (backend-promotor)**: `npx tsc --noEmit` — 0 errors in feature files; 2 pre-existing, unrelated errors remain in `__tests__/unit/segmentacaoCampanhaPromotor.test.ts` (missing `utils/migrationRepository`/`helpers/mockMigrationRepo` modules) — confirmed out of scope (not touched by any commit in this feature's diff range), unchanged since round 1.
- **Gate command (backend-ob-ads)**: `npx tsc --noEmit` — 0 errors.
- **Jest (backend-promotor)**, all 9 feature test files run together in one batch with `--runInBand` (per task instruction — each file still independently addressable, never the whole repo suite):
  - `__tests__/unit/promotorReportCalculos.test.ts` — 24 passed
  - `__tests__/unit/promotorReportService.test.ts` — 6 passed
  - `__tests__/unit/promotorReportServiceEnvio.test.ts` — 9 passed
  - `__tests__/unit/promotorReportServiceLote.test.ts` — 4 passed
  - `__tests__/unit/promotorReportRecipients.test.ts` — 6 passed
  - `__tests__/unit/obAdsIntegrationClient.test.ts` — 10 passed
  - `__tests__/unit/promotorReportPdfRenderer.test.ts` — **6 passed** (was 5 in round 2; +1 new RELPROM-09 template test)
  - `__tests__/unit/promotorRelatorioCron.test.ts` — 7 passed
  - `__tests__/integration/promotorRelatorio.test.ts` — 12 passed
  - **Total**: 84 passed, 0 failed, 0 skipped
- **Jest (backend-ob-ads)**, all 5 feature test files:
  - `src/tests/internalApiKeyGuard.test.ts` — 4 passed
  - `src/tests/moduloClientesService.test.ts` — 4 passed
  - `src/tests/adminResolverService.test.ts` — 4 passed
  - `src/tests/internalModulosRoutes.test.ts` — 6 passed
  - `src/tests/internalEmailRoutes.test.ts` — 5 passed
  - **Total**: 23 passed, 0 failed, 0 skipped
- **Test count before this fix commit**: 83 (backend-promotor) + 23 (backend-ob-ads) = 106
- **Test count after this fix commit**: 84 + 23 = 107
- **Delta**: +1 new test (closes the round-2 sensor gap; no test deleted or weakened)
- **Skipped tests**: none
- **Failures**: none in the production-tree runs; the sensor's intentional mutation run (scratch-free, in-place, reverted) failed as expected (1/6 in that run = correctly killed)

---

## Fix Plans

None. The single open gap from round 2 (RELPROM-09 template-layer test-coverage hole) is closed: the new test exists, maps directly to RELPROM-09, and independently re-injecting the exact surviving mutation now fails it.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| RELPROM-01 through RELPROM-39 (all 39) | ✅ Verified (round 2), with RELPROM-09 flagged as an open template-layer test-coverage gap | ✅ **Verified** (all 39) — RELPROM-09 fully closed, calc layer and template layer both independently proven with a passing test and a confirmed-killed targeted mutation |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 39/39 ACs matched spec outcome with direct `file:line` evidence, no spec-precision gaps
**Sensor**: 1/1 new mutation killed (targeted precisely at the round-2 survivor); 4/4 carried-forward mutations remain valid (unchanged code)
**Gate**: 107 passed (84 backend-promotor + 23 backend-ob-ads), 0 failed, 0 skipped; `tsc --noEmit` clean in both repos (2 pre-existing, unrelated errors in backend-promotor, unchanged from round 1, out of scope)

**What works**: The feature is complete across both repos. All 39 RELPROM ACs are behaviorally correct and test-proven, including the previously-flagged RELPROM-09 template-rendering gap, which is now closed by a single, surgical test addition (no production code change needed — the behavior was already correct, only the regression-detection coverage was missing). The fix was verified independently this round by re-injecting the exact mutation that survived in round 2 and confirming it now fails.

**Issues found**: None.

**Next steps**: Feature is done. No further fix→re-verify iterations needed (this was iteration 3 of 3, closing PASS). Recommend proceeding to merge/deploy per the team's normal process; no code-level follow-up required by this validation. Lessons L-017/018/019 from prior rounds remain the authoritative record of what this feature taught the process (evidence-or-zero for N=1 cases, template-layer sensor coverage, scratch-worktree node_modules isolation) — no new lesson warranted this round since there is no new genuine gap to distill.

---

## Phase 6 — AD-006 / SKF-only (pós-Execute)

**Date**: 2026-10-29
**Context**: After the 3-iteration PASS above, the user requested 2 post-Execute adjustments, implemented as Phase 6 (T23–T27): (1) DBA froze the SQL Server pre-Postgres-migration — no new tables/columns/catalog rows, recorded as `AD-006` in `.specs/STATE.md`; (2) Product restricted production delivery to only SKF (`ID_CLIENTE=126`) for now. This changed 2 core flows previously verified: where "eligible clients" come from (was: SQL Server module; now: fixed allowlist in code) and how the manual endpoint resolves 1 client (was: module; now: new endpoint direct by `ID_CLIENTE`). This is a **focused delta verification**, not a re-run of the original 39 RELPROM from scratch (already done 3x).
**Diff range**: `backend-promotor` `72e8df5..HEAD` (commits `b7a8ae3`, `2497bae`, `d49160d`, `76865f8` — 11 files changed, 369 insertions, 77 deletions) · `backend-ob-ads` `0ed7be63..HEAD` (commits `800a0a0a`, `9e1b16bb` — 5 files changed, 140 insertions)
**Verifier**: independent sub-agent (author ≠ verifier) — fresh verification pass, separate from the original 3-iteration round

### Spec-Anchored Acceptance Criteria (RELPROM-40..43, P5)

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| RELPROM-40 — elegibilidade em produção vem de allowlist fixa em código, não de `cliente_module` | `processarClientesElegiveis` itera `CLIENTES_PRODUCAO_HABILITADOS`, nunca chama `listarClientesHabilitados` | `service/promotorReportService.ts:272-279` (`for (const idCliente of CLIENTES_PRODUCAO_HABILITADOS)`) + `__tests__/unit/promotorReportServiceLote.test.ts:31-39` — `expect(resumo.elegiveis).toBe(2); expect(resolverAdminsDoCliente).toHaveBeenCalledWith(10); expect(resolverAdminsDoCliente).toHaveBeenCalledWith(20)` (mock allowlist `[10,20]` injected via `jest.mock("../../config/promotorReportClientesProducao", ...)`) | ✅ PASS |
| RELPROM-41 — allowlist contém só SKF (`ID_CLIENTE=126`) | `CLIENTES_PRODUCAO_HABILITADOS = [126]` exatamente | `config/promotorReportClientesProducao.ts:14` — `export const CLIENTES_PRODUCAO_HABILITADOS: number[] = [126];` (valor literal, confirmado por leitura direta; não há teste automatizado pro valor exato da constante de produção — gate é `tsc --noEmit` por T25, consistente com "Tests: none / Gate: build" documentado em tasks.md) | ✅ PASS (valor confirmado por leitura; gate do tipo documentado) |
| RELPROM-42 — resolve admins de 1 cliente direto por `ID_CLIENTE`, via `GET /internal/clientes/:idCliente/admins` | Chamada HTTP monta a URL com `idCliente` no path, sem nome de módulo; endpoint no ob-ads retorna `{idCliente, nomeCliente, admins}` | `service/obAdsIntegrationClient.ts:69-88` (`resolverAdminsDoCliente`, monta `${baseUrl()}/internal/clientes/${idCliente}/admins`) + `__tests__/unit/obAdsIntegrationClient.test.ts:72-79` — `expect(String(urlChamada)).toBe("https://ob-ads.exemplo.com/internal/clientes/126/admins")`. Server side: `backend-ob-ads/src/main/config/routes/InternalClientesRoutes.ts:10` (`GET /:idCliente/admins`) + `backend-ob-ads/src/presentation/controllers/InternalClientesController.ts:22-34` + `backend-ob-ads/src/tests/internalClientesRoutes.test.ts:46-54` — `expect(res.body).toEqual({ idCliente: 126, nomeCliente: "SKF", admins: ["admin@skf.com"] })` | ✅ PASS |
| RELPROM-43 — nenhuma linha nova em `module`/`cliente_module` (SQL Server) enquanto AD-006 estiver ativa | Nenhum script SQL novo faz `INSERT`/`CREATE` em `module`/`cliente_module`; o script existente de T07 ganha só um aviso de "não rodar", sem alterar a lógica do `INSERT` condicional | `backend-ob-ads/sql/2026-10-con26-325-modulo-promotores.sql:3-11` (aviso `⚠️ NÃO RODAR enquanto AD-006 ... estiver active`, adicionado por `git diff 0ed7be63..HEAD`) + confirmado por `git diff 72e8df5..HEAD -- '*.sql'` no backend-promotor (saída vazia — nenhum `.sql` novo em `scripts/`) e por `git diff --stat` do ob-ads (nenhum arquivo `.sql` novo além do já existente T07, só modificado pra adicionar o comentário) | ✅ PASS |

**Status**: ✅ All 4 ACs covered with direct `file:line` evidence matching the spec-defined outcome. RELPROM-41's exact-value check is a direct code read rather than a dedicated assertion (no test pins the literal `[126]`) — flagged above as the one minor spec-precision note, not a gap, since the spec only requires the value be `126` and it demonstrably is; a future change to the array would only be caught by `tsc`/manual review, not by a test. Not escalated to a fix task — consistent with `Tests: none / Gate: build` already decided for T25 in `tasks.md`.

### Endpoint manual (T27) — status/motivo semantics

| Behavior | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| `gerar` chama `resolverAdminsDoCliente`, não mais `listarClientesHabilitados` | `controllers/promotorReportController.ts` import drops `NOME_MODULO_PROMOTORES`, calls new method | `controllers/promotorReportController.ts:2,42` — `import PromotorReportService from "../service/promotorReportService";` (no longer imports `NOME_MODULO_PROMOTORES`) + `const resolucao = await ObAdsIntegrationClient.resolverAdminsDoCliente(idCliente);` | ✅ PASS |
| 404 só quando `resolucao.status === 404` | Cliente inexistente → 404; qualquer outra falha (timeout/500) → 502, nunca 404 | `controllers/promotorReportController.ts:44-47` (`if (resolucao.status === 404) return res.status(404)...; return res.status(502)...`) + `__tests__/integration/promotorRelatorio.test.ts:119-129` ("404 quando o cliente nao existe", `resolverAdminsDoCliente` mockado com `{sucesso:false, status:404}` → `expect(res.status).toBe(404)`) + `:131-139` ("502 quando a resolucao do ob-ads falha por outro motivo (timeout/infra)", mock sem `status` → `expect(res.status).toBe(502)`) | ✅ PASS |

**Status**: ✅ Both behaviors covered with direct `file:line` evidence + passing test, and both independently confirmed below by the discrimination sensor (mutation #2 flips exactly this condition and is killed by these same two tests).

### Non-Regression

- **Backend-promotor**: `npx jest --runInBand` over the 9 feature test files (`promotorReportCalculos`, `obAdsIntegrationClient`, `promotorReportRecipients`, `promotorReportPdfRenderer`, `promotorReportService`, `promotorReportServiceEnvio`, `promotorReportServiceLote`, `promotorRelatorioCron`, `promotorRelatorio` integration) run together in one batch: **88 passed, 88 total, 9 suites passed** — matches the expected total exactly.
- **Backend-ob-ads**: `npx jest --runInBand` over the 6 feature test files (`internalApiKeyGuard`, `moduloClientesService`, `adminResolverService`, `internalModulosRoutes`, `internalEmailRoutes`, `internalClientesRoutes`): **28 passed, 28 total, 6 suites passed** — matches the expected total exactly.
- `npx tsc --noEmit` (backend-promotor): 0 errors in any feature file. 2 pre-existing errors remain in `__tests__/unit/segmentacaoCampanhaPromotor.test.ts` (`Cannot find module '../../utils/migrationRepository'` / `'../helpers/mockMigrationRepo'`) — **confirmed NOT a Phase 6 regression**: reproduced the identical 2 errors by checking out commit `72e8df5` (pre-Phase-6) into the working tree via `git checkout 72e8df5 -- .`, re-running `tsc --noEmit`, then restoring with `git checkout HEAD -- .` (verified `git status --porcelain` empty afterward). Out of this feature's scope (file untouched by any Phase 6 commit).
- `npx tsc --noEmit` (backend-ob-ads): 0 errors.
- **Test count before Phase 6** (backend-promotor, from the 3-iteration PASS report above): 84. **After Phase 6**: 88. **Delta**: +4 (net: `promotorReportServiceLote.test.ts` rewritten, same 4 test count but different assertions per AD-006; `obAdsIntegrationClient.test.ts` +4 new for `resolverAdminsDoCliente`; `promotorRelatorio.test.ts` integration tests renamed/re-asserted, same count). No test deleted without replacement; no assertion weakened.
- **Test count before/after Phase 6** (backend-ob-ads): 23 → 28. **Delta**: +5, all in the new `internalClientesRoutes.test.ts` (T23). No existing test file touched.

### T02–T07 (Phase 2, módulo) — intocados

- `git diff 0ed7be63..HEAD --stat` (backend-ob-ads) touches only: `sql/2026-10-con26-325-modulo-promotores.sql` (T07, comment-only header addition — the `BEGIN TRANSACTION ... INSERT ... COMMIT` logic block is byte-identical, confirmed by reading the full file), `src/main/api.ts` (adds 2 lines registering the new route, doesn't touch existing route registrations), and 3 new files (`InternalClientesRoutes.ts`, `InternalClientesController.ts`, `internalClientesRoutes.test.ts`). None of T02's `internalApiKeyGuard.ts`, T03's `moduloClientesService.ts`, T04's `adminResolverService.ts`, T05's `InternalModulosRoutes.ts`, or T06's `InternalEmailRoutes.ts` appear in the diff — **confirmed untouched**.
- `service/obAdsIntegrationClient.ts` (backend-promotor): `listarClientesHabilitados` (T03/T05 client side) is still present, byte-identical, only a new method `resolverAdminsDoCliente` was added alongside it (confirmed by diff — additive only, no deletion/modification inside the existing method).
- **Conclusion**: T02–T07 (and their backend-promotor-side consumer) kept, not apagados nem alterados — only new neighbors added, as `tasks.md` Phase 6 intro states.

### Discrimination Sensor (Phase 6, lightweight — 2 mutations)

**Isolation method**: no scratch worktree used — a direct, single-file mutate→test→revert cycle on the real `backend-promotor` working tree, per the explicit safety instruction for this round (avoids the node_modules/junction incident class entirely by never creating a worktree or junction). `git status --porcelain` confirmed empty immediately before the first mutation and immediately after each revert.

| # | File:line | Description | Killed? |
| --- | --- | --- | --- |
| 1 | `service/promotorReportService.ts:291-294` (`processarClientesElegiveis`) | Swapped `resumo.enviados += 1` / `resumo.falharam += 1` (flipped which branch increments which counter) | ✅ **Killed** — `npx jest --runInBand __tests__/unit/promotorReportServiceLote.test.ts`: 1 failed, 3 passed (was 4/4 before mutation). Failing test: "falha ao resolver admins de 1 cliente nao impede os demais ... RELPROM-17" — expected `{elegiveis:2, enviados:1, falharam:1}`, got `{elegiveis:2, enviados:0, falharam:2}` |
| 2 | `controllers/promotorReportController.ts:44` | `resolucao.status === 404` → `resolucao.status !== 404` (inverts when a resolution failure is treated as "not found" vs. "infra failure") | ✅ **Killed** — `npx jest --runInBand __tests__/integration/promotorRelatorio.test.ts`: 2 failed, 10 passed (was 12/12 before mutation). Both the "404 quando o cliente nao existe" test (expected 404, got 502) and the "502 quando a resolucao do ob-ads falha por outro motivo" test (expected 502, got 404) failed — confirming the tests discriminate both directions of this condition |

- Baseline `git status --porcelain` (backend-promotor, before sensor work): empty.
- Post-mutation-1-revert `git status --porcelain`: empty (confirmed before starting mutation 2).
- Post-mutation-2-revert `git status --porcelain`: empty (final state, confirmed before writing this report).
- No worktree was created at any point in this sensor run, so there is no `node_modules` sanity check to report (the explicit incident-avoidance guidance applies to worktree-based scratch setups; this run used none).

**Sensor depth**: lightweight (2 targeted mutations, both on the highest-risk new code paths — the allowlist iteration's success/failure counting, and the manual endpoint's 404-vs-502 branch)
**Result**: 2/2 killed → **PASS**

### Code Quality (Phase 6 delta)

| Check | Status |
| --- | --- |
| No features beyond what was asked | ✅ — exactly the allowlist + new resolve-by-ID endpoint, nothing else |
| No abstractions for single-use code | ✅ — `CLIENTES_PRODUCAO_HABILITADOS` is a flat array, no factory/strategy pattern introduced |
| No unnecessary "flexibility" added | ✅ |
| Only touched files required for task | ✅ — see T02–T07 intocados section above |
| Didn't "improve" unrelated code | ✅ — `listarClientesHabilitados` (dormant path) left byte-identical |
| Matches existing patterns/style | ✅ — `resolverAdminsDoCliente` mirrors the existing `{sucesso, motivo}` discriminated-union error pattern used throughout `ObAdsIntegrationClient` |
| Tests map to ACs, non-shallow | ✅ — spot-checked `promotorReportServiceLote.test.ts`: assertions target exact call arguments and exact summed counters, not just "doesn't throw" |
| Spec-anchored outcome check | ✅ — see tables above, all assertions target the exact spec-defined value/status code |
| Per-layer coverage (domain 1:1, routes happy+edge+error) | ✅ — `InternalClientesController` has 401/400/404/200(with admins)/200(empty admins) all covered in `internalClientesRoutes.test.ts` |
| Every test maps to a spec requirement | ✅ — new/changed tests cite RELPROM-40/41/42/43 or AD-006 explicitly in their `it()` names |
| Documented guidelines followed | ✅ none found in either repo — strong defaults applied (same as original round) |

### Fix Plans

None. 0 gaps found in the Phase 6 delta.

### Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| RELPROM-40 | Pending (spec.md table, Design) | ✅ Verified |
| RELPROM-41 | Pending (spec.md table, Design) | ✅ Verified (spec-precision note: exact literal value confirmed by read, not by a dedicated test — see AC table above) |
| RELPROM-42 | Pending (spec.md table, Design) | ✅ Verified |
| RELPROM-43 | Pending (spec.md table, Design) | ✅ Verified |

**Note on spec.md's own traceability table**: the "Status" column in `spec.md` (`Pending` for every RELPROM, including the original 39 already verified in the 3-iteration round) was not mechanically updated by any implementer — this is a pre-existing gap in process bookkeeping carried from before Phase 6, not something Phase 6 introduced or worsened. Not treated as a Phase 6 fix task; flagged here for visibility.

### Phase 6 Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 4/4 new ACs (RELPROM-40..43) matched spec outcome with direct `file:line` evidence; 1 minor spec-precision note (RELPROM-41's literal value has no dedicated test pin, confirmed by code read instead) — not a gap
**Sensor**: 2/2 new mutations killed
**Gate**: 88 passed (backend-promotor, was 84), 28 passed (backend-ob-ads, was 23), 0 failed, 0 skipped; `tsc --noEmit` clean in both repos (same 2 pre-existing unrelated errors in backend-promotor, confirmed pre-dating Phase 6 by diffing against `72e8df5`)

**What works**: The allowlist-based eligibility switch (RELPROM-40/41) and the direct-by-`ID_CLIENTE` admin resolution (RELPROM-42) are both correctly wired end-to-end — cron path (`processarClientesElegiveis`) and manual endpoint path (`gerar`) now share `resolverAdminsDoCliente` instead of the frozen module-based listing. AD-006 compliance (RELPROM-43) is structurally enforced: no new SQL file was added anywhere in either repo's Phase 6 diff, and the one pre-existing SQL script gained only a "do not run" comment header, its `INSERT` logic untouched. T02–T07 (the dormant module-based flow) are byte-identical to before Phase 6, confirmed by diff, ready to be reactivated by a 1-line source swap when AD-006 is lifted, exactly as `design.md`/`tasks.md` claim.

**Issues found**: None blocking. One cosmetic traceability-bookkeeping gap noted (spec.md's Status column), pre-existing and out of Phase 6's scope.

**Next steps**: Feature (including Phase 6) is done. No further fix→re-verify iterations needed. Recommend proceeding to merge/deploy per the team's normal process.
