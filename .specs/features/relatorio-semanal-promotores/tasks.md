# Relatório Semanal de Promotores Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/relatorio-semanal-promotores/design.md`
**Status**: Done — 22 tasks concluídas (Phases 1-5), Verifier independente PASS (3ª iteração do ciclo fix→re-verify, `.specs/features/relatorio-semanal-promotores/validation.md`), `validate_state.py` exit 0. + Phase 6 (AD-006/SKF-only, pós-Execute) e Phase 7 (pdf-lib + gráfico por dia, pós-Execute) — ambas feitas depois do Verifier, sem nova rodada formal do Verifier (mudança de implementação com testes próprios, não revalidação de requisito novo em escopo grande). **Phase 8 e Phase 9 (P6 S3, P7 síntese IA — RELPROM-45 a 52): tasks geradas, aguardando aprovação do usuário antes do Execute.**

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
| Spike exploratório (validação do Playwright no SO real da EC2, simulado via `amazonlinux:2023`) | none | Não é código de produção coberto pela matrix — resultado documentado em prosa no próprio design.md. **Pós-Execute (T30)**: `scripts/spike-playwright-ec2.ts` apagado — Playwright substituído por `pdf-lib` (AD-007), spike virou órfão | — (arquivo removido) | — |
| **Pós-Execute (P6/P7)**: Função pura de validação (`promotorReportSinteseValidacao`) | unit | Todos os branches; 1:1 com RELPROM-50; cada seção (`numerosValidosDaSecao`) tem teste próprio | `__tests__/unit/*.test.ts` | `npx jest --runInBand <arquivo-do-teste-da-task>` |
| **Pós-Execute (P6/P7)**: Cliente externo mockado (`S3StorageClient`, `PromotorReportSintese`) | unit | Sucesso, falha isolada (nunca lança), parâmetros corretos passados ao SDK mockado (`jest.mock`) | `__tests__/unit/*.test.ts` | `npx jest --runInBand <arquivo-do-teste-da-task>` |
| **Pós-Execute (P6/P7)**: Migration SQL (`ALTER TABLE` manual) | none | - (revisão humana; execução manual pelo usuário) | `scripts/*.sql` | nenhum — revisão manual |

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

### Phase 6: Ajustes pós-Execute — AD-006 (SQL Server congelado, só SKF em produção)

Adicionada depois do Verifier dar PASS, a pedido do usuário (DBA + só SKF em produção por enquanto). T02-T07 (módulo, Phase 2) ficam intocados, dormentes.

```
T23 -> T24
T24 -> T26
T25 -> T26
T24 -> T27
```

### Phase 7: Ajustes pós-Execute — pdf-lib + gráfico por dia (AD-007 / RELPROM-44)

Adicionada depois do Verifier dar PASS e depois da Phase 6, a pedido do usuário: (1) risco de Playwright em produção virou motivo pra trocar de renderer; (2) feedback visual sobre o layout e o gráfico faltante em relação ao modelo do CON26-325.

```
T28 -> T29
T28 -> T30
```

### Phase 8: Arquivamento do PDF no S3 (RELPROM-45 a 48)

Pedido do usuário pós-Execute. Nenhuma dependência nova instalada — `@aws-sdk/client-s3` já está no `package.json` (nunca integrada). `AWS_REGION`/`AWS_BUCKET_NAME`/`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` já documentadas em `.env.example`.

```
T31 -> T32
T31 -> T34
T33 -> T34
```

### Phase 9: Observações adicionais geradas por IA (RELPROM-49 a 52)

Pedido do usuário pós-Execute. `openai` já está no `package.json` (nunca integrada); `OPENAI_API_KEY` é nova — usuário fornece quando o Execute chegar em T37.

```
T35 -> T36 -> T37 -> T38
T35 -> T39
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
- [x] `calcularVisaoGeral` conta concluídas/canceladas no período e abertas na rota (foto atual) corretamente
- [x] `calcularAssertividade` retorna `"N/A"` quando concluídas+canceladas = 0, senão a porcentagem arredondada
- [x] Gate check passa: `npx jest --runInBand __tests__/unit/promotorReportCalculos.test.ts` (10 passed)
- [x] Teste cobre RELPROM-02 a RELPROM-06, incluindo o caso de divisão por zero
- [x] Removido `promotoresComRegistro` do `VisaoGeralCampanha` do design.md — nenhuma AC pede esse resumo (scope creep identificado durante a implementação)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(promotor-relatorio): calculo de visao geral e assertividade por campanha`

**Status**: ✅ Complete — nota: `ROTA_PROMOTOR` não tem coluna própria de "data de cancelamento"; `UPDATED_AT` usado como proxy (documentado no código), pendente de confirmação quando `.env.readonly` existir nesta máquina

---

### T11: Cálculo de promotores, destaques e próximos passos (backend-promotor)

**What**: Funções puras `agruparPorPromotor`, `listarCancelamentos` (RELPROM-08 — não estava no "What" original mas já estava listada no Requirement, corrigido aqui), `listarDestaquesDeCampo` (com truncamento de OBS em 500 caracteres) e `calcularProximosPassos`, no mesmo arquivo de T10.
**Where**: `utils/promotorReportCalculos.ts` (modifica)
**Depends on**: T10
**Reuses**: nada novo além do próprio arquivo
**Requirement**: RELPROM-07, RELPROM-08, RELPROM-09, RELPROM-10, RELPROM-24, RELPROM-25

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `agruparPorPromotor` inclui promotor com todos os valores zerados (não omite linha)
- [x] `listarCancelamentos` lista todo cancelamento do período, com ou sem OBS (RELPROM-08)
- [x] `listarDestaquesDeCampo` só lista visitas com OBS preenchido, truncando em 500 caracteres + reticências (RELPROM-24); agrupa por status
- [x] `calcularProximosPassos` reaproveita `VisaoGeralCampanha`/`LinhaPromotor[]` já calculados (abertas na rota, canceladas) em vez de duplicar o filtro de período, e conta promotores sem registro no período
- [x] Limite superior do período (23:59:59 America/Sao_Paulo) é inclusivo (RELPROM-25)
- [x] Gate check passa: `npx jest --runInBand __tests__/unit/promotorReportCalculos.test.ts` (23 passed)
- [x] **Fix do Verifier (RELPROM-09, real gap)**: `listarDestaquesDeCampo` fazia só `push` na ordem de entrada — com concluídas/canceladas intercaladas na origem, a saída não vinha agrupada (o teste original só provava com entrada já ordenada). Corrigido pra particionar em 2 listas e concatenar (`[...concluidas, ...canceladas]`); `templates/relatorioPromotor.ts` (T15) também corrigido pra renderizar 2 sub-seções rotuladas em vez de 1 `<ul>` só. Teste novo com entrada intercalada prova o agrupamento de verdade.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(promotor-relatorio): calculo de promotores, destaques e proximos passos`

**Status**: ✅ Complete

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
- [x] `listarClientesHabilitados(nomeModulo, idCliente?)` retorna `{sucesso:true, dados}` ou `{sucesso:false, motivo}` — nunca lança
- [x] Timeout e erro de rede tratados como `{sucesso:false, motivo}` (`AbortSignal.timeout`, 10s)
- [x] Header `x-api-key` lido de `process.env.INTERNAL_API_KEY` a cada chamada (não cacheado em const de módulo, por causa de `dotenv.config()` tardio)
- [x] Gate check passa: `npx jest --runInBand __tests__/unit/obAdsIntegrationClient.test.ts` (5 passed)
- [x] `OBADS_BASE_URL`/`INTERNAL_API_KEY` documentadas em `.env.example`/`exemple.env`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(promotor-relatorio): cliente de integracao com ob-ads (listagem)`

