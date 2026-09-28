# Disparo de Convite de Visita (Admin) Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

O banco do `.env` do backend-promotor é de dev (confirmado pelo usuário em 2026-09-28). Mesmo assim, **nenhuma task aplica migration nem roda suíte de integração que escreva em banco real**: os testes novos de rota usam supertest com o service mockado (padrão de `__tests__/integration/visitaConfirmar.test.ts`). A migration é entregue como script, e o usuário a aplica.

Repositórios e branches:

| Repo | Branch |
| --- | --- |
| `backend-promotor` | `feat/disparo-convite-visita-admin`, a partir de `main` |
| `ob-ads` | `feat/disparo-convite-visita-admin`, a partir de `main` |
| `jornalOficinaBrasil` | `feat/recusar-visita`, a partir de `main` |

---

**Design**: `.specs/features/disparo-convite-visita-admin/design.md`
**Status**: Approved (usuário: "pode implementar as tarefas", 2026-09-28)

---

## Test Coverage Matrix

> Guidelines encontradas:
> - `backend-promotor`: `jest.config.ts` (ts-jest, sem limite de cobertura), `.specs/LESSONS.md` (L-002 middleware com teste de integração próprio; L-004 afirmar a SQL em mocks do query runner). Amostras: `__tests__/unit/envioGuards.test.ts`, `despacharNotificacao.test.ts`, `rotaService.test.ts`, `__tests__/integration/visitaConfirmar.test.ts`.
> - `jornalOficinaBrasil`: `CLAUDE.md` (copy em pt-BR, payload em SCREAMING_SNAKE, chamadas só via `service/`), `vitest.config.mts`. Amostras: `app/(visita)/visita/confirmacao/__tests__/*`.
> - `ob-ads`: `.specs/codebase/CONVENTIONS.md`, `jest.config.js` (`next/jest`). Componentes React do ob-ads não têm testes na base; a lógica pura vai em `lib/` com Jest.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| backend-promotor: utils puros (`utils/*.ts`) | unit | Todos os branches; 1:1 com os ACs; todo edge case listado | `__tests__/unit/<util>.test.ts` | `npm run test:unit` |
| backend-promotor: services (`service/*.ts`) | unit | Todos os branches; 1:1 com os ACs; SQL crua com joins e aliases afirmados (L-004); `data-source` mockado | `__tests__/unit/<service>.test.ts` | `npm run test:unit` |
| backend-promotor: middlewares | unit + integration | Unit: todos os ramos (401, 401, 403, 500, next). Integration: cada rota que monta o middleware tem os casos 401, 403 e 2xx (L-002) | `__tests__/unit/<mw>.test.ts`, `__tests__/integration/<rota>.test.ts` | `npm run test:unit`; `npx jest __tests__/integration/<arquivo>` |
| backend-promotor: rotas e controllers | integration (supertest, service mockado) | Todas as rotas do escopo: happy path, cada erro mapeado (400, 401, 403, 404, 409, 410, 422, 502) | `__tests__/integration/<rota>.test.ts` | `npx jest __tests__/integration/<arquivo>` |
| backend-promotor: entity, migration e docs | none | Só gate de build | - | `npx tsc --noEmit` |
| ob-ads: lógica pura (`lib/*.ts`) | unit | Todos os branches | `lib/__tests__/<arquivo>.test.ts` | `npx jest lib/__tests__/<arquivo>` |
| ob-ads: páginas, componentes, clientes HTTP e config | none | Gate de tipos; UAT no navegador ao fim | - | `npx tsc --noEmit` |
| jornal: service, hook e componente da página de visita | unit (vitest + testing-library) | Todo estado e ação novos; retry de 401/403; 409; copy da spec | `service/__tests__/`, `app/(visita)/visita/confirmacao/__tests__/` | `npx vitest run "app/(visita)" service/__tests__/visitaService.test.ts` |

## Gate Check Commands

> Gerado a partir dos `package.json`. O backend-promotor não tem lint nem build; o gate de tipos é `tsc`. O `next build` do ob-ads falha por causa anterior (SVGs apagados, ver memória), então o gate de lá é `tsc`. Suítes que já estavam vermelhas antes desta feature (`segmentacaoCampanhaPromotor.test.ts`, teardown de FK em integração com banco real) não entram no gate e são listadas no relatório.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Tasks com testes unit no backend | `npm run test:unit` (backend-promotor) |
| Full | Tasks com testes de integração no backend | `npm run test:unit && npx jest __tests__/integration/visitaRecusar.test.ts __tests__/integration/visitaConfirmar.test.ts __tests__/integration/visitaExchange.test.ts __tests__/integration/adminDisparo.test.ts` |
| Build | Tasks só de entity, migration ou config, e fim de fase | backend: `npx tsc --noEmit`; ob-ads: `npx tsc --noEmit` (+ `npx jest lib/__tests__` na Phase 5); jornal: `npx vitest run "app/(visita)" service/__tests__/visitaService.test.ts` |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Fundação do backend

```
T1 → T2
T3
T4
T5
T6
```

### Phase 2: Fila e guardas

```
T7 → T8
T8 → T9
T9 → T10
T8 → T11
```

### Phase 3: Recusa e confirmação

```
T12 → T13
T13 → T14
```

### Phase 4: Endpoints de admin

```
T15 → T17
T16
T17 → T18
T18 → T19
T19 → T20
T20 → T21
```

### Phase 5: ob-ads, base e lista

```
T22 → T23
T23 → T25
T24
T25 → T26
T27
```

### Phase 6: ob-ads, fluxo da campanha

```
T28 → T29
T29 → T30
T30 → T31
```

### Phase 7: jornal, recusa do reparador

```
T32 → T33
T33 → T34
```

### Phase 8: Registro

```
T35
```

---

## Task Breakdown

### Phase 1: Fundação do backend (tasks)

### T1: Migration de convite (status, colunas, CHKs, backfill)

**What**: Script idempotente com `ROLLBACK:` que acrescenta `AGUARDANDO`/`RECUSADO`, as colunas `ORIGEM_ACEITE`, `ID_NOTIFICACAO_REFERENCIA`, `RECUSADO_EM/POR/IP` e `TELEFONE_ORIGEM`, os CHKs e o índice parcial, e faz os 3 backfills do design.
**Where**: `backend-promotor/scripts/migration-convite-visita-admin.sql`
**Depends on**: None
**Reuses**: `scripts/migration-outbox-notificacao-visita.sql` (formato, cabeçalho, `IF NOT EXISTS`)
**Requirement**: CONV-35, CONV-44, CONV-45, CONV-46

