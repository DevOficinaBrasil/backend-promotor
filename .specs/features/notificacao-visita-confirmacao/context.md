# Notificação de Visita e Confirmação do Reparador Context

**Gathered:** 2026-08-04
**Spec:** `.specs/features/notificacao-visita-confirmacao/spec.md`
**Status:** Ready for design

---

## Feature Boundary

When a promoter's route (`RotaPromotor`) is created for a workshop, notify the workshop's reparador via WhatsApp and let them confirm the visit through a public, tokenized, no-login link — persisted and audited against that specific route, and surfaced as status on the dashboard and promoter app.

---

## Implementation Decisions

### WhatsApp send integration

- User located the internal WhatsApp-sending API's docs after the spec's first draft: `wpp.oficinabrasil.com.br`, `POST /api/v1/messages/send-template`, Bearer-token auth, `send:transactional` scope — a real, callable integration, not a stub.
- Decision: implement the `ChannelSender` interface with a WhatsApp channel that makes the real HTTP call (`accountId`, `toPhone` digits-only w/ country code, `templateName`, `templateLanguage: "pt_BR"`, `variables`). Provider error codes map to `FALHOU` per the doc's `Códigos de Erro` table (config-type errors like `TOKEN_INVALID`/`TEMPLATE_NOT_FOUND` vs. `RATE_LIMITED`/`QUOTA_EXCEEDED` vs. `VALIDATION_ERROR`, each captured distinctly for debugging even though none retry).
- What's still genuinely missing and out of scope for this feature: an approved `templateName` (WhatsApp Business template review/approval is a business-side process) and a provisioned `WHATSAPP_ACCOUNT_ID`. Code reads both from env and fails closed (`"channel not configured"`) until they're set — this is the one place a stub-like fallback remains, but now for missing *configuration*, not a missing *integration*.
- Security note (handled outside the spec, in the working tree directly): the user's `.env.example` briefly held a live-looking `WHATSAPP_API_KEY` value instead of a placeholder. It was uncommitted (caught via `git diff HEAD`), reset to a placeholder, and the user was told to keep the real value in their local, gitignored `.env` only.

### Consent signal — reversed

- Original decision (superseded): reuse `Usuario.RECEBER_INFO` as the consent gate.
- User came back: "we have no consent flag, `Usuario.RECEBER_INFO` does not work" — it's not a usable signal in practice (not reliably populated/scoped for this purpose).
- New decision: **no consent gate for MVP.** Send to any qualifying `Usuario` with a phone on file. This is an explicit, informed scope cut — the user was shown "no consent gate" as an option alongside "you own the LGPD/WhatsApp policy call" framing and chose it anyway.
- Flagged for visibility: CON26-83's own title ("...e respeitar o consentimento") assumed a consent mechanism would exist to respect. That half of the ticket is no longer literally satisfiable as originally framed — noted in spec.md's Assumptions table, not silently dropped.

### Recipient resolution

