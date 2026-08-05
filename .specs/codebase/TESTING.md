# Testing Infrastructure

**Analyzed:** 2026-08-04
**Status at time of analysis:** ❌ **31 of 41 tests failing** (5 of 6 suites red). Single root cause, documented below.

## Test Frameworks

**Unit/Integration:** Jest `^30.0.5` with `ts-jest` `^29.4.1` preset, `testEnvironment: node`
**E2E:** none. `supertest` `^7.1.4` is installed but never imported; no HTTP-level tests exist.
**Coverage:** Jest built-in. `coveragePathIgnorePatterns` excludes `entities`, `data-source.ts`, and `utils` — note this excludes `utils/migrationRepository.ts`, `utils/encryption.ts`, and `utils/routeOptimizer.ts`, which hold real logic.

Configuration lives in `jest.config.ts`: `clearMocks: true`, `verbose: true`, `@/*` → `<rootDir>/$1` module mapping.

## Test Organization

**Location:** `__tests__/`, split into `unit/` and `integration/`
**Naming:** `<subject>.test.ts` matching the module under test
**Discovery:** `testMatch: ["**/__tests__/**/*.test.ts"]` for the default `npm test`; the `test:unit` / `test:integration` scripts narrow this with explicit `--testMatch` globs.

```
__tests__/
├── unit/
│   ├── campanhaService.test.ts
│   ├── campanhaPerguntasService.test.ts
│   ├── campanhaResultsService.test.ts
│   ├── promotorService.test.ts
│   └── rotaService.test.ts
└── integration/
    └── duckdb.test.ts
```

Coverage is service-layer only. There are **no tests** for controllers, routes, middleware (including `validation.ts` and `authMiddleware.ts`), entities, `utils/encryption.ts`, `utils/routeOptimizer.ts`, or `utils/migrationRepository.ts`.

Note: `tsconfig.json` excludes `__tests__` from compilation, so `tsc` will not type-check test files. Type errors in tests surface only when Jest runs them.

## Testing Patterns

### Unit tests

**Approach:** Mock the data source entirely, assert on service behaviour and on how the persistence layer was called.

`jest.mock('../../data-source')` at module scope resolves to the manual mock in `__mocks__/data-source.ts`. Individual tests then attach behaviour to the mocked members:

```typescript
jest.mock('../../data-source');

(AppDataSourceSync.transaction as jest.Mock) = jest.fn(async (callback) => {
  return await callback(mockTransactionalEntityManager);
});
```

Structure is `describe(ServiceName)` → `describe(methodName)` → `it('should ...')`, with `jest.clearAllMocks()` in `beforeEach`. Assertions check both the returned value and the interaction (`expect(AppDataSourceSync.transaction).toHaveBeenCalled()`).

Transaction-based service methods are exercised by hand-rolling a fake transactional entity manager with `create`/`save` jest.fn()s — see `__tests__/unit/rotaService.test.ts:42-55`.

### Integration tests

**Approach:** Exercise the real module against the real on-disk data file. `__tests__/integration/duckdb.test.ts` calls `DuckDBClient.getOficinaDataByIds()` for real and asserts on shape, ID filtering, lowercase normalization, and empty-input handling. `afterAll` calls `DuckDBClient.close()`.

No database, container, or network is involved — "integration" here means "reads the real JSON file". This is the only suite currently passing.

One test in this file is tautological: `'should provide default values when data is missing'` (`__tests__/integration/duckdb.test.ts:71-85`) constructs a local literal and asserts its own properties, exercising no production code. Its own comment admits it is documentation-only.

## Test Execution

```bash
npm test                    # all suites
npm run test:watch
npm run test:coverage
npm run test:unit           # __tests__/unit/**/*.test.ts
npm run test:integration    # __tests__/integration/**/*.test.ts
npm run test:unit:watch
npm run test:integration:watch
npm run test:unit:coverage
npm run test:integration:coverage
```

`npm run test:e2e`, referenced in `README.md`, does not exist.

## Current Failure — root cause and fix

Every failing test dies the same way:

```
TypeError: (0 , data_source_1.isLegacyEnabled) is not a function
  at MigrationAwareRepository.getLegacyRepo (utils/migrationRepository.ts:25:25)
  at new MigrationAwareRepository (utils/migrationRepository.ts:20:28)
```

The manual mock is stale. `__mocks__/data-source.ts` is, in full:

```typescript
export const AppDataSourceSync = {
  getRepository: jest.fn()
}
```

PR #39 added `LegacyDataSource` and `isLegacyEnabled` to `data-source.ts` and routed the services through `MigrationAwareRepository`, whose constructor calls `isLegacyEnabled()`. The mock was never extended, so any service method that builds a `MigrationAwareRepository` throws before reaching its own logic.

**Fix:** extend the manual mock to cover the module's current exports:

```typescript
export const AppDataSourceSync = {
  getRepository: jest.fn(),
  transaction: jest.fn(),
  query: jest.fn(),
};

export const LegacyDataSource = {
  getRepository: jest.fn(),
  isInitialized: false,
};

export const isLegacyEnabled = jest.fn(() => false);
```

With `isLegacyEnabled` returning `false`, `MigrationAwareRepository` degrades to new-DB-only behaviour, which matches what the existing assertions expect. Tests that need to exercise the merge path can override it per-test.

**Note:** this makes the failures a mock-maintenance problem, not evidence of broken production code — but it means the suite has been red since PR #39 merged (2026-07-13) and is currently providing no regression protection.

## Coverage Targets

None documented, none enforced. No CI workflow runs tests (`.github/` contains only skill definitions — there are no GitHub Actions workflows in this repository), so nothing blocks a merge on a red suite. This is how the suite stayed broken across a merge to `main`.
