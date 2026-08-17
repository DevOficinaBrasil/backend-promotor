# Visibilidade do Status de Confirmação de Visita — Specification

**Jira:** CON26-89 — `[9/10] Expor o status de confirmação no dashboard e no app do promotor`
**Depende de:** CON26 task 5 (orquestrador de envio) e task 8 (aplicação da confirmação) — ambas já entregues como a feature `notificacao-visita-confirmacao` (NOTIF-*).
**Repos no escopo:** `backend-promotor` (API), `ob-ads` (dashboard do cliente), `frontend-promotor` (app de campo do promotor).

## Problem Statement

A confirmação de visita já é coletada e gravada em `CAMPANHAS_OB.NOTIFICACAO_VISITA`, e `GET /campanha/:id` e `GET /campanha/ativa` já a devolvem por rota (NOTIF-19). Nenhuma das três interfaces exibe o dado: o dashboard não sinaliza nada nas telas de distribuição de rotas e de ordenação de visitas, o app de campo ignora o campo, e a visão gerencial nem recebe o dado — sua consulta (`GET /campanha/client/:clientId`) é a única das três que não faz join em `NOTIFICACAO_VISITA`.

Some a isso um defeito de escrita: `PUT /visita/endereco` grava o endereço corrigido apenas em `MAIN_REGISTER.OFICINA`, mas as duas consultas em SQL cru montam o endereço a partir de `dw.cadastro_empresa`. A correção é gravada e nunca lida por quem vai dirigir até lá. O DBA liberou escrita direta em `dw`, então a correção passa a gravar nas duas tabelas.

O objetivo declarado da epic ("o promotor enxerga, antes de sair, quais visitas estão confirmadas") não é atingido hoje.

## Goals

- [ ] O dashboard sinaliza visualmente o status de confirmação nas telas de distribuição de rotas e de ordenação de visitas.
- [ ] O app de campo (`frontend-promotor`) exibe o status por rota na campanha ativa.
- [ ] `GET /campanha/client/:clientId` passa a devolver o status, habilitando a visão gerencial.
- [ ] O endereço corrigido pelo reparador aparece para o promotor em vez do endereço antigo.
- [ ] Nenhuma consulta adicional por rota é introduzida e o tempo de resposta de `GET /campanha/client/:clientId` não regride de forma perceptível.

## Estado atual verificado (base da fase de Design)

Levantado no código, não presumido:

| Consulta | Status de confirmação | Fonte do endereço | Consumidor |
| --- | --- | --- | --- |
| `GET /campanha/:id` (`campanhaService.ts:372`) | Já devolve `notificacaoVisita` com status efetivo | `MAIN_REGISTER.OFICINA`, via relação TypeORM `rotasPromotor.oficina` | `ob-ads` → `vinculoService.getVinculosWithDetails` → telas de distribuição de rotas e ordenação de visitas |
| `GET /campanha/ativa` (`campanhaService.ts:164`) | Já devolve `notificacaoVisita` com status efetivo | `dw.cadastro_empresa` (SQL cru) | `frontend-promotor` → `service/campanha.service.ts:66` |
| `GET /campanha/client/:clientId` (`campanhaService.ts:398`) | **Não faz join** em `NOTIFICACAO_VISITA` | `dw.cadastro_empresa` (SQL cru) | `ob-ads` → `visao/page.tsx:35` → visão gerencial / analítica |

## Out of Scope

