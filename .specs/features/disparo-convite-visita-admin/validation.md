# Disparo de Convite de Visita (Admin) Validation

**Date**: 2026-09-29
**Spec**: `.specs/features/disparo-convite-visita-admin/spec.md` (47 requirements, CONV-01..CONV-47)
**Verifier**: independent sub-agent (author ≠ verifier), evidence-or-zero

## Validation verdict: PASS ✅ (histórico, 2026-09-29; o veredito atual está na última seção, "Re-verificação 2026-10-06 (endereço atualizado)", iteração 2)

> **2026-09-29, busca por WHERE:** the user replaced the CRM segmentation with a plain `WHERE` over `MAIN_REGISTER.OFICINA`. The parts of this report about segmentation are **superseded**: the CONV-06..CONV-12 table, SPG-3 wording, SPG-5, sensor row M22, and UAT items 1 (segmentation copy and 502) and 4 (tenant 15). See the section **Re-verificação 2026-09-29 (busca por WHERE)** at the end of this file. Everything else still holds.

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

### P1: Segmentação (CONV-06..CONV-12) - SUPERSEDED 2026-09-29 (see Re-verificação)

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
| SPG-5 (SUPERSEDED 2026-09-29: CRM removed from the admin search) | CONV-12 (Segmentação AC7) | The 502 behavior is specified only for the segmentation request (AC6). The spec is silent on failures of the field-values call. | `listarCamposSegmentacao` is wrapped in `chamarCrm` (502). `listarValoresCampo` is not wrapped, so a DB error there returns a generic 500. |

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
| M22 (SUPERSEDED: code removed) | `service/adminDisparoService.ts:379` | segmentation uses the campaign id instead of tenant 15 | adminDisparoSegmentacao | ✅ Killed (1) |

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
4. **(SUPERSEDED 2026-09-29, CRM no longer used by the admin search) CRM tenant 15 (homolog/prod)**: dev has 1 contact, so end-to-end segmentation (CONV-08, CONV-10) needs an environment with the real base.
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


---

## Re-verificação 2026-09-29 (busca por WHERE)

### Validation (revisão 2026-09-29, histórico): PASS ✅

**Date**: 2026-09-29
**Verifier**: independent sub-agent (author ≠ verifier), evidence-or-zero. I re-derived this from `spec.md` (CONV-06..CONV-12 rewritten, CONV-48 new), from `design.md` "Revisão 2026-09-29" and from the diff. I did not reuse the author's per-task notes or scratch scripts.

The verdict has conditions: 4 new spec-precision gaps (none blocks), 1 runtime risk that needs a DB check before UAT (R-1), and the UAT items below.

**Diff ranges**

| Repo | Range | Commits |
| --- | --- | --- |
| backend-promotor | `e874080^..723b74b` | 12: `e874080` (docs), T37 `ec897c1`, T38 `658d27c`, T39 `e065b95`, T40 `621161e`, T41 `cf67835`, T47 `1af6b83`, and 5 docs commits that tick T42-T46. 16 files, +1292/-743 |
| ob-ads | `4a2084fb..24813856` | 6: T42 `a63c16be`, T43 `37554b07`, T44 `17a2d076`, T45 `721d3e26`, T46 `bc108c1f`, copy fix `24813856`. 8 files, +527/-621 |

### Task completion (T37-T47)

| Task | Status | Notes |
| --- | --- | --- |
| T37-T41, T47 | ✅ Done | One commit each; the Done-when boxes are ticked |
| T42-T46 | ✅ Done | One commit each. `StepRegiaoSegmentacao.tsx` and `validarRegiao` were removed in T46, as the T43 and T44 notes say |
| SPEC_DEVIATION | ✅ Justified | `utils/filtroBuscaOficina.ts:72-76`: `normalizarTexto` and `sqlTextoNormalizado` are copies, because `utils/geocodificacaoRegiao.ts` is untracked user WIP. Committed code does not import that file (checked with grep), so a clean checkout compiles. Unify the copies when the WIP lands |

### Spec-anchored acceptance criteria (revised requirements)

BP = backend-promotor, OB = ob-ads. Paths are relative to each repo.

