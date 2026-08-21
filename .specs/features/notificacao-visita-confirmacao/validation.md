# Notificação de Visita e Confirmação do Reparador Validation

## Validation: notificacao-visita-confirmacao — FAIL ❌

**Date**: 2026-08-05 (re-verification iteration 2)
**Spec**: `.specs/features/notificacao-visita-confirmacao/spec.md`
**Diff range**: `c842273c5f8e7d5cb0c13ef4ad7efaaa0a4de004..HEAD` (`d982466`, 34 commits, T1–T27)
**Verifier**: independent sub-agent (author ≠ verifier), coverage re-derived from `spec.md`

**Verdict**: ❌ **FAIL** — every acceptance criterion, P1 and P2, now has evidence whose asserted
value matches the spec-defined outcome. The failure is not a coverage gap but a
**discrimination gap**: two behaviour-level mutations against the raw-SQL half of the P2 AC2 fix
(`getActiveCampanhaByPromotor`) survived the full suite. Deleting the `LEFT JOIN` that makes the
promoter app's route list carry any status at all leaves `npm test` byte-identical to baseline.

---

## What changed since iteration 1

| Fix | Commit | Closes | Verdict this round |
| --- | --- | --- | --- |
| F1 — route-list confirmation status | `60f3e97` | P2 AC2 | ⚠️ Implemented and asserted; the mapper is discriminating, the query is not (M4, M11) |
| F2 — per-visit rate limit on `POST`/`PUT` | `9c16167` | AC25 (authenticated half) | ✅ Closed — the bucket test genuinely distinguishes a constant `keyGenerator` (M5 killed) |
| F3 — HTTP status codes pinned | `d982466` | 3 spec-precision gaps | ✅ Closed — table matches the implementation line for line |

---

## Task Completion

| Task | Status | Notes |
| --- | --- | --- |
| T1–T24 | ✅ Done | - |
| T25 | ⚠️ Partial | Both route-list paths implemented and status-mapped, but the "Done when" clause *"joins `CAMPANHAS_OB.NOTIFICACAO_VISITA` in the route-list query"* has no assertion behind it — see Gap 1 |
| T26 | ✅ Done | 4 new integration tests; production limiter config unchanged (`routes/VisitaRoute.ts:17-18`, `:34-57`) |
| T27 | ✅ Done | Docs only; no code touched |

---

## Spec-Anchored Acceptance Criteria — P1