| Feature | Reason |
| --- | --- |
| Status `RECUSADO` e ação de recusa | Não existe no domínio: `StatusNotificacaoVisita` não tem `RECUSADO`, o `CHK_NOTIFICACAO_VISITA_STATUS` não o aceita e não há endpoint de recusa. Decidido com o usuário: fora de escopo, vira task futura junto com o `REAGENDADO` já reservado (NOTIF-26). As interfaces sinalizam apenas confirmado / pendente / expirado / falhou. |
| Geocodificação do endereço corrigido | Não há provider de geocoding no fluxo de confirmação; `geolocationService` só resolve por CEP e não é chamado ali. Decidido com o usuário: a API devolve as coordenadas do cadastro como estão. |
| Coluna de "coordenadas confirmadas" | Não existe e não será criada. As coordenadas expostas são as de `dw.cadastro_empresa` (`LATITUDE`/`LONGITUDE`), já devolvidas hoje. |
| Autenticação de `/campanha/*` | As rotas de campanha não têm middleware de autenticação hoje — `middlewares: []` em `routes/CampanhaRoute.ts:211` e `:251`, e `middlewares/authMiddleware.ts` não é importado por rota nenhuma (risco aberto nº 1 do `STATE.md`). Corrigir isso é mudança de contrato para três frontends e tem escopo próprio; esta feature não piora nem melhora a exposição. |
| Cálculo dos indicadores agregados no servidor | PERF-01 é risco conhecido do projeto e tem escopo próprio. Esta feature só se obriga a não piorá-lo. |
| Reescrita da paginação/estrutura de `/campanha/client/:clientId` | Fora do escopo; a mudança é aditiva (um `LEFT JOIN` e colunas a mais na mesma consulta). |
| `AppOficinaBrasil` | O promotor de campo usa `frontend-promotor`. O app do usuário final não consome rotas de promotor. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Significado de "rota recusada" | Não implementar; interfaces exibem confirmado / pendente / expirado / falhou | Valor de domínio inexistente — não se inventa significado de enum | y |
| "Coordenadas confirmadas" | Devolver `LATITUDE`/`LONGITUDE` do cadastro, sem prometer que refletem endereço corrigido | Não há geocoding no stack para essa rota de código | y |
| Endereço corrigido não chega ao app | Corrigir nesta feature | O usuário confirmou incluir; sem isso a correção de endereço é inútil na prática | y |
| Onde corrigir: leitura ou escrita | Na **escrita** — `PUT /visita/endereco` grava em `MAIN_REGISTER.OFICINA` **e** em `dw.cadastro_empresa`, na mesma transação | O DBA liberou `UPDATE` em `dw`. Corrigir na escrita mantém as três consultas de campanha intocadas e elimina qualquer regra de precedência de fonte na leitura | y |
| Como quebrar o `ENDERECO` (linha única) nas colunas `logradouro` + `rua` do `dw` | Parse do primeiro token contra uma lista de tipos de logradouro; se casar, vira `logradouro` e o resto vira `rua`; se não casar, `logradouro = NULL` e a string inteira vai para `rua` | Levantado em PRD: `logradouro` é o tipo (`Rua` 92.543, `Avenida` 34.625, `Rodovia` 3.257, `Estrada` 2.385, `Travessa` 1.126, `Alameda` 733, `Praça` 641, `Quadra` 528) e `rua` é o nome. Em 146.581 linhas, **zero** têm `rua` sem `logradouro` — jogar tudo em `rua` criaria uma forma inédita na tabela | y |
| Leitura passa a usar `TRIM` no `CONCAT` de `logradouro` + `rua` | Sim, nas duas consultas em SQL cru | O caminho de fallback do parse grava `logradouro = NULL`, e `CONCAT(NULL,' ',x)` devolve a string com espaço à esquerda | y |
| Valores `NP` (2.226 linhas) e `M` (1.071) na coluna `logradouro` | Não interpretar nem tratar como caso especial; o parse só age sobre o que o reparador digita | Significado desconhecido — não se inventa semântica de valor de domínio | y |
| `GET /campanha/:id` continua lendo de `MAIN_REGISTER.OFICINA` | Sim, pela relação TypeORM, sem mudança | Com a escrita nas duas tabelas, as três consultas convergem sem regra de precedência | y |
| Correções feitas antes deste deploy ficam só em `MAIN_REGISTER.OFICINA` | Verificar a contagem de `NOTIFICACAO_VISITA` com `ENDERECO_ATUALIZADO = true` antes do deploy; se houver linhas, rodar um backfill pontual para o `dw` | Não consegui contar: o usuário de leitura disponível não tem permissão no schema `CAMPANHAS_OB`. O fluxo de confirmação ainda aguarda a migration em produção, então o esperado é zero — mas isso precisa ser confirmado, não presumido | n |
| Status exposto é o efetivo, não o bruto | `statusEfetivo()` aplicado também na consulta por cliente | É o contrato já estabelecido por NOTIF-19 nas outras duas consultas | y |
| Rotas vindas do banco legado | Continuam sem `notificacaoVisita` (campo ausente, não nulo) | O banco legado não tem `NOTIFICACAO_VISITA`; a query legada já é join-free por decisão de NOTIF-19 | y |
| Cor/ícone exatos do indicador | Definidos na implementação seguindo o design system já usado em cada tela; o requisito é distinção visual, não uma paleta específica | Não há mockup para esta task | n |
| Baseline de desempenho | Medir `GET /campanha/client/:clientId` no mesmo cliente e mesmo ambiente, 5 chamadas antes e 5 depois, comparando a mediana | Sem baseline definido o critério de não-regressão não é verificável | n |

