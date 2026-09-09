# Importador de Oficinas Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

**Não executar nesta sessão.** Esta fase produz o plano de tasks/commits para revisão; a execução (escrever código, rodar testes, criar commits) só começa em uma sessão futura, após aprovação explícita do usuário. Nenhum passo abaixo acessa o banco de dados — os gates de teste `integration` exigem um banco real e devem ser rodados pelo executor humano/CI, nunca pelo agente de design.

---

**Design**: `.specs/features/importador-oficinas/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Guidelines found: nenhum `AGENTS.md`/`CONTRIBUTING.md` no repositório. Matriz inferida de amostragem de `__tests__/unit/oficinaService.test.ts` (raw-SQL services testados via `jest.mock("../../data-source")` + `AppDataSourceSync.query` mockado), `__tests__/integration/visitaConfirmar.test.ts` (endpoint testado via `supertest` + `jest.mock` do service, **sem** tocar banco real), e `__tests__/integration/oficinaService.test.ts` (contra-exemplo: usa banco real — **não seguir este padrão** para as tasks abaixo, para nunca depender de acesso a banco nesta feature). `package.json` scripts: `test:unit`, `test:integration` (via `jest --testMatch`). Sem script de lint/build configurado (`CONCERNS.md` confirma: nenhum gate de build/lint existe hoje).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
|---|---|---|---|---|
| Service (`oficinaImportService.ts`, extensões em `oficinaService.ts`, reuso de `rotaService.ts`) | unit | Todos os branches; 1:1 com os ACs `IMPORT-01`..`IMPORT-20`; todo edge case listado no spec tem teste próprio; `AppDataSourceSync.query` sempre mockado (`jest.mock("../../data-source")`, mesmo padrão de `oficinaService.test.ts`) | `__tests__/unit/oficinaImportService.test.ts`, `__tests__/unit/oficinaService.test.ts` (extensão) | `npm run test:unit` |
| Controller / rota (`POST /oficina/import`) | integration | Happy path + todos os erros mapeados (400 cabeçalho/tamanho, 404 campanha, 422 sem slug) — `OficinaImportService` mockado via `jest.mock`, nunca toca banco real (mesmo padrão de `__tests__/integration/visitaConfirmar.test.ts`, não o de `oficinaService.test.ts`) | `__tests__/integration/oficinaImport.test.ts` | `npm run test:integration` |
| Entity / migration (`OficinaImportada.ts`, `migration-oficina-importada.sql`) | none | Nenhum teste de unidade — só gate de build (compila sem erro de TypeScript) | - | build gate only |
| Middleware de upload (`uploadPlanilha.ts`) | unit | `fileFilter` extraído como função pura testável isoladamente (aceita `.xlsx`/`.csv`, rejeita outros); limite de tamanho coberto indiretamente pelo teste de integração do endpoint | `__tests__/unit/uploadPlanilha.test.ts` | `npm run test:unit` |

## Gate Check Commands

> Gerado a partir de `package.json`. Não há script de lint/build configurado — build gate = suíte completa (`test:unit` + `test:integration`), sem etapa de lint.

| Gate Level | When to Use | Command |
|---|---|---|
| Quick | Após tasks só com testes unit | `npm run test:unit` |
| Full | Após tasks com teste de integration | `npm run test:unit && npm run test:integration` |
| Build | Após conclusão de fase ou tasks só de entidade/config/migration | `npx tsc --noEmit` (checagem de tipos; não há script `build` configurado — ver `CONCERNS.md`) |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Fundação (entidade, migration, helper de CNPJ)

Tasks: T1, T2 (independentes entre si), T3 (depende de T2). Ver diagrama de dependências completo em **Phase Execution Map**.

### Phase 2: Parsing e validação de linha

Tasks: T4, T5, T6 (independentes entre si — cada uma é um pedaço isolado de parsing/validação).

### Phase 3: Resolução da oficina (dedup/criação + geocodificação)

```
T7 -> T8
```

### Phase 4: Vínculo ao cliente e atribuição de rota

```
T9 -> T10
```

### Phase 5: Orquestração e endpoint

```
T11 -> T12
```

### Phase 6: Extensão das queries de comunidade

Tasks: T13 (depende de T2 e T3, na Fase 1).

---

## Task Breakdown

### T1: Exportar `cnpjIntDaOficina`

**What**: Tornar `cnpjIntDaOficina` (hoje `function` privada do módulo) uma função exportada de `utils/sqlCadastroEmpresa.ts`, sem nenhuma mudança de comportamento.
**Where**: `utils/sqlCadastroEmpresa.ts`
**Depends on**: None
**Reuses**: `utils/sqlCadastroEmpresa.ts:63` (implementação já existente)
**Requirement**: IMPORT-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `cnpjIntDaOficina` é exportada (`export function`)
- [x] Nenhuma outra linha do arquivo muda — comportamento de `ligacaoCadastroEmpresa` idêntico ao atual
- [x] `npx tsc --noEmit` sem erros novos (2 erros pré-existentes e não relacionados em `segmentacaoCampanhaPromotor.test.ts`, confirmados via `git stash` contra o commit base)

**Tests**: none
**Gate**: build

**Commit**: `chore(oficina-import): export cnpjIntDaOficina for CNPJ dedup reuse`
**Status**: ✅ Complete

---

### T2: Criar entidade `OficinaImportada`

**What**: Nova entidade TypeORM para `CAMPANHAS_OB.OFICINA_IMPORTADA`, conforme o modelo de dados do design.
**Where**: `entities/OficinaImportada.ts`
**Depends on**: None
**Reuses**: Padrão de soft delete/timestamps de `entities/CampanhaPromotor.ts`
**Requirement**: IMPORT-13

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Colunas `ID_OFICINA_IMPORTADA`, `ID_OFICINA`, `EMPRESA_SLUG`, `ID_CAMPANHA`, `CREATED_BY`, `CREATED_AT`, `UPDATED_AT`, `DELETED_AT` definidas conforme design (sem `ORIGEM` — redundante com `MAIN_REGISTER.OFICINA.ORIGEM`, obtível via join quando necessário)
- [x] `npx tsc --noEmit` sem erros novos

**Tests**: none
**Gate**: build

**Commit**: `feat(oficina-import): add OficinaImportada entity`
**Status**: ✅ Complete

---

### T3: Criar migration `OFICINA_IMPORTADA`

**What**: Script SQL que cria a tabela `CAMPANHAS_OB.OFICINA_IMPORTADA` e os dois índices (único `(ID_OFICINA, EMPRESA_SLUG) WHERE DELETED_AT IS NULL`; não-único em `EMPRESA_SLUG`), exatamente como especificado no design.
**Where**: `scripts/migration-oficina-importada.sql`
**Depends on**: T2
**Reuses**: Convenção de `scripts/migration-empresa-slug-campanha.sql` (índice parcial `WHERE DELETED_AT IS NULL`)
**Requirement**: IMPORT-13

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Script usa `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` (idempotente, mesmo padrão dos scripts existentes)
- [x] Colunas do script batem exatamente com a entidade de T2
- [x] **Nota explícita no PR/commit**: aplicação em produção é manual pelo DBA — este agente não roda a migration contra nenhum banco (confirmado: script criado, nunca executado)

**Tests**: none
**Gate**: build

**Commit**: `chore(oficina-import): add OFICINA_IMPORTADA migration script`
**Status**: ✅ Complete

---

### T4: Middleware de upload de planilha

**What**: Middleware `multer` (`memoryStorage`, limite de 5MB) com `fileFilter` extraído como função pura `isPlanilhaValida(filename): boolean` para ser testável isoladamente. (Assinatura sem `mimetype`: mimetype de planilha varia demais entre navegadores/SOs para ser um critério confiável — decisão tomada na implementação, ver comentário no arquivo.)
**Where**: `middlewares/uploadPlanilha.ts`
**Depends on**: None
**Reuses**: Nenhum (primeiro uso de `multer` no repositório); mesmo estilo dos demais arquivos em `middlewares/`
**Requirement**: IMPORT-02, IMPORT-04

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `isPlanilhaValida` aceita `.xlsx`/`.csv` e rejeita outras extensões
- [x] `multer` configurado com `limits.fileSize = 5 * 1024 * 1024`
- [x] Testes cobrem: extensão válida aceita, extensão inválida rejeitada
- [x] Gate: `npm run test:unit` — 6/6 testes passando

**Tests**: unit
**Gate**: quick

**Commit**: `feat(oficina-import): add planilha upload middleware`
**Status**: ✅ Complete

---

### T5: Parsing e validação de cabeçalho

**What**: `OficinaImportService.parseArquivo(buffer)` (usa `xlsx` para virar matriz de linhas) e `validarCabecalho(linhas)` (compara as 7 colunas esperadas, case/acento-insensível, mesma ordem; lança erro estrutural se não bater).
**Where**: `service/oficinaImportService.ts`
**Depends on**: None
**Reuses**: `xlsx` (primeiro uso real no repositório)
**Requirement**: IMPORT-01, IMPORT-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Cabeçalho exato (qualquer capitalização/acentuação) é aceito
- [x] Cabeçalho fora de ordem, faltando coluna, ou com coluna extra é rejeitado
- [x] Arquivo com mais de 5.000 linhas de dados é rejeitado antes de processar qualquer linha
- [x] Arquivo com cabeçalho válido e 0 linhas de dados retorna lista vazia (sem erro)
- [x] Gate: `npm run test:unit` — 10/10 testes passando

**Tests**: unit
**Gate**: quick

**Commit**: `feat(oficina-import): parse and validate planilha header`
**Status**: ✅ Complete

---

### T6: Normalização e deduplicação de CNPJ por linha

**What**: `normalizarCnpj(valor)` (reusa `cnpjIntParaLigacao`, exige 14 dígitos) e detecção de CNPJ duplicado dentro do mesmo arquivo (primeira ocorrência processada, demais marcadas como erro).
**Where**: `service/oficinaImportService.ts`
**Depends on**: None
**Reuses**: `cnpjIntParaLigacao` (`utils/sqlCadastroEmpresa.ts:144`, já exportada)
**Requirement**: IMPORT-09, IMPORT-10

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] CNPJ com máscara (`12.345.678/0001-90`) normaliza corretamente
- [x] CNPJ com menos/mais de 14 dígitos é rejeitado com motivo específico
- [x] Segunda ocorrência do mesmo CNPJ no arquivo é rejeitada como "CNPJ duplicado no arquivo"
- [x] Gate: `npm run test:unit` — 17/17 testes passando

**Tests**: unit
**Gate**: quick

**Commit**: `feat(oficina-import): normalize and validate row CNPJ`
**Status**: ✅ Complete

---

### T7: Deduplicar/criar oficina por CNPJ

**What**: `buscarOuCriarOficina(linha)` — busca `MAIN_REGISTER.OFICINA` pelo CNPJ normalizado (reusando `cnpjIntDaOficina`); se existir, reusa `ID_OFICINA` sem sobrescrever campos; se não existir, cria oficina nova com `ORIGEM = "IMPORTACAO_PLANILHA"`.
**Where**: `service/oficinaImportService.ts`
**Depends on**: T1, T6
**Reuses**: `cnpjIntDaOficina` (T1), `entities/Oficina.ts` (já existe, campo `ORIGEM` já existe)
**Requirement**: IMPORT-07, IMPORT-08

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] CNPJ já cadastrado retorna o `ID_OFICINA` existente e não altera nenhum campo da oficina
- [x] CNPJ novo cria uma oficina com os 7 campos da planilha + `ORIGEM`
- [x] Gate: `npm run test:unit` — 19/19 testes passando

**Tests**: unit
**Gate**: quick

**Commit**: `feat(oficina-import): dedupe and create oficina by CNPJ`
**Status**: ✅ Complete

---

### T8: Preencher lat/long por geocodificação

**What**: `garantirLatLong(idOficina, cep)` — se a oficina (nova ou existente) não tem `LATITUDE`/`LONGITUDE`, chama `GeolocationService.getLatLongByCep(cep)` e faz `UPDATE` só desses dois campos; se a geocodificação falhar, sinaliza para a linha ser rejeitada (nenhuma escrita).
**Where**: `service/oficinaImportService.ts`
**Depends on**: T7
**Reuses**: `GeolocationService.getLatLongByCep` (`service/geolocationService.ts:117`, sem alteração)
**Requirement**: IMPORT-11, IMPORT-12

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Oficina que já tem lat/long não chama `GeolocationService`
- [x] Oficina sem lat/long chama `GeolocationService.getLatLongByCep` e persiste o resultado
- [x] Falha de geocodificação (retorno `null`) não escreve nada e marca a linha como rejeitada
- [x] Gate: `npm run test:unit` — 22/22 testes passando

**Tests**: unit
**Gate**: quick

**Commit**: `feat(oficina-import): geocode and fill oficina lat/long`
**Status**: ✅ Complete

---

### T9: Vincular oficina importada ao cliente sem usuário

**What**: `garantirVinculo(idOficina, empresaSlug, idCampanha, createdBy)` — verifica se a oficina já pertence à comunidade do `empresaSlug` (via `USUARIO_COMMUNITY` OU `OFICINA_IMPORTADA` já existente); se não, insere um novo registro em `OFICINA_IMPORTADA`.
**Where**: `service/oficinaImportService.ts`
**Depends on**: T2, T3, T8
**Reuses**: Entidade de T2, tabela de T3
**Requirement**: IMPORT-13, IMPORT-14, IMPORT-15

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Oficina nova para o `empresaSlug` cria um registro em `OFICINA_IMPORTADA`
- [x] Oficina já na comunidade (via `USUARIO_COMMUNITY` ou `OFICINA_IMPORTADA` prévia) não cria um segundo vínculo — idempotente
- [x] Reimportar a mesma planilha para o mesmo `empresaSlug` não duplica vínculos
- [x] Gate: `npm run test:unit` — 26/26 testes passando

**Tests**: unit
**Gate**: quick

**Commit**: `feat(oficina-import): link imported oficina without user`
**Status**: ✅ Complete

---

### T10: Atribuir rota do promotor à oficina vinculada

**What**: Após vincular (ou confirmar vínculo já existente) de uma oficina, chamar `RotaService.assignOficinaFromCommunitySignup(idOficina, empresaSlug)` (já existe, sem nenhuma alteração) e capturar o resultado por oficina para o relatório final.
**Where**: `service/oficinaImportService.ts`
**Depends on**: T9
**Reuses**: `RotaService.assignOficinaFromCommunitySignup` (`service/rotaService.ts:792`, zero alterações)
**Requirement**: IMPORT-16, IMPORT-17, IMPORT-18, IMPORT-19

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Oficina dentro do raio de um promotor da campanha recebe `ROTA_PROMOTOR` (`STATUS = BACKLOG`) — garantido por `RotaService.assignOficinaFromCommunitySignup` (reusado, não reimplementado); coberto por teste de pass-through do resultado `atribuida`
- [x] Oficina fora de qualquer raio é reportada como `sem_promotor_disponivel`, sem erro — coberto por teste de pass-through
- [x] Oficina já com rota ativa na campanha não gera rota duplicada (idempotência herdada do método reusado, já coberta em `rotaService.test.ts` — não re-testada aqui)
- [x] Gate: `npm run test:unit` — 29/29 testes de `oficinaImportService.test.ts` passando (12 falhas pré-existentes e não relacionadas em outras 2 suítes, confirmadas via `git stash`)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(oficina-import): assign promoter route to linked oficina`
**Status**: ✅ Complete

