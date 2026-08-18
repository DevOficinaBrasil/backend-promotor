# Testing Infrastructure

**Analyzed:** 2026-08-14 (supersedes 2026-08-04)
**Status:** ✅ **Unit suite green — 29 suites / 432 tests passing** (`npx jest --testMatch "**/__tests__/unit/**/*.test.ts"`, 7.8s, exit 0).

This reverses the previous mapping's headline finding. On 2026-08-04 the suite was red (31 of 41 tests failing) because `__mocks__/data-source.ts` was stale. That mock has been repaired and the suite has grown roughly tenfold.

## Test Frameworks

**Unit/Integration:** Jest with `ts-jest` `^29.4.1` preset, `testEnvironment: node`
**HTTP-level:** `supertest` — now genuinely used, by the three `/visita` integration suites
**Coverage:** Jest built-in. `coveragePathIgnorePatterns` is now `["entities", "data-source.ts"]`. The blanket `"utils"` exclusion was **removed**, so `migrationRepository`, `encryption`, `routeOptimizer`, `agendamento`, `visitaToken` and `telefone` now appear in coverage reports.

`jest.config.ts`: `clearMocks: true`, `verbose: true`, `@/*` → `<rootDir>/$1`, and `diagnostics.ignoreDiagnostics: [5103]` on the ts-jest transform.

**Version note:** `package.json` and `package-lock.json` pin `jest@29.7.0`, but the local `node_modules` resolves `30.1.3`. The working tree is out of sync with the lockfile; reinstall before treating a local-only run as authoritative.

## Test Organization

**Location:** `__tests__/`, split into `unit/`, `integration/`, and `helpers/`
**Naming:** `<subject>.test.ts`
**Discovery:** `testMatch: ["**/__tests__/**/*.test.ts"]` for `npm test`; the `test:unit` / `test:integration` scripts narrow it with explicit globs.

```
__tests__/
├── helpers/
│   └── mockMigrationRepo.ts        # shared fake for MigrationAwareRepository
├── unit/                           # 30 files
│   ├── campanhaService · campanhaServiceVisita · campanhaPerguntasService
│   ├── campanhaPromotorService · campanhaResultsService
│   ├── promotorService · usuarioService · oficinaService
│   ├── rotaService · rotaServiceVisita · geolocationService
│   ├── notificacaoVisitaService · agendarVisita · despacharNotificacao
│   ├── envioGuards · statusNotificacaoVisita · visitaConfirmacaoService
│   ├── outboxTick · outboxClaim(int) · outboxRetentativa · outboxMarcadores
│   ├── outboxCron · outboxConsole
│   ├── channelRegistry · whatsappChannel
│   ├── visitaToken · visitaAuthMiddleware
│   └── agendamento · haversine · telefone
└── integration/                    # 10 files
    ├── setup.ts                    # shared beforeAll/afterAll on the real DataSource
    ├── visitaExchange · visitaConfirmar · visitaEndereco   (supertest, HTTP-level)
    ├── outboxClaim                 # exercises FOR UPDATE SKIP LOCKED for real
    ├── campanhaService · campanhaPerguntasService · campanhaPromotorService
    ├── campanhaResultsService · oficinaService · promotorService · rotaService
```

Coverage has broadened well past the service layer: middleware (`visitaAuthMiddleware`), the channel adapter and registry, pure utilities (`telefone`, `haversine`, `agendamento`, `visitaToken`), and the CLI console are all tested. Still untested: **controllers**, entities, `utils/encryption.ts`, `utils/routeOptimizer.ts`, `utils/migrationRepository.ts`, `middlewares/authMiddleware.ts`, `middlewares/validation.ts`.

`tsconfig.json` still excludes `__tests__` from compilation, so `tsc` does not type-check test files — type errors surface only when Jest runs.

## Testing Patterns

### Unit tests

**Approach:** mock the data source entirely, assert on service behaviour and on how the persistence layer was called.

`jest.mock('../../data-source')` resolves to the manual mock in `__mocks__/data-source.ts`, which is now complete:

```typescript
export const AppDataSourceSync = {
  getRepository: jest.fn(),
  query: jest.fn(),
  transaction: jest.fn((cb) => cb({ create, save, softDelete, find, findOne })),
};
export const LegacyDataSource = { isInitialized: false, getRepository: jest.fn(), query: jest.fn() };
export const isLegacyEnabled = jest.fn().mockReturnValue(false);
```

`isLegacyEnabled` returning `false` degrades `MigrationAwareRepository` to new-DB-only, matching what most assertions expect; the merge path is opted into per-test. `__tests__/helpers/mockMigrationRepo.ts` factors out the repeated wrapper fake.

Structure is `describe(Subject)` → `describe(method)` → `it('should ...')`, with `clearMocks: true` handling reset.

### Pure-function tests

The outbox and scheduling logic was deliberately written as exported pure functions so it could be tested without a database or a clock: `computeBackoffMs`, `shouldMarkFailed`, `acaoDaFila`, `proximoHorarioEnvio` (which takes `agora` as an injected parameter, never reading the system clock — this is what makes the send-window rules testable regardless of when the suite runs), `statusEfetivo`, `normalizarTelefone`, `haversine`.

### Integration tests

Two distinct kinds now live under `integration/`:

1. **Real-database suites** — `setup.ts` initializes `AppDataSourceSync` in `beforeAll` and destroys it in `afterAll`. `outboxClaim.test.ts` is the important one: `FOR UPDATE SKIP LOCKED` cannot be verified against a mock, so it runs against a real Postgres. **These require live DB credentials and write to the database.** Do not run them casually.
2. **HTTP-level suites** — `visitaExchange`, `visitaConfirmar`, `visitaEndereco` drive the Express app through `supertest`, covering token exchange, the scoped-JWT middleware, and the confirmation endpoints.

The previous `integration/duckdb.test.ts` (which read the on-disk JSON and contained one tautological test) is gone.

### Send safety in tests

`whatsappChannel` returns without sending whenever `NODE_ENV === "test"`, unconditionally, and `registrarOutboxCron()` returns early on the same check. No suite can reach the real provider or start a worker — this is a hard guarantee, not a configuration convention.

## Test Execution

```bash
npm test                    # all suites (integration included — needs a live DB)
npm run test:unit           # __tests__/unit/**/*.test.ts — no DB required
npm run test:integration    # __tests__/integration/**/*.test.ts — needs a live DB
npm run test:watch · test:coverage · test:unit:watch · test:integration:watch
npm run test:unit:coverage · test:integration:coverage
```

Prefer `npm run test:unit` for a fast, side-effect-free check.

## Known Failures

Per `.specs/project/STATE.md`, three **legacy** integration suites fail at teardown on a foreign-key error: `rotaService`, `campanhaPromotorService`, `campanhaResultsService`. Common, pre-existing cause — the `PROMOTOR → CAMPANHA_PROMOTOR → ROTA_PROMOTOR` chain has inherited FKs without `ON DELETE`, and the test cleanup deletes top-down. Not a regression from the visit feature. (Not re-verified in this mapping pass; verifying it requires writing to a real database.)

## Coverage Targets

None documented, none enforced. **There is still no CI** — `.github/` contains only skill definitions, no workflows. Nothing blocks a merge on a red suite, which is exactly how the suite stayed broken across a merge to `main` for three weeks in July. Adding a workflow that runs `npm run test:unit` on pull requests is the single highest-value testing change available.