**Open questions:** none — all resolved or logged above.

### Implicit-requirement dimensions sweep

| Dimension | Resolução |
| --- | --- |
| Input validation & bounds | A allowlist de 7 campos do `PUT /visita/endereco` não muda; a escrita no `dw` deriva dos mesmos campos já validados. Nenhum endpoint novo e nenhum parâmetro de entrada novo. |
| Failure / partial-failure states | VISIB-06 (leitura: rota sem notificação omite o campo em vez de falhar) e VISIB-13 (escrita: as duas tabelas numa transação, falha em qualquer uma reverte tudo e não confirma a visita). |
| Idempotency / retry / duplicate handling | A correção continua single-shot: uma visita já `CONFIRMADO` responde `409` antes de qualquer escrita, então repetir o `PUT` não regrava. Reexecutar o `PUT` sobre a mesma oficina é idempotente por natureza (mesmo valor nos dois destinos). |
| Auth boundaries & rate limits | Nenhum endpoint novo é criado e nenhuma rota muda de exposição. A ausência de autenticação em `/campanha/*` é pré-existente e está registrada em Out of Scope. O `PUT /visita/endereco` mantém `visitaAuthMiddleware` + rate limit de 20 req/min por visita, inalterados. |
| Concurrency / ordering | N/A because leitura sem escrita; a ordenação das rotas (`ORDEM ASC NULLS LAST`) não muda. |
| Data lifecycle / expiry | VISIB-05: o status devolvido é o efetivo — um link vencido e nunca aberto lê como `EXPIRADO`, nunca como ainda vivo. |
| Observability | N/A because nenhum caminho novo de erro é introduzido; as consultas já logam falhas no handler existente. |
| External-dependency failure | N/A because nenhuma chamada externa é adicionada (geocoding ficou fora de escopo). |
| State-transition integrity | VISIB-13: a transição para `CONFIRMADO` continua ocorrendo depois da escrita do endereço e só quando ela inteira tiver sucesso — a garantia atual de "endereço falhou, nada foi confirmado" passa a valer para as duas tabelas. |

---

## User Stories

### P1: Operador vê o status de confirmação no dashboard ⭐ MVP

**User Story**: Como operador do cliente distribuindo rotas no dashboard, quero ver quais oficinas já confirmaram a visita, para remanejar as que não confirmaram antes do promotor sair.

**Why P1**: É o consumidor principal citado na task. Sem trabalho de backend: `GET /campanha/:id` já entrega `notificacaoVisita`, e é ele que alimenta as duas telas via `vinculoService.getVinculosWithDetails`.

**Acceptance Criteria**:

1. WHEN uma rota com `notificacaoVisita.STATUS = "CONFIRMADO"` é renderizada na tela de distribuição de rotas THEN a UI SHALL exibir um indicador de confirmada distinto do indicador de rota pendente.
2. WHEN uma rota com `notificacaoVisita.STATUS = "CONFIRMADO"` é renderizada na tela de ordenação de visitas THEN a UI SHALL exibir o mesmo indicador de confirmada.
3. WHILE a rota está com status efetivo `EXPIRADO` ou `FALHOU` a UI SHALL exibir, nas duas telas, um indicador distinto tanto do confirmado quanto do pendente.
4. WHEN a rota tem status efetivo `PENDENTE`, `ENVIADO` ou `DISPENSADO` THEN a UI SHALL exibir o indicador de pendente.
5. IF a rota não traz o campo `notificacaoVisita` THEN a UI SHALL renderizar a rota sem indicador de confirmação e SHALL NOT exibi-la como pendente.
6. The system SHALL obter esse dado do payload de `GET /campanha/:id` já carregado pela tela, sem nenhuma chamada de API nova.

**Independent Test**: abrir a edição de uma campanha com rotas confirmada, pendente e expirada e conferir os três indicadores nas duas seções, com o DevTools mostrando nenhuma requisição adicional.

---

### P1: Promotor vê o status antes de sair a campo ⭐ MVP

**User Story**: Como promotor em campo, quero ver na lista de rotas quais visitas estão confirmadas, para priorizar as confirmadas e evitar viagem perdida.

**Why P1**: É o objetivo declarado da epic; sem isso a coleta da confirmação não muda nenhuma decisão de campo. `GET /campanha/ativa` já entrega o dado — falta consumo.

**Acceptance Criteria**:

1. WHEN a lista de rotas da campanha ativa é renderizada no `frontend-promotor` THEN a UI SHALL exibir, por rota, um indicador do status de confirmação com estados visualmente distintos para confirmada, pendente e expirada/falhou.
2. WHEN a rota está confirmada e `CONFIRMADO_EM` não é nulo THEN a UI SHALL exibir a data de confirmação junto ao indicador.
3. IF `CONFIRMADO_EM` é nulo com `STATUS = "CONFIRMADO"` THEN a UI SHALL exibir o indicador de confirmada sem data, e SHALL NOT renderizar `null` nem data vazia.
4. The system SHALL continuar devolvendo, em cada rota de `GET /campanha/ativa`, o objeto `oficina` com `LATITUDE` e `LONGITUDE`, para que o app navegue até a oficina.
5. IF uma rota não possui linha em `NOTIFICACAO_VISITA` THEN a UI SHALL renderizar a rota normalmente, sem indicador de confirmação.

**Independent Test**: logar como promotor com campanha ativa contendo rotas em estados diferentes e conferir os indicadores e a navegação por coordenadas.

---

### P1: O endereço corrigido chega a quem dirige até lá ⭐ MVP

**User Story**: Como promotor, quero navegar até o endereço que o reparador corrigiu, e não até o endereço antigo do cadastro.

**Why P1**: `PUT /visita/endereco` grava em `MAIN_REGISTER.OFICINA` (`service/visitaConfirmacaoService.ts:224`) enquanto `GET /campanha/ativa` e `GET /campanha/client/:clientId` montam o endereço a partir de `dw.cadastro_empresa` (`service/campanhaService.ts:213` e `:445`). Hoje a correção é gravada e nunca lida.

**Acceptance Criteria**:

1. WHEN `PUT /visita/endereco` grava o endereço corrigido THEN o sistema SHALL atualizar `MAIN_REGISTER.OFICINA` e `dw.cadastro_empresa` para a mesma oficina, dentro de uma única transação.
2. IF a atualização de qualquer uma das duas tabelas falha THEN o sistema SHALL reverter ambas, SHALL NOT registrar a confirmação, e SHALL responder `500` com `error: "ADDRESS_UPDATE_FAILED"`.
3. WHEN o primeiro token do campo `ENDERECO` corresponde a um tipo de logradouro conhecido THEN o sistema SHALL gravar esse token em `dw.cadastro_empresa.logradouro` e o restante da string em `dw.cadastro_empresa.rua`.
4. IF o primeiro token do campo `ENDERECO` não corresponde a nenhum tipo conhecido THEN o sistema SHALL gravar `dw.cadastro_empresa.logradouro = NULL` e a string inteira em `dw.cadastro_empresa.rua`.
5. The system SHALL gravar os campos `NUMERO`, `COMPLEMENTO`, `BAIRRO`, `CIDADE`, `ESTADO` e `CEP` em `dw.cadastro_empresa` com o mesmo valor gravado em `MAIN_REGISTER.OFICINA`, sem transformação.
6. The system SHALL montar `ENDERECO` nas duas consultas em SQL cru com `TRIM` sobre a concatenação de `logradouro` e `rua`, de modo que um `logradouro` nulo não produza espaço à esquerda.
7. The system SHALL NOT alterar `dw.cadastro_empresa.latitude` e `dw.cadastro_empresa.longitude` na correção de endereço — não há geocodificação.
8. The system SHALL manter as três consultas de campanha sem nenhuma regra de precedência entre fontes de endereço, e sem consulta adicional por rota.