**Status**: ✅ Complete

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
- [x] `enviarEmailComAnexo(req)` retorna `{sucesso:true}` ou `{sucesso:false, motivo}` — nunca lança
- [x] PDF passado como `Buffer`, convertido pra base64 só na borda HTTP (não antes)
- [x] Gate check passa: `npx jest --runInBand __tests__/unit/obAdsIntegrationClient.test.ts` (10 passed)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(promotor-relatorio): cliente de integracao com ob-ads (envio de email)`

**Status**: ✅ Complete

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
- [x] `NODE_ENV !== "production"` (incluindo indefinido) → retorna `DEV_REPORT_RECIPIENTS` + `adminsReaisParaLog: adminsReais`
- [x] `NODE_ENV === "production"` → retorna `adminsReais`, nunca a lista de teste
- [x] `DEV_REPORT_RECIPIENTS` vazia fora de produção → retorna destinatários vazios (tratado como falha de resolução a jusante, RELPROM-30)
- [x] E-mail inválido na lista de teste é filtrado, não derruba os demais
- [x] Gate check passa: `npx jest --runInBand __tests__/unit/promotorReportRecipients.test.ts` (6 passed)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(promotor-relatorio): guarda de destinatarios dev/producao`

**Status**: ✅ Complete

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
- [x] Template HTML gera 1 capa + N blocos (1 por campanha), nessa ordem, com as 6 seções por bloco
- [x] `renderizarPdf(dados)` retorna `Buffer` de PDF válido (prefixo `%PDF-`)
- [x] Teste unitário mocka o módulo `playwright` (não renderiza PDF real) e verifica que o HTML passado pro `page.setContent` contém os dados esperados (nome do cliente, nome de cada campanha, contadores); browser fechado mesmo em caso de falha
- [x] Gate check passa: `npx jest --runInBand __tests__/unit/promotorReportPdfRenderer.test.ts` (5 passed)
- [x] Tipos `RelatorioPromotorData`/`CampanhaBlocoRelatorio` criados em `types/promotorRelatorio.ts` (compartilhados com T16), reaproveitando os tipos de `utils/promotorReportCalculos.ts`
- [x] Identidade visual: cores da marca aplicadas via CSS; fontes customizadas (`assets/fonts/Montserrat-*`) e logo não embutidos nesta rodada — complexidade de `@font-face`/arquivo local no Playwright não se justifica sem AC pedindo fidelidade visual exata, registrado como ideia futura

**Tests**: unit
**Gate**: quick

**Commit**: `feat(promotor-relatorio): renderizacao do pdf via playwright`

