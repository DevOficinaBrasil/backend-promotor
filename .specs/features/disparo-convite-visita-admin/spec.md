# Disparo de Convite de Visita (Admin) Specification

## Problem Statement

Hoje a visita nasce ao contrário do que a operação precisa. A rota (`ROTA_PROMOTOR`) é criada primeiro, pelo auto-assign da comunidade do cliente, e só depois a oficina é avisada. Além disso, o app do promotor mostra visitas que ninguém aceitou: rota sem notificação, `DISPENSADO` e `FALHOU`.

A Oficina Brasil quer inverter isso:

1. Um admin escolhe a região e o perfil de oficina de qualquer campanha ativa.
2. O admin convida os reparadores pelo WhatsApp, inclusive os que não estão na comunidade do cliente.
3. A visita entra na rota do promotor só quando o reparador aceita e confirma os dados.

## Goals

- [ ] Um admin lista todas as campanhas ativas, com o nome do cliente, e abre qualquer uma no fluxo de rotas.
- [ ] O admin encontra oficinas da base Oficina Brasil (tenant 15 do CRM) por região e critério de segmentação, e as coloca em rota mesmo fora da comunidade da campanha.
- [ ] Um clique em "Disparar comunicação" agenda um convite por rota selecionada, com no máximo o teto diário informado pelo admin em cada dia de envio.
- [ ] O reparador aceita ou recusa pelo link, e `GET /campanha/ativa` só mostra rotas em `BACKLOG` que foram aceitas, em todas as campanhas.
- [ ] Os endpoints novos recusam, com 401 ou 403, qualquer chamada sem JWT de admin.

## O que JÁ existe (levantado no código, não presumido)

| Fato | Onde |
| --- | --- |
| Fila de WhatsApp (outbox) em Postgres com `AVAILABLE_AT`, claim com `SKIP LOCKED`, backoff e janela do dia seguinte | `service/outboxNotificacaoService.ts`, `utils/agendamento.ts`, `service/notificacaoVisitaService.ts:248,302,368` |
| Notificação presa a uma rota que já existe (`ID_ROTA_PROMOTOR` NOT NULL e UNIQUE) | `entities/NotificacaoVisita.ts`, `scripts/migration-notificacao-visita.sql` |
| `createRotas` sempre enfileira a notificação | `service/rotaService.ts:66,83-117` |
| Guardas no envio: convite `ENVIADO` em aberto, confirmação há menos de 3 meses (por `ID_USUARIO`), endereço recente | `service/envioGuards.ts:37-48,64-117` |
| Filtro do app: fora de `BACKLOG` sempre aparece; sem notificação aparece; senão só `CONFIRMADO`/`DISPENSADO`/`FALHOU` | `utils/statusNotificacaoVisita.ts:46-50,74-89`, `service/campanhaService.ts:331` |
| Link público: `GET /visita/:token`, `POST /visita/confirmar`, `PUT /visita/endereco`. Não existe recusa | `routes/VisitaRoute.ts`, `service/visitaConfirmacaoService.ts` |
| Destinatário vem de `MAIN_REGISTER.USUARIO.CELULAR` por `ID_OFICINA` | `service/notificacaoVisitaService.ts:426-444` |
| Segmentação do CRM paginada (teto de 5000 contatos), resolvida pelo tenant da comunidade da campanha | `SegmentacaoService.previewContactsAll`, `segmentacaoService.ts:25` |
| `CRM.contact.external_user_id` = `MAIN_REGISTER.USUARIO.ID_USUARIO`; `tenant_id` = `COMMUNITIES.CommunityID` | memória do projeto, verificada com dados em 2026-08-19 |
| `GET /campanha` lista sem nome de cliente; esta base não tem tabela de clientes | `campanhaService.ts:449`, `.specs/project/STATE.md:18` |
| `authMiddleware` valida JWT com `JWT_SECRET`, mas não está montado em nenhuma rota; não existe papel de admin | `middlewares/authMiddleware.ts`, `.specs/project/STATE.md:44-47` |
| No `ob-ads`, `/admin/*` exige cookie `isAdmin=true` (middleware) e o JWT carrega `user.IS_ADMIN` | `ob-ads/middleware.js:5-21`, `ob-ads/app/components/login/LoginCard.jsx:143-147` |

## Out of Scope

