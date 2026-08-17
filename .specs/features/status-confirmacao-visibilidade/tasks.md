# Visibilidade do Status de Confirmação de Visita — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/status-confirmacao-visibilidade/design.md`
**Status**: Draft

**Repos**: `backend-promotor` (fases 1-2), `ob-ads` (fase 3), `frontend-promotor` (fase 4). Todo caminho `Where` sem prefixo de repo é relativo a `backend-promotor`.

---

## Pré-requisitos de deploy (fora do fluxo de tasks)

Duas verificações que nenhuma task resolve e que precisam de resposta antes do deploy:

1. **ETL sobre `dw.cadastro_empresa`** — confirmar com o DBA se a tabela é destino de carga periódica. Se for, a escrita da fase 1 é desfeita no próximo ciclo e a contingência é reintroduzir precedência de fonte na leitura.
2. **Backfill** — contar `NOTIFICACAO_VISITA` com `ENDERECO_ATUALIZADO = true`. Se houver linhas, elas têm o endereço corrigido só em `MAIN_REGISTER.OFICINA` e precisam de um backfill pontual para o `dw`. O usuário de leitura disponível não tem permissão em `CAMPANHAS_OB`.

---

## Test Coverage Matrix

> Gerada a partir do código, das diretrizes do projeto e da spec — confirmar antes do Execute. Diretrizes encontradas: `jest.config.ts` (backend-promotor), `.specs/codebase/TESTING.md`, `.specs/project/STATE.md`. Nenhum `AGENTS.md` nem `CONTRIBUTING.md`. Sem threshold de cobertura configurado em nenhum dos três repos.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Utilitário puro (backend) | unit | Todos os ramos; 1:1 com as ACs da spec; todo edge case listado | `__tests__/unit/*.test.ts` | `npm run test:unit` |
| Service (backend) | unit | Todos os ramos; 1:1 com as ACs; caminho de erro e rollback cobertos | `__tests__/unit/*.test.ts` | `npm run test:unit` |
| Rota HTTP com comportamento alterado (backend) | integration | Caminho feliz + falha parcial + estado já confirmado, via supertest no banco real | `__tests__/integration/*.test.ts` | `npm run test:integration` |
| Entity / schema Zod (backend) | none | — (só gate de build) | — | só gate de build |
| Função pura de mapeamento (frontends) | unit | Todo valor de status do enum + ausente/desconhecido | `ob-ads`: `**/*.test.{ts,tsx}` · `frontend-promotor`: `**/*.test.ts` | `npm test` no repo |
| Tipos TypeScript (frontends) | none | — (só gate de build) | — | só gate de build |
| Componente React (frontends) | none | — (só gate de build + lint) | — | só gate de build |

Decisão do usuário: componentes ficam no gate de build; o que é testado de verdade nos frontends é a função pura de mapeamento e a preservação do campo no `normalizeRota` — os dois modos de falha silenciosa identificados na revisão do design.

## Gate Check Commands

> Geradas a partir do código — confirmar antes do Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick (backend) | Tasks com teste unitário apenas | `npm run test:unit` |
| Full (backend) | Tasks com teste de integração | `npm run test:unit && npm run test:integration` |
| Build (backend) | Tasks de entity/schema ou fim de fase | `npx tsc --noEmit && npm test` |
| Quick (ob-ads) | Tasks com teste unitário | `npm test` — **quebrado hoje**, ver nota abaixo; passa a valer a partir da T6 |
| Build (ob-ads) | Tasks de tipo/componente | `npm run lint && npm run build` |
| Quick (frontend-promotor) | Tasks com teste unitário (após T12) | `npm test` |
| Build (frontend-promotor) | Tasks de tipo/componente | `npm run lint && npm run build` |

**Nota — jest do `ob-ads` está quebrado antes desta feature**: `jest.config.js` usa `babel-jest` para `.js|.jsx|.ts|.tsx`, mas o repo não tem nenhum arquivo de config do babel (`.babelrc`/`babel.config.js` não existem). Os presets estão no `package.json` e nunca são aplicados, então `npm test` morre no parser: `1 failed, 0 total`. Não há `@babel/preset-typescript` e o `moduleNameMapper` não mapeia o alias `@/`. Decisão do usuário: consertar dentro da T6 com `next/jest` (SWC, resolve TS e o alias). O gate Quick (ob-ads) só é confiável a partir da T6.

