# Notificação de Visita e Confirmação do Reparador Validation

**Date**: 2026-08-05
**Spec**: `.specs/features/notificacao-visita-confirmacao/spec.md`
**Diff range**: `c842273c5f8e7d5cb0c13ef4ad7efaaa0a4de004..HEAD` (30 commits, T1–T24 + docs alignment)
**Verifier**: independent sub-agent (author ≠ verifier)

**Verdict**: ❌ **FAIL** — P1 is fully covered and discriminating; **P2 AC2 has no implementation and no evidence**.

---

## Task Completion

All 24 tasks (T1–T24) are marked `✅ Complete` in `tasks.md`. T23's stated scope
("Route-list reads used by the promoter app — include the same relation",
`design.md:157`) was narrowed to `getRotaByIdWithRelations` only; the task was
still closed as complete. See Gap 1.

| Task | Status | Notes |
| --- | --- | --- |
| T1–T22, T24 | ✅ Done | - |
| T23 | ⚠️ Partial | Only the single-route read was changed; the promoter-app route-list read was not. Closes P2 AC1, leaves P2 AC2 open. |

---

## Spec-Anchored Acceptance Criteria — P1

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 exactly one row, `PENDENTE`, linked to route | one `create`, STATUS `PENDENTE`, `ID_ROTA_PROMOTOR` set | `__tests__/unit/notificacaoVisitaService.test.ts:103` — `expect(notifRepo.create).toHaveBeenCalledTimes(1)`; `:109` — `expect(persistidos[0].STATUS).toBe(StatusNotificacaoVisita.PENDENTE)`; `:110` — `expect(persistidos[0].ID_ROTA_PROMOTOR).toBe(ID_ROTA)` | ✅ PASS |
| AC1 trigger on every route-creation path | one notification per created route | `__tests__/unit/rotaService.test.ts:237` — `expect(notificarVisitaMock).toHaveBeenCalledTimes(1)`; `:254` — `…toHaveBeenCalledTimes(3)`; `:300` — `…toHaveBeenCalledTimes(2)` (transactional); `:338` — `…toHaveBeenCalledTimes(1)` (workshop edit); `:347` — `expect(notificarVisitaMock).not.toHaveBeenCalled()` when nothing added | ✅ PASS |
| AC2 recipient order `DATA_ALTERACAO DESC` nulls last, `ID_USUARIO ASC`, take first | exact TypeORM order clause; first qualifying user selected | `__tests__/unit/notificacaoVisitaService.test.ts:160` — `expect(usuarioRepo.find).toHaveBeenCalledWith({ where:{ID_OFICINA}, order:{ DATA_ALTERACAO:{direction:"DESC",nulls:"LAST"}, ID_USUARIO:"ASC" }})`; `:179` — `expect(resultado.ID_USUARIO).toBe(4)` | ✅ PASS |
| AC3 no phone → `FALHOU` / `"no recipient with phone"`, no send | exact string | `…notificacaoVisitaService.test.ts:149-152` — `expect(resultado.STATUS).toBe(FALHOU)`, `expect(resultado.ERRO_ENVIO).toBe("no recipient with phone")`, `expect(sendMock).not.toHaveBeenCalled()` | ✅ PASS |
| AC4 normalize to `55DDDNNNNNNNNN`; invalid → no dispatch | digits-only, valid DDD, 10–11 local digits; fail closed | `__tests__/unit/telefone.test.ts:8-66` (15 cases incl. invalid DDD, wrong length, missing `55`); `…notificacaoVisitaService.test.ts:205-209` — `ERRO_ENVIO === "invalid phone"`, `sendMock` not called, `TOKEN_HASH` null; `__tests__/unit/whatsappChannel.test.ts:135` — channel-level refusal | ✅ PASS |
| AC5 token issued **before** dispatch, `EXPIRA_EM = now + 168h` | issuance + 168h exactly; persist precedes send | `…notificacaoVisitaService.test.ts:219` — `expect(resultado.EXPIRA_EM).toEqual(new Date("2026-08-12T12:00:00.000Z"))` from a frozen `2026-08-05T12:00:00.000Z`; `:224` — `expect(sendMock.mock.invocationCallOrder[0]).toBeGreaterThan(notifRepo.save.mock.invocationCallOrder[indiceComToken])` | ✅ PASS |
| AC6 exact URL / Bearer header / body shape | `{baseUrl}/api/v1/messages/send-template`, `Bearer {key}`, `{accountId,toPhone,templateName,templateLanguage:"pt_BR",variables}` | `__tests__/unit/whatsappChannel.test.ts:151-164` — full `expect(postMock).toHaveBeenCalledWith(url, body, { headers:{Authorization:"Bearer chave-secreta"}, timeout:10000 })`; `…notificacaoVisitaService.test.ts:242-248` — `variables[0]` = workshop name, `variables[1]` matches the confirmation URL and `hashToken(rawToken) === resultado.TOKEN_HASH` | ✅ PASS |
| AC7 `200 + success:true` → `ENVIADO`, `ENVIADO_EM`, ids stored | STATUS `ENVIADO`, both provider ids | `…notificacaoVisitaService.test.ts:258-261` — `STATUS===ENVIADO`, `MESSAGE_ID==="msg-1"`, `PROVIDER_MESSAGE_ID==="wamid.1"`, `ENVIADO_EM instanceof Date`; `whatsappChannel.test.ts:177` — passthrough of provider ids | ✅ PASS |
| AC8 7 config error codes → `FALHOU` / `"channel not configured"` + code | exact reason string + provider code, all 7 codes | `__tests__/unit/whatsappChannel.test.ts:187-207` — `describe.each` over all 7 codes asserting `{success:false, reason:"channel not configured", providerCode: codigo}`; `…notificacaoVisitaService.test.ts:275` — `expect(resultado.ERRO_ENVIO).toBe("channel not configured: TEMPLATE_NOT_FOUND")` | ✅ PASS |
| AC9 `RATE_LIMITED`/`QUOTA_EXCEEDED` → `FALHOU`, no retry | code captured, exactly one HTTP attempt | `whatsappChannel.test.ts:218-223` — `{success:false, reason:"provider rate/quota", providerCode: codigo}` and `expect(postMock).toHaveBeenCalledTimes(1)` | ✅ PASS |
| AC10 dispatch failure never breaks route creation | route returned successfully; notification resolves `FALHOU` | `…notificacaoVisitaService.test.ts:310`, `:319`, `:330`, `:340` — four throw paths all resolve to `FALHOU`; `__tests__/unit/rotaService.test.ts:270` — `expect(resultado).toEqual(mockRota)` with a rejecting notification; `:311`, `:356` same for the other two creation paths | ✅ PASS |
| AC11 missing account/template → skip HTTP, log payload, `FALHOU` / `"channel not configured"` | no HTTP call, payload logged, exact reason | `whatsappChannel.test.ts:114-123` — `describe.each` over `WHATSAPP_ACCOUNT_ID`/`TEMPLATE_NAME`/`BASE_URL`/`API_KEY`: `postMock` not called, exact result object, `console.log` called with the intended payload | ✅ PASS |
| AC11 token survives a failed dispatch | `TOKEN_HASH`/`EXPIRA_EM` retained | `…notificacaoVisitaService.test.ts:299-300` — `expect(resultado.TOKEN_HASH).toMatch(/^[0-9a-f]{64}$/)`, `EXPIRA_EM instanceof Date` | ✅ PASS |
| AC12 send only when `WHATSAPP_SEND_ENABLED === "true"` exactly | no-op for unset and for `"TRUE"` | `whatsappChannel.test.ts:79-84` (unset), `:93-94` (`"TRUE"`) — `expect(postMock).not.toHaveBeenCalled()` | ✅ PASS |
| AC13 `NODE_ENV==="test"` forces no-op unconditionally | no-op even with full config + `SEND_ENABLED=true` | `whatsappChannel.test.ts:64-69` — full config, `SEND_ENABLED="true"`, `NODE_ENV="test"` → `postMock` not called, exact result | ✅ PASS |
| AC14 `GET /visita/{token}` → 30-min JWT, scope `visita:confirmar`, `sub=ID_USUARIO`, both IDs, + Oficina name | exact claims | `__tests__/unit/visitaConfirmacaoService.test.ts:83-86` — `payload.sub===ID_USUARIO`, `payload.ID_NOTIFICACAO_VISITA`, `payload.ID_ROTA_PROMOTOR`, `payload.scope===VISITA_SCOPE`; `__tests__/unit/visitaToken.test.ts:75` — `expect(decoded.exp! - decoded.iat!).toBe(30 * 60)`; `__tests__/integration/visitaExchange.test.ts:38` — 200 + JWT + name over HTTP | ✅ PASS |
| AC15 re-exchangeable while live | fresh JWT on every call, state stays `PENDING` | `visitaConfirmacaoService.test.ts:143-147` — both calls `PENDING`, second JWT verifies to the same visit | ✅ PASS |
| AC16 malformed/unknown token → distinct `TOKEN_INVALID`, no JWT | state `TOKEN_INVALID` | `visitaConfirmacaoService.test.ts:202`, `:208` — `expect(resultado).toEqual({state:"TOKEN_INVALID"})`, and `notifRepo.findOne` not called for a blank token; `visitaExchange.test.ts:109` — HTTP 404 + `error:"TOKEN_INVALID"` | ✅ PASS (status code = spec-precision gap, see below) |
| AC17 past `EXPIRA_EM` → distinct `EXPIRED`, no JWT | state `EXPIRED`, no `jwt` key | `visitaConfirmacaoService.test.ts:180-181` — `toEqual({state:"EXPIRED"})` and `not.toHaveProperty("jwt")`; `visitaExchange.test.ts:99` — HTTP 410 | ✅ PASS |
| AC18 already `CONFIRMADO` → distinct `ALREADY_CONFIRMED` incl. `CONFIRMADO_EM`, no JWT | state + timestamp | `visitaConfirmacaoService.test.ts:165-170` — `toEqual({state:"ALREADY_CONFIRMED", oficinaNome, confirmadoEm})`, `not.toHaveProperty("jwt")` | ✅ PASS |
| AC19 confirm → atomic `ENVIADO→CONFIRMADO` + 3 audit fields | `CONFIRMADO_EM`, `CONFIRMADO_POR = jwt.sub`, `CONFIRMADO_IP` | `visitaConfirmacaoService.test.ts:273-278` — `expect(notifRepo.update).toHaveBeenCalledWith(anything, { STATUS: CONFIRMADO, CONFIRMADO_EM: AGORA, CONFIRMADO_POR: ID_USUARIO, CONFIRMADO_IP: IP })`; `:286-293` — guard clause asserted as `{ID_NOTIFICACAO_VISITA, STATUS: ENVIADO, EXPIRA_EM: MoreThan(AGORA)}` | ✅ PASS |
| AC20 bad/expired/wrong-scope JWT or non-`ENVIADO` row → reject, no STATUS change | `ALREADY_CONFIRMED`/`TOKEN_INVALID`, never `CONFIRMED` | `visitaConfirmacaoService.test.ts:324`, `:333`, `:343` — `expect(resultado.state).not.toBe("CONFIRMED")`; `__tests__/unit/visitaAuthMiddleware.test.ts:73` (wrong secret → 403), `:95` (expired → 403), `:113` (wrong scope → 403), `:56`/`:63` (missing/malformed header → 401); `visitaToken.test.ts:78-120` — `verificarJwt` throws on tamper/expiry/missing scope/wrong scope | ✅ PASS |
| AC21 concurrent confirms → exactly one transition | one `CONFIRMED`, one `ALREADY_CONFIRMED` | `visitaConfirmacaoService.test.ts:365` — `expect(estados).toEqual(["ALREADY_CONFIRMED","CONFIRMED"])` | ✅ PASS |
| AC22 `EXPIRADO` derived at read time on **every** read path, never stored by a transition | derived, and read paths do not write | `__tests__/unit/statusNotificacaoVisita.test.ts:19-79` (9 cases incl. exact-boundary and +1 ms); `visitaConfirmacaoService.test.ts:191-192` — `expect(notifRepo.update).not.toHaveBeenCalled()` / `save` not called on the EXPIRED read; `__tests__/unit/rotaService.test.ts:399` — `expect(rota!.notificacaoVisita!.STATUS).toBe(EXPIRADO)` for a stored-`ENVIADO` row | ✅ PASS |
| AC23 `REAGENDADO` reserved; no route ships | enum value present, no `/visita/reagendar` | `entities/NotificacaoVisita.ts:23` — `REAGENDADO = "REAGENDADO"`; `schemas/rota.ts:211`; `routes/VisitaRoute.ts` contains no `reagendar` route | ✅ PASS (build-gate-only layer per the Test Coverage Matrix) |
| AC24 lifecycle logging with both IDs | 4 named events, each with `{ID_ROTA_PROMOTOR, ID_NOTIFICACAO_VISITA}` | `…notificacaoVisitaService.test.ts:351-360` — 4 explicit `expect(console.log).toHaveBeenCalledWith(<event>, ids)` | ✅ PASS |
| AC25 20 req/min per visit — **`GET` (link-token keyed)** | 21st request → 429; separate bucket per token | `__tests__/integration/visitaExchange.test.ts:137-143` — first 20 not 429, `respostas[20].status === 429`, body `{message, error:"RATE_LIMITED"}`; `:152` — separate bucket asserted | ✅ PASS |
| AC25 20 req/min per visit — **`POST`/`PUT` (JWT `ID_NOTIFICACAO_VISITA` keyed)** | 21st request → 429 | **no `file:line`** — `limitadorAcao` (`routes/VisitaRoute.ts:49`) is wired but no test exercises it; no `429` assertion exists in `visitaConfirmar.test.ts` or `visitaEndereco.test.ts` | ❌ GAP |
| AC26 `Oficina.DATA_ALTERACAO` < 3 months → `DISPENSADO` / `"address recently updated"`, no recipient resolution | exact string, no `usuarioRepo.find` | `…notificacaoVisitaService.test.ts:119-123` — `STATUS===DISPENSADO`, `ERRO_ENVIO==="address recently updated"`, `usuarioRepo.find` not called, `sendMock` not called; `__tests__/unit/envioGuards.test.ts:21-58` — 7 boundary cases incl. exact 3-month boundary, ±1 ms, null/absent → stale | ✅ PASS |
| AC27 `EXPIRADO` persisted **before** the outstanding check | persist runs first | `__tests__/unit/envioGuards.test.ts:199` — `expect(repo.linhas[0].STATUS).toBe(EXPIRADO)`; `:218` — `expect(repo.update.mock.invocationCallOrder[0]).toBeLessThan(repo.findOne.mock.invocationCallOrder[0])` | ✅ PASS |
| AC28 outstanding `ENVIADO` on **any** Oficina → `DISPENSADO` / `"recipient has outstanding notification"` | exact string, cross-Oficina, per-recipient | `envioGuards.test.ts:150-151`, `:168` (other Oficina), `:183` (other recipient not blocked); `…notificacaoVisitaService.test.ts:193-196` — orchestrator writes `DISPENSADO` + the guard reason | ✅ PASS |
| AC29 `CONFIRMADO` within 3 months → `DISPENSADO` / `"recipient confirmed recently"` | exact string; >3 months does not block | `envioGuards.test.ts:250-251`, `:265` (older than 3 months → not blocked), `:272-285` (`FALHOU`/`DISPENSADO`/`EXPIRADO` rows never block) | ✅ PASS |
| AC30 `PENDING` returns name + 7 address fields, **no visit date** | exactly those 7 keys, no date | `visitaConfirmacaoService.test.ts:94-106` — full `toMatchObject` on all 7 values; `:115-125` — `expect(Object.keys(endereco).sort()).toEqual([BAIRRO,CEP,CIDADE,COMPLEMENTO,ENDERECO,ESTADO,NUMERO])` and no `dataVisita`/`data` key; `__tests__/integration/visitaExchange.test.ts:62` — same over HTTP | ✅ PASS |
| AC31 `PUT /visita/endereco` → address columns only + AC19 transition + `ENDERECO_ATUALIZADO=true` | audit fields + flag | `visitaConfirmacaoService.test.ts:450-459` — `toEqual({state:"CONFIRMED", confirmadoEm: AGORA, enderecoAtualizado:true})` and `update` called with `{STATUS:CONFIRMADO, CONFIRMADO_EM, CONFIRMADO_POR, CONFIRMADO_IP, ENDERECO_ATUALIZADO:true}`; `:466` — `expect(oficinaRepo.update).toHaveBeenCalledWith({ID_OFICINA}, enderecoCorrigido)`; `:541` — Oficina write ordered before the transition | ✅ PASS |
| AC32 non-allowlisted field → validation error, **no** Oficina write | rejected, nothing written | `visitaConfirmacaoService.test.ts:486-…` — `CNPJ`/`TELEFONE`/`STATUS` payload → `VALIDATION_ERROR`, `oficinaRepo.update` not called; `__tests__/integration/visitaEndereco.test.ts:102` — HTTP 400, service not reached | ✅ PASS |
| AC33 Oficina write failure → STATUS unchanged, distinct error, no false confirmation | `ADDRESS_UPDATE_FAILED`, `notifRepo.update` not called | `visitaConfirmacaoService.test.ts:511-…` — `state === "ADDRESS_UPDATE_FAILED"` and notification `update` not called; `:527` — never `CONFIRMED`; `visitaEndereco.test.ts:142` — distinct HTTP error, no confirmation | ✅ PASS |

