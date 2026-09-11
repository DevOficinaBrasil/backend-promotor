# Modo Definição de Rota com Agenda por Dia Specification

**Repositórios tocados:** `backend-promotor` (schema, endpoints), `ob-ads` (modo no wizard),
`frontend-promotor` (visitas do dia no app de campo).

## Problem Statement

O supervisor não consegue dizer *quando* cada visita acontece. Hoje o vínculo promotor–oficina tem
apenas uma ordem global (`ROTA_PROMOTOR.ORDEM`) e uma estratégia de ordenação, então todas as
oficinas do raio chegam ao promotor como uma lista única e indefinida — e o histórico do app de campo
vai acumulando visitas de todos os dias. Versões anteriores desta tela tinham um módulo de seleção de
oficinas e montagem de rota (`RotasDistributionSection`), hoje órfão e sem nenhuma noção de dia.

## Goals

- [ ] Botão "Modo definição de rota" no canto inferior direito do mapa, habilitado ao expandir um promotor
- [ ] Supervisor monta manualmente a rota do promotor com as oficinas já associadas dentro do raio
- [ ] Cálculo de rota otimizada por dia, escolhendo ponto inicial e ponto final
- [ ] Agenda de visitas por dia: oficina agendada em um dia some da lista dos outros dias
- [ ] Promotor vê as visitas do dia e as atrasadas de dias anteriores, e um histórico que mostra só o dia corrente
- [ ] Campanha já publicada sem agenda nenhuma continua funcionando exatamente como hoje

## Out of Scope

| Feature | Reason |
|---|---|
| Exclusividade de oficina entre promotores da mesma campanha | Nunca existiu no backend (`CONCERNS.md` RN-01) e continua não existindo. Esta feature agenda dentro de um vínculo; não inventa uma garantia que o resto do sistema não dá. |
| Colisão de datas entre campanhas do mesmo promotor | Mesmo motivo (`CONCERNS.md` RN-02). |
| Notificação de visita disparada pela data agendada | Decisão do usuário: o fluxo de `NOTIFICACAO_VISITA` não é tocado. |
| Reaproveitar `RotasDistributionSection` / `MapComponent` / `PromotoresSection` | São a versão antiga da tela, órfãs de referência. O modo novo nasce dentro do wizard atual; a remoção do código morto é limpeza separada. |
| Agendar visita para oficina fora do raio do promotor | O pedido é explícito: "com as oficinas que estão associadas dentro do raio". Vincular oficina nova é território do raio e do importador. |
| Capacidade máxima de visitas por dia | Não pedido. O supervisor decide quantas cabem. |
| Reagendar automaticamente uma visita atrasada para o dia seguinte | Não pedido. A visita atrasada continua aparecendo até ser concluída ou cancelada. |
| Autenticação e isolamento por tenant nos endpoints novos | A API inteira é pública hoje (`CONCERNS.md` SEC-01); os endpoints novos nascem com a mesma exposição. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
|---|---|---|---|
| Onde guardar o dia planejado | Coluna `DATA_VISITA` (`date`, anulável) em `CAMPANHAS_OB.ROTA_PROMOTOR`, criada por migration SQL manual | Decisão do usuário; evita um join novo no caminho quente `GET /campanha/ativa`. O repositório não tem runner de migration, então o arquivo segue o padrão de `scripts/migration-*.sql` | y (usuário) |
| Significado de `ORDEM` | Ordem **dentro do dia**; para rotas sem `DATA_VISITA` mantém o significado atual (ordem no vínculo) | Consequência direta da decisão acima. Com nenhuma rota agendada, o comportamento é bit a bit o de hoje | y (usuário) |
| Rotas sem dia agendado | Continuam visíveis para o promotor | Decisão do usuário; é o que torna a feature deployável sem migrar dado nenhum | y (usuário) |
| Rotas com dia futuro | Ficam ocultas do promotor até a data chegar | É o que dá sentido à agenda. Sem isso, agendar não muda nada para quem executa | n |
| Botão "Ordenar rotas" do card | Removido; `OrdenacaoModal` deixa de ser montado pelo passo 3 | Decisão do usuário (substituição, não coexistência). `RouteOrderingSection` permanece no repositório como código não referenciado, para não ampliar o diff | y (usuário) |
| Escopo da otimização | Um dia por vez | Decisão do usuário | y (usuário) |
| Ponto inicial e final de um dia | Não são persistidos em coluna própria: ao reabrir um dia já ordenado, são derivados da menor e da maior `ORDEM` daquele dia | Evita uma tabela ou colunas por dia só para guardar dois ids que a própria ordem já expressa. `CAMPANHA_PROMOTOR.ID_OFICINA_INICIO`/`ID_OFICINA_FIM` continuam existindo para a estratégia legada e não são escritos pelo modo novo | n |
| Intervalo do calendário | De `Campanha.START_TIME` a `Campanha.END_TIME`, todos os dias da semana | Decisão do usuário | y (usuário) |
| Estratégia de ordenação ao salvar um dia | `MANUAL` quando a ordem é montada à mão, `ROTA_OTIMIZADA` quando o dia é calculado | São os dois valores que o app de campo já entende como "respeite `ORDEM`" | n |
| Proximidade por GPS com agenda ativa | Bloqueada: com pelo menos uma rota agendada, `PUT /rota/reorder` recusa `PROXIMIDADE_PROMOTOR` com 409 | Essa estratégia limpa `ORDEM` de todas as rotas do vínculo, o que destruiria a ordem de todos os dias de uma vez | n |
| Rotas elegíveis para agendamento | Somente as que não estão `FINALIZADO` nem `CANCELADO` | Agendar uma visita já concluída não tem significado operacional | n |
| Fuso horário de "hoje" | `America/Sao_Paulo`, aplicado no backend | Promotor e supervisor operam no Brasil; calcular "hoje" no browser deixaria o corte do histórico depender do relógio do aparelho | n |
| Dois supervisores agendando a mesma rota | Última escrita vence, sem bloqueio otimista | Não há versionamento em `ROTA_PROMOTOR` nem em nenhum outro fluxo deste sistema; introduzir um só aqui seria inconsistente | n |
| Filtro do que o promotor vê | Aplicado no backend, em `GET /campanha/ativa` | O app de campo é o único consumidor; filtrar no servidor evita mandar rota futura pela rede e mantém a regra num lugar só. Se o app antigo continuar no ar durante o deploy, ele já recebe o recorte novo, que é o comportamento desejado | n |

