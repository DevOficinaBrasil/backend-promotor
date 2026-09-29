# Disparo de Convite de Visita (Admin) Validation

**Date**: 2026-09-29
**Spec**: `.specs/features/disparo-convite-visita-admin/spec.md` (47 requirements, CONV-01..CONV-47)
**Verifier**: independent sub-agent (author ≠ verifier), evidence-or-zero

## Validation verdict: PASS ✅

With conditions: 5 spec-precision gaps flagged (none blocks), 1 evidence gap caused by a fixture defect that predates the branch, 1 cosmetic UI label deviation, and the human-UAT items listed at the end.

**Diff ranges (three repos)**

| Repo | Range | Commits |
| --- | --- | --- |
| backend-promotor | `main (2458f63)..feat/disparo-convite-visita-admin (ced1f4d)` | 38 (53 files, +8675/-602) |
| ob-ads | `main (28a972c2)..feat/disparo-convite-visita-admin (fdaa21a7)` | 10 (11 files, +2394/-3) |
| jornalOficinaBrasil (worktree `jornalOficinaBrasil-recusar-visita`) | `main (9d929644)..feat/recusar-visita (d0310dcc)` | 3 (7 files, +862/-53) |

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1-T13, T15-T36 | ✅ Done | Each has a commit on its branch; the checkboxes are ticked |
| T14 | ✅ Done (doc) | Commit `c84477d docs(visita): contrato da página com recusa` exists and `frontend-contract.md` documents `POST /visita/recusar`, `ALREADY_DECLINED` and `DECLINED` (lines 8-10, 197-233, 292-315). The T14 "Done when" boxes in `tasks.md:831-832` are still `[ ]`. |
| - | ⚠️ Doc hygiene | `tasks.md` repeats its Execution Plan and the T1-T13 breakdown twice (lines ~56-447 and ~452-813). Nothing functional; worth deduplicating. |

---

## Spec-Anchored Acceptance Criteria

Paths are relative to each repo root. BP = backend-promotor, OB = ob-ads, JN = jornal worktree.

### P1: Campanhas ativas (CONV-01, CONV-02)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: list all active campaigns with Cliente, Nome, Período, Promotores vinculados, Rotas | 5 columns, all clients | BP `__tests__/unit/adminDisparoService.test.ts:43` - SQL asserts LEFT JOIN on `COMMUNITIES` by `EMPRESA_SLUG` plus the `totalPromotores`/`totalRotas` subselects in one query; OB `app/admin/disparo-visitas/page.tsx:42-85` defines the columns | ✅ backend / ⚠️ cosmetic: the column header is "Promotores", not "Promotores vinculados" (`page.tsx:72`). UAT. |
| AC2: active = `PUBLICADA`, `DELETED_AT` null, now in `START_TIME..END_TIME`, `END_TIME` null = no end | exact filter | BP `__tests__/unit/adminDisparoService.test.ts:31` - `toContain('c."STATUS" = \'PUBLICADA\'' ... 'c."END_TIME" IS NULL OR c."END_TIME" >= $1')` | ✅ PASS |
| AC3: unresolvable client shows `—` and stays in the list | `clienteNome` null, row kept | BP `__tests__/unit/adminDisparoService.test.ts:60` - `clienteNome` is `null` and the row is kept; OB `page.tsx:48` - `row.clienteNome ?? '—'` | ✅ PASS (UI render: UAT) |
| AC4: non-admin redirected to `/dashboard` | redirect before render | OB `middleware.js:5-21` (existing `/admin/*` guard covers `/admin/disparo-visitas`) | ⚠️ No automated test (matrix says UAT). UAT. |

### P1: Auth admin (CONV-03, CONV-04, CONV-05)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: no Bearer / invalid / expired → 401, operation not executed | 401 | BP `__tests__/integration/adminDisparo.test.ts:156` and `:164` (all 9 routes via `describe.each`) - `expect(r.status).toBe(401)` + `expect(service[...]).not.toHaveBeenCalled()`; expired: `__tests__/unit/adminAuthMiddleware.test.ts:93` | ✅ PASS |
| AC2: valid token without `user.IS_ADMIN` → 403 | 403 | BP `__tests__/integration/adminDisparo.test.ts:172` - `expect(r.status).toBe(403)` for all 9 routes; `__tests__/unit/adminAuthMiddleware.test.ts:102` (`false`, `0`, `null`, `"true"`, `undefined`) | ✅ PASS |
| Independent test: admin → 2xx | 200 | BP `__tests__/integration/adminDisparo.test.ts:180` - `expect(r.status).toBe(200)` + args forwarded | ✅ PASS |
| AC3: routes that already existed keep their auth | no change | `git diff main..HEAD -- routes/ api.ts`: only `VisitaRoute.ts` (adds `/recusar`) and the new `AdminDisparoRoute.ts` mounted at `/admin` (`api.ts:21`). `router.use(adminAuthMiddleware)` is scoped to the `/admin` router (`routes/AdminDisparoRoute.ts:18`). The unchanged suites `__tests__/integration/visitaConfirmar.test.ts` and `visitaExchange.test.ts` are green. | ✅ PASS (checked against the diff) |