| Feature | Reason |
| --- | --- |
| Criar ou aprovar template de WhatsApp novo | O convite reusa o template aprovado `WHATSAPP_TEMPLATE_NAME_VISITA` (`atualizacao_dados_visita_oficina`). Aprovar template é tarefa do negócio. |
| Convite para oficina importada | Decisão do usuário (2026-09-28): oficina importada para o slug da campanha (`OFICINA_IMPORTADA`) entra aceita, sem convite (CONV-45 a CONV-47). |
| Enviar para telefone fixo | WhatsApp não chega em linha fixa comum. O fallback de telefone só aceita número com formato de celular (CONV-43). |
| Reenvio de convite `EXPIRADO` ou `FALHOU` | Fluxo próprio (Deferred Ideas). |
| Autenticar as rotas antigas de `/campanha`, `/rota` e `/promotor` | Muda o contrato de três frontends; risco já registrado em `STATE.md`. |
| Teto diário global somando todos os disparos | O usuário escolheu teto por disparo. |
| Mudanças no `frontend-promotor` | O filtro vive no backend (`GET /campanha/ativa`); o app só recebe menos rotas. |
| Corrigir o `JWT_SECRET` embutido no bundle do `ob-ads` (`next.config.mjs:31-33`) | Risco pré-existente de segurança, com escopo próprio; registrado no design. |
| Mudanças no wizard de campanha do cliente (`/dashboard/campanha-para-promotores`) | A tela de admin é nova. O auto-assign do cliente continua enfileirando como hoje e só sente a regra global de visibilidade e as guardas novas. |
| Copy nova para o estado vazio do app | Deferred Ideas. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Teto diário | Informado pelo admin em cada disparo; inteiro de 1 a 1000 | Decisão do usuário: teto por disparo. O limite de 1000 evita erro de digitação (10000 no lugar de 100). | y (teto) / n (faixa) |
| Janela de envio | A janela que já existe (dia seguinte, `NOTIFICACAO_HORA_ENVIO`..`_FIM`, America/Sao_Paulo) vale dentro de cada dia do disparo | Reusa a regra existente; o teto só diz quantos por dia. | y |
| Dois disparos no mesmo dia | Os tetos não se somam, cada disparo respeita só o seu | Consequência direta de "teto por disparo". | y |
| Visibilidade | Global e imediata no deploy: rota em `BACKLOG` só aparece com o status efetivo aceito | Decisão do usuário. Consequência: rotas que o promotor vê hoje sem aceite somem no deploy. | y |
| Universo de oficinas | Contatos do CRM no tenant 15 → `external_user_id` → `USUARIO` → `ID_OFICINA` | Decisão do usuário. É o que permite segmentar oficinas fora da comunidade. | y |
| Tenant 15 no dev | Tem 1 contato só (medido em 2026-08-19); o fluxo não dá para demonstrar no dev | Dado de ambiente, não de código. A validação ponta a ponta exige homolog ou prod. | n |
| Região e critério | Os dois são obrigatórios: região (UF + cidade, ou CEP + raio) e pelo menos 1 critério do CRM | Decisão do usuário. | y |
| Campanha "ativa" | `STATUS='PUBLICADA'`, `DELETED_AT` nulo, e agora dentro de `START_TIME`..`END_TIME` (`END_TIME` nulo = sem fim) | Mesmo critério que o app do promotor usa; campanha em rascunho não entrega visita. | n |
| Oficina sem celular | Tenta, em ordem: `USUARIO.CELULAR` (como hoje), depois `USUARIO.TELEFONE`, `OFICINA.TELEFONE` e `dw.cadastro_empresa.telefone`, aceitando nesses três só número com formato de celular (11 dígitos com 9 depois do DDD). Sem nenhum número válido, a oficina aparece "sem WhatsApp" e não entra em rota pela tela de admin | Pedido do usuário (2026-09-28): usar o telefone quando falta celular. Linha fixa não recebe WhatsApp comum, então fixo é descartado para não gerar `FALHOU` certo. | y (fallback) / n (só formato de celular) |
| Oficina importada | Rota de oficina com linha ativa em `OFICINA_IMPORTADA` para o `EMPRESA_SLUG` da campanha nasce aceita (origem `IMPORTADA`), sem mensagem, em todos os fluxos. As rotas que já existem são ajustadas pela migration | Decisão do usuário (2026-09-28): "Oficina importada não precisa de convite". A oficina importada que já era membro da comunidade (`garantirVinculo` → `ja_vinculada`) não tem linha em `OFICINA_IMPORTADA` e continua recebendo convite | y (regra) / n (caso ja_vinculada) |
| Chave da guarda "convite em aberto" | Por `ID_OFICINA` | "Aceitou lá, vale aqui" só faz sentido para a mesma oficina. | n |
| Chave da guarda "confirmou há menos de 3 meses" | Continua por `ID_USUARIO`, como hoje | O usuário mandou manter a guarda; só muda o efeito (aceita em vez de dispensada). | n |
| Guarda "endereço recente" | Deixa de suprimir o envio em todos os fluxos | Decisão do usuário. | y |
| Agendamento além do fim da campanha | O disparo é recusado (422) e a resposta traz o teto mínimo necessário | Convite agendado para depois do fim vira `DISPENSADO` e desperdiça a seleção; recusar deixa o admin corrigir o teto. | n |
| Rota criada pela tela de admin | Não enfileira nada até "Disparar comunicação" | O disparo é o gatilho explícito pedido; enfileirar na criação mandaria convite antes do admin terminar a rota. | y |
| Página pública do link | `jornalOficinaBrasil/app/(visita)/visita/confirmacao/`. O botão Recusar entra na tela pendente, ao lado de "Próximo passo" | Informado pelo usuário em 2026-09-28 e confirmado no código. | y |
| Token do admin | O backend-promotor verifica o JWT emitido pelo backend-ob-ads (`POST /usuario/auth`, `{user:{...,IS_ADMIN}}`, 7 dias) com uma variável nova, `OBADS_JWT_SECRET`, que precisa ter o mesmo valor do `JWT_SECRET` do backend-ob-ads, e exige `user.IS_ADMIN` verdadeiro | O backend-promotor não acessa o SQL Server onde está `IS_ADMIN`, então a checagem é pela claim. O `JWT_SECRET` atual do backend-promotor assina o login do promotor e não pode ser trocado. | y |
| Nome do cliente | Resolvido no servidor; campanha sem nome resolvível mostra `—` | Mesmo padrão de fallback da visão gerencial. | n |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Admin lista todas as campanhas ativas com o cliente ⭐ MVP