Re-derived from `spec.md`. Every citation below was opened and read this round; the sensor
(M5–M11) independently confirms the cited assertions are load-bearing rather than decorative.

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 exactly one row, `PENDENTE`, linked to route | one `create`, STATUS `PENDENTE`, `ID_ROTA_PROMOTOR` set | `__tests__/unit/notificacaoVisitaService.test.ts:103` — `expect(notifRepo.create).toHaveBeenCalledTimes(1)`; `:109` — `expect(persistidos[0].STATUS).toBe(StatusNotificacaoVisita.PENDENTE)`; `:110` — `expect(persistidos[0].ID_ROTA_PROMOTOR).toBe(ID_ROTA)` | ✅ PASS |
| AC1 trigger on every route-creation path | one notification per created route | `__tests__/unit/rotaService.test.ts:237` — `expect(notificarVisitaMock).toHaveBeenCalledTimes(1)`; `:254` — `…toHaveBeenCalledTimes(3)`; `:300` — `…toHaveBeenCalledTimes(2)`; `:338` — `…toHaveBeenCalledTimes(1)`; `:347` — `expect(notificarVisitaMock).not.toHaveBeenCalled()` | ✅ PASS |
| AC2 recipient order `DATA_ALTERACAO DESC` nulls last, `ID_USUARIO ASC`, take first | exact order clause; first *qualifying* user | `…notificacaoVisitaService.test.ts:160` — `expect(usuarioRepo.find).toHaveBeenCalledWith({ where:{ID_OFICINA}, order:{ DATA_ALTERACAO:{direction:"DESC",nulls:"LAST"}, ID_USUARIO:"ASC" }})`; `:179` — `expect(resultado.ID_USUARIO).toBe(4)` | ✅ PASS |
| AC3 no phone → `FALHOU` / `"no recipient with phone"`, no send | exact string | `…notificacaoVisitaService.test.ts:149-152` — `expect(resultado.ERRO_ENVIO).toBe("no recipient with phone")`, `expect(sendMock).not.toHaveBeenCalled()` | ✅ PASS |
| AC4 normalize to `55DDDNNNNNNNNN`; invalid → no dispatch | digits-only, valid DDD, fail closed | `__tests__/unit/telefone.test.ts:8-66` (15 cases); `…notificacaoVisitaService.test.ts:205-209` — `ERRO_ENVIO === "invalid phone"`, `TOKEN_HASH` null; `__tests__/unit/whatsappChannel.test.ts:135` | ✅ PASS |
| AC5 token issued **before** dispatch, `EXPIRA_EM = now + 168h` | exactly 168h from a frozen clock; persist precedes send | `…notificacaoVisitaService.test.ts:219` — `expect(resultado.EXPIRA_EM).toEqual(new Date("2026-08-12T12:00:00.000Z"))` from frozen `2026-08-05T12:00:00.000Z`; `:224` — `expect(sendMock.mock.invocationCallOrder[0]).toBeGreaterThan(notifRepo.save.mock.invocationCallOrder[indiceComToken])` | ✅ PASS |
| AC6 exact URL / Bearer header / body shape | `{baseUrl}/api/v1/messages/send-template`, `Bearer {key}`, full body | `__tests__/unit/whatsappChannel.test.ts:151-164` — full `expect(postMock).toHaveBeenCalledWith(...)`; `…notificacaoVisitaService.test.ts:242-248` — `variables[0]` = workshop name, `variables[1]` matches the URL and `hashToken(rawToken) === resultado.TOKEN_HASH` | ✅ PASS |
| AC7 `200 + success:true` → `ENVIADO`, `ENVIADO_EM`, ids stored | STATUS + both provider ids | `…notificacaoVisitaService.test.ts:258-261` — `STATUS===ENVIADO`, `MESSAGE_ID==="msg-1"`, `PROVIDER_MESSAGE_ID==="wamid.1"`, `ENVIADO_EM instanceof Date` | ✅ PASS |
| AC8 7 config error codes → `FALHOU` / `"channel not configured"` + code | exact reason + code, all 7 | `whatsappChannel.test.ts:187-207` — `describe.each` over all 7; `…notificacaoVisitaService.test.ts:275` — `expect(resultado.ERRO_ENVIO).toBe("channel not configured: TEMPLATE_NOT_FOUND")` | ✅ PASS |
| AC9 `RATE_LIMITED`/`QUOTA_EXCEEDED` → `FALHOU`, no retry | code captured, exactly one HTTP attempt | `whatsappChannel.test.ts:218-223` — `{success:false, reason:"provider rate/quota", providerCode}` + `expect(postMock).toHaveBeenCalledTimes(1)` | ✅ PASS |
| AC10 dispatch failure never breaks route creation | route returned; notification resolves `FALHOU` | `…notificacaoVisitaService.test.ts:310`, `:319`, `:330`, `:340`; `rotaService.test.ts:270` — `expect(resultado).toEqual(mockRota)` with a rejecting notification; `:311`, `:356` | ✅ PASS |
| AC11 missing account/template → skip HTTP, log payload, `FALHOU` | no HTTP call, payload logged, exact reason | `whatsappChannel.test.ts:114-123` — `describe.each` over 4 env vars | ✅ PASS |
| AC11 token survives a failed dispatch | `TOKEN_HASH`/`EXPIRA_EM` retained | `…notificacaoVisitaService.test.ts:299-300` — `expect(resultado.TOKEN_HASH).toMatch(/^[0-9a-f]{64}$/)` | ✅ PASS |
| AC12 send only when `WHATSAPP_SEND_ENABLED === "true"` exactly | no-op for unset and for `"TRUE"` | `whatsappChannel.test.ts:79-84`, `:93-94` — `expect(postMock).not.toHaveBeenCalled()` | ✅ PASS |
| AC13 `NODE_ENV==="test"` forces no-op unconditionally | no-op with full config + `SEND_ENABLED=true` | `whatsappChannel.test.ts:64-69` | ✅ PASS |
| AC14 exchange → 30-min JWT, scope, `sub`, both IDs, + name | exact claims | `__tests__/unit/visitaConfirmacaoService.test.ts:83-86`; `__tests__/unit/visitaToken.test.ts:75` — `expect(decoded.exp! - decoded.iat!).toBe(30 * 60)`; `__tests__/integration/visitaExchange.test.ts:38` — 200 over HTTP | ✅ PASS |
| AC15 re-exchangeable while live | fresh JWT each call, state stays `PENDING` | `visitaConfirmacaoService.test.ts:143-147` | ✅ PASS |
| AC16 malformed token → `TOKEN_INVALID`, no JWT, **404** | state + status now spec-pinned (F3) | `visitaConfirmacaoService.test.ts:202`, `:208`; `visitaExchange.test.ts:109` — HTTP 404 + `error:"TOKEN_INVALID"` | ✅ PASS |
| AC17 past `EXPIRA_EM` → `EXPIRED`, no JWT, **410** | state + status | `visitaConfirmacaoService.test.ts:180-181` — `toEqual({state:"EXPIRED"})` + `not.toHaveProperty("jwt")`; `visitaExchange.test.ts:99` — HTTP 410 | ✅ PASS |
| AC18 already `CONFIRMADO` → `ALREADY_CONFIRMED` + `CONFIRMADO_EM`, **200**, no JWT | state + timestamp | `visitaConfirmacaoService.test.ts:165-170` | ✅ PASS |
| AC19 confirm → atomic `ENVIADO→CONFIRMADO` + 3 audit fields | `CONFIRMADO_EM`, `CONFIRMADO_POR = jwt.sub`, `CONFIRMADO_IP` | `visitaConfirmacaoService.test.ts:273-278` — `expect(notifRepo.update).toHaveBeenCalledWith(anything, { STATUS: CONFIRMADO, CONFIRMADO_EM: AGORA, CONFIRMADO_POR: ID_USUARIO, CONFIRMADO_IP: IP })`; `:286-293` — guard `{STATUS: ENVIADO, EXPIRA_EM: MoreThan(AGORA)}` | ✅ PASS |
| AC20 bad/expired/wrong-scope JWT or non-`ENVIADO` → reject, no STATUS change, 401/403/404/409/410 | never `CONFIRMED`; codes per the F3 table | `visitaConfirmacaoService.test.ts:324`, `:333`, `:343`; `__tests__/unit/visitaAuthMiddleware.test.ts:56`/`:63` (401), `:73`/`:95`/`:113` (403); `__tests__/integration/visitaConfirmar.test.ts` — 401/403/409/410 all asserted | ✅ PASS |
| AC21 concurrent confirms → exactly one transition | one `CONFIRMED`, one `ALREADY_CONFIRMED` | `visitaConfirmacaoService.test.ts:365` — `expect(estados).toEqual(["ALREADY_CONFIRMED","CONFIRMED"])` | ✅ PASS |
| AC22 `EXPIRADO` derived at read time on **every** read path | derived, and read paths do not write | `__tests__/unit/statusNotificacaoVisita.test.ts:19-79` (9 cases incl. exact boundary ±1 ms); `visitaConfirmacaoService.test.ts:191-192` — `update`/`save` not called on an EXPIRED read; `rotaService.test.ts:399`; **and now both list paths** — `__tests__/unit/campanhaService.test.ts:580`, `:679` | ✅ PASS |
| AC23 `REAGENDADO` reserved; no route ships | enum value present, no `/visita/reagendar` | `entities/NotificacaoVisita.ts:23`; `schemas/rota.ts:211`; `routes/VisitaRoute.ts` has no `reagendar` route | ✅ PASS (build-gate-only layer per the matrix) |
| AC24 lifecycle logging with both IDs | 4 named events, each with both IDs | `…notificacaoVisitaService.test.ts:351-360` — 4 explicit `expect(console.log).toHaveBeenCalledWith(<event>, ids)` | ✅ PASS |
| AC25 20 req/min per visit — `GET`, link-token keyed | 21st → 429 `RATE_LIMITED`; separate bucket per token | `__tests__/integration/visitaExchange.test.ts:137-143`, `:152` | ✅ PASS |
| AC25 20 req/min per visit — `POST`, JWT-`ID_NOTIFICACAO_VISITA` keyed | 21st → 429; per-visit bucket | `__tests__/integration/visitaConfirmar.test.ts:204-209` — `expect(respostas.slice(0,20).every(r => r.status !== 429)).toBe(true)`, `expect(respostas[20].status).toBe(429)`, `expect(respostas[20].body).toEqual({message:"Muitas tentativas. Aguarde um minuto.", error:"RATE_LIMITED"})`; `:215-230` — visit 902 exhausted, visit 903 still `expect(outraVisita.status).toBe(200)` | ✅ PASS |
| AC25 20 req/min per visit — `PUT`, JWT keyed | same | `__tests__/integration/visitaEndereco.test.ts:183-188` and `:193-209` — identical pair on `PUT /visita/endereco` (visit 912 exhausted, 913 still `200`) | ✅ PASS |
| AC26 `DATA_ALTERACAO` < 3 months → `DISPENSADO` / `"address recently updated"` | exact string, no recipient resolution | `…notificacaoVisitaService.test.ts:119-123`; `__tests__/unit/envioGuards.test.ts:21-58` (7 boundary cases) | ✅ PASS |
| AC27 `EXPIRADO` persisted **before** the outstanding check | persist runs first | `envioGuards.test.ts:199`, `:218` — `expect(repo.update.mock.invocationCallOrder[0]).toBeLessThan(repo.findOne.mock.invocationCallOrder[0])` | ✅ PASS |
| AC28 outstanding `ENVIADO` on any Oficina → `DISPENSADO` / `"recipient has outstanding notification"` | exact string, cross-Oficina | `envioGuards.test.ts:150-151`, `:168`, `:183`; `…notificacaoVisitaService.test.ts:193-196` | ✅ PASS |
| AC29 `CONFIRMADO` within 3 months → `DISPENSADO` / `"recipient confirmed recently"` | exact string; >3 months does not block | `envioGuards.test.ts:250-251`, `:265`, `:272-285` | ✅ PASS |
| AC30 `PENDING` returns name + 7 address fields, no visit date | exactly those 7 keys | `visitaConfirmacaoService.test.ts:94-106`, `:115-125` — `expect(Object.keys(endereco).sort()).toEqual([...])`; `visitaExchange.test.ts:62` | ✅ PASS |
| AC31 `PUT` → address columns only + AC19 transition + `ENDERECO_ATUALIZADO=true` | audit fields + flag | `visitaConfirmacaoService.test.ts:450-459`, `:466`, `:541` (Oficina write ordered first) | ✅ PASS |
| AC32 non-allowlisted field → 400 validation error, no Oficina write | rejected, nothing written | `visitaConfirmacaoService.test.ts:486-…`; `__tests__/integration/visitaEndereco.test.ts:102` — HTTP 400, service not reached | ✅ PASS |
| AC33 Oficina write failure → STATUS unchanged, `ADDRESS_UPDATE_FAILED`, 500 | no false confirmation | `visitaConfirmacaoService.test.ts:511-…`, `:527`; `visitaEndereco.test.ts:142` | ✅ PASS |

