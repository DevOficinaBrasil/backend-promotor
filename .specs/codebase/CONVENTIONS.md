# Code Conventions

**Analyzed:** 2026-08-14 (supersedes 2026-08-04)
**Method:** Sampled `service/promotorService.ts`, `service/oficinaService.ts`, `service/outboxNotificacaoService.ts`, `service/envioGuards.ts`, `controllers/rotaController.ts`, `routes/RotaRoute.ts`, `routes/VisitaRoute.ts`, `entities/RotaPromotor.ts`, `entities/NotificacaoVisita.ts`, `channels/whatsappChannel.ts`, `schedule/outboxNotificacaoCron.ts`, `utils/migrationRepository.ts`, `utils/agendamento.ts`, `utils/encryption.ts`, `middlewares/validation.ts`, `middlewares/visitaAuthMiddleware.ts`, `config/openapi.ts`.

These are the conventions **observed in the code**, not aspirational ones. Where the codebase is inconsistent, that is recorded as such. Sections marked *(new)* describe conventions established by the visit-notification work and not present at the 2026-08-04 mapping.

## Naming Conventions

**Files:**

- `entities/` — PascalCase, singular, matching the class: `RotaPromotor.ts`, `CampanhaPromotor.ts`, `NotificacaoVisita.ts`
- `controllers/` — camelCase + `Controller` suffix: `rotaController.ts`, `visitaController.ts`
- `service/` — camelCase + `Service` suffix: `rotaService.ts`, `outboxNotificacaoService.ts` (directory is singular `service`, not `services`)
- `routes/` — **PascalCase** + `Route` suffix: `RotaRoute.ts`, `VisitaRoute.ts` — inconsistent with controllers/services, which are camelCase
- `schemas/`, `utils/`, `middlewares/`, `channels/`, `schedule/` — camelCase: `campanhaPerguntas.ts`, `migrationRepository.ts`, `whatsappChannel.ts`, `outboxNotificacaoCron.ts`. Exception inside `channels/`: `ChannelSender.ts` is PascalCase because the file is the interface.

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

**Pure logic is exported alongside the class *(new)*.** Newer services keep the static-class shape but hoist their decision logic into exported free functions above it — `computeBackoffMs`, `shouldMarkFailed`, `acaoDaFila`, `tamanhoLote` in `outboxNotificacaoService.ts`; `proximoHorarioEnvio` in `utils/agendamento.ts`; `avaliarGuardas`/`enderecoRecente` in `envioGuards.ts` (functions only, no class). This is what makes the outbox testable without a database or a clock. Follow it for any new time- or policy-dependent rule.

**Clocks are injected, never read *(new)*.** Functions whose behaviour depends on time take `agora: Date` as a parameter with a default of `new Date()` — `proximoHorarioEnvio(agora, …)`, `avaliarGuardas(…, agora)`, `trocarToken(rawToken, agora = new Date())`. Due-ness in SQL uses the database's `now()`, never the process clock, because server copies do not share one.

**File structure within a service:** private static repo factories at the top, then public static methods in rough CRUD order.

