# Base de Oficinas da Ultracar nos Promotores Validation

**Date**: 2026-11-06
**Spec**: `.specs/features/ultracar-oficinas-promotores/spec.md`
**Diff range**: `e5b65ec..b758b28`
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T1   | ✅ Done | `service/oficinaUltracarService.ts` — fragmento SQL criado, `LEFT JOIN`/CTE, `active = true`, sem `EMPRESA_SLUG` |
| T2   | ✅ Done | `getComunityNearbyOficinas` (`service/oficinaService.ts:230-360`) ganhou o 3º ramo |
| T3   | ✅ Done | `getCommunityOficinas` (`service/oficinaService.ts:459-541`) ganhou o 3º ramo |
| T4   | ✅ Done | `countCommunityOficinas` (`service/oficinaService.ts:548-595`) ganhou o 3º ramo |
| T5   | ✅ Done | `getCommunityOficinasSegmentadas` (`service/oficinaService.ts:605-688`) ganhou o 2º ramo (não tinha `OFICINA_IMPORTADA`) |
| T6   | ✅ Done | `__tests__/integration/oficinaService.test.ts` — dedupe + timeout para os 4 métodos; 2 testes pré-existentes ajustados (não removidos) por causa da decisão "ramo 3 não filtra por raio/slug", documentada em `design.md:207` |
| T7   | ✅ Done | `scripts/sincronizar-oficinas-ultracar.ts` — responsabilidade 1 (correção de CEP) |
| T8   | ✅ Done | `scripts/migration-ultracar-flag-oficina.sql` + `entities/Oficina.ts:103-104` |
| T9   | ✅ Done | Responsabilidade 2 (flag + enriquecimento) em `scripts/sincronizar-oficinas-ultracar.ts` |
| T10  | ✅ Done | Responsabilidade 3 (registro de disparo único) em `scripts/sincronizar-oficinas-ultracar.ts` |

All 10 tasks' "Done when" checkboxes verified against the actual diff (not just the `[x]` marks in tasks.md) — code, tests and gate commands re-run independently confirm each one.

---

## Spec-Anchored Acceptance Criteria

### P1: Oficina com match aparece para qualquer cliente, independente de comunidade ⭐ MVP

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| ULTRACAR-01: match ativo em `enterprise__tb_company` inclui a oficina para qualquer `EMPRESA_SLUG` | Ramo 3 sem filtro de slug, `active = true` | `service/oficinaUltracarService.ts:13` (`WHERE active = true`) + `__tests__/unit/oficinaService.test.ts:111-120` - `expect(ultracarBranch).not.toContain('EMPRESA_SLUG')` | ✅ PASS (escopo confirmado pelo usuário, ver nota abaixo) |
| ULTRACAR-02: inclui independente de pertencer à comunidade | Ramo 3 não tem predicado de comunidade | `service/oficinaService.ts:339` (`UNION ALL (${sqlOficinasComMatchUltracar("o", true)})`) — fora do bloco `WHERE cm."EmpresaSlug" = $1` | ✅ PASS |
| ULTRACAR-03: exibe mesmos dados (nome/endereço/telefone/coordenadas) da nossa base, nunca dado de `ultracar_process` | Projeção do ramo 3 só referencia `ce.*` (via `ligacaoCadastroEmpresa`), nunca colunas de `enterprise__tb_company` | `service/oficinaUltracarService.ts:31-43` — todas as colunas de saída vêm de `ce.*`; `ultracar_process` só aparece no `LEFT JOIN`/`WHERE` de match | ✅ PASS |
| ULTRACAR-04: dedupe por `ID_OFICINA`, sem duplicata se já é da comunidade | `DISTINCT ON("ID_OFICINA")`/`COUNT(DISTINCT...)` externo já existente cobre os 3 ramos | `service/oficinaService.ts:258` + `__tests__/unit/oficinaService.test.ts:122-130` - `expect(query).toMatch(/SELECT DISTINCT ON \("ID_OFICINA"\) \* FROM/)`; integração real-DB `__tests__/integration/oficinaService.test.ts:80-87` - `expect(new Set(ids).size).toBe(ids.length)` | ✅ PASS |
| ULTRACAR-05: contrato (formato) dos 4 métodos não muda | Assinaturas públicas inalteradas | `service/oficinaService.ts:230-234,459,548,605-607` — mesmos parâmetros/tipo de retorno do baseline (`git diff e5b65ec..HEAD -- service/oficinaService.ts` não altera nenhuma assinatura); `grep -rn "ULTRACAR"` fora de `scripts/`, `entities/Oficina.ts` e testes retorna vazio — nenhum DTO/rota expõe o campo novo | ✅ PASS |
| ULTRACAR-06: match exclusivamente por CNPJ (dígitos), nunca nome/endereço | `cnpjIntDaOficina`/CTE normalizada, nenhuma comparação de nome/endereço | `service/oficinaUltracarService.ts:10-15,45-47` | ✅ PASS (mesma nota) |