**Open questions:** none — todas resolvidas ou registradas acima.

---

## Dimensões implícitas (sweep de escopo Large)

| Dimensão | Resolução |
|---|---|
| Validação de entrada e limites | `AGENDA-03`, `AGENDA-04`, `AGENDA-05`, `OTIM-03` |
| Falha parcial | `AGENDA-08` (o lote de agendamento é atômico) |
| Idempotência / retry | `AGENDA-07` (reenviar a mesma agenda produz o mesmo estado) |
| Auth e rate limit | N/A porque a API não tem autenticação em rota nenhuma (`CONCERNS.md` SEC-01); fechar isso é feature própria |
| Concorrência / ordenação | `AGENDA-06` (unicidade de `ORDEM` por dia), assumption de última-escrita-vence |
| Ciclo de vida do dado | `AGENDA-09` (desagendar devolve a rota ao pool), `AGENDA-10` (rota removida por recálculo de raio leva a data junto) |
| Observabilidade | N/A porque a feature não introduz processo assíncrono nem integração externa nova; os endpoints respondem síncronos com o estado resultante |
| Falha de dependência externa | `OTIM-06` (OSRM indisponível não impede salvar a ordem) |
| Integridade de transição de estado | `AGENDA-05` (visita concluída ou cancelada não é agendável), `APP-06` |

---

## User Stories

### P1: Dia planejado da visita no modelo de dados ⭐ MVP

**User Story**: Como sistema, quero registrar em qual dia cada visita está planejada, para que
supervisor e promotor enxerguem a mesma agenda.

**Why P1**: É a fundação. Sem a coluna e os endpoints, nem o modo no dashboard nem o app de campo têm o que ler.

**Acceptance Criteria**:

1. The sistema SHALL expor `DATA_VISITA` (data, anulável) em `CAMPANHAS_OB.ROTA_PROMOTOR`
2. WHILE nenhuma rota de um vínculo tem `DATA_VISITA` preenchida, o sistema SHALL apresentar as rotas desse vínculo exatamente como antes desta feature
3. WHEN o cliente envia `PUT /rota/agenda` com `ID_CAMPANHA_PROMOTOR`, uma data e uma lista ordenada de `ID_ROTA_PROMOTOR` THEN o sistema SHALL gravar essa data em cada rota da lista e SHALL gravar `ORDEM` 1..N na sequência recebida
4. IF a data enviada está fora do intervalo `START_TIME`–`END_TIME` da campanha do vínculo THEN o sistema SHALL responder 422 e SHALL NOT alterar nenhuma rota
5. IF alguma rota da lista está com `STATUS` `FINALIZADO` ou `CANCELADO` THEN o sistema SHALL responder 409 e SHALL NOT alterar nenhuma rota
6. The sistema SHALL garantir que duas rotas do mesmo vínculo e da mesma `DATA_VISITA` nunca tenham a mesma `ORDEM`
7. WHEN a mesma requisição de agenda é enviada duas vezes THEN o sistema SHALL produzir o mesmo estado final, sem duplicar nada
8. IF qualquer rota da lista falhar ao ser gravada THEN o sistema SHALL reverter a requisição inteira e SHALL NOT deixar o dia parcialmente agendado
9. WHEN o cliente envia `PUT /rota/agenda` com data nula para uma lista de rotas THEN o sistema SHALL limpar `DATA_VISITA` dessas rotas
10. WHEN uma rota é removida por recálculo de raio ou por remoção do vínculo THEN o sistema SHALL manter o comportamento atual de exclusão lógica, levando junto a `DATA_VISITA` daquela rota
11. IF `PUT /rota/reorder` recebe `PROXIMIDADE_PROMOTOR` para um vínculo que tem ao menos uma rota com `DATA_VISITA` preenchida THEN o sistema SHALL responder 409 e SHALL NOT limpar nenhuma `ORDEM`

**Independent Test**: agendar três rotas para um dia via API, reenviar a mesma chamada e conferir que
`DATA_VISITA` e `ORDEM` não mudaram; tentar agendar para uma data fora da campanha e conferir o 422
sem escrita.

---

### P1: Modo definição de rota no mapa do wizard ⭐ MVP

**User Story**: Como supervisor, quero entrar num modo dedicado no mapa e montar a rota do promotor
escolhendo manualmente as oficinas dentro do raio dele, para ter controle sobre o trajeto em vez de
depender só da distribuição automática.

**Why P1**: É a superfície pela qual o supervisor usa tudo que a story anterior habilita.

**Acceptance Criteria**:

1. WHILE o passo 3 do wizard está aberto, o sistema SHALL exibir um botão "Modo definição de rota" no canto inferior direito do mapa, acima do bloco de dica e da legenda
2. WHILE nenhum promotor está expandido, o sistema SHALL manter esse botão desabilitado
3. WHILE um promotor já vinculado está expandido, o sistema SHALL manter esse botão habilitado
4. WHILE um promotor ainda em rascunho está expandido, o sistema SHALL manter esse botão desabilitado
5. WHEN o supervisor aciona o botão THEN o sistema SHALL abrir o modo com as oficinas do raio daquele promotor listadas e destacadas no mapa
6. The sistema SHALL listar no modo apenas oficinas que já possuem rota ativa no vínculo selecionado
7. WHEN o supervisor reordena as oficinas de um dia por arrastar ou pelas setas THEN o sistema SHALL refletir a nova ordem na lista e na linha desenhada no mapa antes de salvar
8. WHEN o supervisor salva a ordem montada à mão THEN o sistema SHALL persistir `ORDEM` na sequência exibida e SHALL gravar a estratégia do vínculo como `MANUAL`
9. WHEN o supervisor fecha o modo sem salvar THEN o sistema SHALL descartar as alterações não salvas
10. The sistema SHALL NOT exibir o botão "Ordenar rotas" nos cards de promotor
11. WHILE o modo está aberto, o sistema SHALL indicar qual promotor está sendo editado