### Edge cases (spec § Edge Cases)

- [x] Zero linked `Usuario` → `FALHOU` / `"no usuario linked to oficina"` — `…notificacaoVisitaService.test.ts:133-135`
- [x] Non-numeric / invalid DDD → fail closed — `telefone.test.ts:44-66`, `whatsappChannel.test.ts:135`
- [x] Expired link opened → expired state, confirmation refused — `visitaConfirmacaoService.test.ts:180`, `:311`
- [x] Second route, same Oficina → independent row — `scripts/migration-notificacao-visita.sql` (unique on `ID_ROTA_PROMOTOR`); `rotaService.test.ts:254`
- [x] Provider unreachable / timeout / non-JSON → `FALHOU`, route creation succeeds — `whatsappChannel.test.ts:263`, `:278`, `:291`
- [x] JWT issued pre-expiry, presented post-expiry → rejected — `visitaConfirmacaoService.test.ts:311`
- [x] No revocation list needed; live STATUS check governs — `visitaConfirmacaoService.test.ts:286-293`
- [x] `WHATSAPP_SEND_ENABLED=true` in a test run still blocked by `NODE_ENV=test` — `whatsappChannel.test.ts:64`
- [x] Batch sharing one recipient: first sends, rest `DISPENSADO` — `envioGuards.test.ts:150` + `…notificacaoVisitaService.test.ts:193`
- [x] Address correction bumps `DATA_ALTERACAO` → suppresses further notifications — `envioGuards.test.ts:21`
- [x] Coordinates left stale after a correction — `visitaConfirmacaoService.test.ts:466`
- [x] `DATA_ALTERACAO` NULL → treated as stale — `envioGuards.test.ts:48`, `:52`