### Edge cases (spec § Edge Cases)

- [x] Zero linked `Usuario` → `FALHOU` / `"no usuario linked to oficina"` — `…notificacaoVisitaService.test.ts:133-135`
- [x] Non-numeric / invalid DDD → fail closed — `__tests__/unit/telefone.test.ts:44-66`, `whatsappChannel.test.ts:135`
- [x] Expired link opened → expired state, no confirmation accepted — `visitaConfirmacaoService.test.ts:180`, `:311`
- [x] Second route for the same Oficina → independent row (uniqueness per `ID_ROTA_PROMOTOR`) — `scripts/migration-notificacao-visita.sql` unique on `ID_ROTA_PROMOTOR`; `__tests__/unit/rotaService.test.ts:254` (one notification per route)
- [x] Provider unreachable / timeout / non-JSON → `FALHOU`, route creation succeeds — `whatsappChannel.test.ts:263`, `:278`, `:291`
- [x] JWT issued pre-expiry, presented post-expiry → rejected — `visitaConfirmacaoService.test.ts:311`
- [x] No JWT revocation list needed; live STATUS check governs — `visitaConfirmacaoService.test.ts:286-293` (guarded UPDATE)
- [x] `WHATSAPP_SEND_ENABLED=true` in a test run still blocked by `NODE_ENV=test` — `whatsappChannel.test.ts:64`
- [x] Batch sharing one recipient: first sends, rest `DISPENSADO` — `envioGuards.test.ts:150` + `…notificacaoVisitaService.test.ts:193`
- [x] Address correction bumps `DATA_ALTERACAO` → suppresses further notifications — `envioGuards.test.ts:21`
- [x] Coordinates left stale after a correction — `visitaConfirmacaoService.test.ts:466` (only the 7 columns written)
- [x] `DATA_ALTERACAO` NULL → treated as stale — `envioGuards.test.ts:48`, `:52`

