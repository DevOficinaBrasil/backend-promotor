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
| Interpretação textual livre das observações pra inferir categorias automáticas (ex.: "oficina fechada"/"fora do perfil" por palavra-chave) e montar cards de destaque a partir disso | Decidido em discuss: a listagem de destaques (RELPROM-09) continua determinística, sem heurística de linguagem natural — ver Deferred Ideas em [context.md](context.md). **Revisado (P7)**: isso não impede a frase curta de síntese gerada por IA por seção (RELPROM-49 a 52), que é um recurso à parte, com validação própria contra alucinação (RELPROM-50) |
| Texto gerado por IA mais longo que 1 frase por seção, ou cobrindo outra coisa além das 6 seções já existentes (ex.: parágrafo de análise completo como no modelo, resumo executivo na capa) | Decidido em discuss (P7): escopo inicial é 1 frase curta por cabeçalho de seção; parágrafos de análise mais longos ficam pra uma iteração futura, quando a validação anti-alucinação (RELPROM-50) tiver rodado em produção por um tempo |
| Canais de envio além de e-mail (WhatsApp, etc.) | Ticket pede especificamente envio por e-mail ao admin |
| Qualquer DDL/migration executada automaticamente em produção | Instrução explícita do usuário: toda alteração de schema roda manual, a partir de script gerado |
| Escrita/alteração de dados de negócio no banco de produção via este fluxo | Este fluxo é somente leitura (SELECT) sobre dados de campanha/visita; a única escrita permitida é a própria tabela de controle de envio (dedupe/auditoria) deste feature |
| Habilitar de fato o módulo "promotores" no SQL Server (rodar o INSERT em `module`/conceder via `cliente_module`) | **Adicionado após o Execute**: SQL Server entra em congelamento pré-migração pra Postgres (AD-006, `.specs/STATE.md`) — o DBA pediu pra não acrescentar nada lá (nem tabela, nem coluna, nem linha) enquanto a migração não terminar. O código do módulo (T02-T07) fica pronto e testado, mas dormente; produção usa a allowlist fixa de RELPROM-40/41 até a migração acabar |

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
| Critério para distinguir "ambiente de dev" do "de produção" (guarda de destinatários) | `NODE_ENV !== "production"` é tratado como não-produção | Convenção Node mais comum; repo já usa `NODE_ENV` para distinguir `test` em outro cron (`schedule/outboxNotificacaoCron.ts`); escolha conservadora, pois qualquer ambiente não explicitamente marcado `production` cai no modo seguro (não manda pro admin real) | n |
| Onde/como a lista fixa de destinatários de teste é definida | Constante no código (ex.: `DEV_REPORT_RECIPIENTS` em um arquivo de config), não em variável de ambiente | Pedido explícito do usuário: "lista de e-mails que ficará definida em código" | y |
| Identificador do cliente usado na rota de disparo manual (`EMPRESA_SLUG` vs `ID_CLIENT`) | Decisão de Design, a partir do que já é usado em outras rotas `/admin/*` existentes | Specify não deve inventar o formato de um path param sem checar a convenção real das rotas administrativas já existentes | n |
| Endpoint de disparo manual: síncrono (retorna o PDF na mesma resposta) ou assíncrono (dispara e retorna 202, PDF disponível depois) | Síncrono — retorna o PDF na mesma requisição | Caso de uso é teste/depuração e preview de frontend; geração de 1 cliente é rápida o bastante pra não precisar de fila/job assíncrono no MVP | n |
| **P7**: Bucket S3 (`AWS_BUCKET_NAME`) já existe e as credenciais `AWS_*` já têm permissão de `PutObject`/ACL de leitura pública nele | Assumido; a confirmar no Design/antes do Execute — nenhuma das duas coisas foi verificada nesta sessão | `AWS_*` está em `.env.example` desde antes desta feature (residue de projeto forkado, nunca integrado — ver `.specs/codebase/CONCERNS.md`), sem garantia de que aponta pra um bucket real com essa permissão | n |
| **P7**: Modelo exato da OpenAI (`gpt-4o-mini` vs outro) e parâmetros (temperatura, limite de tokens) | Decisão de Design (custo/latência/qualidade do texto), não de produto | Specify captura o QUÊ (1 frase de síntese por seção), não o COMO | n |
| **P7**: `OPENAI_API_KEY` não existe em nenhum `.env` deste repo — precisa ser provisionada pelo usuário antes do Execute rodar contra a API de verdade (testes usam mock, não dependem da chave) | Usuário fornece a chave quando o Execute chegar nessa task | Fora do alcance do agente — chave de API paga de terceiro | n |

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
11. WHEN o relatório de um cliente é gerado com sucesso THEN o sistema SHALL enviar um e-mail com o PDF anexado para todos os usuários vinculados a esse cliente (FK direto ou M:N `USUARIO_X_CLIENTES` ativo), excluindo quem tem acesso de admin ao painel do ob-ads (`IS_ADMIN`) e staff interno (`@oficinabrasil.com.br`). <!-- RELPROM-11, event-driven, **corrigido pós-Execute**: `IS_ADMIN=1` marca acesso ao painel administrativo do ob-ads, não quem representa o cliente — ver AD-008 em STATE.md -->
12. IF nenhum admin for resolvido para o cliente THEN o sistema SHALL registrar a falha de resolução de destinatário e SHALL NOT tentar enviar e-mail para esse cliente nessa execução. <!-- RELPROM-12, unwanted-behavior -->
13. IF o cliente não teve nenhuma visita concluída ou cancelada no período THEN o sistema SHALL gerar e enviar o relatório normalmente, com os contadores do período em zero. <!-- RELPROM-13, unwanted-behavior -->
14. WHEN o cliente tiver mais de uma campanha ativa THEN o sistema SHALL incluir, no mesmo PDF e no mesmo e-mail, um bloco de dados completo e identificado pelo nome da campanha para cada campanha ativa — sem agregar métricas entre campanhas diferentes. <!-- RELPROM-26, event-driven -->
15. WHEN o cliente tiver exatamente uma campanha ativa THEN o sistema SHALL exibir um único bloco de dados, identificado pelo nome dessa campanha. <!-- RELPROM-27, event-driven -->
16. WHILE o ambiente de execução não for produção (`NODE_ENV !== "production"`) THEN o sistema SHALL enviar o e-mail do relatório de cada cliente apenas para a lista fixa de destinatários de teste definida em código, nunca para os admins reais resolvidos daquele cliente. <!-- RELPROM-28, state-driven -->
17. WHILE o ambiente de execução não for produção THEN o sistema SHALL registrar em log, para cada cliente processado, a lista de e-mails de admin que teriam sido os destinatários reais, sem enviar e-mail para eles. <!-- RELPROM-29, state-driven -->
18. IF a lista fixa de destinatários de teste estiver vazia fora de produção THEN o sistema SHALL NOT enviar nenhum e-mail para aquele cliente e SHALL registrar essa condição em log, tratando-a como falha de resolução de destinatário (mesmo tratamento de RELPROM-12). <!-- RELPROM-30, unwanted-behavior -->
19. WHILE o ambiente de execução for produção THEN o sistema SHALL enviar exclusivamente para os admins reais resolvidos do cliente (RELPROM-11), SHALL NOT usar a lista fixa de destinatários de teste. <!-- RELPROM-31, state-driven -->
20. The system SHALL exibir, na seção de visão geral de cada campanha, um gráfico comparativo de visitas concluídas x canceladas por dia do período, incluindo só os dias com pelo menos 1 visita concluída ou cancelada. <!-- RELPROM-44, ubiquitous, adicionado pós-Execute: modelo do CON26-325 tem esse gráfico na página de visão geral, faltava no PDF gerado -->

