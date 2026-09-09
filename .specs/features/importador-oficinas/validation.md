# Importador de Oficinas Validation

## Validation: Importador de Oficinas — FAIL ❌

**Date**: 2026-09-09
**Spec**: `.specs/features/importador-oficinas/spec.md`
**Diff range**: `28a72c0..d0d37ae` (branch `feat/importador-oficinas`, 14 commits)
**Verifier**: independent sub-agent (author ≠ verifier), read-only over implementation and tests
**DB access**: none. No live database was contacted at any point. `npm run test:integration` (full script) was NOT run; `scripts/migration-oficina-importada.sql` was NOT executed.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 `cnpjIntDaOficina` export | ✅ Done | `utils/sqlCadastroEmpresa.ts:63` — `export` added, body unchanged (verified by diff: 1 line, `-function` → `+export function`) |
| T2 `OficinaImportada` entity | ✅ Done | `entities/OficinaImportada.ts:1-55` — all 8 columns per design; no `ORIGEM` (intended) |
| T3 migration script | ✅ Done | `scripts/migration-oficina-importada.sql:1-22` — matches entity; `IF NOT EXISTS` on table + both indexes; never executed |
| T4 upload middleware | ✅ Done | `middlewares/uploadPlanilha.ts:12-27` |
| T5 parse + header | ✅ Done | `service/oficinaImportService.ts:64-103` |
| T6 CNPJ normalize + dedupe | ✅ Done | `service/oficinaImportService.ts:110-135` |
| T7 dedupe/create oficina | ✅ Done | `service/oficinaImportService.ts:143-172` |
| T8 geocode lat/long | ✅ Done | `service/oficinaImportService.ts:180-207` |
| T9 link without user | ⚠️ Partial | `service/oficinaImportService.ts:215-253` — code supports multi-slug linking, but IMPORT-15 has **no test evidence** (see Gap 1) |
| T10 route assignment | ✅ Done | `service/oficinaImportService.ts:262-267` — pure delegation, method reused unchanged (`git diff` shows `service/rotaService.ts` untouched in range) |
| T11 orchestration | ⚠️ Partial | `service/oficinaImportService.ts:282-386` — per-row isolation implemented for validation/geocode failures only; the design's documented DB-error row isolation is absent (see Gap 3) |
| T12 endpoint | ✅ Done | `controllers/oficinaController.ts:152-201`, `routes/OficinaRoute.ts:26-35,229-264`, `schemas/oficina.ts:96-123` |
| T13 community-query extension | ✅ Done | `service/oficinaService.ts` — 3 methods extended; SQL reviewed independently (see SQL Risk Assessment) |

All 13 tasks were marked `✅ Complete` by the implementer; two are downgraded to ⚠️ Partial by this verification.

---

## Spec-Anchored Acceptance Criteria

Story P1-A — Upload e validação estrutural

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| IMPORT-01 header exato (case/acento-insensível) → prossegue com as linhas | processamento das linhas ocorre | `__tests__/unit/oficinaImportService.test.ts:65` - `expect(() => OficinaImportService.validarCabecalho([cabecalhoVariante])).not.toThrow()`; `__tests__/unit/oficinaImportService.test.ts:468` - `expect(resultado).toEqual({ total_linhas: 1, oficinas_criadas: 1, ..., rotas_criadas: 1, erros: [] })` | ✅ PASS |
| IMPORT-02 arquivo não `.xlsx`/`.csv` → 400, nada processado | HTTP 400 + zero processamento | `__tests__/integration/oficinaImport.test.ts:52` - `expect(response.status).toBe(400)`; `__tests__/integration/oficinaImport.test.ts:53` - `expect(importarPlanilhaMock).not.toHaveBeenCalled()`; `__tests__/unit/uploadPlanilha.test.ts:23` - `expect(isPlanilhaValida("oficinas.txt")).toBe(false)` | ✅ PASS |
| IMPORT-03 cabeçalho ≠ 7 colunas/ordem → 400 **com a lista de colunas esperada**, nenhuma escrita | HTTP 400 + corpo contendo a lista de colunas + zero escrita | `__tests__/unit/oficinaImportService.test.ts:70` - `.toThrow("HEADER_INVALIDO")` (fora de ordem); `:75` (coluna faltando); `:82` (coluna extra); `__tests__/integration/oficinaImport.test.ts:102` - `expect(response.status).toBe(400)` | ⚠️ Spec-precision gap — nenhum teste assere a **lista de colunas** no corpo (a mensagem existe em `controllers/oficinaController.ts:189`, mas não é verificada); nenhum teste exercita header inválido através de `importarPlanilha` para provar "nenhuma escrita" (garantido por ordenação de código em `service/oficinaImportService.ts:296-298`) |
| IMPORT-04 > 5MB **ou** > 5.000 linhas → 400, nada processado | HTTP 400 nos dois casos | linhas: `__tests__/unit/oficinaImportService.test.ts:100` - `.toThrow("LIMITE_LINHAS_EXCEDIDO")`; 5MB: **sem citação** — apenas configuração em `middlewares/uploadPlanilha.ts:19` (`limits: { fileSize: TAMANHO_MAXIMO_BYTES }`) | ⚠️ Parcial — metade da AC (5MB) sem evidência de teste; o mapeamento 400 de `LIMITE_LINHAS_EXCEDIDO` (`controllers/oficinaController.ts:192-194`) também não é testado |
| IMPORT-05 `ID_CAMPANHA` inexistente/soft-deleted → 404, arquivo não processado | HTTP 404 + arquivo nunca lido | `__tests__/unit/oficinaImportService.test.ts:421` - `.rejects.toThrow("CAMPANHA_NAO_ENCONTRADA")`; `:424` - `expect(AppDataSourceSync.query).not.toHaveBeenCalled()`; `__tests__/integration/oficinaImport.test.ts:80` - `expect(response.status).toBe(404)` | ✅ PASS |
| IMPORT-06 campanha sem `EMPRESA_SLUG` → 422, arquivo não processado | HTTP 422 | `__tests__/unit/oficinaImportService.test.ts:434` - `.rejects.toThrow("CAMPANHA_SEM_EMPRESA_SLUG")`; `__tests__/integration/oficinaImport.test.ts:91` - `expect(response.status).toBe(422)` | ✅ PASS |

