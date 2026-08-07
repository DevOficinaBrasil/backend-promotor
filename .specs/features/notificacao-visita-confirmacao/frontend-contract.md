# Frontend Contract — Visit & Address Confirmation Page

**Status:** Draft, synced to `spec.md` as of 2026-08-05 (33 requirements, post-Design). Field names and paths are the intended contract; the backend that implements them is still being built, so re-check against `spec.md` before final wiring.

**Audience:** whichever agent/session builds the public confirmation page. This doc is meant to be enough on its own — you shouldn't need to read the backend source or the full `spec.md` to implement the page, only to understand *why* a rule exists.

> **Changed from the previous revision** — if you read an earlier copy, three things moved:
> 1. **`dataVisita` is gone.** No visit date is returned at all. There is no per-visit date anywhere in the schema, so the page must not claim one. (Removed field — do not render it.)
> 2. **The page now shows the workshop's registered address**, and confirming means "the visit is acknowledged *and* this address is correct".
> 3. **New third endpoint: `PUT /visita/endereco`** — lets the reparador correct the address instead of confirming it as-is.

---

## What this page is

A reparador (workshop contact) taps a link inside a WhatsApp message. The link opens this page, which:

1. Exchanges the link's token for a short-lived access token (JWT).
2. Shows the workshop name and its **currently registered address**.
3. Offers two mutually exclusive actions:
   - **"Confirmar"** — the address is right, and they know about the visit.
   - **"Corrigir endereço"** — the address is wrong; they edit it and submit.

Either action ends in the same state: `CONFIRMED`. Correcting the address *also* confirms — the reparador never has to do both.

No login screen, no account, no password. The link itself is the credential.

---

## Flow

```
WhatsApp message
      │  link: https://<frontend-host>/visita/confirmacao?token={linkToken}
      ▼
Frontend page loads, reads {linkToken} from the URL
      │
      ▼
GET /visita/{linkToken}          ← no auth header needed here
      │
      ├─ 200 OK, pendente     → render workshop name + address + both action buttons
      │                          store the returned JWT (in memory only, see below)
      │
      ├─ 200 OK, já confirmado → render "Você já confirmou em {data}" (no buttons)
      │
      ├─ 410 Gone, expirado    → render "Este link expirou"
      │
      └─ 404 Not Found, inválido → render "Link inválido"

Reparador picks ONE:

  (a) taps "Confirmar"                    (b) edits the address, taps "Salvar"
      │                                        │
      ▼                                        ▼
  POST /visita/confirmar                   PUT /visita/endereco
  Authorization: Bearer {jwt}              Authorization: Bearer {jwt}
  (no body)                                body = the 7 address fields
      │                                        │
      └────────────────┬───────────────────────┘
                       ▼
      ├─ 200 OK       → render "Confirmado!"
      ├─ 400          → (PUT only) validation error — show which field, stay on the form
      ├─ 409 Conflict → already confirmed elsewhere → render the already-confirmed state
      ├─ 410 Gone     → the link expired before the action landed → render "Este link expirou"
      ├─ 404          → the visit is no longer confirmable → render "Link inválido"
      └─ 401/403      → JWT expired mid-session (page open >30min) →
                         silently re-run the GET to get a fresh JWT, retry once
```

---

## Endpoints

Base path: **`/visita`** — mounted flat, same as every other domain in this API (`/campanha`, `/promotor`, `/rota`, `/oficina`). There is **no** `/api` prefix anywhere in this backend.

### `GET /visita/{token}`

Exchanges the WhatsApp link's opaque token for a JWT. Safe to call repeatedly (page reloads, reopening the link) — it is **not** single-use. Only the confirm/correct action is.

**Path param:** `token` — the opaque string from the WhatsApp link's URL.

**Response `200` — pending (show the address and both actions):**
```json
{
  "message": "Visita pendente de confirmação.",
  "data": {
    "state": "PENDING",
    "jwt": "eyJhbGciOi...",
    "oficinaNome": "Auto Center Silva",
    "promotorNome": "Carlos Promotor",
    "empresaNome": "Bosch Brasil",
    "endereco": {
      "ENDERECO": "Rua das Oficinas",
      "NUMERO": "1234",
      "COMPLEMENTO": "Galpão 2",
      "BAIRRO": "Vila Industrial",
      "CIDADE": "São Paulo",
      "ESTADO": "SP",
      "CEP": "01234-567"
    }
  }
}
```

`promotorNome` is the promoter assigned to this visit; `empresaNome` is the client company the campaign runs for. Either may be `null` when the relation cannot be resolved — render the page without them rather than blocking on them.