**Independent Test**: expandir um promotor vinculado, abrir o modo, arrastar duas oficinas para
trocar de posição, salvar, reabrir e conferir que a ordem persistiu.

---

### P1: Agenda de visitas por dia ⭐ MVP

**User Story**: Como supervisor, quero escolher um dia no calendário e marcar quais oficinas o
promotor visita naquele dia, para montar a agenda da semana sem repetir oficina.

**Why P1**: É o coração do pedido: a agenda por dia é o que não existe hoje de nenhuma forma.

**Acceptance Criteria**:

1. WHILE o modo está aberto, o sistema SHALL exibir um calendário restrito ao intervalo entre `START_TIME` e `END_TIME` da campanha
2. The calendário SHALL permitir selecionar qualquer dia desse intervalo, inclusive sábado e domingo
3. WHEN o supervisor seleciona um dia THEN o sistema SHALL exibir duas listas: as oficinas já agendadas naquele dia e as oficinas disponíveis para agendar
4. The lista de disponíveis SHALL conter apenas oficinas do vínculo sem nenhum dia agendado
5. WHEN uma oficina é agendada para um dia THEN o sistema SHALL removê-la da lista de disponíveis de todos os outros dias
6. WHEN o supervisor remove uma oficina de um dia THEN o sistema SHALL devolvê-la à lista de disponíveis
7. WHILE um dia tem oficinas agendadas, o calendário SHALL indicar quantas visitas aquele dia tem
8. WHEN o supervisor salva a agenda de um dia THEN o sistema SHALL enviar uma única requisição com a data e a lista ordenada de rotas daquele dia
9. IF a requisição de agenda falha THEN o sistema SHALL manter a lista na tela como estava e SHALL exibir o motivo
10. WHILE existe alteração de agenda não salva, o sistema SHALL sinalizar que há mudanças pendentes

**Independent Test**: agendar duas oficinas para segunda-feira, trocar para terça e verificar que as
duas sumiram das disponíveis; remover uma da segunda e verificar que ela reaparece nas disponíveis de terça.

---

### P1: Rota otimizada por dia ⭐ MVP

**User Story**: Como supervisor, quero calcular a rota otimizada de um dia escolhendo onde o promotor
começa e onde termina, para que o trajeto daquele dia faça sentido geograficamente.

**Why P1**: Pedido explícito, e é o que transforma uma lista de oficinas num roteiro.

**Acceptance Criteria**:

1. WHILE um dia com ao menos duas oficinas agendadas está selecionado, o sistema SHALL permitir escolher uma oficina de início e uma de fim entre as oficinas daquele dia
2. WHEN o supervisor aciona o cálculo THEN o sistema SHALL otimizar a ordem apenas das oficinas agendadas naquele dia, preservando início e fim escolhidos
3. IF início e fim não foram escolhidos THEN o sistema SHALL manter o cálculo desabilitado
4. WHEN o cálculo termina THEN o sistema SHALL gravar `ORDEM` 1..N nas rotas daquele dia e SHALL gravar a estratégia do vínculo como `ROTA_OTIMIZADA`
5. The cálculo SHALL NOT alterar `ORDEM` nem `DATA_VISITA` de rotas de outros dias
6. IF o serviço de geometria por ruas não responde THEN o sistema SHALL persistir a ordem calculada mesmo assim e SHALL desenhar o trajeto em linha reta
7. IF alguma oficina do dia está sem latitude ou longitude THEN o sistema SHALL responder com erro identificando a oficina e SHALL NOT alterar nenhuma ordem
8. WHEN um dia já ordenado é reaberto THEN o sistema SHALL pré-selecionar como início a oficina de menor `ORDEM` do dia e como fim a de maior `ORDEM`
9. WHEN a ordem de um dia muda THEN o sistema SHALL redesenhar no mapa o trajeto daquele dia

**Independent Test**: agendar quatro oficinas num dia, escolher início e fim, calcular, e conferir que
a ordem gravada começa e termina nas oficinas escolhidas e que outro dia agendado não mudou.

---

### P1: Visitas do dia no app do promotor ⭐ MVP