- Filter: `Usuario` linked to the route's `Oficina` with a non-empty `CELULAR` (consent filter removed per above).
- Tiebreak when multiple qualify: user's explicit call — most recent `Usuario.DATA_ALTERACAO` first (descending), falling back to lowest `ID_USUARIO` if null/tied.
- Caveat surfaced to user: `Usuario.DATA_ALTERACAO` is a plain nullable column, not a TypeORM `@UpdateDateColumn` (unlike `Oficina.DATA_ALTERACAO`, which is auto-maintained) — so it reflects whatever last wrote the row, not necessarily "most recently active user." Accepted as-is.
- Rejected earlier alternative: "most recently active/logged-in user" (would have required a new last-login column that doesn't exist).

### Frontend identification model ("login token") + reschedule room

- User: this feature has a frontend component, needs a doc for a frontend agent to reference; the WhatsApp message's token should identify the user (a "login token"); leave room for a future reschedule-to-later-date action.
- First discussion round stalled on "session" — user was worried this meant a new session table. Clarified: it means a **JWT** (self-contained, signature-verified, no server-side storage), the same pattern this codebase already uses for promoter login (`jwt.sign` in `controllers/promotorController.ts:164`, `jwt.verify` in `middlewares/authMiddleware.ts:24`, `jsonwebtoken` already a dependency). No new infrastructure.
- Decisions (all user-confirmed):
  1. **JWT-based**, not a raw token passed on every call: `GET /visita/{token}` exchanges the WhatsApp link's opaque token for a short-lived JWT; frontend then calls `POST /visita/confirmar` with `Authorization: Bearer {jwt}`, same as any other authenticated endpoint in this app.
  2. **Scoped to one visit only** — the JWT's claims tie it to exactly one `ID_NOTIFICACAO_VISITA`/route. It cannot be used to see or act on the reparador's other visits. Rejected the broader "account login across all visits" option as unnecessary scope and a bigger security surface for a link that's public-by-design.
  3. **Reschedule: data-model + URL-shape room only**, nothing functional. `REAGENDADO` reserved in the `NotificacaoVisita` STATUS enum; confirm endpoint shaped as one action (`/visita/confirmar`) so a sibling `/visita/reagendar` can be added later without changing the exchange or confirm contracts. Rejected stubbing a live 501 endpoint now — not needed since no frontend build starts before Design anyway.
- Resolved along the way: the link token itself is **not single-use** — only the `ENVIADO`→`CONFIRMADO` STATUS transition is. The link/token can be re-exchanged for a fresh JWT every time the page loads or reloads, as long as the underlying `NotificacaoVisita` is still `ENVIADO` and unexpired. (First draft conflated "single-use token" with "single-use link"; the AC-level fix separates them.)
- Delivered: `.specs/features/notificacao-visita-confirmacao/frontend-contract.md` — endpoints, request/response shapes, states to render, JWT handling guidance, explicitly marked draft pending Design.

### Test-send safety lock

- User: "we need test locks to guarantee no WhatsApp message will be sent accidentally."
- Decision: two independent, layered locks in the WhatsApp channel implementation itself (not just test-suite discipline):
  1. `WHATSAPP_SEND_ENABLED` must be exactly `"true"` for a real HTTP call to happen at all — default-off in every environment (dev, staging, prod, test alike).
  2. `NODE_ENV === "test"` forces the no-op path unconditionally, overriding lock 1 even if it's mistakenly `"true"` in a shared `.env`.
- Grounded in the codebase's own convention: `middlewares/authMiddleware.ts` already gates `SKIP_AUTH` behind a paired explicit-flag + `NODE_ENV` check. Jest's `jest.config.ts` doesn't set `NODE_ENV` itself, but Jest defaults it to `"test"` when unset, so lock 2 needs no new test-runner config.
- Not discussed with the user: the exact env var name (`WHATSAPP_SEND_ENABLED`) and the specific double-lock mechanics — agent's discretion on implementation, the guarantee itself was the user's ask.

### Expiry model (decided at design review)

- Problem found while reviewing the design: nothing in this codebase sweeps expired rows (no scheduler exists), and the draft only flipped `STATUS` to `EXPIRADO` inside the token-exchange endpoint. A link nobody ever opened would therefore stay `ENVIADO` forever, and P2's dashboard would report a dead visit as live.
- Decision (user's call): **derive** effective status at read time from `STATUS` + `EXPIRA_EM` via one shared helper, rather than persisting a transition. Every read path uses it.
- Knock-on effect worth remembering: since the stored column still says `ENVIADO` for an expired row, the atomic confirm `UPDATE` needs an explicit `AND "EXPIRA_EM" > now()` guard. Without it, a JWT issued just before expiry could confirm a dead visit.

### Confirmation token model

- Decision: signed link token with a short expiry window (48 hours from issuance). Exact value defaulted to the upper bound of the discussed 24–48h range — not explicitly pinned by the user, logged as an open assumption in spec.md. Superseded by the "Frontend identification model" decision below: the link token itself is re-exchangeable, not single-use — only the resulting `CONFIRMADO` transition is.
- Confirming atomically transitions the notification's status and writes an audit trail (timestamp, `ID_USUARIO`, IP), directly on the `NotificacaoVisita` row — mechanics of "atomic" left to Design.
- **Self-review catch:** the first draft issued the token "WHEN NotificacaoVisita reaches STATUS ENVIADO" — but the dispatch call needs the token's URL as one of its message variables, so the token can't be a byproduct of a send that hasn't happened yet. Fixed: the token is now issued right after recipient resolution + phone normalization, *before* the dispatch attempt; `EXPIRA_EM` is based on issuance time, not `ENVIADO_EM`. This exists even if the subsequent send fails (harmless — nobody has the link if the message never arrived).

### Agent's Discretion

- Exact confirmation token expiry hours (48h chosen, within user's stated 24–48h range).
- Rate limiting on the public confirmation endpoints (20 req/min) — user did not raise this; added as a baseline abuse-resistance measure since the endpoint is unauthenticated by design. **Revised during design review:** originally IP-keyed, now keyed per visit (link token / JWT claim). `app.ts` sets no `trust proxy`, so `req.ip` is the ALB's address behind the public endpoint — an IP key would have throttled all users against one shared bucket. User chose per-token keying over changing global app config.
- Confirmation write target: audit fields (`CONFIRMADO_EM`/`CONFIRMADO_POR`/`CONFIRMADO_IP`) live directly on `NotificacaoVisita`, not a new write to `RotaPromotor` or `Oficina`/`CadastroEmpresa`. **Self-review catch:** an earlier draft proposed new `RotaPromotor` columns (`VISITA_CONFIRMADA_EM`/`_POR`) while the acceptance criteria elsewhere used `CONFIRMADO_EM`/`CONFIRMADO_POR` on `NotificacaoVisita` — two names, two entities, never reconciled. Fixed by keeping everything on `NotificacaoVisita`, which already carries `ID_ROTA_PROMOTOR` and is what P2's dashboard/app view joins through.

### Declined / Undiscussed Gray Areas → Assumptions

All logged in spec.md's Assumptions & Open Questions table: notification/route cardinality (one `NotificacaoVisita` per `RotaPromotor`, unique-constrained), no automatic retry on send failure (no queue infra exists), and the dashboard/app response shape (existing `{ message, data }` envelope).

Note: an earlier version of this list cited "`RECEBER_INFO` value semantics ('S' = consent)" — that row was deleted from spec.md when the consent gate was dropped entirely (see "Consent signal — reversed" above); removed here too so this list doesn't point at content that no longer exists.

---

## Specific References

No specific UI/API mockups or product references were given. The public confirmation page has no visual spec beyond "shows the Oficina name and visit date" (spec.md P1 AC14) — open to a standard, minimal approach at Design/implementation time.

---

## Deferred Ideas

- SMS/email fallback channels — user only asked for WhatsApp; the channel interface leaves room to add these later without redesign.
- Automatic retry/backoff on failed sends — would require background job infrastructure this codebase doesn't have; noted as future work once such infrastructure exists.
