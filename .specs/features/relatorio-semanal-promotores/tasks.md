# Relatório Semanal de Promotores Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/relatorio-semanal-promotores/design.md`
**Status**: In Progress

**Escopo cross-repo**: Fase 2 roda inteira no repo `backend-ob-ads` (`C:\Users\AndrePereira\Documents\oficina brasil\backend-ob-ads`), já na branch `feat/relatorio-promotores-semanal` (criada a partir de `main`, confirmado limpo e sincronizado — nenhuma task de setup de branch é necessária). As demais fases rodam no `backend-promotor`, também já na branch `feat/relatorio-promotores-semanal`. Cada commit de task vai pro repo correto — os comandos de commit das tasks da Fase 2 usam `git -C "<path do ob-ads>"`, nunca o repo atual.

**Restrição de execução de testes (instrução do usuário)**: todo `Gate` roda só o arquivo de teste da própria task, nunca a suíte inteira, e sempre em lote único (`--runInBand`), por restrição de memória. Nenhuma task roda `npm test`/`jest` sem um caminho de arquivo explícito.

---

## Test Coverage Matrix

> Gerado a partir da amostragem do código (nenhum `AGENTS.md`/`CONTRIBUTING.md`/guideline de teste encontrado em nenhum dos dois repos — defaults fortes aplicados). Amostras usadas: `__tests__/unit/outboxCron.test.ts`, `__tests__/integration/adminDisparo.test.ts`, `__tests__/helpers/mockRepo.ts` (backend-promotor); `src/tests/CommunityReportEmail.*.test.ts` (backend-ob-ads).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Service / domínio puro (cálculos, `promotorReportService`, `obAdsIntegrationClient`, `moduloClientesService`, `adminResolverService`, guarda de destinatários) | unit | Todos os branches; 1:1 com as ACs da spec que a task cobre; todo edge case listado tem teste próprio | `__tests__/unit/*.test.ts` (backend-promotor) · `src/tests/*.test.ts` (backend-ob-ads) | `npx jest --runInBand <arquivo-do-teste-da-task>` |
| Rota / controller (`PromotorRelatorioRoute`, `InternalModulosRoutes`, `InternalEmailRoutes`) | integration | Happy path + todo edge case listado + caminhos de erro/status HTTP exatos | `__tests__/integration/*.test.ts` (backend-promotor) · `src/tests/*.test.ts` (backend-ob-ads) | `npx jest --runInBand <arquivo-do-teste-da-task>` |
| Cron (`promotorRelatorioCron`) | unit | Mesma profundidade de `outboxCron.test.ts`: travas de `NODE_ENV`/flag, lock de sobreposição, expressão de schedule | `__tests__/unit/*.test.ts` | `npx jest --runInBand <arquivo-do-teste-da-task>` |
| Entity (`PromotorRelatorioEnvio`) | none | - (build gate only) | - | `npx tsc --noEmit` |
| Script SQL de migration/módulo (manual, nunca executado pelo agente) | none | - (revisão humana; execução manual pelo usuário, conforme instrução) | `scripts/*.sql` (backend-promotor) · `sql/*.sql` (backend-ob-ads) | nenhum — revisão manual, sem gate automatizado |
| Wiring trivial (registrar rota/cron existente em `app.ts`) | none | Coberto indiretamente pelo teste unitário/integração do componente já registrado na mesma task ou numa task anterior | `app.ts` | `npx tsc --noEmit` |
| Spike exploratório (validação do Playwright no SO real da EC2, simulado via `amazonlinux:2023`) | none | Não é código de produção coberto pela matrix — resultado documentado em prosa no próprio design.md | `scripts/spike-playwright-ec2.ts` | nenhum automatizado — validação manual via Docker Desktop (sandbox) |

## Gate Check Commands

> Gerado a partir de `package.json` de cada repo (`backend-promotor` e `backend-ob-ads` usam o mesmo stack: `jest`/`ts-jest`/`tsc`, sem lint configurado em nenhum dos dois).

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Após task só com teste unitário | `npx jest --runInBand <arquivo-do-teste-da-task>` — nunca `npm test`/`jest` sem caminho, nunca a suíte inteira |
| Full | Após task com teste de integração (rota) | `npx jest --runInBand <arquivo-do-teste-de-integracao-da-task>` |
| Build | Após task de entity/config/wiring, ou ao fim de cada fase | `npx tsc --noEmit` (rodado no repo da task: `backend-promotor` ou `backend-ob-ads`) |

---

## Execution Plan

Fases são sequenciais — cada fase termina antes da próxima começar, tasks dentro de uma fase executam em ordem.

### Phase 1: Spike — validar Playwright no SO real da EC2

Gate de risco antes de qualquer código de produção da feature (pedido do usuário).

```
T01
```

### Phase 2: backend-ob-ads — endpoints internos genéricos

Repo irmão, branch já criada. Deve ser implantado antes da Phase 5 (backend-promotor só funciona fim-a-fim depois que isso existir em produção/homolog).

```
T02 -> T05
T03 -> T05
T04 -> T05
T02 -> T06
```

### Phase 3: backend-promotor — fundação (entity + cálculo puro)

```
T08 -> T09
T10 -> T11
```

