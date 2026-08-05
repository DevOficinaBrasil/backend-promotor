# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 - When an AC names several read paths, implement and test every one of them - a single-record read does not satisfy a criterion written about a list endpoint.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `service-layer` · harmful: 0
- features: notificacao-visita-confirmacao
- evidence: .specs/features/notificacao-visita-confirmacao/validation.md P2 AC2; service/campanhaService.ts:212 (service-layer)
- last seen: 2026-08-05T18:43:45Z

### L-002 - Every middleware wired into a route needs its own integration test - wiring it is not evidence that it behaves.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `routes` · harmful: 0
- features: notificacao-visita-confirmacao
- evidence: routes/VisitaRoute.ts:49; AC25 POST/PUT (routes)
- last seen: 2026-08-05T18:43:52Z

### L-003 - Specify the HTTP status code for every named error state, not just the state name, or the tests silently become the contract.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec` · harmful: 0
- features: notificacao-visita-confirmacao
- evidence: .specs/features/notificacao-visita-confirmacao/validation.md Spec-Precision Gaps; AC16-AC20, AC33 (spec)
- last seen: 2026-08-05T18:43:52Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