**P1 status**: ✅ 33/33 criteria matched their spec-defined outcome, AC25 now on all three endpoints.

---

## Spec-Anchored Acceptance Criteria — P2

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| P2 AC1 route details for a `RotaPromotor` include the linked `NotificacaoVisita` STATUS and `CONFIRMADO_EM` | *effective* STATUS + timestamp | `__tests__/unit/rotaService.test.ts:381` — `relations: expect.arrayContaining(['notificacaoVisita'])`; `:399` — `expect(rota!.notificacaoVisita!.STATUS).toBe(EXPIRADO)` for a stored-`ENVIADO` row past `EXPIRA_EM`; `:414`; `:430` — `CONFIRMADO_EM`; `:438`/`:447` degrade without throwing | ✅ PASS |
| P2 AC2 promoter-app **route list** carries each route's STATUS in the `{message,data}` envelope | every route in the list carries its *effective* status | `__tests__/unit/campanhaService.test.ts:576-583` — two rows through `getActiveCampanhaByPromotor`, `expect(rotas[0].notificacaoVisita.STATUS).toBe(EXPIRADO)` for a **stored `ENVIADO`** whose `EXPIRA_EM` is `2026-08-01` under a frozen clock of `2026-08-05`, and `rotas[1]` `ENVIADO` for a live one; `:599-602` — `toEqual({STATUS: CONFIRMADO, CONFIRMADO_EM})`; `:614-617` no-row degrades to `undefined`; `:638` one query, no N+1. Envelope: `controllers/campanhaController.ts:173`. | ⚠️ PASS on outcome, **not discriminating** — see Gap 1 |
| P2 AC2 dashboard campanha-by-id route list | same | `campanhaService.test.ts:648-657` — `expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ relations: expect.arrayContaining(['campanhaPromotores.rotasPromotor.notificacaoVisita']) }))`; `:673-681` — stored `ENVIADO` past expiry reads `EXPIRADO`, live one reads `ENVIADO`; `:697` — `CONFIRMADO_EM`; `:707` — null row degrades | ✅ PASS |