### Phase 4: backend-promotor — integração + orquestração

```
T12 -> T13
T12 -> T16
T13 -> T17
T14 -> T17
T15 -> T17
T16 -> T17
T17 -> T18
```

### Phase 5: backend-promotor — cron + endpoint manual + wiring

```
T19 -> T20
T21 -> T22
```

---

## Task Breakdown

### Phase 1: Spike — validar Playwright no SO real da EC2 (tasks)

### T01: Validar Playwright no SO real da EC2 de produção (spike)

**What**: Produção roda `node` direto numa instância EC2 (Amazon Linux 2023), sem Docker/ECS — `Dockerfile`/`task_definition.tpl.json` do repo estão desatualizados e não refletem o deploy real. Simular esse ambiente localmente com um container `amazonlinux:2023` (sandbox só pra validação, não é o que vai rodar em produção), instalar Node 20 + Chromium do Playwright nele, e gerar 1 PDF de teste a partir de um HTML mínimo.
**Where**: `scripts/spike-playwright-ec2.ts` (novo, script descartável), `.specs/features/relatorio-semanal-promotores/design.md` (atualiza a linha de risco do Playwright com o resultado real e a lista de pacotes de sistema necessários, se houver)
**Depends on**: None
**Reuses**: nada do `Dockerfile` do repo (ele não representa o ambiente real)

**Tools**:
- MCP: NONE (Bash local com `docker run amazonlinux:2023`, Docker Desktop só como sandbox de simulação)
- Skill: NONE

**Done when**:
- [x] Container `amazonlinux:2023` rodando localmente, com Node 20 instalado nele (NodeSource `setup_20.x`, `dnf` não tinha `nodejs20` por esse nome)
- [x] Dentro do container: `npx playwright install --with-deps chromium` executado — **falhou**: `--with-deps` só sabe instalar via `apt-get`, inexistente no AL2023 (`sh: apt-get: command not found`, aviso "your OS is not officially supported by Playwright")
- [x] Instalado manualmente via `dnf` o conjunto de libs equivalente (`nspr nss nss-util dbus-libs atk at-spi2-atk cups-libs libxcb libxkbcommon at-spi2-core libX11 libXcomposite libXdamage libXext libXfixes libXrandr mesa-libgbm cairo pango systemd-libs alsa-lib`) — 1 PDF gerado com sucesso a partir de HTML mínimo (`OK bytes=10064 prefix=%PDF-`), confirmando que `chromium.launch()` roda em Amazon Linux 2023 com esse provisionamento
- [x] Resultado documentado em `design.md` (linha de risco do Playwright): funcionou, com a lista exata de pacotes `dnf` e a ressalva de rodar `playwright install chromium` **sem** `--with-deps`
- [x] N/A — funcionou (não precisou escalonar pra abordagem alternativa)

**Tests**: none
**Gate**: build — `npx tsc --noEmit` rodado; zero erros no arquivo novo (2 erros pré-existentes no repo, em `__tests__/unit/segmentacaoCampanhaPromotor.test.ts`, não relacionados a esta task — fora de escopo, não tocados)

**Commit**: `chore(relatorio-promotores): valida playwright no so real da ec2 (amazon linux 2023)`

**Status**: ✅ Complete

---

### Phase 2: backend-ob-ads — endpoints internos genéricos (tasks)

### T02: Middleware genérico de API key interna (ob-ads)

**What**: Extrair o padrão de guarda de `CommunityReportInternalRoutes.ts:9-19` pra um middleware reutilizável, validando `x-api-key` contra `process.env.INTERNAL_API_KEY` (AD-005).
**Where**: `backend-ob-ads/src/main/config/middlewares/internalApiKeyGuard.ts` (novo — pasta real é `config/middlewares`, não `middlewares` direto; corrigido durante a implementação ao confirmar onde os middlewares existentes já vivem)
**Depends on**: None
**Reuses**: `notificationWebhookAuth.ts` (comparação em tempo constante via `timingSafeEqual`+hash, mais robusta que a comparação `!==` ingênua de `CommunityReportInternalRoutes.ts:9-19`) — mesmo header `x-api-key` desse último
**Requirement**: AD-005 (infra, sem AC de spec direta)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Middleware exportado, 401 se header ausente ou diferente de `INTERNAL_API_KEY`
- [x] Não depende de sessão/JWT de usuário (mesma postura do padrão original)
- [x] Gate check passa: `npx jest --runInBand src/tests/internalApiKeyGuard.test.ts` (4 passed)
- [x] Teste cobre: header ausente (401), header errado (401), header correto (chama `next()`), e falha fechado sem `INTERNAL_API_KEY` configurado

**Tests**: unit
**Gate**: quick

**Commit**: `feat(internal): adiciona guarda generica de api key` (ob-ads `e6c9e60e`)

**Status**: ✅ Complete

---

### T03: `ModuloClientesService.listarClientesHabilitados` (ob-ads)