**Tools**:
- MCP: NONE
- Skill: `anthropic-skills:dba-rules`

**Done when**:
- [x] Todo `ALTER`/`CREATE` é reexecutável sem erro
- [x] Backfill 1: `CONFIRMADO` recebe `ORIGEM_ACEITE='REPARADOR'`, antes do CHK que o exige
- [x] Backfills 2 e 3 só tocam rotas de oficina com `OFICINA_IMPORTADA` ativa no `EMPRESA_SLUG` da campanha, e deixam `CONFIRMADO`/`RECUSADO` como estão
- [x] Sem `VARCHAR`, sem linha em branco nem `;` dentro de statement
- [x] Não aplicado pelo agente

**Tests**: none
**Gate**: build
**Commit**: `feat(db): migration de convite de visita com aceite, recusa e importadas`

---

### T2: Entity `NotificacaoVisita` com os status e colunas novos

**What**: Acrescenta `AGUARDANDO` e `RECUSADO` ao enum e as colunas novas, com os tipos `OrigemAceite` e `TelefoneOrigem`.
**Where**: `backend-promotor/entities/NotificacaoVisita.ts`
**Depends on**: T1
**Reuses**: Padrão de colunas da própria entity
**Requirement**: CONV-35, CONV-44

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Colunas e enums batem com a migration T1
- [x] `npx tsc --noEmit` sem erros novos

**Tests**: none
**Gate**: build
**Commit**: `feat(notificacao): status AGUARDANDO/RECUSADO e colunas de origem`

---

### T3: `ehCelular` e `resolverTelefone`

**What**: Funções puras de fallback de telefone conforme o design.
**Where**: `backend-promotor/utils/telefone.ts`
**Depends on**: None
**Reuses**: `normalizarTelefone`
**Requirement**: CONV-43, CONV-44

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `CELULAR` preenchido é usado em qualquer formato válido, como hoje; `CELULAR` inválido não cai para o fallback
- [x] Sem `CELULAR`: ordem `USUARIO.TELEFONE` → `OFICINA.TELEFONE` → `ce.telefone`, só formato de celular; fixo é descartado
- [x] `origem` e `idUsuario` corretos em cada fonte; sem usuário → `null`
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick
**Commit**: `feat(telefone): fallback de telefone com formato de celular`

---

### T4: `horarioNoDia`, `planejarDisparo` e `tetoMinimo`

**What**: Planejamento do disparo com teto diário a partir da janela do dia seguinte.
**Where**: `backend-promotor/utils/agendamento.ts`
**Depends on**: None
**Reuses**: `proximoHorarioEnvio`, janela `NOTIFICACAO_HORA_ENVIO*`
**Requirement**: CONV-21

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `proximoHorarioEnvio(a,p,t)` é igual a `horarioNoDia(a,1,p,t)`; os testes antigos continuam verdes
- [x] 25 itens com teto 10 dão 10/10/5 em três dias consecutivos a partir de amanhã, espaçados na janela
- [x] Nenhum dia passa do teto; `tetoMinimo` devolve o menor teto que cabe até o fim, ou `null`
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick
**Commit**: `feat(agendamento): planejar disparo com teto diário`

---

### T5: Regra "BACKLOG só se CONFIRMADO" e `estadoConvite`

**What**: `rotaListavelParaPromotor` passa a mostrar a rota em `BACKLOG` só com `CONFIRMADO`; nova `estadoConvite` para o painel do admin.
**Where**: `backend-promotor/utils/statusNotificacaoVisita.ts`
**Depends on**: None
**Reuses**: `statusEfetivo`
**Requirement**: CONV-31, CONV-32, CONV-33, CONV-41

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Rota em BACKLOG: sem notificação, PENDENTE, ENVIADO, EXPIRADO, FALHOU, DISPENSADO, RECUSADO, AGUARDANDO e valor desconhecido ficam ocultos; CONFIRMADO de qualquer origem aparece
- [x] Rota fora de BACKLOG sempre aparece
- [x] `estadoConvite` cobre os 12 estados do design
- [x] Os testes de `filtro-rotas-por-confirmacao` que afirmavam DISPENSADO/FALHOU visíveis são atualizados para a regra nova, com o motivo (AD-003) registrado no teste
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick
**Commit**: `feat(visibilidade): promotor só vê rota aceita`

---

### T6: `adminAuthMiddleware`

**What**: Middleware que exige o JWT do backend-ob-ads com `user.IS_ADMIN`, verificado com `OBADS_JWT_SECRET` (documentado em `exemple.env`/`.env.example`).
**Where**: `backend-promotor/middlewares/adminAuthMiddleware.ts`
**Depends on**: None
**Reuses**: Formato de erro de `middlewares/authMiddleware.ts`
**Requirement**: CONV-03, CONV-04

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Sem header → 401; token inválido ou expirado → 401; `IS_ADMIN` falso ou ausente → 403; `true`/`1` → `next()` com `req.admin`; segredo ausente → 500
- [x] `SKIP_AUTH` não tem efeito
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick
**Commit**: `feat(auth): middleware de admin com JWT do ob-ads`

---

### Phase 2: Fila e guardas (tasks)

### T7: Guardas `convitePendenteDaOficina` e `confirmacaoRecente`

**What**: Troca `avaliarGuardas` pelas duas guardas novas: convite em aberto por oficina e confirmação recente só de `REPARADOR`.
**Where**: `backend-promotor/service/envioGuards.ts`
**Depends on**: T2
**Reuses**: `UPDATE` preguiçoso de expiração, `MESES_CONFIRMACAO_RECENTE`
**Requirement**: CONV-25, CONV-26, CONV-30

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `ENVIADO` não expirado em outra rota da mesma oficina → devolve o id de referência; a própria notificação é ignorada
- [x] `CONFIRMADO` com origem `REPARADOR` há menos de 3 meses → devolve o id; outras origens não contam
- [x] `enderecoRecente` sai do fluxo de guarda (o fluxo vive em `despacharNotificacao`; saiu em T8, junto com `avaliarGuardas`)
- [x] SQL e filtros afirmados (L-004)
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick
**Commit**: `feat(guardas): convite aberto por oficina e confirmação recente do reparador`

---