**Status**: ✅ 33/33 P1 criteria covered on outcome, 1 of them partially (AC25's `POST`/`PUT` half uncovered).

---

## Spec-Anchored Acceptance Criteria — P2

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| P2 AC1 route details for a `RotaPromotor` include the linked `NotificacaoVisita` STATUS and `CONFIRMADO_EM` | effective STATUS (not the stored column) + timestamp | `__tests__/unit/rotaService.test.ts:381` — `relations: expect.arrayContaining(['notificacaoVisita'])`; `:399` — `expect(rota!.notificacaoVisita!.STATUS).toBe(EXPIRADO)` for a stored-`ENVIADO` expired row; `:414` — live `ENVIADO` unchanged; `:430` — `expect(rota!.notificacaoVisita!.CONFIRMADO_EM).toBe(confirmadoEm)`; `:438`/`:447` — degrades without throwing | ✅ PASS |
| P2 AC2 promoter-app **route list** includes each route's confirmation STATUS in the `{message,data}` envelope | every route in the list carries its STATUS | **no evidence — not implemented.** `service/campanhaService.ts:212` (`getActiveCampanhaByPromotor`, the promoter app's route list) builds its rotas from raw SQL with no `NOTIFICACAO_VISITA` join and no status field; `service/campanhaService.ts:334` (`getCampanhaByIdWithRelations`) does not load the `notificacaoVisita` relation either. `design.md:157` explicitly required "Route-list reads used by the promoter app — include the same relation". No test asserts it. | ❌ GAP |