### P1: Segmentação (CONV-06..CONV-12)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: no region → 400 with the spec message, CRM not called | 400 "Informe a região (UF e cidade, ou CEP e raio)" | BP `__tests__/unit/adminDisparoSegmentacao.test.ts:43` - `rejects.toMatchObject({status:400, message:"Informe a região (UF e cidade, ou CEP e raio)"})` + `previewMock not called` (5 cases, including radius 0 and negative) | ✅ PASS |
| AC2: no criterion → 400 with the spec message | 400 "Informe ao menos um critério de segmentação" | BP `__tests__/unit/adminDisparoSegmentacao.test.ts:57` | ✅ PASS |
| AC3: evaluate on tenant 15, return the workshops in the region | tenant 15 | BP `__tests__/unit/adminDisparoSegmentacao.test.ts:90` - `expect(previewMock).toHaveBeenCalledWith(dsl, 15, 5000)`; region SQL `__tests__/unit/oficinaServiceBaseSegmentada.test.ts:52`, `:70` | ✅ PASS |
| AC4: flags `membroComunidade`, `temWhatsapp`, `rotaAtual`, `recusouNestaCampanha` | four flags | BP `__tests__/unit/oficinaServiceBaseSegmentada.test.ts:137` (flags and `rotaAtual`), `:184` (`temWhatsapp` follows `resolverTelefone`) | ✅ PASS / ⚠️ spec-precision gap SPG-3 |
| AC5: 5000-contact cap → `truncado: true` + warning "Resultado parcial: refine a segmentação" | flag + copy | BP `__tests__/unit/adminDisparoSegmentacao.test.ts:114` - `expect(r.truncado).toBe(true)`; OB copy `StepRegiaoSegmentacao.tsx:42,472` | ✅ backend / UI: UAT |
| AC6: CRM failure/timeout → 502 "Segmentação indisponível"; the screen keeps the previous selection | 502 | BP `__tests__/unit/adminDisparoSegmentacao.test.ts:122`, `:131` (timeout); `__tests__/integration/adminDisparo.test.ts:293` - `expect(r.status).toBe(502)` | ✅ backend / "keeps previous selection" (`StepRegiaoSegmentacao.tsx:458`): UAT |
| AC7: field values and fields come from tenant 15 | tenant 15 | BP `__tests__/unit/adminDisparoSegmentacao.test.ts:158`, `:175` - `toHaveBeenCalledWith(15, "contactAttributes.gender")` | ✅ PASS |

### P1: Rotas (CONV-13..CONV-18)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: linked promoters (with radius) and the client's unlinked promoters, separated | two lists | BP `__tests__/unit/adminDisparoService.test.ts:116`, `:137` (SQL: `p."ID_CLIENT" = c."ID_CLIENT"` + `NOT EXISTS` active link) | ✅ PASS |
| AC2: one `BACKLOG` route per workshop, community not required | route created | BP `__tests__/unit/adminDisparoRotas.test.ts:67` - `createRotasMock toHaveBeenCalledWith(31,[10],900,{agendar:false})` + `sqlSituacao() not.toContain("USUARIO_COMMUNITY")` | ✅ PASS |
| AC3: admin route enqueues nothing and shows "não disparada" | no `NOTIFICACAO_VISITA` row | BP `__tests__/unit/adminDisparoRotas.test.ts:67` (`agendar:false`); `__tests__/unit/registrarRotasCriadas.test.ts:86` - `agendar:false` → nothing enqueued; `__tests__/unit/adminDisparoEstado.test.ts:66` (`nao_disparada`) | ✅ PASS |
| AC4: already in a route → 409 naming the current promoter | 409 + promoter | BP `__tests__/unit/adminDisparoRotas.test.ts:87` - `conflitos toEqual([{status:409, motivo:MSG_JA_EM_ROTA, promotorAtual:{ID_CAMPANHA_PROMOTOR:32,NOME:"Ana"}}])`; CANCELADO ignored `:252`, `:262` | ✅ PASS / ⚠️ SPG-1 (409 per item in a 200 body) |
| AC5: no WhatsApp and not imported → 422 "Oficina sem WhatsApp cadastrado"; the screen disables the workshop | 422 + copy | BP `__tests__/unit/adminDisparoRotas.test.ts:109` - `{status:422, motivo:"Oficina sem WhatsApp cadastrado"}`; OB `lib/__tests__/disparoVisitas.test.ts:102` (grey); disabled checkbox `StepRotasAdmin.tsx:366,384` | ✅ backend / UI disabled: UAT / ⚠️ SPG-1 |
| AC6: refused in this campaign → 409 "Oficina recusou a visita nesta campanha" | 409 + copy | BP `__tests__/unit/adminDisparoRotas.test.ts:99`, `:273` (refusal on a cancelled route still blocks) | ✅ PASS / ⚠️ SPG-1 |
| AC7: auto-distribution to the nearest reaching radius (haversine, tie by `ID_CAMPANHA_PROMOTOR`); unreachable → "fora do alcance" | nearest; `foraDoAlcance` | BP `__tests__/unit/adminDisparoRotas.test.ts:181` - `r.foraDoAlcance toEqual([12,13])`; `__tests__/unit/escolherPromotorMaisProximo.test.ts:19`, `:42` (tie-break), `:60` (null radius counts as 20 km) | ✅ PASS |