**Nota — `npm run lint` do `frontend-promotor` está quebrado antes desta feature**: o script é `next lint`, comando removido no Next 16 (repo em 16.1.6), e `eslint` não está instalado. Ele falha com `Invalid project directory provided, no such directory: .../lint`. Constatado na T12 e reportado, não corrigido. O gate Build (frontend-promotor) vale por `npm run build` a partir da T12.

**Baseline conhecido**: backend-promotor tem 432 testes unitários verdes em 29 suites. Três suítes de integração legadas (`rotaService`, `campanhaPromotorService`, `campanhaResultsService`) já falham no teardown por FK — pré-existente, registrado no `STATE.md`. O gate Full compara contra esse baseline, não contra verde absoluto.

---

## Execution Plan

Fases são ordenadas e rodam em sequência; dentro da fase, as tasks rodam em ordem.

### Phase 1: Escrita do endereço (backend-promotor)

```
T1 → T2
```

### Phase 2: Leitura das campanhas (backend-promotor)

```
T3 → T4
```

### Phase 3: Dashboard (ob-ads)

O tipo da T5 destrava dois ramos: o das telas de rota e o da visão gerencial.

```
T5 → T6 → T7 → T8 → T9
T5 → T10 → T11
```

### Phase 4: App de campo (frontend-promotor)

Runner e tipos são independentes entre si; ambos precisam existir antes do mapper.

```
T12 → T14
T13 → T14 → T15 → T16
```

---

## Task Breakdown

### T1: Criar `dividirLogradouro` ✅