**Independent Test**: Disparar a geração manualmente para o cliente SKF (sem esperar o cron) e comparar o PDF resultante, seção a seção, com o modelo anexado ao CON26-325 — mesmas seções, mesma ordem, números batendo com uma consulta SELECT equivalente no banco de produção. Repetir com um cliente de teste com 2 campanhas ativas e confirmar 2 blocos de dados distintos no mesmo PDF, sem mistura de números entre eles. Rodar fora de produção e confirmar: o e-mail chega só na lista fixa de teste, nunca no admin real do cliente, e o log mostra quais e-mails de admin teriam sido os destinatários reais. Confirmar que a visão geral mostra o gráfico por dia, com barras só nos dias com atividade (RELPROM-44).

---

### P2: Disparo manual via endpoint administrativo

**User Story**: Como time de Oficina Brasil (dev/QA) ou uma futura tela administrativa, quero disparar a geração (e, opcionalmente, o envio) do relatório de um cliente sob demanda, via um endpoint HTTP autenticado, para testar o relatório sem esperar o cron semanal e para já existir uma integração pronta para o frontend usar no futuro.

**Why P2**: Sem um endpoint, validar P1 em dev depende de rodar script/consulta manual sem superfície HTTP — trava o teste e não deixa nada pronto para uma tela administrativa futura pedir o relatório sob demanda.

**Acceptance Criteria**:

1. The system SHALL expose um endpoint HTTP administrativo, protegido por `adminAuthMiddleware` (mesma convenção dos demais endpoints `/admin/*`, AD-004), que dispara a geração do relatório para um cliente específico identificado na requisição. <!-- RELPROM-32, ubiquitous -->
2. WHEN o endpoint é chamado sem parâmetros de período THEN o sistema SHALL usar a mesma regra de janela do disparo agendado (últimos 7 dias corridos, corte quinta 23:59:59 America/Sao_Paulo) — RELPROM-15. <!-- RELPROM-33, event-driven -->
3. WHERE o endpoint for chamado com um período explícito (data de início/fim) THEN o sistema SHALL gerar o relatório para esse período customizado, em vez da janela padrão — uso de teste/depuração. <!-- RELPROM-34, optional-feature -->
4. WHEN o endpoint é chamado THEN o sistema SHALL aplicar a mesma segmentação por campanha (RELPROM-01, RELPROM-26, RELPROM-27) e os mesmos cálculos (RELPROM-02 a RELPROM-10) usados no fluxo agendado — nenhuma lógica duplicada ou divergente entre os dois gatilhos. <!-- RELPROM-35, ubiquitous -->
5. The system SHALL retornar, na resposta do endpoint, o PDF gerado (para permitir pré-visualização/download imediato, inclusive por um frontend futuro), independentemente de o e-mail ter sido enviado ou não. <!-- RELPROM-36, ubiquitous -->
6. WHERE o endpoint for chamado para também disparar o e-mail (comportamento padrão) THEN o sistema SHALL aplicar a mesma guarda de ambiente dev/produção já definida (RELPROM-28 a RELPROM-31) — em dev, o e-mail real vai só para a lista fixa de teste, nunca para o admin do cliente. <!-- RELPROM-37, state-driven -->
7. WHERE o endpoint for chamado em modo somente-pré-visualização (sem disparar e-mail) THEN o sistema SHALL gerar e retornar o PDF sem enviar nenhum e-mail. <!-- RELPROM-38, optional-feature -->
8. IF o cliente informado não existir ou não tiver o módulo "promotores" habilitado THEN o endpoint SHALL responder 404 sem gerar PDF nem tentar enviar e-mail. **Corrigido no Execute**: cliente com módulo habilitado mas sem campanha ativa NÃO é mais erro aqui — segue a mesma regra de RELPROM-13/22 (gera com contadores zerados), pra não ter 2 comportamentos diferentes pra mesma condição entre o cron e o endpoint manual. <!-- RELPROM-39, unwanted-behavior -->

**Independent Test**: Chamar o endpoint autenticado como admin interno para o cliente SKF em dev, sem esperar sexta-feira nem o cron: confirmar que o PDF retornado bate com o gerado pelo fluxo agendado para o mesmo período, que o e-mail (quando solicitado) só chega na lista fixa de teste, e que o modo somente-pré-visualização não dispara e-mail nenhum.

---

### P3: Execução automática semanal, sem intervenção manual

**User Story**: Como Oficina Brasil (squad de Interação), quero que o relatório seja gerado e enviado automaticamente toda sexta-feira, para eliminar o trabalho manual semanal de consultar o banco e montar o PDF.

**Why P3**: Automatizar o disparo é o que de fato tira o trabalho manual do analista — sem isso, P1/P2 ainda exigiriam alguém rodar o processo na mão toda semana.

**Acceptance Criteria**:

1. The system SHALL executar uma rotina agendada toda sexta-feira, em horário fixo, fuso America/Sao_Paulo, que dispara a geração e o envio do relatório para todos os clientes elegíveis. <!-- RELPROM-14, ubiquitous -->
2. The system SHALL considerar como período do relatório os 7 dias corridos anteriores ao dia do disparo, com corte às 23:59:59 America/Sao_Paulo do dia anterior ao disparo (ex.: disparo na sexta cobre de sexta anterior até a quinta imediatamente anterior, dia completo). <!-- RELPROM-15, ubiquitous -->
3. WHILE a env flag que liga a rotina agendada não estiver definida como `"1"` THEN o sistema SHALL NOT executar a rotina agendada (mesma convenção de `schedule/outboxNotificacaoCron.ts`). <!-- RELPROM-16, state-driven -->
4. IF a geração ou o envio falhar para um cliente específico THEN o sistema SHALL registrar a falha com identificação do cliente e o motivo, e SHALL continuar o processamento dos demais clientes elegíveis na mesma execução. <!-- RELPROM-17, unwanted-behavior -->
5. The system SHALL registrar, por cliente e por período coberto, que o relatório foi gerado/enviado, de forma a impedir um segundo envio do mesmo período para o mesmo cliente caso a rotina seja disparada mais de uma vez (idempotência). <!-- RELPROM-18, ubiquitous -->
6. WHEN a rotina agendada termina de processar todos os clientes elegíveis THEN o sistema SHALL registrar um resumo da execução (quantos clientes elegíveis, quantos enviados com sucesso, quantos falharam). <!-- RELPROM-19, event-driven -->

**Independent Test**: Com a flag ligada, forçar a data do processo para uma sexta-feira (ou expor um disparo manual equivalente ao do cron) e verificar nos logs que todos os clientes elegíveis foram processados, que o resumo bate com a quantidade de clientes, e que rodar a rotina duas vezes seguidas não gera dois e-mails para o mesmo cliente/período.

---

### P4: Escalável para qualquer cliente com o módulo de promotores

**User Story**: Como Oficina Brasil, quero que qualquer cliente (não só a SKF) que tenha o módulo de promotores habilitado passe a receber o mesmo relatório automaticamente, sem eu precisar escrever código específico para esse cliente.

**Why P4**: É o requisito explícito de escalabilidade do ticket — sem isso a automação resolve só o caso da SKF e o problema de "generalizar para outros clientes" continua manual.

**Acceptance Criteria**:

1. WHERE um cliente tiver o módulo "Promotores" habilitado (registro ativo em `cliente_module` apontando para o módulo `"Promotores"`) THEN o sistema SHALL incluir esse cliente na rotina agendada, sem necessidade de alteração de código. <!-- RELPROM-20, optional-feature -->
2. WHEN um cliente passa a ter o módulo "Promotores" habilitado THEN o sistema SHALL passar a gerar/enviar o relatório para esse cliente a partir da próxima execução agendada, sem exigir deploy. <!-- RELPROM-21, event-driven -->
3. IF um cliente tiver o módulo "Promotores" habilitado mas nenhuma campanha ativa vinculada THEN o sistema SHALL tratá-lo como sem dado disponível para o período (ver RELPROM-13) em vez de erro. <!-- RELPROM-22, unwanted-behavior -->

**Independent Test**: Habilitar o módulo "Promotores" para um segundo cliente de teste (sem tocar em código), rodar a rotina manualmente, e confirmar que esse cliente também recebe o relatório, com o mesmo formato usado para a SKF.

**Status pós-Execute**: RELPROM-20/21/22 continuam implementados e testados (`ModuloClientesService`, endpoints `/internal/modulos/*`), mas **dormentes** em produção — ver RELPROM-40/41 abaixo. Reativar é trocar a fonte de clientes elegíveis de volta pra `ObAdsIntegrationClient.listarClientesHabilitados`, sem reescrever nada.

---

### P5: Restrição temporária a SKF (SQL Server em congelamento pré-migração)

**User Story**: Como Oficina Brasil, quero que o relatório automático só seja enviado pra SKF em produção por enquanto, sem depender de nenhuma tabela nova no SQL Server, porque o DBA pediu pra não acrescentar nada lá antes da migração pra Postgres e a SKF é o único cliente de fato usando o módulo hoje.

**Why P5**: Decisão operacional pós-Execute (AD-006, `.specs/STATE.md`) — sem isso, ou o cron não envia pra ninguém (módulo nunca habilitado no SQL Server) ou violaria o pedido do DBA criando a linha do módulo.

**Acceptance Criteria**:

1. The system SHALL determinar os clientes elegíveis, em produção, por uma allowlist fixa em código no backend-promotor (`config/promotorReportClientesProducao.ts`), em vez de consultar `cliente_module` no SQL Server. <!-- RELPROM-40, ubiquitous -->
2. The system SHALL conter, por enquanto, só o cliente SKF (`ID_CLIENTE = 126`) nessa allowlist. <!-- RELPROM-41, ubiquitous -->
3. The system SHALL resolver os admins de um cliente da allowlist direto por `ID_CLIENTE` (endpoint interno novo `GET /internal/clientes/:idCliente/admins`, sem depender de `module`/`cliente_module`). <!-- RELPROM-42, ubiquitous -->
4. The system SHALL NOT escrever nenhuma linha nova em `module`/`cliente_module` (SQL Server) enquanto AD-006 estiver ativa. <!-- RELPROM-43, unwanted-behavior -->

**Independent Test**: Rodar o cron (ou o endpoint manual) em produção e confirmar que só a SKF recebe e-mail, mesmo que outro cliente tenha dados de campanha prontos; confirmar por `git diff`/revisão que nenhum script SQL desta mudança roda `INSERT`/`CREATE` no SQL Server.

---

### P6: Arquivamento do PDF no S3

**User Story**: Como Oficina Brasil, quero que o PDF de cada envio fique arquivado no S3 com o link salvo no registro de auditoria, para poder consultar depois o PDF exato que foi enviado numa semana específica sem precisar regerar.

**Why P6**: Hoje `PROMOTOR_RELATORIO_ENVIO` só guarda metadados (status, destinatários) — ninguém consegue abrir de novo o PDF de uma semana passada depois que ele já foi enviado, a não ser regerando (e os números podem já ter mudado, como visto na comparação do PDF de teste com o modelo).

**Acceptance Criteria**:

1. WHEN o relatório de um cliente é gerado com `enviarEmail=true` (cron ou manual) THEN o sistema SHALL fazer upload do PDF pro S3 (bucket `AWS_BUCKET_NAME`, chave `promotor-relatorio/{idCliente}/{periodoInicio}_{periodoFim}.pdf`) e SHALL gravar a URL pública do objeto numa coluna nova (`LINK_PDF`) do registro de auditoria daquele envio. <!-- RELPROM-45, event-driven -->
2. IF o upload pro S3 falhar THEN o sistema SHALL continuar o envio do e-mail normalmente e SHALL gravar o registro de auditoria sem `LINK_PDF` (nulo), logando a falha — o S3 nunca bloqueia o envio. <!-- RELPROM-46, unwanted-behavior -->
3. The system SHALL publicar o objeto no S3 com acesso público de leitura, sem autenticação e sem expiração — decisão explícita do usuário em discuss, aceitando o risco de exposição por URL (a URL não é listada publicamente, mas também não expira nem exige login). <!-- RELPROM-47, ubiquitous -->
4. WHERE `enviarEmail=false` (modo preview, RELPROM-38) THEN o sistema SHALL NOT fazer upload pro S3 nem gravar `LINK_PDF` — mesmo tratamento já dado ao resto da auditoria nesse modo. <!-- RELPROM-48, optional-feature -->