**Nota (ULTRACAR-01/06) — resolvida após esta verificação**: o Verifier apontou que `spec.md` linha 43 (tabela de Assumptions) propunha a fonte do match como a **união** de `MAIN_REGISTER.OFICINA."CNPJ"` e `dw.cadastro_empresa.cnpj_int`, mas `design.md:108` e a implementação (`service/oficinaUltracarService.ts:45-47`) sempre restringiram o ramo 3 a só `OFICINA."CNPJ"`. Efeito: ~17k oficinas sem `CNPJ` próprio (ligadas só por `id_oficina` ao dw, `utils/sqlCadastroEmpresa.ts:12-14`) ficam fora do bypass mesmo com match no dw. **Confirmado com o usuário no fechamento do Execute: manter o escopo como implementado (só `OFICINA.CNPJ`), sem estender.** `spec.md` linha 43 foi atualizada para `Confirmed = y` com essa decisão. Não é um problema de segurança — nunca introduziu falso positivo nem oficina fantasma.

### P1: Oficina sem match não aparece em nenhuma consulta nem recebe rota

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| ULTRACAR-07: sem match → não aparece em nenhuma das 4 consultas | Ramo 3 exige `ultracar_match.cnpj_int IS NOT NULL`; sem essa linha, oficina não entra no ramo 3 (e não aparece via ramo 1/2 se não for da comunidade) | `service/oficinaUltracarService.ts:47` (`WHERE ultracar_match.cnpj_int IS NOT NULL`) + `__tests__/integration/oficinaService.test.ts:55-64` ("should return only Ultracar-matched oficinas... for a non-existent slug") | ✅ PASS |
| ULTRACAR-08: nenhuma linha nova em `OFICINA`/`ROTA_PROMOTOR` para oficina sem match (fase de leitura) | Fases 1-6 (T1-T6) só fazem `SELECT` | Estrutural: nenhuma ocorrência de `INSERT`/`UPDATE` em `service/oficinaUltracarService.ts` nem nos 4 métodos de `oficinaService.ts` tocados (confirmado por leitura integral dos arquivos) | ✅ PASS |
| ULTRACAR-09: nenhum id sintético exposto, sempre `ID_OFICINA` real | Ramo 3 projeta `${aliasOficina}."ID_OFICINA"` direto da tabela | `service/oficinaUltracarService.ts:32` | ✅ PASS |
| ULTRACAR-10: tratativa de registro entregue (T10), critério de match das 4 consultas não mudou | `buscarCandidatosRegistro` usa a mesma CTE de match (union OFICINA+dw) para achar "sem match" e registrar | `scripts/sincronizar-oficinas-ultracar.ts:410-433` (`o."ID_OFICINA" IS NULL AND ce.cnpj_int IS NULL`) + `__tests__/unit/sincronizarOficinasUltracar.test.ts:330-343` | ✅ PASS |