**Status**: ✅ Complete — **fix do Verifier (RELPROM-09)**: `renderizarDestaques` virou 2 sub-seções (`<h3>Concluídas com observação</h3>`/`<h3>Canceladas com justificativa</h3>`), cada uma com seu `<ul>`, em vez de 1 lista única — consistente com `listarDestaquesDeCampo` (T11) já vir agrupado. **2ª rodada do Verifier**: mutante sobrevivente (trocar qual filtro alimenta qual `<h3>` não quebrava nenhum teste) — adicionado teste com destaque misto (1 concluída + 1 cancelada) que confirma, por posição no HTML, que cada item cai sob o título certo (`__tests__/unit/promotorReportPdfRenderer.test.ts`).

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
- [x] Cliente com 2+ campanhas ativas → 1 bloco por campanha, sem agregar métricas entre elas
- [x] Cliente com 1 campanha ativa → 1 bloco só (RELPROM-27) — **fix do Verifier**: só havia teste pra N=0 e N=2; evidence-or-zero marcava N=1 como não coberto apesar de funcionar (mesma lógica de `.map()`). Teste dedicado adicionado.
- [x] Cliente com módulo habilitado mas sem campanha ativa → `RelatorioPromotorData` com `campanhas: []`, tratado como "sem dado disponível" (RELPROM-22), não erro
- [x] Cliente sem nenhuma visita no período → contadores zerados, gera normalmente (RELPROM-13)
- [x] Gate check passa: `npx jest --runInBand __tests__/unit/promotorReportService.test.ts` (6 passed)
- [x] Assinatura ajustada durante a implementação: `gerarRelatorioCliente({idCliente, nomeCliente}, periodo, agora?)` — recebe `nomeCliente` já resolvido (vem de T05/T12, backend-promotor não tem lookup próprio de nome de cliente) em vez de buscar de novo
- [x] Critério de "campanha ativa" reaproveitado de `adminDisparoService.ts:178-208`, filtrado por `ID_CLIENT` (não reescrito do zero)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(promotor-relatorio): monta dados do relatorio por cliente`

**Status**: ✅ Complete

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
- [x] Fluxo completo: gera PDF (T15) → resolve destinatários (T14) → envia (T13) → grava `PromotorRelatorioEnvio` com `STATUS`/`DESTINATARIOS`/`AMBIENTE`
- [x] Falha em qualquer etapa (PDF, resolução de destinatário, envio) grava `STATUS='FALHA'` com `MOTIVO_FALHA`, não lança pra cima (isolamento por cliente, RELPROM-17)
- [x] `ORIGEM='CRON'`/`ORIGEM='MANUAL'` gravados conforme quem chamou (chave única do índice parcial de T09 cuida da idempotência — não é checada aqui, é constraint de banco)
- [x] Em dev, `DESTINATARIOS` gravado é a lista de teste, mas o log também mostra os admins reais que seriam usados
- [x] Modo preview (`enviarEmail:false`) retorna o PDF sem enviar nem gravar auditoria (RELPROM-38)
- [x] Gate check passa: `npx jest --runInBand __tests__/unit/promotorReportServiceEnvio.test.ts` (9 passed) — teste em arquivo próprio (`promotorReportServiceEnvio.test.ts`), não no mesmo de T16, pra não misturar mocks de banco com mocks de PDF/e-mail/destinatários

**Tests**: unit
**Gate**: quick

**Commit**: `feat(promotor-relatorio): envia relatorio e registra auditoria/idempotencia`

**Status**: ✅ Complete

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
- [x] Falha ao listar clientes elegíveis (ob-ads indisponível) aborta a execução inteira com 1 log único, não tenta nenhum cliente
- [x] Falha isolada em 1 cliente não impede os demais (RELPROM-17)
- [x] Resumo final: `{elegiveis, enviados, falharam}` logado ao fim (RELPROM-19)
- [x] Nome do módulo (`"promotores"`, minúsculo — RELPROM-20/T07) centralizado em `NOME_MODULO_PROMOTORES`, não repetido em cada chamador
- [x] Gate check passa: `npx jest --runInBand __tests__/unit/promotorReportServiceLote.test.ts` (4 passed) — arquivo próprio, mesmo motivo de T17

**Tests**: unit
**Gate**: quick

**Commit**: `feat(promotor-relatorio): processa todos os clientes elegiveis em lote`

**Status**: ✅ Complete

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
- [x] `NODE_ENV==="test"` nunca registra (sem log)
- [x] `PROMOTOR_RELATORIO_ENABLED` diferente de exatamente `"1"` (incluindo `"true"`) não registra
- [x] Período calculado via `calcularPeriodoSemanal` (T10/T11, movida pra `utils/promotorReportCalculos.ts`): 7 dias corridos anteriores, corte 23:59:59.999 America/Sao_Paulo do dia anterior ao disparo
- [x] Lock impede 2 execuções simultâneas se o tick anterior ainda não terminou
- [x] Gate check passa: `npx jest --runInBand __tests__/unit/promotorRelatorioCron.test.ts` (7 passed)
- [x] `PROMOTOR_RELATORIO_ENABLED`/`PROMOTOR_RELATORIO_CRON_EXPRESSION` documentadas em `.env.example`/`exemple.env`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(promotor-relatorio): cron semanal de disparo`

**Status**: ✅ Complete

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
- [x] Chamada adicionada logo após o registro do outbox cron, mesma ordem de dependência (depois do data source pronto)
- [x] Gate check passa: `npx tsc --noEmit`

**Tests**: none
**Gate**: build

**Commit**: `chore(promotor-relatorio): registra cron na subida do processo`

**Status**: ✅ Complete

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
- [x] Sem token/token inválido → 401; token válido sem `IS_ADMIN` → 403 (mesmo comportamento de `adminAuthMiddleware`)
- [x] Sucesso → `Content-Type: application/pdf`, corpo é o PDF (prefixo `%PDF-`)
- [x] `enviarEmail=false` → gera e retorna PDF, não chama `enviarEmailComAnexo` nem grava auditoria
- [x] Cliente inexistente/sem módulo → 404. **SPEC_DEVIATION (RELPROM-39, documentada no código)**: "sem campanha ativa" deixou de ser 404 aqui — unificado com RELPROM-13/22 (gera com zeros), pra não ter 2 comportamentos diferentes pra mesma condição entre cron e endpoint manual; `spec.md` atualizado
- [x] Sem `inicio`/`fim` → usa a mesma janela de 7 dias do cron (RELPROM-33); com `inicio`/`fim` → usa o período informado, 400 se inválido (RELPROM-34)
- [x] PDF vazio (falha de geração) → 500; falha só no envio de e-mail (admin resolvido ok, SES fora do ar) → ainda 200 com o PDF (RELPROM-36 — PDF retorna independente do e-mail)
- [x] Gate check passa: `npx jest --runInBand __tests__/integration/promotorRelatorio.test.ts` (12 passed)

**Tests**: integration
**Gate**: full

**Commit**: `feat(promotor-relatorio): endpoint administrativo de disparo manual`

**Status**: ✅ Complete

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
- [x] Rota nova montada igual às demais `/admin/*`
- [x] Gate check passa: `npx tsc --noEmit`

**Tests**: none
**Gate**: build

**Commit**: `chore(promotor-relatorio): registra rota administrativa de disparo manual`

**Status**: ✅ Complete

---

### Phase 6: Ajustes pós-Execute — AD-006 (tasks)

Adicionada depois do Verifier dar PASS (3ª iteração). 2 pedidos do usuário: (1) DBA — SQL Server entra em congelamento pré-migração pra Postgres, nada novo pode ser acrescentado lá; (2) produto — só a SKF recebe o relatório em produção por enquanto, único cliente de fato usando. T02-T07 (módulo "promotores" no SQL Server, Phase 2) ficam **intocados, dormentes** — não apagados, não executados.

### T23: `GET /internal/clientes/:idCliente/admins` (ob-ads)

**What**: Endpoint interno novo que resolve admins de **1 cliente explícito por `ID_CLIENTE`**, sem passar por `module`/`cliente_module` — não lê nem escreve nenhuma tabela nova no SQL Server, só `TB_CLIENTE` (já existe) + reaproveita `AdminResolverService` (T04) sem alteração.
**Where**: `backend-ob-ads/src/presentation/controllers/InternalClientesController.ts`, `backend-ob-ads/src/main/config/routes/InternalClientesRoutes.ts`, `backend-ob-ads/src/main/api.ts` (modifica, monta a rota)
**Depends on**: None (reaproveita T02 e T04 já existentes)
**Reuses**: `internalApiKeyGuard` (T02), `AdminResolverService.resolverAdminsPorCliente` (T04) — nenhum dos dois muda
**Requirement**: RELPROM-42

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `GET /internal/clientes/126/admins` retorna `{idCliente, nomeCliente, admins}`, 401 sem `x-api-key`, 404 se o `ID_CLIENTE` não existir em `TB_CLIENTE`, 400 se não for inteiro positivo
- [x] Nenhuma tabela nova, nenhuma coluna nova, nenhum INSERT — só `SELECT` em `TB_CLIENTE` (já existente) + a query de admin já existente de T04
- [x] Gate check passa: `npx jest --runInBand src/tests/internalClientesRoutes.test.ts` (5 passed)

