# Code Conventions

**Analyzed:** 2026-08-04
**Method:** Sampled `service/promotorService.ts`, `service/oficinaService.ts`, `controllers/rotaController.ts`, `routes/RotaRoute.ts`, `entities/RotaPromotor.ts`, `utils/migrationRepository.ts`, `utils/encryption.ts`, `middlewares/validation.ts`, `middlewares/authMiddleware.ts`, `config/openapi.ts`.

These are the conventions **observed in the code**, not aspirational ones. Where the codebase is inconsistent, that is recorded as such.

## Naming Conventions

**Files:**

- `entities/` — PascalCase, singular, matching the class: `RotaPromotor.ts`, `CampanhaPromotor.ts`, `CadastroEmpresa.ts`
- `controllers/` — camelCase + `Controller` suffix: `rotaController.ts`, `campanhaPerguntasController.ts`
- `service/` — camelCase + `Service` suffix: `rotaService.ts`, `oficinaService.ts` (directory is singular `service`, not `services`)
- `routes/` — **PascalCase** + `Route` suffix: `RotaRoute.ts`, `CampanhaPerguntasRoute.ts` — inconsistent with controllers/services, which are camelCase
- `schemas/`, `utils/`, `middlewares/` — camelCase: `campanhaPerguntas.ts`, `migrationRepository.ts`, `authMiddleware.ts`

**Database columns and entity properties:** SCREAMING_SNAKE_CASE, mirroring the Postgres schema exactly: `ID_ROTA_PROMOTOR`, `CHECKIN_TIME`, `DELETED_AT`. Every `@Column` carries an explicit `name:` even when it matches the property. Per `docs/ENTIDADES_CAMPANHAS.md`, database spellings are preserved verbatim including typos — do not "fix" a column name.

Legacy `dw` schema tables are the exception: lowercase snake_case (`ce.id_oficina`, `ce.razao_social`, `ce.status_receita`), so raw SQL aliases them back up to SCREAMING_CASE with double quotes: `ce.id_oficina as "ID_OFICINA"`.

**Classes:** PascalCase, `export default`. Services and controllers are classes containing only `static` members.

**Methods:** camelCase, verb-first: `createRotas`, `findNearestOficinas`, `linkCampanhaPromotor`, `getRotaByIdWithRelations`. One outlier: `getRotaByIdROTA_PROMOTOR` (`controllers/rotaController.ts:151`).

**Enums:** PascalCase name, SCREAMING_SNAKE members, string values matching the DB. Values may differ from member names where the DB uses spaces or accents:

```typescript
export enum StatusRota {
  A_CAMINHO = "A CAMINHO",
  EM_ANDAMENTO = "EM ANDAMENTO",
}
```

**Constants:** SCREAMING_SNAKE at module scope: `EARTH_RADIUS_KM`, `ALGORITHM`, `ENCRYPTION_KEY`, `SECRET_KEY`.

**Zod schemas:** `<Verb><Entity>Schema` for input, `<Verb><Entity>ResponseSchema` for output, `<Entity>IdParamsSchema` for params — `CreateRotaSchema`, `UpdateRotaOptionsSchema`, `GetRotaByIdResponseSchema`, `RotaIdParamsSchema`.

## Code Organization

**Import ordering:** external packages first, then internal modules ordered roughly by distance (`../data-source`, `../entities/*`, `../utils/*`). No blank-line grouping, no alias imports in practice — the `@/*` path alias is configured in `tsconfig.json` and `jest.config.ts` but never used.

**File structure within a service:** private static repo factories at the top, then public static methods in rough CRUD order.

```typescript
export default class PromotorService {
  private static getPromotorRepo() {
    return new MigrationAwareRepository<Promotor>(Promotor, "ID_PROMOTOR");
  }
  static async createPromotor(...) { }
  static async updatePromotor(...) { }
}
```

**Entity structure:** enums first (exported), then `@Entity({ schema, name })`, PK, scalar columns, timestamp columns, relations, and finally a partial-assign constructor:

```typescript
constructor(init?: Partial<RotaPromotor>) {
  Object.assign(this, init);
}
```

**Route files:** one `createDocumentedRoute()` call per endpoint, preceded by a one-line `//` comment naming the operation, `export default router` at the end.

## Type Safety

`strict: true` with `strictPropertyInitialization: false` (required for TypeORM entity properties).

Entity fields are optional (`ID_ROTA_PROMOTOR?: number`) except for relation properties, which are asserted non-optional (`campanhaPromotor: CampanhaPromotor`) even though they are only populated when explicitly loaded via `relations`. Non-null assertions appear when consuming them: `promotorSalvo.ID_PROMOTOR!`.

`any` is used deliberately at framework seams — `req as any` to attach `user` and `validatedQuery`, `results.map((oficina: any) => ...)` for raw SQL rows, `openApiConfig: any` in `utils/routeDocumentation.ts`. Errors are typed `unknown` and narrowed:

```typescript
error instanceof Error ? error.message : "Erro desconhecido"
```

## Error Handling

**Controllers** — every handler is wrapped in `try/catch`; the catch logs in Portuguese and returns a 500 envelope:

```typescript
} catch (error) {
  console.error("Erro ao criar rota(s):", error);
  return res.status(500).json({
    message: "Erro interno ao criar rota(s).",
    error: error instanceof Error ? error.message : "Erro desconhecido",
  });
}
```

Note this leaks internal exception messages to the client. Two handlers deviate and return 400 with the raw message for business-rule failures: `optimizeRoute` and `reorderRotas` (`controllers/rotaController.ts:230,256`).

**Services** — generally let errors propagate. `findNearestOficinas` logs with full parameter context and re-throws. `MigrationAwareRepository` is the exception: legacy-database failures are swallowed to a `console.warn` prefixed with `⚠️` and degrade to new-DB-only results, by design.

**Validation** — centralized in `middlewares/validation.ts`. `ZodError` → 400 with a `details[]` array of `{ field, message, code }`; anything else → generic 500.

**Guard style** — early return, no `else` branches. Manual `parseInt` + `isNaN` checks in controllers even where a Zod params schema is already attached (`controllers/rotaController.ts:99-104`), so ID parsing is validated twice.

**Logging** — `console.log` / `console.warn` / `console.error` only. No logger, no levels, no correlation IDs, no structured output.

## Comments and Documentation

JSDoc on service and controller methods, describing purpose, `@param`s and `@returns`, plus the HTTP verb and path on controllers:

```typescript
/**
 * Updates a route's options (not the workshops)
 * PUT /rota/:id/options
 */
```

Non-obvious decisions get inline explanation — `// Note: Constant name without accent, value with accent to match database`, `// Validar query sem modificar o req original`.

**Language:** mixed and inconsistent, sometimes within one file. JSDoc and inline comments are mostly English in `controllers/`, `service/promotorService.ts`, and `utils/encryption.ts`, but Portuguese in `utils/migrationRepository.ts` and parts of `rotaService.ts`. All user-facing API messages and all `console.error` prefixes are Portuguese. Newer code (route optimization, migration wrapper) trends Portuguese.

## Formatting

Two-space indent, double quotes in most files (single quotes in `middlewares/validation.ts`, `utils/routeDocumentation.ts`, `config/openapi.ts`), semicolons throughout, trailing commas in multi-line literals. No Prettier, ESLint, or EditorConfig is configured — formatting is by convention only, and stray indentation drift exists (e.g. `controllers/rotaController.ts:183-187`, `service/promotorService.ts:234-240`).