Story P1-B — Deduplicação e criação por CNPJ

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| IMPORT-07 CNPJ existente → reusa `ID_OFICINA`, não sobrescreve campos | mesmo `ID_OFICINA`, zero escrita na oficina | `__tests__/unit/oficinaImportService.test.ts:176` - `expect(resultado).toEqual({ ID_OFICINA: 42, criada: false })`; `:177-178` - `expect(repo.create).not.toHaveBeenCalled()` / `expect(repo.save).not.toHaveBeenCalled()` | ✅ PASS |
| IMPORT-08 CNPJ novo → cria oficina com os 7 campos + `ORIGEM = "IMPORTACAO_PLANILHA"` | os 7 campos da planilha e `ORIGEM` exato | `__tests__/unit/oficinaImportService.test.ts:191` - `expect(repo.create).toHaveBeenCalledWith({ NOME_FANTASIA: "Oficina Teste", CNPJ: "12.345.678/0001-90", CEP: "01310100", ENDERECO: "Rua Teste", NUMERO: "100", ESTADO: "SP", CIDADE: "Sao Paulo", ORIGEM: "IMPORTACAO_PLANILHA" })`; `:189` - `toEqual({ ID_OFICINA: 99, criada: true })` | ✅ PASS |
| IMPORT-09 CNPJ ≠ 14 dígitos → rejeita só a linha, reporta motivo, segue o arquivo | linha isolada com motivo; demais processadas | `__tests__/unit/oficinaImportService.test.ts:491` - `expect(resultado.erros).toEqual([{ linha: 2, cnpj: "123", motivo: "CNPJ_INVALIDO" }])`; `:492` - `expect(resultado.oficinas_criadas).toBe(1)` | ✅ PASS |
| IMPORT-10 CNPJ repetido no arquivo → 1ª processada, seguintes com "CNPJ duplicado no arquivo" | 1ª processada, 2ª rejeitada com motivo de duplicidade | `__tests__/unit/oficinaImportService.test.ts:506` - `expect(resultado.erros).toEqual([{ linha: 3, cnpj: "12345678000190", motivo: "CNPJ_DUPLICADO_NO_ARQUIVO" }])`; `:505` - `expect(resultado.oficinas_criadas).toBe(1)`; `:143-145` - `expect(resultado.has(0)).toBe(false)` / `expect(resultado.has(2)).toBe(true)` | ✅ PASS (motivo é o código `CNPJ_DUPLICADO_NO_ARQUIVO`, não a string literal do spec — equivalente semântico, não exposto ao usuário final como texto) |