**What**: Função pura que quebra o `ENDERECO` de linha única no par `{ logradouro, rua }` esperado por `dw.cadastro_empresa`.
**Where**: `utils/logradouro.ts`
**Depends on**: None
**Reuses**: padrão de utilitário puro de `utils/telefone.ts`
**Requirement**: VISIB-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `TIPOS_LOGRADOURO` é lista fechada: `rua`, `avenida`, `rodovia`, `estrada`, `travessa`, `alameda`, `praça`, `quadra`
- [x] Primeiro token que casa (sem acento, minúsculo) vira `logradouro`; o resto, com trim, vira `rua`
- [x] Token que não casa, string de uma palavra, string vazia e `null` caem no fallback `logradouro: null` + string inteira em `rua`
- [x] Testes cobrem os 8 tipos, o fallback, uma palavra só, string vazia, `null` e string só com espaços
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 432 + novos testes passam (sem deleção silenciosa)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(visita): dividir logradouro em tipo e nome para o dw`

---

### T2: Gravar o endereço corrigido nas duas tabelas, em transação ✅

**What**: `atualizarEndereco` passa a atualizar `MAIN_REGISTER.OFICINA` e `dw.cadastro_empresa` dentro de uma única transação, com o `ENDERECO` dividido por `dividirLogradouro`.
**Where**: `service/visitaConfirmacaoService.ts`
**Depends on**: T1
**Reuses**: `dividirLogradouro` (T1), entity `Empresa` (`entities/CadastroEmpresa.ts`), guarda de estado `statusEfetivo` já existente, suíte `__tests__/integration/visitaEndereco.test.ts`
**Requirement**: VISIB-07, VISIB-08, VISIB-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Os dois `update` rodam dentro de `AppDataSourceSync.transaction`
- [x] O `update` de `Empresa` usa **propriedades da entity**: `LOGRADOURO` (coluna `logradouro`) e `ENDERECO` (coluna `rua`) — não os nomes das colunas
- [x] `NUMERO`, `COMPLEMENTO`, `BAIRRO`, `CIDADE`, `ESTADO` e `CEP` vão sem transformação para as duas tabelas
- [x] `latitude` e `longitude` de `dw.cadastro_empresa` não são tocadas
- [x] Falha em qualquer um dos dois `update` reverte ambos, devolve `ADDRESS_UPDATE_FAILED` e não confirma a visita
- [x] Oficina sem linha em `dw.cadastro_empresa` não falha a confirmação (0 linhas afetadas não é erro)
- [x] Unit: transação chamada, dois updates com os nomes de propriedade certos, rollback no erro de cada um dos dois updates
- [x] Integração: `PUT /visita/endereco` grava de fato nas duas tabelas e a visita fica `CONFIRMADO`; caso de erro não deixa nenhuma das duas gravada
- [x] Gate check passes: `npm run test:unit && npm run test:integration`
- [x] Test count: novos testes passam; as 3 suítes de integração legadas seguem falhando só no teardown por FK (baseline)

**Tests**: integration
**Gate**: full

**Commit**: `feat(visita): gravar endereco corrigido em OFICINA e cadastro_empresa`

---

### T3: Aplicar `TRIM` nas quatro montagens de endereço ✅

**What**: Trocar `CONCAT(ce.logradouro, ' ', ce.rua)` por `TRIM(CONCAT(COALESCE(ce.logradouro,''), ' ', COALESCE(ce.rua,'')))` nas quatro ocorrências do arquivo.
**Where**: `service/campanhaService.ts`
**Depends on**: None
**Reuses**: as quatro consultas existentes (`:216`, `:265`, `:448`, `:489`)
**Requirement**: VISIB-12, VISIB-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] As quatro ocorrências foram alteradas — as duas principais e as duas dos caminhos de enriquecimento das rotas legadas
- [x] `grep -c "CONCAT(ce.logradouro, ' ', ce.rua)"` no arquivo devolve 0
- [x] `GET /campanha/ativa` continua devolvendo `oficina.LATITUDE` e `oficina.LONGITUDE` (regressão VISIB-05)
- [x] Endereço com `logradouro` nulo volta sem espaço à esquerda
- [x] Integração: suíte `campanhaService` verde no mesmo patamar do baseline
- [x] Gate check passes: `npm run test:unit && npm run test:integration`
- [x] Test count: baseline mantido, nenhum teste removido

**Tests**: integration
**Gate**: full

**Commit**: `fix(campanha): remover espaco a esquerda no endereco montado`

---

### T4: Devolver o status de confirmação na consulta por cliente ✅

**What**: `getCampanhasByClientId` ganha o `LEFT JOIN` em `NOTIFICACAO_VISITA` e passa a anexar `notificacaoVisita` em cada rota montada.
**Where**: `service/campanhaService.ts`
**Depends on**: T3
**Reuses**: `montarNotificacaoVisita` (`:38`), aliases e shape do join de `/campanha/ativa` (`:232`)
**Requirement**: VISIB-01, VISIB-02, VISIB-06, VISIB-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `fullQuery` tem o `LEFT JOIN ... NOTIFICACAO_VISITA nv ON rp."ID_ROTA_PROMOTOR" = nv."ID_ROTA_PROMOTOR"` e as colunas `NOTIFICACAO_STATUS`, `NOTIFICACAO_EXPIRA_EM`, `NOTIFICACAO_CONFIRMADO_EM`
- [x] `legacyQuery` não mudou
- [x] O objeto literal da rota (`:565-593`) recebe `notificacaoVisita` — sem isso a coluna vem do banco e é descartada em silêncio
- [x] `STATUS` devolvido é o efetivo (`statusEfetivo`), não o valor bruto
- [x] Rota sem linha em `NOTIFICACAO_VISITA` omite o campo, não devolve `null`
- [x] Nenhuma consulta adicional por rota foi introduzida — a contagem de queries da função não muda
- [x] Regressão: `RotaPromotorSchema` segue declarando `notificacaoVisita`, então `/openapi.json` continua documentando o campo
- [x] Unit: rota confirmada, rota pendente, rota expirada (efetivo), rota sem notificação e rota legada
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: novos testes passam (sem deleção silenciosa)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(campanha): expor status de confirmacao na consulta por cliente`

---

### T5: Declarar o campo no tipo de rota do vínculo (ob-ads) ✅