```typescript
export default class PromotorService {
  private static getPromotorRepo() {
    return AppDataSourceSync.getRepository(Promotor);
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

**Services** — generally let errors propagate. `findNearestOficinas` logs with full parameter context and re-throws.

**Validation** — centralized in `middlewares/validation.ts`. `ZodError` → 400 with a `details[]` array of `{ field, message, code }`; anything else → generic 500.

**Guard style** — early return, no `else` branches. Manual `parseInt` + `isNaN` checks in controllers even where a Zod params schema is already attached (`controllers/rotaController.ts:99-104`), so ID parsing is validated twice.

**Result unions over thrown errors, at boundaries *(new)*.** Code that crosses a boundary returns a discriminated union instead of throwing: `ChannelSendResult` (`{success:true,…}` | `{success:false, reason, providerCode}`), `DesfechoDespacho` (`ENVIADO` | `DISPENSADO` | `FALHOU_TERMINAL` | `FALHOU_TRANSITORIO`), `AcaoFila`, `ExchangeResult` / `ConfirmResult` / `EnderecoResult`. `tick()` and `despacharNotificacao()` document "never throws" as part of their contract — a background worker sharing a process with the API cannot take it down. Throwing is reserved for programmer error (`channelRegistry.getChannel` on an unregistered enum value).

**Refusal reasons are exported string constants *(new)*.** `MOTIVO_ENDERECO_RECENTE`, `MOTIVO_SEM_TELEFONE`, `MOTIVO_CAMPANHA_ENCERRADA`, `MOTIVO_PENDENTE`, … — English lowercase phrases, exported so tests assert the constant and never a literal.

**Degrade rather than drop *(new)*.** Missing non-essential data costs presentation, never the send: an unresolvable company name becomes an empty string in the message, a campaign without `END_TIME` falls back to a 168h token validity. Deliberate suppression is `DISPENSADO` and is explicitly **not** a failure; `FALHOU` means something went wrong.

**Logging** — `console.log` / `console.warn` / `console.error` only. No logger, no levels, no correlation IDs. Newer code logs a message plus a **structured object** (`console.log("[outboxNotificacao] desfecho da notificação", { ID_NOTIFICACAO_VISITA, ID_ROTA_PROMOTOR, tentativas, acao })`) and prefixes with a bracketed module tag. Secrets never enter a log line — `logarFalhaEnvio` prints URL, status, body and template, and deliberately excludes `WHATSAPP_API_KEY` and the `Authorization` header.

## Environment Variables *(new)*

**Truthiness is per-flag and inconsistent — check the file, do not assume.** `WHATSAPP_SEND_ENABLED` and `LEGACY_DB_ENABLED` compare against `"true"`; every `OUTBOX_VISITA_*` flag compares against `"1"`, following `backend-communities`. `OUTBOX_VISITA_ENABLED=true` therefore leaves the worker silently dead, which is why the cron logs the raw value it read at startup.

**New cross-service flags get a domain prefix.** `.env` files are copied between machines here, so a bare name shared with another service would let one copied file switch on both. Hence `OUTBOX_VISITA_*` rather than the unprefixed names the sibling repo uses.

**Every new variable is documented in `.env.example`** with a comment explaining the failure mode, not just the meaning — especially for flags that are safe locally and dangerous in production (`OUTBOX_VISITA_ENVIO_IMEDIATO`, `WHATSAPP_TEST_PHONE_OVERRIDE`).

## SQL Migrations *(new)*

Hand-written files in `scripts/*.sql`, applied manually — there is no migration runner. House rules, set on 2026-08-13:

- Idempotent: `IF NOT EXISTS` on every `ALTER`/`CREATE`.
- A header comment carrying a `ROLLBACK:` block.
- **No blank line, and no semicolon-bearing comment, inside a statement** — the SQL client used here truncates the script at those points and submits half a statement.
- `TEXT` over `VARCHAR`, `TIMESTAMPTZ` over `TIMESTAMP`, `COMMENT ON` for the table and every column, `CHECK` constraints for business rules (per the DBA review).
- A `CHECK` over an enum column must list **every** member of the TypeScript enum, including states written by suppression paths (`DISPENSADO`, `EXPIRADO`) — otherwise a legitimately blocked send raises a constraint violation.
- Foreign keys are omitted by house convention (implicit relationships); uniqueness constraints carry the business rule instead.

## Comments and Documentation

JSDoc on service and controller methods, describing purpose, `@param`s and `@returns`, plus the HTTP verb and path on controllers:

```typescript
/**
 * Updates a route's options (not the workshops)
 * PUT /rota/:id/options
 */
```

Non-obvious decisions get inline explanation — `// Note: Constant name without accent, value with accent to match database`, `// Validar query sem modificar o req original`.

**Comments carry the *why*, including the rejected alternative.** The visit-notification code is the strongest example of the house style: `claimBatch` explains why `ATTEMPTS` increments at claim time rather than after dispatch, why only the id is returned, and what `AVAILABLE_AT IS NOT NULL` prevents; `proximoHorarioEnvio` explains why the spread is `i/n` and not `i/(n-1)`. Comments cite spec requirement IDs (`AGND-02`, `AGND-12`, `NOTIF-26`, `spec AC8`) that resolve against `.specs/features/`. When a decision is architectural rather than local, the comment points at `.specs/project/STATE.md` instead of restating it.

**Language:** mixed and inconsistent, sometimes within one file. JSDoc and inline comments are mostly English in `controllers/`, `service/promotorService.ts`, `utils/encryption.ts`, and the visit-confirmation/channel code; Portuguese in `utils/migrationRepository.ts`, parts of `rotaService.ts`, and all of the outbox and scheduling code. All user-facing API messages and all `console.error` prefixes are Portuguese. Refusal-reason constants are English. Newest code trends Portuguese for prose and English for identifiers.

## Formatting

Two-space indent, double quotes in most files (single quotes in `middlewares/validation.ts`, `utils/routeDocumentation.ts`, `config/openapi.ts`), semicolons throughout, trailing commas in multi-line literals. No Prettier, ESLint, or EditorConfig is configured — formatting is by convention only, and stray indentation drift exists (e.g. `controllers/rotaController.ts:183-187`, `service/promotorService.ts:234-240`).
