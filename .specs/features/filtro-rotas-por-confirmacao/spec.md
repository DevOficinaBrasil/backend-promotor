# Filtro de Rotas por Status de Confirmação — Specification

**Depende de:** `status-confirmacao-visibilidade` (VISIB-*, entregue) e `notificacao-visita-confirmacao` (NOTIF-*, entregue).
**Repos no escopo:** `backend-promotor` apenas.
**Escopo:** Medium — uma consulta filtrada + um predicado puro. Design e tasks formais dispensados.

## Problem Statement

A confirmação de visita já é coletada e exibida, mas o app de campo lista **toda** rota atribuída ao promotor, inclusive as que ainda estão esperando resposta da oficina. O promotor sai para uma visita que ninguém confirmou e, quando o envio falhou ou foi suprimido, a visita fica parada sem que ele saiba se pode ir. A lista deve conter só oficinas cuja confirmação já está resolvida — confirmada, dispensada ou com falha de entrega — porque nesses três casos não há mais nada a aguardar.

## Goals

- [ ] `GET /campanha/ativa` devolve, entre as rotas ainda não trabalhadas, apenas as de confirmação resolvida (`CONFIRMADO`, `DISPENSADO`, `FALHOU`) e as que nunca tiveram pedido de confirmação.
- [ ] Rota já trabalhada (check-in feito, finalizada ou cancelada) continua na resposta, qualquer que seja o status de notificação.
- [ ] As consultas que alimentam o `ob-ads` seguem devolvendo todas as rotas, sem nenhuma mudança.
- [ ] Nenhuma consulta adicional por rota; a contagem de queries de `GET /campanha/ativa` não muda.

## Estado atual verificado

Levantado no código, não presumido:

| Fato | Onde |
| --- | --- |
| Sete valores de status existem: `PENDENTE`, `ENVIADO`, `FALHOU`, `DISPENSADO`, `CONFIRMADO`, `EXPIRADO`, `REAGENDADO` | `entities/NotificacaoVisita.ts:16-24` |
| `EXPIRADO` é derivado, nunca gravado: `ENVIADO` + `EXPIRA_EM` no passado | `utils/statusNotificacaoVisita.ts:24-30` |
| `REAGENDADO` é reservado — nenhum código escreve ou lê | `entities/NotificacaoVisita.ts:23` |
| `DISPENSADO` é supressão deliberada (anti-spam / endereço recém-atualizado), não falha | `service/notificacaoVisitaService.ts:618-630` |
| `FALHOU` é falha terminal de entrega, depois das tentativas do outbox | `service/outboxNotificacaoService.ts:388` |
| `EXPIRA_EM` = fim da campanha, ou `+168h` se a campanha não tem fim | `service/notificacaoVisitaService.ts:482-483` |
| Consulta do app: duas queries (nova com `LEFT JOIN NOTIFICACAO_VISITA`, legada join-free) unidas por `queryBothAndMerge`; status efetivo aplicado no map | `service/campanhaService.ts:169`, `:215`, `:243`, `:250`, `:291`, `:43` |
| Consumidor único da consulta: `GET /campanha/ativa` → app do promotor | `controllers/campanhaController.ts:165`, `routes/CampanhaRoute.ts:143` |
| Status de rota: `BACKLOG`, `A CAMINHO`, `EM ANDAMENTO`, `FINALIZADO`, `CANCELADO` | `entities/RotaPromotor.ts:19-25` |
| O app usa a mesma lista para carrossel ativo, histórico de concluídas e contador `X/Y` | `frontend-promotor/components/home-screen.tsx:96`, `:120`, `:283` |

## Consequências aceitas

Declaradas porque são efeito direto das decisões, não defeitos a corrigir depois:

1. **Oficina que recebeu o link e não respondeu nunca aparece para o promotor.** `EXPIRA_EM` é o fim da campanha, então `ENVIADO` só vira `EXPIRADO` quando a campanha acaba — e `EXPIRADO` também fica escondido. Na prática, silêncio da oficina significa visita não realizada. Decisão do usuário.
2. **O denominador do progresso do app diminui.** `rotas.length` (`home-screen.tsx:283`) passa a contar só o que chega filtrado; a % de conclusão sobe em relação a hoje para o mesmo trabalho feito.
3. **O estado vazio do app não distingue os dois casos.** Promotor sem rota atribuída e promotor com todas as rotas escondidas veem a mesma tela ("Sem visitas no momento! / Você não tem visitas agendadas", com check verde — `frontend-promotor/components/route-carousel.tsx:115-140`). Decisão do usuário: feature fica só no backend.

## Out of Scope

| Item | Razão |
| --- | --- |
| Qualquer mudança no `ob-ads` | Decisão explícita do usuário: `GET /campanha/:id` e `GET /campanha/client/:clientId` seguem devolvendo tudo. O operador precisa ver o pendente para remanejar, e a visão gerencial conta em cima do total. |
| Copy nova ou contagem no estado vazio do app | Decisão do usuário — mantém o estado vazio atual. Exigiria campo novo no payload; fica como task futura junto da consequência nº 3. |
| Reenvio / nova tentativa de notificação para destravar rota `ENVIADO` | Outro problema (a rota some, não é reenviada). Escopo próprio. |
| Definir semântica de `REAGENDADO` | Valor reservado sem código; não se inventa significado (NOTIF-26). |
| Filtro configurável por campanha ou por cliente | Não pedido. A regra é global. |
| Autenticação de `/campanha/*` | Ausente hoje (`middlewares: []`), risco pré-existente registrado em `STATE.md`. Esta feature não muda exposição. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Estados que aparecem na lista | `CONFIRMADO`, `DISPENSADO`, `FALHOU` | Escolha do usuário entre três opções apresentadas; nos três casos não há mais resposta a esperar | y |
| Estados que não aparecem | `PENDENTE`, `ENVIADO`, `EXPIRADO`, `REAGENDADO` | Mesma decisão; `EXPIRADO` incluído com a consequência nº 1 declarada e aceita | y |
| Rota sem linha em `NOTIFICACAO_VISITA` | Aparece | Nunca houve pedido, logo não há nada a aguardar. `NOTIFICACAO_VISITA` está vazia em produção — esconder essas rotas esvaziaria a lista de todo promotor | y |
| Rota com status diferente de `BACKLOG` | Aparece sempre, sem olhar a notificação | Sem isso, o promotor faz check-in numa rota `ENVIADO`, dá refresh e a oficina desaparece no meio da visita; e visitas concluídas sairiam do histórico | y |
| Status fora do enum (valor novo no banco) | Não aparece, mesma regra do `REAGENDADO` | Erra para o lado de não mandar o promotor a uma visita cujo estado o sistema não sabe interpretar | y |
| Onde filtrar | Backend, só em `GET /campanha/ativa` | Único consumidor é o app; mantém o `ob-ads` intocado por construção, não por convenção | y |
| Estado vazio do app | Mantém o texto atual | Decisão do usuário; consequência nº 3 declarada | y |
| Filtro em JS no service, não no `WHERE` do SQL | JS, depois do `queryBothAndMerge`, em cima do status efetivo | `EXPIRADO` é derivado por `statusEfetivo()`; replicar a regra de expiração no SQL criaria uma segunda fonte de verdade para a mesma decisão. A lista de uma campanha é pequena (rotas de um promotor), então não há ganho de I/O que justifique a duplicação | n |
| Rota cuja coluna `STATUS` vem `NULL` ou ausente | Conta como `BACKLOG`, logo é filtrável | A coluna tem `default BACKLOG` no banco (`entities/RotaPromotor.ts:47`): linha sem status é rota que ninguém começou | y |
| Dois testes existentes afirmam o contrato antigo do app (`campanhaServiceVisita.test.ts:89` e `:145`, rotas `ENVIADO` voltando na lista) | Reescrever para o contrato novo; a asserção de status efetivo por rota migra para as consultas do dashboard, onde a regra segue valendo | Os testes descrevem comportamento que a spec substitui. Nenhuma asserção é enfraquecida nem apagada, só reapontada para a camada onde o comportamento vive | y |
| Rota escondida continua contando para métricas do dashboard | Sim, nada muda no `ob-ads` | O filtro é de leitura do app; não altera dado gravado | y |