**What**: Serviço que consulta `Module` + `ClienteModule` e retorna todos os `idCliente`/`nomeCliente` com um módulo (por nome) habilitado, com filtro opcional por `idCliente` único.
**Where**: `backend-ob-ads/src/appplication/services/moduloClientesService.ts` (novo)
**Depends on**: None
**Reuses**: `Module`/`ClienteModule` entities já existentes
**Requirement**: RELPROM-20, RELPROM-21, RELPROM-39

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `listarClientesHabilitados(nomeModulo: string, idCliente?: number)` retorna `{idCliente, nomeCliente}[]`
- [x] Módulo inexistente (nome não cadastrado em `Module`) retorna lista vazia, não erro
- [x] Filtro por `idCliente` restringe a 0 ou 1 resultado
- [x] Gate check passa: `npx jest --runInBand src/tests/moduloClientesService.test.ts` (4 passed)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(modulos): lista clientes habilitados por nome de modulo` (ob-ads `5f0a037e`)

**Status**: ✅ Complete

---

### T04: `AdminResolverService.resolverAdminsPorCliente` (ob-ads)

**What**: Extrair a query de `CommunityReportEmailService.ts:221-233` pra um serviço próprio, invertendo o filtro de `IS_ADMIN` (`= 1` em vez de `IS NULL OR = 0`), mantendo a exclusão de `@oficinabrasil.com.br`.
**Where**: `backend-ob-ads/src/appplication/services/adminResolverService.ts` (novo)
**Depends on**: None
**Reuses**: query de `CommunityReportEmailService.ts:221-233` (adaptada, não chamada diretamente — `CommunityReportEmailService` não muda)
**Requirement**: RELPROM-11, RELPROM-12

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `resolverAdminsPorCliente(idCliente: number)` retorna `string[]` só com e-mails de `IS_ADMIN = 1`, excluindo `@oficinabrasil.com.br` — assinatura simplificada pra 1 cliente por chamada durante a implementação (evita ambiguidade de bucket quando o vínculo vem do M:N `USUARIO_X_CLIENTES`; T05 chama 1x por cliente da listagem de T03)
- [x] Cliente sem nenhum admin resolvido retorna array vazio (não lança erro)
- [x] Gate check passa: `npx jest --runInBand src/tests/adminResolverService.test.ts` (4 passed)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(usuarios): resolve admins de um cliente para notificacao` (ob-ads `78cb356d`)

**Status**: ✅ Complete

---

### T05: `GET /internal/modulos/:nomeModulo/clientes-habilitados` (ob-ads)

**What**: Rota interna que combina T03 (clientes habilitados) + T04 (admins), atrás do middleware de T02.
**Where**: `backend-ob-ads/src/main/config/routes/InternalModulosRoutes.ts` (novo), registrada no agregador de rotas do bootstrap (mesmo arquivo onde `CommunityReportInternalRoutes` é montada)
**Depends on**: T02, T03, T04
**Reuses**: padrão de `CommunityReportInternalRoutes.ts` pra declarar a rota
**Requirement**: RELPROM-20, RELPROM-21, RELPROM-39

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `GET /internal/modulos/promotores/clientes-habilitados` retorna `{idCliente, nomeCliente, admins: string[]}[]`, 401 sem `x-api-key` válido
- [x] Query `?idCliente=` filtra pra 1 cliente só; cliente sem módulo habilitado retorna lista vazia (não 404 — 404 é decisão do chamador, não da rota de listagem); `?idCliente=` inválido responde 400
- [x] Gate check passa: `npx jest --runInBand src/tests/internalModulosRoutes.test.ts` (6 passed)
- [x] Rota montada em `src/main/api.ts` (`app.use("/internal/modulos", internalModulosRoutes)`)

**Tests**: integration
**Gate**: full

**Commit**: `feat(internal): expoe endpoint de clientes habilitados por modulo` (ob-ads `ade8cd68`)

**Status**: ✅ Complete

---

### T06: `POST /internal/email/enviar-com-anexo` (ob-ads)

**What**: Wrapper fino sobre `EmailService.sendEmailWithAttachment`, atrás do middleware de T02, genérico (não específico de promotor).
**Where**: `backend-ob-ads/src/main/config/routes/InternalEmailRoutes.ts` (novo), registrada no agregador de rotas
**Depends on**: T02
**Reuses**: `EmailService.sendEmailWithAttachment` (`EmailService.ts:115-153`), sem alteração nele
**Requirement**: RELPROM-11, RELPROM-37

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `POST /internal/email/enviar-com-anexo` com body `{to, subject, bodyHtml, attachment:{filename, contentBase64, contentType}}` chama `EmailService.sendEmailWithAttachment` e devolve `{success, error?}` tal qual o service retorna (nunca lança); resposta HTTP 200 se `success:true`, 502 se `success:false` (falha de SES não é erro do chamador)
- [x] 401 sem `x-api-key` válido; 400 se `to` vazio ou `attachment` ausente
- [x] Gate check passa: `npx jest --runInBand src/tests/internalEmailRoutes.test.ts` (5 passed)
- [x] Rota montada em `src/main/api.ts` (`app.use("/internal/email", internalEmailRoutes)`)

**Tests**: integration
**Gate**: full

**Commit**: `feat(internal): expoe endpoint generico de envio de email com anexo` (ob-ads `1a9b892d`)

**Status**: ✅ Complete

---

### T07: Script SQL do módulo "Promotores" (ob-ads, execução manual)