### P1: Consultas respeitam timeout de 10s

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| ULTRACAR-11: as 4 consultas completam em até 10s em produção | Medido via smoke real-DB | `__tests__/integration/oficinaService.test.ts:89-93,104-108` - `expect(Date.now() - inicio).toBeLessThanOrEqual(10000)` (re-executado nesta verificação: PASS, ~1.2-2.9s por chamada) | ✅ PASS |
| ULTRACAR-12: `LEFT JOIN` com CTE normalizada, nunca `EXISTS`/`OR` correlacionado | Fragmento usa `LEFT JOIN` | `service/oficinaUltracarService.ts:45-47` + `__tests__/unit/oficinaUltracarService.test.ts:11-17` - `expect(sql).not.toMatch(/EXISTS\s*\(/)` | ✅ PASS |
| ULTRACAR-13: não consulta `st_obads_im`/`enterprise__tb_company_address` nas 4 consultas | Ramo 3 só referencia `enterprise__tb_company` | `service/oficinaUltracarService.ts:1-49` — nenhuma referência a `st_obads_im`/`enterprise__tb_company_address` no arquivo inteiro | ✅ PASS |
| ULTRACAR-14: timeout de 10s não é removido/afrouxado | Nenhuma alteração de configuração de timeout no caminho de request | `service/oficinaService.ts` e `service/oficinaUltracarService.ts` não tocam `statement_timeout` (só o script batch eleva, fora do request path — `scripts/sincronizar-oficinas-ultracar.ts:296-299`) | ✅ PASS |

### P2: Script de correção de CEP

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| ULTRACAR-15: modo teste só lista, sem gravar | `modoTeste` retorna antes do loop de `UPDATE` | `scripts/sincronizar-oficinas-ultracar.ts:155-158` + `__tests__/unit/sincronizarOficinasUltracar.test.ts:85-95` - `expect(AppDataSourceSync.query).toHaveBeenCalledTimes(1)` | ✅ PASS |
| ULTRACAR-16: modo real atualiza só `CEP`, uma linha por vez | `UPDATE ... SET "CEP" = $1 WHERE "ID_OFICINA" = $2` em loop | `scripts/sincronizar-oficinas-ultracar.ts:161-164` + `__tests__/unit/sincronizarOficinasUltracar.test.ts:108-130` - assert do texto exato do `UPDATE` e dos parâmetros por candidata | ✅ PASS |
| ULTRACAR-17: candidata = match + CEP divergente + sem atualização em 12 meses | `ehCandidataParaCorrecaoCep` | `scripts/sincronizar-oficinas-ultracar.ts:68-85` + `__tests__/unit/sincronizarOficinasUltracar.test.ts:24-77` (6 casos, 1:1 com os edge cases do spec) | ✅ PASS |
| ULTRACAR-18: `DATA_ATUALIZACAO_ENDERECO` < 12 meses exclui a candidata mesmo com CEP divergente | mesmo | `__tests__/unit/sincronizarOficinasUltracar.test.ts:43-50` - `toBe(false)` para `HA_1_MES` | ✅ PASS |
| ULTRACAR-19: CEP da Ultracar vazio exclui a candidata | `cepUltracar` vazio → `return false` | `scripts/sincronizar-oficinas-ultracar.ts:74-75` + `__tests__/unit/sincronizarOficinasUltracar.test.ts:70-77` | ✅ PASS |
| ULTRACAR-20: nenhuma DDL executada pelo script | Nenhum `CREATE`/`ALTER` no arquivo `.ts` | Confirmado por leitura integral de `scripts/sincronizar-oficinas-ultracar.ts` (557 linhas) — zero ocorrência de `CREATE`/`ALTER` | ✅ PASS |

