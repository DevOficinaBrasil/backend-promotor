# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

### L-002 - Every middleware wired into a route needs its own integration test - wiring it is not evidence that it behaves.
- signal: `ac_gap` · recurrence: 2 feature(s) · scope: `routes` · harmful: 0
- features: notificacao-visita-confirmacao, importador-oficinas
- evidence: routes/VisitaRoute.ts:49; AC25 POST/PUT (routes) (+1 more)
- last seen: 2026-09-09T18:34:21Z

### L-004 - When a test mocks the query runner, assert the SQL string's joins and column aliases too - hand-fed rows prove the mapper, never the query.
- signal: `surviving_mutant` · recurrence: 2 feature(s) · scope: `raw-sql` · harmful: 0
- features: notificacao-visita-confirmacao, importador-oficinas
- evidence: .specs/features/notificacao-visita-confirmacao/validation.md M4, M11; service/campanhaService.ts:233-234, :225-227 (raw-sql) (+1 more)
- last seen: 2026-09-09T18:34:21Z

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

_none_

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