**Status**: ❌ P2 gap present.

---

## Spec-Precision Gaps

| Criterion | Issue |
| --- | --- |
| AC16 / AC17 / AC18 / AC20 / AC33 | The spec names distinct *states* (`TOKEN_INVALID`, `EXPIRED`, `ALREADY_CONFIRMED`, "a distinct error state") but never fixes the HTTP status codes. The implementation chose 404 / 410 / 409 / 500, and 401 vs 403 in `visitaAuthMiddleware`. Tests assert those codes, so they are now the de-facto contract, but they were never spec-defined — a future change would silently break the frontend contract without a spec violation. |
| AC19 `CONFIRMADO_IP` | Spec says "source IP of the request"; per the Assumptions table this is the ALB address, not the reparador's, because `app.ts` sets no `trust proxy`. The asserted value is whatever `req.ip` returns, so the audit field's *meaning* is not what the criterion's plain reading implies. Known and documented in `design.md`; recorded here so it is not read as a verified property. |
| AC25 (`POST`/`PUT`) | Beyond the missing test, the spec does not state whether the limiter runs before or after JWT verification; the implementation mounts it after (`routes/VisitaRoute.ts:65`, `:116`), so an unauthenticated flood never reaches a bucket. |

---

## Discrimination Sensor

Run in an isolated `git worktree` at `<scratchpad>/sensor` (HEAD detached at `1bba26e`),
with `node_modules` symlinked. No `git stash` was used and the real worktree was
never mutated.

