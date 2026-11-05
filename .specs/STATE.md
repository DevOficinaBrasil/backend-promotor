# STATE

## Decisions

### AD-001
- **Decision**: Uma oficina vinculada a um cliente sem depender de usuário/comunidade é representada por uma tabela dedicada, `CAMPANHAS_OB.OFICINA_IMPORTADA` (`ID_OFICINA` + `EMPRESA_SLUG`), consultada em paralelo (UNION) às queries existentes que hoje passam por `OFICINA_PORTAL.COMMUNITIES` → `MAIN_REGISTER.USUARIO_COMMUNITY` → `MAIN_REGISTER.USUARIO`.
- **Reason**: Toda consulta de "oficinas da comunidade" (mapa, atribuição automática de rota) hoje exige uma linha real em `USUARIO_COMMUNITY`, o que pressupõe um usuário. O importador de oficinas (CON26-162) precisa suportar oficinas sem usuário. Criar um usuário/community-member sintético reaproveitaria as queries existentes de graça, mas corromperia a semântica de `USUARIO_COMMUNITY` (deixaria de significar "usuário real inscrito") para qualquer leitor futuro dessa tabela.
- **Trade-off**: Uma tabela nova exige estender 3 métodos de leitura (`getComunityNearbyOficinas`, `getCommunityOficinas`, `countCommunityOficinas` em `service/oficinaService.ts`) com `UNION ALL` em vez de reaproveitar a cadeia existente sem nenhuma mudança. Em troca, a tabela de usuários reais nunca recebe registros sintéticos, e o vínculo é isolado/reversível via sua própria migration.
- **Scope**: Qualquer feature futura que precise vincular oficina↔cliente sem usuário deve reaproveitar `CAMPANHAS_OB.OFICINA_IMPORTADA` em vez de criar uma tabela nova ou inserir um usuário sintético em `USUARIO_COMMUNITY`.
- **Date**: 2026-09-09
- **Status**: active

### AD-003
- **Decision**: "Aceito" é `STATUS='CONFIRMADO'` em `CAMPANHAS_OB.NOTIFICACAO_VISITA`, com a forma de aceite em `ORIGEM_ACEITE` (`REPARADOR`, `CONFIRMACAO_RECENTE`, `CONVITE_VINCULADO`, `IMPORTADA`). `GET /campanha/ativa` mostra uma rota em `BACKLOG` só se o convite dela estiver `CONFIRMADO`. Esta regra substitui a de `filtro-rotas-por-confirmacao` (`CONFIRMACAO_RESOLVIDA`).
- **Reason**: O disparo pelo admin traz aceites que não passam pelo reparador (confirmação recente, convite vinculado, oficina importada). Um status novo por forma de aceite espalharia a pergunta "está aceito?" por vários valores. Com uma coluna de origem, `CONFIRMADO` é a única fonte de "aceito" e o outbox existente segue sem mudança.
- **Trade-off**: Todo leitor de "aceito" consulta `STATUS='CONFIRMADO'` e, quando a origem importa, também `ORIGEM_ACEITE`. A guarda de confirmação recente conta só `ORIGEM_ACEITE='REPARADOR'`, senão um aceite automático renovaria a janela para sempre. Os consumidores de `CONFIRMACAO_RESOLVIDA` saem ou são atualizados, e rota em `BACKLOG` ainda sem aceite fica fora da lista do promotor.
- **Scope**: Qualquer feature que pergunte se uma visita foi aceita usa `STATUS='CONFIRMADO'`. Uma forma nova de aceite vira um valor novo de `ORIGEM_ACEITE`, nunca um status novo.
- **Date**: 2026-09-28
- **Status**: active

### AD-004
- **Decision**: Os endpoints de admin do backend-promotor ficam em `/admin/*`, atrás de `adminAuthMiddleware`. O middleware valida o JWT emitido pelo backend-ob-ads com `OBADS_JWT_SECRET` e exige a claim `user.IS_ADMIN` verdadeira (401 sem token ou com token inválido, 403 sem `IS_ADMIN`).
- **Reason**: O backend-promotor não acessa o SQL Server onde está `IS_ADMIN`, então a checagem é pela claim do token que o admin já tem no ob-ads. O `JWT_SECRET` do backend-promotor assina o login do promotor e não pode ser trocado, por isso a variável separada.
- **Trade-off**: A claim vale pelos 7 dias do token sem revalidação: um admin rebaixado mantém o acesso até o token expirar. `OBADS_JWT_SECRET` precisa ter o mesmo valor do `JWT_SECRET` do backend-ob-ads em todo ambiente.
- **Scope**: Todo endpoint de admin futuro do backend-promotor fica sob `/admin/*` e reusa `adminAuthMiddleware`, sem outro esquema de auth.
- **Date**: 2026-09-28
- **Status**: active