Story P1-C — Geocodificação e vínculo sem usuário

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| IMPORT-11 oficina sem lat/long → geocodifica CEP e preenche `LATITUDE`/`LONGITUDE` | UPDATE apenas de lat/long, com o valor geocodificado | `__tests__/unit/oficinaImportService.test.ts:238` - `expect(repo.update).toHaveBeenCalledWith(1, { LATITUDE: "-23.55", LONGITUDE: "-46.63" })`; `:237` - `expect(getLatLongByCep).toHaveBeenCalledWith("01310100")`; caso "já tem": `:221-222` - `expect(getLatLongByCep).not.toHaveBeenCalled()` / `expect(repo.update).not.toHaveBeenCalled()` | ✅ PASS |
| IMPORT-12 geocodificação falha → rejeita a linha e **SHALL NOT criar ou vincular** a oficina | nenhuma oficina persistida sem lat/long; linha reportada | `__tests__/unit/oficinaImportService.test.ts:521` - `expect(oficinaRepo.delete).toHaveBeenCalledWith(77)`; `:522` - `expect(resultado.oficinas_criadas).toBe(0)`; `:523` - `expect(resultado.erros).toEqual([{ linha: 2, cnpj: "12345678000190", motivo: "GEOCODIFICACAO_FALHOU" }])`; caso pré-existente: `:537-539` - `expect(oficinaRepo.delete).not.toHaveBeenCalled()` / `expect(oficinaRepo.save).not.toHaveBeenCalled()` / `expect(resultado.oficinas_vinculadas_existentes).toBe(0)`; `:253` - `expect(repo.update).not.toHaveBeenCalled()` | ✅ PASS — reconciliação verificada independentemente (ver seção SPEC_DEVIATION 1) e confirmada pela mutação M2 |
| IMPORT-13 oficina ainda não vinculada ao `EMPRESA_SLUG` → cria vínculo em `OFICINA_IMPORTADA` | um registro com `ID_OFICINA`+`EMPRESA_SLUG`(+`ID_CAMPANHA`,`CREATED_BY`) | `__tests__/unit/oficinaImportService.test.ts:296` - `expect(repo.create).toHaveBeenCalledWith({ ID_OFICINA: 1, EMPRESA_SLUG: "empresa-x", ID_CAMPANHA: 10, CREATED_BY: 7 })`; `:294` - `expect(resultado).toBe("criado")`; `:295` - `expect(AppDataSourceSync.getRepository).toHaveBeenCalledWith(OficinaImportada)` | ✅ PASS |
| IMPORT-14 já vinculada (com ou sem usuário) → **não** cria novo vínculo, só preenche lat/long faltante | zero novo vínculo; lat/long preenchido se faltava | `__tests__/unit/oficinaImportService.test.ts:269-271` - `expect(resultado).toBe("ja_vinculada")` / `expect(repo.findOne).not.toHaveBeenCalled()` / `expect(repo.save).not.toHaveBeenCalled()` (via `USUARIO_COMMUNITY`); `:282-283` - idem via `OFICINA_IMPORTADA`; `:314-315` - reimportação não duplica | ✅ PASS na metade "não duplica". ⚠️ A metade "apenas preencher lat/long" não tem asserção própria — só a ordenação em `service/oficinaImportService.ts:347` (garantirLatLong antes de garantirVinculo) |
| IMPORT-15 mesma oficina física pode estar vinculada a **mais de um** `EMPRESA_SLUG` simultaneamente | dois vínculos coexistem para slugs distintos | **sem citação** — nenhum teste no diff exercita dois `EMPRESA_SLUG` para o mesmo `ID_OFICINA` | ❌ GAP (evidence-or-zero) |

Story P1-D — Atribuição de rota do promotor

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| IMPORT-16 busca o promotor de menor distância Haversine dentro do raio (`RAIO`, default 20km) | promotor mais próximo dentro do raio | dentro do diff: `__tests__/unit/oficinaImportService.test.ts:334` - `expect(RotaService.assignOficinaFromCommunitySignup).toHaveBeenCalledWith(1, "empresa-x")` (pass-through). Comportamento em si: `__tests__/unit/rotaService.test.ts:717` - `expect(result.atribuicoes[0].promotor!.ID_PROMOTOR).toBe(9)` (**fora do diff range** — método reusado sem alteração) | ✅ PASS por reuso, evidência de comportamento fora do range |
| IMPORT-17 promotor elegível → cria `ROTA_PROMOTOR` com `STATUS = BACKLOG` | rota criada com STATUS BACKLOG | dentro do diff: `__tests__/unit/oficinaImportService.test.ts:359` - `expect(resultado.resumo.atribuidas).toBe(1)`. Comportamento: `__tests__/unit/rotaService.test.ts:694` - `expect(result.atribuicoes[0].status).toBe('atribuida')`, `:697` - `expect(result.resumo.atribuidas).toBe(1)`; `service/rotaService.ts:494` - `STATUS: StatusRota.BACKLOG` (**fora do diff range**) | ✅ PASS por reuso. ⚠️ `STATUS = BACKLOG` nunca é afirmado por asserção em teste algum (só lido no código) |
| IMPORT-18 nenhum promotor no raio → nenhuma rota, reporta `sem_promotor_disponivel`, sem erro | sem rota, status `sem_promotor_disponivel`, HTTP 200 | dentro do diff: `__tests__/unit/oficinaImportService.test.ts:384` - `expect(resultado.resumo.sem_promotor_disponivel).toBe(1)`. Comportamento: `__tests__/unit/rotaService.test.ts:676` - `expect(result.atribuicoes[0].status).toBe('sem_promotor_disponivel')` (**fora do diff range**) | ✅ PASS |
| IMPORT-19 oficina já com rota ativa na campanha → não cria nova rota | idempotência | `__tests__/unit/rotaService.test.ts:662` - `expect(result.atribuicoes[0].status).toBe('ja_atribuida')` (**fora do diff range**; T10 declara explicitamente não re-testar) | ✅ PASS por reuso |
| IMPORT-20 as consultas de "oficinas da comunidade" passam a incluir `OFICINA_IMPORTADA` | as 3 queries consideram a tabela nova | `__tests__/unit/oficinaService.test.ts:91` - `expect(AppDataSourceSync.query).toHaveBeenCalledWith(expect.stringContaining('OFICINA_IMPORTADA'), ['empresa-test', -23.55, -46.63, 20])`; `:117` - idem para `getCommunityOficinas` com `['empresa-test']`; `:158` - idem para `countCommunityOficinas` | ⚠️ Spec-precision gap — a asserção prova que o SQL **menciona** a tabela, não que o resultado inclui as oficinas importadas. Provar o outcome exige Postgres real (proibido nesta sessão) |

**Status**: ❌ Gaps present — 1 AC sem qualquer evidência (IMPORT-15), 1 edge case com divergência de comportamento real (CEP vazio), 4 spec-precision gaps flagged.

**Contagem**: 19/20 ACs com citação `file:line`; 14/20 com asserção que casa exatamente o outcome do spec; 1/20 sem evidência.

---

## Edge Cases