**Tests**: integration
**Gate**: full

**Commit**: `feat(internal): expoe admins de 1 cliente sem modulo (AD-006)`

**Status**: ✅ Complete

---

### T24: `ObAdsIntegrationClient.resolverAdminsDoCliente` (backend-promotor)

**What**: Método novo no cliente HTTP já existente (T12/T13), chamando `GET /internal/clientes/:idCliente/admins` (T23). Mesmo padrão de erro-como-união, nunca lança.
**Where**: `service/obAdsIntegrationClient.ts` (modifica)
**Depends on**: T23 (funcionalmente — o método compila e testa isolado antes, mas só funciona fim-a-fim depois do endpoint existir em produção)
**Reuses**: estrutura HTTP já criada em T12/T13 (`headersInternos`, `baseUrl`, `AbortSignal.timeout`)
**Requirement**: RELPROM-42

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `resolverAdminsDoCliente(idCliente)` retorna `{sucesso:true, dados}` ou `{sucesso:false, motivo}` — nunca lança
- [x] URL montada com `idCliente` no path (`/internal/clientes/:idCliente/admins`), sem nome de módulo
- [x] Gate check passa: `npx jest --runInBand __tests__/unit/obAdsIntegrationClient.test.ts` (14 passed, 4 novos)
- [x] **Ajustado em T27**: `ResultadoResolucaoCliente` ganhou `status?: number` na falha, pra o chamador (endpoint manual) distinguir "cliente não existe" (404) de falha de infra (timeout/502), sem fazer o controller inspecionar a string de `motivo`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(promotor-relatorio): resolve admins de 1 cliente sem modulo`

**Status**: ✅ Complete

---

### T25: Allowlist fixa de clientes em produção (backend-promotor)

**What**: Constante `CLIENTES_PRODUCAO_HABILITADOS: number[]` hardcoded em código — mesmo espírito de `DEV_REPORT_RECIPIENTS` (T14) — com o `ID_CLIENTE` da SKF (126), documentada como temporária até a migração SQL Server→Postgres acabar e o módulo poder ser habilitado de verdade.
**Where**: `config/promotorReportClientesProducao.ts` (novo)
**Depends on**: None
**Reuses**: nenhum
**Requirement**: RELPROM-40, RELPROM-41, RELPROM-43

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `CLIENTES_PRODUCAO_HABILITADOS = [126]` (SKF, confirmado pelo usuário)
- [x] Comentário documenta o porquê (AD-006) e como reverter quando a migração acabar
- [x] Gate check passa: `npx tsc --noEmit`

**Tests**: none
**Gate**: build

**Commit**: `feat(promotor-relatorio): allowlist fixa de clientes em producao`

**Status**: ✅ Complete

---

### T26: Religa `processarClientesElegiveis` pra allowlist fixa (backend-promotor)

**What**: Troca a origem dos clientes elegíveis do cron de "listar por módulo no SQL Server" (`listarClientesHabilitados`, T03/T05, agora dormente) pra "iterar `CLIENTES_PRODUCAO_HABILITADOS` (T25) chamando `resolverAdminsDoCliente` (T24) por cliente". Sem isso, com T07 nunca executado, o módulo nunca existe e ninguém recebe nada — nem a SKF.
**Where**: `service/promotorReportService.ts` (modifica `processarClientesElegiveis`)
**Depends on**: T24, T25
**Reuses**: `processarRelatorioCliente` (T17, sem alteração nenhuma) — só muda de onde vem a lista de clientes
**Requirement**: RELPROM-40, RELPROM-41, RELPROM-42, RELPROM-17 (reafirmado), RELPROM-19 (reafirmado)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Itera `CLIENTES_PRODUCAO_HABILITADOS`, não mais `listarClientesHabilitados` — `NOME_MODULO_PROMOTORES`/`listarClientesHabilitados` continuam no arquivo, intocados, dormentes, prontos pra religar quando a migração acabar
- [x] Falha ao resolver admins de 1 cliente isola só aquele cliente (cada cliente agora é 1 chamada independente, não existe mais "1 falha de listagem derruba todo mundo")
- [x] Resumo `{elegiveis, enviados, falharam}` continua certo (RELPROM-19)
- [x] Gate check passa: `npx jest --runInBand __tests__/unit/promotorReportServiceLote.test.ts` (4 passed, reescrito) + `__tests__/unit/promotorReportService.test.ts` + `__tests__/unit/promotorReportServiceEnvio.test.ts` (15 passed, sem regressão)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(promotor-relatorio): usa allowlist fixa em vez de modulo (AD-006)`

**Status**: ✅ Complete

---

### T27: Endpoint manual resolve cliente direto, sem checar módulo (backend-promotor)

**What**: `PromotorReportController.gerar` (T21) hoje chama `listarClientesHabilitados(NOME_MODULO_PROMOTORES, idCliente)` — com o módulo nunca criado no SQL Server (AD-006), isso sempre devolveria 404 pra qualquer cliente, inclusive a SKF, quebrando o próprio propósito de teste do endpoint. Troca pra `resolverAdminsDoCliente(idCliente)` (T24) direto.
**Where**: `controllers/promotorReportController.ts` (modifica)
**Depends on**: T24
**Reuses**: nada novo
**Requirement**: RELPROM-32, RELPROM-39 (reafirmado — 404 agora é "cliente não existe em `TB_CLIENTE`", não mais "sem módulo habilitado")

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `gerar` chama `ObAdsIntegrationClient.resolverAdminsDoCliente(idCliente)` em vez de `listarClientesHabilitados`
- [x] 404 quando `resolucao.status === 404` (cliente não existe em `TB_CLIENTE`); 502 pra qualquer outra falha (timeout/infra) — adicionado campo `status?: number` em `ResultadoResolucaoCliente` (T24) pra distinguir os dois casos, já que nem toda falha de resolução é "não encontrado"
- [x] Demais comportamentos do endpoint (200+PDF, 400 período inválido, enviarEmail=false, 500 PDF vazio) continuam idênticos
- [x] Gate check passa: `npx jest --runInBand __tests__/integration/promotorRelatorio.test.ts` (12 passed) + `npx jest --runInBand __tests__/unit/obAdsIntegrationClient.test.ts` (14 passed, sem regressão)

