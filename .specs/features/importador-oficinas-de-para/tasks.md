# Importador de Oficinas com De-Para e Relatório em Stream — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path.

**If the skill cannot be activated, STOP and tell the user.**

---

**Design**: `.specs/features/importador-oficinas-de-para/design.md`
**Status**: Done — 11/11 tasks, 11 commits (4 em backend-promotor, 7 em ob-ads)

---

## Test Coverage Matrix

> Gerada a partir do código, de `.specs/codebase/TESTING.md` e das specs. Guidelines encontradas: `.specs/codebase/TESTING.md`, `jest.config.ts` (backend), `jest.config.js` + `jest.setup.js` (ob-ads).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
|---|---|---|---|---|
| Backend service (lógica de domínio) | unit | Todos os ramos; 1:1 com as ACs; todo edge case listado | `__tests__/unit/*.test.ts` | `npm run test:unit` |
| Backend schema Zod | unit | Valor válido e inválido por campo | `__tests__/unit/*.test.ts` | `npm run test:unit` |
| Backend rota + controller + middleware | integration HTTP-level | Toda rota da task: caminho feliz, cada edge case e cada caminho de erro | `__tests__/integration/*.test.ts` | `npx jest __tests__/integration/<suite>.test.ts` |
| Backend entity / SQL de migration | none | Apenas build gate | - | - |
| ob-ads módulo puro (sem JSX) | unit | Todos os ramos + edge cases | `<mesma pasta>/*.test.js` | `npx jest --env=node <padrão>` |
| ob-ads componente React (JSX) | none | Não executável neste ambiente | - | verificação manual |

**Por que componente React em ob-ads é `none`:** o `node_modules/canvas` deste checkout está com o
binding nativo quebrado, e o ambiente `jsdom` o carrega na inicialização. Com isso **38 das 41 suítes
do repositório não chegam a rodar**, incluindo as que já existiam antes desta feature. O contorno é
`--env=node`, que só serve para teste de função pura. Por isso toda regra testável do modal vive em
módulo puro (T2 e T7), e o componente em si fica com verificação manual.

**Integration HTTP-level não usa banco:** o padrão de `__tests__/integration/oficinaImport.test.ts` é
montar o router com `supertest` e mockar o service. Nenhuma task aqui toca as suítes de banco real.

## Gate Check Commands

| Gate Level | When to Use | Command |
|---|---|---|
| quick-backend | Task com teste unitário no `backend-promotor` | `npm run test:unit` |
| full-backend | Task que registra ou altera rota no `backend-promotor` | `npm run test:unit` e depois `npx jest __tests__/integration/oficinaImportStream.test.ts` |
| build-backend | Fim de fase no `backend-promotor` | `npx tsc --noEmit` e depois `npm run test:unit` |
| quick-obads | Task com módulo puro no `ob-ads` | `npx jest --env=node <padrão do arquivo>` |
| build-obads | Fim de fase no `ob-ads` | `npx tsc --noEmit` e depois `npx jest --env=node spreadsheetImport oficinaImportMapping importOficinasValidation ndjson` |

**Baseline conhecido do `backend-promotor` antes desta feature:** `npm run test:unit` termina com
3 suítes vermelhas e 12 testes falhando. Duas delas (`campanhaService`, `campanhaServiceVisita`) são
fixtures desatualizadas e são consertadas na feature `modo-definicao-rota`, que mexe justamente
naquele método. A terceira (`segmentacaoCampanhaPromotor`) importa módulos que não existem mais e
está fora do escopo das duas features. Portanto o gate desta feature é: **nenhuma suíte nova
vermelha e nenhuma regressão nas 34 suítes verdes**.

---

## Execution Plan

Execução é estritamente sequencial, então `Depends on` de cada task é a task imediatamente
anterior. O acoplamento real de cada uma está descrito em **Reuses** e no corpo da task.

### Phase 1: Base pura no ob-ads

```
T1 → T2
```

### Phase 2: Contrato e serviço no backend

```
T2 → T3 → T4 → T5 → T6
```

### Phase 3: Cliente e modal no ob-ads

```
T6 → T7 → T8 → T9 → T10 → T11
```

---

## Task Breakdown

### T1: Extrair o leitor de planilha para um módulo compartilhado