- [x] Arquivo não `.xlsx`/`.csv` → 400 sem processar — `__tests__/integration/oficinaImport.test.ts:52-53`
- [x] Cabeçalho válido e zero linhas de dados → 200 com `total_linhas: 0`, nenhuma criação — `__tests__/unit/oficinaImportService.test.ts:444` - `expect(resultado).toEqual({ total_linhas: 0, oficinas_criadas: 0, oficinas_vinculadas_existentes: 0, ja_na_comunidade: 0, rotas_criadas: 0, erros: [] })`
- [x] `ID_CAMPANHA` inexistente/soft-deleted → 404 — `__tests__/integration/oficinaImport.test.ts:80`
- [x] Campanha sem `EMPRESA_SLUG` → 422 — `__tests__/integration/oficinaImport.test.ts:91`
- [ ] **CEP vazio ou ausente → rejeitar a linha — NÃO atendido.** Não há nenhum teste, e o código não tem guarda de CEP vazio. Em `service/oficinaImportService.ts:187`, se a oficina já possui `LATITUDE`/`LONGITUDE`, `garantirLatLong` retorna coordenadas do banco **sem olhar o CEP** — a linha com CEP vazio é aceita, vinculada e contada como sucesso, ao contrário do que a edge case exige. Para CNPJ novo a linha acaba rejeitada, mas por acidente (`GEOCODIFICACAO_FALHOU`, após 2 chamadas HTTP externas por linha), não por validação.
- [x] Duas linhas com o mesmo CNPJ → 2ª rejeitada como duplicada — `__tests__/unit/oficinaImportService.test.ts:506`
- [ ] **Oficina já pertencente a outro `EMPRESA_SLUG` → cria vínculo adicional sem afetar o existente — sem evidência.** Mesma lacuna de IMPORT-15. O código sustenta o comportamento (`service/oficinaImportService.ts:236-238` filtra `findOne` por `{ ID_OFICINA, EMPRESA_SLUG }`, e o índice único da migration é `(ID_OFICINA, EMPRESA_SLUG)`), mas nada o exercita.
- [x] Nenhum promotor com coordenadas → todas reportadas como `sem_promotor_disponivel`, sem erro — `__tests__/unit/oficinaImportService.test.ts:384` (pass-through) + `__tests__/unit/rotaService.test.ts:676` (fora do range)

---

## Discrimination Sensor

Isolamento: worktree temporário `git worktree add --detach C:/tmp/obws HEAD` (nunca `git stash`), `node_modules` via junction para não instalar dependências. `git status --porcelain` da árvore real vazio **antes** e **depois**; `git worktree list` de volta a uma única entrada; `node_modules` intacto.

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ----------- | ------- |
| M1 | `service/oficinaImportService.ts:323` | Guarda de CNPJ duplicado invertida: `if (indicesDuplicados.has(indice))` → `if (!indicesDuplicados.has(indice))` | ✅ Killed — 5 testes falharam, incluindo `should reject the second occurrence of a duplicate CNPJ within the file and process only the first` (IMPORT-10) |
| M2 | `service/oficinaImportService.ts:355` | Efeito colateral compensatório removido: `await AppDataSourceSync.getRepository(Oficina).delete(ID_OFICINA)` substituído por no-op | ✅ Killed — 1 teste falhou, exatamente `should delete the just-created oficina and reject the row when geocoding fails for a brand-new CNPJ` (IMPORT-12) |
| M3 | `service/oficinaImportService.ts:87` | Comparação de cabeçalho relaxada de posicional para "contém": `every((esperado, indice) => cabecalhoNormalizado[indice] === esperado)` → `every((esperado) => cabecalhoNormalizado.includes(esperado))` | ✅ Killed — 1 teste falhou, exatamente `should reject a header with columns out of order` (IMPORT-01/IMPORT-03) |

Uma quarta tentativa (inverter `if (!cnpjNormalizado)` em `:318`) foi **descartada como inválida**: o mutante quebra a compilação TypeScript (`cnpjNormalizado` deixa de ser estreitado para `string`), então seria "morto" pelo compilador e não por uma asserção — não mede discriminação de teste. Substituído por M1.

**Sensor depth**: lightweight (3 mutações, foco no código novo de maior risco)
**Result**: 3/3 mutants killed — no survivors

---

## SQL Risk Assessment (T13 `UNION ALL`) — independent judgement

O implementador sinalizou como risco residual a combinação de `ce."latitude"` (sem cast, ramo pré-existente) com `o."LATITUDE"::double precision` (cast explícito, ramo novo) dentro do mesmo `UNION ALL`. Avaliação própria, feita lendo o SQL em `service/oficinaService.ts` e as fontes de tipo no repositório:

**1. Lat/long: risco BAIXO, e o próprio código já prova isso.** O ramo pré-existente chama `radians(ce."latitude")` (`service/oficinaService.ts`, ramo `USUARIO_COMMUNITY` de `getComunityNearbyOficinas`). PostgreSQL não tem cast implícito de `text`/`varchar` para `double precision`, então `radians(character varying)` seria erro de parse — a query nunca teria funcionado. Como ela está em produção, `dw.cadastro_empresa.latitude`/`longitude` já são um tipo numérico (`double precision` ou `numeric`), apesar de `entities/CadastroEmpresa.ts:64-68` declararem `varchar(20)`. `numeric`/`float8` ∪ `float8` resolve para `float8` na resolução de tipos de `UNION`. O risco especificamente apontado é, portanto, quase certamente um não-problema.