| Req / AC | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| CONV-06 (Busca AC1): search with no filter | whole `OFICINA` that passes the fixed criterion, up to the cap | BP `__tests__/unit/oficinaServiceBuscaBase.test.ts:44` - `toContain('FROM "MAIN_REGISTER"."OFICINA" o LEFT JOIN')`, `toContain("WHERE ce.cnpj_int IS NOT NULL AND ce.status_receita = 'ATIVA' ORDER BY o.\"ID_OFICINA\" LIMIT $3")`, `params toEqual([77,"zf",5001])`; `__tests__/unit/filtroBuscaOficina.test.ts:70` - `sqlFiltrosBusca("o", {}, 3) toEqual({sql:"",params:[]})`; `__tests__/unit/adminDisparoBusca.test.ts:39` - `baseMock toHaveBeenCalledWith({}, {...})`, CRM and geocoding not called | ✅ PASS (SQL asserted, L-004). Real result set: DB UAT |
| CONV-07 (Busca AC2): each filter is an `AND`: lines (`EXISTS`, case-insensitive), elevators numeric `>= N` (non-numeric = 0), UF, city (case- and accent-insensitive) | exact conditions | BP `filtroBuscaOficina.test.ts:74` (`upper(trim(la."LINHA_ATIVIDADE")) = ANY($3::text[])`), `:83` (`toBe("AND (CASE WHEN trim(o.\"QUANTIDADE_ELEVADOR\") ~ '^[0-9]{1,6}$' THEN ...::int ELSE 0 END) >= $5")`), `:91` (UF), `:98` (city normalized in SQL and in the parameter: `"SAO JOAO DEL-REI"`), `:104` (4 `AND`s, sequential placeholders, no value inlined), `:126` (the SQL `translate` maps each accent to the same letter as the TS); `oficinaServiceBuscaBase.test.ts:89` (filters from `$4`, `params toEqual([77,"zf",5001,["LEVE"],2,"SP","CAMPINAS"])`) | ✅ PASS (SQL asserted) / ⚠️ SPG-9 (behavior on real data needs the DB) |
| CONV-08 (Busca AC3): city without UF, UF without 2 letters, elevators not an integer `>= 0` → 400 with the three messages, **without querying the database** | 400 + exact message + no query | BP `filtroBuscaOficina.test.ts:40` (`message toBe("Informe a UF para filtrar por cidade")`), `:48` (`"UF inválida"` for `S`, `SPA`, `S1`, `12`), `:55` (`"Quantidade de elevadores deve ser um inteiro maior ou igual a 0"` for -1, 1.5, "2", NaN); `adminDisparoBusca.test.ts:66-77` - `rejects.toMatchObject({status:400,message})` + `queryMock not.toHaveBeenCalled()` + `baseMock not.toHaveBeenCalled()`; route `__tests__/integration/adminDisparo.test.ts:215` - `r.status toBe(400)`, `r.body toEqual({message})`; OB `lib/__tests__/disparoVisitas.test.ts:19`, `:46`, `:51`, `:56` (same messages on the client) | ✅ PASS / ⚠️ SPG-6 (invented message for wrong types) |
| CONV-09 (Busca AC4): only CNPJ `ATIVA`; each workshop flagged with `membroComunidade`, `importada`, `temWhatsapp`, `rotaAtual`, `recusouNestaCampanha`, `semCoordenadas` | fixed criterion + 6 flags | BP `oficinaServiceBuscaBase.test.ts:52` (`ce.status_receita = 'ATIVA'`), `:59-87` (projection and every flag subquery, with `rotaAtual` ignoring `DELETED_AT` and `CANCELADO` (T47), line 83), `:124-162` - `r.oficinas[0] toEqual({... semCoordenadas:false, membroComunidade:true, importada:true, temWhatsapp:true, recusouNestaCampanha:true, rotaAtual:{...estado:"agendada"}})`, and a landline-only workshop gives `temWhatsapp:false` | ✅ PASS |
| CONV-10 (Busca AC5): more than 5000 → the first 5000 with `truncado: true`; the screen shows "Resultado parcial: refine os filtros" | 5000 + `truncado` + copy | BP `oficinaServiceBuscaBase.test.ts:105` (5001 rows → `toHaveLength(5000)`, `oficinas[4999].ID_OFICINA toBe(5000)`, `truncado toBe(true)`), `:115` (5000 → `truncado toBe(false)`), `:56` (`MAX_OFICINAS_BUSCA toBe(5000)`); OB `lib/__tests__/disparoVisitas.test.ts:69` (`MSG_RESULTADO_PARCIAL toBe('Resultado parcial: refine os filtros')`); rendered at `StepFiltrosBusca.tsx:327-333` | ✅ backend / UI render: UAT |
| CONV-11 (Busca AC6): the query fails → 500 "Não foi possível buscar as oficinas"; the screen keeps the previous result and selection | 500 + message | BP `adminDisparoBusca.test.ts:86` - `toBeInstanceOf(AdminDisparoErro)`, `toMatchObject({status:500,message:"Não foi possível buscar as oficinas"})`; `integration/adminDisparo.test.ts:242` - `r.status toBe(500)`, `r.body toEqual({message:"Não foi possível buscar as oficinas"})`. OB: `StepFiltrosBusca.tsx:99` replaces the result only on success; `:102-104` sets the failure banner for status ≥ 500 | ✅ backend / keeping the result: UAT / ⚠️ SPG-8 |
| CONV-12 (Busca AC7): options are the lines and UFs in the database; once a UF is chosen, only that UF's cities | options from the DB, cities per UF | BP `oficinaServiceBuscaBase.test.ts:185` (distinct lines by `upper(trim())`, UFs `~ '^[A-Z]{2}$'`), `:205` (cities `WHERE upper(trim(o."ESTADO")) = $1`, `params toEqual(["SP"])`); `adminDisparoBusca.test.ts:98`, `:104` (`cidadesMock toHaveBeenCalledWith("SP")`), `:111` (missing, empty or short UF → 400 "UF inválida", nothing queried); routes `integration/adminDisparo.test.ts:153-186` (`/admin/oficinas/filtros` and `/admin/oficinas/cidades` return 401/401/403/200), `:232`. OB: city select disabled without a UF (`StepFiltrosBusca.tsx:265`), query key includes the UF (`:86`) | ✅ backend / UI: UAT |
| CONV-16 (Rotas AC4/AC6) after T47 | a `CANCELADO` route is not "already in a route", and it is not counted | BP `oficinaServiceBuscaBase.test.ts:83` (`rotaAtual` excludes `'CANCELADO'`); `__tests__/unit/adminDisparoService.test.ts:56` (`totalRotas ... AND rp."STATUS" IS DISTINCT FROM 'CANCELADO'`); `adminDisparoRotas.test.ts:286`, `:296` (unchanged since T36) | ✅ PASS |
| CONV-18 (Rotas AC7): auto-distribution; nothing in reach → "fora do alcance" | `foraDoAlcance` | BP `__tests__/unit/adminDisparoRotas.test.ts:182` - `foraDoAlcance toEqual([12])` (updated: 13 has no coordinates and moved to `semCoordenadas`, line 200) | ✅ PASS |
| CONV-48 (Rotas AC8): no coordinates → manual assignment accepted; auto-distribution leaves it without a route and lists it in `semCoordenadas` | no route + list | BP `adminDisparoRotas.test.ts:203` - `semCoordenadas toEqual([20,21,22])` (null, `""` and `"abc"`), `foraDoAlcance toEqual([])`, `createRotasMock toHaveBeenCalledWith(31,[10],900,{agendar:false})` once; `:220` - manual assignment with null coordinates → `createRotasMock toHaveBeenCalledWith(32,[10],900,{agendar:false})`; the search flag: `oficinaServiceBuscaBase.test.ts:164` (`[1,true,null,null] ... [4,false,-22.9,-47.06]`). OB: no marker (`StepRotasAdmin.tsx:153`), "Sem localização" badge (`:409-414`), distribution feedback (`:217`, `:227`) | ✅ backend / UI: UAT |
| CONV-03/CONV-04 for the 3 new routes | 401 / 401 / 403 / 200 | BP `integration/adminDisparo.test.ts:153` (`describe.each(ROTAS)` now includes `GET /admin/oficinas/filtros`, `GET /admin/oficinas/cidades`, `POST /admin/campanhas/:id/oficinas/buscar`): `:157`, `:165` `toBe(401)` + service not called, `:173` `toBe(403)`, `:183` `toBe(200)` + arguments forwarded; removed routes → 404 (`:327-334`) | ✅ PASS |