### P1: Disparo (CONV-19..CONV-24)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: preview with total, per day and last day, before sending | preview, no write | BP `__tests__/unit/adminDisparoDisparo.test.ts:93` - `toEqual({totalConvites:25, porDia:[10,10,5], ultimoDia:"2026-10-01"})` + `createQueryBuilderMock not called`; OB `lib/__tests__/disparoVisitas.test.ts:118` | ✅ backend / confirmation dialog: UAT |
| AC2: cap not an integer in 1..1000 → 400 with the spec message, nothing enqueued | 400 "Teto diário deve ser um inteiro entre 1 e 1000" | BP `__tests__/unit/adminDisparoDisparo.test.ts:65` (0, 1001, 1.5, "10", undefined) + `:86` (limits 1 and 1000) | ✅ PASS |
| AC3/AC4: one notification per not-yet-dispatched route, at most `teto`/day, from tomorrow's window, spaced | ≤ teto per day | BP `__tests__/unit/adminDisparoDisparo.test.ts:127` - `every(q => q <= 10)`, `[["2026-09-29",10],["2026-09-30",10],["2026-10-01",5]]`, first slot `2026-09-29T12:00:00.000Z`; `__tests__/unit/agendamento.test.ts:288` | ✅ PASS |
| AC5: last day after `END_TIME` → 422 with the minimum cap, nothing enqueued | 422 + `tetoMinimo` | BP `__tests__/unit/adminDisparoDisparo.test.ts:219` - `rejects.toMatchObject({status:422, extra:{tetoMinimo:13}})`; `__tests__/integration/adminDisparo.test.ts:265` | ✅ PASS |
| AC6: a route that already has a notification is skipped and counted "já disparada" | skip + count | BP `__tests__/unit/adminDisparoDisparo.test.ts:170` - inserted ids `[2]`, `jaDisparadas: 2` | ✅ PASS |
| AC7: summary `{enfileiradas, jaDisparadas, porDia, ultimoDia}` | exact shape | BP `__tests__/unit/adminDisparoDisparo.test.ts:127`, `:188` | ✅ PASS |
| AC8: two concurrent dispatches → at most one notification per route | `UNIQUE` + `ON CONFLICT DO NOTHING` | BP `__tests__/unit/adminDisparoDisparo.test.ts:197` (count from `RETURNING`) and `:127` (`orIgnoreMock` called) | ✅ unit / real concurrency needs a DB: UAT |

### P1: Guardas (CONV-25..CONV-30)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: a recent address update no longer suppresses sending | sent | BP `__tests__/unit/despacharNotificacao.test.ts:152` - `desfecho: "ENVIADO"`, `sendMock` called once | ✅ PASS |
| AC2: same workshop has an unexpired `ENVIADO` → no message; the row waits | `AGUARDANDO` + ref | BP `__tests__/unit/despacharNotificacao.test.ts:173` - `STATUS AGUARDANDO`, `ID_NOTIFICACAO_REFERENCIA`, `AVAILABLE_AT null`, send not called; `__tests__/unit/envioGuards.test.ts:114`, `:122`, `:138` | ✅ PASS |
| AC3: invite confirmed → waiting rows accepted | `CONFIRMADO/CONVITE_VINCULADO` | BP `__tests__/unit/visitaConfirmacaoService.test.ts:1329` (same transaction); `__tests__/unit/outboxLiberarAguardando.test.ts:60` (tick safety net) | ✅ PASS |
| AC4: invite refused → waiting rows refused | `RECUSADO` | BP `__tests__/unit/visitaConfirmacaoService.test.ts:1405`; `__tests__/unit/outboxLiberarAguardando.test.ts:72` | ✅ PASS |
| AC5: invite expired → waiting rows re-enqueued for tomorrow's window | `PENDENTE`, next window | BP `__tests__/unit/outboxLiberarAguardando.test.ts:81` - `ELSE 'PENDENTE'`, `params toEqual([horarioNoDia(agora,1,0,1)])`, later than `agora`; `:117` runs before the claim | ✅ PASS |
| AC6: recipient confirmed within 3 months → no message, accepted by recent confirmation | `CONFIRMADO/CONFIRMACAO_RECENTE` | BP `__tests__/unit/despacharNotificacao.test.ts:205`; `__tests__/unit/envioGuards.test.ts:226`, `:241`, `:247`, `:253` (only `REPARADOR` counts) | ✅ PASS |
| AC7: admin distinguishes "aceita pelo reparador" and "aceita por confirmação recente" | distinct states and labels | BP `__tests__/unit/statusNotificacaoVisita.test.ts:242`; OB `lib/__tests__/disparoVisitas.test.ts:75` | ✅ PASS |