**What**: `CampanhaPromotorRota` ganha `notificacaoVisita` opcional.
**Where**: `ob-ads/types/vinculo.ts`
**Depends on**: None
**Reuses**: `NotificacaoVisitaStatusInfoSchema` (`backend-promotor/schemas/rota.ts:221`) como referência da forma
**Requirement**: VISIB-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `notificacaoVisita?: { STATUS: string; CONFIRMADO_EM?: string | null }` declarado
- [x] Opcional, porque rota sem notificação e rota legada não trazem o campo
- [x] Gate check passes: `npm run lint && npm run build`

**Tests**: none
**Gate**: build

**Commit**: `feat(vinculo): declarar status de confirmacao no tipo de rota`

---

### T6: Criar o mapeamento status → indicador (ob-ads) ✅

**What**: Função pura que traduz o status de confirmação nos três estados visuais.
**Where**: `ob-ads/lib/statusConfirmacao.ts`
**Depends on**: T5
**Reuses**: valores de `StatusNotificacaoVisita` (`backend-promotor/entities/NotificacaoVisita.ts:16`)
**Requirement**: VISIB-03, VISIB-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Pré-requisito dentro desta task** (decisão do usuário): o `npm test` do `ob-ads` está quebrado antes desta feature — `babel-jest` sem nenhum arquivo de config do babel, `1 failed, 0 total`. Consertar aqui, com `next/jest`, senão esta task não tem gate. Arquivos extras autorizados só para isso: `ob-ads/jest.config.js`, `ob-ads/jest.setup.js`, `ob-ads/package.json` (dependência).

**Done when**:

- [x] `jest.config.js` migrado para `next/jest`, que resolve TypeScript e o alias `@/` via SWC
- [x] `npm test` volta a executar: o teste existente `app/(dashboard)/dashboard/Email.test.js` roda em vez de morrer no parser
- [x] `CONFIRMADO` → `confirmada`; `PENDENTE`, `ENVIADO`, `DISPENSADO` → `pendente`; `EXPIRADO`, `FALHOU` → `nao-recebe`
- [x] Campo ausente, `undefined` ou status desconhecido → `null` (não renderiza indicador, não vira pendente)
- [x] Testes cobrem os 7 valores do enum, o ausente e um valor desconhecido (`REAGENDADO` cai no caso desconhecido → `null`, coerente com o Out of Scope da spec)
- [x] Gate check passes: `npm test` — suíte nova 10/10 verde
- [ ] Test count: novos testes passam. **O teste pré-existente continua falhando por motivo próprio e não foi tocado**: `@testing-library/react@16` move `@testing-library/dom` para `peerDependencies` e ele nunca foi instalado, então `Email.test.js` morre em `Cannot find module '@testing-library/dom'`. Não é mais erro de parser — o runner está destravado. Instalar essa dependência sujaria o `package-lock.json`, que já tem mudanças pré-existentes não relacionadas; fica reportado em vez de corrigido