**Open questions:** none — all resolved or logged above.

### Implicit-requirement dimensions sweep

Escopo Medium: cobertas as dimensões presentes; as demais `N/A`.

| Dimension | Resolução |
| --- | --- |
| Failure / partial-failure states | FILT-05: rota sem notificação e rota do banco legado (sem a coluna) aparecem em vez de falhar a consulta. |
| State-transition integrity | FILT-04: a decisão olha o status de rota primeiro — só `BACKLOG` é filtrado, então nenhuma transição já iniciada perde a rota de vista. |
| Data lifecycle / expiry | FILT-02: a decisão usa o status **efetivo** (`statusEfetivo()`), então `ENVIADO` vencido é tratado como `EXPIRADO` e não como enviado-vivo. |
| Auth boundaries & rate limits | Nenhum endpoint novo, nenhuma mudança de exposição. Ausência de auth em `/campanha/*` é pré-existente e está em Out of Scope. |
| Observability | FILT-07 exige que a resposta continue sendo `200` com `rotas: []` quando tudo é filtrado, para o caso "lista vazia" ser distinguível de erro nos logs de acesso. |
| Concurrency / ordering | Ordenação intocada (`ORDEM ASC NULLS LAST, ID_ROTA_PROMOTOR ASC`), coberta por FILT-06. Leitura sem escrita. |
| Input validation & bounds, Idempotency / retry, External-dependency failure | N/A because a mudança é um predicado de leitura sobre dados já carregados: sem entrada nova, sem escrita, sem chamada externa. |

---

## User Stories

### P1: Promotor só vê oficinas cuja confirmação está resolvida ⭐ MVP

**User Story**: Como promotor em campo, quero que a lista traga só as oficinas cuja confirmação já se resolveu, para não sair para uma visita que ainda depende de resposta da oficina.

**Why P1**: É o pedido inteiro. Sem isso o promotor não distingue "pode ir" de "ainda esperando" no momento de sair.

**Acceptance Criteria**:

1. WHILE a rota está em `BACKLOG` e o status efetivo da notificação é `CONFIRMADO`, `DISPENSADO` ou `FALHOU`, THEN `GET /campanha/ativa` SHALL incluir a rota na lista.
2. WHILE a rota está em `BACKLOG` e o status efetivo da notificação é `PENDENTE`, `ENVIADO` ou `EXPIRADO`, THEN `GET /campanha/ativa` SHALL omitir a rota da lista.
3. IF a rota está em `BACKLOG` e o status da notificação é `REAGENDADO` ou qualquer valor fora de `StatusNotificacaoVisita` THEN `GET /campanha/ativa` SHALL omitir a rota da lista.
4. WHILE a rota tem status `A CAMINHO`, `EM ANDAMENTO`, `FINALIZADO` ou `CANCELADO`, THEN `GET /campanha/ativa` SHALL incluir a rota independentemente do status da notificação.
5. IF a rota não possui linha em `CAMPANHAS_OB.NOTIFICACAO_VISITA` THEN `GET /campanha/ativa` SHALL incluir a rota na lista.
6. WHEN a lista filtrada é devolvida THEN `GET /campanha/ativa` SHALL preservar, para cada rota incluída, os mesmos campos e a mesma ordem de hoje (`ORDEM ASC NULLS LAST`, depois `ID_ROTA_PROMOTOR ASC`), incluindo `oficina.LATITUDE` e `oficina.LONGITUDE`.
7. WHEN todas as rotas do promotor são omitidas pelo filtro THEN `GET /campanha/ativa` SHALL responder `200` com a campanha ativa e `rotas: []`, e SHALL NOT responder `404`.
8. The system SHALL decidir a inclusão pelo status **efetivo** devolvido por `statusEfetivo()`, e não pelo valor bruto da coluna `STATUS`.
9. The system SHALL manter o mesmo número de consultas ao banco de hoje, sem nenhuma consulta adicional por rota.