---

### T11: Orquestrar o fluxo completo de importação

**What**: `OficinaImportService.importarPlanilha(buffer, idCampanha, createdBy)` — resolve `EMPRESA_SLUG` via `CampanhaService.findCampanhaById`, chama em ordem os helpers de T5-T10 linha a linha, isola erro de linha (não aborta o arquivo) e monta o relatório final (`total_linhas`, `oficinas_criadas`, `oficinas_vinculadas_existentes`, `ja_na_comunidade`, `rotas_criadas`, `erros[]`).
**Where**: `service/oficinaImportService.ts`
**Depends on**: T4, T5, T6, T7, T8, T9, T10
**Reuses**: `CampanhaService.findCampanhaById` (`service/campanhaService.ts:191`), todos os helpers das tasks anteriores
**Requirement**: IMPORT-01 a IMPORT-20 (orquestração — cada AC já testado isoladamente nas tasks anteriores; aqui o foco é a integração entre elas e o formato do relatório)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `ID_CAMPANHA` inexistente/soft-deleted lança erro mapeável para 404 (`CAMPANHA_NAO_ENCONTRADA`)
- [x] Campanha sem `EMPRESA_SLUG` lança erro mapeável para 422 (`CAMPANHA_SEM_EMPRESA_SLUG`)
- [x] Uma linha com erro não interrompe o processamento das demais
- [x] Relatório final reflete corretamente os contadores de cada categoria
- [x] Gate: `npm run test:unit` — 37/37 testes passando (regressão completa: 613 passando, mesmas 12 falhas pré-existentes e não relacionadas)