Edge case (spec line 282), "WHEN a segmentação devolve 0 oficinas THEN a tela SHALL mostrar 'Nenhuma oficina atende a esta segmentação' e manter o botão de disparo desabilitado". The screen shows `MSG_SEM_OFICINAS = 'Nenhuma oficina atende aos filtros'` (`StepFiltrosBusca.tsx:18`, `:337-340`) and disables "Montar rotas" (`:374`). The revision did not update the spec's edge case, so the copy differs. This is ⚠️ SPG-7. UAT.

**Status**: all revised requirements trace to `file:line` evidence or to an explicit UAT item. 4 spec-precision gaps are flagged below.

### Spec-precision gaps (revision)

| ID | AC | Gap | What the code does |
| --- | --- | --- | --- |
| SPG-6 | CONV-08 | The spec lists three 400 messages. It is silent on a body that is not an object, `linhas` that is not a string array, or a `cidade` that is not a string. | Returns 400 with an **invented** message, "Filtros de busca inválidos" (`utils/filtroBuscaOficina.ts:21`, thrown at `:31`, `:38`, `:53`). The code says so in its comment (`:20`). Tested at `filtroBuscaOficina.test.ts:62`. The UI never sends these shapes, so this is reachable only by direct API calls. Add the message to the spec or reuse a spec message. |
| SPG-7 | Edge case "0 oficinas" (spec line 282) | The edge-case text still says "segmentação" and "botão de disparo". Neither exists in the revised step 1. | The UI copy is "Nenhuma oficina atende aos filtros", and the next-step button "Montar rotas" is disabled. Update the spec text. Other leftover "segmentada/segmentação" wording (the Rotas user story, CONV-43 AC3 "a segmentação SHALL marcar", Success Criteria 1) is cosmetic. |
| SPG-8 | CONV-11 | "IF a consulta falhar" does not say whether the campaign lookup counts as "a consulta". | Only `OficinaService.buscarOficinasBase` is wrapped (`service/adminDisparoService.ts:307-316`). A DB failure in `carregarCampanha` (`:305`, outside the `try`) returns the generic 500 `{message:"Erro interno."}` (`routes/AdminDisparoRoute.ts:44`), not the spec message. The status is still 500, so the screen still keeps the previous result. Low impact. |
| SPG-9 | CONV-06, CONV-07, CONV-12 | The spec's Independent Test ("UF=SP, cidade=Campinas, linha=Leve, elevadores>=2 → only those") is a property of real data. With the query runner mocked, the unit tests prove the SQL text, not the rows it returns (L-004, candidate L-014). | The SQL is asserted in full. The row semantics need the homolog DB. Two points to check there: the `translate` list covers only the listed Portuguese accents, while the TS side strips every combining mark (for example `ñ`); and `EXISTS` on `LINHA_ATIVIDADE` over the whole base may need an index (design risk table). |

### Risks found by reading (not AC failures; check before UAT)

- **R-1 (Major, needs a DB check before UAT; the code predates the revision, but CONV-48 now depends on it):** `situacaoDasOficinas` projects `COALESCE(ce.latitude, o."LATITUDE")` and `COALESCE(ce.longitude, o."LONGITUDE")` (`service/adminDisparoService.ts:481-482`, introduced in `225b675`). `OFICINA.LATITUDE`/`LONGITUDE` are `varchar(20)` (`entities/Oficina.ts:86-90`). The revision's own search casts the dw side as a number (`ce.latitude::double precision`, `service/oficinaService.ts:686-688`), and `findNearestOficinas` calls `radians(ce.latitude)` (`service/oficinaService.ts:168`). Both suggest the dw column is numeric, which contradicts the `varchar` in `entities/CadastroEmpresa.ts:64-68`. If the dw column is numeric, Postgres rejects that `COALESCE` ("types double precision and character varying cannot be matched"). Then **every** `POST /admin/campanhas/:id/rotas` would fail with a 500. The unit tests mock the query, so they cannot show this. Check: run `SELECT pg_typeof(latitude) FROM dw.cadastro_empresa LIMIT 1` in homolog. If it returns a numeric type, cast both sides (for example reuse `sqlCoordenadaTexto` for `o` and `ce.latitude::double precision`), the way `buscarOficinasBase` does.
- **R-2 (Minor):** the dw side of the search coordinates is cast without a guard (`service/oficinaService.ts:686-688`). If the column really is text with junk values, the whole search returns 500. This is the same unknown as R-1, and one `pg_typeof` answers both.

### Discrimination sensor (revision)

