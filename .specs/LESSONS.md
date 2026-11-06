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

### L-017 - When a spec AC says a list must be 'grouped by status/category', verify the code partitions or sorts by that field — don't accept a test that only feeds already-sorted input as proof of grouping.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `backend-promotor` · harmful: 0
- features: relatorio-semanal-promotores
- evidence: RELPROM-09 (utils/promotorReportCalculos.ts:165-190) (backend-promotor)
- last seen: 2026-10-29T13:11:51Z

### L-018 - When an AC specifies a boundary count (exactly 1 vs N), add a dedicated test for the boundary case even if it looks trivially covered by the N-case — evidence-or-zero requires a direct citation.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `backend-promotor` · harmful: 0
- features: relatorio-semanal-promotores
- evidence: RELPROM-27 (no direct test for exactly-1-active-campaign) (backend-promotor)
- last seen: 2026-10-29T13:11:52Z

### L-019 - When a fix groups data into labeled template sub-sections, add a test asserting each item lands under its correct heading - a correctly-grouped data layer can still be mis-rendered into swapped sections with zero test failures.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `backend-promotor` · harmful: 0
- features: relatorio-semanal-promotores
- evidence: templates/relatorioPromotor.ts:112-113 (mutant: swapped concluida/cancelada filter in renderizarDestaques) (backend-promotor)
- last seen: 2026-10-29T13:23:52Z

### L-020 - When a cross-table match key has two known sources (e.g. a local FK column and a linked external table's own key), state in the spec Assumption which source(s) the match condition must check, and get it confirmed before Tasks narrows it to just one.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `sql-matching` · harmful: 0
- features: ultracar-oficinas-promotores
- evidence: service/oficinaUltracarService.ts:45-47 (sql-matching)
- last seen: 2026-11-06T14:04:04Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