### P1: Visibilidade (CONV-31..CONV-34)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: `BACKLOG` shown only when the effective status is accepted, any origin | CONFIRMADO of any origin → visible | BP `__tests__/unit/statusNotificacaoVisita.test.ts:100` - `toBe(true)` for null, REPARADOR, CONFIRMACAO_RECENTE, CONVITE_VINCULADO, IMPORTADA | ✅ PASS (see EG-1) |
| AC2: `BACKLOG` without a notification → omitted | hidden | BP `__tests__/unit/statusNotificacaoVisita.test.ts:189` - `toBe(false)` | ✅ PASS (see EG-1) |
| AC3: `PENDENTE`, `ENVIADO`, `EXPIRADO`, `FALHOU`, `DISPENSADO`, `RECUSADO`, `AGUARDANDO`, unknown → omitted | hidden | BP `__tests__/unit/statusNotificacaoVisita.test.ts:120`, `:130`, `:138`, `:147`, `:154`, `:160` | ✅ PASS (see EG-1) |
| AC4: `A CAMINHO`, `EM ANDAMENTO`, `FINALIZADO`, `CANCELADO` → always shown | visible | BP `__tests__/unit/statusNotificacaoVisita.test.ts:170`, `:197` | ✅ PASS |
| AC5: `GET /campanha/:id` and `/client/:clientId` return every route | unfiltered | BP `__tests__/unit/campanhaServiceVisita.test.ts:315` and `:518` - `ID_ROTA_PROMOTOR toEqual([1,2,3])` / `[1,2,3,4]` (green) | ✅ PASS |

**EG-1 (evidence gap, pre-existing cause)**: the endpoint-level tests for `GET /campanha/ativa` (`__tests__/unit/campanhaServiceVisita.test.ts:94-296`, which this feature updated for the new rule) are red in the real gate. The fixture `campanhaAtiva` (`campanhaServiceVisita.test.ts:30-35`) has no `STATUS: 'PUBLICADA'`, so `getActiveCampanhaByPromotor` returns `null` before any assertion runs. The same 12 failures occur on `main` (confirmed in a scratch worktree), so this feature did not cause them. The wiring (`service/campanhaService.ts:294-307` → `rotaListavelParaPromotor`) is unchanged by the diff. In a scratch probe with only that fixture line fixed, all 9 `getActiveCampanhaByPromotor` visibility assertions passed. The 2 remaining failures come from other fixtures at `:621`/`:688`, which have the same missing field. **Fix task (recommended)**: add `STATUS: 'PUBLICADA'` to the three `campanha` fixtures in `campanhaServiceVisita.test.ts` and `campanhaService.test.ts:158`, so the visibility wiring has green evidence in the real gate.

### P1: Recusa (CONV-35..CONV-40)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: `POST /visita/recusar` valid → `RECUSADO` atomically, recording date, IP and token, like `CONFIRMADO` | guarded update | BP `__tests__/unit/visitaConfirmacaoService.test.ts:1387` - criterion `{ID, STATUS: ENVIADO, EXPIRA_EM: MoreThan(AGORA)}` with `{RECUSADO_EM, RECUSADO_POR: sub, RECUSADO_IP}`; `:1487` concurrent → `["ALREADY_DECLINED","DECLINED"]`; `__tests__/integration/visitaRecusar.test.ts:48`, `:61` | ✅ PASS |
| AC2: already `CONFIRMADO`/`RECUSADO` → 409 with the current state | 409 | BP `__tests__/integration/visitaRecusar.test.ts:112`, `:123` - `status 409`, `error ALREADY_CONFIRMED / ALREADY_DECLINED`; confirming a refused invite: `visitaConfirmacaoService.test.ts:1368` | ✅ PASS |
| AC3: expired/invalid token → same error format as `/confirmar` | same envelope | BP `__tests__/integration/visitaRecusar.test.ts:78` (401), `:85`/`:98` (403), `:134` (410), `:145` (404) | ✅ PASS |
| AC4: refused → no new route and no new invite in that campaign | blocked | BP `__tests__/unit/adminDisparoRotas.test.ts:99`, `:273`; `__tests__/unit/oficinaServiceBaseSegmentada.test.ts:137` (`recusouNestaCampanha`) | ✅ admin flow / ⚠️ SPG-2 (other flows) |
| AC5: same middleware and rate limit as `/confirmar` | 21st call → 429 | BP `__tests__/integration/visitaRecusar.test.ts:171` - `status 429`; `routes/VisitaRoute.ts:118` `middlewares: [visitaAuthMiddleware, limitadorAcao]` | ✅ PASS |
| AC6: `frontend-contract.md` updated with the endpoint and `DECLINED` | doc | `.specs/features/notificacao-visita-confirmacao/frontend-contract.md:8`, `:197`, `:297` | ✅ PASS |
| Reparador UI (jornal): decline button, confirmation step, declined screen | per design copy | JN `app/(visita)/visita/confirmacao/__tests__/VisitaConfirmacaoClient.test.tsx` (8 new tests), `useVisitaConfirmacao.test.ts` (18 new tests: 401/403 retry, 409, 404, 410, 429, 5xx), `service/__tests__/visitaService.test.ts` (`recusarVisita` POST without a body, with Bearer) | ✅ PASS (browser: UAT) |