**What**: Script idempotente (`IF NOT EXISTS`) pra inserir a linha do módulo "promotores" em `module`, seguindo o padrão de `sql/2026-09-con26-156-modulo-comentarios-global.sql` (`menu_nome`/`ordem` `NULL` — é permissão de API, sem item de menu próprio). **Não executado pelo agente** — fica pronto pro usuário rodar manualmente em homolog/produção. Nome do módulo em minúsculo (`promotores`), não `Promotores`, pra seguir a convenção real do repo (`comentarios_global`).
**Where**: `backend-ob-ads/sql/2026-10-con26-325-modulo-promotores.sql` (novo)
**Depends on**: None
**Reuses**: padrão de `sql/2026-09-con26-156-modulo-comentarios-global.sql` (idempotência, bloco de rollback no cabeçalho)
**Requirement**: RELPROM-20

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `INSERT INTO module (nome, menu_nome, ordem) VALUES ('promotores', NULL, NULL)` dentro de `IF NOT EXISTS (...)`
- [x] Cabeçalho do script documenta o `DELETE FROM module WHERE nome = 'promotores'` de rollback, com o aviso de que não há FK impedindo linha órfã em `cliente_module`
- [x] Nenhuma execução automática — a task só criou o arquivo

**Tests**: none
**Gate**: nenhum — revisão manual do SQL, execução manual pelo usuário

**Commit**: `chore(modulos): script de criacao do modulo promotores` (ob-ads `0ed7be63`)

**Status**: ✅ Complete

---

### Phase 3: backend-promotor — fundação (entity + cálculo puro) (tasks)

### T08: Entity `PromotorRelatorioEnvio` (backend-promotor)

**What**: Nova entity TypeORM pra idempotência/auditoria de envio (`ID_CLIENTE`, `PERIODO_INICIO`, `PERIODO_FIM`, `ORIGEM`, `STATUS`, `MOTIVO_FALHA`, `DESTINATARIOS`, `AMBIENTE`, `CRIADO_EM`).
**Where**: `entities/PromotorRelatorioEnvio.ts` (novo)
**Depends on**: None
**Reuses**: convenção de entity TypeORM já usada em `entities/*.ts`
**Requirement**: RELPROM-18

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Entity compila, colunas e tipos batem com o design.md (enums `OrigemRelatorioEnvio`, `StatusRelatorioEnvio`, `AmbienteRelatorioEnvio`)
- [x] `coveragePathIgnorePatterns` do `jest.config.ts` já ignora `entities` — nenhuma mudança de config necessária
- [x] Gate check passa: `npx tsc --noEmit` (zero erros no arquivo novo)

**Tests**: none
**Gate**: build

**Commit**: `feat(promotor-relatorio): adiciona entity de controle de envio`

**Status**: ✅ Complete

---

### T09: Migration manual da tabela `PROMOTOR_RELATORIO_ENVIO` (backend-promotor)

**What**: Script `.sql` idempotente criando a tabela de T08, com chave única `(ID_CLIENTE, PERIODO_INICIO, PERIODO_FIM, ORIGEM)` só aplicada quando `ORIGEM='CRON'`. **Não executado pelo agente.**
**Where**: `scripts/migration-promotor-relatorio-envio.sql` (novo)
**Depends on**: T08
**Reuses**: padrão de `scripts/migration-*.sql` já existentes (idempotente, bloco `ROLLBACK:` no cabeçalho, `COMMENT ON` em tabela/coluna)
**Requirement**: RELPROM-18

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `CREATE TABLE IF NOT EXISTS` com todas as colunas de T08 (TEXT+CHECK pros enums, TIMESTAMPTZ, sem FK — convenção confirmada em `migration-notificacao-visita.sql`)
- [x] Índice único parcial `WHERE ORIGEM = 'CRON' AND STATUS = 'SUCESSO'` sobre `(ID_CLIENTE, PERIODO_INICIO, PERIODO_FIM)`
- [x] Cabeçalho com bloco `ROLLBACK:` (`DROP TABLE ... CASCADE`)
- [x] Nenhuma execução automática — a task só criou o arquivo

**Tests**: none
**Gate**: nenhum — revisão manual, execução manual pelo usuário

**Commit**: `chore(promotor-relatorio): script de migration da tabela de controle de envio`

**Status**: ✅ Complete

---

### T10: Cálculo de visão geral e assertividade por campanha (backend-promotor)

**What**: Funções puras `calcularVisaoGeral` e `calcularAssertividade`, recebendo as linhas de `ROTA_PROMOTOR` de uma campanha e o período, sem acessar banco.
**Where**: `utils/promotorReportCalculos.ts` (novo)
**Depends on**: None
**Reuses**: convenção do repo de isolar lógica pura (ex. `utils/haversine.ts`, `service/envioGuards.ts`)
**Requirement**: RELPROM-02, RELPROM-03, RELPROM-04, RELPROM-05, RELPROM-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `calcularVisaoGeral` conta concluídas/canceladas no período e abertas na rota (foto atual) corretamente
- [ ] `calcularAssertividade` retorna `"N/A"` quando concluídas+canceladas = 0, senão a porcentagem arredondada
- [ ] Gate check passa: `npx jest --runInBand __tests__/unit/promotorReportCalculos.test.ts`
- [ ] Teste cobre RELPROM-02 a RELPROM-06, incluindo o caso de divisão por zero