**User Story**: Como admin da Oficina Brasil, quero ver todas as campanhas ativas de todos os clientes, com o nome do cliente, para escolher em qual vou disparar convites.

**Why P1**: Toda a operação começa pela escolha da campanha.

**Acceptance Criteria**:

1. WHEN um admin abre a tela de disparo no `ob-ads` THEN the system SHALL listar todas as campanhas ativas de todos os clientes, com as colunas Cliente, Nome, Período, Promotores vinculados e Rotas.
2. The system SHALL considerar ativa a campanha com `STATUS='PUBLICADA'`, `DELETED_AT` nulo e o instante atual entre `START_TIME` e `END_TIME`, tratando `END_TIME` nulo como sem fim.
3. IF o nome do cliente de uma campanha não puder ser resolvido THEN the system SHALL exibir `—` na coluna Cliente e manter a campanha na lista.
4. IF o usuário logado no `ob-ads` não for admin THEN the system SHALL redirecionar para `/dashboard` sem renderizar a tela.

**Independent Test**: logado como admin, a lista mostra campanhas de pelo menos dois clientes diferentes, cada uma com o nome do cliente; logado como não admin, a URL leva a `/dashboard`.

---

### P1: Endpoints de admin exigem JWT de admin ⭐ MVP

**User Story**: Como Oficina Brasil, quero que só admins possam listar a base e disparar WhatsApp, para que ninguém com a URL mande mensagem para milhares de oficinas.

**Why P1**: O disparo é irreversível e fala com pessoas reais.

**Acceptance Criteria**:

1. IF uma requisição a um endpoint novo de admin chegar sem header `Authorization: Bearer` ou com token inválido ou expirado THEN the system SHALL responder 401 sem executar a operação.
2. IF o token for válido mas `user.IS_ADMIN` não for verdadeiro THEN the system SHALL responder 403 sem executar a operação.
3. The system SHALL manter sem mudança de autenticação todas as rotas que já existiam antes desta feature.