**Independent Test**: Gerar o relatório da SKF com envio de e-mail ligado, confirmar que a URL gravada em `LINK_PDF` abre o mesmo PDF que foi anexado ao e-mail, sem exigir login. Derrubar a credencial/permissão do S3 temporariamente e confirmar que o e-mail ainda sai normalmente, só sem `LINK_PDF` preenchido.

---

### P7: Observações adicionais geradas por IA

**User Story**: Como admin do cliente, quero que cada seção do relatório traga uma frase curta de síntese (gerada por IA a partir dos números e observações já calculados daquela seção), para ter uma leitura mais rápida do que aconteceu na semana — como o relatório de exemplo do ticket já faz.

**Why P7**: O relatório hoje só lista números e tabelas; o modelo do CON26-325 tem frases como "Willian lidera o período; BH e Ribeirão Preto sem visitas" que dão contexto imediato sem o leitor precisar interpretar a tabela sozinho.

**Acceptance Criteria**:

1. WHEN o relatório de uma campanha é gerado THEN o sistema SHALL gerar 1 frase curta de síntese para cada uma das 6 seções (visão geral, assertividade, performance por promotor, cancelamentos, destaques do campo, próximos passos), usando só os dados já calculados daquela seção como entrada — a IA nunca recebe a tarefa de calcular ou recontar nada, só de descrever em prosa o que os números/observações já calculados mostram. **Revisado (RELPROM-64)**: a síntese de "performance por promotor" é calculada de forma determinística (sem IA) — as outras 5 seções continuam via API da OpenAI. <!-- RELPROM-49, event-driven -->
2. IF a frase gerada citar algum número que não aparece em nenhum valor presente nos dados calculados daquela seção THEN o sistema SHALL descartar a frase (a seção é exibida sem ela, só com o conteúdo determinístico) em vez de publicar um número potencialmente inventado. <!-- RELPROM-50, unwanted-behavior -->
3. IF a chamada à OpenAI falhar (timeout, erro, resposta vazia) THEN o sistema SHALL continuar a geração do PDF normalmente, sem a frase de síntese daquela seção, e SHALL NOT bloquear o envio do e-mail nem o restante do relatório. <!-- RELPROM-51, unwanted-behavior -->
4. The system SHALL exibir a frase de síntese (quando presente) logo abaixo do cabeçalho de cada seção, antes do conteúdo determinístico (cards/tabela/gráfico) daquela seção. <!-- RELPROM-52, ubiquitous -->

**Independent Test**: Gerar o relatório da SKF e conferir que cada uma das 6 seções, em cada bloco de campanha, traz 1 frase curta logo abaixo do título, condizente com os números daquela seção. Forçar a IA a devolver um número fora dos dados calculados (ou simular a chamada fora do ar) e confirmar que a seção correspondente aparece sem a frase, sem quebrar o resto do PDF nem o envio do e-mail.

---

### P8: Resumo de cancelamentos agrupado por IA

**User Story**: Como admin do cliente, quero que a seção de cancelamentos mostre um resumo agrupado por motivo semelhante (gerado por IA), em vez de 1 linha por cancelamento, pra identificar padrões rápido sem rolar uma tabela longa — igual ao relatório de exemplo do ticket.

**Why P8**: O modelo do CON26-325 não lista cada cancelamento isolado — agrupa por motivo (ex.: "9 oficinas: ... — Promotor de folga"). A tabela atual (1 linha por cancelamento) é correta mas verbosa pra campanhas com muitos cancelamentos parecidos.

**Acceptance Criteria**:

1. WHEN o relatório de uma campanha tem pelo menos 1 cancelamento no período THEN o sistema SHALL tentar gerar, via IA, um resumo agrupado dos cancelamentos por motivo semelhante — 1 linha por grupo (promotor, oficina(s), cidade, justificativa resumida) em vez de 1 linha por cancelamento. <!-- RELPROM-53, event-driven -->
2. The system SHALL montar promotor, oficina(s) e cidade de cada linha do resumo a partir dos dados já existentes de cada cancelamento, nunca da resposta da IA — a IA só decide quais cancelamentos pertencem ao mesmo grupo e escreve a frase de justificativa de cada grupo. <!-- RELPROM-54, ubiquitous -->
3. IF o agrupamento devolvido pela IA não cobrir exatamente todos os cancelamentos do período, 1 única vez cada (faltando algum, repetindo algum, ou citando um cancelamento inexistente) THEN o sistema SHALL descartar o resumo inteiro e exibir a tabela detalhada de hoje (1 linha por cancelamento) nessa seção, só daquela vez. <!-- RELPROM-55, unwanted-behavior -->
4. IF a frase de justificativa de algum grupo citar um número que não bate com a quantidade de cancelamentos daquele grupo THEN o sistema SHALL aplicar o mesmo fallback de RELPROM-55 (descarta o resumo inteiro, exibe a tabela detalhada). <!-- RELPROM-56, unwanted-behavior -->
5. IF a chamada à IA falhar (timeout, erro, resposta vazia) THEN o sistema SHALL exibir a tabela detalhada, mesmo fallback de RELPROM-55 — nunca bloqueia a geração do PDF nem o envio do e-mail. <!-- RELPROM-57, unwanted-behavior -->