**Tests**: unit
**Gate**: quick

**Commit**: `feat(promotor-relatorio): calculo de visao geral e assertividade por campanha`

---

### T11: Cálculo de promotores, destaques e próximos passos (backend-promotor)

**What**: Funções puras `agruparPorPromotor`, `listarDestaquesDeCampo` (com truncamento de OBS em 500 caracteres) e `calcularProximosPassos`, no mesmo arquivo de T10.
**Where**: `utils/promotorReportCalculos.ts` (modifica)
**Depends on**: T10
**Reuses**: nada novo além do próprio arquivo
**Requirement**: RELPROM-07, RELPROM-08, RELPROM-09, RELPROM-10, RELPROM-24, RELPROM-25

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `agruparPorPromotor` inclui promotor com todos os valores zerados (não omite linha)
- [ ] `listarDestaquesDeCampo` só lista visitas com OBS preenchido, truncando em 500 caracteres + reticências (RELPROM-24); agrupa por status
- [ ] `calcularProximosPassos` conta abertas na rota, canceladas a redistribuir, promotores sem registro no período
- [ ] Limite superior do período (23:59:59 America/Sao_Paulo) é inclusivo (RELPROM-25)
- [ ] Gate check passa: `npx jest --runInBand __tests__/unit/promotorReportCalculos.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(promotor-relatorio): calculo de promotores, destaques e proximos passos`

---

### Phase 4: backend-promotor — integração + orquestração (tasks)

### T12: `ObAdsIntegrationClient.listarClientesHabilitados` (backend-promotor)

**What**: Cliente HTTP que chama `GET /internal/modulos/:nomeModulo/clientes-habilitados` (T05), com `x-api-key` e timeout configurado, retornando união de sucesso/erro (nunca lança).
**Where**: `service/obAdsIntegrationClient.ts` (novo)
**Depends on**: None
**Reuses**: `fetch` nativo do Node 20 (sem nova dependência); padrão de erro-como-união de `rotaService.notificarRotasCriadas`
**Requirement**: RELPROM-20, RELPROM-39

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `listarClientesHabilitados(nomeModulo, idCliente?)` retorna `{sucesso:true, dados}` ou `{sucesso:false, motivo}` — nunca lança
- [ ] Timeout e erro de rede tratados como `{sucesso:false, motivo}`
- [ ] Header `x-api-key` lido de `process.env.INTERNAL_API_KEY` a cada chamada (não cacheado em const de módulo, por causa de `dotenv.config()` tardio)
- [ ] Gate check passa: `npx jest --runInBand __tests__/unit/obAdsIntegrationClient.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(promotor-relatorio): cliente de integracao com ob-ads (listagem)`

---

### T13: `ObAdsIntegrationClient.enviarEmailComAnexo` (backend-promotor)

**What**: Método que chama `POST /internal/email/enviar-com-anexo` (T06), mesmo padrão de erro-como-união.
**Where**: `service/obAdsIntegrationClient.ts` (modifica)
**Depends on**: T12
**Reuses**: estrutura HTTP já criada em T12
**Requirement**: RELPROM-11, RELPROM-37

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `enviarEmailComAnexo(req)` retorna `{sucesso:true}` ou `{sucesso:false, motivo}` — nunca lança
- [ ] PDF passado como `Buffer`, convertido pra base64 só na borda HTTP (não antes)
- [ ] Gate check passa: `npx jest --runInBand __tests__/unit/obAdsIntegrationClient.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(promotor-relatorio): cliente de integracao com ob-ads (envio de email)`

---

### T14: Guarda de destinatários dev/produção (backend-promotor)

**What**: Constante `DEV_REPORT_RECIPIENTS` + função `resolverDestinatarios(adminsReais: string[])` que decide, lendo `NODE_ENV` a cada chamada, se usa a lista fixa (dev) ou os admins reais (produção), e retorna também os admins reais pra log quando em dev.
**Where**: `config/promotorReportRecipients.ts` (novo)
**Depends on**: None
**Reuses**: padrão de leitura de env "a cada chamada" (não cachear em const de módulo), espelhando `CommunityReportEmailService.ts:62-70`
**Requirement**: RELPROM-28, RELPROM-29, RELPROM-30, RELPROM-31

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `NODE_ENV !== "production"` (incluindo indefinido) → retorna `DEV_REPORT_RECIPIENTS` + `adminsReaisParaLog: adminsReais`
- [ ] `NODE_ENV === "production"` → retorna `adminsReais`, nunca a lista de teste
- [ ] `DEV_REPORT_RECIPIENTS` vazia fora de produção → retorna destinatários vazios (tratado como falha de resolução a jusante, RELPROM-30)
- [ ] E-mail inválido na lista de teste é filtrado, não derruba os demais
- [ ] Gate check passa: `npx jest --runInBand __tests__/unit/promotorReportRecipients.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(promotor-relatorio): guarda de destinatarios dev/producao`

---

### T15: `PromotorReportPdfRenderer` + template HTML (backend-promotor)

