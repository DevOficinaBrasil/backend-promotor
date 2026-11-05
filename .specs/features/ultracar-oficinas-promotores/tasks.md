# Base de Oficinas da Ultracar nos Promotores Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

**Restrições deste projeto para o Execute (confirmadas pelo usuário, valem para toda esta feature):**
- Rodar só os testes desta funcionalidade (comandos abaixo) — nunca `npm test`/`npm run test:unit` (suite inteira).
- Rodar os testes em **um único comando/`jest`** (todas as suítes da feature juntas, `--runInBand`) — nunca um `jest` separado por task, por causa de limite de memória.
- Nenhuma DDL é executada automaticamente — esta feature não precisa de nenhuma (nenhuma tabela nova, ver design.md).
- Se precisar de sub-agente em algum passo, **nunca** usar o modelo Opus 5.5.
- Um commit atômico por task concluída.

---

**Design**: `.specs/features/ultracar-oficinas-promotores/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Gerado por amostragem do código (`__tests__/unit/oficinaService.test.ts`, `__tests__/integration/oficinaService.test.ts`, `scripts/atualizar-lat-long-comunidade.ts`) e de `.specs/codebase/TESTING.md` — confirmar antes do Execute. Nenhum `AGENTS.md`/guia de cobertura obrigatória encontrado; `.specs/codebase/TESTING.md` documenta o padrão já em uso (mock de `AppDataSourceSync` + asserção na string SQL — lição confirmada L-004), que este plano segue como piso.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
|---|---|---|---|---|
| `OficinaUltracarService` (fragmento SQL novo) | unit | Fragmento contém schema/tabela corretos, `LEFT JOIN` com CTE normalizada (nunca `EXISTS`/`IN (SELECT ...)` correlacionado), filtro `active = true`, projeção de colunas igual aos outros ramos | `__tests__/unit/oficinaUltracarService.test.ts` | `npx jest --runInBand __tests__/unit/oficinaUltracarService.test.ts` |
| `OficinaService` (4 métodos estendidos) | unit | Cada método: SQL final inclui o 3º ramo (tabela/colunas corretas, sem filtro de `EMPRESA_SLUG` nesse ramo); os ramos 1 e 2 (comunidade, importada) continuam exatamente como antes — 1:1 com ULTRACAR-01 a ULTRACAR-10 | `__tests__/unit/oficinaService.test.ts` | `npx jest --runInBand __tests__/unit/oficinaService.test.ts` |
| `OficinaService` (smoke real-DB) | integration | Dedupe (nenhum `ID_OFICINA` duplicado no resultado combinado) e tempo de execução dentro do timeout de 10s, para os 4 métodos — ULTRACAR-11 a ULTRACAR-14 | `__tests__/integration/oficinaService.test.ts` | `npx jest --runInBand __tests__/integration/oficinaService.test.ts` |
| `scripts/atualizar-cep-oficinas-ultracar.ts` (lógica de seleção de candidata) | unit | Todo edge case listado no spec: CEP igual/divergente, `DATA_ALTERACAO` recente/antiga/nula, CNPJ sem match, CEP da Ultracar vazio, modo teste vs. real — 1:1 com ULTRACAR-15 a ULTRACAR-20 | `__tests__/unit/atualizarCepOficinasUltracar.test.ts` | `npx jest --runInBand __tests__/unit/atualizarCepOficinasUltracar.test.ts` |
| Entity / Config | none | — (build gate only) | — | build gate only |

## Gate Check Commands

> Nunca rodar `npm test`/`npm run test:unit` (suite inteira) nem mais de um `jest` por verificação — tudo num único comando `--runInBand`, limitado aos arquivos desta feature.

| Gate Level | When to Use | Command |
|---|---|---|
| Quick | Depois de task só com teste unitário | `npx jest --runInBand __tests__/unit/oficinaUltracarService.test.ts __tests__/unit/oficinaService.test.ts __tests__/unit/atualizarCepOficinasUltracar.test.ts` (roda só os arquivos já criados até a task atual) |
| Full | Depois de fechar uma fase, ou task com teste de integração | `npx jest --runInBand __tests__/unit/oficinaUltracarService.test.ts __tests__/unit/oficinaService.test.ts __tests__/unit/atualizarCepOficinasUltracar.test.ts __tests__/integration/oficinaService.test.ts` |
| Build | Fechamento de fase / task só de config | `npx tsc --noEmit` |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Fragmento SQL de match com a Ultracar

```
T1
```

### Phase 2: Estender as 4 consultas de comunidade

```
T2 → T3 → T4 → T5
```

### Phase 3: Verificação end-to-end (smoke real-DB)

```
T6
```

### Phase 4: Script de correção de CEP (P2)

```
T7
```

---

## Task Breakdown

### Phase 1: Fragmento SQL de match com a Ultracar

### T1: Criar `OficinaUltracarService` com o fragmento SQL de match

**What**: Novo arquivo `service/oficinaUltracarService.ts` exportando `sqlOficinasComMatchUltracar()` — fragmento `SELECT` sobre `MAIN_REGISTER.OFICINA` (com `ligacaoCadastroEmpresa`) restrito a CNPJ com match ativo em `ultracar_process.enterprise__tb_company`, via `LEFT JOIN` com CTE de CNPJ normalizado (nunca `EXISTS`/`IN` correlacionado), sem filtro de `EMPRESA_SLUG`. Mesma projeção de colunas que o ramo 1 (comunidade) dos métodos de `OficinaService`.
**Where**: `service/oficinaUltracarService.ts`
**Depends on**: None
**Reuses**: `cnpjIntDaOficina`, `ligacaoCadastroEmpresa` (`utils/sqlCadastroEmpresa.ts`); projeção de colunas de `getComunityNearbyOficinas` (`service/oficinaService.ts`)
**Requirement**: ULTRACAR-06, ULTRACAR-12

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `sqlOficinasComMatchUltracar()` devolve um fragmento SQL válido (string), sem placeholder de `EMPRESA_SLUG`
- [ ] Fragmento usa `LEFT JOIN`/CTE para o match de CNPJ — nenhuma ocorrência de `EXISTS (` nem `OR` correlacionado contra `ultracar_process`
- [ ] Fragmento filtra `active = true` em `enterprise__tb_company`
- [ ] Gate check passes: `npx jest --runInBand __tests__/unit/oficinaUltracarService.test.ts`
- [ ] Test count: ≥4 testes passam (fragmento contém tabela certa; contém `LEFT JOIN`; não contém `EXISTS`/`IN (SELECT`; filtra `active`)

**Tests**: unit
**Gate**: quick

---

### Phase 2: Estender as 4 consultas de comunidade

### T2: Estender `getComunityNearbyOficinas` com o 3º ramo

**What**: Adicionar `UNION ALL sqlOficinasComMatchUltracar()` como 3º ramo da consulta existente, mantendo os 2 ramos atuais (comunidade, `OFICINA_IMPORTADA`) intactos; o `DISTINCT ON ("ID_OFICINA")` do wrapper já existente passa a desduplicar os 3 ramos.
**Where**: `service/oficinaService.ts`
**Depends on**: T1
**Reuses**: wrapper `SELECT DISTINCT ON ("ID_OFICINA") * FROM (...) combinado` já existente no método
**Requirement**: ULTRACAR-01, ULTRACAR-02, ULTRACAR-04, ULTRACAR-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Assinatura pública do método inalterada
- [ ] SQL final contém os 3 ramos (`UNION ALL` x2) e o `DISTINCT ON ("ID_OFICINA")` externo
- [ ] Testes existentes de `getComunityNearbyOficinas` (ramos 1 e 2) continuam passando sem alteração de asserção
- [ ] Novo teste cobre: oficina com match aparece mesmo sem pertencer à comunidade do slug (assert sobre a string SQL + resultado mockado)
- [ ] Gate check passes: `npx jest --runInBand __tests__/unit/oficinaUltracarService.test.ts __tests__/unit/oficinaService.test.ts`
- [ ] Test count: suíte de `oficinaService.test.ts` cresce em pelo menos 2 testes (match aparece; dedupe/ausência de duplicata na asserção de SQL) sem nenhum teste removido

**Tests**: unit
**Gate**: quick

---

### T3: Estender `getCommunityOficinas` com o 3º ramo

**What**: Mesmo tratamento de T2 aplicado a `getCommunityOficinas` (versão sem filtro de raio).
**Where**: `service/oficinaService.ts`
**Depends on**: T2
**Reuses**: mesmo wrapper `DISTINCT ON` já existente no método; `sqlOficinasComMatchUltracar()` de T1
**Requirement**: ULTRACAR-01, ULTRACAR-02, ULTRACAR-04, ULTRACAR-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Assinatura pública do método inalterada
- [ ] SQL final contém os 3 ramos e o `DISTINCT ON ("ID_OFICINA")` externo
- [ ] Testes existentes do método continuam passando sem alteração de asserção
- [ ] Novo teste cobre o mesmo cenário de match-fora-da-comunidade que T2, para este método
- [ ] Gate check passes: `npx jest --runInBand __tests__/unit/oficinaUltracarService.test.ts __tests__/unit/oficinaService.test.ts`
- [ ] Test count: suíte cresce em pelo menos 2 testes sem nenhum removido

**Tests**: unit
**Gate**: quick

---

### T4: Estender `countCommunityOficinas` com o 3º ramo

**What**: Mesmo tratamento de T2/T3 aplicado a `countCommunityOficinas`, usando `COUNT(DISTINCT "ID_OFICINA")` (já existente) sobre os 3 ramos.
**Where**: `service/oficinaService.ts`
**Depends on**: T3
**Reuses**: `COUNT(DISTINCT "ID_OFICINA")` já existente no método; `sqlOficinasComMatchUltracar()` de T1
**Requirement**: ULTRACAR-01, ULTRACAR-02, ULTRACAR-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Assinatura pública do método inalterada
- [ ] SQL final contém os 3 ramos e o `COUNT(DISTINCT "ID_OFICINA")` externo
- [ ] Testes existentes do método continuam passando sem alteração de asserção
- [ ] Novo teste cobre: contagem não duplica oficina presente em comunidade E com match Ultracar
- [ ] Gate check passes: `npx jest --runInBand __tests__/unit/oficinaUltracarService.test.ts __tests__/unit/oficinaService.test.ts`
- [ ] Test count: suíte cresce em pelo menos 1 teste sem nenhum removido

**Tests**: unit
**Gate**: quick

---

### T5: Estender `getCommunityOficinasSegmentadas` com o 3º ramo

**What**: Hoje este método só tem o ramo de comunidade (sem `OFICINA_IMPORTADA`). Adicionar o `UNION ALL sqlOficinasComMatchUltracar()` como 2º ramo, envolvendo a consulta no mesmo wrapper `SELECT DISTINCT ON ("ID_OFICINA") * FROM (...) combinado` que os outros 3 métodos já usam. **Não** adicionar o ramo `OFICINA_IMPORTADA` aqui — é uma inconsistência pré-existente, fora do pedido desta spec (ver design.md, Risks & Concerns).
**Where**: `service/oficinaService.ts`
**Depends on**: T4
**Reuses**: `sqlOficinasComMatchUltracar()` de T1; wrapper `DISTINCT ON` dos outros 3 métodos como modelo
**Requirement**: ULTRACAR-01, ULTRACAR-02, ULTRACAR-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Assinatura pública do método inalterada
- [ ] SQL final contém os 2 ramos (comunidade + Ultracar) e o `DISTINCT ON ("ID_OFICINA")` externo novo
- [ ] Testes existentes do método (ramo de comunidade/segmentação por lote) continuam passando sem alteração de asserção
- [ ] Novo teste cobre o cenário de match-fora-da-comunidade para este método
- [ ] Gate check passes: `npx jest --runInBand __tests__/unit/oficinaUltracarService.test.ts __tests__/unit/oficinaService.test.ts`
- [ ] Test count: suíte cresce em pelo menos 2 testes sem nenhum removido

**Tests**: unit
**Gate**: quick

---

### Phase 3: Verificação end-to-end (smoke real-DB)

### T6: Smoke de integração (dedupe + timeout) para os 4 métodos

**What**: Em `__tests__/integration/oficinaService.test.ts` (suíte real-DB, só leitura), adicionar casos que rodam os 4 métodos estendidos contra o banco real e verificam (a) nenhum `ID_OFICINA` duplicado no array devolvido e (b) tempo de execução abaixo de 10s. Segue o estilo já existente na suíte (asserções tolerantes a resultado vazio, sem fixture nova).
**Where**: `__tests__/integration/oficinaService.test.ts`
**Depends on**: T5
**Reuses**: `setup.ts` (mesma suíte real-DB já existente); slug/coordenadas de exemplo já usados na suíte (`"mobil"`, São Paulo)
**Requirement**: ULTRACAR-11, ULTRACAR-13, ULTRACAR-14

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Teste novo para cada um dos 4 métodos: resultado não tem `ID_OFICINA` repetido
- [ ] Teste novo mede `Date.now()` antes/depois da chamada e falha se `> 10000`ms, para pelo menos `getComunityNearbyOficinas` e `getCommunityOficinas`
- [ ] Nenhum teste de integração existente foi alterado ou removido
- [ ] Gate check passes: `npx jest --runInBand __tests__/unit/oficinaUltracarService.test.ts __tests__/unit/oficinaService.test.ts __tests__/unit/atualizarCepOficinasUltracar.test.ts __tests__/integration/oficinaService.test.ts` (o arquivo de unit do script, T7, ainda não existe neste ponto — se a task 7 ainda não rodou, usar só os 3 arquivos já criados)
- [ ] Test count: suíte de integração cresce em pelo menos 5 testes (dedupe x4 + timeout x1) sem nenhum removido

**Tests**: integration
**Gate**: full

---

### Phase 4: Script de correção de CEP (P2)

### T7: Script `atualizar-cep-oficinas-ultracar.ts` (P2)

**What**: Novo script `scripts/atualizar-cep-oficinas-ultracar.ts`, com `--teste[=N]` (padrão do esqueleto de `atualizar-lat-long-comunidade.ts`). A lógica de seleção de candidata (match de CNPJ + CEP divergente + `DATA_ALTERACAO` nula ou com mais de 12 meses) fica numa função pura exportada (`ehCandidataParaCorrecaoCep(...)` ou equivalente), testável sem banco. Em modo teste, só lista candidatas (sem `UPDATE`); fora do modo teste, executa `UPDATE MAIN_REGISTER.OFICINA."CEP"` uma linha por vez.
**Where**: `scripts/atualizar-cep-oficinas-ultracar.ts`
**Depends on**: None
**Reuses**: esqueleto `--teste[=N]` de `scripts/atualizar-lat-long-comunidade.ts`; `cnpjIntParaLigacao` (`utils/sqlCadastroEmpresa.ts`)
**Requirement**: ULTRACAR-15, ULTRACAR-16, ULTRACAR-17, ULTRACAR-18, ULTRACAR-19, ULTRACAR-20

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Função de seleção de candidata é pura/exportada e coberta por teste para cada edge case: CEP igual (não candidata), CEP divergente + `DATA_ALTERACAO` há mais de 12 meses (candidata), CEP divergente + `DATA_ALTERACAO` recente (não candidata), `DATA_ALTERACAO` nula + CEP divergente (candidata), sem match de CNPJ (não candidata), CEP da Ultracar vazio (não candidata)
- [ ] Modo teste (`--teste[=N]`) não executa nenhum `UPDATE` — testado mockando `AppDataSourceSync.query`/`AppDataSourceSync` e verificando zero chamadas de escrita
- [ ] Modo real executa `UPDATE` só da coluna `CEP`, uma linha por candidata — testado mockando a mesma forma
- [ ] Nenhuma DDL é executada pelo script (não há tabela/índice novo nesta feature)
- [ ] Gate check passes: `npx jest --runInBand __tests__/unit/oficinaUltracarService.test.ts __tests__/unit/oficinaService.test.ts __tests__/unit/atualizarCepOficinasUltracar.test.ts`
- [ ] Test count: ≥6 testes novos (um por edge case listado acima, mínimo)

**Tests**: unit
**Gate**: quick

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1
Phase 2:  T2 ------→ T3 ------→ T4 ------→ T5
Phase 3:  T6
Phase 4:  T7
```

Execution is strictly sequential - there is no intra-phase parallelism. 7 tasks totais, dentro do orçamento de um único batch (~7-8 tasks) — **sem necessidade de sub-agentes**; execução inline no Execute.

---

## Task Granularity Check

| Task | Scope | Status |
|---|---|---|
| T1: Criar `OficinaUltracarService` | 1 arquivo, 1 função (fragmento SQL) | ✅ Granular |
| T2: Estender `getComunityNearbyOficinas` | 1 método, 1 arquivo | ✅ Granular |
| T3: Estender `getCommunityOficinas` | 1 método, 1 arquivo | ✅ Granular |
| T4: Estender `countCommunityOficinas` | 1 método, 1 arquivo | ✅ Granular |
| T5: Estender `getCommunityOficinasSegmentadas` | 1 método, 1 arquivo | ✅ Granular |
| T6: Smoke de integração | 1 arquivo de teste, 4 casos do mesmo tipo (dedupe/timeout) | ✅ Granular (coesos, mesmo objetivo) |
| T7: Script de correção de CEP | 1 arquivo novo | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
|---|---|---|---|
| T1 | None | (nenhuma seta de entrada) | ✅ Match |
| T2 | T1 | T1 → (Phase 2 início, T2) | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → (Phase 3, T6) | ✅ Match |
| T7 | None | (nenhuma seta de entrada; Phase 4 independente) | ✅ Match |

Nenhuma dependência aponta para uma fase posterior; todas as setas do diagrama têm um `Depends on` correspondente e vice-versa.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
|---|---|---|---|---|
| T1: `OficinaUltracarService` | Service (fragmento SQL novo) | unit | unit | ✅ OK |
| T2: `getComunityNearbyOficinas` | Service (`OficinaService`, 4 métodos estendidos) | unit | unit | ✅ OK |
| T3: `getCommunityOficinas` | Service (`OficinaService`, 4 métodos estendidos) | unit | unit | ✅ OK |
| T4: `countCommunityOficinas` | Service (`OficinaService`, 4 métodos estendidos) | unit | unit | ✅ OK |
| T5: `getCommunityOficinasSegmentadas` | Service (`OficinaService`, 4 métodos estendidos) | unit | unit | ✅ OK |
| T6: Smoke de integração | Service (smoke real-DB) | integration | integration | ✅ OK |
| T7: Script de correção de CEP | `scripts/atualizar-cep-oficinas-ultracar.ts` | unit | unit | ✅ OK |

Nenhuma task usa `Tests: none` fora da camada Entity/Config (que nenhuma task cria aqui).

---

## Tips

(seção de referência do template, sem conteúdo específico desta feature)

---

## Task Verification Standards

Cada task segue exatamente os campos `Done when` + `Tests` + `Gate` definidos acima — binários, com contagem de teste esperada para impedir exclusão silenciosa de teste, e requisito rastreado em `spec.md`.
