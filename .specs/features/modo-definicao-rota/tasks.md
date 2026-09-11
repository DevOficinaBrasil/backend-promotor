# Modo Definição de Rota com Agenda por Dia — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path.

**If the skill cannot be activated, STOP and tell the user.**

---

**Design**: `.specs/features/modo-definicao-rota/design.md`
**Status**: Approved

**Pré-requisito:** a feature `importador-oficinas-de-para` precisa estar concluída antes desta.
As duas editam `ob-ads/.../wizard/StepPromotores.tsx`.

---

## Test Coverage Matrix

> Gerada a partir do código, de `.specs/codebase/TESTING.md` e das specs. Guidelines encontradas: `.specs/codebase/TESTING.md`, `jest.config.ts` (backend), `jest.config.js` (ob-ads e frontend-promotor).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
|---|---|---|---|---|
| Backend service (lógica de domínio) | unit | Todos os ramos; 1:1 com as ACs; todo edge case listado | `__tests__/unit/*.test.ts` | `npm run test:unit` |
| Backend leitura com SQL bruto | unit | Além das linhas devolvidas, o próprio texto do SQL: colunas, conversão de fuso e ordenação | `__tests__/unit/*.test.ts` | `npm run test:unit` |
| Backend rota + controller | integration HTTP-level | Toda rota da task: caminho feliz, cada edge case e cada caminho de erro | `__tests__/integration/*.test.ts` | `npx jest __tests__/integration/<suite>.test.ts` |
| Backend entity / SQL de migration | none | Apenas build gate | - | - |
| ob-ads módulo puro (sem JSX) | unit | Todos os ramos + edge cases | `<mesma pasta>/*.test.js` | `npx jest --env=node <padrão>` |
| ob-ads componente React (JSX) | none | Não executável neste ambiente | - | verificação manual |
| frontend-promotor módulo puro | unit | Todos os ramos + edge cases | `lib/*.test.ts` | `npx jest` |
| frontend-promotor componente React | none | Jest do repositório roda em ambiente `node`, sem jsdom nem RTL | - | verificação manual |

**Por que componente React é `none` nos dois frontends:** em `ob-ads`, o binding nativo de
`node_modules/canvas` está quebrado neste checkout e o ambiente `jsdom` o carrega na inicialização,
derrubando 38 das 41 suítes; o contorno `--env=node` só serve para função pura. Em
`frontend-promotor`, o próprio `jest.config.js` declara ambiente `node` e diz, em comentário, que só
função pura é testada ali. Por isso toda regra testável destas tasks vive em módulo puro.

**Lição L-004 aplicada:** a task que muda a query de `getActiveCampanhaByPromotor` afirma também o
texto do SQL. Linhas alimentadas à mão no mock provam o mapeador, nunca a query.

**Lição L-002 aplicada:** a rota nova monta `validateSchema`; ganha suíte HTTP-level própria.

## Gate Check Commands

| Gate Level | When to Use | Command |
|---|---|---|
| quick-backend | Task com teste unitário no `backend-promotor` | `npm run test:unit` |
| full-backend | Task que registra ou altera rota no `backend-promotor` | `npm run test:unit` e depois `npx jest __tests__/integration/rotaAgenda.test.ts` |
| build-backend | Task de entity, SQL ou documentação no `backend-promotor` | `npx tsc --noEmit` e depois `npm run test:unit` |
| quick-obads | Task com módulo puro no `ob-ads` | `npx jest --env=node <padrão do arquivo>` |
| build-obads | Task de componente no `ob-ads` | `npx tsc --noEmit` |
| quick-front | Task com módulo puro no `frontend-promotor` | `npx jest` |
| build-front | Task de componente no `frontend-promotor` | `npx jest` (o `tsc` do repositório já tem 34 erros pré-existentes, todos de tipos de teste ausentes) |

**Baseline do `backend-promotor` no início desta feature:** 3 suítes vermelhas. Duas delas,
`campanhaService` e `campanhaServiceVisita`, são consertadas em T2 porque esta feature mexe
justamente no método que elas cobrem. A terceira, `segmentacaoCampanhaPromotor`, importa módulos
apagados e está fora do escopo. Gate ao fim: **apenas `segmentacaoCampanhaPromotor` vermelha.**

---

## Execution Plan

Execução é estritamente sequencial, então `Depends on` de cada task é a task imediatamente
anterior. O acoplamento real está descrito em **Reuses** e no corpo de cada task.