**What**: Renderiza o HTML do relatório (capa + 1 bloco por campanha) em PDF via Playwright.
**Where**: `service/promotorReportPdfRenderer.ts`, `templates/relatorioPromotor.ts` (novos)
**Depends on**: T01, T11
**Reuses**: `assets/fonts/Montserrat-*`, `assets/img/obLogo.png` (identidade visual); resultado do spike T01 define se o `Dockerfile` atual é usado como está
**Requirement**: RELPROM-01, RELPROM-26, RELPROM-27

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Template HTML gera 1 capa + N blocos (1 por campanha), nessa ordem, com as 6 seções por bloco
- [ ] `renderizarPdf(dados)` retorna `Buffer` de PDF válido (prefixo `%PDF-`)
- [ ] Teste unitário mocka o módulo `playwright` (não renderiza PDF real) e verifica que o HTML passado pro `page.setContent`/`page.pdf` contém os dados esperados (nome do cliente, nome de cada campanha, contadores)
- [ ] Gate check passa: `npx jest --runInBand __tests__/unit/promotorReportPdfRenderer.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(promotor-relatorio): renderizacao do pdf via playwright`

---

### T16: `PromotorReportService.gerarRelatorioCliente` (backend-promotor)

**What**: Orquestra, pra 1 cliente: busca campanhas ativas (critério de `adminDisparoService.ts:178-208`), roda os cálculos de T10/T11 por campanha, monta `RelatorioPromotorData`. Ainda sem enviar e-mail nem persistir auditoria.
**Where**: `service/promotorReportService.ts` (novo)
**Depends on**: T10, T11, T12
**Reuses**: critério de campanha ativa de `adminDisparoService.ts:178-208`
**Requirement**: RELPROM-01, RELPROM-02, RELPROM-03, RELPROM-04, RELPROM-05, RELPROM-06, RELPROM-07, RELPROM-08, RELPROM-09, RELPROM-10, RELPROM-13, RELPROM-22, RELPROM-26, RELPROM-27

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Cliente com 2+ campanhas ativas → 1 bloco por campanha, sem agregar métricas entre elas
- [ ] Cliente com 1 campanha ativa → 1 bloco só
- [ ] Cliente com módulo habilitado mas sem campanha ativa → `RelatorioPromotorData` com `campanhas: []`, tratado como "sem dado disponível" (RELPROM-22), não erro
- [ ] Cliente sem nenhuma visita no período → contadores zerados, gera normalmente (RELPROM-13)
- [ ] Gate check passa: `npx jest --runInBand __tests__/unit/promotorReportService.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(promotor-relatorio): monta dados do relatorio por cliente`

---

### T17: Envio + auditoria/idempotência (backend-promotor)

**What**: Estende `PromotorReportService` com o envio de e-mail (T13+T14+T15) e a gravação em `PromotorRelatorioEnvio` (T08), aplicando a guarda dev/prod e isolando falha por cliente.
**Where**: `service/promotorReportService.ts` (modifica)
**Depends on**: T13, T14, T15, T16
**Reuses**: `AppDataSourceSync.getRepository(PromotorRelatorioEnvio)` (T08)
**Requirement**: RELPROM-11, RELPROM-12, RELPROM-17, RELPROM-18, RELPROM-28, RELPROM-29, RELPROM-30, RELPROM-31

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Fluxo completo: gera PDF (T15) → resolve destinatários (T14) → envia (T13) → grava `PromotorRelatorioEnvio` com `STATUS`/`DESTINATARIOS`/`AMBIENTE`
- [ ] Falha em qualquer etapa (PDF, resolução de destinatário, envio) grava `STATUS='FALHA'` com `MOTIVO_FALHA`, não lança pra cima (isolamento por cliente, RELPROM-17)
- [ ] `ORIGEM='CRON'` respeita a chave única (RELPROM-18); `ORIGEM='MANUAL'` nunca colide
- [ ] Em dev, `DESTINATARIOS` gravado é a lista de teste, mas o log também mostra os admins reais que seriam usados
- [ ] Gate check passa: `npx jest --runInBand __tests__/unit/promotorReportService.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(promotor-relatorio): envia relatorio e registra auditoria/idempotencia`

---

### T18: `PromotorReportService.processarClientesElegiveis` (backend-promotor)

**What**: Lista todos os clientes elegíveis (T12 com o módulo "Promotores"), chama T17 pra cada um isoladamente, monta o resumo da execução.
**Where**: `service/promotorReportService.ts` (modifica)
**Depends on**: T17
**Reuses**: nada novo
**Requirement**: RELPROM-14, RELPROM-17, RELPROM-19

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Falha ao listar clientes elegíveis (ob-ads indisponível) aborta a execução inteira com 1 log único, não tenta nenhum cliente
- [ ] Falha isolada em 1 cliente não impede os demais (RELPROM-17)
- [ ] Resumo final: `{elegiveis, enviados, falharam}` logado ao fim (RELPROM-19)
- [ ] Gate check passa: `npx jest --runInBand __tests__/unit/promotorReportService.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(promotor-relatorio): processa todos os clientes elegiveis em lote`

---

### Phase 5: backend-promotor — cron + endpoint manual + wiring (tasks)

### T19: `schedule/promotorRelatorioCron.ts` (backend-promotor)