**Tests**: integration
**Gate**: full

**Commit**: `feat(promotor-relatorio): endpoint manual resolve cliente sem modulo`

**Status**: ✅ Complete

---

### Phase 7: Ajustes pós-Execute — pdf-lib + gráfico por dia (tasks)

### T28: Migra `PromotorReportPdfRenderer`/template de Playwright pra `pdf-lib` (backend-promotor)

**What**: Troca a renderização HTML→PDF via Playwright (`chromium.launch()`) por desenho direto com `pdf-lib` (texto/retângulo/linha), eliminando a dependência de navegador/SO em produção (AD-007). `service/promotorReportPdfRenderer.ts` vira um wrapper fino (`renderizarPdf` chama `construirPdf` e converte pra `Buffer`); toda a lógica de layout migra pra `templates/relatorioPromotor.ts` (gera o PDF, não mais uma string HTML). Página muda de A4 retrato pra slide widescreen (960x540pt), paleta navy/verde-limão/menta, pra reproduzir organização e proporção do modelo do CON26-325 (feedback do usuário).
**Where**: `service/promotorReportPdfRenderer.ts`, `templates/relatorioPromotor.ts` (reescritos)
**Depends on**: None (reaproveita o contrato já existente de T15 — `renderizarPdf(dados): Promise<Buffer>` não muda, `PromotorReportService` não precisou ser tocado)
**Reuses**: `types/promotorRelatorio.ts` (`RelatorioPromotorData`/`CampanhaBlocoRelatorio`, sem mudança de forma além de T29); nada de `assets/fonts`/`assets/img` (fonte padrão do `pdf-lib`, `@pdf-lib/fontkit` não instalado)
**Requirement**: RELPROM-01, RELPROM-26, RELPROM-27, AD-007

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `renderizarPdf(dados)` continua retornando `Buffer` de PDF válido (prefixo `%PDF-`), mesma assinatura
- [x] Página no formato 960x540pt (slide widescreen), não mais A4
- [x] 1 capa + 6 páginas de seção por campanha, mesma ordem de T15 (capa → visão geral → assertividade → por promotor → cancelamentos → destaques → próximos passos)
- [x] Teste reescrito pra espiar a API real do `pdf-lib` (`jest.spyOn(PDFPage.prototype, "drawText")`, sem `jest.mock` no módulo) — prova texto e ordem de desenho reais, em vez de mockar o renderer inteiro
- [x] Gate check passa: `npx jest --runInBand __tests__/unit/promotorReportPdfRenderer.test.ts` (7 passed)

**Tests**: unit
**Gate**: quick

**Commit**: `refactor(promotor-relatorio): troca Playwright por pdf-lib na geração do PDF` (`52ce6ca`)

**Status**: ✅ Complete

---

### T29: Gráfico "visitas por dia" na visão geral (backend-promotor)

**What**: Nova função pura `agruparVisitasPorDia` (bucket por dia, America/Sao_Paulo, só dias com pelo menos 1 visita concluída/cancelada) e uma nova função de desenho (`desenharGraficoPorDia`) que renderiza barras pareadas (concluídas navy / canceladas vermelho) com rótulo de valor e dia, chamada a partir da seção de visão geral — reproduz o gráfico do modelo do CON26-325 que faltava na 1ª versão do PDF gerado em pdf-lib (T28).
**Where**: `utils/promotorReportCalculos.ts` (modifica — nova função + `PontoVisitasPorDia`), `types/promotorRelatorio.ts` (modifica — `visitasPorDia` em `CampanhaBlocoRelatorio`), `service/promotorReportService.ts` (modifica — wiring em `montarBlocoCampanha`), `templates/relatorioPromotor.ts` (modifica — `desenharGraficoPorDia`, chamada em `desenharVisaoGeral`)
**Depends on**: T28 (gráfico desenha direto com `pdf-lib`, no renderer novo)
**Reuses**: `formatInTimeZone`/`FUSO_RELATORIO` já usados em `calcularPeriodoSemanal`; `quebrarLinhas`/`garantirEspaco` já existentes em `templates/relatorioPromotor.ts`
**Requirement**: RELPROM-44

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `agruparVisitasPorDia` agrupa e ordena cronologicamente, exclui dia sem nenhuma atividade (sem barra zerada), ignora status fora de concluída/cancelada e visita fora do período
- [x] Gráfico desenha 2 barras por dia (concluídas/canceladas) com valor e dia legíveis; cor vermelha pras canceladas (menta tinha contraste baixo demais contra fundo branco — trocado após feedback visual do usuário)
- [x] Espaçamento entre as 2 sub-seções de destaques do campo ("Concluídas com observação"/"Canceladas com justificativa") aumentado — estavam coladas (feedback do usuário)
- [x] Gate check passa: `npx jest --runInBand __tests__/unit/promotorReportCalculos.test.ts __tests__/unit/promotorReportPdfRenderer.test.ts` (35 passed)
- [x] `npx tsc --noEmit` sem erro novo (2 erros pré-existentes, não relacionados, em `__tests__/unit/segmentacaoCampanhaPromotor.test.ts`)

**Tests**: unit
**Gate**: quick

**Commit**: `refactor(promotor-relatorio): troca Playwright por pdf-lib na geração do PDF` (`52ce6ca`, mesmo commit de T28 — par indissociável: renderer novo sem o dado do gráfico já wireado não tinha como ser validado visualmente)

**Status**: ✅ Complete

---

### T30: Remove dependência `playwright` não usada (backend-promotor)

**What**: Com T28 completo, `playwright` não é mais importado em nenhum lugar do código. Remove a dependência (`npm uninstall playwright`) e o script spike órfão (`scripts/spike-playwright-ec2.ts`, T01).
**Where**: `package.json`, `package-lock.json` (modifica), `scripts/spike-playwright-ec2.ts` (apagado)
**Depends on**: T28
**Reuses**: nenhum
**Requirement**: AD-007

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `grep -rn "playwright"` no código de aplicação (fora de `node_modules`/skills de terceiros) não retorna nenhum import — só menções em prosa (comentário/design doc)
- [x] `npm uninstall playwright` rodado, `package.json`/`package-lock.json` atualizados
- [x] Gate check passa: `npx jest --runInBand __tests__/unit/promotorReportPdfRenderer.test.ts __tests__/unit/promotorReportCalculos.test.ts` (35 passed, sem regressão) + `npx tsc --noEmit` (sem erro novo)

