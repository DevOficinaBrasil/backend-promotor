# Frontend Contract — Visit Confirmation Page

**Status:** Draft, reflects `spec.md` as written during Specify. Field names/paths are the intended contract but are not yet locked by Design — re-check against `spec.md`'s Requirement Traceability before final implementation, and update this doc if Design changes anything.

**Audience:** whichever agent/session builds the public confirmation page. This doc is meant to be enough on its own — you shouldn't need to read the backend source or the full `spec.md` to implement the page, only to understand *why* a rule exists.

---

## What this page is

A reparador (workshop contact) taps a link inside a WhatsApp message. The link opens this page, which:

1. Exchanges the link's token for a short-lived access token (JWT).
2. Shows the workshop name and visit date.
3. Lets the reparador tap "Confirmar" once.

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
GET /visita/{linkToken}          ← backend, no auth header needed here
      │
      ├─ 200 OK, ainda pendente  → render workshop name + date + "Confirmar" button
      │                             store the returned JWT (in memory only, see below)
      │
      ├─ 200 OK, já confirmado   → render "Você já confirmou esta visita em {data}"
      │                             (no button, no JWT needed)
      │
      ├─ 410 Gone, expirado      → render "Este link expirou"
      │
      └─ 400/404, inválido      → render "Link inválido"

Reparador taps "Confirmar"
      │
      ▼
POST /visita/confirmar            Authorization: Bearer {jwt from step above}
      │
      ├─ 200 OK        → render "Visita confirmada!"
      ├─ 409 Conflict   → someone else confirmed it first (double-tap/two tabs) →
      │                    render the same "already confirmed" state as above
      └─ 401/403        → JWT expired mid-session (page was open >30min) →
                           silently re-run the GET step to get a fresh JWT, retry once
```

---

## Endpoints

Base path: **`/visita`** — mounted flat, same as every other domain in this API (`/campanha`, `/promotor`, `/rota`, `/oficina`). There is **no** `/api` prefix anywhere in this backend.

### `GET /visita/{token}`

Exchanges the WhatsApp link's opaque token for a JWT. Safe to call repeatedly (page reloads, reopening the link) — it is **not** single-use. Only the confirm action below is.

**Path param:** `token` — the opaque string from the WhatsApp link's URL.

**Response `200` — pending confirmation (show the confirm button):**
```json
{
  "message": "Visita pendente de confirmação.",
  "data": {
    "state": "PENDING",
    "jwt": "eyJhbGciOi...",
    "oficinaNome": "Auto Center Silva",
    "dataVisita": "2026-08-10"
  }
}
```

**Response `200` — already confirmed (no JWT, no button):**
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
{
  "message": "Este link expirou.",
  "error": "EXPIRED"
}
```

**Response `400`/`404` — malformed or unrecognized token:**
```json
{
  "message": "Link inválido.",
  "error": "TOKEN_INVALID"
}
```

### `POST /visita/confirmar`

**Header:** `Authorization: Bearer {jwt}` — the JWT from the `GET` call above. There is no request body.

**Response `200`:**
```json
{
  "message": "Visita confirmada com sucesso.",
  "data": {
    "state": "CONFIRMED",
    "confirmadoEm": "2026-08-09T14:32:00.000Z"
  }
}
```

**Response `401`/`403`** — JWT expired, malformed, or wrong scope. Re-run `GET /visita/{token}` to get a fresh JWT and retry once; if the visit is now `ALREADY_CONFIRMED` or expired, show that state instead of retrying forever.

**Response `409`** — someone else already confirmed (race between two taps/tabs, or the link was opened on two devices). Treat identically to the `ALREADY_CONFIRMED` state from the `GET` endpoint.

**Response `500`** — unexpected server error:
```json
{
  "message": "Erro interno ao confirmar visita.",
  "error": "<message>"
}
```

---

## States to render

| State | Trigger | UI |
| --- | --- | --- |
| `LOADING` | Initial page load, before `GET` resolves | Spinner / skeleton |
| `PENDING` | `GET` returns pending | Oficina name, visit date, "Confirmar" button |
| `CONFIRMED` | `POST` succeeds | Success message, no further action |
| `ALREADY_CONFIRMED` | `GET` or `POST` reports it | "Você já confirmou esta visita em {data}" — no button |
| `EXPIRED` | `GET` returns `410` | "Este link expirou" — no button, no retry |
| `TOKEN_INVALID` | `GET` returns `400`/`404` | "Link inválido" — no button |
| `RATE_LIMITED` | Either endpoint returns `429` | "Muitas tentativas. Aguarde um minuto e tente novamente." — do **not** auto-retry, that makes it worse |
| `ERROR` | Network failure or `500` | Generic error + a manual "tentar novamente" retry |

**On `429`:** the limit is 20 requests/minute *per visit* (not per user or per IP), so hitting it normally means rapid page reloads. Back off and let the user retry manually — the automatic re-exchange described under JWT handling must not fire on a `429`.

---

## JWT handling

- **Store it in memory only** (component state, a ref, a closure) — never `localStorage`/`sessionStorage`. It's short-lived (30 minutes) and scoped to exactly this one visit, so the blast radius of it leaking is small, but there's no reason to persist it past the page's lifetime.
- It is **not** a general login token. It cannot be used to view or act on the reparador's other visits — don't build any "see my other visits" feature on top of it, that's explicitly out of scope for this feature (see `spec.md` → Out of Scope).
- If the page sits open past 30 minutes and the confirm call comes back `401`/`403`, silently re-fetch via `GET /visita/{token}` (same token still works — it's re-exchangeable) rather than showing an error immediately.

---

## Coming later — do not build yet

A "reschedule to a later date" action is planned but **not part of this feature**. The backend is reserving room for it (`REAGENDADO` status, a future `POST /visita/reagendar` sibling endpoint using the same JWT), but:

- Don't add a "reschedule" button or any UI for it now.
- Don't assume the `PENDING` state's shape above is final — a future iteration may add fields once reschedule ships.
- When it does ship, it'll reuse the exact same token-exchange flow (`GET /visita/{token}` → JWT → authenticated action call), just with a second action alongside confirm.

---

## Open items that could still change this contract

From `spec.md`'s Assumptions table (unconfirmed rows) — check before relying on exact values:
- JWT expiry window (currently assumed 30 minutes)
- Link token expiry window (currently assumed 48 hours)
- Exact wording/copy for each state (Portuguese strings above are placeholders, not final UX copy)