**SPEC_DEVIATION registrado**: o diagrama do design cria a oficina antes de geocodificar; IMPORT-12 exige que a oficina NÃO seja criada quando a geocodificação falha. Reconciliado com um rollback (`repo.delete`) da oficina recém-criada quando a geocodificação falha para CNPJ novo — nada é apagado quando a oficina já existia antes do import. `design.md` atualizado com a nota.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(oficina-import): orchestrate planilha import flow`
**Status**: ✅ Complete

---

### T12: Endpoint `POST /oficina/import`

**What**: Handler do controller que extrai `req.file` (via middleware de T4) e `ID_CAMPANHA` (validado por schema Zod), chama `OficinaImportService.importarPlanilha`, e mapeia os erros (404/422/400) para a resposta HTTP. Inclui o registro da rota em `routes/OficinaRoute.ts` (com `createDocumentedRoute`, mesmo padrão dos demais endpoints do arquivo) e os schemas Zod de request/response em `schemas/oficina.ts` — as três mudanças são wiring que só pode ser testado de ponta a ponta junto (a rota não compila sem o handler, o handler não valida sem o schema), por isso ficam em uma task só, com os testes de integração escritos junto.
**Where**: `controllers/oficinaController.ts`
**Depends on**: T11
**Reuses**: `utils/routeDocumentation.ts` (`createDocumentedRoute`), padrão try/catch dos outros handlers de `oficinaController.ts`
**Requirement**: IMPORT-01, IMPORT-05, IMPORT-06

**SPEC_DEVIATION registrado**: `middlewares/validation.ts` (`validateSchema`) **não** foi reusado como planejado. `createDocumentedRoute` sempre executa a validação de `schemas.body` **antes** dos middlewares customizados — para um request `multipart/form-data`, isso rodaria a validação Zod antes de o `multer` popular `req.body`, rejeitando todo upload por `ID_CAMPANHA` "ausente". `ID_CAMPANHA` é validado manualmente no controller, depois do `multer` já ter rodado (ver `ImportOficinasBodySchema` em `schemas/oficina.ts`, ainda definido e usado, só não via o mecanismo `schemas.body` do `createDocumentedRoute`).

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Upload válido retorna 200 com o relatório de `OficinaImportService`
- [x] Extensão de arquivo inválida retorna 400 (via `fileFilter` do middleware)
- [x] `ID_CAMPANHA` ausente ou arquivo ausente retornam 400
- [x] `ID_CAMPANHA` inexistente retorna 404
- [x] Campanha sem `EMPRESA_SLUG` retorna 422
- [x] Cabeçalho fora do padrão retorna 400
- [x] Teste de integração usa `jest.mock` em `OficinaImportService` (padrão de `__tests__/integration/visitaConfirmar.test.ts`) — **nunca** o padrão de banco real de `__tests__/integration/oficinaService.test.ts`
- [x] Gate: `npm run test:unit` (613/625, mesmas 12 falhas pré-existentes) + execução **direcionada** de `oficinaImport.test.ts` e `visitaConfirmar.test.ts` (7/7 e 17/17) — **não** rodei `npm run test:integration` completo, pois outras suítes de integração deste repositório batem em banco real (`__tests__/integration/oficinaService.test.ts` etc.), o que violaria a restrição de nunca acessar um banco nesta sessão

**Tests**: integration
**Gate**: full (com a ressalva acima sobre o escopo do comando rodado)

**Commit**: `feat(oficina-import): add POST /oficina/import endpoint`
**Status**: ✅ Complete

---

### T13: Incluir oficinas importadas nas queries de comunidade

**What**: Estender `getComunityNearbyOficinas`, `getCommunityOficinas` e `countCommunityOficinas` (as 3 em `service/oficinaService.ts`) com o ramo `UNION ALL` sobre `OFICINA_IMPORTADA` descrito no design, mantendo a mesma assinatura e formato de retorno de cada método.
**Where**: `service/oficinaService.ts`
**Depends on**: T2, T3
**Reuses**: `ligacaoCadastroEmpresa` (mesmo helper já usado nas 3 queries)
**Requirement**: IMPORT-20

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Para um `empresaSlug` sem nenhuma oficina em `OFICINA_IMPORTADA`, as 3 queries retornam exatamente o mesmo resultado de antes (ramo novo é um no-op) — teste de regressão explícito
- [ ] Para um `empresaSlug` com oficinas em `OFICINA_IMPORTADA`, as 3 queries incluem essas oficinas no resultado, sem duplicar as que já vêm de `USUARIO_COMMUNITY`
- [ ] Gate: `npm run test:unit`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(oficina-import): include imported oficinas in community queries`