**2. O risco real está nas OUTRAS 10 colunas, e não foi sinalizado.** O mesmo `UNION ALL` casa `ce."numero"`, `ce."cep"`, `ce."telefone"` com `o."NUMERO"`, `o."CEP"`, `o."TELEFONE"` (todos `varchar` em `MAIN_REGISTER.OFICINA`). Os tipos reais do DW para essas colunas são conhecidos **apenas** por `entities/CadastroEmpresa.ts` — o mesmo arquivo que acabou de se provar não confiável para tipos (erra `latitude`/`longitude`, e o comentário em `utils/sqlCadastroEmpresa.ts:81` registra que também erra `id_oficina`, `double precision` no DW contra `int` na entity). Se qualquer uma dessas colunas for numérica no DW, o Postgres rejeita a query inteira com `UNION types integer and character varying cannot be matched` — e isso não degrada só o ramo novo: derruba as **três** consultas (mapa, listagem e contagem) para **todo** cliente, mesmo os sem nenhuma oficina importada. `ce."cnpj"` é o único caso descartável com segurança: `utils/sqlCadastroEmpresa.ts:21-26` documenta que "as duas tabelas guardam CNPJ como texto livre". Mitigação barata e verificável sem banco: castar as colunas de texto do ramo novo (ou os dois lados) para `text`, eliminando a classe de risco inteira em vez de validá-la manualmente antes do deploy.

**3. Colisão de alias: nenhuma.** O alias `o` aparece nos dois ramos, mas cada ramo é um sub-select entre parênteses, com escopo próprio; o ramo novo usa `oi`/`o` e o antigo `cm`/`uc`/`us`/`o`/`ce_por_id`/`ce_por_cnpj`/`ce`. A tabela derivada externa é `combinado`.

**4. Parâmetros e quoting: corretos.** `$1` é reusado nos dois ramos e significa `empresaSlug` em ambos; `$2`/`$3`/`$4` (lat/long/raio) são reusados coerentemente no ramo novo. Identificadores em maiúsculas seguem sempre entre aspas duplas. `ORDER BY` dentro de um ramo parentetizado de `UNION ALL` é PostgreSQL válido, e `DISTINCT ON ("ID_OFICINA") ... ORDER BY "ID_OFICINA", distance ASC` respeita a exigência de o `ORDER BY` começar pelas expressões do `DISTINCT ON`.

**5. No-op para cliente sem oficina importada: confirmado por leitura.** Com o ramo novo vazio, o `DISTINCT ON` externo + `ORDER BY "ID_OFICINA"[, distance]` reproduz a dedup e a ordenação anteriores (`ORDER BY us."ID_OFICINA"[, distance ASC]`), e `COUNT(DISTINCT "ID_OFICINA")` equivale a `COUNT(DISTINCT us."ID_OFICINA")`. Uma oficina presente nos dois ramos é deduplicada pelo `DISTINCT ON` externo, preferindo a de menor `distance`.

**Não verificável nesta sessão**: execução das 3 queries contra Postgres real (restrição absoluta de não acessar banco). O item 2 é a ação recomendada — corrigir por cast é preferível a "validar manualmente antes do deploy".

---

## SPEC_DEVIATION Reconciliations — independent judgement

### 1. T11 — `repo.delete(ID_OFICINA)` compensatório quando a geocodificação falha

**Veredicto: correto e efetivamente testado.**

`service/oficinaImportService.ts:348-363` guarda o delete atrás de `if (criada)`, e `criada` vem exclusivamente de `buscarOuCriarOficina` (`:154-171`: `false` no ramo do CNPJ já existente, `true` só após `repo.save`). Os dois casos se sustentam:
- recém-criada: o registro é removido antes de a linha ser reportada — nenhuma oficina sem lat/long persiste (IMPORT-12 atendido);
- pré-existente: nada é apagado, o que é obrigatório (apagar seria destruir cadastro alheio).

Os testes **provam**, não apenas exercitam: `__tests__/unit/oficinaImportService.test.ts:521` assere `delete` chamado com o id exato (`77`, o mesmo que `save` devolveu), `:522` assere `oficinas_criadas === 0`, e `:537-539` assere `delete`/`save` **não** chamados no caso pré-existente com `oficinas_vinculadas_existentes === 0`. A mutação M2 (delete removido) mata exatamente um teste — a asserção é load-bearing, não decorativa.

Ressalva própria: o delete é `Repository.delete` (hard delete). É a única opção, já que `entities/Oficina.ts` não tem `@DeleteDateColumn` — consistente. Mas ele roda **fora** de qualquer try/catch: se o próprio delete falhar, a exceção propaga e aborta o arquivo inteiro, deixando justamente a oficina sem lat/long que a compensação existe para evitar (ver Gap 3).

### 2. T12 — validar `ID_CAMPANHA` no controller em vez de via `schemas.body`

**Veredicto: o raciocínio é factualmente correto, não apenas plausível.**