### T8: `despacharNotificacao` com a ordem nova de guardas e o fallback de telefone

**What**: Aplica a ordem do design (sem endereço recente; AGUARDANDO; resolverTelefone; CONFIRMACAO_RECENTE; TELEFONE_ORIGEM).
**Where**: `backend-promotor/service/notificacaoVisitaService.ts`
**Depends on**: T7
**Reuses**: `encerrarDispensado`, fluxo de envio atual
**Requirement**: CONV-25, CONV-26, CONV-30, CONV-43, CONV-44

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Oficina com `DATA_ALTERACAO` recente é enviada normalmente
- [x] Convite aberto da oficina → `AGUARDANDO` com referência e `AVAILABLE_AT` nulo, sem chamar o canal
- [x] Confirmação recente → `CONFIRMADO`/`CONFIRMACAO_RECENTE` com referência, sem chamar o canal
- [x] Sem celular com telefone de oficina em formato de celular → envia e grava `TELEFONE_ORIGEM='OFICINA_TELEFONE'`
- [x] Nenhuma fonte válida → `FALHOU` com o motivo de hoje
- [x] Gate quick passa; os testes que já existiam foram atualizados, nenhum apagado sem substituto

**Tests**: unit
**Gate**: quick
**Commit**: `feat(notificacao): guardas de aceite e telefone alternativo no despacho`

---

### T9: `registrarRotasCriadas`

**What**: Ponto único pós-criação de rota: oficina importada → `CONFIRMADO`/`IMPORTADA`; demais → agenda se `agendar`.
**Where**: `backend-promotor/service/notificacaoVisitaService.ts`
**Depends on**: T8
**Reuses**: `agendarVisitasEmLote`
**Requirement**: CONV-15, CONV-45

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Importada para o slug da campanha → um insert `CONFIRMADO` sem token, sem agendar
- [x] Não importada com `agendar:true` → `agendarVisitasEmLote` com as rotas; com `agendar:false` → nada
- [x] SQL da detecção de importada afirmada (join `OFICINA_IMPORTADA` por `ID_OFICINA` + `EMPRESA_SLUG`, `DELETED_AT IS NULL`)
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick
**Commit**: `feat(notificacao): rota de oficina importada nasce aceita`

---

### T10: `createRotas` com `agendar` e `escolherPromotorMaisProximo`