**Independent Test**: corrigir um endereço via `PUT /visita/endereco` e conferir que `GET /campanha/ativa` devolve o endereço novo com as coordenadas antigas, e que `MAIN_REGISTER.OFICINA` e `dw.cadastro_empresa` ficaram consistentes para aquela oficina.

---

### P2: Visão gerencial reflete o status

**User Story**: Como gestor acompanhando a campanha, quero enxergar quantas rotas foram confirmadas, para medir a taxa de confirmação da campanha.

**Why P2**: Terceiro consumidor citado na task. É a única história com trabalho de backend de status, porque `GET /campanha/client/:clientId` é a consulta que não faz o join.

**Acceptance Criteria**:

1. WHEN o cliente chama `GET /campanha/client/:clientId` THEN o sistema SHALL incluir, em cada rota que possua linha em `NOTIFICACAO_VISITA`, o objeto `notificacaoVisita` com os campos `STATUS` e `CONFIRMADO_EM`.
2. The system SHALL obter esse dado por um único `LEFT JOIN` em `CAMPANHAS_OB.NOTIFICACAO_VISITA` dentro da consulta de rotas já existente, sem emitir nenhuma consulta adicional por rota.
3. The system SHALL devolver em `notificacaoVisita.STATUS` o status efetivo calculado por `statusEfetivo()`, e não o valor bruto da coluna.
4. The system SHALL manter `notificacaoVisita` declarado no schema de resposta da consulta por cliente — já satisfeito hoje, porque `RotaPromotorSchema` (`schemas/campanha.ts:127`) declara o campo e é aninhado por `CampanhaPromotorSchema` → `CampanhaWithRelationsSchema` → `GetCampanhasByClientIdResponseSchema`; vale como critério de regressão, não como trabalho novo.
5. The system SHALL declarar o status de confirmação como campo opcional em cada tipo de rota que o dado atravessa: `CampanhaPromotorRota` (`ob-ads/types/vinculo.ts:44`), `RotaPromotor` (`ob-ads/.../visao/components/types.ts:12`), `RotaAPI` (`frontend-promotor/lib/types.ts:50`, forma da API) e `RotaPromotor` (`frontend-promotor/lib/types.ts:143`, modelo local em snake_case).
6. WHEN `normalizeRota` (`frontend-promotor/service/campanha.service.ts`) converte a rota da API para o modelo local THEN o sistema SHALL copiar o status de confirmação e a data de confirmação para o modelo local — um campo não copiado é descartado em silêncio.
7. WHEN a visão gerencial da campanha é aberta THEN a UI SHALL exibir a contagem de rotas confirmadas e de rotas não confirmadas da campanha.
8. The system SHALL derivar essa contagem do payload de `GET /campanha/client/:clientId` já carregado por `visao/page.tsx`, sem nova chamada de API.

**Independent Test**: chamar `GET /campanha/client/:clientId` para um cliente com rotas em estados mistos, conferir `notificacaoVisita.STATUS` por rota e as contagens na visão gerencial.

---

## Edge Cases