### P1: Telefone e importada (CONV-43..CONV-47)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: no `CELULAR` → first mobile-shaped number in the order `USUARIO.TELEFONE`, `OFICINA.TELEFONE`, `dw.cadastro_empresa.telefone` | order + mobile shape only | BP `__tests__/unit/telefone.test.ts:132`, `:142`, `:152`, `:172`; `__tests__/unit/despacharNotificacao.test.ts:246`, `:263`, `:275`; `ehCelular` `telefone.test.ts:73-85` | ✅ PASS |
| AC2: record `TELEFONE_ORIGEM` | exact origin enum | BP `__tests__/unit/despacharNotificacao.test.ts:240` (`USUARIO_CELULAR`), `:246` - `expect(gravado.TELEFONE_ORIGEM).toBe(TelefoneOrigem.OFICINA_TELEFONE)` | ✅ PASS |
| AC3: no valid source → `FALHOU` with `MOTIVO_SEM_TELEFONE`; segmentation `temWhatsapp` false | FALHOU + flag | BP `__tests__/unit/despacharNotificacao.test.ts:298` - `{desfecho:"FALHOU_TERMINAL", erro: MOTIVO_SEM_TELEFONE}`, `ERRO_ENVIO` = motivo; `oficinaServiceBaseSegmentada.test.ts:184` | ✅ PASS |
| AC4: route for an imported workshop (any flow) → accepted, origin `IMPORTADA`, no message | `CONFIRMADO/IMPORTADA`, no token, not scheduled | BP `__tests__/unit/registrarRotasCriadas.test.ts:54` (row shape, no `TOKEN_HASH`/`AVAILABLE_AT`, not in `agendadas`), `:93` (also with `agendar:false`), `:106` (detection SQL); every `createRotas` path calls `registrarRotasCriadas` (`service/rotaService.ts:76-85`) | ✅ PASS |
| AC5: migration backfills imported routes (update and insert) | backfills 2 and 3 | `scripts/migration-convite-visita-admin.sql:151-203` (read: only live routes with active `OFICINA_IMPORTADA` for the campaign slug; `CONFIRMADO`/`RECUSADO` left unchanged; `ON CONFLICT DO NOTHING`) | ⚠️ No automated test (matrix: build only). Not applied, as required. UAT on a real DB. |
| AC6: imported workshop can enter a route even without WhatsApp | accepted | BP `__tests__/unit/adminDisparoRotas.test.ts:130`; OB `lib/__tests__/disparoVisitas.test.ts:106` | ✅ PASS |

### P2: Acompanhar (CONV-41, CONV-42)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: per-route state (não disparada, agendada with date, enviada, aceita, aceita por confirmação recente, recusada, expirada, falhou, aguardando) | state set | BP `__tests__/unit/adminDisparoEstado.test.ts:66`, `:86` (`agendadaPara` only for agendada); `statusNotificacaoVisita.test.ts:237-278`; labels OB `lib/__tests__/disparoVisitas.test.ts:71` | ✅ PASS |
| AC2: filter by state, totals always visible | filter + totals over all | BP `__tests__/unit/adminDisparoEstado.test.ts:107`, `:129`; UI filter `StepDisparo.tsx:65,91` | ✅ backend / UI: UAT |

### Edge cases

- [x] Campaign ends before a queued invite: existing guard `MOTIVO_CAMPANHA_ENCERRADA` is unchanged (`service/notificacaoVisitaService.ts`, dispatch guard 3).
- [x] Mobile number disappears before sending: `FALHOU` with the reason (`despacharNotificacao.test.ts:338`, `:298`).
- [x] Removing a route that was never dispatched: no notification row exists, and the existing delete path is unchanged. UAT.
- [x] Removing an already-dispatched route: existing behavior; T36 makes a `CANCELADO` route stop counting as "already in a route" (`adminDisparoRotas.test.ts:262`) and drops it from the list/totals (`adminDisparoEstado.test.ts:171`).
- [ ] Segmentation with 0 results: copy "Nenhuma oficina atende a esta segmentação" plus dispatch disabled (`StepRegiaoSegmentacao.tsx:43,478,512`). Not automated. UAT.

**Status**: every AC has evidence or is an explicit UAT item from the Test Coverage Matrix. 5 spec-precision gaps are flagged (below).

---

## Spec-Precision Gaps