---

## Phase Execution Map

Todas as dependências reais entre tasks (uma aresta por linha, `Tx -> Ty` significa "Ty depende de Tx"):

```
T2 -> T3
T1 -> T7
T6 -> T7
T7 -> T8
T2 -> T9
T3 -> T9
T8 -> T9
T9 -> T10
T4 -> T11
T5 -> T11
T6 -> T11
T7 -> T11
T8 -> T11
T9 -> T11
T10 -> T11
T11 -> T12
T2 -> T13
T3 -> T13
```

Fases (agrupamento para execução em lote — cada fase completa antes da próxima começar):

| Phase | Tasks |
|---|---|
| 1 | T1, T2, T3 |
| 2 | T4, T5, T6 |
| 3 | T7, T8 |
| 4 | T9, T10 |
| 5 | T11, T12 |
| 6 | T13 |

Execution is strictly sequential - there is no intra-phase parallelism. Dentro de cada fase, as tasks sem dependência entre si (ex.: T1/T2 na Fase 1, T4/T5/T6 na Fase 2) podem ser executadas em qualquer ordem relativa, mas o agente as executa uma de cada vez, na ordem listada.

---

## Task Granularity Check

| Task | Scope | Status |
|---|---|---|
| T1: Exportar `cnpjIntDaOficina` | 1 função, 1 arquivo | ✅ Granular |
| T2: Criar entidade `OficinaImportada` | 1 entidade, 1 arquivo | ✅ Granular |
| T3: Criar migration `OFICINA_IMPORTADA` | 1 arquivo SQL | ✅ Granular |
| T4: Middleware de upload | 1 middleware, 1 arquivo | ✅ Granular |
| T5: Parsing e validação de cabeçalho | 2 funções relacionadas, 1 arquivo | ✅ Granular (cohesive) |
| T6: Normalização e dedup de CNPJ | 2 funções relacionadas, 1 arquivo | ✅ Granular (cohesive) |
| T7: Dedup/criar oficina por CNPJ | 1 função, 1 arquivo | ✅ Granular |
| T8: Preencher lat/long | 1 função, 1 arquivo | ✅ Granular |
| T9: Vincular oficina sem usuário | 1 função, 1 arquivo | ✅ Granular |
| T10: Atribuir rota do promotor | 1 chamada de integração, 1 arquivo | ✅ Granular |
| T11: Orquestrar fluxo completo | 1 método público, 1 arquivo | ✅ Granular |
| T12: Endpoint `POST /oficina/import` | 3 arquivos (controller + rota + schema) | ⚠️ OK — wiring que só pode ser testado junto (ver justificativa na task) |
| T13: Estender queries de comunidade | 3 métodos relacionados, 1 arquivo | ✅ Granular (cohesive) |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
|---|---|---|---|
| T1 | None | Fase 1, primeira | ✅ Match |
| T2 | None | Fase 1, paralelo conceitual a T1 (mesma fase) | ✅ Match |
| T3 | T2 | Fase 1, após T2 | ✅ Match |
| T4 | None | Fase 2, primeira | ✅ Match |
| T5 | None | Fase 2, após T4 na ordem de execução (mesma fase, sequencial) | ✅ Match |
| T6 | None | Fase 2, após T5 na ordem de execução | ✅ Match |
| T7 | T1, T6 | Fase 3, primeira (cruza para Fase 1/2) | ✅ Match |
| T8 | T7 | Fase 3, após T7 | ✅ Match |
| T9 | T2, T3, T8 | Fase 4, primeira (cruza para Fase 1/3) | ✅ Match |
| T10 | T9 | Fase 4, após T9 | ✅ Match |
| T11 | T4, T5, T6, T7, T8, T9, T10 | Fase 5, primeira (cruza para Fases 2/3/4) | ✅ Match |
| T12 | T11 | Fase 5, após T11 | ✅ Match |
| T13 | T2, T3 | Fase 6 (cruza para Fase 1) | ✅ Match |