Any address field may be `null` — the registry has incomplete records. Render empty inputs, not the string `"null"`.

**Response `200` — already confirmed (no JWT, no actions):**
```json
{
  "message": "Visita já confirmada.",
  "data": {
    "state": "ALREADY_CONFIRMED",
    "oficinaNome": "Auto Center Silva",
    "confirmadoEm": "2026-08-09T14:32:00.000Z"
  }
}
```

**Response `410` — link expired:**
```json
{ "message": "Este link expirou.", "error": "EXPIRED" }
```

**Response `404` — malformed or unrecognized token:**
```json
{ "message": "Link inválido.", "error": "TOKEN_INVALID" }
```

### `POST /visita/confirmar`

Confirms the visit **and** that the displayed address is correct. Use when the reparador makes no edits.

**Header:** `Authorization: Bearer {jwt}`. No request body.

**Response `200`:**
```json
{
  "message": "Visita confirmada com sucesso.",
  "data": { "state": "CONFIRMED", "confirmadoEm": "2026-08-09T14:32:00.000Z" }
}
```

### `PUT /visita/endereco`

Corrects the address **and** confirms in the same call. Use when the reparador edits anything.

**Header:** `Authorization: Bearer {jwt}`

**Body — exactly these 7 fields, nothing else:**
```json
{
  "ENDERECO": "Avenida Nova",
  "NUMERO": "500",
  "COMPLEMENTO": null,
  "BAIRRO": "Centro",
  "CIDADE": "Campinas",
  "ESTADO": "SP",
  "CEP": "13010-000"
}
```

**The allowlist is enforced server-side and is strict.** Sending any other key — `TELEFONE`, `CNPJ`, `STATUS`, `ID_OFICINA`, anything — is rejected with `400` and **no** data is written. Don't spread the whole `endereco` object back with extra properties attached; send exactly these seven.

**Response `200`:**
```json
{
  "message": "Endereço atualizado e visita confirmada.",
  "data": {
    "state": "CONFIRMED",
    "confirmadoEm": "2026-08-09T14:32:00.000Z",
    "enderecoAtualizado": true
  }
}
```

**Response `400` — validation failure.** Two shapes, same meaning. The route's strict body schema rejects first and is what you will actually see:
```json
{
  "error": "Validation Error",
  "message": "Invalid input data",
  "details": [{ "field": "CNPJ", "message": "...", "code": "unrecognized_keys" }]
}
```
The service re-checks the allowlist as defence in depth and answers:
```json
{
  "message": "Dados inválidos.",
  "error": "VALIDATION_ERROR",
  "details": [{ "field": "CEP", "message": "...", "code": "..." }]
}
```
Both are `400`, both carry `details[]`, and in both cases nothing was written. Branch on the status, then read `details[].field`. Keep the user on the form and surface the offending field.

### Status codes (complete)

This is the whole contract, pinned in `spec.md` under "HTTP status codes (normative)". Branch on the `error` code, not on the status alone — `500` covers both a failed address write and an unexpected error, and only the code tells them apart.

| Endpoint | Status | `error` | Meaning |
| --- | --- | --- | --- |
| `GET /visita/{token}` | `200` | - | `PENDING` or `ALREADY_CONFIRMED` (read `data.state`) |
| `GET /visita/{token}` | `404` | `TOKEN_INVALID` | Malformed or unrecognized token |
| `GET /visita/{token}` | `410` | `EXPIRED` | Link past its 7-day window |
| `POST /visita/confirmar` | `200` | - | `CONFIRMED` |
| `PUT /visita/endereco` | `200` | - | `CONFIRMED`, `enderecoAtualizado: true` |
| `PUT /visita/endereco` | `400` | `Validation Error` (route schema) or `VALIDATION_ERROR` (service) | Non-allowlisted or invalid field; nothing written. Both shapes carry `details[]`; treat either as the same state |
| `POST` / `PUT` | `404` | `TOKEN_INVALID` | Visit no longer confirmable |
| `POST` / `PUT` | `409` | `ALREADY_CONFIRMED` | Confirmed already, elsewhere or in another tab |
| `POST` / `PUT` | `410` | `EXPIRED` | Link expired before the action landed |
| `POST` / `PUT` | `401` | `TOKEN_INVALID` | No `Authorization: Bearer <jwt>` header |
| `POST` / `PUT` | `403` | `TOKEN_INVALID` | JWT invalid, expired, or wrong scope |
| `PUT /visita/endereco` | `500` | `ADDRESS_UPDATE_FAILED` | Registry write failed; **no** confirmation recorded |
| All three | `429` | `RATE_LIMITED` | 20 requests/minute per visit exceeded |
| All three | `500` | *(error message)* | Unexpected server error |