**Answer to the explicitly flagged question — does P2 AC2 require `getCampanhasByClientId`?**
**No.** P2 AC1 is scoped to "route details for a `RotaPromotor`" (`RotaService.getRotaByIdWithRelations`)
and P2 AC2 to "a promoter's route list" (`getActiveCampanhaByPromotor`, the promoter app's read).
`GET /campanha/client/{clientId}` (`service/campanhaService.ts:399`) is a client-scoped *campaign*
listing for ops; the dashboard's per-route view is already served by `getCampanhaByIdWithRelations`,
which T25 covered. No criterion, and no line of `design.md`, names the client listing. Its inheriting
the field via the shared `RotaPromotorSchema` is **correct**: the field is declared `.optional()`
(`schemas/campanha.ts:142`) and that path simply never populates it — an accurate optional, not a
contract violation. **This is not a gap and should not resurface.** If ops later wants status on that
screen, it is a new requirement, not an unfinished one.

**P2 status**: ✅ both criteria covered on outcome; AC2's promoter-app half carries a discrimination gap.

---

## Spec-Precision Gaps

| Criterion | Issue | Change since iteration 1 |
| --- | --- | --- |
| AC16 / AC17 / AC18 / AC20 / AC32 / AC33 | HTTP status codes were contract-by-implementation | ✅ **Resolved by F3.** `spec.md:129-157` now carries a normative state→status table; `frontend-contract.md:192-207` mirrors it. Verified line-by-line against `controllers/visitaController.ts:19,24,29,31,35,55,64,89,100,113,122,140,143,145` and `middlewares/visitaAuthMiddleware.ts:26,33,41` — every documented code matches, and the two stale `400`/`404` claims in the contract are corrected. |
| AC19 `CONFIRMADO_IP` | Spec says "source IP of the request"; behind the ALB with no `trust proxy` this is the load balancer's address | ⚠️ Still open by design — documented in the Assumptions table and `design.md`. Recorded so the audit field is not read as a verified property of the reparador. |
| AC25 ordering vs. auth | The spec does not state whether the limiter runs before or after JWT verification; the implementation mounts it after (`routes/VisitaRoute.ts:65`, `:116`), so an unauthenticated flood never reaches a bucket | ⚠️ Still open — behaviour is deliberate and documented at `routes/VisitaRoute.ts:43-48`, but unspecified. |

---

## Discrimination Sensor

Run in an isolated `git worktree` at `<scratchpad>/sensor` (detached at `d982466`), with
`node_modules` symlinked and `.env` copied so the integration suites run. No `git stash` was used;
the real worktree was never mutated. Depth: **P0-full** (11 mutations — auth, token, data-integrity
and rate-limiting paths).

| # | File:line | Mutation | Result |
| --- | --- | --- | --- |
| M1 | `service/campanhaService.ts:49` | `STATUS: statusEfetivo({…})` → `STATUS: fonte.STATUS` (route-list mapper stops deriving `EXPIRADO`) | ✅ Killed — `campanhaService.test.ts:580` |
| M2 | `service/campanhaService.ts:386` | Removed `rota.notificacaoVisita.STATUS = statusEfetivo(...)` in `getCampanhaByIdWithRelations` | ✅ Killed — `campanhaService.test.ts:679` |
| M3 | `service/campanhaService.ts:378` | Dropped `'campanhaPromotores.rotasPromotor.notificacaoVisita'` from the relations array | ✅ Killed — `campanhaService.test.ts:648` |
| M4 | `service/campanhaService.ts:233-234` | **Deleted the `LEFT JOIN "CAMPANHAS_OB"."NOTIFICACAO_VISITA" nv ON rp."ID_ROTA_PROMOTOR" = nv."ID_ROTA_PROMOTOR"`** from the route-list query | ❌ **SURVIVED** — `npx tsc --noEmit` clean, `npm test` 222 passed / 3 failed, byte-identical to baseline |
| M5 | `routes/VisitaRoute.ts:54-55` | `limitadorAcao.keyGenerator` → constant `` `visita-jwt:constante` `` | ✅ Killed — 4 integration failures (both per-visit-bucket tests on `POST` and `PUT`) |
| M6 | `routes/VisitaRoute.ts:39` | `limitadorExchange.keyGenerator` → constant `` `visita-token:constante` `` | ✅ Killed — 2 failures in `visitaExchange.test.ts` |
| M7 | `routes/VisitaRoute.ts:18` | `LIMITE_POR_VISITA` 20 → 21 (off-by-one on "more than 20") | ✅ Killed — 3 integration failures |
| M8 | `utils/statusNotificacaoVisita.ts:27` | `EXPIRA_EM.getTime() < agora` → `> agora` (expiry derivation inverted) — *iteration-1 regression sample* | ✅ Killed — 23 failures (was 17; the new list-path tests add 6) |
| M9 | `service/notificacaoVisitaService.ts:14` | `HORAS_VALIDADE_TOKEN` 168 → 48 — *iteration-1 regression sample* | ✅ Killed — 1 failure |
| M10 | `service/envioGuards.ts:73-80` | Removed the opportunistic `EXPIRADO` persist that must precede the outstanding check (AC27) — *iteration-1 regression sample* | ✅ Killed — 2 failures |
| M11 | `service/campanhaService.ts:225` | SQL alias `nv."STATUS" as "NOTIFICACAO_STATUS"` → `as "NV_STATUS"`, mapper left reading `NOTIFICACAO_STATUS` | ❌ **SURVIVED** — full suite unchanged from baseline |

**Result**: 9/11 killed, 2 survived — FAIL
**Isolation**: `git status --porcelain` after cleanup is byte-identical to the pre-sensor baseline
(195 lines, all pre-existing skill-file churn). Worktree removed and pruned.

**Why M4 and M11 survived.** `__tests__/unit/campanhaService.test.ts:537` mocks
`AppDataSourceSync.query` and hand-feeds rows already carrying `NOTIFICACAO_STATUS` /
`NOTIFICACAO_EXPIRA_EM` / `NOTIFICACAO_CONFIRMADO_EM`. That proves the mapper
(`montarNotificacaoVisita`) but presupposes the SQL delivers those aliases. Nothing asserts the
query string, so the join and its three aliases — the only reason the promoter app receives any
status at all — are unverified. Both mutants ship a route list with `notificacaoVisita` universally
absent while the suite stays green: the exact regression class the F1 fix exists to prevent.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ |
| Surgical changes | ✅ — F1 touches only `service/campanhaService.ts` and `schemas/campanha.ts`; F2 and F3 add no production code |
| No scope creep | ✅ — no `reagendar` route, no geocoding, no retry queue, no consent gate |
| Matches patterns | ✅ — raw-SQL + `LEFT JOIN` style matches the two joins already in that query; `relations`-array style matches the file |
| Spec-anchored outcome check (asserted values match spec) | ✅ P1 and P2 |
| Per-layer Coverage Expectation met | ⚠️ — every layer meets its matrix requirement, but the matrix has no layer that verifies raw SQL: `service/*.ts` is unit-only and `campanhaService`'s query runner is mocked, so no SQL string in that file is asserted anywhere in the repo |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — each new `it()` carries an AC/NOTIF comment |
| Documented guidelines followed | ✅ — none exist (`tasks.md`: "Guidelines found: none"); strong defaults applied |

Notes:
- The legacy-DB branch of the route-list query deliberately keeps its join-free form
  (`service/campanhaService.ts:239-241` comment): a legacy-only route carries no status. Consistent
  with the dual-DB model; no AC covers legacy rows.
- `MOTIVO_OFICINA_INEXISTENTE = "oficina not found"` remains a reason string with no spec counterpart,
  defensible under AC10 and covered by a test.
- T16's live `MAIN_REGISTER.OFICINA` `UPDATE` grant is still an unverified human pre-deploy step; the
  code fails closed via AC33 and is tested. Deployment risk, not a code gap.

---

## Gate Check

- **Gate command**: `npx tsc --noEmit && npm test` (Build level)
- **`npx tsc --noEmit`**: exit 0, zero errors ✅
- **`npm test`**: 225 total — **222 passed, 3 failed**, 0 skipped
- **Failures**: the same 3 `__tests__/unit/campanhaService.test.ts` tests as iteration 1 —
  `should return active campaign with DuckDB data merged into oficinas`,
  `should use default values when DuckDB data is not available`,
  `should handle rotas without oficina correctly`. Nature re-confirmed unchanged: all three still die
  at `service/campanhaService.ts:257` with `TypeError: Cannot read properties of undefined (reading 'filter')`
  because they mock the repository path the raw-SQL query replaced. **Count still 3, same names, same
  root cause — F1's edits to that file did not alter them.**
- **Test count**: 213 → **225** (+12: 8 from F1, 4 from F2). No test deleted, no assertion weakened.

---

## Fix Plans

### Fix 1 — the route-list SQL contract is unasserted (Major)

- **Root cause**: `__tests__/unit/campanhaService.test.ts:537` mocks `AppDataSourceSync.query` with
  pre-shaped rows, so the join added at `service/campanhaService.ts:233-234` and the three aliases at
  `:225-227` are never observed. Mutants M4 and M11 both survive the full suite.
- **Fix task**: In the `getActiveCampanhaByPromotor` describe block, capture the SQL actually passed to
  the mocked `AppDataSourceSync.query` and assert it — e.g.
  `const [sql] = (AppDataSourceSync.query as jest.Mock).mock.calls[0];`
  `expect(sql).toContain('"CAMPANHAS_OB"."NOTIFICACAO_VISITA"');`
  `expect(sql).toContain('rp."ID_ROTA_PROMOTOR" = nv."ID_ROTA_PROMOTOR"');`
  and one assertion per alias the mapper reads (`NOTIFICACAO_STATUS`, `NOTIFICACAO_EXPIRA_EM`,
  `NOTIFICACAO_CONFIRMADO_EM`). No DB access required; the call is already mocked.
- **Verify**: re-run M4 and M11 in a scratch worktree — both must fail the suite.
- **Priority**: Major (P2 read path; P1 unaffected)

---

## Requirement Traceability Update

| Requirement | Previous | New |
| --- | --- | --- |
| NOTIF-01 … NOTIF-12 | Implementing | ✅ Verified |
| NOTIF-13 | ⚠️ Partial | ✅ Verified — `GET`, `POST` and `PUT` limiters all covered (T26) |
| NOTIF-14 … NOTIF-18 | Implementing | ✅ Verified |
| NOTIF-19 | ❌ Needs Fix | ⚠️ Partial — P2 AC1 and the dashboard list verified; the promoter-app list's SQL contract is unasserted |
| NOTIF-20 | ⚠️ Partial | ⚠️ Partial — see NOTIF-19 |
| NOTIF-21 … NOTIF-33 | Implementing | ✅ Verified |

---

## Summary

**Overall**: ⚠️ Issues — one Major discrimination gap; no functional defect found.

**Spec-anchored check**: 33/33 P1 criteria and 2/2 P2 criteria matched their spec-defined outcome;
3 previously-flagged spec-precision gaps closed by F3, 2 remain open by design.
**Sensor**: 9/11 mutations killed, 2 survived (M4, M11).
**Gate**: `tsc` clean; 222 passed, 3 failed (the same pre-existing DuckDB trio).

**What the three fixes actually closed**: F2 and F3 are genuinely closed — the per-visit bucket test
exhausts one `ID_NOTIFICACAO_VISITA` and requires a second to still answer `200`, which a constant
`keyGenerator` cannot satisfy (proved by M5), and the pinned status table matches the controller and
middleware line for line. F1 is functionally correct and its `statusEfetivo()` mapping is
discriminating on **both** paths — each asserts a *stored* `ENVIADO` row past its `EXPIRA_EM` reading
`EXPIRADO` under a frozen clock, exactly the assertion asked for. What F1 did not bring is a
regression detector for the query half of its own fix.

**Issue found**: the promoter-app route list's `LEFT JOIN` and column aliases can be deleted or
renamed with the suite still green.

**Next steps**: apply Fix 1 (test-only, no production change) and re-verify. This is iteration 2 of a
maximum of 3.