**Independent Test**: Gerar o relatório de um cliente com vários cancelamentos de motivos parecidos (ex.: vários por "folga do promotor") e confirmar que a seção de cancelamentos mostra 1 linha por grupo, com a contagem de oficinas batendo com o real. Forçar a IA a devolver um agrupamento que não cobre todos os cancelamentos (ou simular a chamada fora do ar) e confirmar que a seção volta a mostrar a tabela detalhada de hoje, sem quebrar o resto do PDF.

---

### P9: Resumo dos destaques do campo gerado por IA

**User Story**: Como admin do cliente, quero que a seção de destaques do campo mostre até 4 insights resumindo os padrões mais notáveis das observações dos promotores (gerados por IA), em vez de 1 card por visita, pra ler rápido o que aconteceu de relevante em campo — igual ao relatório de exemplo do ticket ("O que os promotores registraram no app").

**Why P9**: O modelo do CON26-325 não lista card por card — sintetiza em até 4 temas ("Base com oficinas que não existem mais", "Rotas fora da área do promotor" etc.), cada um com um título curto e 1-2 frases. A listagem atual (1 card por visita) é correta mas verbosa pra campanhas com muitas observações.

**Acceptance Criteria**:

1. WHEN uma campanha tiver pelo menos 1 destaque de campo com OBS no período THEN o sistema SHALL tentar gerar, via IA, até 4 insights (título curto + descrição de 1-2 frases) resumindo os padrões mais notáveis, substituindo a listagem de cards individuais por visita. <!-- RELPROM-58, event-driven -->
2. The system SHALL exibir, no cabeçalho da seção, "O que os promotores registraram no app" no lugar do texto atual "Observações registradas pelos promotores". <!-- RELPROM-59, ubiquitous -->
3. The system SHALL montar cada insight a partir de um subconjunto dos destaques reais da campanha — a IA só escolhe quais destaques (por índice) formam cada insight e escreve o título e a descrição; nenhum destaque pode aparecer em mais de 1 insight. <!-- RELPROM-60, ubiquitous -->
4. IF o resultado da IA tiver mais de 4 insights, nenhum insight, um índice de destaque fora do range, ou um destaque citado em mais de 1 insight THEN o sistema SHALL descartar o resumo inteiro e exibir a listagem de cards individuais de hoje (1 card por destaque) nessa seção, só daquela vez. <!-- RELPROM-61, unwanted-behavior -->
5. IF o título ou a descrição de algum insight citar um número que não bate com nenhuma contagem real derivável dos destaques da campanha (total, por status, por cidade) ou dos contadores já calculados da visão geral THEN o sistema SHALL aplicar o mesmo fallback de RELPROM-61. <!-- RELPROM-62, unwanted-behavior -->
6. IF a chamada à IA falhar (timeout, erro, resposta vazia) THEN o sistema SHALL exibir a listagem de cards individuais, mesmo fallback de RELPROM-61 — nunca bloqueia a geração do PDF nem o envio do e-mail. <!-- RELPROM-63, unwanted-behavior -->

**Independent Test**: Gerar o relatório de uma campanha com várias observações de temas parecidos e confirmar que a seção de destaques mostra até 4 insights com título + descrição, sem exceder 4 e sem repetir destaque em 2 insights. Forçar a IA a devolver mais de 4 insights (ou simular a chamada fora do ar) e confirmar que a seção volta a mostrar 1 card por destaque, sem quebrar o resto do PDF.

---

### P10: Correções pós-revisão do PO (atribuição errada e vazamento de OBS interno)

**User Story**: Como Oficina Brasil, quero que o relatório nunca atribua um número real a um promotor errado e nunca exponha o texto bruto do campo OBS (que pode conter anotações internas de revisão de cadastro, não observações de campo) pra SKF/Cibratrade, pra manter a confiança no relatório automático e não vazar informação interna.

**Why P10**: Comparação feita pelo PO entre um relatório gerado pelo cron (30/10, 10h55) e o original apontou 2 problemas reais: (1) a frase de síntese de "performance por promotor" atribuiu o maior acumulado a um promotor errado (Homero, 21) quando a própria tabela mostra outro (Willian, 26) com valor maior — a validação atual só confere se o número existe nos dados da seção, não se está atribuído à pessoa certa; (2) o relatório copiava o campo OBS sem filtro, incluindo ~30 anotações internas de revisão de cadastro e textos antigos de "estou de folga" que levaram a IA a concluir (errado) que um promotor "pediu remarcação" na semana — esse texto bruto chegaria ao cliente se o relatório fosse enviado.

**Acceptance Criteria**:

1. The system SHALL calcular a frase de síntese da seção "Performance por promotor" de forma determinística (nome do promotor com mais visitas concluídas no período + a contagem dele), nunca via IA — elimina o risco de atribuição errada entre promotor e número. <!-- RELPROM-64, ubiquitous -->
2. The system SHALL NOT exibir o texto bruto do campo OBS em nenhuma listagem de fallback do relatório — nem na tabela detalhada de cancelamentos (fallback de RELPROM-55), nem nos cards individuais de destaques do campo (fallback de RELPROM-61); esses fallbacks mostram só dados estruturados (promotor, oficina, cidade, status). <!-- RELPROM-65, unwanted-behavior -->
3. IF qualquer texto gerado por IA sobre cancelamentos ou destaques do campo — a frase de síntese geral das seções "cancelamentos"/"destaques" (RELPROM-49), a justificativa de um grupo de cancelamentos (RELPROM-54), ou o título/descrição de um insight de destaques (RELPROM-60) — citar, mesmo parcialmente (15+ caracteres), o texto literal de uma observação original THEN o sistema SHALL descartar esse texto e aplicar o fallback correspondente (RELPROM-55/61, ou omitir a síntese geral da seção) — nunca deixa o texto bruto do OBS vazar através de nenhuma síntese da IA, mesmo que a IA ignore a instrução do prompt. <!-- RELPROM-66, unwanted-behavior -->
4. The system SHALL instruir explicitamente a IA, nos prompts de P8 e P9, a nunca citar o texto original das observações palavra por palavra e a nunca inferir ações, pedidos ou intenções dos promotores além do que está explicitamente e inequivocamente dito nos dados. <!-- RELPROM-67, ubiquitous -->

**Independent Test**: Gerar o relatório de uma campanha onde o promotor com mais concluídas no período não é o mesmo com o maior acumulado — confirmar que a frase de "performance por promotor" cita corretamente quem lidera o período. Alimentar o resumo de cancelamentos/insights de destaques com uma observação que cite verbatim um trecho de 15+ caracteres do OBS original e confirmar que o resumo/insight correspondente é descartado, caindo pro fallback — e que o fallback não mostra o texto do OBS em lugar nenhum.

---

## Edge Cases

- IF a integração usada para resolver admins/enviar e-mail (backend-ob-ads) estiver indisponível THEN o sistema SHALL tratar isso como falha daquele cliente (RELPROM-17), sem derrubar a execução dos demais clientes. <!-- RELPROM-23 -->
- IF o texto do campo OBS exceder 500 caracteres THEN o sistema SHALL truncar o texto exibido no PDF em 500 caracteres seguidos de reticências. <!-- RELPROM-24 -->
- WHEN uma visita tem `DONE_AT`/data de cancelamento exatamente no instante de corte (23:59:59 America/Sao_Paulo do dia anterior ao disparo) THEN o sistema SHALL incluí-la no período que está terminando (limite superior inclusivo). <!-- RELPROM-25 -->
- IF um promotor não teve nenhuma visita concluída nem cancelada no período, mas tem oficinas abertas na rota THEN o sistema SHALL listá-lo na tabela por promotor com as colunas de período zeradas e a coluna de abertas na rota preenchida (não omitir a linha). <!-- coberto por RELPROM-07 -->
- IF a lista fixa de destinatários de teste contiver um e-mail em formato inválido THEN o sistema SHALL tratar esse e-mail como inválido e SHALL seguir o envio apenas com os e-mails válidos da lista, registrando o inválido em log. <!-- coberto por RELPROM-28 -->
- IF o código rodar com `NODE_ENV` indefinido THEN o sistema SHALL tratar essa execução como não-produção (modo seguro: usa a lista de teste). <!-- coberto por RELPROM-28 -->

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
| RELPROM-28 | P1: Relatório semanal correto | Design | Pending |
| RELPROM-29 | P1: Relatório semanal correto | Design | Pending |
| RELPROM-30 | P1: Relatório semanal correto | Design | Pending |
| RELPROM-31 | P1: Relatório semanal correto | Design | Pending |
| RELPROM-44 | P1: Relatório semanal correto | Execute | Implemented |
| RELPROM-32 | P2: Disparo manual via endpoint | Design | Pending |
| RELPROM-33 | P2: Disparo manual via endpoint | Design | Pending |
| RELPROM-34 | P2: Disparo manual via endpoint | Design | Pending |
| RELPROM-35 | P2: Disparo manual via endpoint | Design | Pending |
| RELPROM-36 | P2: Disparo manual via endpoint | Design | Pending |
| RELPROM-37 | P2: Disparo manual via endpoint | Design | Pending |
| RELPROM-38 | P2: Disparo manual via endpoint | Design | Pending |
| RELPROM-39 | P2: Disparo manual via endpoint | Design | Pending |
| RELPROM-14 | P3: Execução automática semanal | Design | Pending |
| RELPROM-15 | P3: Execução automática semanal | Design | Pending |
| RELPROM-16 | P3: Execução automática semanal | Design | Pending |
| RELPROM-17 | P3: Execução automática semanal | Design | Pending |
| RELPROM-18 | P3: Execução automática semanal | Design | Pending |
| RELPROM-19 | P3: Execução automática semanal | Design | Pending |
| RELPROM-20 | P4: Escalável para qualquer cliente | Design | Pending |
| RELPROM-21 | P4: Escalável para qualquer cliente | Design | Pending |
| RELPROM-22 | P4: Escalável para qualquer cliente | Design | Pending |
| RELPROM-23 | Edge Case | Design | Pending |
| RELPROM-24 | Edge Case | Design | Pending |
| RELPROM-25 | Edge Case | Design | Pending |
| RELPROM-40 | P5: Restrição temporária a SKF | Design | Pending |
| RELPROM-41 | P5: Restrição temporária a SKF | Design | Pending |
| RELPROM-42 | P5: Restrição temporária a SKF | Design | Pending |
| RELPROM-43 | P5: Restrição temporária a SKF | Design | Pending |
| RELPROM-45 | P6: Arquivamento do PDF no S3 | Execute | Implemented |
| RELPROM-46 | P6: Arquivamento do PDF no S3 | Execute | Implemented |
| RELPROM-47 | P6: Arquivamento do PDF no S3 | Execute | Implemented |
| RELPROM-48 | P6: Arquivamento do PDF no S3 | Execute | Implemented |
| RELPROM-49 | P7: Observações adicionais geradas por IA | Execute | Implemented |
| RELPROM-50 | P7: Observações adicionais geradas por IA | Execute | Implemented |
| RELPROM-51 | P7: Observações adicionais geradas por IA | Execute | Implemented |
| RELPROM-52 | P7: Observações adicionais geradas por IA | Execute | Implemented |
| RELPROM-53 | P8: Resumo de cancelamentos agrupado por IA | Execute | Implemented |
| RELPROM-54 | P8: Resumo de cancelamentos agrupado por IA | Execute | Implemented |
| RELPROM-55 | P8: Resumo de cancelamentos agrupado por IA | Execute | Implemented |
| RELPROM-56 | P8: Resumo de cancelamentos agrupado por IA | Execute | Implemented |
| RELPROM-57 | P8: Resumo de cancelamentos agrupado por IA | Execute | Implemented |
| RELPROM-58 | P9: Resumo dos destaques do campo gerado por IA | Execute | Implemented |
| RELPROM-59 | P9: Resumo dos destaques do campo gerado por IA | Execute | Implemented |
| RELPROM-60 | P9: Resumo dos destaques do campo gerado por IA | Execute | Implemented |
| RELPROM-61 | P9: Resumo dos destaques do campo gerado por IA | Execute | Implemented |
| RELPROM-62 | P9: Resumo dos destaques do campo gerado por IA | Execute | Implemented |
| RELPROM-63 | P9: Resumo dos destaques do campo gerado por IA | Execute | Implemented |
| RELPROM-64 | P10: Correções pós-revisão do PO | Execute | Implemented |
| RELPROM-65 | P10: Correções pós-revisão do PO | Execute | Implemented |
| RELPROM-66 | P10: Correções pós-revisão do PO | Execute | Implemented |
| RELPROM-67 | P10: Correções pós-revisão do PO | Execute | Implemented |