**Independent Test**: teste de integração (supertest) contra cada endpoint novo com os três casos: sem token (401), não admin (403) e admin (2xx).

---

### P1: Segmentar a base Oficina Brasil por região e critério ⭐ MVP

**User Story**: Como admin, quero filtrar as oficinas de toda a base Oficina Brasil por região e por critérios do CRM, para convidar só o perfil certo, esteja ele dentro ou fora da comunidade do cliente.

**Why P1**: Sem isso não existe o "fora da comunidade", e sem região o disparo atinge o país inteiro.

**Acceptance Criteria**:

1. IF a requisição de segmentação não trouxer região (UF + cidade, ou CEP + raio em km maior que 0) THEN the system SHALL responder 400 com a mensagem "Informe a região (UF e cidade, ou CEP e raio)" e não consultar o CRM.
2. IF a requisição de segmentação não trouxer pelo menos um critério do CRM THEN the system SHALL responder 400 com a mensagem "Informe ao menos um critério de segmentação" e não consultar o CRM.
3. WHEN região e critério são válidos THEN the system SHALL avaliar os critérios sobre os contatos do tenant 15 do CRM e devolver as oficinas desses contatos que estão na região.
4. The system SHALL marcar cada oficina devolvida com: `membroComunidade` (é membro da comunidade do `EMPRESA_SLUG` da campanha), `temWhatsapp` (tem celular em `USUARIO`), `rotaAtual` (promotor e status do convite, se já está em rota nesta campanha) e `recusouNestaCampanha`.
5. IF a varredura do CRM atingir o teto de 5000 contatos THEN the system SHALL devolver `truncado: true`, e a tela SHALL mostrar o aviso "Resultado parcial: refine a segmentação".
6. IF o CRM falhar ou exceder o tempo THEN the system SHALL responder 502 com a mensagem "Segmentação indisponível", e a tela SHALL manter a seleção anterior sem apagar nada.
7. WHEN o admin pede os valores de um campo de critério THEN the system SHALL devolver os campos e valores do tenant 15, não os do tenant da comunidade da campanha.

**Independent Test**: com SPAAL ou outra campanha em homolog, aplicar "UF=SP, cidade=Campinas" mais um critério e ver oficinas com `membroComunidade` verdadeiro e falso; sem região, receber 400.

---

### P1: Ver promotores e montar rotas com oficinas de fora da comunidade ⭐ MVP

**User Story**: Como admin, quero ver no mapa os promotores do cliente e os vinculados à campanha, e colocar qualquer oficina segmentada na rota de um deles, para montar a agenda antes de convidar.

**Why P1**: É a parte "rota do reparador" pedida; sem ela o disparo não tem destino.

**Acceptance Criteria**:

1. WHEN o admin abre uma campanha THEN the system SHALL exibir os promotores vinculados à campanha (`CAMPANHA_PROMOTOR`, com raio) e, separados, os promotores do cliente (`PROMOTOR.ID_CLIENT` = `CAMPANHA.ID_CLIENT`) ainda não vinculados.
2. WHEN o admin coloca oficinas selecionadas na rota de um promotor vinculado THEN the system SHALL criar uma `ROTA_PROMOTOR` em `BACKLOG` por oficina, sem exigir que a oficina seja membro da comunidade da campanha.
3. WHEN uma rota é criada pela tela de admin THEN the system SHALL NÃO enfileirar notificação, e a rota SHALL aparecer para o admin como "não disparada".
4. IF a oficina já está em rota nesta campanha THEN the system SHALL recusar a nova rota com 409 e indicar o promotor atual.
5. IF a oficina não tem WhatsApp (`temWhatsapp` falso, depois do fallback de telefone) e não é importada para o slug da campanha THEN the system SHALL recusar a rota com 422 "Oficina sem WhatsApp cadastrado", e a tela SHALL exibir a oficina desabilitada para seleção.
6. IF a oficina recusou convite nesta campanha THEN the system SHALL recusar a nova rota com 409 "Oficina recusou a visita nesta campanha".
7. WHEN o admin pede distribuição automática THEN the system SHALL atribuir cada oficina selecionada ao promotor vinculado mais próximo cujo raio a alcança, pela regra que já existe (haversine, desempate por `ID_CAMPANHA_PROMOTOR`), e deixar sem rota, listadas como "fora do alcance", as que nenhum raio alcança.