**Se `Email.test.js` falhar por motivo próprio depois da migração** (asserção velha, não parser), não conserte nem delete: reporte. O escopo aqui é destravar o runner, não adotar teste alheio.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(dashboard): mapear status de confirmacao para estado visual`

---

### T7: Criar o badge de status de confirmação (ob-ads) ✅

**What**: Componente único usado pelas duas telas, para não divergirem.
**Where**: `ob-ads/app/(dashboard)/dashboard/campanha-para-promotores/components/StatusConfirmacaoBadge.tsx`
**Depends on**: T6
**Reuses**: componentes de badge do design system já usado nessas telas; `mapStatusConfirmacao` (T6)
**Requirement**: VISIB-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Renderiza os três estados de forma visualmente distinta (cor + ícone: emerald/`CheckCircle2`, amber/`Clock`, red/`XCircle`)
- [x] Estado `nao-recebe` é distinto tanto de confirmada quanto de pendente
- [x] `null` do mapeamento não renderiza nada
- [x] Data de confirmação exibida quando `CONFIRMADO_EM` existe; ausente ou inválida cai no rótulo sem data
- [x] Gate check passes: `npm run lint && npm run build`

**Tests**: none
**Gate**: build

**Commit**: `feat(dashboard): criar badge de status de confirmacao`

---

### T8: Exibir o badge na distribuição de rotas (ob-ads) ✅

**What**: Consumir o badge na tela de distribuição de rotas.
**Where**: `ob-ads/app/(dashboard)/dashboard/campanha-para-promotores/components/RotasDistributionSection.tsx`
**Depends on**: T7
**Reuses**: `vinculo.rotasPromotor`, já em mãos no componente
**Requirement**: VISIB-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Badge aparece por rota, alimentado por `rota.notificacaoVisita`. Nota de implementação: esta tela não renderiza uma lista de rotas — a única listagem por rota é a de oficinas (`:696`), então o badge é ligado por `ID_OFICINA` a partir de um índice montado com `vinculo.rotasPromotor`
- [x] Nenhuma chamada de API nova — o dado vem do payload de `GET /campanha/:id` já carregado
- [x] Gate check passes: `npm run lint && npm run build`

**Tests**: none
**Gate**: build

**Commit**: `feat(dashboard): sinalizar confirmacao na distribuicao de rotas`

---

### T9: Exibir o badge na ordenação de visitas (ob-ads) ✅

**What**: Consumir o mesmo badge na tela de ordenação de visitas.
**Where**: `ob-ads/app/(dashboard)/dashboard/campanha-para-promotores/components/RouteOrderingSection.tsx`
**Depends on**: T8
**Reuses**: `StatusConfirmacaoBadge` (T7)
**Requirement**: VISIB-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Badge aparece por rota na listagem ordenada (`manualOrder.map`, `:475`)
- [x] Mesmo componente da T8 — sem cópia de lógica de mapeamento
- [x] Gate check passes: `npm run lint && npm run build`

**Tests**: none
**Gate**: build

**Commit**: `feat(dashboard): sinalizar confirmacao na ordenacao de visitas`

---

### T10: Declarar o campo no tipo da visão gerencial (ob-ads) ✅

**What**: `RotaPromotor` da visão ganha `notificacaoVisita` opcional.
**Where**: `ob-ads/app/(dashboard)/dashboard/campanha-para-promotores/visao/components/types.ts`
**Depends on**: T5
**Reuses**: mesma forma declarada na T5
**Requirement**: VISIB-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `notificacaoVisita?: { STATUS: string; CONFIRMADO_EM?: string | null }` declarado
- [x] Gate check passes: `npm run lint && npm run build`

**Tests**: none
**Gate**: build

**Commit**: `feat(visao): declarar status de confirmacao no tipo de rota`

---

### T11: Contar confirmadas e não confirmadas na visão gerencial (ob-ads) ✅

**What**: KPI de confirmação derivado do payload já carregado.
**Where**: `ob-ads/app/(dashboard)/dashboard/campanha-para-promotores/visao/components/GerencialView.tsx`
**Depends on**: T10
**Reuses**: prop `campanhasDetail`, já percorrida no `useMemo` de métricas
**Requirement**: VISIB-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Contagem de confirmadas e de não confirmadas exibida em dois `KpiCard`
- [x] **Não** reusa `allRotas` — `rotasParaConfirmacao` é travessia própria de `campanhasDetail`, sem filtro de `DONE_AT`. Não confirmadas = total de rotas menos confirmadas, então rota sem notificação conta como não confirmada
- [x] Nenhuma chamada de API nova — deriva de `campanhasDetail`, já carregado por `visao/page.tsx:35`
- [x] Confirmada é decidida por `mapStatusConfirmacao` (T6), não por comparação de string solta, para as duas telas não divergirem
- [x] Gate check passes: `npm run lint && npm run build`

**Tests**: none
**Gate**: build

**Commit**: `feat(visao): exibir taxa de confirmacao da campanha`

---

### T12: Configurar o runner de teste (frontend-promotor) ✅

**What**: Instalar e configurar jest para testar funções puras — sem RTL, sem DOM.
**Where**: `frontend-promotor/jest.config.js`
**Depends on**: None
**Reuses**: `next/jest` (mesma abordagem adotada na T6; NÃO copiar a config babel do `ob-ads`, que estava quebrada)
**Requirement**: VISIB-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `npm test` roda e encontra zero testes sem falhar (`passWithNoTests: true`)
- [x] Script `test` adicionado ao `package.json`; `jest` e `@types/jest` instalados como devDependency
- [x] Sem RTL nem `testEnvironment: jsdom` — só `node`
- [x] Gate check passes: `npm run build` verde. **`npm run lint` está quebrado antes desta feature e não foi consertado**: o script é `next lint`, removido no Next 16 (o repo está no 16.1.6), e `eslint` nem sequer está instalado. O comando falha com `Invalid project directory provided, no such directory: .../lint`. Reportado, não corrigido — consertar o lint é escopo próprio

**Tests**: none
**Gate**: build

**Commit**: `chore(test): configurar jest para funcoes puras`

---

### T13: Declarar o campo nos dois tipos de rota (frontend-promotor) ✅

**What**: `RotaAPI` (forma da API) e `RotaPromotor` (modelo local snake_case) ganham o campo.
**Where**: `frontend-promotor/lib/types.ts`
**Depends on**: None
**Reuses**: convenção do arquivo — `RotaAPI` em SCREAMING_SNAKE, `RotaPromotor` em snake_case
**Requirement**: VISIB-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `RotaAPI` ganha `notificacaoVisita?: { STATUS: string; CONFIRMADO_EM?: string | null }`
- [x] `RotaPromotor` ganha `notificacao_visita?: { status: string; confirmado_em: string | null }`
- [x] Gate check passes: `npm run build` verde; `npm run lint` segue quebrado por motivo pré-existente (ver nota na seção de gates)

**Tests**: none
**Gate**: build

**Commit**: `feat(rota): declarar status de confirmacao nos tipos`

---

### T14: Preservar o campo na normalização da rota (frontend-promotor) ✅

**What**: `normalizeRota` copia o status de confirmação da forma da API para o modelo local.
**Where**: `frontend-promotor/service/campanha.service.ts`
**Depends on**: T12, T13
**Reuses**: `normalizeRota` existente
**Requirement**: VISIB-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `notificacao_visita` preenchido a partir de `notificacaoVisita` da API; `CONFIRMADO_EM` ausente vira `confirmado_em: null`
- [x] Campo ausente na API vira ausente no modelo local, não objeto vazio — spread condicional, a chave nem existe
- [x] Teste: rota confirmada preserva `status` e `confirmado_em`; rota sem o campo não ganha o campo (`service/campanha.service.test.ts`). `normalizeRota` passou a ser exportada para o teste chamar a função pura direto
- [x] Gate check passes: `npm test`
- [x] Test count: 0 → 3 testes, 3 passam

**Tests**: unit
**Gate**: quick

**Commit**: `fix(rota): preservar status de confirmacao na normalizacao`

---

### T15: Criar o mapeamento status → indicador (frontend-promotor) ✅

**What**: Mesma função pura do `ob-ads`, neste repo.
**Where**: `frontend-promotor/lib/statusConfirmacao.ts`
**Depends on**: T14
**Reuses**: mesma tabela de mapeamento da T6 — repos separados não compartilham código, a paridade é garantida por teste
**Requirement**: VISIB-04, VISIB-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Mesmo mapeamento da T6: `CONFIRMADO` → `confirmada`; `PENDENTE`/`ENVIADO`/`DISPENSADO` → `pendente`; `EXPIRADO`/`FALHOU` → `nao-recebe`; ausente/desconhecido → `null`
- [x] Testes cobrem os 7 valores do enum, o ausente e um desconhecido — os mesmos 10 casos da T6
- [x] Gate check passes: `npm test`
- [x] Test count: 3 → 13 testes, 13 passam

**Tests**: unit
**Gate**: quick

**Commit**: `feat(rota): mapear status de confirmacao para estado visual`

---

### T16: Exibir o indicador no carrossel de rotas (frontend-promotor)

**What**: Indicador de confirmação por card de rota.
**Where**: `frontend-promotor/components/route-carousel.tsx`
**Depends on**: T15
**Reuses**: `mapStatusConfirmacao` (T15), estilos de card já existentes
**Requirement**: VISIB-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Card de rota mostra confirmada, pendente e não-recebe de forma distinta
- [ ] Data de confirmação exibida quando existe; ausente não renderiza `null` nem data vazia
- [ ] Rota sem o campo renderiza normalmente, sem indicador
- [ ] Gate check passes: `npm run lint && npm run build`

**Tests**: none
**Gate**: build

**Commit**: `feat(rota): sinalizar confirmacao no carrossel de rotas`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1 → T2
Phase 2:  T3 → T4
Phase 3:  T5 → T6 → T7 → T8 → T9
          T5 → T10 → T11
Phase 4:  T12 → T14
          T13 → T14 → T15 → T16
```