**What**: `createRotas` passa por `registrarRotasCriadas`; a regra do mais próximo é extraída como função pura, sem mudar o comportamento.
**Where**: `backend-promotor/service/rotaService.ts`
**Depends on**: T9
**Reuses**: `rotaService.ts:1036-1042`, `:1163-1169`
**Requirement**: CONV-15, CONV-18

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Os chamadores que já existiam agendam como antes (`agendar` padrão `true`)
- [x] `agendar:false` não enfileira
- [x] `escolherPromotorMaisProximo`: dentro do raio, mais próximo, desempate por `ID_CAMPANHA_PROMOTOR`; fora do raio → `null`
- [x] Os testes antigos de `rotaService` continuam verdes
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(rota): createRotas com opção de agendar e regra do mais próximo extraída`

---

### T11: `liberarAguardando` no tick do outbox

**What**: Reconciliação idempotente das `AGUARDANDO` antes do claim.
**Where**: `backend-promotor/service/outboxNotificacaoService.ts`
**Depends on**: T8
**Reuses**: `horarioNoDia` (T4), estrutura do `tick`
**Requirement**: CONV-27, CONV-28, CONV-29

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Referência CONFIRMADO → CONFIRMADO/CONVITE_VINCULADO; RECUSADO → RECUSADO; EXPIRADO, FALHOU, DISPENSADO ou ENVIADO vencido → PENDENTE na próxima janela, com a referência limpa
- [x] Roda antes do claim em cada tick; SQL afirmada
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick
**Commit**: `feat(outbox): reconciliar notificações aguardando convite`

---

### Phase 3: Recusa e confirmação (tasks)

### T12: `transicionar` genérico, `recusar` e `ALREADY_DECLINED`

**What**: Confirmação e recusa atômicas com propagação para as AGUARDANDO; o estado recusado aparece em `trocarToken` e em `confirmar`.
**Where**: `backend-promotor/service/visitaConfirmacaoService.ts`
**Depends on**: T2
**Reuses**: `transicionar`, `statusEfetivo`
**Requirement**: CONV-27, CONV-28, CONV-35, CONV-36, CONV-37, CONV-38

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Confirmar grava `ORIGEM_ACEITE='REPARADOR'` e propaga CONVITE_VINCULADO na mesma transação
- [x] Recusar grava `RECUSADO_EM/POR/IP` e propaga RECUSADO
- [x] Estado terminal → `ALREADY_CONFIRMED`/`ALREADY_DECLINED`; expirado → `EXPIRED`
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick
**Commit**: `feat(visita): recusa atômica e propagação para convites aguardando`

---

### T13: Rota `POST /visita/recusar`

**What**: Endpoint de recusa com `visitaAuthMiddleware` + `limitadorAcao` e o controller correspondente.
**Where**: `backend-promotor/routes/VisitaRoute.ts`
**Depends on**: T12
**Reuses**: Rota `/confirmar`, `__tests__/integration/visitaConfirmar.test.ts`
**Requirement**: CONV-37, CONV-40

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] 200 DECLINED, 409 (confirmado ou recusado), 410, 404 e 401 sem JWT, no formato de `/confirmar`
- [x] Rate limit ativo (21ª chamada no minuto → 429)
- [x] `GET /visita/:token` devolve `ALREADY_DECLINED`
- [x] Gate full passa

**Tests**: integration
**Gate**: full
**Commit**: `feat(visita): endpoint de recusa de visita`

---

### Phase 4: Endpoints de admin

```
T15 → T17
T16
T17 → T18
T18 → T19
T19 → T20
T20 → T21
```

### Phase 5: ob-ads, base e lista

```
T22 → T23
T23 → T25
T24
T25 → T26
T27
```

### Phase 6: ob-ads, fluxo da campanha

```
T28 → T29
T29 → T30
T30 → T31
```

### Phase 7: jornal, recusa do reparador

```
T32 → T33
T33 → T34
```

### Phase 8: Registro

```
T35
```

---

## Task Breakdown

### Phase 1: Fundação do backend (tasks)

### T1: Migration de convite (status, colunas, CHKs, backfill)

**What**: Script idempotente com `ROLLBACK:` que acrescenta `AGUARDANDO`/`RECUSADO`, as colunas `ORIGEM_ACEITE`, `ID_NOTIFICACAO_REFERENCIA`, `RECUSADO_EM/POR/IP` e `TELEFONE_ORIGEM`, os CHKs e o índice parcial, e faz os 3 backfills do design.
**Where**: `backend-promotor/scripts/migration-convite-visita-admin.sql`
**Depends on**: None
**Reuses**: `scripts/migration-outbox-notificacao-visita.sql` (formato, cabeçalho, `IF NOT EXISTS`)
**Requirement**: CONV-35, CONV-44, CONV-45, CONV-46

**Tools**:
- MCP: NONE
- Skill: `anthropic-skills:dba-rules`

**Done when**:
- [x] Todo `ALTER`/`CREATE` é reexecutável sem erro
- [x] Backfill 1: `CONFIRMADO` recebe `ORIGEM_ACEITE='REPARADOR'`, antes do CHK que o exige
- [x] Backfills 2 e 3 só tocam rotas de oficina com `OFICINA_IMPORTADA` ativa no `EMPRESA_SLUG` da campanha, e deixam `CONFIRMADO`/`RECUSADO` como estão
- [x] Sem `VARCHAR`, sem linha em branco nem `;` dentro de statement
- [x] Não aplicado pelo agente

**Tests**: none
**Gate**: build
**Commit**: `feat(db): migration de convite de visita com aceite, recusa e importadas`

---

### T2: Entity `NotificacaoVisita` com os status e colunas novos

**What**: Acrescenta `AGUARDANDO` e `RECUSADO` ao enum e as colunas novas, com os tipos `OrigemAceite` e `TelefoneOrigem`.
**Where**: `backend-promotor/entities/NotificacaoVisita.ts`
**Depends on**: T1
**Reuses**: Padrão de colunas da própria entity
**Requirement**: CONV-35, CONV-44

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Colunas e enums batem com a migration T1
- [x] `npx tsc --noEmit` sem erros novos

**Tests**: none
**Gate**: build
**Commit**: `feat(notificacao): status AGUARDANDO/RECUSADO e colunas de origem`

---

### T3: `ehCelular` e `resolverTelefone`

**What**: Funções puras de fallback de telefone conforme o design.
**Where**: `backend-promotor/utils/telefone.ts`
**Depends on**: None
**Reuses**: `normalizarTelefone`
**Requirement**: CONV-43, CONV-44

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `CELULAR` preenchido é usado em qualquer formato válido, como hoje; `CELULAR` inválido não cai para o fallback
- [x] Sem `CELULAR`: ordem `USUARIO.TELEFONE` → `OFICINA.TELEFONE` → `ce.telefone`, só formato de celular; fixo é descartado
- [x] `origem` e `idUsuario` corretos em cada fonte; sem usuário → `null`
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick
**Commit**: `feat(telefone): fallback de telefone com formato de celular`

---

### T4: `horarioNoDia`, `planejarDisparo` e `tetoMinimo`

**What**: Planejamento do disparo com teto diário a partir da janela do dia seguinte.
**Where**: `backend-promotor/utils/agendamento.ts`
**Depends on**: None
**Reuses**: `proximoHorarioEnvio`, janela `NOTIFICACAO_HORA_ENVIO*`
**Requirement**: CONV-21

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `proximoHorarioEnvio(a,p,t)` é igual a `horarioNoDia(a,1,p,t)`; os testes antigos continuam verdes
- [x] 25 itens com teto 10 dão 10/10/5 em três dias consecutivos a partir de amanhã, espaçados na janela
- [x] Nenhum dia passa do teto; `tetoMinimo` devolve o menor teto que cabe até o fim, ou `null`
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick
**Commit**: `feat(agendamento): planejar disparo com teto diário`

---

### T5: Regra "BACKLOG só se CONFIRMADO" e `estadoConvite`

**What**: `rotaListavelParaPromotor` passa a mostrar a rota em `BACKLOG` só com `CONFIRMADO`; nova `estadoConvite` para o painel do admin.
**Where**: `backend-promotor/utils/statusNotificacaoVisita.ts`
**Depends on**: None
**Reuses**: `statusEfetivo`
**Requirement**: CONV-31, CONV-32, CONV-33, CONV-41

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Rota em BACKLOG: sem notificação, PENDENTE, ENVIADO, EXPIRADO, FALHOU, DISPENSADO, RECUSADO, AGUARDANDO e valor desconhecido ficam ocultos; CONFIRMADO de qualquer origem aparece
- [x] Rota fora de BACKLOG sempre aparece
- [x] `estadoConvite` cobre os 12 estados do design
- [x] Os testes de `filtro-rotas-por-confirmacao` que afirmavam DISPENSADO/FALHOU visíveis são atualizados para a regra nova, com o motivo (AD-003) registrado no teste
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick
**Commit**: `feat(visibilidade): promotor só vê rota aceita`

---

### T6: `adminAuthMiddleware`

**What**: Middleware que exige o JWT do backend-ob-ads com `user.IS_ADMIN`, verificado com `OBADS_JWT_SECRET` (documentado em `exemple.env`/`.env.example`).
**Where**: `backend-promotor/middlewares/adminAuthMiddleware.ts`
**Depends on**: None
**Reuses**: Formato de erro de `middlewares/authMiddleware.ts`
**Requirement**: CONV-03, CONV-04

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Sem header → 401; token inválido ou expirado → 401; `IS_ADMIN` falso ou ausente → 403; `true`/`1` → `next()` com `req.admin`; segredo ausente → 500
- [x] `SKIP_AUTH` não tem efeito
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick
**Commit**: `feat(auth): middleware de admin com JWT do ob-ads`

---

### Phase 2: Fila e guardas (tasks)

### T7: Guardas `convitePendenteDaOficina` e `confirmacaoRecente`

**What**: Troca `avaliarGuardas` pelas duas guardas novas: convite em aberto por oficina e confirmação recente só de `REPARADOR`.
**Where**: `backend-promotor/service/envioGuards.ts`
**Depends on**: T2
**Reuses**: `UPDATE` preguiçoso de expiração, `MESES_CONFIRMACAO_RECENTE`
**Requirement**: CONV-25, CONV-26, CONV-30

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `ENVIADO` não expirado em outra rota da mesma oficina → devolve o id de referência; a própria notificação é ignorada
- [x] `CONFIRMADO` com origem `REPARADOR` há menos de 3 meses → devolve o id; outras origens não contam
- [x] `enderecoRecente` sai do fluxo de guarda (o fluxo vive em `despacharNotificacao`; saiu em T8, junto com `avaliarGuardas`)
- [x] SQL e filtros afirmados (L-004)
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick
**Commit**: `feat(guardas): convite aberto por oficina e confirmação recente do reparador`

---

### T8: `despacharNotificacao` com a ordem nova de guardas e o fallback de telefone

**What**: Aplica a ordem do design (sem endereço recente; AGUARDANDO; resolverTelefone; CONFIRMACAO_RECENTE; TELEFONE_ORIGEM).
**Where**: `backend-promotor/service/notificacaoVisitaService.ts`
**Depends on**: T7
**Reuses**: `encerrarDispensado`, fluxo de envio atual
**Requirement**: CONV-25, CONV-26, CONV-30, CONV-43, CONV-44

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Oficina com `DATA_ALTERACAO` recente é enviada normalmente
- [x] Convite aberto da oficina → `AGUARDANDO` com referência e `AVAILABLE_AT` nulo, sem chamar o canal
- [x] Confirmação recente → `CONFIRMADO`/`CONFIRMACAO_RECENTE` com referência, sem chamar o canal
- [x] Sem celular com telefone de oficina em formato de celular → envia e grava `TELEFONE_ORIGEM='OFICINA_TELEFONE'`
- [x] Nenhuma fonte válida → `FALHOU` com o motivo de hoje
- [x] Gate quick passa; os testes que já existiam foram atualizados, nenhum apagado sem substituto

**Tests**: unit
**Gate**: quick
**Commit**: `feat(notificacao): guardas de aceite e telefone alternativo no despacho`

---

### T9: `registrarRotasCriadas`

**What**: Ponto único pós-criação de rota: oficina importada → `CONFIRMADO`/`IMPORTADA`; demais → agenda se `agendar`.
**Where**: `backend-promotor/service/notificacaoVisitaService.ts`
**Depends on**: T8
**Reuses**: `agendarVisitasEmLote`
**Requirement**: CONV-15, CONV-45

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Importada para o slug da campanha → um insert `CONFIRMADO` sem token, sem agendar
- [x] Não importada com `agendar:true` → `agendarVisitasEmLote` com as rotas; com `agendar:false` → nada
- [x] SQL da detecção de importada afirmada (join `OFICINA_IMPORTADA` por `ID_OFICINA` + `EMPRESA_SLUG`, `DELETED_AT IS NULL`)
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick
**Commit**: `feat(notificacao): rota de oficina importada nasce aceita`

---

### T10: `createRotas` com `agendar` e `escolherPromotorMaisProximo`

**What**: `createRotas` passa por `registrarRotasCriadas`; a regra do mais próximo é extraída como função pura, sem mudar o comportamento.
**Where**: `backend-promotor/service/rotaService.ts`
**Depends on**: T9
**Reuses**: `rotaService.ts:1036-1042`, `:1163-1169`
**Requirement**: CONV-15, CONV-18

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Os chamadores que já existiam agendam como antes (`agendar` padrão `true`)
- [x] `agendar:false` não enfileira
- [x] `escolherPromotorMaisProximo`: dentro do raio, mais próximo, desempate por `ID_CAMPANHA_PROMOTOR`; fora do raio → `null`
- [x] Os testes antigos de `rotaService` continuam verdes
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(rota): createRotas com opção de agendar e regra do mais próximo extraída`