**Independent Test**: selecionar uma oficina de fora da comunidade, colocá-la na rota de um promotor e ver a rota criada como "não disparada", sem nenhuma linha nova em `NOTIFICACAO_VISITA`.

---

### P1: Disparar a comunicação com teto diário ⭐ MVP

**User Story**: Como admin, quero disparar de uma vez os convites das rotas montadas, dizendo quantas mensagens por dia esse disparo pode usar, para controlar o volume e a exposição do número de WhatsApp.

**Why P1**: É o objetivo declarado.

**Acceptance Criteria**:

1. WHEN o admin clica em "Disparar comunicação" THEN a tela SHALL pedir o teto diário e exibir uma prévia com o total de convites, a quantidade por dia de envio e a data do último dia, antes de qualquer envio.
2. IF o teto não for um inteiro entre 1 e 1000 THEN the system SHALL responder 400 "Teto diário deve ser um inteiro entre 1 e 1000" sem enfileirar nada.
3. WHEN o admin confirma a prévia THEN the system SHALL enfileirar uma notificação por rota selecionada ainda "não disparada", distribuindo no máximo `teto` notificações por dia, a partir da janela do dia seguinte, espaçadas dentro da janela de cada dia.
4. The system SHALL nunca agendar, em um mesmo dia, mais notificações de um mesmo disparo do que o teto informado.
5. IF o último dia de envio cair depois do `END_TIME` da campanha THEN the system SHALL responder 422 sem enfileirar nada, informando o teto mínimo que cabe no período.
6. WHEN uma rota selecionada já tem notificação THEN the system SHALL ignorá-la e contá-la no resumo como "já disparada", sem criar uma segunda notificação.
7. WHEN o disparo termina THEN the system SHALL devolver o resumo `{ enfileiradas, jaDisparadas, porDia: [{data, quantidade}], ultimoDia }`.
8. IF duas requisições de disparo chegarem juntas para as mesmas rotas THEN the system SHALL criar no máximo uma notificação por rota.

**Independent Test**: com 25 rotas "não disparadas" e teto 10, a prévia mostra 10 / 10 / 5 em três dias consecutivos a partir de amanhã; ao confirmar, `NOTIFICACAO_VISITA` tem 25 linhas `PENDENTE` com `AVAILABLE_AT` distribuído desse jeito.

---

### P1: Guardas de envio e aceite herdado ⭐ MVP

**User Story**: Como Oficina Brasil, quero que o reparador não receba mensagens repetidas e que quem acabou de confirmar não seja incomodado, sem que nenhuma dessas regras deixe uma visita invisível para sempre.

**Why P1**: Com a regra global, uma guarda que só dispensa tira a visita do promotor.

**Acceptance Criteria** (valem para todo envio da fila, de qualquer fluxo):

1. The system SHALL não usar mais a atualização recente do endereço (`OFICINA.DATA_ALTERACAO`) como motivo para suprimir envio.
2. WHEN chega a hora de envio de uma notificação e a mesma oficina já tem um convite `ENVIADO` não expirado THEN the system SHALL não enviar mensagem e SHALL deixar a notificação aguardando aquele convite.
3. WHEN um convite é confirmado THEN the system SHALL marcar como aceitas todas as notificações que aguardavam aquele convite.
4. WHEN um convite é recusado THEN the system SHALL marcar como recusadas todas as notificações que aguardavam aquele convite.
5. WHEN um convite expira THEN the system SHALL reenfileirar as notificações que aguardavam por ele para a janela do dia seguinte.
6. WHEN chega a hora de envio de uma notificação e o destinatário (`ID_USUARIO`) confirmou algum convite nos últimos 3 meses THEN the system SHALL não enviar mensagem e SHALL marcar a notificação como aceita por confirmação recente.
7. The system SHALL distinguir, para o admin, "aceita pelo reparador" de "aceita por confirmação recente".

**Independent Test**: com a oficina X tendo um convite `ENVIADO` em aberto, uma segunda rota de X não gera mensagem; confirmar o primeiro link torna as duas rotas visíveis para os promotores.

---

### P1: Promotor só vê visita aceita (global) ⭐ MVP

**User Story**: Como promotor, quero ver só as visitas que a oficina aceitou, para não sair para uma visita que ninguém espera.

**Why P1**: É a regra de negócio central do pedido.