### P1: Marcar também-Ultracar e completar campos vazios (CON26-408)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| ULTRACAR-21: `"ULTRACAR" = true` para todo CNPJ casado, independente de `active` | Query de `buscarCandidatosEnriquecimento` sem filtro `active` | `scripts/sincronizar-oficinas-ultracar.ts:257-283` (sem `c.active`) + `__tests__/unit/sincronizarOficinasUltracar.test.ts:211-220` - `expect(query).not.toMatch(/c\.active/)` | ✅ PASS |
| ULTRACAR-22: campos de endereço vazios preenchidos de `enterprise__tb_company_address` | `camposParaAtualizar` | `scripts/sincronizar-oficinas-ultracar.ts:209-231` + `__tests__/unit/sincronizarOficinasUltracar.test.ts:176-182` (`it.each` dos 6 campos) | ✅ PASS |
| ULTRACAR-23: `CIDADE`/`ESTADO` do registro mais recente de `st_obads_im` | `buscarCidadeEstadoMaisRecentePorCnpj` (`ORDER BY cnpj, dt_fechado DESC`) | `scripts/sincronizar-oficinas-ultracar.ts:301-305` + `__tests__/unit/sincronizarOficinasUltracar.test.ts:234-243` - `expect(...).toMatch(/ORDER BY cnpj, dt_fechado DESC/)` | ✅ PASS |
| ULTRACAR-24: nunca sobrescreve campo já preenchido | `decidirValorPreenchido` retorna `undefined` se `atual` não vazio | `scripts/sincronizar-oficinas-ultracar.ts:179-186` + `__tests__/unit/sincronizarOficinasUltracar.test.ts:161-163,192-199` | ✅ PASS |
| ULTRACAR-25: `CNPJ`/`NOME_FANTASIA`/`RAZAO_SOCIAL`/`TELEFONE` nunca alterados | `setClauses` só inclui `"ULTRACAR"` + colunas de `CAMPOS_ENDERECO_EMPRESA_ADDRESS`/`CAMPOS_CIDADE_ESTADO` | `scripts/sincronizar-oficinas-ultracar.ts:380` + `__tests__/unit/sincronizarOficinasUltracar.test.ts:294-309` - assert `not.toContain('"CNPJ"')` etc. | ✅ PASS |
| ULTRACAR-26: modo teste não grava | `if (modoTeste) return relatorio;` antes do `UPDATE` | `scripts/sincronizar-oficinas-ultracar.ts:373` + `__tests__/unit/sincronizarOficinasUltracar.test.ts:245-257` - `toHaveBeenCalledTimes(1)` | ✅ PASS |

### P1: Registrar oficinas sem match (disparo único, CON26-408)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| ULTRACAR-27: cria linha para `active = true` sem match em `OFICINA` nem `dw` | Anti-join `LEFT JOIN ... IS NULL` contra as duas fontes | `scripts/sincronizar-oficinas-ultracar.ts:410-433` + `__tests__/unit/sincronizarOficinasUltracar.test.ts:330-343` - asserts `o."ID_OFICINA" IS NULL` e `ce.cnpj_int IS NULL` simultâneos | ✅ PASS |
| ULTRACAR-28: preenche `NOME_FANTASIA`/`CNPJ`/endereço/`CIDADE`/`ESTADO`/`ORIGEM="ULTRACAR"`/`ULTRACAR=true` | `INSERT` com os 11 campos + `TELEFONE` nulo | `scripts/sincronizar-oficinas-ultracar.ts:476-492` + `__tests__/unit/sincronizarOficinasUltracar.test.ts:358-375` - assert do texto `'ULTRACAR', true, NULL` e dos `params` exatos | ✅ PASS |
| ULTRACAR-29: `TELEFONE` nulo na oficina criada | `VALUES (..., NULL)` hardcoded, não é parâmetro | `scripts/sincronizar-oficinas-ultracar.ts:479` | ✅ PASS |
| ULTRACAR-30: reexecução não duplica (idempotência) | Candidata já registrada passa a casar (`o."ID_OFICINA" IS NULL` deixa de ser verdade) | `__tests__/unit/sincronizarOficinasUltracar.test.ts:394-406` ("should be idempotent") | ✅ PASS |
| ULTRACAR-31: oficina registrada passa a aparecer nas 4 consultas sem mudança adicional | Mesma CTE de match em `sqlOficinasComMatchUltracar` e em `buscarCandidatosRegistro` — uma vez `CNPJ` existe em `OFICINA`, ramo 3 a inclui automaticamente | Estrutural: `scripts/sincronizar-oficinas-ultracar.ts:424-425` usa `cnpjIntDaOficina("o")`, igual a `service/oficinaUltracarService.ts:46` — nenhuma lógica de visibilidade nova necessária | ✅ PASS |
| ULTRACAR-32: modo teste não grava (`INSERT`) | `if (modoTeste) return relatorio;` | `scripts/sincronizar-oficinas-ultracar.ts:470` + `__tests__/unit/sincronizarOficinasUltracar.test.ts:345-356` - `toHaveBeenCalledTimes(1)` | ✅ PASS |