### AD-005
- **Decision**: Integração cross-service entre `backend-promotor` e `backend-ob-ads` acontece via endpoints internos **genéricos** (não um por feature) no ob-ads, atrás de um único header `x-api-key` validado contra a env `INTERNAL_API_KEY`. O backend-promotor nunca ganha client SQL Server ou SES próprio para falar com dados que já vivem no ob-ads (admins, módulos, envio de e-mail) — ele chama o ob-ads.
- **Reason**: `backend-ob-ads` já tem SES e SQL Server configurados e testados em produção (`EmailService`, `Usuario`/`ClienteModule`). Duplicar essas credenciais/lógica no backend-promotor criaria dois pontos de divergência (ex.: definição de "admin" mudar num lado e não no outro). O padrão de guarda por header de API key já existe (`CommunityReportInternalRoutes.ts`), só que por feature (`COMMUNITY_REPORT_INTERNAL_API_KEY`); como os dois endpoints novos (`/internal/modulos/:nome/clientes-habilitados`, `/internal/email/enviar-com-anexo`) são genéricos e não específicos de uma feature, usam uma chave compartilhada em vez de criar uma chave nova a cada endpoint interno futuro.
- **Trade-off**: Qualquer indisponibilidade do ob-ads vira falha também no backend-promotor para tudo que depender de admin/e-mail — mitigado isolando a falha por cliente (não derruba o processamento inteiro, exceto na chamada de listagem, que é única por execução). A guarda de ambiente dev/produção (quem realmente recebe o e-mail) fica sempre do lado de quem a decide por contexto de negócio — o backend-promotor — nunca do lado do ob-ads, que só manda pra lista que recebe.
- **Scope**: Qualquer integração cross-service futura entre backend-promotor e backend-ob-ads (ou outro serviço interno) que precise ler dado do ob-ads ou disparar e-mail reaproveita esse padrão (endpoint genérico + `INTERNAL_API_KEY`), em vez de criar uma chave por feature ou duplicar credencial/lógica no chamador.
- **Date**: 2026-10-29
- **Status**: active

### AD-006
- **Decision**: O SQL Server (`backend-ob-ads`, `SqlConnections.SQLServerDataSource`) entra em congelamento de pré-migração: nenhuma feature nova pode acrescentar tabela, coluna ou linha de configuração nele (migrations/DDL, e também INSERTs de catálogo tipo `module`/`cliente_module`) até a migração pra Postgres terminar. Vale mesmo pra scripts marcados "execução manual" — não só código automático. Toda feature que precisaria de "habilitar algo por cliente" usa, em vez disso, uma allowlist fixa em código (backend-promotor ou backend-ob-ads), documentada como temporária, até a migração acabar e o mecanismo baseado em tabela poder ser ligado.
- **Reason**: Pedido do DBA — toda alteração no SQL Server antes da migração aumenta o que precisa ser revalidado contra o schema novo em Postgres. Acrescentar `module`/`cliente_module` (CON26-325, relatório de promotores) seria mais uma coisa a portar/conferir na migração, mesmo sendo "só uma linha de dado".
- **Trade-off**: Funcionalidade que dependeria do SQL Server pra escalar (ex.: módulo "promotores" habilitado por cliente via `cliente_module`) fica com o código pronto e testado, mas dormente — reativar depois da migração é trocar a fonte de dados de volta, não reescrever a feature. Até lá, "quem está habilitado" vive hardcoded em código, exigindo deploy pra mudar (aceitável: é só a SKF por enquanto).
- **Scope**: Qualquer feature futura que cogitaria `CREATE TABLE`/`ALTER TABLE`/`INSERT` de catálogo no SQL Server do ob-ads primeiro verifica se essa decisão ainda está `active`; se estiver, usa allowlist/config em código em vez disso. Leitura (`SELECT`) no SQL Server continua liberada — a restrição é só escrita/schema.
- **Date**: 2026-10-30
- **Status**: active