### Phase 1: Fundação do dia da visita

```
T1 → T2
```

### Phase 2: Agenda, otimização por dia e leitura do app

```
T2 → T3 → T4 → T5 → T6 → T7
```

### Phase 3: App do promotor

```
T7 → T8 → T9 → T10
```

### Phase 4: Modo definição de rota no dashboard

```
T10 → T11 → T12 → T13 → T14 → T15 → T16 → T17
```

---

## Task Breakdown

### T1: Criar a coluna do dia da visita

**What**: escrever a migration SQL que adiciona `DATA_VISITA`, o índice de busca por dia e o índice único de ordem por dia, e declarar a coluna na entidade.
**Where**: `backend-promotor/scripts/migration-data-visita-rota.sql`
**Depends on**: None
**Reuses**: padrão dos demais `scripts/migration-*.sql`, todos aplicados à mão
**Requirement**: AGENDA-01, AGENDA-06

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] A migration adiciona `DATA_VISITA DATE NULL`, idempotente com `IF NOT EXISTS`
- [ ] Índice de busca por `ID_CAMPANHA_PROMOTOR` e `DATA_VISITA`, limitado a linhas não apagadas
- [ ] Índice único parcial em `ID_CAMPANHA_PROMOTOR`, `DATA_VISITA`, `ORDEM`, só quando há data
- [ ] `entities/RotaPromotor.ts` declara a coluna como `date` anulável
- [ ] Gate passa: `npx tsc --noEmit` e `npm run test:unit`

**Tests**: none
**Gate**: build-backend

**Commit**: `feat(rota): add the planned visit date column`

---

### T2: Consertar as fixtures da campanha ativa

**What**: acrescentar `STATUS: 'PUBLICADA'` às campanhas de teste que o filtro de publicação passou a exigir, devolvendo as duas suítes ao verde.
**Where**: `backend-promotor/__tests__/unit/campanhaServiceVisita.test.ts`
**Depends on**: T1
**Reuses**: fixtures já existentes nas duas suítes
**Requirement**: AGENDA-02

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `campanhaService.test.ts` e `campanhaServiceVisita.test.ts` ficam verdes
- [ ] Nenhuma asserção é enfraquecida ou removida — só a fixture ganha o campo que o código passou a exigir
- [ ] Gate passa: `npm run test:unit`, com `segmentacaoCampanhaPromotor` como única suíte vermelha
- [ ] Contagem: 12 testes que falhavam passam a passar

**Tests**: unit
**Gate**: quick-backend

**Commit**: `test(campanha): restore the active-campaign fixtures to the published filter`

---

### T3: Agendar visitas de um dia

**What**: criar `RotaService.agendarVisitas`, gravando dia e ordem numa transação de duas fases.
**Where**: `backend-promotor/service/rotaService.ts`
**Depends on**: T2
**Reuses**: `getRotaRepo`, `getCampanhaPromotorRepo`, `AppDataSourceSync.transaction`
**Requirement**: AGENDA-03, AGENDA-04, AGENDA-05, AGENDA-07, AGENDA-08, AGENDA-09

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Grava `DATA_VISITA` e `ORDEM` 1..N na sequência recebida
- [ ] Data fora do período da campanha rejeita sem escrever nada
- [ ] Rota concluída ou cancelada na lista rejeita o lote inteiro
- [ ] Rota de outro vínculo na lista rejeita o lote inteiro
- [ ] A ordem é zerada antes de ser regravada, para não colidir com o índice único
- [ ] Data nula limpa `DATA_VISITA` e `ORDEM` das rotas informadas
- [ ] Reenviar a mesma agenda produz o mesmo estado final
- [ ] Falha no meio reverte a transação inteira
- [ ] Gate passa: `npm run test:unit`
- [ ] Contagem: pelo menos 14 testes novos

**Tests**: unit
**Gate**: quick-backend

**Commit**: `feat(rota): schedule a promoter's visits for a given day`

---

### T4: Impedir proximidade quando existe agenda

**What**: recusar a estratégia por GPS quando o vínculo já tem visita agendada, porque ela apaga a ordem de todos os dias.
**Where**: `backend-promotor/service/rotaService.ts`
**Depends on**: T3
**Reuses**: `reorderRotas` existente
**Requirement**: AGENDA-11

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Com qualquer rota do vínculo tendo `DATA_VISITA`, a estratégia por proximidade é recusada
- [ ] Nenhuma `ORDEM` é limpa quando a recusa acontece
- [ ] Sem nenhuma rota agendada, o comportamento atual é preservado bit a bit
- [ ] A estratégia manual continua aceita mesmo com agenda
- [ ] Gate passa: `npm run test:unit`
- [ ] Contagem: pelo menos 4 testes novos