**What**: mover `parseSpreadsheetFile`, `normalizeHeaderLabel`, `isRowBlank` e `getMappingDuplicateColumnIndexArray` de `contactImport.js` para um módulo compartilhado, e fazer `contactImport.js` reexportar de lá.
**Where**: `ob-ads/app/lib/spreadsheetImport.js`
**Depends on**: None
**Reuses**: corpo atual de `automacao/utils/contactImport.js`, incluindo o tratamento de CSV sem BOM
**Requirement**: UI-05

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] As quatro funções vivem no módulo novo e `contactImport.js` passa a importá-las
- [x] `contactImport.test.js` roda sem nenhuma alteração no arquivo de teste
- [x] Teste novo cobre CSV com BOM, CSV sem BOM, planilha sem aba e linha em branco
- [x] Gate passa: `npx jest --env=node spreadsheetImport contactImport`
- [x] Contagem: 2 suítes verdes, nenhuma remoção de teste existente

**Tests**: unit
**Gate**: quick-obads

**Commit**: `refactor(ob-ads): extract spreadsheet reader into a shared module`

---

### T2: Criar o de-para de colunas de oficina

**What**: definir os campos de oficina, a detecção automática de coluna, a validação do mapeamento e a montagem das linhas a enviar.
**Where**: `ob-ads/app/(dashboard)/dashboard/campanha-para-promotores/components/wizard/oficinaImportMapping.js`
**Depends on**: T1
**Reuses**: `app/lib/spreadsheetImport.js`, formato de `CONTACT_FIELD_DEFINITIONS`
**Requirement**: UI-07, UI-08, UI-09, UI-12, UI-13

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `OFICINA_FIELD_DEFINITIONS` cobre os 8 campos, com `CNPJ` e `CEP` marcados obrigatórios
- [x] `detectOficinaColumnMapping` casa rótulo sem acento, em qualquer caixa, e nunca reutiliza coluna
- [x] `isOficinaMappingValid` exige CNPJ e CEP e recusa coluna repetida
- [x] `buildOficinaArrayFromMapping` descarta linha sem CNPJ ou sem CEP e devolve os números das linhas descartadas
- [x] Teste cobre cada AC acima e o edge case de célula numérica de CNPJ vinda como texto
- [x] Gate passa: `npx jest --env=node oficinaImportMapping`
- [x] Contagem: pelo menos 12 testes

**Tests**: unit
**Gate**: quick-obads

**Commit**: `feat(ob-ads): add column mapping for the oficina import`

---

### T3: Separar o processamento de linhas do parsing de arquivo

**What**: extrair `importarLinhas(linhas, idCampanha, createdBy, onProgress)` e fazer `importarPlanilha` delegar a ela depois de parsear e validar o arquivo.
**Where**: `backend-promotor/service/oficinaImportService.ts`
**Depends on**: T2
**Reuses**: `processarLinha`, `indicesComCnpjDuplicado`, `executarComConcorrenciaLimitada`, `prepararContextoAtribuicaoLote`
**Requirement**: API-01, API-04, API-07, API-09, API-10, STREAM-04

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `importarLinhas` resolve `EMPRESA_SLUG` pela campanha e lança os mesmos erros de pré-voo
- [x] `importarPlanilha` continua com o comportamento atual, agora delegando
- [x] `onProgress` é chamado uma vez por linha concluída, com contadores nunca decrescentes
- [x] Nenhum teste existente de `oficinaImportService.test.ts` muda de expectativa
- [x] Teste novo cobre o lote sem cabeçalho, o progresso monotônico e o teto de concorrência
- [x] Gate passa: `npm run test:unit`
- [x] Contagem: `oficinaImportService.test.ts` cresce e continua verde

**Tests**: unit
**Gate**: quick-backend

**Commit**: `refactor(oficina-import): split row processing from file parsing`

---

### T4: Declarar o schema do corpo da importação em stream

**What**: adicionar o schema Zod do corpo (`ID_CAMPANHA` e array `oficinas` de 1 a 5000, cada item com CNPJ e CEP) e o schema de evento do stream.
**Where**: `backend-promotor/schemas/oficina.ts`
**Depends on**: T3
**Reuses**: `ImportOficinasBodySchema` e `ImportOficinasResponseSchema` já existentes
**Requirement**: API-02, API-03

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Corpo válido passa; corpo sem `oficinas`, com array vazio, com item sem CNPJ e com item sem CEP falham
- [x] Array com 5001 itens falha; com 5000 passa
- [x] Teste novo cobre cada um desses casos
- [x] Gate passa: `npm run test:unit`
- [x] Contagem: pelo menos 8 testes novos

**Tests**: unit
**Gate**: quick-backend

**Commit**: `feat(oficina-import): add the stream import body schema`

---

### T5: Expor a rota de importação em stream