Ordem de execução dentro da fase 3: T5, T6, T7, T8, T9, T10, T11. Dentro da fase 4: T12, T13, T14, T15, T16. Os ramos acima descrevem dependência, não paralelismo — a execução segue estritamente sequencial.

Execução é estritamente sequencial — não há paralelismo dentro da fase.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: `dividirLogradouro` | 1 função pura | ✅ Granular |
| T2: transação de escrita | 1 método de service | ✅ Granular |
| T3: `TRIM` nas consultas | 1 arquivo, 4 ocorrências da mesma expressão | ✅ Granular (coeso) |
| T4: join na consulta por cliente | 1 método de service | ✅ Granular |
| T5: tipo do vínculo | 1 interface | ✅ Granular |
| T6: mapeamento (ob-ads) | 1 função pura | ✅ Granular |
| T7: badge | 1 componente | ✅ Granular |
| T8: distribuição de rotas | 1 componente | ✅ Granular |
| T9: ordenação de visitas | 1 componente | ✅ Granular |
| T10: tipo da visão | 1 interface | ✅ Granular |
| T11: contagem gerencial | 1 componente | ✅ Granular |
| T12: runner de teste | 1 config | ✅ Granular |
| T13: tipos do app | 2 interfaces, mesmo arquivo | ✅ Granular (coeso) |
| T14: `normalizeRota` | 1 função | ✅ Granular |
| T15: mapeamento (frontend-promotor) | 1 função pura | ✅ Granular |
| T16: carrossel | 1 componente | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (corpo) | Diagrama mostra | Status |
| --- | --- | --- | --- |
| T1 | None | início da fase 1 | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | None | início da fase 2 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | None | início da fase 3 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T5 | T5 → T10 | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |
| T12 | None | início da fase 4 | ✅ Match |
| T13 | None | início da fase 4 (ramo próprio) | ✅ Match |
| T14 | T12, T13 | T12 → T14 e T13 → T14 | ✅ Match |
| T15 | T14 | T14 → T15 | ✅ Match |
| T16 | T15 | T15 → T16 | ✅ Match |