**Tests**: unit
**Gate**: quick-backend

**Commit**: `feat(rota): refuse GPS ordering while a day agenda exists`

---

### T5: Otimizar a rota de um dia

**What**: aceitar um dia opcional em `optimizeAndSaveRoute`, restringindo o cálculo e a escrita àquele dia.
**Where**: `backend-promotor/service/rotaService.ts`
**Depends on**: T4
**Reuses**: `utils/routeOptimizer.ts`, `fetchOSRMRoute`, a transação de duas fases de T3
**Requirement**: OTIM-02, OTIM-04, OTIM-05, OTIM-06, OTIM-07

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Com um dia informado, só as rotas daquele dia entram no cálculo
- [ ] A ordem de rotas de outros dias não muda
- [ ] Com um dia informado, `ID_OFICINA_INICIO` e `ID_OFICINA_FIM` do vínculo não são escritos
- [ ] Sem dia informado, o comportamento atual é preservado bit a bit
- [ ] Oficina do dia sem coordenada rejeita, nomeando a oficina, sem alterar ordem
- [ ] Falha do serviço de geometria não impede persistir a ordem
- [ ] Gate passa: `npm run test:unit`
- [ ] Contagem: pelo menos 8 testes novos

**Tests**: unit
**Gate**: quick-backend

**Commit**: `feat(rota): optimize a single day's route`

---

### T6: Expor a rota de agenda

**What**: declarar o schema do corpo, o controller e registrar `PUT /rota/agenda`, além de aceitar o dia opcional em `POST /rota/optimize`.
**Where**: `backend-promotor/routes/RotaRoute.ts`
**Depends on**: T5
**Reuses**: `createDocumentedRoute`, padrão de `__tests__/integration/oficinaImportStream.test.ts`
**Requirement**: AGENDA-03, AGENDA-04, AGENDA-05, OTIM-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Corpo fora do schema responde 400 sem tocar o serviço
- [ ] Data fora do período responde 422
- [ ] Visita já concluída na lista responde 409
- [ ] Caminho feliz responde 200 com o estado resultante
- [ ] `POST /rota/optimize` aceita `DATA_VISITA` opcional e repassa ao serviço
- [ ] Suíte HTTP-level cobre cada um desses caminhos
- [ ] Gate passa: `npm run test:unit` e `npx jest __tests__/integration/rotaAgenda.test.ts`
- [ ] Contagem: pelo menos 10 testes na suíte nova

**Tests**: integration
**Gate**: full-backend

**Commit**: `feat(rota): add the visit agenda endpoint`

---

### T7: Recortar o que o promotor enxerga

**What**: incluir o dia na leitura da campanha ativa, filtrar por visibilidade, ordenar por dia e devolver a data de referência.
**Where**: `backend-promotor/service/campanhaService.ts`
**Depends on**: T6
**Reuses**: query bruta já existente em `getActiveCampanhaByPromotor`
**Requirement**: APP-01, APP-02, APP-03, APP-04, APP-05, APP-06

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Rota não concluída com dia igual ao corrente entra na lista
- [ ] Rota não concluída com dia anterior ao corrente entra na lista
- [ ] Rota não concluída sem dia entra na lista
- [ ] Rota não concluída com dia posterior ao corrente fica de fora
- [ ] Só rota concluída ou cancelada no dia corrente, no fuso de São Paulo, entra
- [ ] `DATA_VISITA` aparece em cada rota devolvida, e `DATA_REFERENCIA` no envelope
- [ ] O teste afirma o texto do SQL: a coluna no `SELECT`, a conversão de UTC para São Paulo e a ordenação por dia
- [ ] O filtro de confirmação de visita que já existia continua valendo
- [ ] Gate passa: `npm run test:unit`
- [ ] Contagem: pelo menos 10 testes novos

**Tests**: unit
**Gate**: quick-backend

**Commit**: `feat(campanha): scope the promoter route list to the day`

---

### T8: Separar atrasadas, de hoje e sem data