**Acceptance Criteria**:

1. WHILE a rota está em `BACKLOG` THEN `GET /campanha/ativa` SHALL incluí-la só se o status efetivo da notificação for aceito (pelo reparador, por confirmação recente, por convite vinculado ou por ser oficina importada).
2. IF a rota em `BACKLOG` não tem notificação THEN `GET /campanha/ativa` SHALL omiti-la.
3. IF a rota em `BACKLOG` tem notificação `PENDENTE`, `ENVIADO`, `EXPIRADO`, `FALHOU`, `DISPENSADO`, `RECUSADO`, aguardando outro convite, ou qualquer valor desconhecido THEN `GET /campanha/ativa` SHALL omiti-la.
4. WHILE a rota tem status `A CAMINHO`, `EM ANDAMENTO`, `FINALIZADO` ou `CANCELADO` THEN `GET /campanha/ativa` SHALL incluí-la qualquer que seja o status da notificação.
5. The system SHALL manter `GET /campanha/:id` e `GET /campanha/client/:clientId` devolvendo todas as rotas, sem o filtro.

**Independent Test**: numa campanha com uma rota de cada status de notificação, `GET /campanha/ativa` devolve só as aceitas mais as já trabalhadas; `GET /campanha/:id` devolve todas.

---

### P1: Reparador recusa a visita ⭐ MVP

**User Story**: Como reparador, quero poder recusar a visita pelo mesmo link, para não ser cobrado nem visitado sem querer.

**Why P1**: Aceitar só tem sentido se recusar for possível; sem recusa o admin não distingue "não quer" de "não viu".

**Acceptance Criteria**:

1. WHEN o reparador chama `POST /visita/recusar` com um token de acesso válido para um convite `ENVIADO` THEN the system SHALL mudar o status para `RECUSADO` de forma atômica e gravar data, IP e o token usado, no mesmo padrão de `CONFIRMADO`.
2. IF o convite já estiver `CONFIRMADO` ou `RECUSADO` THEN the system SHALL responder 409 com o estado atual, sem mudar nada.
3. IF o token estiver expirado ou for inválido THEN the system SHALL responder no mesmo formato de erro que `POST /visita/confirmar` já usa.
4. WHEN um convite é recusado THEN the system SHALL impedir que a mesma oficina receba nova rota ou novo convite naquela campanha.
5. The system SHALL aplicar a `POST /visita/recusar` o mesmo middleware de acesso e o mesmo rate limit de `POST /visita/confirmar`.
6. The system SHALL atualizar `frontend-contract.md` com o endpoint de recusa e o novo estado `DECLINED` devolvido por `GET /visita/:token`.

**Independent Test**: recusar pelo link muda a notificação para `RECUSADO`; a rota some de `GET /campanha/ativa`; tentar pôr a mesma oficina de novo na campanha devolve 409.

---

### P1: Telefone alternativo e oficina importada ⭐ MVP

**User Story**: Como admin, quero alcançar oficinas que não têm celular no cadastro do usuário, e não quero incomodar oficina importada, porque ela já foi combinada fora do WhatsApp.

**Why P1**: Pedido explícito do usuário em 2026-09-28. Com a regra global, oficina sem número e oficina importada ficariam invisíveis para o promotor.

**Acceptance Criteria**:

1. WHEN o destinatário é resolvido e nenhum usuário da oficina tem `CELULAR` preenchido THEN the system SHALL usar o primeiro número com formato de celular (11 dígitos locais, com 9 depois do DDD) na ordem `USUARIO.TELEFONE`, `OFICINA.TELEFONE`, `dw.cadastro_empresa.telefone`.
2. The system SHALL gravar em `NOTIFICACAO_VISITA.TELEFONE_ORIGEM` de onde veio o número usado (`USUARIO_CELULAR`, `USUARIO_TELEFONE`, `OFICINA_TELEFONE` ou `CADASTRO_EMPRESA_TELEFONE`).
3. IF nenhuma fonte der número válido THEN the system SHALL marcar a notificação como `FALHOU` com o motivo de hoje (`MOTIVO_SEM_TELEFONE`), e a segmentação SHALL marcar a oficina com `temWhatsapp` falso.
4. WHEN uma rota é criada, por qualquer fluxo, para uma oficina com linha ativa em `OFICINA_IMPORTADA` para o `EMPRESA_SLUG` da campanha THEN the system SHALL registrá-la como aceita, com origem `IMPORTADA`, sem enfileirar mensagem.
5. WHEN a migration desta feature roda THEN the system SHALL marcar como aceitas, com origem `IMPORTADA`, as rotas que já existem de oficinas importadas para o slug da campanha e que ainda não foram aceitas ou recusadas, e SHALL criar o registro para as que não têm notificação.
6. The system SHALL tratar a oficina importada como apta a entrar em rota pela tela de admin mesmo sem WhatsApp.