**Rules:** nenhuma dependência aponta para uma fase posterior — todas as dependências de T7-T13 apontam para fases anteriores ou a própria fase, nunca para frente.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
|---|---|---|---|---|
| T1 | Utility (sem mudança de comportamento) | none | none | ✅ OK |
| T2 | Entity | none | none | ✅ OK |
| T3 | Migration | none | none | ✅ OK |
| T4 | Middleware | unit | unit | ✅ OK |
| T5 | Service | unit | unit | ✅ OK |
| T6 | Service | unit | unit | ✅ OK |
| T7 | Service | unit | unit | ✅ OK |
| T8 | Service | unit | unit | ✅ OK |
| T9 | Service | unit | unit | ✅ OK |
| T10 | Service | unit | unit | ✅ OK |
| T11 | Service | unit | unit | ✅ OK |
| T12 | Controller/rota | integration | integration | ✅ OK |
| T13 | Service | unit | unit | ✅ OK |

---

## Tips

- Todas as tasks de T1 a T11 e T13 têm `Tests: unit` com `AppDataSourceSync` mockado — nenhuma delas toca um banco real.
- T12 é a única com `Tests: integration`, e mesmo assim usa `OficinaImportService` mockado (não bate no banco).
- Nenhuma task deste plano requer acesso a um banco de dados real para ser completada ou verificada.