**What**: Registro `node-cron` pra sexta-feira 07:00 America/Sao_Paulo, chamando T18, com as mesmas 2 travas + lock de sobreposição de `outboxNotificacaoCron.ts`.
**Where**: `schedule/promotorRelatorioCron.ts` (novo)
**Depends on**: T18
**Reuses**: estrutura 1:1 de `schedule/outboxNotificacaoCron.ts` (`NODE_ENV==="test"` aborta sempre, flag `PROMOTOR_RELATORIO_ENABLED==="1"`, lock de sobreposição por closure)
**Requirement**: RELPROM-14, RELPROM-15, RELPROM-16

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `NODE_ENV==="test"` nunca registra (sem log)
- [ ] `PROMOTOR_RELATORIO_ENABLED` diferente de exatamente `"1"` (incluindo `"true"`) não registra
- [ ] Período calculado: 7 dias corridos anteriores, corte 23:59:59 America/Sao_Paulo do dia anterior ao disparo
- [ ] Lock impede 2 execuções simultâneas se o tick anterior ainda não terminou
- [ ] Gate check passa: `npx jest --runInBand __tests__/unit/promotorRelatorioCron.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(promotor-relatorio): cron semanal de disparo`

---

### T20: Registrar cron em `app.ts` (backend-promotor)

**What**: 1 linha chamando `registrarPromotorRelatorioCron()`, no mesmo ponto onde `outboxNotificacaoCron` é registrado (dentro do `.then()` de `AppDataSourceSync.initialize()`, `app.ts:53`).
**Where**: `app.ts` (modifica)
**Depends on**: T19
**Reuses**: ponto de registro já existente
**Requirement**: RELPROM-14

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Chamada adicionada logo após o registro do outbox cron, mesma ordem de dependência (depois do data source pronto)
- [ ] Gate check passa: `npx tsc --noEmit`

**Tests**: none
**Gate**: build

**Commit**: `chore(promotor-relatorio): registra cron na subida do processo`

---

### T21: `PromotorRelatorioRoute` + controller (backend-promotor)

**What**: Endpoint administrativo `POST /admin/promotor-relatorio/:idCliente/gerar`, query `inicio`/`fim` (ISO date, opcional) e `enviarEmail` (boolean, default `true`); retorna PDF binário ou JSON de erro.
**Where**: `routes/PromotorRelatorioRoute.ts`, `controllers/promotorReportController.ts` (novos)
**Depends on**: T17
**Reuses**: `createDocumentedRoute` + `router.use(adminAuthMiddleware)` + `responder()` de `routes/AdminDisparoRoute.ts`
**Requirement**: RELPROM-32, RELPROM-33, RELPROM-34, RELPROM-35, RELPROM-36, RELPROM-37, RELPROM-38, RELPROM-39

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Sem token/token inválido → 401; token válido sem `IS_ADMIN` → 403 (mesmo comportamento de `adminAuthMiddleware`)
- [ ] Sucesso → `Content-Type: application/pdf`, corpo é o PDF (prefixo `%PDF-`)
- [ ] `enviarEmail=false` → gera e retorna PDF, não chama `enviarEmailComAnexo`
- [ ] Cliente sem módulo/sem campanha/inexistente → JSON `{message, error}` com 404, identificando qual condição falhou
- [ ] Sem `inicio`/`fim` → usa a mesma janela de 7 dias do cron (RELPROM-33); com `inicio`/`fim` → usa o período informado (RELPROM-34)
- [ ] Gate check passa: `npx jest --runInBand __tests__/integration/promotorRelatorio.test.ts`

**Tests**: integration
**Gate**: full

**Commit**: `feat(promotor-relatorio): endpoint administrativo de disparo manual`

---

### T22: Registrar rota em `app.ts`/`api.ts` (backend-promotor)

**What**: Montar `PromotorRelatorioRoute` no mesmo arquivo/ponto onde `AdminDisparoRoute` é montada (`api.ts:22`, `app.use("/admin", adminDisparoRoutes)`).
**Where**: `api.ts` (modifica)
**Depends on**: T21
**Reuses**: ponto de montagem já existente das rotas `/admin/*`
**Requirement**: RELPROM-32

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Rota nova montada igual às demais `/admin/*`
- [ ] Gate check passa: `npx tsc --noEmit`

**Tests**: none
**Gate**: build

**Commit**: `chore(promotor-relatorio): registra rota administrativa de disparo manual`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T01
Phase 2:  T02 ------→ T05
          T03 ------→ T05
          T04 ------→ T05
          T02 ------→ T06
          T07 (sem dependência)
Phase 3:  T08 ------→ T09
          T10 ------→ T11
Phase 4:  T12 ------→ T13 ------→ T17 ------→ T18
          T12 ------→ T16 ------→ T17
          T14 ------→ T17
          T15 ------→ T17
Phase 5:  T19 ------→ T20
          T21 ------→ T22