**Independent Test**: uma oficina importada para o slug da campanha, sem usuário, colocada em rota, aparece em `GET /campanha/ativa` sem nenhum envio; uma oficina com usuário sem `CELULAR` mas com `OFICINA.TELEFONE` celular recebe o convite nesse número, com `TELEFONE_ORIGEM = OFICINA_TELEFONE`.

---

### P2: Acompanhar o disparo

**User Story**: Como admin, quero ver o estado de cada convite da campanha, para saber quem aceitou, recusou ou não respondeu.

**Why P2**: A operação funciona sem painel, mas o admin precisaria ir ao banco para acompanhar.

**Acceptance Criteria**:

1. WHEN o admin abre uma campanha na tela de disparo THEN the system SHALL mostrar, por rota, um destes estados: não disparada, agendada (com data), enviada, aceita, aceita por confirmação recente, recusada, expirada, falhou ou aguardando outro convite.
2. WHEN o admin filtra por estado THEN a tela SHALL mostrar só as rotas daquele estado, com o total por estado sempre visível.

**Independent Test**: depois de um disparo, a lista mostra "agendada" com a data de envio de cada rota.

---

## Edge Cases

- IF a campanha termina antes do dia agendado de um convite já enfileirado THEN the system SHALL tratá-lo pela guarda de fim de campanha que já existe (`DISPENSADO`), sem enviar.
- IF o celular do usuário sumir entre o disparo e a hora de envio THEN the system SHALL registrar `FALHOU` com o motivo, como hoje.
- WHEN o admin remove uma rota "não disparada" THEN the system SHALL apagá-la sem efeito em `NOTIFICACAO_VISITA`.
- IF o admin remove uma rota já disparada THEN the system SHALL usar o comportamento de exclusão de rota que já existe; esta feature não muda o cancelamento de convites.
- WHEN a segmentação devolve 0 oficinas THEN a tela SHALL mostrar "Nenhuma oficina atende a esta segmentação" e manter o botão de disparo desabilitado.

---