| # | File:line | Mutation | Result |
| --- | --- | --- | --- |
| M1 | `utils/statusNotificacaoVisita.ts:27` | `EXPIRA_EM.getTime() < agora` → `> agora` (expiry derivation inverted) | ✅ Killed — 17 failures across `statusNotificacaoVisita`, `rotaService`, `visitaConfirmacaoService` |
| M2 | `service/envioGuards.ts:73-80` | Removed the opportunistic `EXPIRADO` persist that must precede the outstanding check (AC27 ordering) | ✅ Killed — 2 failures in `envioGuards.test.ts` |
| M3 | `service/visitaConfirmacaoService.ts:231` | Dropped `EXPIRA_EM: MoreThan(agora)` from the guarded confirm UPDATE | ✅ Killed — 1 failure (`rejects a JWT issued before expiry but presented after it`) |
| M4 | `service/visitaConfirmacaoService.ts:166` | `if (invalidos.length > 0)` → `if (false)` (address allowlist never rejects) | ✅ Killed — 1 failure |
| M5 | `service/notificacaoVisitaService.ts:90` | Recipient tiebreak `DESC`/`nulls LAST` → `ASC`/`nulls FIRST` | ✅ Killed — 1 failure |
| M6 | `channels/whatsappChannel.ts:100` | `NODE_ENV === "test"` no-op lock disabled | ✅ Killed — 1 failure |
| M7 | `channels/whatsappChannel.ts:106` | `WHATSAPP_SEND_ENABLED !== "true"` loosened to a case-insensitive match | ✅ Killed — 1 failure (the `"TRUE"` case) |
| M8 | `service/notificacaoVisitaService.ts:14` | `HORAS_VALIDADE_TOKEN` 168 → 48 | ✅ Killed — 1 failure |