### Shared error responses (`POST` and `PUT`)

**`401`/`403`** — JWT missing, expired, malformed, or wrong scope. Re-run `GET /visita/{token}` for a fresh JWT and retry **once**. If the visit now reports `ALREADY_CONFIRMED` or `EXPIRED`, render that instead of retrying again.

**`409`** — already confirmed (double-tap, two tabs, or two devices). Treat identically to `ALREADY_CONFIRMED`.

**`500`** — unexpected server error. For `PUT` specifically, a `500` may mean the address write itself failed; the backend guarantees it does **not** report a confirmation in that case, so treat it as "nothing happened" and let the user retry.

---

## States to render

| State | Trigger | UI |
| --- | --- | --- |
| `LOADING` | Initial page load, before `GET` resolves | Spinner / skeleton |
| `PENDING` | `GET` returns pending | Workshop name, address fields, **"Confirmar"** + **"Corrigir endereço"** |
| `EDITING` | User tapped "Corrigir endereço" | Editable form of the 7 fields, "Salvar" / "Cancelar" |
| `CONFIRMED` | `POST` or `PUT` succeeds | Success message, no further action |
| `ALREADY_CONFIRMED` | `GET`/`POST`/`PUT` reports it | "Você já confirmou em {data}" — no actions |
| `EXPIRED` | `GET`/`POST`/`PUT` returns `410` | "Este link expirou" — no actions, no retry |
| `TOKEN_INVALID` | `GET`/`POST`/`PUT` returns `404` | "Link inválido" — no actions |
| `VALIDATION_ERROR` | `PUT` returns `400` | Stay in `EDITING`, mark the offending field |
| `RATE_LIMITED` | Any endpoint returns `429` | "Muitas tentativas. Aguarde um minuto." — do **not** auto-retry |
| `ERROR` | Network failure or `500` | Generic error + manual "tentar novamente" |

**No visit date is rendered in any state.** The backend does not send one and the schema has no per-visit date to send. Don't substitute `CREATED_AT` or a campaign window for it.

**On `429`:** the limit is 20 requests/minute *per visit* (not per user, not per IP), so hitting it normally means rapid reloads. Back off and let the user retry manually — the automatic JWT re-exchange below must not fire on a `429`.

---

## JWT handling

- **Store it in memory only** (component state, a ref, a closure) — never `localStorage`/`sessionStorage`. It's short-lived (30 minutes) and scoped to exactly one visit, so a leak's blast radius is small, but there's no reason to persist it past the page's lifetime.
- It is **not** a general login token. It cannot view or act on the reparador's other visits — don't build any "my visits" feature on it; that's explicitly out of scope.
- If the page sits open past 30 minutes and an action returns `401`/`403`, silently re-fetch via `GET /visita/{token}` (the link token is re-exchangeable) rather than showing an error immediately. Retry the action once, then surface the real state.

---

## Things the backend deliberately does not do

Worth knowing so you don't build UI promising them:

- **Coordinates are not updated** when an address is corrected. There's no geocoding provider in this stack. Don't show a map preview implying the pin moved.
- **No approval step.** A correction writes straight through to the registry — there's no "pending review" state to display.
- **Only the address is editable.** Phone, name, CNPJ, and status are read-only for this flow, by design.

---

## Coming later — do not build yet

A "reschedule to a later date" action is planned but **not part of this feature**. The backend reserves room for it (a `REAGENDADO` status and a future `POST /visita/reagendar` sibling using the same JWT), but:

- Don't add a reschedule button or any UI for it now.
- Don't assume the `PENDING` shape is final — a future iteration may add fields.
- When it ships it reuses this exact flow (`GET` → JWT → authenticated action), just with a third action alongside confirm and correct.

---

## Open items that could still change this contract

From `spec.md`'s Assumptions table (rows still marked unconfirmed):

- JWT expiry window (assumed 30 minutes)
- Link token expiry window: **168 hours (7 days)** — confirmed by the user, no longer an assumption
- Portuguese copy above is placeholder, not final UX wording
- **Address correction depends on an unverified database grant.** Nothing in this codebase has ever written to the `MAIN_REGISTER` schema, and whether the app's DB user is allowed to is being checked during backend implementation. If that grant turns out to be missing, `PUT /visita/endereco` may be cut from this release — build the confirm path so it stands alone if that happens.