## Implicit-Requirement Dimensions (sweep)

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | Região obrigatória; pelo menos 1 critério; teto de 1 a 1000; raio maior que 0 (CONV-06, CONV-07, CONV-18). |
| Failure / partial-failure states | CRM fora do ar dá 502 sem perder a seleção (CONV-11); o disparo é tudo ou nada: 422 sem enfileirar (CONV-21). |
| Idempotency / retry / duplicate handling | Rota já disparada é ignorada; disparos concorrentes dão no máximo uma notificação por rota, garantido pelo `UNIQUE(ID_ROTA_PROMOTOR)` que já existe (CONV-22, CONV-24). |
| Auth boundaries & rate limits | JWT de admin nos endpoints novos (CONV-03, CONV-04); recusa com o mesmo rate limit de `/visita` (CONV-40). |
| Concurrency / ordering | Recusa e confirmação atômicas (CONV-36); o claim da fila continua com `SKIP LOCKED`. |
| Data lifecycle / expiry | Convite expira no `EXPIRA_EM` que já existe; ao expirar, as notificações que aguardavam são reenfileiradas (CONV-29). |
| Observability | Resumo do disparo (CONV-23) e estado por rota (CONV-41, CONV-42). Métricas novas: N/A because o `status` do `outboxConsole` já responde "o que está enfileirado para quando". |
| External-dependency failure | CRM: 502 (CONV-11). WhatsApp: retry e `FALHOU` do outbox que já existe, sem mudança. |
| State-transition integrity | `ENVIADO→CONFIRMADO` e `ENVIADO→RECUSADO` atômicas; estado terminal devolve 409 (CONV-36, CONV-37); aguardando → aceita, recusada ou reenfileirada (CONV-27 a CONV-29). |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| CONV-01 | P1: Campanhas ativas - AC1, AC2 | Design | Pending |
| CONV-02 | P1: Campanhas ativas - AC3, AC4 | Design | Pending |
| CONV-03 | P1: Auth admin - AC1 | Design | Implementing |
| CONV-04 | P1: Auth admin - AC2 | Design | Implementing |
| CONV-05 | P1: Auth admin - AC3 | Design | Pending |
| CONV-06 | P1: Segmentação - AC1 | Design | Pending |
| CONV-07 | P1: Segmentação - AC2 | Design | Pending |
| CONV-08 | P1: Segmentação - AC3 | Design | Implementing |
| CONV-09 | P1: Segmentação - AC4 | Design | Implementing |
| CONV-10 | P1: Segmentação - AC5 | Design | Pending |
| CONV-11 | P1: Segmentação - AC6 | Design | Pending |
| CONV-12 | P1: Segmentação - AC7 | Design | Pending |
| CONV-13 | P1: Rotas - AC1 | Design | Pending |
| CONV-14 | P1: Rotas - AC2 | Design | Pending |
| CONV-15 | P1: Rotas - AC3 | Design | Implementing |
| CONV-16 | P1: Rotas - AC4, AC6 | Design | Pending |
| CONV-17 | P1: Rotas - AC5 | Design | Pending |
| CONV-18 | P1: Rotas - AC7 | Design | Implementing |
| CONV-19 | P1: Disparo - AC1 | Design | Pending |
| CONV-20 | P1: Disparo - AC2 | Design | Pending |
| CONV-21 | P1: Disparo - AC3, AC4, AC5 | Design | Implementing |
| CONV-22 | P1: Disparo - AC6 | Design | Pending |
| CONV-23 | P1: Disparo - AC7 | Design | Pending |
| CONV-24 | P1: Disparo - AC8 | Design | Pending |
| CONV-25 | P1: Guardas - AC1 | Design | Implementing |
| CONV-26 | P1: Guardas - AC2 | Design | Implementing |
| CONV-27 | P1: Guardas - AC3 | Design | Implementing |
| CONV-28 | P1: Guardas - AC4 | Design | Implementing |
| CONV-29 | P1: Guardas - AC5 | Design | Implementing |
| CONV-30 | P1: Guardas - AC6, AC7 | Design | Implementing |
| CONV-31 | P1: Visibilidade - AC1 | Design | Implementing |
| CONV-32 | P1: Visibilidade - AC2, AC3 | Design | Implementing |
| CONV-33 | P1: Visibilidade - AC4 | Design | Implementing |
| CONV-34 | P1: Visibilidade - AC5 | Design | Pending |
| CONV-35 | P1: Recusa - AC1 | Design | Implementing |
| CONV-36 | P1: Recusa - AC1 (atomicidade) | Design | Implementing |
| CONV-37 | P1: Recusa - AC2, AC3 | Design | Implementing |
| CONV-38 | P1: Recusa - AC4 | Design | Pending |
| CONV-39 | P1: Recusa - AC6 | Design | Implementing |
| CONV-40 | P1: Recusa - AC5 | Design | Implementing |
| CONV-41 | P2: Acompanhar - AC1 | Design | Implementing |
| CONV-42 | P2: Acompanhar - AC2 | Design | Pending |
| CONV-43 | P1: Telefone/importada - AC1, AC3 | Design | Implementing |
| CONV-44 | P1: Telefone/importada - AC2 | Design | Implementing |
| CONV-45 | P1: Telefone/importada - AC4 | Design | Implementing |
| CONV-46 | P1: Telefone/importada - AC5 | Design | Implementing |
| CONV-47 | P1: Telefone/importada - AC6 | Design | Implementing |

**Coverage:** 47 total, 0 mapped to tasks, 47 unmapped ⚠️ (Tasks phase pending)

---

## Success Criteria

- [ ] Um admin vai da lista de campanhas ao disparo confirmado de uma região segmentada sem sair da tela.
- [ ] Zero rotas em `BACKLOG` sem aceite em `GET /campanha/ativa` depois do deploy.
- [ ] Nenhum dia de um disparo passa do teto informado (conferível com um `SELECT` agrupando `AVAILABLE_AT::date`).
- [ ] Zero chamadas aceitas sem JWT de admin nos endpoints novos.