**Sensor depth**: P0-full (8 mutations, ≥5 required — auth/token/data-integrity paths)
**Result**: 8/8 killed — ✅ PASS
**Isolation**: `git status --porcelain` after cleanup is byte-identical to the pre-sensor baseline (195 lines, all pre-existing skill-file churn). Worktree removed and pruned.

---

## Gate Check

- **Gate command**: `npx tsc --noEmit && npm test` (Build level)
- **`npx tsc --noEmit`**: exit 0, zero errors ✅
- **`npm test`**: 213 total — **210 passed, 3 failed**, 0 skipped
- **Failures**: all 3 in `__tests__/unit/campanhaService.test.ts` (`should return active campaign with DuckDB data merged into oficinas`, `should use default values when DuckDB data is not available`, `should handle rotas without oficina correctly`) — the documented pre-existing DuckDB regression from T1's notes. Failure count has **not** grown beyond the accepted 3.
- **Test count before feature**: 41 (31 failed / 10 passed at the T1 baseline)
- **Test count after feature**: 213
- **Delta**: +172 tests; no test file deleted, no assertion weakened in the diff surface

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ |
| Surgical changes | ✅ — only `rotaService.ts`, `schemas/rota.ts`, `entities/RotaPromotor.ts`, `api.ts`, `.env.example`, `tsconfig.json` touched outside new files |
| No scope creep | ✅ — no `reagendar` route, no geocoding, no retry queue, no consent gate |
| Matches patterns | ✅ — `createDocumentedRoute`, `{message,data}` envelope, `service/`+`controllers/`+`schemas/` split, `jsonwebtoken`/`JWT_SECRET` reuse |
| Spec-anchored outcome check (asserted values match spec) | ✅ for P1; ❌ P2 AC2 |
| Per-layer Coverage Expectation met | ⚠️ — domain/util/channel/middleware layers meet 1:1 AC mapping; the route layer is missing the `429` path on `POST /visita/confirmar` and `PUT /visita/endereco` |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — every new `it()` carries an AC/edge-case comment; the only non-AC test (`oficina not found`) is explicitly justified in-file as an AC10 no-throw path |
| Documented guidelines followed | ✅ — none exist (`tasks.md`: "Guidelines found: none"); strong defaults applied |