---

### T11: `liberarAguardando` no tick do outbox

**What**: Reconciliação idempotente das `AGUARDANDO` antes do claim.
**Where**: `backend-promotor/service/outboxNotificacaoService.ts`
**Depends on**: T8
**Reuses**: `horarioNoDia` (T4), estrutura do `tick`
**Requirement**: CONV-27, CONV-28, CONV-29

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Referência CONFIRMADO → CONFIRMADO/CONVITE_VINCULADO; RECUSADO → RECUSADO; EXPIRADO, FALHOU, DISPENSADO ou ENVIADO vencido → PENDENTE na próxima janela, com a referência limpa
- [x] Roda antes do claim em cada tick; SQL afirmada
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick
**Commit**: `feat(outbox): reconciliar notificações aguardando convite`

---

### Phase 3: Recusa e confirmação (tasks)

### T12: `transicionar` genérico, `recusar` e `ALREADY_DECLINED`

**What**: Confirmação e recusa atômicas com propagação para as AGUARDANDO; o estado recusado aparece em `trocarToken` e em `confirmar`.
**Where**: `backend-promotor/service/visitaConfirmacaoService.ts`
**Depends on**: T2
**Reuses**: `transicionar`, `statusEfetivo`
**Requirement**: CONV-27, CONV-28, CONV-35, CONV-36, CONV-37, CONV-38

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Confirmar grava `ORIGEM_ACEITE='REPARADOR'` e propaga CONVITE_VINCULADO na mesma transação
- [x] Recusar grava `RECUSADO_EM/POR/IP` e propaga RECUSADO
- [x] Estado terminal → `ALREADY_CONFIRMED`/`ALREADY_DECLINED`; expirado → `EXPIRED`
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick
**Commit**: `feat(visita): recusa atômica e propagação para convites aguardando`

---

### T13: Rota `POST /visita/recusar`

**What**: Endpoint de recusa com `visitaAuthMiddleware` + `limitadorAcao` e o controller correspondente.
**Where**: `backend-promotor/routes/VisitaRoute.ts`
**Depends on**: T12
**Reuses**: Rota `/confirmar`, `__tests__/integration/visitaConfirmar.test.ts`
**Requirement**: CONV-37, CONV-40

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] 200 DECLINED, 409 (confirmado ou recusado), 410, 404 e 401 sem JWT, no formato de `/confirmar`
- [x] Rate limit ativo (21ª chamada no minuto → 429)
- [x] `GET /visita/:token` devolve `ALREADY_DECLINED`
- [x] Gate full passa

**Tests**: integration
**Gate**: full
**Commit**: `feat(visita): endpoint de recusa de visita`

---

### T14: Contrato da página com a recusa