**Status**: ✅ All 32 ACs PASS with `file:line` evidence. (ULTRACAR-01/ULTRACAR-06 started as a spec-precision gap; resolved during closing by explicit user confirmation that the match scope — only `OFICINA.CNPJ` — is intentional, not an oversight.)

---

## Discrimination Sensor

Executed in an isolated `git worktree` (`git worktree add <scratch> HEAD`), never on the real tree. Baseline `git status --porcelain` on the real tree was clean before and after; confirmed identical post-cleanup (`git worktree remove --force`).

| # | File:line | Description | Killed? |
| - | --------- | ------------ | ------- |
| 1 | `service/oficinaUltracarService.ts:13` | Flipped `WHERE active = true` → `WHERE active = false` | ✅ Killed — `__tests__/unit/oficinaUltracarService.test.ts` "should filter active = true on enterprise__tb_company" failed, as expected |
| 2 | `scripts/sincronizar-oficinas-ultracar.ts:183` | Flipped guard `if (!valorVazio(atual)) return undefined;` → `if (valorVazio(atual)) return undefined;` (inverts "never overwrite filled field" to "only fill when already filled") | ✅ Killed — 10 tests in `decidirValorPreenchido`/`camposParaAtualizar`/`enriquecerOficinasComUltracar` failed (e.g. "never overwrites a value that is already filled") |
| 3 | `scripts/sincronizar-oficinas-ultracar.ts:84` | Flipped comparison `candidato.dataAtualizacaoEndereco < limite` → `> limite` (12-month window) | ✅ Killed — "is a candidate when CEP diverges and DATA_ATUALIZACAO_ENDERECO is more than 12 months old" and "is not a candidate... recent" both failed |

**Sensor depth**: lightweight (3 targeted mutations, default tier — no P0/critical-path classification for this feature).
**Result**: 3/3 killed — PASS ✅

Isolation verification: `git status --porcelain` on the real tree was empty before the worktree was created and empty again after `git worktree remove --force` (confirmed via `git worktree list` showing only the main tree).

---

## Interactive UAT Results

Not performed — this is a backend-only feature (SQL fragments + a CLI script), no UI/interaction surface. Per `validate.md` §3, automated checks (spec-anchored AC table, gate, sensor) are sufficient for backend-only work.

---

## Code Quality

