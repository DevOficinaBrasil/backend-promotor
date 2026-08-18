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

### L-004 - When a test mocks the query runner, assert the SQL string's joins and column aliases too - hand-fed rows prove the mapper, never the query.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `raw-sql` · harmful: 0
- features: notificacao-visita-confirmacao
- evidence: .specs/features/notificacao-visita-confirmacao/validation.md M4, M11; service/campanhaService.ts:233-234, :225-227 (raw-sql)
- last seen: 2026-08-05T19:21:55Z

### L-005 - When a CLI script carries a guard that protects real data, extract it as a pure function and unit-test it — scoping the scripts layer to 'argument parsing' in the coverage matrix silently leaves that guard untested.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `scripts` · harmful: 0
- features: agendamento-notificacao-visita
- evidence: AGND-19 / scripts/outboxConsole.ts:165 (scripts)
- last seen: 2026-08-13T23:55:01Z

### L-006 - Before writing integration tests against a table, verify the target database's real constraints instead of trusting the versioned migration or the decision log — dev here still had an FK both said was removed.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `database` · harmful: 0
- features: agendamento-notificacao-visita
- evidence: STATE.md 2026-08-07 FK decision vs dev schema (database)
- last seen: 2026-08-13T23:55:01Z

### L-007 - An AC whose outcome is console output cannot be verified by the test suite; either assert the rendered string or record in the spec that the AC is manual-only.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `scripts` · harmful: 0
- features: agendamento-notificacao-visita
- evidence: AGND-17, AGND-18 (scripts)
- last seen: 2026-08-13T23:55:01Z

### L-008 - Quando uma AC de UI exige uma contagem ou um agregado, extraia o cálculo para uma função pura e teste-a: deixá-lo dentro do componente o coloca na camada isenta de teste e a AC fica sem nenhuma asserção.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `frontend/components` · harmful: 0
- features: status-confirmacao-visibilidade
- evidence: P2 AC7 / VISIB-10 — GerencialView.tsx:72-78 (frontend/components)
- last seen: 2026-08-17T03:18:55Z

### L-009 - Isentar componentes React do teste deixa o gate cego a 'o indicador sumiu': registre isso como risco declarado na spec, porque build e lint passam com o render neutralizado.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `frontend/components` · harmful: 0
- features: status-confirmacao-visibilidade
- evidence: mutantes 9 e 10 — StatusConfirmacaoBadge.tsx:44, route-carousel.tsx:50 (frontend/components)
- last seen: 2026-08-17T03:18:55Z

### L-010 - AC que manda 'exibir a data' sem fixar o formato não é verificável: defina o formato esperado na spec ou marque a AC como não asserível.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec` · harmful: 0
- features: status-confirmacao-visibilidade
- evidence: P1 promotor AC2 — route-carousel.tsx:38 (spec)
- last seen: 2026-08-17T03:18:55Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