**Tests**: none
**Gate**: build

**Commit**: `chore(promotor-relatorio): remove dependência playwright não usada` (`aa184a7`)

**Status**: ✅ Complete

---

### Phase 8: Arquivamento do PDF no S3 (tasks)

### T31: Coluna `LINK_PDF` na entity `PromotorRelatorioEnvio` (backend-promotor)

**What**: Adiciona a coluna opcional `LINK_PDF` (texto, nulável) na entity, pra guardar a URL pública do PDF arquivado no S3.
**Where**: `entities/PromotorRelatorioEnvio.ts` (modifica)
**Depends on**: None
**Reuses**: convenção `type: "text"` + nulável já usada nas demais colunas opcionais da entity (`MOTIVO_FALHA`)
**Requirement**: RELPROM-45

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `LINK_PDF?: string | null` adicionado, `type: "text"`, `nullable: true`
- [x] Gate check passa: `npx tsc --noEmit` (zero erros novos)

**Tests**: none
**Gate**: build

**Commit**: `feat(promotor-relatorio): adiciona coluna link_pdf na entity de envio`

**Status**: ✅ Complete

---

### T32: Migration manual `ALTER TABLE ... ADD COLUMN LINK_PDF` (backend-promotor)

**What**: Script idempotente (`ADD COLUMN IF NOT EXISTS`) adicionando `LINK_PDF` na tabela já existente `CAMPANHAS_OB.PROMOTOR_RELATORIO_ENVIO`. **Não executado pelo agente.**
**Where**: `scripts/migration-promotor-relatorio-envio-link-pdf.sql` (novo)
**Depends on**: T31
**Reuses**: padrão de `scripts/migration-promotor-relatorio-envio.sql` (idempotência, bloco `ROLLBACK:` no cabeçalho, `COMMENT ON COLUMN`)
**Requirement**: RELPROM-45

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `ALTER TABLE "CAMPANHAS_OB"."PROMOTOR_RELATORIO_ENVIO" ADD COLUMN IF NOT EXISTS "LINK_PDF" TEXT`
- [x] Cabeçalho com bloco `ROLLBACK:` (`ALTER TABLE ... DROP COLUMN "LINK_PDF"`)
- [x] `COMMENT ON COLUMN` documentando o propósito (URL pública do PDF no S3, nulo quando preview ou falha de upload)
- [x] Nenhuma execução automática — a task só criou o arquivo

**Tests**: none
**Gate**: nenhum — revisão manual, execução manual pelo usuário

**Commit**: `chore(promotor-relatorio): script de migration da coluna link_pdf`

**Status**: ✅ Complete

---

### T33: `S3StorageClient.uploadPdf` (backend-promotor)

**What**: Cliente fino sobre `@aws-sdk/client-s3`, sobe o PDF gerado pro bucket (`AWS_BUCKET_NAME`), chave `promotor-relatorio/{idCliente}/{periodoInicio}_{periodoFim}-{uuid}.pdf` (sufixo `crypto.randomUUID()` pra não ficar adivinhável), ACL `public-read`. Mesmo padrão de erro-como-união dos demais clients externos — nunca lança.
**Where**: `service/s3StorageClient.ts` (novo)
**Depends on**: None
**Reuses**: padrão de erro-como-união de `ObAdsIntegrationClient`
**Requirement**: RELPROM-45, RELPROM-46, RELPROM-47

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `uploadPdf({idCliente, periodo, pdf}): Promise<{sucesso:true; url:string} | {sucesso:false; motivo:string}>` — nunca lança
- [x] Chave montada com `idCliente`, período (`yyyy-MM-dd` dos 2 extremos) e um `crypto.randomUUID()`
- [x] `PutObjectCommand` chamado com `Bucket`, `Key`, `Body: pdf`, `ContentType: "application/pdf"`, `ACL: "public-read"`
- [x] Falha do SDK (`client.send` rejeita) é capturada e vira `{sucesso:false, motivo}`, nunca propaga
- [x] Teste mocka `@aws-sdk/client-s3` (`jest.mock`) — nunca sobe pro S3 de verdade
- [x] Gate check passa: `npx jest --runInBand __tests__/unit/s3StorageClient.test.ts` (4 passed)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(promotor-relatorio): sobe pdf gerado pro s3`

**Status**: ✅ Complete

---

### T34: Wiring do upload S3 + `LINK_PDF` na auditoria (backend-promotor)

**What**: `registrarAuditoria` ganha parâmetro opcional `linkPdf`. `processarRelatorioCliente`, só quando `enviarEmail=true` e depois do PDF já estar renderizado, chama `S3StorageClient.uploadPdf`; sucesso ou falha, segue o fluxo normalmente (RELPROM-46) e grava o que conseguiu na auditoria.
**Where**: `service/promotorReportService.ts` (modifica)
**Depends on**: T31, T33
**Reuses**: `registrarAuditoria` e o fluxo de `processarRelatorioCliente` já existentes, sem reescrever a lógica de envio de e-mail
**Requirement**: RELPROM-45, RELPROM-46, RELPROM-48

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Upload bem-sucedido → `LINK_PDF` gravado com a URL retornada
- [x] Upload falha → `LINK_PDF` gravado como `null`, erro logado, e-mail/fluxo seguem normalmente (RELPROM-46)
- [x] `enviarEmail=false` (modo preview) → `uploadPdf` não é chamado, nenhum `LINK_PDF` gravado (RELPROM-48, mesmo tratamento de RELPROM-38)
- [x] Gate check passa: `npx jest --runInBand __tests__/unit/promotorReportServiceEnvio.test.ts` (13 passed, sem regressão + 3 novos casos de sucesso/falha/preview do S3)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(promotor-relatorio): arquiva pdf no s3 e grava o link na auditoria`

**Status**: ✅ Complete

---

### Phase 9: Observações adicionais geradas por IA (tasks)

### T35: Tipos `SecaoRelatorio`/`SintesesPorSecao` (backend-promotor)