`utils/routeDocumentation.ts:63-68` monta `allMiddlewares` colocando `validateSchema(schemas)` **antes** de `...middlewares`, e `middlewares/validation.ts:11-13` faz `req.body = schemas.body.parse(req.body)`. Para um request `multipart/form-data`, nada populou `req.body` nesse ponto (`express.json()` não trata multipart e o `multer` só roda depois, como middleware customizado) — o Zod veria um objeto sem `ID_CAMPANHA` e devolveria 400 em **todo** upload. A rota (`routes/OficinaRoute.ts:229-264`) omite `schemas` por completo e a validação acontece em `controllers/oficinaController.ts:154-164`, após o `multer`. Confirmado empiricamente: `__tests__/integration/oficinaImport.test.ts:30-44` passa com upload real via `supertest` (`.field` + `.attach`), e `:56-63` devolve 400 quando `ID_CAMPANHA` falta.

Custo colateral não registrado na nota: como `schemas.body` está ausente, `utils/routeDocumentation.ts:88-96` não emite `request.body` no OpenAPI — o endpoint `POST /oficina/import` fica documentado sem corpo de request, e `ImportOficinasBodySchema` (`schemas/oficina.ts:103`) não aparece no spec gerado. O contrato multipart existe só em prosa na `description` (`routes/OficinaRoute.ts:238-247`). Gap de documentação menor, não de comportamento.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ — nenhuma abstração especulativa; helpers são todos usados por `importarPlanilha` |
| Surgical changes | ✅ — 16 arquivos, todos previstos pelo design; `service/rotaService.ts` e `service/geolocationService.ts` intocados, como o design prometeu |
| No scope creep | ✅ — a única mudança fora do escopo estrito é `__tests__/helpers/mockRepo.ts:13` (`delete: jest.fn()`), exigida por T11; `utils/sqlCadastroEmpresa.ts:63` é só visibilidade |
| Didn't "improve" unrelated code | ✅ — o diff de `service/oficinaService.ts` é reindentação do ramo existente + o ramo novo; nenhuma cláusula do ramo antigo alterada (conferido linha a linha no diff) |
| Matches patterns | ✅ — `AppDataSourceSync.query` para SQL cru, repositório TypeORM para escrita simples, `createDocumentedRoute`, try/catch por handler, soft delete/timestamps na entidade nova, migration em `scripts/*.sql` |
| Would senior engineer approve? | ⚠️ — sim na estrutura, com duas ressalvas: ausência de try/catch por linha (Gap 3) e os casts de tipo do `UNION ALL` (Gap 4) |
| Tests map to ACs and are non-shallow | ⚠️ — 37 testes unitários + 7 de integração, todos rastreáveis a um AC/edge case/Done-when (nenhum teste órfão); mas as asserções de IMPORT-20 verificam a string do SQL, não o resultado |
| Spec-anchored outcome check | ⚠️ — 4 spec-precision gaps flagged (IMPORT-03 lista de colunas, IMPORT-04 teto de 5MB, IMPORT-14 metade lat/long, IMPORT-20 outcome) |
| Per-layer Coverage Expectation met | ⚠️ — domínio quase 1:1 com os ACs, exceto IMPORT-15; rota cobre happy + 400 (extensão, ID_CAMPANHA, arquivo, header) + 404 + 422, mas **não** o 400 de `LIMITE_LINHAS_EXCEDIDO` |
| Every test maps to a spec requirement | ✅ — nenhum teste não reivindicado |
| Documented guidelines followed | ✅ — nenhum `AGENTS.md`/`CONTRIBUTING.md` no repositório; a matriz de `tasks.md` foi seguida (padrão `visitaConfirmar.test.ts` de mock de service, nunca o de banco real de `__tests__/integration/oficinaService.test.ts`) |

---

## Gate Check

- **Type gate**: `npx tsc --noEmit` — 2 erros, **ambos pré-existentes e não relacionados**: `__tests__/unit/segmentacaoCampanhaPromotor.test.ts(2,42)` e `(4,32)`, `TS2307` para `../../utils/migrationRepository` e `../helpers/mockMigrationRepo`. Verificado, não assumido: `git ls-tree -r --name-only 28a72c0` mostra que o arquivo de teste já existia em `28a72c0` e que nenhum dos dois módulos existia lá; `git diff --stat 28a72c0..HEAD` confirma que esse arquivo de teste não foi tocado por esta feature. Zero erros novos.
- **Quick/Full gate**: `npm run test:unit`
- **Result**: 621 passed, 12 failed, 0 skipped, 633 total
- **Falhas**: 12, todas em `__tests__/unit/campanhaService.test.ts` + `__tests__/unit/campanhaServiceVisita.test.ts`, mais `__tests__/unit/segmentacaoCampanhaPromotor.test.ts` que não compila (0 testes contados). **Pré-existência provada empiricamente**, não assumida: worktree separado em `28a72c0` (`git worktree add --detach C:/tmp/obwb 28a72c0`, `node_modules` por junction) rodando as mesmas 3 suítes devolveu exatamente as mesmas 12 falhas, com nomes idênticos, e `28a72c0` inteiro fecha em 12 failed / 525 passed / 537 total.
- **Test count antes da feature (28a72c0)**: 537 (525 passed, 12 failed)
- **Test count depois (d0d37ae)**: 633 (621 passed, 12 failed)
- **Delta**: +96 testes, todos passando; zero testes removidos; nenhuma asserção pré-existente enfraquecida (o diff de `__tests__/unit/oficinaService.test.ts` só adiciona blocos; nenhuma linha de asserção existente foi alterada)
- **Integration (escopo restrito)**: `npx jest --testMatch "**/__tests__/integration/oficinaImport.test.ts"` — 7 passed, 7 total. O script completo `npm run test:integration` **não foi executado** e nenhum outro arquivo de `__tests__/integration/` foi rodado, porque `__tests__/integration/oficinaService.test.ts` e similares abrem conexão real com Postgres.
- **Não verificável nesta sessão**: execução do SQL do `UNION ALL` contra Postgres real; aplicação de `scripts/migration-oficina-importada.sql`; o limite de 5MB do `multer` fim-a-fim.