| ID | AC | Gap | What the code does |
| --- | --- | --- | --- |
| SPG-1 | CONV-16, CONV-17 (Rotas AC4-AC6) | The spec says "SHALL recusar a rota com 409/422" but does not say whether that is the HTTP status of a batch request or a per-item status. | Design refinement (`design.md:373`): the request returns 200 with `conflitos: [{idOficina, status: 409|422, motivo}]`, and the other assignments still go through. Tests assert the per-item status and message exactly. |
| SPG-2 | CONV-38 (Recusa AC4) | "impedir que a mesma oficina receba nova rota ou novo convite naquela campanha" has no flow scope. | Enforced in the admin flow only: `criarRotas` 409 and segmentation `recusouNestaCampanha`. The client flows (`createRotaWithCampanhaPromotor`, auto-assign after a refused route is soft-deleted) and the dispatcher have no refusal guard, so a route recreated there would be invited again. The Out-of-Scope row ("o auto-assign do cliente ... só sente a regra global de visibilidade e as guardas novas") suggests admin-only, but the spec does not say so. Needs a product decision. |
| SPG-3 | CONV-09 vs CONV-17/CONV-43 | CONV-09 defines `temWhatsapp` as "tem celular em `USUARIO`". CONV-17 and CONV-43 AC3 define it after the phone fallback. | Uses the fallback definition (`temWhatsappPelosCandidatos` → `resolverTelefone`), which is consistent with CONV-17/43. |
| SPG-4 | CONV-24 (Disparo AC8) | "no máximo uma notificação por rota" under concurrency is a DB property (`UNIQUE(ID_ROTA_PROMOTOR)`) that unit tests with a mocked insert cannot show. | `orIgnore()` + counting from `RETURNING` is asserted. Real concurrency needs a DB UAT. |
| SPG-5 | CONV-12 (Segmentação AC7) | The 502 behavior is specified only for the segmentation request (AC6). The spec is silent on failures of the field-values call. | `listarCamposSegmentacao` is wrapped in `chamarCrm` (502). `listarValoresCampo` is not wrapped, so a DB error there returns a generic 500. |

---

## Discrimination Sensor

Sensor depth: **P0 / critical path, 22 behavior-level manual mutations** (no mutation tooling in the repo). Scratch: `git worktree add --detach <scratchpad>/bp-sensor HEAD`, with a `node_modules` junction to the real one. Each mutation was applied, its targeted suites were run, and the file was restored with `git checkout` inside the scratch. Two first-draft mutants (`false && ...` for M6 and M18) failed to compile under ts-jest ("0 total"). Those runs were discarded as invalid and replaced by the type-valid M6b and M18b.

| Mutation | File | Description | Tests run | Killed? |
| --- | --- | --- | --- | --- |
| M1 | `utils/statusNotificacaoVisita.ts:69` | BACKLOG without notification becomes visible | statusNotificacaoVisita | ✅ Killed (1 failed) |
| M2 | `utils/statusNotificacaoVisita.ts:73` | BACKLOG with `DISPENSADO` also visible | statusNotificacaoVisita | ✅ Killed (1) |
| M3 | `middlewares/adminAuthMiddleware.ts:186` | `IS_ADMIN` check dropped (no 403) | adminAuthMiddleware + adminDisparo (int) | ✅ Killed (14) |
| M4 | `routes/AdminDisparoRoute.ts:18` | admin middleware not mounted | adminDisparo (int) | ✅ Killed (30) |
| M5 | `service/adminDisparoService.ts:672` | cap upper bound off by one (1001 accepted) | adminDisparoDisparo | ✅ Killed (1) |
| M6b | `service/adminDisparoService.ts:705` | end-of-campaign check tolerates +1 year (no 422) | adminDisparoDisparo | ✅ Killed (1) |
| M7 | `utils/agendamento.ts:151` | daily-cap day index uses `teto+1` (11/day) | agendamento + adminDisparoDisparo | ✅ Killed (11) |
| M8 | `service/adminDisparoService.ts:699` | already-dispatched routes not filtered | adminDisparoDisparo | ✅ Killed (2) |
| M9 | `service/visitaConfirmacaoService.ts:538` | transition loses the `STATUS=ENVIADO` guard (non-atomic) | visitaConfirmacaoService | ✅ Killed (5) |
| M10 | `service/visitaConfirmacaoService.ts:548` | refusal propagation to AGUARDANDO removed | visitaConfirmacaoService | ✅ Killed (1) |
| M11 | `service/notificacaoVisitaService.ts:405` | imported route not auto-accepted | registrarRotasCriadas + rotaServiceVisita | ✅ Killed (2) |
| M12 | `service/notificacaoVisitaService.ts:435` | imported route still scheduled (invite sent) | registrarRotasCriadas | ✅ Killed (1) |
| M13 | `utils/telefone.ts:88` | `ehCelular` accepts landlines | telefone + despacharNotificacao + oficinaServiceBaseSegmentada | ✅ Killed (7) |
| M14 | `utils/telefone.ts:146` | fallback order: `OFICINA.TELEFONE` before `USUARIO.TELEFONE` | telefone + despacharNotificacao | ✅ Killed (2) |
| M15 | `service/adminDisparoService.ts:473` | refusal ignored in `criarRotas` | adminDisparoRotas | ✅ Killed (3) |
| M16 | `service/adminDisparoService.ts:477` | no-WhatsApp workshop accepted (no 422) | adminDisparoRotas | ✅ Killed (2) |
| M17 | `service/adminDisparoService.ts:502` | admin routes created with `agendar:true` | adminDisparoRotas | ✅ Killed (5) |
| M18b | `service/notificacaoVisitaService.ts:600` | recent-confirmation guard never fires | despacharNotificacao | ✅ Killed (1) |
| M19 | `service/notificacaoVisitaService.ts:542` | AGUARDANDO keeps `AVAILABLE_AT` (re-claimable) | despacharNotificacao | ✅ Killed (1) |
| M20 | `service/outboxNotificacaoService.ts:433` | expired reference leaves the row AGUARDANDO | outboxLiberarAguardando | ✅ Killed (1) |
| M21 | `service/envioGuards.ts:93` | recent-confirmation guard counts automatic origins | envioGuards | ✅ Killed (4) |
| M22 | `service/adminDisparoService.ts:379` | segmentation uses the campaign id instead of tenant 15 | adminDisparoSegmentacao | ✅ Killed (1) |