Notes:
- `MOTIVO_OFICINA_INEXISTENTE = "oficina not found"` is a status/reason string with no spec counterpart. Defensible under AC10 (the function may never throw) and covered by a test, but it is an outcome the spec does not enumerate.
- The address allowlist is enforced twice (strict Zod body schema at `routes/VisitaRoute.ts:118` and again in the service at `visitaConfirmacaoService.ts:162`). Deliberate defence in depth, documented at `controllers/visitaController.ts:75`, and both layers are tested.
- `JWT_SECRET` is present in `.env.example:15` — the previously flagged "missing `JWT_SECRET`" concern is resolved.
- T16's live `MAIN_REGISTER.OFICINA` `UPDATE` grant remains an unverified pre-deploy human step; the code fails closed via AC33 and is tested, so this is a deployment risk, not a code gap.

---

## Fix Plans

### Fix 1 — P2 AC2: promoter-app route list carries no confirmation status (Blocker for P2)

- **Root cause**: T23 implemented only `RotaService.getRotaByIdWithRelations`. The promoter app's route list is served by `CampanhaService.getActiveCampanhaByPromotor` (`service/campanhaService.ts:136`), which assembles rotas from raw SQL (`:180-217`) with no `NOTIFICACAO_VISITA` join, and by `getCampanhaByIdWithRelations` (`:329`), whose `relations` array omits `notificacaoVisita`. `design.md:157` required both.
- **Fix task**: Join `CAMPANHAS_OB.NOTIFICACAO_VISITA` on `ID_ROTA_PROMOTOR` in the route-list query (and/or add `'campanhaPromotores.rotasPromotor.notificacaoVisita'` to the relations array), map each row's status through `statusEfetivo()`, and expose it as the same nested `notificacaoVisita: { STATUS, CONFIRMADO_EM }` object already defined by `NotificacaoVisitaStatusInfoSchema` (`schemas/rota.ts:220`).
- **Verify**: a unit test asserting a route list where one route reads `CONFIRMADO` with its `CONFIRMADO_EM` and another reads `EXPIRADO` from a stored-`ENVIADO` row past `EXPIRA_EM`.
- **Priority**: Blocker (for P2; P1 ships without it)