**What**: Atualiza o contrato da página pública com `POST /visita/recusar` e o estado `ALREADY_DECLINED`.
**Where**: `backend-promotor/.specs/features/notificacao-visita-confirmacao/frontend-contract.md`
**Depends on**: T13
**Reuses**: Estrutura do próprio contrato
**Requirement**: CONV-39

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Endpoint, respostas e estado novo documentados com exemplos
- [ ] Gate build passa

**Tests**: none
**Gate**: build
**Commit**: `docs(visita): contrato da página com recusa`

---

### Phase 4: Endpoints de admin (tasks)

### T15: `getOficinasBaseSegmentadas`

**What**: Consulta da base Oficina Brasil por usuários do CRM + região, com as flags do design e os candidatos de telefone.
**Where**: `backend-promotor/service/oficinaService.ts`
**Depends on**: T3
**Reuses**: `getCommunityOficinasSegmentadas`, `ligacaoCadastroEmpresa`, `COLUNAS_CADASTRO_EMPRESA`
**Requirement**: CONV-08, CONV-09, CONV-43, CONV-47

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] UF + cidade com normalização de acento e CEP + raio por haversine; lotes de 1000 ids
- [x] Flags `membroComunidade`, `importada`, `rotaAtual`, `recusouNestaCampanha` e `temWhatsapp` (via `resolverTelefone`)
- [x] SQL com joins e aliases afirmados (L-004); dedup por `ID_OFICINA`
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick
**Commit**: `feat(oficina): base Oficina Brasil segmentada por região`

---

### T16: `listarCampanhasAtivas` e `listarPromotores`

**What**: Início de `AdminDisparoService`: campanhas ativas com o nome do cliente e os promotores da campanha e do cliente.
**Where**: `backend-promotor/service/adminDisparoService.ts`
**Depends on**: None
**Reuses**: Padrão SQL de `campanhaService`, `COMMUNITIES.Nome`
**Requirement**: CONV-01, CONV-02, CONV-13

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Filtro ativo: `PUBLICADA`, sem `DELETED_AT`, dentro do período, `END_TIME` nulo = sem fim; `clienteNome` nulo sem slug ou sem comunidade
- [x] Promotores vinculados com raio e coordenadas; do cliente sem vínculo ativo
- [x] SQL afirmada; sem N+1
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick
**Commit**: `feat(admin): listar campanhas ativas e promotores`

---

### T17: `segmentarOficinas` e campos/valores do tenant 15

**What**: Validação de região e critério, CRM no tenant 15, geocodificação do CEP e chamada de T15.
**Where**: `backend-promotor/service/adminDisparoService.ts`
**Depends on**: T15
**Reuses**: `previewContactsAll`, filter-options e valores de campo de `segmentacaoService`, `GeolocationService`
**Requirement**: CONV-06, CONV-07, CONV-08, CONV-10, CONV-11, CONV-12

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Sem região → erro 400 com a mensagem da spec; sem critério → 400; CEP sem coordenada → 400
- [x] CRM chamado com tenant 15, nunca com o da campanha; falha → erro 502
- [x] `truncado` repassado
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick
**Commit**: `feat(admin): segmentar base Oficina Brasil no tenant 15`

---

### T18: `criarRotas` do admin

**What**: Atribuição manual e distribuição automática com as validações por oficina.
**Where**: `backend-promotor/service/adminDisparoService.ts`
**Depends on**: T17
**Reuses**: `RotaService.createRotas(..., { agendar: false })`, `escolherPromotorMaisProximo`
**Requirement**: CONV-14, CONV-15, CONV-16, CONV-17, CONV-18, CONV-47

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Oficina de fora da comunidade é aceita; já em rota → conflito 409 com o promotor atual; recusou → 409; sem WhatsApp e não importada → 422; importada sem WhatsApp → aceita
- [ ] Vínculo de outra campanha → 400
- [ ] Distribuição devolve `foraDoAlcance`
- [ ] Nada enfileirado
- [ ] Gate quick passa

**Tests**: unit
**Gate**: quick
**Commit**: `feat(admin): montar rotas com oficinas de fora da comunidade`

---

### T19: `previaDisparo` e `disparar`

**What**: Prévia sem escrita e disparo com teto, fim de campanha e idempotência.
**Where**: `backend-promotor/service/adminDisparoService.ts`
**Depends on**: T18
**Reuses**: `planejarDisparo`, `tetoMinimo`, insert com `orIgnore`
**Requirement**: CONV-19, CONV-20, CONV-21, CONV-22, CONV-23, CONV-24

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Teto fora de 1..1000 → 400; passou do fim → 422 com `tetoMinimo`, sem escrever
- [ ] Já disparadas são ignoradas e contadas; `enfileiradas` = linhas inseridas de fato
- [ ] `AVAILABLE_AT` segue o plano; a prévia não escreve nada
- [ ] Gate quick passa

**Tests**: unit
**Gate**: quick
**Commit**: `feat(admin): disparo de convites com teto diário`

---

### T20: `listarRotasComEstado`

**What**: Rotas da campanha com `estadoConvite`, filtro por estado e totais.
**Where**: `backend-promotor/service/adminDisparoService.ts`
**Depends on**: T19
**Reuses**: `estadoConvite` (T5)
**Requirement**: CONV-41, CONV-42

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Cada estado aparece como no design; filtro por estado; totais sempre de todos os estados
- [ ] Gate quick passa

**Tests**: unit
**Gate**: quick
**Commit**: `feat(admin): acompanhar estado dos convites`

---

### T21: Rotas `/admin/*` montadas com `adminAuthMiddleware`

**What**: As 9 rotas do design, com zod, handlers delegando para `AdminDisparoService`, mapeamento de erro e montagem em `api.ts`.
**Where**: `backend-promotor/routes/AdminDisparoRoute.ts`
**Depends on**: T20
**Reuses**: `createDocumentedRoute`, supertest de `visitaConfirmar.test.ts`
**Requirement**: CONV-03, CONV-04, CONV-05

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Cada uma das 9 rotas: sem token → 401, não admin → 403, admin → 2xx (L-002)
- [ ] Erros de domínio viram 400/404/409/422/502 conforme o design
- [ ] Rotas antigas sem mudança de auth
- [ ] Gate full passa

**Tests**: integration
**Gate**: full
**Commit**: `feat(admin): rotas de disparo de convite protegidas por admin`

---

### Phase 5: ob-ads, base e lista (tasks)

### T22: Bearer no `api_promotores`