### AD-007
- **Decision**: Geração de PDF em cron/endpoint de produção usa `pdf-lib` (desenho direto: texto, retângulo, linha), nunca um navegador headless (Playwright/Puppeteer) renderizando HTML→PDF.
- **Reason**: O relatório semanal de promotores (CON26-325) começou com Playwright (`chromium.launch()`). Produção roda `node` direto numa EC2 (Amazon Linux 2023), sem Docker — Playwright exige Chromium + libs de sistema instaladas manualmente (`dnf`, pacote por pacote, SO não oficialmente suportado). Validado funcionando (T01, spike), mas é uma dependência de ambiente frágil: qualquer recriação da instância/imagem base exige repetir o provisionamento manual, e uma falha aí derruba o cron inteiro sem nenhuma mudança de código. `pdf-lib` já é dependência do projeto, roda em JS puro, sem binário externo.
- **Trade-off**: Layout com `pdf-lib` é desenho manual (cursor, quebra de linha, paginação própria) em vez de CSS/HTML — mais código de baixo nível no renderer, sem flexbox/grid prontos. Fonte customizada (`assets/fonts/Montserrat-*`) exigiria a dependência separada `@pdf-lib/fontkit` (não instalada); por ora usa as fontes padrão do `pdf-lib` (Helvetica). Compensado pela ausência total de dependência de SO/navegador em produção.
- **Scope**: Qualquer feature futura que precise gerar PDF em produção (cron ou request-time) usa `pdf-lib` por padrão; Playwright só se justificaria por uma necessidade de layout que `pdf-lib` realmente não cubra (ex. renderizar HTML arbitrário de terceiros), e mesmo assim reavaliar o custo de provisionamento na EC2 antes de adicionar de volta.
- **Date**: 2026-10-29
- **Status**: active

### AD-008
- **Decision**: `Usuario.IS_ADMIN` (`backend-ob-ads`, SQL Server) marca acesso ao painel administrativo interno do ob-ads — não identifica quem representa o cliente. Pra resolver os usuários reais de um cliente (destinatário de notificação, relatório, etc.), a query certa é: vinculado ao cliente (FK direto `Usuario.ID_CLIENTE` ou M:N `USUARIO_X_CLIENTES` ativo) **excluindo** `IS_ADMIN` e excluindo staff interno (`@oficinabrasil.com.br`) — exatamente o filtro que `CommunityReportEmailService.ts:221-233` já usa. Nunca filtrar por `IS_ADMIN = 1` achando que isso pega "o admin/representante do cliente".
- **Reason**: `AdminResolverService.resolverAdminsPorCliente` (CON26-325, relatório de promotores) foi implementado invertendo esse filtro (`IS_ADMIN = 1`), assumindo que a coluna identificava o contato do cliente. Pedido do usuário corrigiu o entendimento: `IS_ADMIN` é sobre acesso ao painel do ob-ads, não sobre representar o cliente — o e-mail estava indo pra gente errada (staff com acesso de painel, não os usuários reais do cliente).
- **Trade-off**: Nenhum — é a mesma query já usada e validada em produção por `CommunityReportEmailService`, só reaproveitada. O nome `AdminResolverService`/`resolverAdminsPorCliente`/endpoint `/internal/clientes/:idCliente/admins` ficou com "admin" por histórico; o significado real agora é "usuários do cliente" — renomear é cosmético, não bloqueante, avaliar se vale a pena numa limpeza futura.
- **Scope**: Qualquer feature futura (neste ou noutro repo) que precise notificar/identificar "o cliente" via `Usuario` do SQL Server reaproveita esse filtro (`IS_ADMIN IS NULL OR IS_ADMIN = 0` + exclusão de `@oficinabrasil.com.br`), nunca inventa um filtro novo baseado em `IS_ADMIN = 1`.
- **Date**: 2026-10-30
- **Status**: active

### AD-009
- **Decision**: Em produção, o relatório semanal de promotores (CON26-325) envia pra uma lista fixa de e-mails por `idCliente` (`DESTINATARIOS_FIXOS_PRODUCAO_POR_CLIENTE`, `config/promotorReportRecipients.ts`) quando o cliente tiver entrada nesse mapa — hoje só a SKF (126), com 3 e-mails (`gabriel.cavalcante@skfvertevo.com`, `mauricio.valdivno@skfvertevo.com`, `oclesio.peternela@skfvertevo.com`). Cliente sem entrada no mapa continua recebendo pelos usuários reais resolvidos dinamicamente via ob-ads (RELPROM-11/AD-008).
- **Reason**: Pedido explícito do usuário — enquanto só a SKF usa de fato o módulo (`CLIENTES_PRODUCAO_HABILITADOS = [126]`, AD-006), prefere garantir quem recebe via lista fixa já validada, em vez de depender só da resolução dinâmica de usuários do cliente.
- **Trade-off**: Divergência entre quem está cadastrado como usuário do cliente no ob-ads e quem de fato recebe o relatório, enquanto o override estiver ativo — mitigado continuando a logar a resolução dinâmica real (`adminsReaisParaLog`) pra auditoria, mesmo sem usá-la pra enviar.
- **Scope**: Qualquer cliente novo habilitado futuramente em `CLIENTES_PRODUCAO_HABILITADOS` sem entrada em `DESTINATARIOS_FIXOS_PRODUCAO_POR_CLIENTE` recebe automaticamente o comportamento padrão (usuários reais) — o override é por cliente, nunca global. Remover a entrada da SKF desse mapa quando o usuário confirmar que a resolução dinâmica pode voltar a ser a fonte de envio.
- **Date**: 2026-10-30
- **Status**: active