**Result**: 22/22 killed, 0 survived - PASS ✅

Isolation: the scratch worktrees were removed (`git worktree remove --force`, junction links removed with `rmdir` only; the real `node_modules` is intact). `git status --porcelain` after cleanup: backend-promotor = ` M .specs/LESSONS.md`, ` M .specs/lessons.json`, ` M package-lock.json` (equals the pre-sensor baseline); ob-ads = clean (baseline clean); jornal worktree = clean (baseline clean). The ob-ads and jornal code was not mutated. Their critical logic is covered by the backend mutants plus their green suites.

---

## Gate Check

| Repo | Command | Result |
| --- | --- | --- |
| backend-promotor | `npm run test:unit` | 858 tests: 846 passed, **12 failed**. All 12 are in `campanhaService.test.ts`, `campanhaServiceVisita.test.ts`, `segmentacaoCampanhaPromotor.test.ts`. The same 12 test names fail on `main` (scratch worktree run: `Tests: 12 failed, 25 passed`). **0 failures attributable to this feature.** |
| backend-promotor | `npx jest __tests__/integration/visitaRecusar.test.ts visitaConfirmar.test.ts visitaExchange.test.ts adminDisparo.test.ts` | 4 suites, **78/78 passed** |
| backend-promotor | `npx tsc --noEmit` | 2 errors, both in `__tests__/unit/segmentacaoCampanhaPromotor.test.ts` (baseline). 0 new. |
| ob-ads | `npx jest lib/__tests__` | 1 suite, **18/18 passed** |
| ob-ads | `npx tsc --noEmit` | 49 errors: 18 in `ActivationConfirmDialog.test.tsx` + 31 in `TrainingConfigure.activation.test.tsx` (untouched, baseline 49). 0 in the 11 changed files. |
| jornal worktree | `npx vitest run "app/(visita)" service/__tests__/visitaService.test.ts` | 4 files, **125/125 passed** |

No DB-backed test was run (no `test:integration`, no `visitaEndereco.test.ts`, nothing that imports `__tests__/integration/setup.ts`). No migration was applied.

Test integrity: `git diff main..HEAD` changes existing assertions only where AD-003 changed the rule (DISPENSADO/FALHOU/no-notification hidden). Each change carries a comment explaining it (e.g. `statusNotificacaoVisita.test.ts:118-119,186-188`). No test file was deleted.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code / no scope creep | ✅ New code maps to CONV requirements. `SegmentacaoService.valoresDeCampo` was extracted from the controller so it can be reused with tenant 15, with identical behavior. |
| Surgical changes | ✅ `escolherPromotorMaisProximo` extraction replaces two identical inlined blocks in `rotaService.ts` |
| Matches patterns | ✅ `createDocumentedRoute`, `orIgnore` bulk insert, guarded conditional UPDATE, and domain-error-to-HTTP mapping follow the existing patterns. The `SPEC_DEVIATION` at `routes/AdminDisparoRoute.ts:12-17` (router-level auth so 401 precedes zod 400) is justified and tested (`adminDisparo.test.ts:192`). |
| Spec-anchored outcome check | ✅ Messages and statuses are asserted literally, except where SPG-1..5 apply |
| Per-layer coverage (L-002 middleware integration, L-004 SQL asserted) | ✅ All 9 admin routes × 401/401/403/200; SQL joins and aliases are asserted in every raw-SQL service test |
| Every test maps to a requirement | ✅ Test names and comments cite CONV-xx |
| Documented guidelines followed | `.specs/LESSONS.md` (L-002, L-004), jornal `CLAUDE.md`, ob-ads `.specs/codebase/CONVENTIONS.md` |

Risk noted, not a gap: `ob-ads/service/api.ts:32-42` now attaches the ob-ads JWT to every `api_promotores` request. Old backend-promotor routes do not read `Authorization` (only the `/admin` and `/visita` middlewares do), so there is no behavior change today. If `authMiddleware` is ever mounted on old routes, this header would be verified with the wrong secret.

---

## Items needing human UAT