- IF uma rota vem do banco legado (sem `NOTIFICACAO_VISITA`) THEN o sistema SHALL omitir o campo `notificacaoVisita` da rota em vez de devolvê-lo nulo ou falhar a consulta.
- IF a linha de notificação existe com `EXPIRA_EM` no passado e `STATUS = "ENVIADO"` THEN o sistema SHALL devolver `EXPIRADO` (status efetivo), nunca `ENVIADO`.
- WHEN uma campanha não tem nenhuma rota com notificação THEN as três consultas SHALL responder exatamente o payload de hoje, sem campos novos.
- IF o `ENDERECO` corrigido tem uma única palavra THEN o sistema SHALL tratá-la como nome (`rua`), com `logradouro = NULL`, e SHALL NOT gravar `rua` vazia.
- IF a oficina não tem linha em `dw.cadastro_empresa` THEN o sistema SHALL gravar em `MAIN_REGISTER.OFICINA` normalmente e SHALL NOT falhar a confirmação por causa da linha ausente no `dw`.
- IF o `ENDERECO` corrigido vem `null`, vazio ou só com espaços THEN o sistema SHALL gravar `logradouro = NULL` e `rua` com o mesmo valor que já grava hoje em `MAIN_REGISTER.OFICINA.ENDERECO`, sem rejeitar — o schema atual (`schemas/visita.ts:41`) aceita `string` vazia e `null`, e endurecer essa validação está fora do escopo desta feature.

---

## Requirement Traceability

| Requirement ID | Story | AC | Phase | Status |
| --- | --- | --- | --- | --- |
| VISIB-01 | P2: Visão gerencial | AC1, AC2 | T4 | Done |
| VISIB-02 | P2: Visão gerencial | AC3 | T4 | Done |
| VISIB-03 | P1: Operador vê o status no dashboard | AC1-AC4, AC6 | T6, T7, T8, T9 | Done |
| VISIB-04 | P1: Promotor vê o status antes de sair | AC1-AC2 | Design | Pending |
| VISIB-05 | P1: Promotor vê o status antes de sair | AC4 | T3 | Done |
| VISIB-06 | P1 dashboard AC5, P1 promotor AC5, Edge cases (legado) | - | T4 (backend), T6 (ob-ads), T15 (frontend-promotor) | Done |
| VISIB-07 | P1: Endereço corrigido chega ao promotor | AC1, AC5, AC8 | T2 | Done |
| VISIB-08 | P1: Endereço corrigido chega ao promotor | AC7 | T2 | Done |
| VISIB-09 | P2: Visão gerencial (regressão de schema) | AC4 | T4 | Done |
| VISIB-10 | P2: Visão gerencial | AC7, AC8 | T11 | Done |
| VISIB-14 | P2: Tipos de rota nos frontends | AC5 | T5, T10, T13 | Done |
| VISIB-15 | P2: Mapper do `frontend-promotor` preserva o campo | AC6 | T12, T14 | Done |
| VISIB-11 | P1: Endereço corrigido — split `logradouro`/`rua` | AC3, AC4 | T1 | Done |
| VISIB-12 | P1: Endereço corrigido — `TRIM` na leitura | AC6 | T3 | Done |
| VISIB-13 | P1: Endereço corrigido — transação e falha parcial | AC2 | T2 | Done |

**ID format:** `VISIB-[NUMBER]`

**Coverage:** 15 total, 0 mapeados a tasks, 15 não mapeados ⚠️ (o mapeamento ocorre na fase Tasks)

---

## Success Criteria

- [ ] As telas de distribuição de rotas e de ordenação de visitas mostram confirmada, pendente e expirada/falhou de forma visualmente distinta, sem requisição nova.
- [ ] A lista de rotas do `frontend-promotor` mostra o status por rota.
- [ ] `GET /campanha/client/:clientId` devolve `notificacaoVisita.STATUS` para toda rota com notificação, com o mesmo número de queries de antes.
- [ ] Um endereço corrigido via `PUT /visita/endereco` aparece em `GET /campanha/ativa` na chamada seguinte, com as coordenadas do cadastro inalteradas, e `MAIN_REGISTER.OFICINA` e `dw.cadastro_empresa` ficam consistentes para aquela oficina.
- [ ] A mediana de 5 chamadas a `GET /campanha/client/:clientId`, medida no mesmo cliente e ambiente antes e depois, não regride além de 10%.