### Fix 2 — AC25 rate limiting on `POST`/`PUT` is untested (Major)

- **Root cause**: `limitadorAcao` (`routes/VisitaRoute.ts:49`) is wired into both authenticated routes but no integration test exercises the 21st request. The `GET` limiter is tested; the JWT-keyed one is not, so a regression in `keyGenerator` (e.g. an always-empty key collapsing every visit into one bucket) would pass the suite.
- **Fix task**: Add to `__tests__/integration/visitaConfirmar.test.ts` a test issuing 21 authenticated requests with the same JWT, asserting the 21st is `429` with `{error:"RATE_LIMITED"}`, plus one asserting a second JWT for a *different* `ID_NOTIFICACAO_VISITA` still succeeds.
- **Priority**: Major

### Fix 3 — Pin the HTTP status codes in the spec (Minor)

- **Root cause**: spec defines states, not codes; the code/tests define 404/409/410/500 and 401/403 unilaterally.
- **Fix task**: Add the state→status mapping to `spec.md` AC16–AC20/AC33 (or reference `frontend-contract.md` as normative) so the frontend contract is spec-anchored.
- **Priority**: Minor

---

## Requirement Traceability Update

| Requirement | Previous | New |
| --- | --- | --- |
| NOTIF-01 … NOTIF-12 | Implementing | ✅ Verified |
| NOTIF-13 | Implementing | ⚠️ Partial — `GET` limiter verified; `POST`/`PUT` limiter untested |
| NOTIF-14 … NOTIF-18 | Implementing | ✅ Verified |
| NOTIF-19 | Implementing | ❌ Needs Fix — P2 AC1 verified, P2 AC2 not implemented |
| NOTIF-20 | Implementing | ⚠️ Partial — see NOTIF-13, NOTIF-19 |
| NOTIF-21 … NOTIF-33 | Implementing | ✅ Verified |

---

## Summary

**Overall**: ⚠️ Issues — P1 is ready; P2 is not.

**Spec-anchored check**: 33/33 P1 criteria matched their spec-defined outcome (AC25 partially); 1/2 P2 criteria; 3 spec-precision gaps flagged
**Sensor**: 8/8 mutations killed
**Gate**: `tsc` clean; 210 passed, 3 failed (all pre-existing and accepted)

**What works**: the whole P1 loop — route-creation trigger on all three paths, both pre-send guards with their load-bearing ordering, recipient resolution and tiebreak, phone normalization, 168-hour token issued before dispatch, both send locks, the full provider error-code mapping, the exchange/confirm/address-correction endpoints with their distinct states, derived `EXPIRADO`, concurrency safety, and the address allowlist. The tests discriminate: every behavior-level mutation aimed at that logic was killed.

**Issues found**: (1) P2 AC2 never implemented — the promoter-app route list carries no confirmation status; (2) AC25's authenticated-endpoint rate limiter has no test; (3) HTTP status codes are contract-by-implementation, not spec-defined.

**Next steps**: route Fix 1 and Fix 2 to an implementer, then re-verify. Fix 3 is a spec edit.