1. **Browser, ob-ads `/admin/disparo-visitas`**:
   - As admin, the list shows campaigns from 2 or more clients, with `—` for an unresolvable client. The header label reads "Promotores" instead of the spec's "Promotores vinculados" (cosmetic, CONV-01).
   - As non-admin, the page redirects to `/dashboard` (CONV-02 AC4).
   - The "Resultado parcial: refine a segmentação" warning appears.
   - A 502 keeps the previous selection.
   - Workshops without WhatsApp are disabled.
   - 0 results shows "Nenhuma oficina atende a esta segmentação" and the dispatch button is disabled.
   - The preview dialog appears before anything is sent.
   - The state filter keeps totals visible.
2. **Browser, jornal `/visita/confirmacao`**: "Não quero receber a visita" → "Sim, recusar" → declined screen. Reopening the link shows "já recusada".
3. **Real DB (homolog)**: apply `scripts/migration-convite-visita-admin.sql`. Check that backfills 2 and 3 (CONV-46) touch only imported workshops' live routes. Check the new CHKs against existing rows. Run a concurrent double dispatch and confirm 1 row per route (CONV-24). Run `SELECT AVAILABLE_AT::date, count(*)` and confirm no day exceeds the cap.
4. **CRM tenant 15 (homolog/prod)**: dev has 1 contact, so end-to-end segmentation (CONV-08, CONV-10) needs an environment with the real base.
5. **Deploy config**: `OBADS_JWT_SECRET` must equal the backend-ob-ads `JWT_SECRET`. Without it the admin routes return 500.
6. **Deploy consequence (by design, AD-003)**: `BACKLOG` routes that promoters see today without acceptance disappear from `GET /campanha/ativa`.

---

## Fix Plans (non-blocking)

### Fix 1: Green evidence for `GET /campanha/ativa` wiring (EG-1)

- **Root cause**: the fixtures `campanhaAtiva` (`campanhaServiceVisita.test.ts:30-35`, `:621`, `:688`) and the one in `campanhaService.test.ts` do not set `STATUS: 'PUBLICADA'`, which `getActiveCampanhaByPromotor` requires. This predates the branch.
- **Fix task**: add `STATUS: 'PUBLICADA'` to those fixtures. Confirm that `npm run test:unit` drops the `campanhaService*` failures. `segmentacaoCampanhaPromotor` is a separate baseline issue.
- **Priority**: Minor (evidence hygiene; the behavior is verified in scratch)

### Fix 2: Decide CONV-38 scope (SPG-2)

- **Root cause**: the spec is ambiguous about client flows.
- **Fix task**: product decision. If "any flow", add a refusal check to the client route-creation paths and to the dispatcher. Otherwise, amend the spec to say "pela tela de admin".
- **Priority**: Major (product decision)

### Fix 3: Cosmetic label

- `ob-ads/app/admin/disparo-visitas/page.tsx:72`: change "Promotores" to "Promotores vinculados" (CONV-01).
- **Priority**: Cosmetic

### Fix 4: tasks.md hygiene

- Tick T14 (`tasks.md:831-832`) and remove the duplicated Execution Plan / T1-T13 block.
- **Priority**: Cosmetic

---

## Requirement Traceability Update

| Requirement | Previous | New |
| --- | --- | --- |
| CONV-03..CONV-09, CONV-12..CONV-16, CONV-18, CONV-20..CONV-23, CONV-25..CONV-37, CONV-39..CONV-41, CONV-43..CONV-45, CONV-47 | Implementing (CONV-34 Pending) | ✅ Verified |
| CONV-01, CONV-02, CONV-10, CONV-11, CONV-17, CONV-19, CONV-42 | Implementing | ✅ Verified (backend) / UAT pending (UI) |
| CONV-24 | Implementing | ✅ Verified (unit) / DB UAT pending |
| CONV-38 | Implementing | ⚠️ Verified for admin flow; scope decision pending (SPG-2) |
| CONV-46 | Implementing | ⚠️ Reviewed (SQL read); DB UAT pending |

---

## Summary

**Overall**: ✅ Ready for UAT, with the conditions above

**Spec-anchored check**: 47/47 requirements traced to evidence or to an explicit UAT item. 5 spec-precision gaps flagged. 1 evidence gap with a pre-existing cause (EG-1).
**Sensor**: 22/22 mutations killed (P0 depth)
**Gate**: BP unit 846 passed / 12 pre-existing failures (identical on `main`); BP integration 78/78; OB jest 18/18; JN vitest 125/125; tsc at baseline in both TS repos

**What works**:
- The global visibility rule
- Admin JWT on all 9 routes
- Segmentation on tenant 15
- Admin route creation with 409/422 per item
- The daily cap with the 422 minimum-cap response
- Idempotent dispatch
- The AGUARDANDO / recent-confirmation guards and their reconciliation
- Atomic refusal with propagation
- The phone fallback with origin recorded
- Imported workshops auto-accepted in every `createRotas` path
- The jornal decline flow

**Next steps**: the human UAT items; Fix 2 (product decision); optionally Fixes 1, 3 and 4.