**Independent Test**: chamar `GET /campanha/ativa` para um promotor com campanha ativa contendo rotas nos sete estados, uma sem notificação e uma `ENVIADO` já com check-in, e conferir quais vêm na resposta.

### P1: O dashboard do cliente não muda ⭐ MVP

**User Story**: Como operador do cliente, quero continuar vendo todas as rotas no dashboard, inclusive as que aguardam confirmação, para remanejar quem não confirmou.

**Why P1**: É a restrição explícita do usuário e o inverso da feature de visibilidade entregue antes. Um filtro que vazasse para essas consultas apagaria justamente o dado que aquela feature passou a exibir.

**Acceptance Criteria**:

1. The system SHALL devolver em `GET /campanha/:id` todas as rotas da campanha, em qualquer status de notificação e de rota, exatamente como hoje.
2. The system SHALL devolver em `GET /campanha/client/:clientId` todas as rotas, em qualquer status de notificação e de rota, exatamente como hoje.
3. The system SHALL manter o filtro em código alcançado apenas por `getActiveCampanhaByPromotor`, sem tocar as consultas usadas por essas duas rotas.

**Independent Test**: para a mesma campanha, comparar a contagem de rotas de `GET /campanha/:id` (todas) com a de `GET /campanha/ativa` (filtrada) e confirmar que a primeira não mudou em relação ao comportamento anterior.

---

## Edge Cases

- IF a rota vem do banco legado (consulta join-free, sem coluna de notificação) THEN o sistema SHALL incluí-la na lista, pelo mesmo caminho da rota sem notificação.
- WHEN a campanha ativa não tem nenhuma rota THEN a resposta SHALL ser a de hoje (`rotas: []`), sem depender do filtro.
- IF a notificação tem `STATUS = ENVIADO` e `EXPIRA_EM` nulo THEN o status efetivo permanece `ENVIADO` e o sistema SHALL omitir a rota (não há expiração a aplicar).
- IF a notificação tem `STATUS = CONFIRMADO` e `CONFIRMADO_EM` nulo THEN o sistema SHALL incluir a rota — a data ausente não afeta a decisão.
- WHEN uma rota `BACKLOG` escondida passa a `CONFIRMADO` THEN a chamada seguinte de `GET /campanha/ativa` SHALL incluí-la, sem nenhuma ação do promotor.

---

## Requirement Traceability

| Requirement ID | Story | AC | Status |
| --- | --- | --- | --- |
| FILT-01 | P1: Promotor só vê confirmação resolvida | AC1 | Done |
| FILT-02 | P1: Promotor só vê confirmação resolvida | AC2, AC8 | Done |
| FILT-03 | P1: Promotor só vê confirmação resolvida | AC3 | Done |
| FILT-04 | P1: Promotor só vê confirmação resolvida | AC4 | Done |
| FILT-05 | P1: Promotor só vê confirmação resolvida | AC5 + edge case legado | Done |
| FILT-06 | P1: Promotor só vê confirmação resolvida | AC6, AC7 | Done |
| FILT-07 | P1: Promotor só vê confirmação resolvida | AC9 | Done |
| FILT-08 | P1: O dashboard do cliente não muda | AC1, AC2, AC3 | Done |

**ID format:** `FILT-[NUMBER]`

**Coverage:** 8 total, 8 implementados, 0 pendentes

---

## Success Criteria

- [ ] Um promotor com rotas em todos os estados recebe, de `GET /campanha/ativa`, só as `CONFIRMADO` / `DISPENSADO` / `FALHOU`, as sem notificação e as já trabalhadas.
- [ ] A mesma campanha lida por `GET /campanha/:id` e `GET /campanha/client/:clientId` continua devolvendo a contagem completa de rotas.
- [ ] Um mutante que troque a lista de estados listáveis, ou que aplique o filtro fora do `BACKLOG`, é morto pela suíte.
- [ ] A contagem de consultas de `GET /campanha/ativa` é a mesma de antes.