---

## Fix Plans

### Fix 1: IMPORT-15 / edge case "outro EMPRESA_SLUG" sem evidência — **Major**

- **Root cause**: `garantirVinculo` já filtra `findOne` por `{ ID_OFICINA, EMPRESA_SLUG }` (`service/oficinaImportService.ts:236-238`), então o comportamento existe; o que falta é a asserção. Evidence-or-zero conta como não coberto.
- **Fix task**: em `__tests__/unit/oficinaImportService.test.ts`, no bloco `garantirVinculo`, adicionar um teste em que `AppDataSourceSync.query` devolve `[]` (sem usuário) e `repo.findOne` devolve `null` para `empresa-y` enquanto um vínculo para `empresa-x` já existe; assere `resultado === "criado"`, que `repo.findOne` foi chamado com `{ ID_OFICINA: 1, EMPRESA_SLUG: "empresa-y" }`, e que `repo.create` recebeu `EMPRESA_SLUG: "empresa-y"`.
- **Done when**: IMPORT-15 e a edge case "oficina já pertence a outro `EMPRESA_SLUG`" passam a ter citação `file:line`.

### Fix 2: edge case "CEP vazio ou ausente" não atendida — **Major**

- **Root cause**: não há guarda de CEP vazio em `importarPlanilha`. Quando a oficina já tem `LATITUDE`/`LONGITUDE`, `garantirLatLong` retorna as coordenadas do banco em `service/oficinaImportService.ts:187-192` sem sequer olhar o CEP, e a linha é aceita — o spec manda rejeitá-la.
- **Fix task**: em `service/oficinaImportService.ts`, dentro do loop, rejeitar a linha com motivo `CEP_INVALIDO` antes de `buscarOuCriarOficina` quando `cep` for vazio/ausente após remover não-dígitos (economiza também 2 chamadas HTTP por linha no caso de CNPJ novo). Adicionar testes: (a) CEP vazio + oficina pré-existente com lat/long → linha rejeitada, sem vínculo criado; (b) CEP vazio + CNPJ novo → linha rejeitada, `oficinas_criadas === 0`, `repo.save` não chamado.
- **Done when**: as duas asserções existem e a edge case sai do estado ❌.

### Fix 3: nenhuma isolamento de falha de banco por linha — **Major**

- **Root cause**: o loop de `service/oficinaImportService.ts:313-383` não tem try/catch. Qualquer exceção em `buscarOuCriarOficina`, `garantirLatLong`, `repo.delete`, `garantirVinculo` ou `atribuirRota` propaga e o controller devolve 500, abortando o arquivo com escritas parciais já persistidas. Isso contraria diretamente a linha do `design.md`: "Falha de banco durante o processamento de uma linha específica | Linha marcada com erro genérico, loop continua (mesmo princípio de isolamento por linha) | 200 com a linha em `erros[]`". Caminhos concretos: violação do índice único `uq_oficina_importada_oficina_slug` sob dois imports concorrentes do mesmo CNPJ/slug (o padrão é read-then-write, não upsert), e `assignOficinaFromCommunitySignup` que lança `NOT_FOUND`/`UNPROCESSABLE` (`__tests__/unit/rotaService.test.ts:750,757`).
- **Fix task**: envolver o corpo de cada iteração em try/catch, empurrando `{ linha, cnpj, motivo: "ERRO_PROCESSAMENTO" }` para `resultado.erros` e seguindo o loop. Teste: mockar `AppDataSourceSync.query` para rejeitar na primeira linha e resolver na segunda; assere que a segunda linha é processada e a primeira aparece em `erros[]`.
- **Done when**: uma falha de banco em uma linha não aborta o arquivo, com asserção que prove isso.

### Fix 4: casts de tipo do `UNION ALL` (risco de 500 nas 3 rotas de comunidade) — **Major**

- **Root cause**: o `UNION ALL` casa `ce."numero"`/`"cep"`/`"telefone"` (tipos do DW conhecidos apenas por `entities/CadastroEmpresa.ts`, arquivo já provado incorreto para tipos) com colunas `varchar` de `MAIN_REGISTER.OFICINA`. Um mismatch numérico↔texto derruba as 3 queries por parse error, para todos os clientes.
- **Fix task**: em `service/oficinaService.ts`, castar explicitamente para `text` as colunas de texto de **ambos** os ramos do `UNION ALL` (`::text` em `ce."numero"`, `ce."cep"`, `ce."telefone"`, `ce."cnpj"`, `ce."bairro"`, `ce."cidade"`, `ce."estado"`, `ce."razao_social"` e nas correspondentes de `o."..."`), eliminando a dependência de tipos não verificáveis. Ajustar as asserções de string de query se necessário.
- **Done when**: nenhuma coluna do `UNION ALL` depende de resolução implícita de tipos entre `dw.cadastro_empresa` e `MAIN_REGISTER.OFICINA`.