**User Story**: Como promotor, quero ver as visitas de hoje e as que ficaram para trás, e um histórico
que mostre só o que fiz hoje, para não me perder num histórico que acumula todos os dias.

**Why P1**: Sem isso a agenda montada pelo supervisor não chega a quem executa.

**Acceptance Criteria**:

1. WHEN o app pede a campanha ativa THEN o sistema SHALL incluir na lista de pendentes as rotas não concluídas cuja `DATA_VISITA` é o dia corrente
2. WHEN o app pede a campanha ativa THEN o sistema SHALL incluir na lista de pendentes as rotas não concluídas cuja `DATA_VISITA` é anterior ao dia corrente
3. WHEN o app pede a campanha ativa THEN o sistema SHALL incluir na lista de pendentes as rotas não concluídas sem `DATA_VISITA`
4. IF uma rota não concluída tem `DATA_VISITA` posterior ao dia corrente THEN o sistema SHALL NOT incluí-la na lista de pendentes
5. The sistema SHALL incluir no histórico apenas rotas concluídas ou canceladas cujo `DONE_AT` cai no dia corrente, no fuso `America/Sao_Paulo`
6. The sistema SHALL expor `DATA_VISITA` em cada rota retornada
7. WHILE uma rota pendente tem `DATA_VISITA` anterior ao dia corrente, o app SHALL exibi-la marcada como atrasada, com a data original
8. The app SHALL ordenar os pendentes com as atrasadas primeiro, da mais antiga para a mais recente
9. WHILE existem rotas do dia corrente, o app SHALL ordená-las por `ORDEM` logo depois das atrasadas
10. WHILE existem rotas sem `DATA_VISITA`, o app SHALL ordená-las depois das anteriores, pela estratégia de ordenação vigente
11. WHEN não há nenhuma visita para hoje nem atrasada nem sem data THEN o app SHALL exibir um estado vazio dizendo que não há visitas para hoje

**Independent Test**: agendar uma visita para ontem e outra para hoje, deixar uma sem data e uma para
amanhã; abrir o app e conferir que aparecem três pendentes na ordem atrasada → hoje → sem data, e que
a de amanhã não aparece. Finalizar uma e conferir que o histórico mostra só ela.

---

## Edge Cases

