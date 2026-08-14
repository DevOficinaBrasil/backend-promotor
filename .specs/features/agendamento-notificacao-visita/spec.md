# Agendamento de Envio da Notificação de Visita (Outbox) Specification

## Problem Statement

A `RotaPromotor` creation dispatches its WhatsApp notification inline, in the same request cycle (`rotaService.notificarRotasCriadas` → `NotificacaoVisitaService.notificarVisita` → `whatsAppChannel.send`). The reparador is therefore messaged whenever ops happens to import routes — a batch loaded at 23:40 wakes up every workshop in it — and a failed send is terminal, because no queue or scheduler exists in this codebase to retry against.

The obvious fix, a cron, is the one thing that must not be built: **this project's server is sometimes copied**, and every copy would run its own cron off its own clock, duplicating real messages to real workshops. The scheduler must be correct under N indistinguishable copies with no per-machine configuration to remember.

## Goals

- [ ] Route creation performs zero outbound provider calls; every notification is enqueued and delivered later.
- [ ] Notifications go out in a configurable window on the next day (default 09:00 America/São_Paulo), never at night, with a batch spread across the window rather than landing on one instant.
- [ ] N copies of the server deliver each notification once, with no leader election and no new infrastructure.
- [ ] A due notification survives the process dying mid-send, and survives every server being down at the scheduled hour.
- [ ] What is queued, for whom, for when, and why anything failed is answerable with a single `SELECT`.
- [ ] The queue mechanics sit behind one seam, so the planned migration to the shared delivery system replaces that seam rather than the notification flow.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| --- | --- |
| Redis / BullMQ | Viable but not chosen. A shared, queue-safe Redis does exist (`10.44.1.161:6379`, `noeviction`, AOF on) so the copied-server objection does not apply to it. Rejected instead because the `NOTIFICACAO_VISITA` row must exist regardless — it is the audit record and token holder — so BullMQ would add a second store that can drift from it, on an instance shared as a cache where a `FLUSHALL` would discard queued sends. See Assumptions. |
| `node-schedule` | `node-cron` **is** used, as the tick source, matching `backend-communities/schedule/crons/OutboxPublisher.ts`. This is safe because cron only decides *when to look*, never *what to send* — `SKIP LOCKED` decides that. `node-schedule` stays unimported. |
| Per-notification exact send time | User's explicit call: batch-level timing suffices. `AVAILABLE_AT` is stored per row, so per-row precision stays available later without another migration. |
| Admin UI to pick or change the send time | The hour comes from env. Rescheduling a queued row is an `UPDATE` away but ships no endpoint. |
| Inventing a retry/backoff policy | The ladder is **copied** from `OutboxService.computeBackoffMs` (`0 → 15s → 60s → 5m → 15m`) rather than designed here, so both services age the same way. Designing a different one is out of scope. |
| Separate worker process / ECS task | User's explicit call: the worker runs inside the existing API process. The claim is atomic, so every copy running the API is simply another worker. |
| Changing guards, recipient resolution, token issuance or channel behaviour | This feature moves **when** that flow runs, not what it does. `envioGuards`, `visitaToken` and `whatsappChannel` are untouched. |
| Backfilling rows created before this feature | Pre-existing `PENDENTE` rows were already attempted inline. AGND-13 excludes them permanently. |
| Alerting on a stalled queue | AGND-15 makes backlog queryable; wiring an alert to that query is ops work outside this codebase. |
| Building toward the shared delivery system's contract | That system is not ready to receive this traffic and its contract is not available to design against. This feature ships the same pattern locally, behind a seam (see Assumptions), so the migration swaps the scheduler rather than the notification flow. |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here — nothing is left silently unclear.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Claim mechanism | `SELECT … FOR UPDATE SKIP LOCKED` over `NOTIFICACAO_VISITA` | Correct under N copies with zero configuration: concurrent workers get disjoint row sets because Postgres skips rows another transaction holds. No leader election, no lock service, no new dependency | y |
| Why not Redis | Single source of truth, not the copied-server argument | Verified 2026-08-13: a shared Redis exists at `10.44.1.161:6379` with `maxmemory-policy=noeviction`, `maxmemory=0` and AOF enabled — queue-safe, and shared by all copies, so it would satisfy the copy constraint. Rejected on a different ground: the `NOTIFICACAO_VISITA` row is required anyway (audit record, token holder, what the confirmation endpoints read), so BullMQ means two stores that can disagree, and reconciling that drift means querying Postgres for orphaned rows — the outbox, rebuilt. The instance is also a shared **cache** (TypeORM query cache + access-log buffer in `backend-communities`), so a routine `FLUSHALL` to clear stale cache would silently discard queued sends | y |
| **Planned migration to a shared delivery system** | Build locally now, **mirroring the target's existing contract** column for column | The target is not hypothetical: `backend-communities/service/outbox` already runs it (`CRM.integration_outbox`, `OutboxService`, `OutboxPublisherAdapter`, EventBridge). It is not ready to receive this traffic, so this feature reproduces its semantics locally instead of guessing at an integration contract. Mirroring means the migration is a column-for-column mapping, and ops already know the vocabulary | y |
| `LOCKED_BY` type | `TEXT`, not the target's `VARCHAR(120)` | dba-rules for this database forbid `VARCHAR` (see `scripts/migration-notificacao-visita.sql` header). House rule wins over byte-for-byte parity; the semantics are identical | y |
| Column mapping to the target | `AVAILABLE_AT`←`available_at`, `LOCKED_AT`←`locked_at`, `LOCKED_BY`←`locked_by`, `ATTEMPTS`←`attempts`, `ERRO_ENVIO`←`last_error` (already exists), STATUS `PENDENTE`/`ENVIADO`/`FALHOU`←`PENDING`/`PUBLISHED`/`FAILED` | Names follow this table's SCREAMING_SNAKE house convention while mapping 1:1 to the target's lowercase columns. `ERRO_ENVIO` is reused rather than duplicated as `LAST_ERROR` — it already holds exactly that | y |
| Chosen over a local copy of `integration_outbox` | User's explicit call (Option 2) | A local event-outbox table would need an envelope this service cannot populate honestly — `tenantId`, `actor.userId`, `trace.correlationId` (no correlation-id util exists here) — and would double-write every notification. The column semantics port cleanly without the envelope | y |
| Retry/backoff ladder | Copied verbatim from `OutboxService.computeBackoffMs`: `0 → 15s → 60s → 5m → 15m` | Free to copy, already proven in production, and keeps both services' retry behaviour identical. `AVAILABLE_AT` is pushed forward by the ladder on each retry, which is exactly how the target reschedules | y |
| Bug **not** inherited from the target | `OutboxPublisher.ts:116` resets `attempts` to `1` in its batch-failure handler | That loses the attempt count, so a repeating batch crash can retry a row forever instead of retiring it at the ceiling. This implementation preserves the real attempt count on batch failure. Worth reporting upstream | y |
| Seam placement for that migration | `outboxNotificacaoService` owns claim + tick + retry decisions; `despacharNotificacao(id)` is the unit of work and knows nothing about how it was scheduled | Keeps the replaceable part (scheduling/claiming) separate from the part that must survive (guards, recipient, token, channel). The shared system, when ready, calls the same dispatch entry point | y |
| Row-level portability | `AVAILABLE_AT`, `ATTEMPTS` and `ERRO_ENVIO` stay on `NOTIFICACAO_VISITA` rather than in a separate queue table | The columns are meaningful notification history regardless of who schedules the send, so they survive the migration. A dedicated queue table would become dead weight the day the shared system takes over | y |
| Redis reachability from this service | Unverified | `backend-promotor` has no `REDIS_*` config today; only `backend-communities` connects to that private IP. Not blocking, since Redis is not on the chosen path, but it would be a prerequisite to verify before any future move to BullMQ | n |
| Send window | **Next day's** window, `NOTIFICACAO_HORA_ENVIO` (default `9`) to optional `NOTIFICACAO_HORA_ENVIO_FIM`, in `America/Sao_Paulo` | User's explicit call, revised 2026-08-14. Predictable for the reparador and structurally incapable of sending at night. "Always tomorrow" means send time never depends on what hour ops imported; the known cost is that a 06:00 import waits ~27h instead of 3h | y |
| Batch spreading | Even spacing across the window, by position in the created batch | User's explicit call over random jitter: predictable and reproducible. Spreading is what keeps AGND-20's ceiling (`batch x copies` per tick) off the critical path — 500 routes over 3h is a trickle, the same 500 at one instant is a burst. Per-batch, not global: two large imports on the same day overlap, which is accepted and still far better than both landing on one instant | y |
| Window unset | `NOTIFICACAO_HORA_ENVIO_FIM` unset, or not later than the start, collapses to the single-hour behaviour | Keeps the simple case simple and makes the window opt-in; an unusable value degrades instead of failing | y |
| Timezone handling | `date-fns-tz` — installed and in `package.json`, but **imported nowhere in this repo today** | Corrected 2026-08-13: an earlier draft claimed it was already in use. It is not — there is no `date-fns` import and no `America/` string anywhere in the codebase, consistent with `CLAUDE.md`'s warning that these dependency lists are inflated by forking. So this is a first use, not a free reuse: no install needed, but the timezone conversion is new code that must be unit-tested on its own (`utils/agendamento.ts`) rather than assumed correct. `Intl.DateTimeFormat` with a `timeZone` option is the dependency-free alternative if preferred | y |
| Clock of record | Postgres `now()`, never the Node process clock | A copied server may carry a skewed clock; the database is the single clock all copies agree on. This is what makes due-ness unambiguous | y |
| Worker host | Inside the API process, started from `app.ts`, gated by `OUTBOX_VISITA_ENABLED` | User's explicit call. No new deploy artifact; the env gate keeps it off locally | y |
| Tick source | `node-cron`, expression from `OUTBOX_VISITA_CRON_EXPRESSION`, default `*/1 * * * *` | Same mechanism and same default as the target's `OutboxPublisher`. Cron is safe here because it only decides when to *look*; `SKIP LOCKED` decides what each worker gets. A minute of latency is irrelevant to a 09:00 batch | y |
| Lease semantics | `locked_at` timestamp + `OUTBOX_VISITA_LOCK_LEASE_MINUTES` (default `5`), expiry evaluated as `locked_at < now() - interval` | Mirrors the target exactly rather than storing a precomputed expiry. 5 minutes still dwarfs the channel's 10s timeout | y |
| Worker identity | `LOCKED_BY` = `outbox-visita-${process.pid}` for the cron, `outbox-visita-cli-${process.pid}` for the manual console | Makes "which copy is holding this row" answerable — the one piece of debugging a copied-server setup actually needs. Prefixed `-visita` rather than the target's bare `outbox-<pid>` so the two services' worker ids never read alike in a shared log search | y |
| Env var names | `OUTBOX_VISITA_*`, **prefixed**, not the target's bare `OUTBOX_*` | Servers and their `.env` files get copied around here. Identical names would let one copied file switch on both this worker and `backend-communities`' EventBridge publisher. The prefix keeps the vocabulary recognisable while making cross-enable impossible | y |
| Env flag convention | `'1'`, not `'true'`, parsed as strict `=== '1'` | Matches `OutboxService.ts:8` and `EventBridgePublisherAdapter.ts:15`, so the outbox family reads the same in both services. Known cost: this repo's other flags use `"true"` (`whatsappChannel.ts:111`), so setting `OUTBOX_VISITA_ENABLED=true` out of habit leaves the worker silently dead. Mitigated by the prefix signalling a different family, and by the startup log printing the parsed value | y |
| Batch size | 20 rows per tick (`OUTBOX_VISITA_BATCH_SIZE`) | Matches the bounded-concurrency instinct already in `rotaService.NOTIFICACOES_SIMULTANEAS = 5`; a morning batch drains over several ticks instead of opening hundreds of provider connections at once | y |
| Lease duration | **5 minutes** (`OUTBOX_VISITA_LOCK_LEASE_MINUTES`, the target's default) | Must exceed the channel's 10s timeout by a wide margin so a slow-but-alive send is never double-claimed, while still recovering quickly from a killed process. The unit is **minutes**: `120` here would mean a two-hour lease, not two minutes | y |
| Delivery guarantee | At-least-once | A send that succeeds at the provider but dies before the `ENVIADO` write will repeat. Exactly-once needs provider-side idempotency keys, which `send-template` does not document. Blast radius is capped by `UNIQUE(ID_ROTA_PROMOTOR)` and bounded `ATTEMPTS` | y |
| **When the guards run** | At send time, not creation time | The substantive behavioural change of this feature. Address freshness, campaign end and per-recipient anti-spam are all time-dependent; evaluating them at 09:00 is *more* correct than at import time, but a route can now be created and legitimately resolve to `DISPENSADO` hours later | y |
| Recipient resolution timing | Also at send time | The workshop's `Usuario` set and phone numbers can change overnight, and the anti-spam guards are keyed on the recipient, so resolution must sit on the same side of the delay as the guards | y |
| Token issuance timing | Also at send time | `EXPIRA_EM` is "campaign end, else 168h from issuance"; issuing at creation would burn part of that window sitting in the queue. Relative to dispatch nothing changes — the token is still created immediately before the send that carries it | y |
| Queued-state representation | `PENDENTE` + non-null `AVAILABLE_AT` | `PENDENTE` already means "created, not yet sent", so no new STATUS value and no change to `CHK_NOTIFICACAO_VISITA_STATUS` | y |
| Retry ceiling | `FALHOU` once `ATTEMPTS` reaches `OUTBOX_VISITA_MAX_ATTEMPTS` (default `3`) | Preserves today's terminal-`FALHOU` semantics for anything genuinely broken while letting a transient provider blip resolve itself | y |
| Which failures are retryable | `network error`, `provider error`, `provider rate/quota` retry; everything else is terminal | The three transient reasons are exactly the channel's non-deterministic outcomes. A missing recipient or an invalid phone will fail identically on every attempt, so retrying wastes provider quota and delays the terminal record | y |
| `channel not configured` classification | Terminal, not retryable | It means account/token/template config is wrong, which no retry fixes; the channel already treats it as a configuration problem rather than a per-recipient one | y |
| Rows queued before this feature | Excluded via `AVAILABLE_AT IS NOT NULL` | They were already dispatched inline; without the predicate the first deploy re-sends every historical `PENDENTE` row at once. The single most dangerous edge of this migration | y |
| Migration path | New `scripts/migration-outbox-notificacao-visita.sql` with an `ALTER TABLE`, superseding the 2026-08-07 "primeira execução, sem caminho de `ALTER`" decision | That decision held while the table did not exist in prod. It does now, so the columns can only arrive by `ALTER`. The script follows the same house rules as `scripts/migration-notificacao-visita.sql` — idempotent (`IF NOT EXISTS`), a `ROLLBACK:` header, and no blank line or semicolon-bearing comment inside a statement, because SQL clients split scripts on both and ship half a statement to the server. `STATE.md` records the supersession | y |
| Aggregate send rate | Accepted and quantified, not throttled | Worst case is `OUTBOX_VISITA_BATCH_SIZE` × copies per tick — 20 × N per minute, versus the 5-concurrent bound of the old inline path. Accepted because a morning batch is expected in the tens of routes, and because the backoff ladder already spaces retries after the first failure. AGND-20 pins the assumption so it fails loudly rather than silently: if batches ever reach thousands, this needs revisiting before the provider starts returning `RATE_LIMITED` in bulk | y |
| `notificarVisita` retained | Yes, but no production route-creation path may call it | Keeps the existing unit tests and the manual console on a synchronous path without a wide rewrite, while AGND-21 forbids the inline-send regression it would otherwise invite | y |
| Weekend handling | None — a Saturday slot stays on Saturday | Not raised as a requirement, and suppressing weekends silently delays time-sensitive visits. Logged rather than assumed | y |
| Ordering guarantee | `AVAILABLE_AT` ascending, no stronger promise | Notifications are independent, one per route, and the existing flow already treats order as meaningless (`notificarRotasCriadas` uses a worker pool) | y |
| Redis topology | Resolved 2026-08-13: one shared instance, queue-safe | Config read directly: `noeviction`, no memory cap, AOF on, 21 keys all TTL'd (pure cache use today). This closes the open question — the choice above is now made on the single-source-of-truth argument, not on topology | y |

**Open questions:** none — all resolved or logged above.

---

## Implicit-Requirement Dimensions Sweep

Large scope: every dimension resolves to a requirement or an explicit N/A.

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | Batch size, lease, interval and retry ceiling are all bounded via env with defaults (Configuration table). AGND-04 bounds rows claimed per tick; AGND-20 pins the resulting worst-case provider rate across copies. |
| Failure / partial-failure states | AGND-10 (terminal outcomes), AGND-11 (transient retry), AGND-12 (tick-level failure never crashes the API). |
| Idempotency / retry / duplicate handling | AGND-05 (at most one worker per row), AGND-06 (attempt counted at claim time), AGND-11 (bounded retry). At-least-once is logged as an accepted assumption. |
| Auth boundaries & rate limits | N/A because the worker is an internal process with no caller; the public confirmation endpoints and their per-visit throttle are unchanged by this feature. |
| Concurrency / ordering | AGND-04, AGND-05, AGND-07. Ordering is `AVAILABLE_AT` ascending with no stronger guarantee (Assumptions). |
| Data lifecycle / expiry | AGND-08 (lease expiry returns a row to the queue), AGND-13 (pre-migration rows never claimable). Token `EXPIRA_EM` semantics are unchanged and out of scope. |
| Observability | AGND-14 (per-tick and per-row logging), AGND-15 (queue state answerable by query). |
| External-dependency failure | AGND-11 — provider timeouts, network errors and rate limits are retried rather than lost; the channel's own diagnostics are unchanged. |
| State-transition integrity | AGND-09 (only `PENDENTE` + due + unleased rows are claimable, so terminal rows can never be re-dispatched), AGND-10. |

---

## User Stories

### P1: Enqueue instead of sending inline ⭐ MVP

**User Story**: As ops importing a route batch, I want route creation to record the notification for later instead of messaging workshops immediately, so that an import at 23:40 does not wake up hundreds of reparadores.

**Why P1**: Without it there is nothing to schedule; every other story operates on the queued row.

**Acceptance Criteria**:

1. WHEN a `RotaPromotor` is created THEN the system SHALL persist exactly one `NotificacaoVisita` row in STATUS `PENDENTE` with `AVAILABLE_AT` set, and SHALL NOT resolve a recipient, issue a token, or perform any outbound provider call during the creation request.
2. WHEN computing `AVAILABLE_AT`, AND `OUTBOX_VISITA_ENVIO_IMEDIATO` is not `"1"`, THEN the system SHALL place the notification in the **next day's** send window in `America/Sao_Paulo`, persisted as `timestamptz` — regardless of the hour of creation. (AGND-16 defines the `"1"` case and takes precedence over this criterion.)
5. WHERE `NOTIFICACAO_HORA_ENVIO_FIM` defines a window later than `NOTIFICACAO_HORA_ENVIO`, WHEN a batch of routes is created THEN the system SHALL space the batch evenly across that window, placing route `i` of `n` at `inicio + (fim - inicio) x i/n`, so no notification is scheduled at or after the window's end.
3. IF the notification row cannot be written THEN the system SHALL still return the created `RotaPromotor` successfully, preserving the isolation guarantee of the parent spec's AC10.
4. WHILE the outbox owns delivery, no production route-creation path SHALL call `notificarVisita` (which dispatches inline); it is retained only for the manual console and existing tests, and `RotaService` SHALL enqueue via `agendarVisita`.

**Independent Test**: Create a route at any hour; assert one `PENDENTE` row exists with `AVAILABLE_AT` at the configured hour, and that the WhatsApp channel was never called.

---

### P1: Claim each notification exactly once across copied servers ⭐ MVP

**User Story**: As the operator of a server that sometimes gets copied, I want two running copies to never send the same notification twice, so that duplicating a machine is harmless instead of embarrassing.

**Why P1**: This is the constraint that rejected cron and Redis; the feature has no value without it.

**Acceptance Criteria**:

1. WHEN the worker ticks THEN the system SHALL claim due rows in a single statement using `FOR UPDATE SKIP LOCKED`, selecting only rows where STATUS is `PENDENTE`, `AVAILABLE_AT` is non-null and `<= now()`, and `LOCKED_AT` is null or older than `OUTBOX_VISITA_LOCK_LEASE_MINUTES`, ordered by `AVAILABLE_AT` ascending and limited to `OUTBOX_VISITA_BATCH_SIZE`, using the same CTE-plus-UPDATE shape as `OutboxService.lockBatchForPublish`.
2. WHILE two or more workers claim concurrently the system SHALL grant each row to at most one worker, and no worker SHALL block waiting on another worker's rows.
3. WHEN a row is claimed THEN the system SHALL set `LOCKED_AT` to `now()`, `LOCKED_BY` to its worker id, and increment `ATTEMPTS`, all in the same statement that selects the row.
4. The system SHALL evaluate due-ness and lease expiry using the database clock via `now()`, never the Node process clock.
5. IF a worker stops between claiming a row and completing it THEN the system SHALL make that row claimable again once `LOCKED_AT` is older than `OUTBOX_VISITA_LOCK_LEASE_MINUTES`, with no operator intervention.

**Independent Test**: Insert 20 due rows, run two claim calls concurrently against the same database, and assert the two returned ID sets are disjoint and together cover at most 20 rows with no ID repeated.

---

### P1: Dispatch on schedule, with bounded retry ⭐ MVP

**User Story**: As a reparador, I want the confirmation message to arrive in the morning and to still arrive if the provider hiccuped, so that I get exactly one usable link at a reasonable hour.

**Why P1**: The delivery half of the MVP; also the first retry capability this feature has ever had.

**Acceptance Criteria**:

1. WHEN a row is claimed THEN the system SHALL run the existing send flow for it — pre-send guards, recipient resolution, phone normalization, token issuance and channel dispatch — evaluated against state as of the send rather than as of route creation.
2. WHEN dispatch succeeds THEN the system SHALL set STATUS `ENVIADO` with `ENVIADO_EM`, `MESSAGE_ID` and `PROVIDER_MESSAGE_ID`, and SHALL clear `LOCKED_AT` and `LOCKED_BY`.
3. IF the flow resolves the row to `DISPENSADO`, or to `FALHOU` for a non-transient reason (workshop missing, campaign ended, no recipient, no phone, invalid phone, channel not configured) THEN the system SHALL persist that status as terminal and SHALL NOT dispatch that row again regardless of remaining attempts.
4. IF dispatch fails with `network error`, `provider error` or `provider rate/quota` AND `ATTEMPTS` is below `OUTBOX_VISITA_MAX_ATTEMPTS` THEN the system SHALL leave the row `PENDENTE`, clear `LOCKED_AT` and `LOCKED_BY`, record the reason in `ERRO_ENVIO`, and push `AVAILABLE_AT` forward by the copied backoff ladder (`0 → 15s → 60s → 5m → 15m`) so a later tick retries it.
5. IF dispatch fails transiently AND `ATTEMPTS` has reached `OUTBOX_VISITA_MAX_ATTEMPTS` THEN the system SHALL set STATUS `FALHOU` with the last `ERRO_ENVIO` and SHALL NOT retry further.
6. IF a tick throws for any reason THEN the system SHALL log the failure and continue on the next interval, and SHALL NOT terminate the API process hosting it.
7. The system SHALL dispatch at most `OUTBOX_VISITA_BATCH_SIZE` notifications per tick per running copy, giving a worst-case provider rate of `OUTBOX_VISITA_BATCH_SIZE` × copies per cron interval, which SHALL be recorded in `.env.example` next to the batch-size variable so the ceiling is visible where it is configured.

**Independent Test**: Stub the channel to fail with `network error` twice then succeed; assert the row ends `ENVIADO` with `ATTEMPTS = 3`, and that a stub failing with `invalid phone` ends `FALHOU` after exactly one attempt.

---

### P2: Deploy without re-sending history

**User Story**: As the engineer deploying this, I want the first boot to leave old rows alone and the worker to be switchable, so that shipping the queue cannot blast historical notifications.

**Why P2**: Not part of the running behaviour, but the migration is the highest-risk moment of the feature.

**Acceptance Criteria**:

1. WHILE `AVAILABLE_AT` is null on a row the system SHALL NOT claim it, so `PENDENTE` rows created before this feature are never dispatched by the worker.
2. WHERE `OUTBOX_VISITA_ENABLED` is not exactly `"1"` the system SHALL NOT start the worker, leaving enqueue behaviour intact and queued rows untouched.
3. WHILE `NODE_ENV` is `"test"` the system SHALL NOT start the worker under any configuration, mirroring the channel's unconditional test lock.

**Independent Test**: With a pre-migration `PENDENTE` row (null `AVAILABLE_AT`) present and the worker enabled, run a tick and assert the row is not claimed and the channel is not called.

---

### P2: See the queue

**User Story**: As ops, I want to know what is about to be sent and why anything failed, so that I can answer "did the workshop get messaged?" without reading logs.

**Why P2**: The system works without it, but a queue nobody can inspect is a queue nobody trusts.

**Acceptance Criteria**:

1. WHEN the worker claims rows or completes a dispatch THEN the system SHALL log the claim count and each row's outcome with `ID_NOTIFICACAO_VISITA` and `ID_ROTA_PROMOTOR`, reusing the existing log prefixes.
2. The system SHALL persist scheduled time, attempt count and failure reason on the notification row itself, so queue state is answerable by SQL alone without inspecting process state.

**Independent Test**: After a failed then successful dispatch, a single `SELECT` returns the row's `AVAILABLE_AT`, `ATTEMPTS`, `ERRO_ENVIO` and final STATUS.

---

### P3: Exercise the queue by hand

**User Story**: As the developer testing this, I want to enqueue, inspect, re-arm and drain the queue from the terminal, so that I can watch a real message arrive without waiting for 09:00 or hand-editing rows.

**Why P3**: Not required for the feature to run correctly, but without it the feature cannot be exercised end-to-end before it ships.

**Acceptance Criteria**:

1. WHERE `OUTBOX_VISITA_ENVIO_IMEDIATO` is exactly `"1"` the system SHALL set `AVAILABLE_AT` to the creation instant instead of the next `NOTIFICACAO_HORA_ENVIO`, so a route created for testing is due at once.
2. WHEN the operator runs the outbox console's `tick` command THEN the system SHALL execute exactly one claim-and-dispatch cycle in the foreground, print each row's outcome, and exit — running it even when `OUTBOX_VISITA_ENABLED` is not `"1"`, since invoking it is explicit operator intent.
3. WHEN the operator runs the console's `status` command THEN the system SHALL print counts by STATUS, the number of rows due now, and the next rows to go out with their `AVAILABLE_AT`, `ATTEMPTS`, `LOCKED_BY` and `ERRO_ENVIO`.
4. WHEN the operator runs the console's `agendar` command for a route or notification id THEN the system SHALL set that row's `AVAILABLE_AT` to now, clear its lease, and — for a row already in a terminal status — return it to `PENDENTE` with `ATTEMPTS` reset, so a failed send can be replayed.
5. IF an `agendar` target is already `CONFIRMADO` THEN the system SHALL refuse and print why, so a confirmation is never destroyed to re-run a test.
6. WHILE `NODE_ENV` is `"test"` the console's `tick` SHALL take the channel's existing no-op path, so a manual run during a test run still cannot send.

**Independent Test**: With `OUTBOX_VISITA_ENVIO_IMEDIATO=1` and `WHATSAPP_TEST_PHONE_OVERRIDE` set, create a route, run `status` (row due now), run `tick`, and observe the message on the override number and the row at `ENVIADO`.

---

## Edge Cases

- IF every server is down at the scheduled hour THEN the system SHALL dispatch the row on the next tick after startup rather than skipping it, since due-ness is `AVAILABLE_AT <= now()` and not an instant in time.
- IF a copied server's system clock is skewed by hours THEN the system SHALL still dispatch at the correct moment, because due-ness is evaluated by the database.
- IF a route is deleted or its campaign ends between enqueue and send THEN the system SHALL resolve the row through the existing guards to `DISPENSADO` or `FALHOU` rather than sending a message with a dead link.
- IF the same route somehow reaches enqueue twice THEN the system SHALL reject the second row via the existing `UNIQUE(ID_ROTA_PROMOTOR)` constraint, and SHALL NOT fail the route creation.
- WHEN a morning batch exceeds `OUTBOX_VISITA_BATCH_SIZE` THEN the system SHALL drain it across consecutive ticks in `AVAILABLE_AT` order rather than claiming it all at once.
- IF a send succeeds at the provider but the process dies before persisting `ENVIADO` THEN the system SHALL redeliver that row after the lease expires, producing a duplicate message — an accepted at-least-once outcome bounded by `OUTBOX_VISITA_MAX_ATTEMPTS`.

---

## Data Model Changes

Additive only: no column is dropped, no existing column changes type or meaning.

```sql
ALTER TABLE "CAMPANHAS_OB"."NOTIFICACAO_VISITA"
  ADD COLUMN "AVAILABLE_AT" timestamptz,
  ADD COLUMN "LOCKED_AT"    timestamptz,
  ADD COLUMN "LOCKED_BY"    text,
  ADD COLUMN "ATTEMPTS"     integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."AVAILABLE_AT" IS
  'Quando esta notificação fica elegível para envio. NULL = linha anterior ao outbox, nunca reivindicada. Equivale a CRM.integration_outbox.available_at';
COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."LOCKED_AT" IS
  'Início do lease do worker; expira em OUTBOX_VISITA_LOCK_LEASE_MINUTES. Equivale a integration_outbox.locked_at';
COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."LOCKED_BY" IS
  'Worker que detém o lease (outbox-<pid>). Equivale a integration_outbox.locked_by';
COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."ATTEMPTS" IS
  'Tentativas de envio; teto em OUTBOX_VISITA_MAX_ATTEMPTS. Equivale a integration_outbox.attempts';

-- Mirrors idx_integration_outbox_status_available_at. Partial: only PENDENTE
-- rows are claimable, and the queue is a small slice of a table that retains
-- every notification ever sent.
CREATE INDEX "IDX_NOTIFICACAO_VISITA_FILA"
    ON "CAMPANHAS_OB"."NOTIFICACAO_VISITA" ("AVAILABLE_AT")
 WHERE "STATUS" = 'PENDENTE' AND "AVAILABLE_AT" IS NOT NULL;
```

`ERRO_ENVIO` already exists and serves as `last_error`; no `LAST_ERROR` column is added. STATUS needs no new value — `PENDENTE`/`ENVIADO`/`FALHOU` already map onto the target's `PENDING`/`PUBLISHED`/`FAILED`, so `CHK_NOTIFICACAO_VISITA_STATUS` is untouched.

## The Claim Query

Same shape as `OutboxService.lockBatchForPublish` — CTE `picked`, then `UPDATE … FROM picked`:

```sql
WITH picked AS (
  SELECT "ID_NOTIFICACAO_VISITA"
    FROM "CAMPANHAS_OB"."NOTIFICACAO_VISITA"
   WHERE "STATUS" = 'PENDENTE'
     AND "AVAILABLE_AT" IS NOT NULL
     AND "AVAILABLE_AT" <= now()
     AND ("LOCKED_AT" IS NULL OR "LOCKED_AT" < now() - ($2 || ' minutes')::interval)
   ORDER BY "AVAILABLE_AT" ASC
   LIMIT $1
   FOR UPDATE SKIP LOCKED
)
UPDATE "CAMPANHAS_OB"."NOTIFICACAO_VISITA" n
   SET "LOCKED_AT"  = now(),
       "LOCKED_BY"  = $3,
       "ATTEMPTS"   = n."ATTEMPTS" + 1,
       "UPDATED_AT" = now()
  FROM picked
 WHERE n."ID_NOTIFICACAO_VISITA" = picked."ID_NOTIFICACAO_VISITA"
RETURNING n."ID_NOTIFICACAO_VISITA";
```

Two deliberate departures from the target, both narrow:

- `ATTEMPTS` is incremented **here**, at claim time, rather than computed per row during publish. A process killed mid-dispatch therefore still burns an attempt, which is what stops a row that reliably crashes the worker from being retried forever.
- Only `ID_NOTIFICACAO_VISITA` is returned. The target returns every column and then spends ~90 lines (`normalizeLockedRow`, `toText`) defending against drivers that hand back positional arrays. Returning one integer column needs none of that; the dispatcher re-reads the row through the repository it already uses.

`SKIP LOCKED` is what makes copied servers harmless: a row already locked by another worker's transaction is passed over instead of waited on, so concurrent workers receive disjoint sets and neither blocks.

## Configuration

Names, defaults and value convention are taken from `backend-communities` so the two services are configured identically. `NOTIFICACAO_HORA_ENVIO` is the only one with no counterpart there, because scheduling a business hour is specific to this feature.

| Variable | Default | Target parity | Meaning |
| --- | --- | --- | --- |
| `OUTBOX_VISITA_ENABLED` | `0` | same name/value | Must be exactly `"1"` to start the worker. Default-off. |
| `OUTBOX_VISITA_CRON_EXPRESSION` | `*/1 * * * *` | same | Tick schedule for `node-cron`. |
| `OUTBOX_VISITA_BATCH_SIZE` | `20` | same name, target uses `100` | Rows claimed per tick. Lower here: each row costs a provider call with a 10s timeout, not an EventBridge put. |
| `OUTBOX_VISITA_LOCK_LEASE_MINUTES` | `5` | same | Lease length. Dwarfs the channel's 10s timeout. |
| `OUTBOX_VISITA_MAX_ATTEMPTS` | `3` | same name, target uses `5` | Attempts before a transient failure becomes terminal `FALHOU`. |
| `NOTIFICACAO_HORA_ENVIO` | `9` | none | Hour the window opens (America/São_Paulo). |
| `NOTIFICACAO_HORA_ENVIO_FIM` | *(unset)* | none | Hour the window closes. Unset, or not later than the start, means every notification goes out at the opening hour. |
| `OUTBOX_VISITA_ENVIO_IMEDIATO` | `0` | none | Local testing only. `"1"` makes every new notification due immediately instead of at the scheduled hour. Never set in production — it would send at import time, which is the behaviour this feature removes. |

## Affected Code

| File | Change |
| --- | --- |
| `scripts/migration-outbox-notificacao-visita.sql` *(new)* | The `ALTER TABLE` (four columns), the partial index and the `COMMENT ON`s. Follows the house migration conventions documented in `scripts/migration-notificacao-visita.sql`'s header — no blank lines or semicolon-bearing comments inside a statement — and carries a `ROLLBACK:` note. |
| `entities/NotificacaoVisita.ts` | Four new columns: `AVAILABLE_AT`, `LOCKED_AT`, `LOCKED_BY`, `ATTEMPTS`. |
| `service/notificacaoVisitaService.ts` | Split `notificarVisita` into `agendarVisita` (create `PENDENTE` + `AVAILABLE_AT`) and `despacharNotificacao` (guards onward, run by the worker). The dispatch half keeps today's behaviour. |
| `service/rotaService.ts` | `notificarRotasCriadas` enqueues instead of dispatching; the per-route try/catch isolation stays. The `NOTIFICACOES_SIMULTANEAS = 5` pool becomes unnecessary once enqueue is a single insert. |
| `service/outboxNotificacaoService.ts` *(new)* | Claim query, tick loop, per-row dispatch, retry/terminal decision. |
| `schedule/outboxNotificacaoCron.ts` *(new)* | `node-cron` registration, worker id, and the `OUTBOX_VISITA_ENABLED` / `NODE_ENV=test` gates. |
| `scripts/outboxConsole.ts` *(new)* | Manual `status` / `tick` / `agendar` commands (AGND-16…19). |
| `utils/agendamento.ts` *(new)* | `proximoHorarioEnvio(agora)` — the timezone rule plus the `OUTBOX_VISITA_ENVIO_IMEDIATO` override, isolated so it is testable without a real clock. |
| `app.ts` | Registers the cron. |
| `package.json` | npm scripts for the console, alongside the existing `whatsapp:mock`. |
| `.env.example` | The seven variables in the Configuration table. |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| AGND-01 | P1: Enqueue instead of sending inline | Execute | ✅ Verified |
| AGND-02 | P1: Enqueue instead of sending inline | Execute | ✅ Verified |
| AGND-03 | P1: Enqueue instead of sending inline | Execute | ✅ Verified |
| AGND-04 | P1: Claim exactly once across copies | Execute | ✅ Verified |
| AGND-05 | P1: Claim exactly once across copies | Execute | ✅ Verified |
| AGND-06 | P1: Claim exactly once across copies | Execute | ✅ Verified |
| AGND-07 | P1: Claim exactly once across copies | Execute | ✅ Verified |
| AGND-08 | P1: Claim exactly once across copies | Execute | ✅ Verified |
| AGND-09 | P1: Dispatch on schedule, bounded retry | Execute | ✅ Verified |
| AGND-10 | P1: Dispatch on schedule, bounded retry | Execute | ✅ Verified |
| AGND-11 | P1: Dispatch on schedule, bounded retry | Execute | ✅ Verified |
| AGND-12 | P1: Dispatch on schedule, bounded retry | Execute | ✅ Verified |
| AGND-13 | P2: Deploy without re-sending history | Execute | ✅ Verified |
| AGND-14 | P2: See the queue | Execute | ✅ Verified |
| AGND-15 | P2: See the queue | Execute | ✅ Verified |
| AGND-16 | P3: Exercise the queue by hand | Execute | ✅ Verified |
| AGND-17 | P3: Exercise the queue by hand | Execute | ✅ Verified |
| AGND-18 | P3: Exercise the queue by hand | Execute | ✅ Verified |
| AGND-19 | P3: Exercise the queue by hand | Execute | ✅ Verified |
| AGND-20 | P1: Dispatch on schedule, bounded retry | Execute | ✅ Verified |
| AGND-21 | P1: Enqueue instead of sending inline | Execute | ✅ Verified |
| AGND-22 | P1: Enqueue instead of sending inline | Execute | ✅ Verified |

**ID mapping:** AGND-01…03 = P1 story 1 AC1-3; AGND-04…08 = P1 story 2 AC1-5; AGND-09…12 = P1 story 3 AC1-3 plus AC4-6 folded into AGND-11 (retry) and AGND-12 (tick isolation); AGND-13 = P2 story 1 AC1-3; AGND-14…15 = P2 story 2 AC1-2; AGND-16 = P3 AC1 (immediate scheduling), AGND-17 = P3 AC2 + AC6 (foreground tick and its test lock), AGND-18 = P3 AC3 (status), AGND-19 = P3 AC4 + AC5 (re-arm and its refusal); AGND-20 = P1 story 3 AC7 (send-rate ceiling); AGND-21 = P1 story 1 AC4 (no inline send from route creation); AGND-22 = P1 story 1 AC5 (batch spread across the send window).

**Coverage:** 22 total, 22 mapped to tasks, 0 unmapped. Verified 2026-08-13 — see `validation.md` (AGND-07, 17, 18 carry spec-precision caveats recorded there).

---

## Success Criteria

- [ ] A route created at 23:40 produces a `PENDENTE` row due 09:00 the next day and zero provider calls in the creation request.
- [ ] Two workers claiming 20 due rows concurrently return disjoint ID sets, with every row dispatched exactly once.
- [ ] Killing the process mid-dispatch leaves the row redeliverable within the lease window, with no manual intervention.
- [ ] A transient provider failure is retried up to the ceiling; a non-transient one is terminal after one attempt.
- [ ] Deploying with historical `PENDENTE` rows present dispatches none of them.
- [ ] Queue depth, per-row schedule, attempts and failure reason are all answerable with one `SELECT`.
- [ ] With `OUTBOX_VISITA_ENVIO_IMEDIATO=1`, a route created in dev is due immediately and a single manual `tick` delivers it — no waiting for 09:00 and no hand-edited rows.
- [ ] The console's `status` shows a queued row before dispatch and the same row `ENVIADO` after, with `LOCKED_BY` naming whichever worker claimed it.
- [ ] `agendar` replays a `FALHOU` row, and refuses a `CONFIRMADO` one.