Sensor depth: **P0 (≥ 5 required), 21 valid behavior-level manual mutations**. Scratch: `git -c core.longpaths=true worktree add --detach <scratchpad>/bp-sensor2 HEAD` and `git worktree add --detach <scratchpad>/ob-sensor2 HEAD`, each with a `node_modules` junction (`mklink /J`). The runner is my own (`verif_rev_sensor.py`, not the author's scripts). It applies one exact-string mutation, runs the targeted suites with `npx jest`, and restores the file byte for byte. Baseline before mutating: BP targeted suites 5/5 (69 tests) green; OB `lib/__tests__` 20/20 green. Two drafts of R16 failed to compile under ts-jest ("0 total"). They were discarded as invalid and replaced by the type-valid R16b.

| Mutation | File | Description | Tests run | Killed? |
| --- | --- | --- | --- | --- |
| R1 | BP `utils/filtroBuscaOficina.ts:133` | elevators `>=` → `>` | filtroBuscaOficina + oficinaServiceBuscaBase | ✅ Killed (3 failed) |
| R2 | BP `utils/filtroBuscaOficina.ts:138` | UF condition dropped from the `WHERE` | same | ✅ Killed (4) |
| R3 | BP `utils/filtroBuscaOficina.ts:142` | city parameter not normalized (case and accent) | same | ✅ Killed (3) |
| R4 | BP `utils/filtroBuscaOficina.ts:55-57` | city without UF accepted (no 400) | filtroBuscaOficina + adminDisparoBusca | ✅ Killed (2) |
| R5 | BP `utils/filtroBuscaOficina.ts:45` | elevators `< 0` → `< 1` (0 rejected, off-by-one) | same | ✅ Killed (1) |
| R6 | BP `utils/filtroBuscaOficina.ts:40` | lines not upper-cased (case-sensitive) | same | ✅ Killed (2) |
| R7 | BP `service/oficinaService.ts:732` | fixed criterion `status_receita = 'ATIVA'` dropped | oficinaServiceBuscaBase | ✅ Killed (2) |
| R8 | BP `service/oficinaService.ts:747` | `truncado` off-by-one (`>` → `>=`, 5000 counts as truncated) | same | ✅ Killed (1) |
| R9 | BP `service/oficinaService.ts:741` | `LIMIT` without the extra row (truncation never detected) | same | ✅ Killed (2) |
| R10 | BP `service/oficinaService.ts:805` | `semCoordenadas` only when both coordinates are missing (`||` → `&&`) | same | ✅ Killed (1) |
| R11 | BP `service/oficinaService.ts:726` | `rotaAtual` counts `CANCELADO` routes again | same | ✅ Killed (1) |
| R12 | BP `service/adminDisparoService.ts:195` | `totalRotas` counts `CANCELADO` again | adminDisparoService | ✅ Killed (1) |
| R13 | BP `service/adminDisparoService.ts:416-419` | distribution sends no-coordinate workshops to `foraDoAlcance` | adminDisparoRotas | ✅ Killed (2) |
| R14 | BP `service/adminDisparoService.ts:512-513` | `coordenadaOuNula` → `numeroOuNulo` (`""` becomes 0, text becomes NaN) | adminDisparoRotas | ✅ Killed (1) |
| R15 | BP `service/adminDisparoService.ts:315` | query failure rethrown raw (no spec 500) | adminDisparoBusca | ✅ Killed (1) |
| R16b | BP `service/adminDisparoService.ts:289-290` | cities with a missing UF query the database (no 400) | adminDisparoBusca | ✅ Killed (2) |
| R17 | BP `utils/filtroBuscaOficina.ts:63` | 3-letter UF accepted | filtroBuscaOficina + adminDisparoBusca | ✅ Killed (2) |
| R18 | BP `service/adminDisparoService.ts:304-305` | filters validated after the campaign query (breaks "sem consultar a base") | adminDisparoBusca | ✅ Killed (3) |
| O1 | OB `lib/disparoVisitas.ts` `validarFiltros` | city without UF accepted | lib/__tests__ | ✅ Killed (1) |
| O2 | OB `lib/disparoVisitas.ts` `validarFiltros` | elevators `< 0` → `<= 0` | lib/__tests__ | ✅ Killed (1) |
| O3 | OB `lib/disparoVisitas.ts` `validarFiltros` | 3-letter UF accepted | lib/__tests__ | ✅ Killed (1) |

**Result**: 21/21 valid mutants killed, 0 survived - PASS ✅

Isolation: I removed only the junction links (`cmd /c rmdir <scratch>\node_modules`); the real `node_modules` of both repos is intact. Then I ran `git worktree remove --force` for both scratches, and `git worktree list` shows only the main trees. `git status --porcelain` after cleanup is **identical** to the pre-sensor baseline in both repos. backend-promotor: ` M .specs/LESSONS.md`, ` M .specs/lessons.json`, ` M __tests__/unit/geolocationService.test.ts`, ` M package-lock.json`, ` M scripts/atualizar-lat-long-comunidade.ts`, ` M service/geolocationService.ts`, `?? __tests__/unit/geocodificacaoRegiao.test.ts`, `?? utils/geocodificacaoRegiao.ts`. ob-ads: clean. None of the user's WIP files was touched. Not mutated: the ob-ads React components (`StepFiltrosBusca`, `StepRotasAdmin`, `page.tsx`), because the Test Coverage Matrix exempts them (UAT).

### Gate check (revision)

| Repo | Command | Result |
| --- | --- | --- |
| backend-promotor | `npm run test:unit` | 49 suites: 48 passed, 1 failed. **911/911 tests passed.** The only red suite is `segmentacaoCampanhaPromotor.test.ts`, which fails to compile (missing `utils/migrationRepository`, `helpers/mockMigrationRepo`). That is pre-existing and known. The 12 `campanhaService*` failures from the earlier report no longer appear. (This run uses the working tree, so it includes the user's WIP tests.) |
| backend-promotor | `npx jest __tests__/integration/visitaRecusar.test.ts __tests__/integration/visitaConfirmar.test.ts __tests__/integration/visitaExchange.test.ts __tests__/integration/adminDisparo.test.ts` | 4 suites, **84/84 passed** (78 before the revision; the new cases are the 3 new routes × 4 auth cases, the 400/500 mappings and the 404 for removed routes, minus the removed CRM cases) |
| backend-promotor | `npx tsc --noEmit` | 2 errors, both in `__tests__/unit/segmentacaoCampanhaPromotor.test.ts` (baseline). 0 new |
| ob-ads | `npx jest lib/__tests__` | 1 suite, **20/20 passed** |
| ob-ads | `npx tsc --noEmit` | 49 errors: 18 in `ActivationConfirmDialog.test.tsx` + 31 in `TrainingConfigure.activation.test.tsx`. Same files and count as the baseline; 0 in the 8 changed files |

I ran no DB-backed test (no `test:integration`, no `visitaEndereco.test.ts`, nothing that imports `__tests__/integration/setup.ts`) and applied no migration.

Test integrity: `adminDisparoSegmentacao.test.ts` (-182) and `oficinaServiceBaseSegmentada.test.ts` (-222) were deleted together with the behavior the spec removed (the CRM segmentation, `getOficinasBaseSegmentadas`). Their replacements are `adminDisparoBusca.test.ts` (+115), `oficinaServiceBuscaBase.test.ts` (+218) and `filtroBuscaOficina.test.ts` (+133). The deletion is justified by the spec's Out-of-Scope row "Segmentação do CRM na busca do admin". One existing assertion changed: `foraDoAlcance [12,13]` → `[12]` + `semCoordenadas [13]`. CONV-48 requires that change.

### Code quality (revision)

| Check | Status |
| --- | --- |
| Minimum code / no scope creep | ✅ New code maps to CONV-06..12, 16, 48. The CRM constants, `chamarCrm` and the dead code were removed. `SegmentacaoService.valoresDeCampo` stays for the client route (design) |
| Surgical changes | ✅ `AdminDisparoErro` moved to `utils/adminDisparoErro.ts` (re-exported), so the pure util can throw it without a service import. `numeroOuNulo` still serves the non-coordinate ids |
| Matches patterns | ✅ `createDocumentedRoute`, router-level `adminAuthMiddleware`, parameterized SQL (no value inlined, asserted at `filtroBuscaOficina.test.ts:116`) |
| L-002 (every route has its own middleware integration test) | ✅ 3 new routes × 401/401/403/200 |
| L-004 (SQL asserted) | ✅ All new raw SQL is asserted: joins, aliases, `WHERE`, `LIMIT`, parameters |
| Every test maps to a requirement | ✅ Test names cite T37-T41/T47 and CONV-xx |

### Items needing human UAT (revision)

1. **Homolog DB, before anything else (R-1/R-2):** run `SELECT pg_typeof(latitude), pg_typeof(longitude) FROM dw.cadastro_empresa LIMIT 1`. Then run one `POST /admin/campanhas/:id/rotas` (manual assignment) and one with `distribuir: true`, and confirm neither returns 500.
2. **Homolog DB, search semantics (SPG-9):** run the spec's Independent Test, UF=SP, cidade=Campinas, linha=Leve, elevadores>=2, and confirm only matching workshops come back. Run a search with no filter and confirm 5000 rows with `truncado: true`. Measure its time (design risk: whole-table scan with `EXISTS`). Search for a city with an accent written without it, for example "Sao Joao del-Rei".
3. **Browser, ob-ads `/admin/disparo-visitas/[id]`:**
   - Line chips come from the database.
   - The elevator field is empty by default.
   - The city select stays disabled until a UF is chosen, and reloads when the UF changes (clearing the old city).
   - "Buscar oficinas" is always enabled.
   - The "Resultado parcial: refine os filtros" warning appears.
   - A 500 keeps the previous result and selection.
   - 0 results shows "Nenhuma oficina atende aos filtros" (SPG-7) and "Montar rotas" is disabled.
   - In step 2, a workshop without coordinates has the "Sem localização" badge, has no map pin, and can be assigned manually. After a distribution, it is flagged "Sem localização: atribua manualmente".
4. Earlier UAT items 1 (the non-segmentation parts), 2, 3, 5 and 6 still apply.

### Fix plans (revision, non-blocking)

- **Fix R-1 (Major, only if `pg_typeof` confirms a numeric dw column):** cast both sides of the coordinates in `situacaoDasOficinas` (`service/adminDisparoService.ts:481-482`), the same way `buscarOficinasBase` does. Add an L-004 assertion on the projection.
- **Fix SPG-6/SPG-7 (spec only):** add "Filtros de busca inválidos" (or reuse a spec message) to CONV-08. Rewrite the "0 oficinas" edge case to "Nenhuma oficina atende aos filtros" and "Montar rotas".
- **Fix SPG-8 (optional):** move `carregarCampanha` inside the `try`, or accept the generic 500 in the spec.
- **Housekeeping:** unify `normalizarTexto`/`sqlTextoNormalizado` with `utils/geocodificacaoRegiao.ts` once that file is committed (SPEC_DEVIATION `utils/filtroBuscaOficina.ts:72`).

### Requirement traceability update (revision)

| Requirement | Previous | New |
| --- | --- | --- |
| CONV-06, CONV-07, CONV-09 | Implementing | ✅ Verified (SQL) / DB UAT pending (SPG-9) |
| CONV-08, CONV-16, CONV-18 | Implementing | ✅ Verified |
| CONV-10, CONV-11, CONV-12 | Implementing | ✅ Verified (backend) / UI UAT pending |
| CONV-48 | Implementing | ✅ Verified (unit) / UI UAT pending; runtime depends on R-1 |

### Summary (revision)

**Overall**: ✅ Ready for UAT, with conditions (R-1 is checked first)

**Spec-anchored check**: 11/11 revised requirements traced to evidence (CONV-06..12, 16, 18, 48, plus auth on the 3 new routes). 4 spec-precision gaps (SPG-6..9). 1 runtime risk found by reading (R-1).
**Sensor**: 21/21 valid mutations killed (P0 depth; 2 invalid compile-failing drafts discarded)
**Gate**: BP unit 911/911 tests (1 pre-existing compile-red suite); BP integration 84/84; BP tsc baseline (2); OB jest 20/20; OB tsc baseline (49)

---

## Re-verificação 2026-10-06 (endereço atualizado)

### Iteração 1 (histórico, superada pela iteração 2 no fim desta seção): FAIL ❌

**Date**: 2026-10-06
**Scope**: CONV-49 (Guardas AC7, AC8, AC9) and CONV-50 (Guardas AC10), plus the assumptions rows "Guarda endereço recente", "Quem grava `DATA_ATUALIZACAO_ENDERECO`" and "Dependência de deploy".
**Verifier**: independent sub-agent (author ≠ verifier), evidence-or-zero. I re-derived this from `spec.md` and the diffs. I did not reuse the author's notes.

The verdict is FAIL for one reason: AC7 ("distinguir, para o admin") breaks in the admin panel totals and in the API filter. The new state `aceita_endereco_recente` is missing from `ESTADOS_CONVITE` (`service/adminDisparoService.ts:62-75`). The dispatch guard (AC8/AC9) and the address write (AC10) pass, and the sensor killed every mutant.

**Diff ranges**

| Repo | Range | Commits |
| --- | --- | --- |
| backend-promotor | `cea0fa4..d9c6463` | T49 `648e2e1` (11 files, +222/-12), T50 `d9c6463` (2 files, +18/-4) |
| ob-ads (worktree `ob-ads-disparo-convite`) | `24813856..42b831d9` | T51 `42b831d9` (3 files, +3) |

### Task completion

| Task | Status | Notes |
| --- | --- | --- |
| T49 | ⚠️ Partial | Guard, enum, CHK, entity and `estadoConvite` are done. `ESTADOS_CONVITE` in the admin panel was not updated (gap G-1). |
| T50 | ✅ Done | - |
| T51 | ✅ Done | Label is correct. (Correção na iteração 2: o chip do ob-ads conta no cliente a partir de `rotulosEstadoConvite`, então ele não ficava vazio. G-1 afetava só a API.) |

### Spec-anchored acceptance criteria

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC8: `DATA_ATUALIZACAO_ENDERECO >= agora - 3 meses` → no message, `CONFIRMADO` + `ORIGEM_ACEITE='ENDERECO_RECENTE'` | No send; STATUS `CONFIRMADO`; origin `ENDERECO_RECENTE` | Impl `service/notificacaoVisitaService.ts:537-544`. Test `__tests__/unit/despacharNotificacao.test.ts:190` `toEqual({desfecho:"ACEITO",origem:ENDERECO_RECENTE})`; `:191` `sendMock not.toHaveBeenCalled()`; `:193` `gravado.STATUS toBe(CONFIRMADO)`; `:194` `gravado.ORIGEM_ACEITE toBe(ENDERECO_RECENTE)`; `:196` `TOKEN_HASH toBeUndefined()` | ✅ PASS |
| AC8 boundary ("posterior ou igual") | Exactly 3 calendar months ago counts as recent | `__tests__/unit/envioGuards.test.ts:315` `enderecoAtualizadoRecente(2026-07-06T12:00Z, AGORA) toBe(true)`; `:319` one ms earlier `toBe(false)`; `:311` within the window `toBe(true)` | ✅ PASS |
| AC8 ordering (decides before the other guards; T49 Done-when) | Does not look up the open invite or the recipient | `__tests__/unit/despacharNotificacao.test.ts:202` `convitePendenteDaOficina not.toHaveBeenCalled()`; `:203` `usuarioRepo.find not.toHaveBeenCalled()` | ✅ PASS |
| AC9: null → follows the other guards and sends | Send happens normally | `__tests__/unit/envioGuards.test.ts:306-307` null/undefined `toBe(false)`. Dispatch with null: the existing ENVIADO happy path (`despacharNotificacao.test.ts:123` `sendMock toHaveBeenCalledTimes(1)`, oficina fixture has no column = undefined) | ✅ PASS |
| AC9: older than 3 months → sends normally | Send happens normally | `__tests__/unit/despacharNotificacao.test.ts:218` `toMatchObject({desfecho:"ENVIADO"})`; `:219` `sendMock toHaveBeenCalledTimes(1)` (4 months) | ✅ PASS |
| AC7: admin tells apart "aceita pelo reparador", "por confirmação recente" and "por endereço atualizado" (per-row state) | `estadoConvite` → `aceita_endereco_recente`; label "Aceita (endereço atualizado)" | `__tests__/unit/statusNotificacaoVisita.test.ts:255-258` table row `ENDERECO_RECENTE → 'aceita_endereco_recente'`; ob-ads `lib/__tests__/disparoVisitas.test.ts:83` + `:92` `rotulosEstadoConvite toEqual(esperado)` | ✅ PASS |
| AC7: admin panel totals and filter (`GET /admin/campanhas/:id/rotas`, CONV-41/42 contract: "totais de todos os estados") | `totaisPorEstado.aceita_endereco_recente` = count; `?estado=aceita_endereco_recente` is accepted | **No evidence.** A scratch probe (not committed) showed `totaisPorEstado.aceita_endereco_recente = NaN` (JSON `null`) for 1 ENDERECO_RECENTE row, and `listarRotasComEstado(77,"aceita_endereco_recente")` rejecting with `AdminDisparoErro: Estado de convite inválido` (400). Root cause: `service/adminDisparoService.ts:62-75` `ESTADOS_CONVITE` lacks the new state, so `:691` seeds no key and `:707` does `undefined += 1`. `__tests__/unit/adminDisparoEstado.test.ts:112` compares the keys with `ESTADOS_CONVITE` itself (tautological), and `:113-126` lists the 12 old states, so it cannot catch the gap. (Correção na iteração 2: a frase original dizia que o chip do ob-ads ficava vazio. Está errada. `StepDisparo.tsx:83-89` calcula os totais no cliente a partir de `ESTADOS = Object.keys(rotulosEstadoConvite)`, e o filtro em `:91` também roda no cliente. O defeito estava só na resposta da API: `totaisPorEstado` e `?estado=`.) | ❌ GAP (G-1) |
| AC10: `PUT /visita/endereco` writes `DATA_ATUALIZACAO_ENDERECO` with the instant of the correction, in the same write | Same `update` as the 7 address fields, value = `agora` | Impl `service/visitaConfirmacaoService.ts:385-391` (single `manager.update` inside `AppDataSourceSync.transaction`). Test `__tests__/unit/visitaConfirmacaoService.test.ts:743-746` `oficinaRepo.update toHaveBeenCalledWith({ID_OFICINA}, {...enderecoCorrigido, DATA_ATUALIZACAO_ENDERECO: AGORA})`; `:748-759` keys = 7 + `DATA_ATUALIZACAO_ENDERECO`; `:1009-1012` same on the dw-failure path | ✅ PASS |
| AC1 (unchanged, regression): `DATA_ALTERACAO` does not suppress | Sends | `__tests__/unit/despacharNotificacao.test.ts:157-167` `sendMock toHaveBeenCalledTimes(1)` | ✅ PASS |

**Assumptions rows**

| Row | Evidence | Result |
| --- | --- | --- |
| Guarda endereço recente (`timestamptz`, new column, `ENDERECO_RECENTE`) | `entities/Oficina.ts:97-98` `timestamp with time zone`, nullable; `entities/NotificacaoVisita.ts:36` enum `ENDERECO_RECENTE`; `scripts/migration-convite-visita-admin.sql:137` CHK includes `'ENDERECO_RECENTE'`, `:255` COMMENT updated. CHK not applied, as instructed (DB UAT) | ✅ (static) |
| Quem grava `DATA_ATUALIZACAO_ENDERECO` | Promotor side: AC10 above. The communities modal is outside this diff | ✅ |
| Dependência de deploy | `backend-communities/SQL/migrations/2026-10-modal-aquisicao-oficina-data-atualizacao-endereco.sql:74` `ADD COLUMN IF NOT EXISTS "DATA_ATUALIZACAO_ENDERECO" TIMESTAMPTZ NULL`; prerequisite documented in `scripts/migration-convite-visita-admin.sql:23-25` and in the T49 commit message. Not executable as a test | ✅ documented / deploy-order item for UAT |

**Observations (not gaps)**

- The new guard runs **after** "campanha encerrada" (`notificacaoVisitaService.ts:527-529`). A row of an ended campaign becomes `DISPENSADO`, not `ENDERECO_RECENTE`. The spec does not order these two. This is consistent with the guard-3 rationale. It is not tested in combination.
- There is no test that combines "endereço recente" with "convite aberto". The ordering is pinned only by the not-called assertions at `:202-203` (sensor M8 killed).

### Discrimination sensor (scratch `git worktree add --detach <scratchpad>/bp-sensor HEAD` + `<scratchpad>/ob-sensor`, node_modules junctions)

| # | File:line | Mutation | Tests run | Killed? |
| --- | --- | --- | --- | --- |
| M1 | `service/envioGuards.ts:29` | `>=` → `>` at the 3-month limit | envioGuards + despacharNotificacao | ✅ Killed (`envioGuards.test.ts:315`) |
| M2 | `service/envioGuards.ts:28` | null → `return true` | same | ✅ Killed (27 failures) |
| M3 | `service/notificacaoVisitaService.ts:540` | `ORIGEM_ACEITE` `ENDERECO_RECENTE` → `CONFIRMACAO_RECENTE` | despacharNotificacao | ✅ Killed (`:194`) |
| M4 | `service/visitaConfirmacaoService.ts:390` | `DATA_ATUALIZACAO_ENDERECO` not written (`endereco` only) | visitaConfirmacaoService | ✅ Killed (2 tests) |
| M5 | `utils/statusNotificacaoVisita.ts:100` | `ENDERECO_RECENTE` → `"aceita"` in `estadoConvite` | statusNotificacaoVisita | ✅ Killed |
| M6 | `service/notificacaoVisitaService.ts:539` | `STATUS CONFIRMADO` → `DISPENSADO` | despacharNotificacao | ✅ Killed (`:193`) |
| M7 | `service/visitaConfirmacaoService.ts:390` | `agora` → `new Date()` (not the instant of the correction) | visitaConfirmacaoService | ✅ Killed (2 tests) |
| M8 | `service/notificacaoVisitaService.ts:534-544` | guard block moved after the convite-aberto guard | despacharNotificacao | ✅ Killed (`:202`) |
| M9 | `service/envioGuards.ts:29` | window 3 → 2 months | envioGuards + despacharNotificacao | ✅ Killed (`:315`) |
| M10 | ob-ads `lib/disparoVisitas.ts:47` | label → `'Aceita'` (same as reparador) | ob-ads `lib/__tests__` | ✅ Killed (`disparoVisitas.test.ts:92`) |
| Probe | `service/adminDisparoService.ts:62` (no mutation; unmodified HEAD) | ENDERECO_RECENTE row through `listarRotasComEstado` | throwaway probe test | ❌ Defect confirmed: totals `NaN`, filter 400 (G-1) |

**Sensor depth**: expanded (≥5 behavior mutations). **Sensor outcome**: 10/10 killed, 0 survived. The sensor itself passes. G-1 is a coverage gap in code the diff did not touch, not a surviving mutant.
**Isolation**: both scratch worktrees were removed (junction removed first with `rmdir`, then `git worktree remove --force`). `git status --porcelain` matches the pre-sensor baseline in backend-promotor (8 user WIP entries) and in the ob-ads worktree (clean).

### Gate check

| Gate | Result |
| --- | --- |
| BP `npm run test:unit` | 919/919 tests passed; 48/49 suites. The only red suite is `segmentacaoCampanhaPromotor.test.ts` (TS2307, pre-existing) |
| BP integration subset (visitaRecusar, visitaConfirmar, visitaExchange, adminDisparo) | 84/84 passed (4 suites) |
| BP `npx tsc --noEmit` | exit 2, only the 2 pre-existing TS2307 errors in `segmentacaoCampanhaPromotor.test.ts` |
| OB worktree `npx jest lib/__tests__` | 20/20 passed |
| OB worktree `npx tsc --noEmit` | 49 errors = baseline (all under `app/`, untouched training tests) |
| DB-backed tests / migrations | Not run (`visitaEndereco.test.ts`, `npm run test:integration`), as instructed |

### Code quality

| Check | Status |
| --- | --- |
| Minimum code / surgical | ✅ (+20 lines of service code, a pure helper that reuses `mesesAtras`) |
| Matches patterns | ✅ (same shape as the CONFIRMACAO_RECENTE branch; `idReferencia` became optional, which is a justified type widening) |
| Completeness of the enum fan-out | ❌ `ESTADOS_CONVITE` (backend) missed. The ob-ads `EstadoConvite` and labels were updated |
| Tests map to ACs, non-shallow | ✅ except the tautological key check at `adminDisparoEstado.test.ts:112` |

### Fix plans

- **Fix G-1 (Major, blocks AC7 in the panel):** add `"aceita_endereco_recente"` to `ESTADOS_CONVITE` (`backend-promotor/service/adminDisparoService.ts:62-75`, after `aceita_importada` so the order matches the ob-ads labels). In `__tests__/unit/adminDisparoEstado.test.ts`, add a `CONFIRMADO/ENDERECO_RECENTE` row to the fixture (`:41-53`) and to the expected states (`:68+`). Add `aceita_endereco_recente: 0` to the literal totals at `:113-126`. Replace the tautological `:112` with a check against the `EstadoConvite` union, for example a `Record<EstadoConvite, true>` literal, so a future enum value fails at compile time. Verify that `?estado=aceita_endereco_recente` returns 200.

### Requirement traceability update

| Requirement | Previous | New |
| --- | --- | --- |
| CONV-49 | Implementing | ❌ Needs fix (AC8/AC9 ✅ verified; AC7 panel totals/filter G-1) |
| CONV-50 | Implementing | ✅ Verified (unit). DB UAT: column must exist (deploy order) |

### Summary (iteração 1, histórico)

**Overall**: ❌ Not ready. One Major gap with a one-line fix.
**Spec-anchored check**: 8/9 criteria rows matched the spec outcome. AC7 is partial (G-1). No new spec-precision gaps.
**Sensor**: 10/10 mutations killed, 0 survived.
**Gate**: BP unit 919/919 (1 pre-existing compile-red suite); BP integration 84/84; BP tsc baseline (2); OB jest 20/20; OB tsc baseline (49).

### Validation (re-verificação 2026-10-06, iteração 2 - veredito atual): PASS ✅

**Date**: 2026-10-06
**Diff range**: backend-promotor `d9c6463..aa07431` (T52 `aa07431`: `service/adminDisparoService.ts` +1, `__tests__/unit/adminDisparoEstado.test.ts` +34/-2, tasks.md). ob-ads is unchanged (`42b831d9`).
**Verifier**: the same independent sub-agent (author ≠ verifier), evidence-or-zero.

**G-1 closed**

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC7 (admin panel): the API totals count the new state | `totaisPorEstado.aceita_endereco_recente` = 1 for one ENDERECO_RECENTE row | Impl `service/adminDisparoService.ts:70` (state in `ESTADOS_CONVITE`). Fixture row `__tests__/unit/adminDisparoEstado.test.ts:72`. Test `:156` `r.totaisPorEstado.aceita_endereco_recente toBe(1)`; `:166` sum of totals `toBe(14)` | ✅ PASS |
| AC7 (admin panel): `?estado=aceita_endereco_recente` is accepted and filters | Only that row is returned, with no 400 | `adminDisparoEstado.test.ts:153` `listarRotasComEstado(77,"aceita_endereco_recente")`; `:155` `r.rotas.map(estado) toEqual(["aceita_endereco_recente"])` | ✅ PASS |
| AC7: the state list cannot drift from the `EstadoConvite` union | Every union member is listed | `adminDisparoEstado.test.ts:6-20` `TODOS_OS_ESTADOS: Record<EstadoConvite, true>` (a compile error if a member is missing or extra); `:132` `[...ESTADOS_CONVITE].sort() toEqual(Object.keys(TODOS_OS_ESTADOS).sort())`; `:133` same for the keys of `totaisPorEstado`; `:142` `aceita_endereco_recente: 0` in the literal totals | ✅ PASS |
| AC7 (ob-ads screen) | A distinct chip and label | Coordinator's claim confirmed by reading the code: `StepDisparo.tsx:24` `ESTADOS = Object.keys(rotulosEstadoConvite)`; `:83-89` totals counted on the client; `:91` filter on the client; label `lib/disparoVisitas.ts:47`, test `lib/__tests__/disparoVisitas.test.ts:92` | ✅ PASS |

All other rows from iteration 1 (AC1, AC8, AC9, AC10 and the assumptions rows) still hold. T52 does not touch those files.

**Sensor, iteration 2** (scratch `git -c core.longpaths=true worktree add --detach <scratchpad>/b2 HEAD`, node_modules junction; `adminDisparoEstado.test.ts`)

| # | File:line | Mutation | Killed? |
| --- | --- | --- | --- |
| G1a | `service/adminDisparoService.ts:70` | `"aceita_endereco_recente"` removed from `ESTADOS_CONVITE` | ✅ Killed (3 tests: `:132`, `:155-156`, `:166`) |
| G1b | `service/adminDisparoService.ts:708` | totals `+= 1` → `= 1` | ✅ Killed (`:166` sum) |
| G1c | `service/adminDisparoService.ts` return | `?estado` filter ignored (returns all rows) | ✅ Killed (2 tests) |
| G1d | `service/adminDisparoService.ts:692` | totals seeded without `aceita_endereco_recente` | ✅ Killed (3 tests) |

**Sensor total (iterations 1 + 2)**: 14/14 killed, 0 survived. The first scratch attempt (`bp-sensor2`) failed on a too-long path during checkout and never registered as a worktree. I deleted the partial directory before creating the junction, and `git worktree prune` left only the real tree. `b2` was cleaned up as before (junction removed with `rmdir`, then `git worktree remove --force`). `git status --porcelain` matches the pre-sensor baseline.

**Gate, iteration 2**

| Gate | Result |
| --- | --- |
| BP `npm run test:unit` | 920/920 passed (+1 test, the new count-and-filter test); 48/49 suites. The only red suite is `segmentacaoCampanhaPromotor.test.ts` (pre-existing) |
| BP integration subset (4 suites) | 84/84 |
| BP `npx tsc --noEmit` | only the 2 pre-existing TS2307 errors (`segmentacaoCampanhaPromotor.test.ts`) |
| OB worktree `npx jest lib/__tests__` | 20/20 |
| OB worktree `npx tsc --noEmit` | 49 = baseline |

**Requirement traceability update (current)**

| Requirement | Previous | New |
| --- | --- | --- |
| CONV-49 | ❌ Needs fix (G-1) | ✅ Verified (unit). DB UAT: the CHK with `ENDERECO_RECENTE` must be applied |
| CONV-50 | ✅ Verified (unit) | ✅ Verified (unit). DB UAT: the column must exist (deploy order: the backend-communities migration goes first) |

**Remaining (non-blocking)**: no test combines "endereço recente" with "convite aberto" or with "campanha encerrada". The spec does not order the guard relative to "campanha encerrada". UAT: apply the migrations in order (backend-communities column first, then the promotor CHK) before the deploy.

**Summary (current)**: ✅ Ready for UAT. Spec-anchored check: 10/10 rows matched (AC1, AC7 ×2, AC8 ×3, AC9 ×2, AC10, plus the assumptions). Sensor: 14/14 killed. Gate: BP unit 920/920, integration 84/84, tsc baseline; OB jest 20/20, tsc baseline 49.