- IF a campanha não tem `START_TIME` ou `END_TIME` THEN o modo SHALL exibir o calendário desabilitado com o motivo
- IF o promotor expandido não tem nenhuma rota ativa THEN o modo SHALL abrir com as listas vazias e o cálculo desabilitado
- IF um dia agendado fica sem nenhuma oficina depois de uma remoção THEN o calendário SHALL deixar de marcar aquele dia
- IF o raio do promotor é reduzido e uma oficina agendada sai do alcance THEN a rota SHALL ser desativada pelo fluxo de recálculo já existente, sumindo da agenda
- IF uma rota agendada para hoje é concluída THEN ela SHALL sair dos pendentes e entrar no histórico do dia
- IF uma rota agendada para ontem é concluída hoje THEN ela SHALL aparecer no histórico de hoje
- WHEN a data corrente ultrapassa `END_TIME` da campanha THEN as rotas atrasadas SHALL continuar visíveis enquanto a campanha for retornada como ativa
- IF duas abas do dashboard agendam a mesma rota para dias diferentes THEN o último salvamento SHALL prevalecer

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| AGENDA-01 | P1: Dia planejado no modelo de dados | Design | Pending |
| AGENDA-02 | P1: Dia planejado no modelo de dados | Design | Pending |
| AGENDA-03 | P1: Dia planejado no modelo de dados | Design | Pending |
| AGENDA-04 | P1: Dia planejado no modelo de dados | Design | Pending |
| AGENDA-05 | P1: Dia planejado no modelo de dados | Design | Pending |
| AGENDA-06 | P1: Dia planejado no modelo de dados | Design | Pending |
| AGENDA-07 | P1: Dia planejado no modelo de dados | Design | Pending |
| AGENDA-08 | P1: Dia planejado no modelo de dados | Design | Pending |
| AGENDA-09 | P1: Dia planejado no modelo de dados | Design | Pending |
| AGENDA-10 | P1: Dia planejado no modelo de dados | Design | Pending |
| AGENDA-11 | P1: Dia planejado no modelo de dados | Design | Pending |
| MODO-01 | P1: Modo definição de rota no mapa | Design | Pending |
| MODO-02 | P1: Modo definição de rota no mapa | Design | Pending |
| MODO-03 | P1: Modo definição de rota no mapa | Design | Pending |
| MODO-04 | P1: Modo definição de rota no mapa | Design | Pending |
| MODO-05 | P1: Modo definição de rota no mapa | Design | Pending |
| MODO-06 | P1: Modo definição de rota no mapa | Design | Pending |
| MODO-07 | P1: Modo definição de rota no mapa | Design | Pending |
| MODO-08 | P1: Modo definição de rota no mapa | Design | Pending |
| MODO-09 | P1: Modo definição de rota no mapa | Design | Pending |
| MODO-10 | P1: Modo definição de rota no mapa | Design | Pending |
| MODO-11 | P1: Modo definição de rota no mapa | Design | Pending |
| DIA-01 | P1: Agenda de visitas por dia | Design | Pending |
| DIA-02 | P1: Agenda de visitas por dia | Design | Pending |
| DIA-03 | P1: Agenda de visitas por dia | Design | Pending |
| DIA-04 | P1: Agenda de visitas por dia | Design | Pending |
| DIA-05 | P1: Agenda de visitas por dia | Design | Pending |
| DIA-06 | P1: Agenda de visitas por dia | Design | Pending |
| DIA-07 | P1: Agenda de visitas por dia | Design | Pending |
| DIA-08 | P1: Agenda de visitas por dia | Design | Pending |
| DIA-09 | P1: Agenda de visitas por dia | Design | Pending |
| DIA-10 | P1: Agenda de visitas por dia | Design | Pending |
| OTIM-01 | P1: Rota otimizada por dia | Design | Pending |
| OTIM-02 | P1: Rota otimizada por dia | Design | Pending |
| OTIM-03 | P1: Rota otimizada por dia | Design | Pending |
| OTIM-04 | P1: Rota otimizada por dia | Design | Pending |
| OTIM-05 | P1: Rota otimizada por dia | Design | Pending |
| OTIM-06 | P1: Rota otimizada por dia | Design | Pending |
| OTIM-07 | P1: Rota otimizada por dia | Design | Pending |
| OTIM-08 | P1: Rota otimizada por dia | Design | Pending |
| OTIM-09 | P1: Rota otimizada por dia | Design | Pending |
| APP-01 | P1: Visitas do dia no app do promotor | Design | Pending |
| APP-02 | P1: Visitas do dia no app do promotor | Design | Pending |
| APP-03 | P1: Visitas do dia no app do promotor | Design | Pending |
| APP-04 | P1: Visitas do dia no app do promotor | Design | Pending |
| APP-05 | P1: Visitas do dia no app do promotor | Design | Pending |
| APP-06 | P1: Visitas do dia no app do promotor | Design | Pending |
| APP-07 | P1: Visitas do dia no app do promotor | Design | Pending |
| APP-08 | P1: Visitas do dia no app do promotor | Design | Pending |
| APP-09 | P1: Visitas do dia no app do promotor | Design | Pending |
| APP-10 | P1: Visitas do dia no app do promotor | Design | Pending |
| APP-11 | P1: Visitas do dia no app do promotor | Design | Pending |

**ID format:** `AGENDA-NN`, `MODO-NN`, `DIA-NN`, `OTIM-NN`, `APP-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 51 total, 51 mapped to design, 0 unmapped

---

## Success Criteria

- [ ] Supervisor monta a agenda de uma semana inteira sem que nenhuma oficina apareça em dois dias
- [ ] Cada dia agendado tem sua própria ordem, e otimizar um dia não mexe nos outros
- [ ] Promotor abre o app e vê as visitas de hoje mais as atrasadas, sem as de amanhã
- [ ] Histórico do app mostra apenas o que foi concluído no dia corrente
- [ ] Campanha publicada sem nenhuma visita agendada se comporta exatamente como antes do deploy