**What**: Interceptor de request que anexa `Bearer authToken`, igual ao de `api_ob_ads`.
**Where**: `ob-ads/service/api.ts`
**Depends on**: None
**Reuses**: Interceptor de `api_ob_ads` (`:16-24`)
**Requirement**: CONV-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Token anexado quando existe; ausente sem erro (SSR sem `window`)
- [ ] `npx tsc --noEmit` sem erros novos

**Tests**: none
**Gate**: build
**Commit**: `feat(api): enviar token ao backend de promotores`

---

### T23: Cliente `adminDisparoService` do ob-ads

**What**: Funções tipadas para os 9 endpoints `/admin/*`.
**Where**: `ob-ads/service/adminDisparoService.ts`
**Depends on**: T22
**Reuses**: `api_promotores`, tipos do design
**Requirement**: CONV-01, CONV-19

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Uma função por endpoint, com tipos de request e response
- [ ] `npx tsc --noEmit` sem erros novos

**Tests**: none
**Gate**: build
**Commit**: `feat(admin): cliente do disparo de convites`

---

### T24: Lógica pura da tela de disparo

**What**: `validarRegiao`, `rotulosEstadoConvite`, `corOficina`, `resumoPrevia`.
**Where**: `ob-ads/lib/disparoVisitas.ts`
**Depends on**: None
**Reuses**: Paleta `OB` de `wizard-theme.ts`
**Requirement**: CONV-06, CONV-41

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Todos os branches testados em `lib/__tests__/disparoVisitas.test.ts`
- [ ] `npx jest lib/__tests__/disparoVisitas.test.ts` passa

**Tests**: unit
**Gate**: build
**Commit**: `feat(admin): regras puras da tela de disparo`

---

### T25: Lista de campanhas ativas do admin

**What**: DataGrid pt-BR com Cliente, Nome, Período, Promotores, Rotas e a ação "Abrir".
**Where**: `ob-ads/app/admin/disparo-visitas/page.tsx`
**Depends on**: T23
**Reuses**: `campanha-para-promotores/page.tsx` (grid e `localeText`)
**Requirement**: CONV-01, CONV-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Nome ausente → `—`; 401/403 → mensagem
- [ ] `npx tsc --noEmit` sem erros novos

**Tests**: none
**Gate**: build
**Commit**: `feat(admin): lista de campanhas para disparo de visitas`

---

### T26: Card "Disparo de visitas" no admin

**What**: Novo item em `menuItems`.
**Where**: `ob-ads/app/admin/page.jsx`
**Depends on**: T25
**Reuses**: Formato de `menuItems`
**Requirement**: CONV-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] O card leva a `/admin/disparo-visitas`
- [ ] Gate build passa

**Tests**: none
**Gate**: build
**Commit**: `feat(admin): atalho para disparo de visitas`

---

### T27: `CriterioValorInput` com `buscarValores`

**What**: Prop opcional para trocar a fonte dos valores, sem mudar o comportamento atual.
**Where**: `ob-ads/app/(dashboard)/dashboard/campanha-para-promotores/components/wizard/CriterioValorInput.tsx`
**Depends on**: None
**Reuses**: Componente atual
**Requirement**: CONV-12

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Sem a prop, igual a hoje; com a prop, usa a função passada
- [ ] `npx tsc --noEmit` sem erros novos

**Tests**: none
**Gate**: build
**Commit**: `feat(wizard): fonte de valores configurável no critério`

---

### Phase 6: ob-ads, fluxo da campanha (tasks)

### T28: `StepRegiaoSegmentacao`

**What**: Região (UF + cidade, ou CEP + raio) e critérios do tenant 15, com "Buscar oficinas" desabilitado sem os dois.
**Where**: `ob-ads/app/admin/disparo-visitas/components/StepRegiaoSegmentacao.tsx`
**Depends on**: T27
**Reuses**: Builder de `StepSegmentacao.tsx`, `validarRegiao`
**Requirement**: CONV-06, CONV-07, CONV-10, CONV-11

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Aviso de truncado; 502 mantém a seleção
- [ ] `npx tsc --noEmit` sem erros novos

**Tests**: none
**Gate**: build
**Commit**: `feat(admin): passo de região e segmentação`

---

### T29: `StepRotasAdmin`

**What**: Mapa com oficinas e promotores, seleção, "Atribuir a…", distribuição automática, remoção e conflitos.
**Where**: `ob-ads/app/admin/disparo-visitas/components/StepRotasAdmin.tsx`
**Depends on**: T28
**Reuses**: `WizardMap`, `corOficina`
**Requirement**: CONV-13, CONV-14, CONV-16, CONV-17, CONV-18

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Oficina sem WhatsApp e não importada fica desabilitada; os conflitos aparecem por oficina
- [ ] `npx tsc --noEmit` sem erros novos

**Tests**: none
**Gate**: build
**Commit**: `feat(admin): passo de montagem de rotas`

---

### T30: `StepDisparo`

**What**: Lista com o estado dos convites, filtro e totais; teto diário, prévia e confirmação.
**Where**: `ob-ads/app/admin/disparo-visitas/components/StepDisparo.tsx`
**Depends on**: T29
**Reuses**: `ConfirmModal`, `resumoPrevia`, `rotulosEstadoConvite`
**Requirement**: CONV-19, CONV-20, CONV-21, CONV-23, CONV-41, CONV-42

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] 422 mostra o teto mínimo; o resumo aparece depois do disparo
- [ ] `npx tsc --noEmit` sem erros novos

**Tests**: none
**Gate**: build
**Commit**: `feat(admin): passo de disparo com teto diário`

---

### T31: Página da campanha (`DisparoWizard`)

**What**: Orquestra os 3 passos na URL, com o cabeçalho da campanha e as queries.
**Where**: `ob-ads/app/admin/disparo-visitas/[id]/page.tsx`
**Depends on**: T30
**Reuses**: Padrão `?step=` do `CampanhaWizard`
**Requirement**: CONV-13, CONV-19

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Navegação entre passos preserva o estado da seleção
- [ ] `npx tsc --noEmit` sem erros novos

**Tests**: none
**Gate**: build
**Commit**: `feat(admin): fluxo de disparo de convite por campanha`

---

### Phase 7: jornal, recusa do reparador (tasks)

### T32: `recusarVisita` no service do jornal