### Fix 5: spec-precision gaps — **Minor**

- **Root cause**: asserções menos específicas do que o outcome do spec.
- **Fix task**: (a) em `__tests__/integration/oficinaImport.test.ts:94-103`, assere que o corpo do 400 de header contém a lista das 7 colunas esperadas (IMPORT-03); (b) adicionar teste de integração para `LIMITE_LINHAS_EXCEDIDO` → 400 (IMPORT-04); (c) adicionar teste em `importarPlanilha` para o caminho "já na comunidade" que assere `ja_na_comunidade === 1` e `repo.update` de lat/long chamado (IMPORT-14); (d) documentar o corpo multipart do endpoint no OpenAPI, já que `schemas.body` foi deliberadamente omitido (T12).
- **Done when**: os 4 gaps saem do estado ⚠️.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| IMPORT-01 | Implementing | ✅ Verified |
| IMPORT-02 | Implementing | ✅ Verified |
| IMPORT-03 | Implementing | ⚠️ Verified with spec-precision gap |
| IMPORT-04 | Implementing | ⚠️ Partially verified (teto de 5MB sem teste) |
| IMPORT-05 | Implementing | ✅ Verified |
| IMPORT-06 | Implementing | ✅ Verified |
| IMPORT-07 | Implementing | ✅ Verified |
| IMPORT-08 | Implementing | ✅ Verified |
| IMPORT-09 | Implementing | ✅ Verified |
| IMPORT-10 | Implementing | ✅ Verified |
| IMPORT-11 | Implementing | ✅ Verified |
| IMPORT-12 | Implementing | ✅ Verified (deviation reconciliada e confirmada por mutação) |
| IMPORT-13 | Implementing | ✅ Verified |
| IMPORT-14 | Implementing | ⚠️ Verified with spec-precision gap |
| IMPORT-15 | Implementing | ❌ Needs Fix (sem evidência) |
| IMPORT-16 | Implementing | ✅ Verified por reuso (evidência fora do diff range) |
| IMPORT-17 | Implementing | ✅ Verified por reuso (`STATUS = BACKLOG` só lido no código) |
| IMPORT-18 | Implementing | ✅ Verified por reuso |
| IMPORT-19 | Implementing | ✅ Verified por reuso |
| IMPORT-20 | Implementing | ⚠️ Verified with spec-precision gap (SQL não executado contra Postgres) |

---

## Summary

**Overall**: ❌ Not Ready — gaps rastreáveis, nenhum deles estrutural

**Spec-anchored check**: 19/20 ACs com citação; 14/20 casam exatamente o outcome do spec; 1 AC sem evidência (IMPORT-15); 4 spec-precision gaps
**Sensor**: 3/3 mutantes mortos, zero sobreviventes; árvore real verificadamente intocada
**Gate**: 621 passed / 12 failed (as mesmas 12 de `28a72c0`, provadas por worktree) / 633 total; +96 testes; `tsc` sem erros novos; integração restrita 7/7

**O que funciona**: validação estrutural do arquivo (extensão, cabeçalho case/acento-insensível e posicional, teto de linhas); resolução de `EMPRESA_SLUG` no servidor com 404/422 corretos; dedup por CNPJ reusando a mesma expressão SQL (`cnpjIntDaOficina`) do resto do sistema; criação com `ORIGEM = "IMPORTACAO_PLANILHA"`; geocodificação apenas quando falta lat/long, com rollback comprovado da oficina recém-criada quando falha; vínculo idempotente por `(ID_OFICINA, EMPRESA_SLUG)` cobrindo tanto `USUARIO_COMMUNITY` quanto `OFICINA_IMPORTADA`; isolamento por linha para erros de validação e geocodificação; reuso literal de `assignOficinaFromCommunitySignup` (arquivo intocado no diff); as 3 queries de comunidade estendidas com no-op verificado para clientes sem oficina importada.

**Issues found (ranqueados)**:
1. IMPORT-15 e a edge case "outro `EMPRESA_SLUG`" sem nenhuma evidência de teste — Fix 1
2. Edge case "CEP vazio ou ausente" não atendida: oficina pré-existente com lat/long e CEP vazio é aceita em vez de rejeitada — Fix 2
3. Loop sem try/catch: uma falha de banco em uma linha aborta o arquivo com 500 e escritas parciais, contra o `design.md` — Fix 3
4. `UNION ALL` depende de resolução implícita de tipos em 10 colunas cujos tipos reais no DW são desconhecidos; um mismatch derruba as 3 rotas de comunidade para todos os clientes (o risco de lat/long que foi sinalizado é, na verdade, o menor deles) — Fix 4
5. 4 spec-precision gaps (lista de colunas no 400, teto de 5MB, metade lat/long de IMPORT-14, outcome de IMPORT-20) — Fix 5

**Next steps**: rotear Fix 1 a Fix 5 como fix tasks (Fix 1, 2 e 5 são só teste/guarda pequena; Fix 3 e 4 mexem em `service/`), depois re-verificar. Independente disso, `scripts/migration-oficina-importada.sql` continua sendo um passo manual do DBA e o SQL do `UNION ALL` precisa de uma execução real em ambiente com banco — nenhum dos dois é executável nesta sessão.