```

Dependências cross-phase (não aparecem no diagrama por fase, só no `Depends on` de cada task, conforme a regra do skill): T15 depende de T01 (Phase 1) e T11 (Phase 3); T16 depende de T10 e T11 (Phase 3); T19 depende de T18 (Phase 4); T21 depende de T17 (Phase 4).

Execução é estritamente sequencial dentro de cada fase — sem paralelismo intra-fase.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T01 | 1 script spike | ✅ Granular |
| T02 | 1 middleware | ✅ Granular |
| T03 | 1 service | ✅ Granular |
| T04 | 1 service | ✅ Granular |
| T05 | 1 rota (compõe T02-T04) | ✅ Granular |
| T06 | 1 rota | ✅ Granular |
| T07 | 1 script SQL | ✅ Granular |
| T08 | 1 entity | ✅ Granular |
| T09 | 1 script SQL | ✅ Granular |
| T10 | 2 funções puras correlatas (visão geral + assertividade), 1 arquivo | ✅ Granular |
| T11 | 3 funções puras correlatas (promotor + destaques + próximos passos), mesmo arquivo de T10 | ✅ Granular (coeso, mesmo componente do design) |
| T12 | 1 método de 1 client | ✅ Granular |
| T13 | 1 método, mesmo arquivo de T12 | ✅ Granular |
| T14 | 1 função + 1 constante | ✅ Granular |
| T15 | 1 renderer + 1 template | ✅ Granular (par indissociável: renderer sem template não compila) |
| T16 | 1 método de orquestração | ✅ Granular |
| T17 | 1 extensão do mesmo método/arquivo de T16 | ✅ Granular |
| T18 | 1 método de orquestração em lote | ✅ Granular |
| T19 | 1 cron | ✅ Granular |
| T20 | 1 linha de wiring | ✅ Granular |
| T21 | 1 rota + 1 controller | ✅ Granular (par indissociável, mesmo padrão de `AdminDisparoRoute`) |
| T22 | 1 linha de wiring | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T01 | None | — | ✅ Match |
| T02 | None | — | ✅ Match |
| T03 | None | — | ✅ Match |
| T04 | None | — | ✅ Match |
| T05 | T02, T03, T04 | T02→T05, T03→T05, T04→T05 | ✅ Match |
| T06 | T02 | T02→T06 | ✅ Match |
| T07 | None | — | ✅ Match |
| T08 | None | — | ✅ Match |
| T09 | T08 | T08→T09 | ✅ Match |
| T10 | None | — | ✅ Match |
| T11 | T10 | T10→T11 | ✅ Match |
| T12 | None | — | ✅ Match |
| T13 | T12 | T12→T13 | ✅ Match |
| T14 | None | — | ✅ Match |
| T15 | T01 (phase 1, cross-phase), T11 (phase 3, cross-phase) | — (cross-phase, sem seta exigida) | ✅ Match |
| T16 | T10 (cross-phase), T11 (cross-phase), T12 (mesma fase) | T12→T16 | ✅ Match |
| T17 | T13, T14, T15, T16 (todas mesma fase) | T13→T17, T14→T17, T15→T17, T16→T17 | ✅ Match |
| T18 | T17 (mesma fase) | T17→T18 | ✅ Match |
| T19 | T18 (phase 4, cross-phase) | — (cross-phase) | ✅ Match |
| T20 | T19 (mesma fase) | T19→T20 | ✅ Match |
| T21 | T17 (phase 4, cross-phase) | — (cross-phase) | ✅ Match |
| T22 | T21 (mesma fase) | T21→T22 | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T01 | Spike exploratório | none | none | ✅ OK |
| T02 | Service/domínio (middleware) | unit | unit | ✅ OK |
| T03 | Service/domínio | unit | unit | ✅ OK |
| T04 | Service/domínio | unit | unit | ✅ OK |
| T05 | Rota/controller | integration | integration | ✅ OK |
| T06 | Rota/controller | integration | integration | ✅ OK |
| T07 | Script SQL manual | none | none | ✅ OK |
| T08 | Entity | none | none | ✅ OK |
| T09 | Script SQL manual | none | none | ✅ OK |
| T10 | Service/domínio puro | unit | unit | ✅ OK |
| T11 | Service/domínio puro | unit | unit | ✅ OK |
| T12 | Service/domínio | unit | unit | ✅ OK |
| T13 | Service/domínio | unit | unit | ✅ OK |
| T14 | Service/domínio | unit | unit | ✅ OK |
| T15 | Service/domínio (renderer) | unit | unit | ✅ OK |
| T16 | Service/domínio | unit | unit | ✅ OK |
| T17 | Service/domínio | unit | unit | ✅ OK |
| T18 | Service/domínio | unit | unit | ✅ OK |
| T19 | Cron | unit | unit | ✅ OK |
| T20 | Wiring trivial | none | none | ✅ OK |
| T21 | Rota/controller | integration | integration | ✅ OK |
| T22 | Wiring trivial | none | none | ✅ OK |

---

## Tips

- **Cross-repo**: Fase 2 é `backend-ob-ads`, as demais são `backend-promotor`. Cada commit vai pro repo certo.
- **Playwright é um risco real**: T01 decide se T15 segue como planejado ou muda de abordagem — não pular a validação.
- **Nenhum SQL roda sozinho**: T07 e T09 só criam o arquivo; execução é manual, do usuário.
- **Teste sempre escopado**: todo `Gate` tem o caminho do arquivo explícito, nunca a suíte inteira, sempre `--runInBand`.