Nenhuma dependência aponta para fase posterior.

---

## Test Co-location Validation

| Task | Camada criada/alterada | Matriz exige | Task diz | Status |
| --- | --- | --- | --- | --- |
| T1 | Utilitário puro (backend) | unit | unit | ✅ OK |
| T2 | Service + rota HTTP com comportamento alterado | integration (mais alto) | integration | ✅ OK |
| T3 | Service + rota HTTP com comportamento alterado | integration | integration | ✅ OK |
| T4 | Service (backend) | unit | unit | ✅ OK |
| T5 | Tipos TypeScript | none | none | ✅ OK |
| T6 | Função pura de mapeamento | unit | unit | ✅ OK |
| T7 | Componente React | none | none | ✅ OK |
| T8 | Componente React | none | none | ✅ OK |
| T9 | Componente React | none | none | ✅ OK |
| T10 | Tipos TypeScript | none | none | ✅ OK |
| T11 | Componente React | none | none | ✅ OK |
| T12 | Config | none | none | ✅ OK |
| T13 | Tipos TypeScript | none | none | ✅ OK |
| T14 | Função pura de mapeamento | unit | unit | ✅ OK |
| T15 | Função pura de mapeamento | unit | unit | ✅ OK |
| T16 | Componente React | none | none | ✅ OK |