**What**: criar o módulo puro que particiona e ordena as visitas pendentes do app de campo.
**Where**: `frontend-promotor/lib/visitas.ts`
**Depends on**: T7
**Reuses**: `lib/haversine.ts`
**Requirement**: APP-07, APP-08, APP-09, APP-10

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Particiona em atrasadas, de hoje e sem data, a partir da data de referência recebida
- [ ] Atrasadas vêm primeiro, da mais antiga para a mais recente
- [ ] As de hoje vêm em seguida, por ordem
- [ ] As sem data vêm por último, pela estratégia vigente
- [ ] A estratégia por GPS ordena só o grupo sem data
- [ ] Nenhuma leitura de relógio dentro do módulo: a data de referência é sempre um parâmetro
- [ ] Gate passa: `npx jest`
- [ ] Contagem: pelo menos 12 testes

**Tests**: unit
**Gate**: quick-front

**Commit**: `feat(promotor): partition pending visits by day`

---

### T9: Levar o dia até o app

**What**: declarar o dia da visita e a data de referência nos tipos, e mapeá-los na normalização da rota.
**Where**: `frontend-promotor/service/campanha.service.ts`
**Depends on**: T8
**Reuses**: `normalizeRota` e os tipos de `lib/types.ts`
**Requirement**: APP-06

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] O tipo da rota da API e o do app carregam o dia da visita
- [ ] A resposta da campanha ativa carrega a data de referência
- [ ] `normalizeRota` mapeia o dia, e ausência vira nulo em vez de indefinido
- [ ] A data de referência cai para a data local só quando o servidor não a manda, cobrindo uma API antiga
- [ ] `campanha.service.test.ts` cobre o campo novo sem alterar as asserções existentes
- [ ] Gate passa: `npx jest`
- [ ] Contagem: pelo menos 4 testes novos

**Tests**: unit
**Gate**: quick-front

**Commit**: `feat(promotor): carry the visit day through the API mapping`

---

### T10: Mostrar as visitas do dia e as atrasadas

**What**: separar a tela em atrasadas e de hoje, marcar a atrasada com a data original, e deixar o histórico só com o dia corrente.
**Where**: `frontend-promotor/components/home-screen.tsx`
**Depends on**: T9
**Reuses**: `lib/visitas.ts`, `RouteCarousel`, seções já existentes
**Requirement**: APP-07, APP-11

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] A ordenação e a partição vêm do módulo puro, sem regra duplicada no componente
- [ ] Visita atrasada aparece marcada, com a data para a qual estava agendada
- [ ] Sem nenhuma visita pendente, a tela mostra um estado vazio dizendo que não há visitas para hoje
- [ ] O histórico do dia continua listando o que o backend devolveu, agora já recortado
- [ ] Gate passa: `npx jest`

**Tests**: none
**Gate**: build-front

**Commit**: `feat(promotor): show today's visits and the overdue ones`

---

### T11: Levar o dia até os serviços do dashboard

**What**: extrair a busca de geometria do OSRM para um serviço próprio e acrescentar as chamadas de agenda e de otimização por dia.
**Where**: `ob-ads/service/vinculoService.ts`
**Depends on**: T10
**Reuses**: `fetchOSRMRouteClient` de `RouteOrderingSection.tsx`, `optimizeRoute` e `reorderRotas` existentes
**Requirement**: DIA-08, OTIM-02

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `service/osrmService.ts` expõe a busca de geometria, com o mesmo comportamento de hoje
- [ ] `agendarVisitas` envia vínculo, data, lista ordenada e rotas a desagendar
- [ ] `optimizeRoute` aceita o dia opcional
- [ ] Teste cobre o serviço de geometria: resposta boa, resposta ruim e menos de dois pontos
- [ ] Gate passa: `npx jest --env=node osrmService`
- [ ] Contagem: pelo menos 5 testes

**Tests**: unit
**Gate**: quick-obads

**Commit**: `feat(ob-ads): add agenda and per-day optimize to the vinculo service`

---

### T12: Gerar os dias da campanha

**What**: criar o módulo puro que lista os dias do período da campanha e conta as visitas de cada um.
**Where**: `ob-ads/app/(dashboard)/dashboard/campanha-para-promotores/components/wizard/agendaCalendario.ts`
**Depends on**: T11
**Reuses**: nada — sem biblioteca de data nova
**Requirement**: DIA-01, DIA-02, DIA-07

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Lista todos os dias entre início e fim, inclusive os dois extremos
- [ ] Sábado e domingo entram na lista
- [ ] Período invertido ou sem data devolve lista vazia
- [ ] A contagem por dia sai de um mapa de rota para dia
- [ ] Trabalha com a data no calendário local, sem deslocamento de fuso
- [ ] Gate passa: `npx jest --env=node agendaCalendario`
- [ ] Contagem: pelo menos 10 testes