**ID format:** `RELPROM-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 67 total. RELPROM-01 a 67 implementadas (Phases 1-12 em `tasks.md`).

---

## Success Criteria

Como saberemos que a feature foi bem-sucedida:

- [ ] O relatório semanal da SKF é gerado e enviado automaticamente toda sexta-feira, sem intervenção manual, com as mesmas 7 seções e a mesma ordem do modelo do CON26-325.
- [ ] Um cliente novo com o módulo "Promotores" habilitado passa a receber o relatório no próximo ciclo semanal, sem alteração de código.
- [ ] Nenhum envio duplicado ocorre para o mesmo cliente/período, mesmo se a rotina for disparada mais de uma vez.
- [ ] Falha em um cliente (sem admin resolvido, integração fora do ar) não impede o envio para os demais clientes elegíveis na mesma execução.
- [ ] Um cliente com 2+ campanhas ativas recebe um único e-mail/PDF com um bloco de dados por campanha, sem misturar métricas entre campanhas.
- [ ] Fora de produção, nenhum e-mail chega a um admin real de cliente — só a lista fixa de teste definida em código recebe, e os e-mails de admin que seriam os destinatários reais aparecem logados.
- [ ] É possível gerar o relatório de um cliente sob demanda via endpoint administrativo, sem esperar o cron, com o mesmo resultado (dados e segmentação por campanha) que o fluxo agendado produziria.
- [ ] A visão geral de cada campanha mostra o gráfico comparativo de visitas por dia, igual ao modelo do CON26-325.
- [ ] Todo envio (cron ou manual, com e-mail) tem o PDF arquivado no S3, com o link gravado no registro de auditoria.
- [ ] Cada seção do relatório traz 1 frase de síntese gerada por IA, sem nenhum número que não esteja nos dados já calculados daquela seção.
- [ ] A seção de cancelamentos mostra o resumo agrupado por motivo quando a IA acerta o agrupamento, ou a tabela detalhada quando não acerta — nunca quebra nem mistura as duas.
- [ ] A seção de destaques do campo mostra até 4 insights ("O que os promotores registraram no app") quando a IA acerta, ou a listagem de cards individuais quando não acerta.
- [ ] A frase de "performance por promotor" sempre atribui o número certo ao promotor certo (determinística, sem IA).
- [ ] O texto bruto do campo OBS nunca aparece no relatório, nem na síntese da IA nem nos fallbacks.