**What**: criar o middleware de limite de corpo, o controller que emite NDJSON e registrar `POST /oficina/import-stream`.
**Where**: `backend-promotor/routes/OficinaRoute.ts`
**Depends on**: T4
**Reuses**: `createDocumentedRoute`, padrão de `__tests__/integration/oficinaImport.test.ts`
**Requirement**: API-05, API-06, API-08, STREAM-01, STREAM-02, STREAM-03, STREAM-05, STREAM-06

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `middlewares/jsonLimitPlanilha.ts` aceita corpo de até 8 MB só nesta rota
- [x] Controller emite `inicio`, depois `progresso` com no máximo um por 500ms, depois `fim`
- [x] Erro depois do primeiro byte vira evento `erro` e encerra o stream
- [x] 400, 404 e 422 saem como JSON comum, antes de qualquer cabeçalho de stream
- [x] Suíte HTTP-level cobre caminho feliz, cada erro de pré-voo, o limite de corpo e a falha no meio do lote
- [x] Gate passa: `npm run test:unit` e `npx jest __tests__/integration/oficinaImportStream.test.ts`
- [x] Contagem: pelo menos 8 testes na suíte nova

**Tests**: integration
**Gate**: full-backend

**Commit**: `feat(oficina-import): add the streaming import endpoint`

---

### T6: Marcar a rota multipart como depreciada

**What**: registrar na documentação da rota e no documento de contrato que `POST /oficina/import` está depreciada em favor da rota em stream.
**Where**: `backend-promotor/docs/IMPORTADOR_OFICINAS_API.md`
**Depends on**: T5
**Reuses**: texto de contrato já existente no documento
**Requirement**: API-08

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] O documento descreve a rota nova, o formato NDJSON e os quatro tipos de evento
- [x] A seção da rota antiga abre dizendo que está depreciada e por que continua de pé
- [x] Nenhum comportamento de código muda
- [x] Gate passa: `npx tsc --noEmit` e `npm run test:unit`

**Tests**: none
**Gate**: build-backend

**Commit**: `docs(oficina-import): document the stream contract and deprecate the multipart route`

---

### T7: Criar o cliente de stream

**What**: adicionar o divisor de linhas NDJSON como função pura e a chamada `importOficinasStream` baseada em `fetch`.
**Where**: `ob-ads/service/oficinaService.ts`
**Depends on**: T6
**Reuses**: regra de mensagem de erro do interceptor de `api_promotores`
**Requirement**: STREAM-07, STREAM-11

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] O divisor de linhas é exportado de `ob-ads/app/lib/ndjson.js` e trata evento partido entre dois pedaços
- [x] `importOficinasStream` entrega cada evento ao chamador e resolve com o resultado do evento `fim`
- [x] Stream que fecha sem `fim` rejeita com motivo próprio
- [x] Erro de pré-voo com corpo JSON vira mensagem legível, preferindo `message` sobre `error`
- [x] Teste cobre pedaço partido, múltiplos eventos num pedaço só, e fechamento sem `fim`
- [x] Gate passa: `npx jest --env=node ndjson`
- [x] Contagem: pelo menos 6 testes

**Tests**: unit
**Gate**: quick-obads

**Commit**: `feat(ob-ads): add the streaming import client`

---

### T8: Ampliar a validação de arquivo para `.xls`

**What**: aceitar também `.xls` na checagem de extensão feita antes de ler a planilha.
**Where**: `ob-ads/app/(dashboard)/dashboard/campanha-para-promotores/components/wizard/importOficinasValidation.ts`
**Depends on**: T7
**Reuses**: `IMPORT_ACCEPTED_EXTENSIONS` de `service/oficinaService.ts`
**Requirement**: UI-06

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `.xls` passa na validação, junto de `.xlsx` e `.csv`
- [x] A mensagem de recusa cita as três extensões
- [x] `importOficinasValidation.test.js` cobre a extensão nova
- [x] Gate passa: `npx jest --env=node importOficinasValidation`

**Tests**: unit
**Gate**: quick-obads

**Commit**: `feat(ob-ads): accept .xls in the oficina import validation`

---

### T9: Construir o modal de importação

**What**: criar o modal com os passos de introdução, anexo, de-para, revisão, progresso e resultado.
**Where**: `ob-ads/app/(dashboard)/dashboard/campanha-para-promotores/components/wizard/ImportOficinasModal.tsx`
**Depends on**: T8
**Reuses**: estrutura de passos de `ImportContactsModal.jsx`, tokens de `wizard-theme.ts`, corpo de `ImportOficinasResultModal.tsx`, `MOTIVO_LABELS`
**Requirement**: UI-03, UI-04, UI-05, UI-06, UI-10, UI-11, STREAM-07, STREAM-08, STREAM-09, STREAM-10, STREAM-11

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] O passo de introdução explica anexar a planilha e apontar as colunas
- [x] O passo de de-para lista os campos com pré-seleção e desabilita coluna já usada
- [x] A revisão mostra linhas do arquivo, linhas a enviar e linhas ignoradas
- [x] O passo de progresso tem barra horizontal e os dois contadores lado a lado
- [x] Fechar e importar ficam bloqueados enquanto o stream está aberto
- [x] Toda cor e tipografia vêm de `wizard-theme.ts`
- [x] Gate passa: `npx tsc --noEmit` no `ob-ads`