**Tests**: unit
**Gate**: quick-obads

**Commit**: `feat(ob-ads): generate the campaign's schedulable days`

---

### T13: Guardar a agenda em edição

**What**: criar o módulo puro que mantém o dia de cada rota durante a edição, derivando disponíveis, agendadas do dia e o que falta salvar.
**Where**: `ob-ads/app/(dashboard)/dashboard/campanha-para-promotores/components/wizard/modoDefinicaoRotaState.ts`
**Depends on**: T12
**Reuses**: nada
**Requirement**: DIA-03, DIA-04, DIA-05, DIA-06, DIA-10, MODO-06, MODO-09

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Disponíveis são só as rotas sem nenhum dia
- [ ] Agendar em um dia tira a rota das disponíveis de todos os outros dias
- [ ] Remover de um dia devolve a rota às disponíveis
- [ ] Reordenar dentro do dia preserva a sequência escolhida
- [ ] Só rotas não concluídas e não canceladas entram nas listas
- [ ] O módulo sabe dizer se há alteração pendente em relação ao estado do servidor
- [ ] Gate passa: `npx jest --env=node modoDefinicaoRotaState`
- [ ] Contagem: pelo menos 14 testes

**Tests**: unit
**Gate**: quick-obads

**Commit**: `feat(ob-ads): model the in-progress day agenda`

---

### T14: Construir o drawer do modo

**What**: criar o painel com calendário, listas do dia, reordenação, seleção de início e fim, cálculo e salvamento.
**Where**: `ob-ads/app/(dashboard)/dashboard/campanha-para-promotores/components/wizard/ModoDefinicaoRota.tsx`
**Depends on**: T13
**Reuses**: interações de arrastar e das setas de `RouteOrderingSection.tsx`, `agendaCalendario.ts`, `modoDefinicaoRotaState.ts`, tokens de `wizard-theme.ts`
**Requirement**: MODO-05, MODO-07, MODO-08, MODO-11, DIA-03, DIA-07, DIA-08, DIA-09, DIA-10, OTIM-01, OTIM-03, OTIM-08

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] O drawer identifica qual promotor está sendo editado
- [ ] O calendário marca a contagem de visitas por dia
- [ ] As duas listas do dia permitem agendar, remover e reordenar
- [ ] Início e fim são escolhidos entre as oficinas do dia, e o cálculo fica desabilitado sem os dois
- [ ] Ao reabrir um dia já ordenado, início e fim vêm da menor e da maior ordem daquele dia
- [ ] Salvar envia uma requisição só, com a data, a lista ordenada e as rotas a desagendar
- [ ] Falha ao salvar mantém a lista como estava e mostra o motivo
- [ ] Alteração pendente é sinalizada na tela
- [ ] Gate passa: `npx tsc --noEmit` no `ob-ads`

**Tests**: none
**Gate**: build-obads

**Commit**: `feat(ob-ads): add the route definition drawer`

---

### T15: Desenhar o trajeto do dia no mapa

**What**: acrescentar ao mapa uma camada opcional com a linha do trajeto e marcadores numerados do dia selecionado.
**Where**: `ob-ads/app/(dashboard)/dashboard/campanha-para-promotores/components/wizard/WizardMap.tsx`
**Depends on**: T14
**Reuses**: o padrão de grupos de camadas separados que o arquivo já adota
**Requirement**: MODO-07, OTIM-06, OTIM-09

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] A camada nova é opcional e não altera as camadas de raio e de oficinas
- [ ] Com geometria do serviço de rotas, desenha o traçado por ruas
- [ ] Sem geometria, desenha a ligação reta entre os pontos
- [ ] Os marcadores do dia mostram a posição na ordem
- [ ] Mudar a ordem redesenha a linha
- [ ] Gate passa: `npx tsc --noEmit` no `ob-ads`

**Tests**: none
**Gate**: build-obads

**Commit**: `feat(ob-ads): draw the selected day's route on the map`

---

### T16: Abrir o modo pelo canto do mapa

