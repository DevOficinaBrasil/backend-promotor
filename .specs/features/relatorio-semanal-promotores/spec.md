# Relatório Semanal de Promotores Specification

**Ticket:** [CON26-325](https://oficinabrasil.atlassian.net/browse/CON26-325)
**Contexto:** [context.md](context.md)

## Problem Statement

Hoje o relatório semanal de performance dos promotores (visão geral, assertividade, desempenho por promotor, cancelamentos, observações de campo e próximos passos) é montado manualmente toda quinta/sexta-feira: um analista pede a um agente de IA (Claude Desktop/Codex) para consultar o banco de produção direto, calcular as métricas e montar o PDF à mão, que depois é enviado manualmente ao cliente (hoje só a SKF). Isso não escala para outros clientes com o módulo de promotores e depende de trabalho manual repetitivo toda semana. A squad de Engajamento já resolveu um problema análogo (relatório periódico automático por e-mail, `CommunityReportService`/`CommunityReportEmailService` no backend-ob-ads) — este trabalho replica esse padrão para o domínio de promotores.

## Goals

- [ ] Gerar automaticamente, toda sexta-feira, o mesmo relatório (conteúdo e ordem de seções) hoje produzido manualmente, para cada cliente com o módulo de promotores habilitado.
- [ ] Enviar esse relatório por e-mail ao(s) admin(s) do cliente, sem intervenção manual.
- [ ] Tornar o mecanismo escalável: um cliente novo com o módulo habilitado passa a receber o relatório sem alteração de código.

## Out of Scope

Explicitamente excluído. Documentado para prevenir scope creep.

| Feature | Reason |
| --- | --- |
| Dashboard self-service para o admin configurar frequência/destinatários do relatório | Ticket pede um fluxo automático fixo (semanal, admins do cliente); configuração self-service é um produto à parte |
| Interpretação textual livre das observações (ex.: inferir "oficina fechada"/"fora do perfil" por palavra-chave) para montar cards de destaque como no relatório manual | Decidido em discuss: MVP usa listagem determinística do campo OBS, sem heurística de linguagem natural (risco de falso positivo/negativo) — ver Deferred Ideas em [context.md](context.md) |
| Canais de envio além de e-mail (WhatsApp, etc.) | Ticket pede especificamente envio por e-mail ao admin |
| Qualquer DDL/migration executada automaticamente em produção | Instrução explícita do usuário: toda alteração de schema roda manual, a partir de script gerado |
| Escrita/alteração de dados de negócio no banco de produção via este fluxo | Este fluxo é somente leitura (SELECT) sobre dados de campanha/visita; a única escrita permitida é a própria tabela de controle de envio (dedupe/auditoria) deste feature |

---

## Assumptions & Open Questions

Toda ambiguidade foi resolvida ou registrada aqui.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Mecanismo exato de integração cross-service (backend-promotor ↔ backend-ob-ads) para resolver admins e enviar e-mail | Decisão de Design, não de produto; backend-promotor hoje não tem client SQL Server nem SES configurado, backend-ob-ads já tem ambos prontos (`EmailService`, `ClientClientTraining`→`Usuario`) | Specify captura o QUÊ, não o COMO; ver `Agent's Discretion` em context.md | n |
| Mecanismo de deduplicação/auditoria de envio (nova tabela vs. reaproveitar padrão `CommunityReportConfig`) | Decisão de Design; requisito funcional (não reenviar o mesmo período duas vezes) é obrigatório, a estrutura de dados é decisão de implementação | Mesma razão acima | n |
| Retenção do PDF gerado | Não arquivar o binário do PDF a longo prazo; persistir só metadados do envio (cliente, período, timestamp, status) | MVP enxuto; o PDF pode ser regenerado sob demanda a partir dos mesmos dados/período se necessário | n |
| Tamanho máximo do texto de OBS exibido no PDF | Truncar em 500 caracteres com reticências | Limite de layout do PDF (cards/tabela não têm espaço ilimitado); valor arbitrário mas suficiente para o conteúdo observado no modelo | n |
| Horário exato do cron na sexta-feira | 07:00 America/Sao_Paulo | Antes do expediente, dá tempo do time ver antes do cliente perguntar; mesmo fuso usado no corte de período | n |
| Nome da env flag que liga/desliga o schedule | `PROMOTOR_RELATORIO_ENABLED` (string `"1"`) | Segue a convenção já usada em `schedule/outboxNotificacaoCron.ts` (`*_ENABLED === "1"`, não `"true"`) | n |
| Definição de "Campanha ativa" para fins de inclusão no relatório | Usa o campo de status já existente na entidade `Campanha` (o mesmo critério usado hoje para considerar uma campanha operante); detalhe exato do valor de status é resolvido na fase de Design ao ler o enum real | Specify não deve inventar um valor de enum sem confirmar no código/schema | n |
| Múltiplos admins por cliente | Um único envio por cliente/período, todos os e-mails de admin no `To` | Decidido em discuss | y |
| Cliente sem nenhum admin resolvido | Não envia; registra falha de resolução de destinatário para aquele cliente, não impede os demais clientes | Decidido em discuss (combinação com tratamento de falha) | y |
| Cliente com mais de uma `Campanha` ativa vinculada | **Revisado em discuss**: não agrega — o relatório segmenta por campanha. Um único PDF/e-mail por cliente, mas com um bloco completo (todas as 6 seções de dados) por campanha ativa | Ticket ficou ambíguo nesse ponto; agregar misturaria métricas de campanhas distintas (ex.: assertividade de uma campanha nova com poucos dias junto da de uma campanha madura) | y |

**Open questions:** none — todas resolvidas ou registradas acima.

---

## User Stories

### P1: Relatório semanal correto e completo para um cliente ⭐ MVP

**User Story**: Como admin do cliente (SKF), quero receber por e-mail o relatório semanal de visitas dos promotores com as mesmas seções e a mesma ordem do relatório que recebo hoje manualmente, para acompanhar a campanha sem precisar pedir pra alguém da Oficina Brasil gerar na mão.

**Why P1**: É o núcleo do valor pedido no ticket — sem o conteúdo correto, automatizar o envio não ajuda ninguém.

**Acceptance Criteria** (each line is one EARS pattern):

1. WHEN o relatório é gerado para um cliente THEN o sistema SHALL produzir um PDF com uma capa única seguida de um bloco de dados por campanha ativa do cliente, cada bloco contendo, nesta ordem, as 6 seções: visão geral, assertividade, performance por promotor, cancelamentos, destaques do campo (observações), próximos passos. <!-- RELPROM-01, event-driven -->
2. The system SHALL calcular "visitas concluídas" do período, por campanha, como a contagem de registros de rota de promotor com status `FINALIZADO` e data de conclusão dentro da janela do período, restrita àquela campanha. <!-- RELPROM-02, ubiquitous -->
3. The system SHALL calcular "canceladas" do período, por campanha, como a contagem de registros de rota de promotor com status `CANCELADO` e data de cancelamento dentro da janela do período, restrita àquela campanha. <!-- RELPROM-03, ubiquitous -->
4. The system SHALL calcular "abertas na rota", por campanha, como a contagem de registros com status `BACKLOG` ou `A_CAMINHO` daquela campanha, excluindo os marcados como `AGUARDANDO`, no momento da geração (foto do estado atual, não limitado à janela do período). <!-- RELPROM-04, ubiquitous -->
5. The system SHALL calcular a assertividade do período, por campanha, como concluídas ÷ (concluídas + canceladas) daquela campanha no período, expressa em porcentagem arredondada ao inteiro mais próximo. <!-- RELPROM-05, ubiquitous -->
6. IF concluídas + canceladas do período de uma campanha for igual a 0 THEN o sistema SHALL exibir a assertividade daquela campanha como "N/A" em vez de uma divisão por zero. <!-- RELPROM-06, unwanted-behavior -->
7. The system SHALL listar, por promotor vinculado a cada campanha, as colunas: concluídas no período, canceladas no período, concluídas no acumulado desde o início daquela campanha, abertas na rota — incluindo promotores com todos os valores em zero. <!-- RELPROM-07, ubiquitous -->
8. The system SHALL listar, por campanha, cada cancelamento do período com promotor, oficina, cidade e o texto do campo de observação (OBS) quando preenchido. <!-- RELPROM-08, ubiquitous -->
9. The system SHALL listar, na seção de destaques do campo de cada campanha, toda visita concluída ou cancelada no período daquela campanha cujo campo OBS esteja preenchido, agrupada por status (concluída com observação / cancelada com justificativa), sem gerar texto interpretativo além do conteúdo do campo OBS. <!-- RELPROM-09, ubiquitous -->
10. The system SHALL calcular os contadores de "próximos passos" de cada campanha como: total de oficinas abertas na rota daquela campanha, total de canceladas no período a redistribuir, e quantidade de promotores daquela campanha com zero visitas concluídas no período. <!-- RELPROM-10, ubiquitous -->
11. WHEN o relatório de um cliente é gerado com sucesso THEN o sistema SHALL enviar um e-mail com o PDF anexado para todos os usuários com `IS_ADMIN = 1` vinculados a esse cliente. <!-- RELPROM-11, event-driven -->
12. IF nenhum admin for resolvido para o cliente THEN o sistema SHALL registrar a falha de resolução de destinatário e SHALL NOT tentar enviar e-mail para esse cliente nessa execução. <!-- RELPROM-12, unwanted-behavior -->
13. IF o cliente não teve nenhuma visita concluída ou cancelada no período THEN o sistema SHALL gerar e enviar o relatório normalmente, com os contadores do período em zero. <!-- RELPROM-13, unwanted-behavior -->
14. WHEN o cliente tiver mais de uma campanha ativa THEN o sistema SHALL incluir, no mesmo PDF e no mesmo e-mail, um bloco de dados completo e identificado pelo nome da campanha para cada campanha ativa — sem agregar métricas entre campanhas diferentes. <!-- RELPROM-26, event-driven -->
15. WHEN o cliente tiver exatamente uma campanha ativa THEN o sistema SHALL exibir um único bloco de dados, identificado pelo nome dessa campanha. <!-- RELPROM-27, event-driven -->

**Independent Test**: Disparar a geração manualmente para o cliente SKF (sem esperar o cron) e comparar o PDF resultante, seção a seção, com o modelo anexado ao CON26-325 — mesmas seções, mesma ordem, números batendo com uma consulta SELECT equivalente no banco de produção. Repetir com um cliente de teste com 2 campanhas ativas e confirmar 2 blocos de dados distintos no mesmo PDF, sem mistura de números entre eles.

---

### P2: Execução automática semanal, sem intervenção manual

**User Story**: Como Oficina Brasil (squad de Interação), quero que o relatório seja gerado e enviado automaticamente toda sexta-feira, para eliminar o trabalho manual semanal de consultar o banco e montar o PDF.

**Why P2**: Automatizar o disparo é o que de fato tira o trabalho manual do analista — sem isso, P1 ainda exigiria alguém rodar o processo na mão toda semana.

**Acceptance Criteria**:

1. The system SHALL executar uma rotina agendada toda sexta-feira, em horário fixo, fuso America/Sao_Paulo, que dispara a geração e o envio do relatório para todos os clientes elegíveis. <!-- RELPROM-14, ubiquitous -->
2. The system SHALL considerar como período do relatório os 7 dias corridos anteriores ao dia do disparo, com corte às 23:59:59 America/Sao_Paulo do dia anterior ao disparo (ex.: disparo na sexta cobre de sexta anterior até a quinta imediatamente anterior, dia completo). <!-- RELPROM-15, ubiquitous -->
3. WHILE a env flag que liga a rotina agendada não estiver definida como `"1"` THEN o sistema SHALL NOT executar a rotina agendada (mesma convenção de `schedule/outboxNotificacaoCron.ts`). <!-- RELPROM-16, state-driven -->
4. IF a geração ou o envio falhar para um cliente específico THEN o sistema SHALL registrar a falha com identificação do cliente e o motivo, e SHALL continuar o processamento dos demais clientes elegíveis na mesma execução. <!-- RELPROM-17, unwanted-behavior -->
5. The system SHALL registrar, por cliente e por período coberto, que o relatório foi gerado/enviado, de forma a impedir um segundo envio do mesmo período para o mesmo cliente caso a rotina seja disparada mais de uma vez (idempotência). <!-- RELPROM-18, ubiquitous -->
6. WHEN a rotina agendada termina de processar todos os clientes elegíveis THEN o sistema SHALL registrar um resumo da execução (quantos clientes elegíveis, quantos enviados com sucesso, quantos falharam). <!-- RELPROM-19, event-driven -->

**Independent Test**: Com a flag ligada, forçar a data do processo para uma sexta-feira (ou expor um disparo manual equivalente ao do cron) e verificar nos logs que todos os clientes elegíveis foram processados, que o resumo bate com a quantidade de clientes, e que rodar a rotina duas vezes seguidas não gera dois e-mails para o mesmo cliente/período.

---

### P3: Escalável para qualquer cliente com o módulo de promotores

**User Story**: Como Oficina Brasil, quero que qualquer cliente (não só a SKF) que tenha o módulo de promotores habilitado passe a receber o mesmo relatório automaticamente, sem eu precisar escrever código específico para esse cliente.

**Why P3**: É o requisito explícito de escalabilidade do ticket — sem isso a automação resolve só o caso da SKF e o problema de "generalizar para outros clientes" continua manual.

**Acceptance Criteria**:

1. WHERE um cliente tiver o módulo "Promotores" habilitado (registro ativo em `cliente_module` apontando para o módulo `"Promotores"`) THEN o sistema SHALL incluir esse cliente na rotina agendada, sem necessidade de alteração de código. <!-- RELPROM-20, optional-feature -->
2. WHEN um cliente passa a ter o módulo "Promotores" habilitado THEN o sistema SHALL passar a gerar/enviar o relatório para esse cliente a partir da próxima execução agendada, sem exigir deploy. <!-- RELPROM-21, event-driven -->
3. IF um cliente tiver o módulo "Promotores" habilitado mas nenhuma campanha ativa vinculada THEN o sistema SHALL tratá-lo como sem dado disponível para o período (ver RELPROM-13) em vez de erro. <!-- RELPROM-22, unwanted-behavior -->

**Independent Test**: Habilitar o módulo "Promotores" para um segundo cliente de teste (sem tocar em código), rodar a rotina manualmente, e confirmar que esse cliente também recebe o relatório, com o mesmo formato usado para a SKF.

---

## Edge Cases

- IF a integração usada para resolver admins/enviar e-mail (backend-ob-ads) estiver indisponível THEN o sistema SHALL tratar isso como falha daquele cliente (RELPROM-17), sem derrubar a execução dos demais clientes. <!-- RELPROM-23 -->
- IF o texto do campo OBS exceder 500 caracteres THEN o sistema SHALL truncar o texto exibido no PDF em 500 caracteres seguidos de reticências. <!-- RELPROM-24 -->
- WHEN uma visita tem `DONE_AT`/data de cancelamento exatamente no instante de corte (23:59:59 America/Sao_Paulo do dia anterior ao disparo) THEN o sistema SHALL incluí-la no período que está terminando (limite superior inclusivo). <!-- RELPROM-25 -->
- IF um promotor não teve nenhuma visita concluída nem cancelada no período, mas tem oficinas abertas na rota THEN o sistema SHALL listá-lo na tabela por promotor com as colunas de período zeradas e a coluna de abertas na rota preenchida (não omitir a linha). <!-- coberto por RELPROM-07 -->

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| RELPROM-01 | P1: Relatório semanal correto | Design | Pending |
| RELPROM-02 | P1: Relatório semanal correto | Design | Pending |
| RELPROM-03 | P1: Relatório semanal correto | Design | Pending |
| RELPROM-04 | P1: Relatório semanal correto | Design | Pending |
| RELPROM-05 | P1: Relatório semanal correto | Design | Pending |
| RELPROM-06 | P1: Relatório semanal correto | Design | Pending |
| RELPROM-07 | P1: Relatório semanal correto | Design | Pending |
| RELPROM-08 | P1: Relatório semanal correto | Design | Pending |
| RELPROM-09 | P1: Relatório semanal correto | Design | Pending |
| RELPROM-10 | P1: Relatório semanal correto | Design | Pending |
| RELPROM-11 | P1: Relatório semanal correto | Design | Pending |
| RELPROM-12 | P1: Relatório semanal correto | Design | Pending |
| RELPROM-13 | P1: Relatório semanal correto | Design | Pending |
| RELPROM-26 | P1: Relatório semanal correto | Design | Pending |
| RELPROM-27 | P1: Relatório semanal correto | Design | Pending |
| RELPROM-14 | P2: Execução automática semanal | Design | Pending |
| RELPROM-15 | P2: Execução automática semanal | Design | Pending |
| RELPROM-16 | P2: Execução automática semanal | Design | Pending |
| RELPROM-17 | P2: Execução automática semanal | Design | Pending |
| RELPROM-18 | P2: Execução automática semanal | Design | Pending |
| RELPROM-19 | P2: Execução automática semanal | Design | Pending |
| RELPROM-20 | P3: Escalável para qualquer cliente | Design | Pending |
| RELPROM-21 | P3: Escalável para qualquer cliente | Design | Pending |
| RELPROM-22 | P3: Escalável para qualquer cliente | Design | Pending |
| RELPROM-23 | Edge Case | Design | Pending |
| RELPROM-24 | Edge Case | Design | Pending |
| RELPROM-25 | Edge Case | Design | Pending |

**ID format:** `RELPROM-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 27 total, 0 mapped to tasks, 27 unmapped ⚠️ (esperado — Tasks ainda não rodou)

---

## Success Criteria

Como saberemos que a feature foi bem-sucedida:

- [ ] O relatório semanal da SKF é gerado e enviado automaticamente toda sexta-feira, sem intervenção manual, com as mesmas 7 seções e a mesma ordem do modelo do CON26-325.
- [ ] Um cliente novo com o módulo "Promotores" habilitado passa a receber o relatório no próximo ciclo semanal, sem alteração de código.
- [ ] Nenhum envio duplicado ocorre para o mesmo cliente/período, mesmo se a rotina for disparada mais de uma vez.
- [ ] Falha em um cliente (sem admin resolvido, integração fora do ar) não impede o envio para os demais clientes elegíveis na mesma execução.
- [ ] Um cliente com 2+ campanhas ativas recebe um único e-mail/PDF com um bloco de dados por campanha, sem misturar métricas entre campanhas.