**Tests**: none
**Gate**: build-obads

**Commit**: `feat(ob-ads): add the oficina import modal with column mapping`

---

### T10: Trocar o fluxo de importação no passo 3

**What**: substituir o input de arquivo e a mutation antiga pelo modal, e remover o botão de baixar modelo.
**Where**: `ob-ads/app/(dashboard)/dashboard/campanha-para-promotores/components/wizard/StepPromotores.tsx`
**Depends on**: T9
**Reuses**: `ImportOficinasModal`, invalidação de query já usada pela mutation atual
**Requirement**: UI-01, UI-02

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Existe um único botão de importação, rotulado "Importar oficinas"
- [x] O botão "Baixar modelo" não existe mais na tela
- [x] `ImportOficinasResultModal` não é mais montado direto pelo passo
- [x] As queries de campanha e de oficinas da comunidade são invalidadas ao fim da importação
- [x] Gate passa: `npx tsc --noEmit` no `ob-ads`

**Tests**: none
**Gate**: build-obads

**Commit**: `feat(ob-ads): replace the import flow with the mapping modal`

---

### T11: Remover o gerador de modelo de planilha

**What**: apagar o gerador de modelo e a constante de cabeçalho fixo, que ficam sem referência.
**Where**: `ob-ads/app/(dashboard)/dashboard/campanha-para-promotores/components/wizard/oficinaImportTemplate.ts`
**Depends on**: T10
**Reuses**: nada
**Requirement**: UI-02

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] O gerador de modelo, a constante de cabeçalho e o teste dela saem do repositório
- [x] Nenhuma referência a eles sobra no código
- [x] Gate passa: `npx tsc --noEmit` e `npx jest --env=node spreadsheetImport oficinaImportMapping importOficinasValidation ndjson`

**Tests**: none
**Gate**: build-obads

**Commit**: `chore(ob-ads): drop the fixed-header spreadsheet template`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3

Phase 1:  T1 ------→ T2
Phase 2:  T2 ------→ T3 ------→ T4 ------→ T5 ------→ T6
Phase 3:  T6 ------→ T7 ------→ T8 ------→ T9 ------→ T10 ------→ T11
```

Execução estritamente sequencial, uma task por vez.

---

## Task Granularity Check

| Task | Scope | Status |
|---|---|---|
| T1 | 1 módulo extraído | Granular |
| T2 | 1 módulo | Granular |
| T3 | 1 service, 1 método novo | Granular |
| T4 | 1 arquivo de schema | Granular |
| T5 | 1 rota mais seu middleware e controller, coesos | OK, coeso |
| T6 | 1 documento | Granular |
| T7 | 1 função de cliente mais seu parser puro | OK, coeso |
| T8 | 1 função | Granular |
| T9 | 1 componente | Granular |
| T10 | 1 arquivo | Granular |
| T11 | remoção de 3 arquivos irmãos | OK, uma remoção só |

---

## Diagram-Definition Cross-Check

| Task | Depends On (corpo) | Diagrama mostra | Status |
|---|---|---|---|
| T1 | None | início da Phase 1 | Match |
| T2 | T1 | T1 → T2 | Match |
| T3 | T2 | T2 → T3 | Match |
| T4 | T3 | T3 → T4 | Match |
| T5 | T4 | T4 → T5 | Match |
| T6 | T5 | T5 → T6 | Match |
| T7 | T6 | T6 → T7 | Match |
| T8 | T7 | T7 → T8 | Match |
| T9 | T8 | T8 → T9 | Match |
| T10 | T9 | T9 → T10 | Match |
| T11 | T10 | T10 → T11 | Match |

---

## Test Co-location Validation

| Task | Camada criada | Matriz exige | Task declara | Status |
|---|---|---|---|---|
| T1 | módulo puro ob-ads | unit | unit | OK |
| T2 | módulo puro ob-ads | unit | unit | OK |
| T3 | service backend | unit | unit | OK |
| T4 | schema backend | unit | unit | OK |
| T5 | rota, controller, middleware backend | integration | integration | OK |
| T6 | documentação | none | none | OK |
| T7 | módulo puro e service ob-ads | unit | unit | OK |
| T8 | módulo puro ob-ads | unit | unit | OK |
| T9 | componente React ob-ads | none | none | OK |
| T10 | componente React ob-ads | none | none | OK |
| T11 | remoção de arquivo | none | none | OK |