**What**: Novo tipo `SecaoRelatorio` (união das 6 seções) e `SintesesPorSecao` (`Partial<Record<SecaoRelatorio, string>>`); `CampanhaBlocoRelatorio` ganha o campo opcional `sintesesPorSecao`.
**Where**: `types/promotorRelatorio.ts` (modifica)
**Depends on**: None
**Reuses**: nada — tipos novos desta adição
**Requirement**: RELPROM-49

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `SecaoRelatorio` e `SintesesPorSecao` exportados
- [ ] `CampanhaBlocoRelatorio.sintesesPorSecao?: SintesesPorSecao`
- [ ] Gate check passa: `npx tsc --noEmit` (zero erros novos)

**Tests**: none
**Gate**: build

**Commit**: `feat(promotor-relatorio): adiciona tipos de sintese por secao`

**Status**: ⬜ Pending

---

### T36: `promotorReportSinteseValidacao` — guardrail anti-alucinação (backend-promotor)

**What**: Funções puras: `extrairNumeros` (todo número numa string, incluindo percentuais), `validarSintese` (uma frase só é válida se todo número nela aparecer no conjunto de números válidos), `numerosValidosDaSecao` (monta esse conjunto a partir dos dados já calculados de cada uma das 6 seções, conforme o design.md).
**Where**: `utils/promotorReportSinteseValidacao.ts` (novo)
**Depends on**: T35
**Reuses**: convenção do repo de isolar lógica pura em `utils/*.ts` (mesmo padrão de `utils/promotorReportCalculos.ts`)
**Requirement**: RELPROM-50

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `extrairNumeros` pega inteiros, decimais e percentuais (ex.: "77%" vira `77`)
- [ ] `validarSintese` retorna `true` pra frase sem nenhum número (nada a contradizer) e pra frase só com números presentes em `numerosValidos`; `false` se achar 1 número fora do conjunto
- [ ] `numerosValidosDaSecao` tem 1 teste por seção: visão geral (`concluidas`, `canceladas`, `abertasNaRota`), assertividade (os 2 anteriores + a soma + o percentual), por promotor (os 4 contadores de cada linha + os totais), cancelamentos (`cancelamentos.length`), destaques (contagem de concluídas/canceladas com OBS), próximos passos (os 3 contadores)
- [ ] Gate check passa: `npx jest --runInBand __tests__/unit/promotorReportSinteseValidacao.test.ts`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(promotor-relatorio): valida sintese de ia contra os dados calculados`

**Status**: ⬜ Pending

---

### T37: `PromotorReportSintese.gerarSinteses` (backend-promotor)

**What**: Monta 1 prompt com os dados já calculados das 6 seções de um bloco de campanha, chama a OpenAI 1 única vez (`response_format: json_object`) pedindo as 6 frases, aplica `validarSintese` (T36) em cada uma e só inclui no retorno as que passarem. Nunca lança — falha total da chamada (erro, timeout, JSON inválido) retorna `{}`.
**Where**: `service/promotorReportSintese.ts` (novo)
**Depends on**: T36
**Reuses**: `numerosValidosDaSecao`/`validarSintese` (T36); padrão de erro-como-união já usado nos demais clients externos
**Requirement**: RELPROM-49, RELPROM-50, RELPROM-51

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `gerarSinteses(bloco: CampanhaBlocoRelatorio): Promise<SintesesPorSecao>` — nunca lança
- [ ] 1 só chamada à OpenAI por bloco (não 6), pedindo JSON com as 6 chaves de `SecaoRelatorio`
- [ ] Prompt passa só os dados já calculados daquela seção, nunca pede pra IA calcular nada
- [ ] Frase que falha em `validarSintese` é descartada individualmente — as demais seções da mesma resposta continuam
- [ ] Chamada falha (mock rejeita, JSON inválido, resposta vazia) → retorna `{}`, loga o erro
- [ ] Teste mocka o módulo `openai` inteiro (`jest.mock("openai")) — nunca chama a API de verdade
- [ ] Gate check passa: `npx jest --runInBand __tests__/unit/promotorReportSintese.test.ts`
- [ ] `OPENAI_API_KEY` documentada em `.env.example`/`exemple.env` (nova — usuário fornece o valor real)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(promotor-relatorio): gera sintese por secao via openai`

**Status**: ⬜ Pending

---

### T38: Wiring de `gerarSinteses` em `processarRelatorioCliente` (backend-promotor)

**What**: Depois de `gerarRelatorioCliente` e antes de `renderizarPdf`, chama `PromotorReportSintese.gerarSinteses` pra cada bloco de campanha e anexa o resultado em `bloco.sintesesPorSecao`.
**Where**: `service/promotorReportService.ts` (modifica)
**Depends on**: T37
**Reuses**: fluxo já existente de `processarRelatorioCliente`, sem alterar a ordem de geração/envio
**Requirement**: RELPROM-49, RELPROM-51

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Todo bloco de campanha do cliente passa por `gerarSinteses` antes do PDF ser renderizado
- [ ] `sintesesPorSecao` (mesmo vazio/parcial) nunca impede a renderização do PDF nem o envio do e-mail
- [ ] Gate check passa: `npx jest --runInBand __tests__/unit/promotorReportService.test.ts` (sem regressão + novo caso confirmando o wiring)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(promotor-relatorio): anexa sintese por secao antes de renderizar o pdf`

**Status**: ⬜ Pending

---

### T39: Desenha a síntese no PDF (backend-promotor)

**What**: Nova função `desenharSintese(cursor, texto)`, reaproveitando o visual já existente de `desenharCallout`. Cada uma das 6 funções de seção (`desenharVisaoGeral`, `desenharAssertividade`, `desenharPorPromotor`, `desenharCancelamentos`, `desenharDestaques`, `desenharProximosPassos`) chama `desenharSintese` logo após `desenharLinhaDestaque`, só quando `bloco.sintesesPorSecao` tiver a chave daquela seção.
**Where**: `templates/relatorioPromotor.ts` (modifica)
**Depends on**: T35
**Reuses**: `desenharCallout` (visual), `garantirEspaco`/`quebrarLinhas` já existentes
**Requirement**: RELPROM-52

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Bloco com `sintesesPorSecao` populado → a frase de cada seção aparece desenhada logo após a linha de destaque, antes do conteúdo determinístico
- [ ] Bloco sem `sintesesPorSecao` (ou seção ausente da chave) → nenhum desenho extra, sem espaço em branco sobrando, PDF não quebra
- [ ] Teste usa o mesmo padrão de `jest.spyOn(PDFPage.prototype, "drawText")` já estabelecido no renderer, confirmando a frase desenhada na posição certa (entre a linha de destaque e o conteúdo da seção)
- [ ] Gate check passa: `npx jest --runInBand __tests__/unit/promotorReportPdfRenderer.test.ts` (sem regressão + novos casos com/sem síntese)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(promotor-relatorio): desenha sintese por secao no pdf`

**Status**: ⬜ Pending

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 (pós-Execute, AD-006) → Phase 7 (pós-Execute, AD-007)

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
Phase 6:  T23 ------→ T24 ------→ T26
          T25 ------→ T26
          T24 ------→ T27
Phase 7:  T28 ------→ T29
          T28 ------→ T30
Phase 8:  T31 ------→ T32
          T31 ------→ T34
          T33 ------→ T34
Phase 9:  T35 ------→ T36 ------→ T37 ------→ T38
          T35 ------→ T39
```