### AD-010
- **Decision**: Ler `ultracar_process` (schema externo, mesmo Postgres físico de `MAIN_REGISTER`/`dw`) segue 3 regras fixas: (1) `ultracar_process.st_obads_im` nunca é consultada ao vivo por requisição — só em job batch, filtrado pelo índice existente em `dt_fechado`; (2) o match de CNPJ contra `MAIN_REGISTER.OFICINA`/`dw.cadastro_empresa` é sempre `LEFT JOIN` com CTE normalizada, nunca `EXISTS`/`OR` correlacionado; (3) um id sintético derivado de uma tabela externa (quando a linha não existe em `MAIN_REGISTER.OFICINA`) reserva a faixa a partir de `1_000_000_000` (cabe em `int4`, sem colisão com o `ID_OFICINA` serial atual).
- **Reason**: Medido diretamente em produção (só `SELECT`) durante o design de `ultracar-oficinas-promotores`: `st_obads_im` tem ~12,69 milhões de linhas sem índice em `cnpj`/`id_oficina`/`cep` — um `COUNT(*)` nela já estourou o timeout de 10s. Reescrever o match de `EXISTS`/`OR` para `LEFT JOIN` com CTE normalizada baixou o tempo de ~timeout para ~2s, confirmando o comentário já existente em `utils/sqlCadastroEmpresa.ts` sobre o planejador desistir de hash join com `OR` no `ON`. `enterprise__tb_company.id` chega a 50 milhões mas tem 2.695 valores abaixo de 10 milhões — colide com a faixa atual (e futura, por um bom tempo) de `MAIN_REGISTER.OFICINA."ID_OFICINA"` (hoje até 426.254), então não dá pra reusar o id da origem direto.
- **Trade-off**: Qualquer feature que precise de cidade/endereço histórico de `ultracar_process` precisa de uma tabela de cache própria, atualizada por job batch — não dá para ler o dado "fresco" por requisição. O offset de id sintético exige tradução (`id sintético - 1_000_000_000`) sempre que for preciso voltar ao id de origem.
- **Scope**: Qualquer feature futura que leia `ultracar_process` (ou outro schema externo de volume/qualidade parecido) reaproveita essas 3 regras em vez de reavaliar do zero; qualquer novo esquema de id sintético para linha sem `MAIN_REGISTER.OFICINA` usa a mesma faixa reservada (`>= 1_000_000_000`) para não colidir entre features diferentes.
- **Date**: 2026-11-05
- **Status**: active

## Handoff

- **Feature**: disparo-convite-visita-admin (`.specs/features/disparo-convite-visita-admin/`), **DONE**
- **Phase / Task**: Specify, Design, Tasks, Execute e Verify concluídos. As 36 tasks estão commitadas nos três repos. O Verifier deu **PASS**: 47/47 requisitos com evidência e 22/22 mutantes mortos. `validate_state.py` terminou com exit 0.
- **Completed**: tudo. Depois do Verifier foram feitas mais duas coisas:
  - as fixtures de `campanhaService*` receberam `STATUS='PUBLICADA'` (EG-1);
  - no ob-ads, a coluna passou a se chamar "Promotores vinculados".
- **In-progress**: nada
- **Next step**:
  1. Decisão do usuário sobre SPG-2. A recusa hoje só bloqueia nova rota no fluxo admin. Opções: proteger também os fluxos do cliente e o despacho, ou restringir a spec ao admin.
  2. UAT no navegador (ob-ads admin e página do jornal).
  3. Aplicar `scripts/migration-convite-visita-admin.sql` em homolog, com a prévia de impacto que está no cabeçalho do script. Depois validar os backfills e fazer um teste de disparo concorrente.
  4. Configurar `OBADS_JWT_SECRET` com o mesmo valor do `JWT_SECRET` do backend-ob-ads.
  5. `git push` e PRs nos três repos. Exigem autorização explícita.
- **Blockers**: nenhum técnico. SPG-2 depende de decisão de produto.
- **Uncommitted files**:
  - `.specs/LESSONS.md`, `.specs/lessons.json`: mudanças que já existiam, mais as lições L-017..L-022 do Verifier, todas candidatas.
  - `package-lock.json`: mudança que já existia, fora do escopo.
- **Branches**:

  | Repo | Branch |
  | --- | --- |
  | `backend-promotor` | `feat/disparo-convite-visita-admin` |
  | `ob-ads` | `feat/disparo-convite-visita-admin` |
  | `jornalOficinaBrasil` | `feat/recusar-visita`, no worktree `../jornalOficinaBrasil-recusar-visita` (com `node_modules` em junction para o checkout principal) |