**What**: acrescentar o botão do modo à pilha do canto inferior direito e ligar seu estado ao promotor expandido.
**Where**: `ob-ads/app/(dashboard)/dashboard/campanha-para-promotores/components/wizard/CampanhaWizard.tsx`
**Depends on**: T15
**Reuses**: a pilha que já hospeda a dica e a legenda, `selectedVinculoId` já existente
**Requirement**: MODO-01, MODO-02, MODO-03, MODO-04

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] O botão aparece acima da dica e da legenda, no canto inferior direito
- [ ] Fica desabilitado sem promotor expandido
- [ ] Fica habilitado com um promotor já vinculado expandido
- [ ] Fica desabilitado com um promotor ainda em rascunho expandido
- [ ] Abrir o modo passa o vínculo e a campanha ao drawer
- [ ] Gate passa: `npx tsc --noEmit` no `ob-ads`

**Tests**: none
**Gate**: build-obads

**Commit**: `feat(ob-ads): add the route definition mode button to the map`

---

### T17: Retirar a ordenação antiga do card

**What**: remover o botão de ordenar rotas e o modal que ele abria, agora substituídos pelo modo.
**Where**: `ob-ads/app/(dashboard)/dashboard/campanha-para-promotores/components/wizard/StepPromotores.tsx`
**Depends on**: T16
**Reuses**: nada
**Requirement**: MODO-10

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] O botão de ordenar sai dos cards de promotor
- [ ] O modal de ordenação não é mais montado pelo passo
- [ ] Nenhuma referência pendente sobra no arquivo
- [ ] Gate passa: `npx tsc --noEmit` no `ob-ads`

**Tests**: none
**Gate**: build-obads

**Commit**: `refactor(ob-ads): drop the per-card route ordering button`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1 ------→ T2
Phase 2:  T2 ------→ T3 ------→ T4 ------→ T5 ------→ T6 ------→ T7
Phase 3:  T7 ------→ T8 ------→ T9 ------→ T10
Phase 4:  T10 -----→ T11 -----→ T12 -----→ T13 -----→ T14 -----→ T15 -----→ T16 -----→ T17
```

Execução estritamente sequencial, uma task por vez.

---

## Task Granularity Check

| Task | Scope | Status |
|---|---|---|
| T1 | 1 migration mais a coluna na entidade | OK, coeso |
| T2 | fixtures de 2 suítes irmãs | OK, uma correção só |
| T3 | 1 método de serviço | Granular |
| T4 | 1 guarda num método existente | Granular |
| T5 | 1 método estendido | Granular |
| T6 | 1 rota mais seu schema e controller | OK, coeso |
| T7 | 1 método de leitura | Granular |
| T8 | 1 módulo puro | Granular |
| T9 | tipos mais o mapeador | OK, coeso |
| T10 | 1 componente | Granular |
| T11 | 1 serviço extraído mais 2 chamadas | OK, coeso |
| T12 | 1 módulo puro | Granular |
| T13 | 1 módulo puro | Granular |
| T14 | 1 componente | Granular |
| T15 | 1 camada num componente | Granular |
| T16 | 1 botão e seu estado | Granular |
| T17 | 1 remoção | Granular |

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
| T12 | T11 | T11 → T12 | Match |
| T13 | T12 | T12 → T13 | Match |
| T14 | T13 | T13 → T14 | Match |
| T15 | T14 | T14 → T15 | Match |
| T16 | T15 | T15 → T16 | Match |
| T17 | T16 | T16 → T17 | Match |

---

## Test Co-location Validation

| Task | Camada criada | Matriz exige | Task declara | Status |
|---|---|---|---|---|
| T1 | entity e SQL de migration | none | none | OK |
| T2 | teste de serviço backend | unit | unit | OK |
| T3 | service backend | unit | unit | OK |
| T4 | service backend | unit | unit | OK |
| T5 | service backend | unit | unit | OK |
| T6 | rota e controller backend | integration | integration | OK |
| T7 | leitura com SQL bruto | unit | unit | OK |
| T8 | módulo puro frontend-promotor | unit | unit | OK |
| T9 | módulo puro frontend-promotor | unit | unit | OK |
| T10 | componente React frontend-promotor | none | none | OK |
| T11 | módulo puro e service ob-ads | unit | unit | OK |
| T12 | módulo puro ob-ads | unit | unit | OK |
| T13 | módulo puro ob-ads | unit | unit | OK |
| T14 | componente React ob-ads | none | none | OK |
| T15 | componente React ob-ads | none | none | OK |
| T16 | componente React ob-ads | none | none | OK |
| T17 | componente React ob-ads | none | none | OK |