| Principle | Status |
| --- | --- |
| No features beyond what was asked | ✅ |
| No abstractions for single-use code | ✅ |
| No unnecessary "flexibility" added | ✅ |
| Only touched files required for task | ✅ — diff is limited to the 2 new service/script files, `oficinaService.ts` (4 methods), `entities/Oficina.ts`, 1 new SQL file, test files, `__mocks__/data-source.ts` (added `createQueryRunner` mock), and the feature's own spec/design/tasks docs |
| Didn't "improve" unrelated code | ✅ |
| Matches existing patterns/style | ✅ — reuses `ligacaoCadastroEmpresa`/`cnpjIntDaOficina` conventions, `--teste[=N]` CLI skeleton from `atualizar-lat-long-comunidade.ts`, `migration-oficina-importada.sql` DDL header style |
| Would senior engineer approve? | ✅ |
| Tests map to acceptance criteria and are non-shallow (spot-check one story) | ✅ — spot-checked "Registrar oficinas sem match": all 6 ACs (ULTRACAR-27 to 32) have a dedicated test asserting exact SQL predicates and exact `INSERT` params, not just "a query ran" |
| Spec-anchored outcome check (asserted values match spec) | ⚠️ — 30/32 match precisely; 2 (ULTRACAR-01/06) have an unverified boundary (CNPJ match source scope) — see note above |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ — no new routes in this feature (service/script layer only); all pure functions have edge-case coverage |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — every new test's `describe`/`it` title references a ULTRACAR-NN id or a named edge case from spec.md |
| Documented project quality/testing guidelines followed | `.specs/codebase/TESTING.md` (mock `AppDataSourceSync` + assert on SQL string, per tasks.md's Test Coverage Matrix) — followed |

---

## Edge Cases

- [x] CNPJ duplicado em `enterprise__tb_company` (matrix_id) → tratado como match único: `CNPJ_ATIVO_ULTRACAR` usa `SELECT DISTINCT` (`service/oficinaUltracarService.ts:11`)
- [x] Oficina já na comunidade E com match Ultracar → aparece uma vez (dedupe externo `DISTINCT ON`/`COUNT(DISTINCT)`, testado em unit + integração real-DB)
- [x] CNPJ duplicado em `MAIN_REGISTER.OFICINA` → sem regra nova; `ligacaoCadastroEmpresa` (já existente, reusado) resolve o desempate como em todo o resto do sistema
- [x] Falha de `enterprise__tb_company` → consulta inteira falha visivelmente: ramo 3 está dentro da mesma string SQL única enviada via `AppDataSourceSync.query`, logo um erro nessa tabela propaga para o mesmo `try/catch`+`throw` já existente nos 4 métodos — estrutural, sem necessidade de mock de falha parcial
- [x] Oficina Ultracar `active = false` → não conta como match para visibilidade (`WHERE active = true`, testado) nem é alvo de correção de CEP (também `active = true`); mas É marcada `ULTRACAR=true` no enriquecimento (comportamento correto e testado: "should match regardless of active")
- [ ] CNPJ "nosso" via `dw.cadastro_empresa` apenas (sem `OFICINA."CNPJ"` preenchido) → **não coberto**: ver nota de Spec-precision gap acima (ULTRACAR-01/06)
- [x] Oficina Ultracar sem match sem endereço resolvível → ainda criada, só identidade (testado: "should still create the oficina (identity only) when no address is resolvable")
- [x] CNPJ duplicado em `enterprise__tb_company` para registro → uma única oficina por CNPJ (o `INSERT` é por linha de `enterprise__tb_company c` já após `LEFT JOIN`; como o CNPJ já teria match após a primeira inserção hipotética, a condição de match evita duplicata — mesma lógica de T10, testada via "idempotent")
- [x] Oficina a registrar sem `st_obads_im` → criada com `CIDADE`/`ESTADO` nulos (`cidadeEstadoPorCnpj.get(...) ?? null`, testado via "should still create the oficina... when no address is resolvable", que cobre o caso combinado)

---

## Gate Check

- **Gate command**: `npx jest --runInBand __tests__/unit/oficinaUltracarService.test.ts __tests__/unit/oficinaService.test.ts __tests__/unit/sincronizarOficinasUltracar.test.ts __tests__/integration/oficinaService.test.ts` (Full gate, per tasks.md)
- **Result**: 82 passed, 0 failed, 0 skipped (re-run 3 times for stability; see note below)
- **Test count before feature** (at `e5b65ec`): 0 for these files (all 4 are new or newly-extended for this feature; `oficinaService.test.ts` existed before but without Ultracar-branch tests)
- **Test count after feature**: 82 (7 `oficinaUltracarService` + 25 `oficinaService` + 38 `sincronizarOficinasUltracar` + 12 `integration/oficinaService`)
- **Delta**: self-reported per-task deltas in tasks.md (T1:+7, T2:+2, T3:+2, T4:+1, T5:+5, T6:+7, T7:+12, T9:+21, T10:+6) cross-checked against actual file content — all consistent, cumulative totals match exactly (7, 32, 70, 82 at the relevant gate checkpoints)
- **Skipped tests**: none
- **Failures**: none in the final, reproducible run. **Note**: on the very first invocation of the combined 4-file command, 1 of 82 tests failed transiently (not reproduced in 2 subsequent runs of the identical command, nor when run file-by-file) — consistent with a cold-start DB-latency flake in the real-DB integration suite rather than a logic defect. Build gate (`npx tsc --noEmit`) reports exactly one error, in `__tests__/unit/segmentacaoCampanhaPromotor.test.ts` (missing `utils/migrationRepository`/`__tests__/helpers/mockMigrationRepo`), confirmed pre-existing at baseline `e5b65ec` (same two missing-module errors reproduced by checking out that commit's test file) — unrelated to this feature.

---

## Fix Plans

### Fix 1 — RESOLVED: CNPJ match source scope for ramo 3

- **Root cause**: `spec.md`'s Assumptions table (line 43, `Confirmed? = n`) proposed the match source as the union of `OFICINA."CNPJ"` and `dw.cadastro_empresa.cnpj_int`; `design.md:108` and the implementation (`service/oficinaUltracarService.ts:45-47`) use only `OFICINA."CNPJ"` via `cnpjIntDaOficina`.
- **Resolution**: User confirmed, after reviewing this report, to keep the scope as implemented (`OFICINA.CNPJ` only) rather than extending it. `spec.md` line 43 updated to `Confirmed = y` with this decision and its rationale.
- **Priority**: Minor (completeness/documentation gap, not a safety or regression risk). Closed, no code change required.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| ULTRACAR-01 | Implementing | ✅ Verified (escopo confirmado pelo usuário) |
| ULTRACAR-02 | Implementing | ✅ Verified |
| ULTRACAR-03 | Implementing | ✅ Verified |
| ULTRACAR-04 | Implementing | ✅ Verified |
| ULTRACAR-05 | Implementing | ✅ Verified |
| ULTRACAR-06 | Implementing | ✅ Verified (escopo confirmado pelo usuário) |
| ULTRACAR-07 | Implementing | ✅ Verified |
| ULTRACAR-08 | Implementing | ✅ Verified |
| ULTRACAR-09 | Implementing | ✅ Verified |
| ULTRACAR-10 | Implementing | ✅ Verified |
| ULTRACAR-11 | Implementing | ✅ Verified |
| ULTRACAR-12 | Implementing | ✅ Verified |
| ULTRACAR-13 | Implementing | ✅ Verified |
| ULTRACAR-14 | Implementing | ✅ Verified |
| ULTRACAR-15 | Implementing | ✅ Verified |
| ULTRACAR-16 | Implementing | ✅ Verified |
| ULTRACAR-17 | Implementing | ✅ Verified |
| ULTRACAR-18 | Implementing | ✅ Verified |
| ULTRACAR-19 | Implementing | ✅ Verified |
| ULTRACAR-20 | Implementing | ✅ Verified |
| ULTRACAR-21 | Implementing | ✅ Verified |
| ULTRACAR-22 | Implementing | ✅ Verified |
| ULTRACAR-23 | Implementing | ✅ Verified |
| ULTRACAR-24 | Implementing | ✅ Verified |
| ULTRACAR-25 | Implementing | ✅ Verified |
| ULTRACAR-26 | Implementing | ✅ Verified |
| ULTRACAR-27 | Implementing | ✅ Verified |
| ULTRACAR-28 | Implementing | ✅ Verified |
| ULTRACAR-29 | Implementing | ✅ Verified |
| ULTRACAR-30 | Implementing | ✅ Verified |
| ULTRACAR-31 | Implementing | ✅ Verified |
| ULTRACAR-32 | Implementing | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 32/32 ACs matched spec outcome precisely (ULTRACAR-01/06's scope confirmed by the user after this report, closing what was initially flagged as a spec-precision gap)
**Sensor**: 3/3 mutations killed
**Gate**: 82 passed, 0 failed (reproducible; one transient flake on first run, not reproduced on 2 re-runs)

**What works**: All 4 community queries correctly gain the Ultracar-match branch (cross-community visibility, dedupe, no distance/EMPRESA_SLUG leakage into ramo 3, no `ultracar_process` data ever displayed); the 10s timeout holds in real-DB smoke tests; the batch script's 3 responsibilities (CEP correction, flag+enrichment, one-time registration) all have correct test-mode/real-mode separation, correct "never overwrite filled field" semantics, and verified idempotency; the `ULTRACAR` column is additive only (DDL manual, not auto-run; not exposed in any DTO/response); build gate is clean modulo one pre-existing, unrelated TypeScript error.

**Issues found**: none outstanding. The one non-blocking spec-precision gap (CNPJ match for cross-community visibility checking only `OFICINA."CNPJ"`, not the union with `dw.cadastro_empresa.cnpj_int` that spec.md's unconfirmed Assumption had proposed) was resolved by explicit user confirmation to keep the scope as implemented; `spec.md` updated accordingly.

**Next steps**: None required before closing Execute. The feature is done: run `validate_state.py` (confirmed exit 0) and proceed to commit the DDL reminder / STATE.md handoff.