Dependências cross-phase (não aparecem no diagrama por fase, só no `Depends on` de cada task, conforme a regra do skill): T15 depende de T01 (Phase 1) e T11 (Phase 3); T16 depende de T10 e T11 (Phase 3); T19 depende de T18 (Phase 4); T21 depende de T17 (Phase 4); T23/T25 não têm dependência cross-phase (reaproveitam T02/T04 já concluídas, sem precisar reabrir); T28 não depende de nenhuma task de fase anterior (reescreve T15 por completo, contrato de `renderizarPdf` preservado); T33 e T35 também não têm dependência cross-phase (cliente externo e tipos novos, sem tocar em código das fases anteriores).

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
| T23 | 1 rota + 1 controller (ob-ads) | ✅ Granular |
| T24 | 1 método, mesmo arquivo de T12/T13 | ✅ Granular |
| T25 | 1 constante | ✅ Granular |
| T26 | 1 troca de origem de dados, mesmo método de T18 | ✅ Granular |
| T27 | 1 troca de chamada, mesmo controller de T21 | ✅ Granular |
| T28 | 1 renderer + 1 template (reescrita completa) | ✅ Granular (par indissociável, mesmo motivo de T15) |
| T29 | 1 função pura + 1 função de desenho + wiring de 1 campo novo | ✅ Granular (coeso: dado e desenho do mesmo gráfico) |
| T30 | 1 remoção de dependência + 1 arquivo apagado | ✅ Granular |
| T31 | 1 coluna de entity | ✅ Granular |
| T32 | 1 script SQL | ✅ Granular |
| T33 | 1 cliente externo | ✅ Granular |
| T34 | 1 wiring, mesmo método/arquivo de T17/T26 | ✅ Granular |
| T35 | 2 tipos + 1 campo, mesmo arquivo | ✅ Granular |
| T36 | 3 funções puras correlatas (mesmo padrão de T10/T11), 1 arquivo | ✅ Granular |
| T37 | 1 cliente externo | ✅ Granular |
| T38 | 1 wiring, mesmo método/arquivo de T16 | ✅ Granular |
| T39 | 1 função de desenho + 6 pontos de chamada do mesmo padrão | ✅ Granular (coeso: mesma função chamada nas 6 seções, igual ao padrão de `desenharLinhaDestaque`) |

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
| T23 | None (reaproveita T02/T04, fases anteriores, sem precisar reabri-las) | — | ✅ Match |
| T24 | T23 (phase 6, mesma fase) | T23→T24 | ✅ Match |
| T25 | None | — | ✅ Match |
| T26 | T24, T25 (mesma fase) | T24→T26, T25→T26 | ✅ Match |
| T27 | T24 (mesma fase) | T24→T27 | ✅ Match |
| T28 | None | — | ✅ Match |
| T29 | T28 (mesma fase) | T28→T29 | ✅ Match |
| T30 | T28 (mesma fase) | T28→T30 | ✅ Match |
| T31 | None | — | ✅ Match |
| T32 | T31 (mesma fase) | T31→T32 | ✅ Match |
| T33 | None | — | ✅ Match |
| T34 | T31, T33 (mesma fase) | T31→T34, T33→T34 | ✅ Match |
| T35 | None | — | ✅ Match |
| T36 | T35 (mesma fase) | T35→T36 | ✅ Match |
| T37 | T36 (mesma fase) | T36→T37 | ✅ Match |
| T38 | T37 (mesma fase) | T37→T38 | ✅ Match |
| T39 | T35 (mesma fase) | T35→T39 | ✅ Match |

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
| T23 | Rota/controller (ob-ads) | integration | integration | ✅ OK |
| T24 | Service/domínio | unit | unit | ✅ OK |
| T25 | Wiring trivial (constante) | none | none | ✅ OK |
| T26 | Service/domínio | unit | unit | ✅ OK |
| T27 | Rota/controller | integration | integration | ✅ OK |
| T28 | Service/domínio (renderer) | unit | unit | ✅ OK |
| T29 | Service/domínio puro + renderer | unit | unit | ✅ OK |
| T30 | Wiring trivial (dependência) | none | none | ✅ OK |
| T31 | Entity | none | none | ✅ OK |
| T32 | Script SQL manual | none | none | ✅ OK |
| T33 | Cliente externo mockado | unit | unit | ✅ OK |
| T34 | Service/domínio | unit | unit | ✅ OK |
| T35 | Tipos | none | none | ✅ OK |
| T36 | Função pura | unit | unit | ✅ OK |
| T37 | Cliente externo mockado | unit | unit | ✅ OK |
| T38 | Service/domínio | unit | unit | ✅ OK |
| T39 | Service/domínio (renderer) | unit | unit | ✅ OK |

---

## Tips

- **Cross-repo**: Fase 2 e T23 são `backend-ob-ads`, as demais são `backend-promotor`. Cada commit vai pro repo certo.
- **Nenhum SQL roda sozinho**: T07 e T09 só criam o arquivo; execução é manual, do usuário.
- **Teste sempre escopado**: todo `Gate` tem o caminho do arquivo explícito, nunca a suíte inteira, sempre `--runInBand`.
- **SQL Server congelado (AD-006)**: nenhuma task cria tabela/coluna/linha de catálogo lá enquanto a migração pra Postgres não terminar — T23-T27 usam allowlist fixa em código em vez disso.
- **PDF é `pdf-lib`, não navegador (AD-007)**: T01/`scripts/spike-playwright-ec2.ts` documentam uma abordagem (Playwright) descontinuada em T28/T30 — histórico mantido em `design.md`/`STATE.md`, não repetir Playwright em feature futura sem reavaliar o risco de SO/EC2.