**What**: `POST visita/recusar` e o tipo `ALREADY_DECLINED` em `GetVisitaResponse`.
**Where**: `jornalOficinaBrasil/service/visitaService.ts`
**Depends on**: None
**Reuses**: `confirmarVisita`
**Requirement**: CONV-35

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Bearer enviado; erros no mesmo formato
- [ ] Testes em `service/__tests__/visitaService.test.ts` passam

**Tests**: unit
**Gate**: build
**Commit**: `feat(visita): serviço de recusa de visita`

---

### T33: `recusar()` e estados no hook

**What**: Estados `confirming_decline`, `declined` e `already_declined`, e a ação `recusar()` com o retry de 401/403 e o mapeamento de 404/409/410/429.
**Where**: `jornalOficinaBrasil/app/(visita)/visita/confirmacao/useVisitaConfirmacao.ts`
**Depends on**: T32
**Reuses**: Fluxo de `confirmar()`
**Requirement**: CONV-35, CONV-37

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] GET `ALREADY_DECLINED` → `already_declined`; 409 → GET de novo
- [ ] Testes do hook passam

**Tests**: unit
**Gate**: build
**Commit**: `feat(visita): estados de recusa no fluxo do reparador`

---

### T34: Botão Recusar e `DeclinedScreen`

**What**: "Não quero receber a visita" na tela pendente, o passo de confirmação e a tela de recusada.
**Where**: `jornalOficinaBrasil/app/(visita)/visita/confirmacao/VisitaConfirmacaoClient.tsx`
**Depends on**: T33
**Reuses**: `StatusScreen`, classes de botão existentes
**Requirement**: CONV-35

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Copy da spec e do design em pt-BR
- [ ] Testes do componente passam

**Tests**: unit
**Gate**: build
**Commit**: `feat(visita): reparador pode recusar a visita`

---

### Phase 8: Registro (tasks)

### T35: Decisões AD-003 e AD-004 no STATE

**What**: Registra AD-003 (aceito = CONFIRMADO + origem, substitui `CONFIRMACAO_RESOLVIDA`) e AD-004 (admin via `/admin/*` + `adminAuthMiddleware`).
**Where**: `backend-promotor/.specs/STATE.md`
**Depends on**: None
**Reuses**: Formato AD-001/AD-002
**Requirement**: CONV-31, CONV-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Duas entradas com Decision/Reason/Trade-off/Scope/Date/Status
- [ ] Gate build passa

**Tests**: none
**Gate**: build
**Commit**: `docs(state): decisões de aceite de visita e auth de admin`

---

## Phase Execution Map

Fases em sequência (Phase 1 → 8). Cadeias dentro de cada fase:

```
T1 → T2
T7 → T8 → T9 → T10
T8 → T11
T12 → T13 → T14
T15 → T17 → T18 → T19 → T20 → T21
T22 → T23 → T25 → T26
T28 → T29 → T30 → T31
T32 → T33 → T34
```

Tasks sem seta (T3, T4, T5, T6, T16, T24, T27, T35) não dependem de ninguém da própria fase. Execução estritamente sequencial dentro de cada fase.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 1 script SQL | ✅ |
| T2 | 1 entity | ✅ |
| T3-T6 | 1 arquivo / 1-3 funções coesas cada | ✅ |
| T7-T11 | 1 função ou método por task (T8 e T9 no mesmo arquivo, métodos distintos) | ✅ |
| T12 | 1 service, recusa + transição (coeso) | ⚠️ coeso |
| T13 | 1 rota (+ handler no controller existente) | ✅ |
| T14 | 1 doc | ✅ |
| T15-T20 | 1 método de service cada | ✅ |
| T21 | 1 arquivo de rotas (+ uma linha de montagem em `api.ts`) | ⚠️ coeso, a montagem é inseparável do teste de integração |
| T22-T31 | 1 arquivo cada | ✅ |
| T32-T34 | 1 arquivo cada | ✅ |
| T35 | 1 doc | ✅ |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | - | ✅ |
| T2 | T1 | T1 → T2 | ✅ |
| T3 | None | - | ✅ |
| T4 | None | - | ✅ |
| T5 | None | - | ✅ |
| T6 | None | - | ✅ |
| T7 | T2 (phase 1) | - (fase anterior) | ✅ |
| T8 | T7 | T7 → T8 | ✅ |
| T9 | T8 | T8 → T9 | ✅ |
| T10 | T9 | T9 → T10 | ✅ |
| T11 | T8 | T8 → T11 | ✅ |
| T12 | T2 (phase 1) | - (fase anterior) | ✅ |
| T13 | T12 | T12 → T13 | ✅ |
| T14 | T13 | T13 → T14 | ✅ |
| T15 | T3 (phase 1) | - (fase anterior) | ✅ |
| T16 | None | - | ✅ |
| T17 | T15 | T15 → T17 | ✅ |
| T18 | T17 | T17 → T18 | ✅ |
| T19 | T18 | T18 → T19 | ✅ |
| T20 | T19 | T19 → T20 | ✅ |
| T21 | T20 | T20 → T21 | ✅ |
| T22 | None | - | ✅ |
| T23 | T22 | T22 → T23 | ✅ |
| T24 | None | - | ✅ |
| T25 | T23 | T23 → T25 | ✅ |
| T26 | T25 | T25 → T26 | ✅ |
| T27 | None | - | ✅ |
| T28 | T27 (phase 5) | - (fase anterior) | ✅ |
| T29 | T28 | T28 → T29 | ✅ |
| T30 | T29 | T29 → T30 | ✅ |
| T31 | T30 | T30 → T31 | ✅ |
| T32 | None | - | ✅ |
| T33 | T32 | T32 → T33 | ✅ |
| T34 | T33 | T33 → T34 | ✅ |
| T35 | None | - | ✅ |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1, T2 | migration / entity | none | none | ✅ |
| T3, T4, T5 | utils puros | unit | unit | ✅ |
| T6 | middleware | unit + integration | unit (a integração de cada rota montada fica em T13/T21, onde a montagem acontece: merge-forward) | ✅ |
| T7-T12, T15-T20 | services | unit | unit | ✅ |
| T13, T21 | rotas | integration | integration | ✅ |
| T14, T35 | docs | none | none | ✅ |
| T22, T23, T25-T31 | ob-ads páginas/componentes/cliente | none | none | ✅ |
| T24 | ob-ads lógica pura | unit | unit | ✅ |
| T32-T34 | jornal service/hook/componente | unit | unit | ✅ |
