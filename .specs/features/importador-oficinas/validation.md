# Importador de Oficinas Validation

## Validation: Importador de Oficinas — FAIL ❌ (iteração 2)

**Date**: 2026-09-09
**Spec**: `.specs/features/importador-oficinas/spec.md`
**Diff range desta re-verificação**: `d0d37ae..a0a0edc` (fix-round 1 — 4 commits) sobre a base já revisada `28a72c0..d0d37ae`
**Verifier**: independent sub-agent (author ≠ verifier), sessão nova sem memória da iteração 1, read-only sobre implementação e testes
**DB access**: nenhum. Nenhum banco real foi contatado. `npm run test:integration` (script completo) **não** foi executado; nenhum arquivo de `__tests__/integration/` além de `oficinaImport.test.ts` foi rodado; `scripts/migration-oficina-importada.sql` **não** foi executado.

> **Este relatório substitui integralmente a versão anterior.** A versão anterior (iteração 1, veredito FAIL com 5 gaps ranqueados) cobria o range `28a72c0..d0d37ae` e está preservada no histórico git no commit `a0a0edc` (`.specs/features/importador-oficinas/validation.md`). Todas as tabelas abaixo foram re-derivadas do zero contra `spec.md` — nenhuma linha foi copiada do relatório anterior, e duas citações dele foram corrigidas (ver "Correções ao relatório da iteração 1").

---

## Veredito curto

Os **5 gaps ranqueados da iteração 1 estão todos genuinamente fechados** — confirmado lendo o código e os testes novos, e provado empiricamente por 3 mutações que morrem exatamente nos testes novos. O veredito continua FAIL por **2 itens residuais** que a iteração 1 sinalizou (⚠️) mas nunca roteou como fix task, e que continuam abertos: metade da AC IMPORT-04 (teto de 5MB) sem nenhuma citação de teste, e os casts `::text` do fix-round sem nenhuma discriminação de teste (mutante sobreviveu).

---

## Re-check dos 5 gaps da iteração 1

| # | Gap da iteração 1 | Correção alegada | Verificação independente | Status |
|---|---|---|---|---|
| 1 | Edge case "CEP vazio/ausente": oficina pré-existente com lat/long + CEP em branco era **aceita** em vez de rejeitada | Guarda `CEP_INVALIDO` antes de `buscarOuCriarOficina`, independente de coordenadas | **FECHADO.** `service/oficinaImportService.ts:332-336` — `const cepLimpo = (cep ?? "").replace(/\D/g, ""); if (!cepLimpo) { push CEP_INVALIDO; continue; }`, posicionado **antes** de `buscarOuCriarOficina` (:349) e antes de qualquer `AppDataSourceSync.query`. Os **dois** casos estão testados de fato, não só "o arquivo mudou": pré-existente em `__tests__/unit/oficinaImportService.test.ts:566-579` e CNPJ novo em `:581-592`. Nota de leitura própria: no teste `:566` os mocks de "CNPJ encontrado"/"já tem lat/long" ficam **inertes** — a guarda curto-circuita antes do lookup. Isso é consequência correta da forma do fix (a pré-existência passa a ser irrelevante por construção), e as duas asserções de outcome (`erros`, `oficinas_vinculadas_existentes === 0`, `save` não chamado) são load-bearing: a mutação M1 mata os dois testes. | ✅ Fechado |
| 2 | Loop sem try/catch — falha de banco numa linha abortava o arquivo inteiro | Corpo da iteração em try/catch, `ERRO_PROCESSAMENTO`, loop continua | **FECHADO.** O `try` abre em `service/oficinaImportService.ts:348` e o `catch` em `:390`, envolvendo **todos** os passos que podem lançar: `buscarOuCriarOficina` (:349), `garantirLatLong` (:354), o `delete` compensatório (:362), `garantirVinculo` (:378) e `atribuirRota` (:388) — verificado linha a linha, nenhum deles ficou fora. Teste que prova a continuação: `__tests__/unit/oficinaImportService.test.ts:594-610` — a 1ª linha rejeita em `AppDataSourceSync.query` (`mockRejectedValueOnce`), e as asserções são `erros === [{ linha: 2, ..., motivo: "ERRO_PROCESSAMENTO" }]` (:606) **e** `oficinas_criadas === 1` (:609) — a segunda linha foi processada até o fim. Confirmado pela mutação M2. | ✅ Fechado |
| 3 | `UNION ALL`: 10 colunas de texto com resolução implícita de tipo entre `dw.cadastro_empresa` e `MAIN_REGISTER.OFICINA` | `::text` nos dois ramos de `getComunityNearbyOficinas` e `getCommunityOficinas`; `countCommunityOficinas` sem risco | **FECHADO (SQL lido coluna a coluna, não assumido).** `service/oficinaService.ts:125-133` e `:168-176` (nearby), `:340-348` e `:368-376` (listagem): as 9 colunas de texto de cada ramo (`razao_social`/`NOME_FANTASIA`, `CONCAT(logradouro,' ',rua)`/`ENDERECO`, `bairro`, `cidade`, `estado`, `numero`, `cep`, `cnpj`, `telefone`) recebem `::text` nos **dois** lados — nenhuma coluna de texto ficou sem cast, e o cast está no lugar certo (na expressão projetada, antes do `AS`, inclusive no `CONCAT(...)::text`). A alegação sobre `countCommunityOficinas` foi **verificada lendo a query**, não aceita: `:408-435` projeta exclusivamente `us."ID_OFICINA"` e `oi."ID_OFICINA"` nos dois ramos (ambos `integer`), sem nenhuma coluna de texto — a alegação procede. Residual conhecido e aceito: `ce."latitude"`/`ce."longitude"` seguem sem cast contra `o."LATITUDE"::double precision`; isso não é ambiguidade real porque o ramo pré-existente já faz `radians(ce."latitude")` (`:136`), o que só compila se a coluna já for numérica — e `numeric ∪ float8` resolve para `float8`. | ✅ Fechado (ver ranked gap 2 quanto à **discriminação de teste** desse fix) |
| 4 | IMPORT-15 (oficina em mais de um `EMPRESA_SLUG`) com zero evidência de teste | Teste novo no describe `garantirVinculo` | **FECHADO.** `__tests__/unit/oficinaImportService.test.ts:318-337`: exercita de fato dois `EMPRESA_SLUG` distintos sobre o **mesmo** `ID_OFICINA` (mock de `findOne` que devolve um vínculo existente para `"empresa-x"` e `null` para `"empresa-y"`), chama `garantirVinculo(1, "empresa-y", 20)` e assere que um segundo vínculo **independente** é criado: `resultado === "criado"` (:329), `findOne` chamado com `{ ID_OFICINA: 1, EMPRESA_SLUG: "empresa-y" }` (:330) e `create` chamado com `EMPRESA_SLUG: "empresa-y"` (:331-336) — criação nova, não reuso nem sobrescrita do vínculo de `empresa-x`. Discriminação provada: a mutação M3 (remover `EMPRESA_SLUG` do `where` do `findOne`) mata **exatamente e apenas** este teste — ou seja, antes deste teste nada no repositório detectaria a quebra de IMPORT-15. Ressalva menor: o teste não assere explicitamente que o vínculo de `empresa-x` ficou intacto (não há `update`/`delete` no caminho, então não há como afetá-lo). | ✅ Fechado |
| 5 | IMPORT-14 metade "apenas preencher lat/long" sem asserção; IMPORT-03/IMPORT-04 sem asserção precisa | 1 teste de `importarPlanilha` + 2 testes de integração com o corpo exato | **FECHADO em 3 de 4 sub-itens.** (a) IMPORT-14: `__tests__/unit/oficinaImportService.test.ts:612-626` — oficina já vinculada via `USUARIO_COMMUNITY` e **sem** lat/long; assere `oficinaRepo.update` chamado com `(33, { LATITUDE: "-23.55", LONGITUDE: "-46.63" })` (:623), `ja_na_comunidade === 1` (:624) e `oficinaImportadaRepo.save` **não** chamado (:625) — é exatamente o outcome do spec ("não cria novo vínculo, apenas preenche lat/long"), não um status code genérico. (b) IMPORT-03: `__tests__/integration/oficinaImport.test.ts:102-106` — `status === 400` **e** `response.body.message` contendo a lista literal `"NOME OFICINA; CNPJ; CEP; ENDEREÇO; NUMERO; ESTADO; CIDADE"`, que casa com `controllers/oficinaController.ts:189`. (c) IMPORT-04 linhas: `__tests__/integration/oficinaImport.test.ts:108-118` — `status === 400` e mensagem contendo `"5.000 linhas"`, casando `controllers/oficinaController.ts:193`. (d) **NÃO fechado**: o corpo multipart no OpenAPI segue não documentado — declarado explicitamente como não-corrigido em `tasks.md` (fix-round 1) e aceito aqui como gap de documentação, não de comportamento. | ✅ Fechado (com (d) aceito como deferido) |

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 `cnpjIntDaOficina` export | ✅ Done | `utils/sqlCadastroEmpresa.ts:63` — intocado no fix-round |
| T2 `OficinaImportada` entity | ✅ Done | `entities/OficinaImportada.ts` — intocado no fix-round |
| T3 migration script | ✅ Done | `scripts/migration-oficina-importada.sql` — intocado; nunca executado |
| T4 upload middleware | ✅ Done | `middlewares/uploadPlanilha.ts:12-27`; erro do `multer` → 400 em `routes/OficinaRoute.ts:26-35` |
| T5 parse + header | ✅ Done | `service/oficinaImportService.ts:64-92` |
| T6 CNPJ normalize + dedupe | ✅ Done | `service/oficinaImportService.ts:110-135` |
| T7 dedupe/create oficina | ✅ Done | `service/oficinaImportService.ts:143-172` |
| T8 geocode lat/long | ✅ Done | `service/oficinaImportService.ts:180-207` |
| T9 link without user | ✅ Done | `service/oficinaImportService.ts:215-253` — **promovido de ⚠️ Partial**: IMPORT-15 agora tem evidência (`__tests__/unit/oficinaImportService.test.ts:318-337`) |
| T10 route assignment | ✅ Done | `service/oficinaImportService.ts:262-267`; `service/rotaService.ts` verificadamente intocado em `28a72c0..HEAD` |
| T11 orchestration | ✅ Done | `service/oficinaImportService.ts:282-403` — **promovido de ⚠️ Partial**: isolamento por linha para falha de banco implementado (`:348`/`:390`), como o `design.md` já prometia |
| T12 endpoint | ✅ Done | `controllers/oficinaController.ts:152-201`, `routes/OficinaRoute.ts:26-35,229-264`, `schemas/oficina.ts:96-123` |
| T13 community-query extension | ✅ Done | `service/oficinaService.ts` — 3 métodos; casts `::text` aplicados nos 2 ramos das 2 queries com colunas de texto |
| Fix Round 1 (4 commits) | ⚠️ Rastreabilidade | Os fixes estão no código, mas `tasks.md:544-545` atribui os testes de IMPORT-15/IMPORT-14 a um commit `test(oficina-import): cover multi-EMPRESA_SLUG linking and lat/long fill on existing link` que **não existe no histórico** — eles foram dobrados em `6151976`. Ver observação não-bloqueante O3. |

---

## Spec-Anchored Acceptance Criteria (re-derivada do zero)

### Story P1-A — Upload e validação estrutural

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| IMPORT-01 header exato (case/acento-insensível, mesma ordem) → prossegue com as linhas | processamento das linhas ocorre | `__tests__/unit/oficinaImportService.test.ts:65` - `expect(() => OficinaImportService.validarCabecalho([cabecalhoVariante])).not.toThrow()`; `:489` - `expect(resultado).toEqual({ total_linhas: 1, oficinas_criadas: 1, ..., rotas_criadas: 1, erros: [] })` | ✅ PASS |
| IMPORT-02 arquivo não `.xlsx`/`.csv` → 400, nada processado | HTTP 400 + zero processamento | `__tests__/integration/oficinaImport.test.ts:52` - `expect(response.status).toBe(400)`; `:53` - `expect(importarPlanilhaMock).not.toHaveBeenCalled()`; `__tests__/unit/uploadPlanilha.test.ts:23` - `expect(isPlanilhaValida("oficinas.txt")).toBe(false)` | ✅ PASS |
| IMPORT-03 cabeçalho ≠ 7 colunas/ordem → 400 **com a lista de colunas esperada**, nenhuma escrita | HTTP 400 + corpo contendo a lista de colunas + zero escrita | `__tests__/unit/oficinaImportService.test.ts:70` - `.toThrow("HEADER_INVALIDO")` (fora de ordem), `:75` (faltando), `:82` (extra); `__tests__/integration/oficinaImport.test.ts:102` - `expect(response.status).toBe(400)`; `:103` - `expect(response.body.message).toContain("NOME OFICINA; CNPJ; CEP; ENDEREÇO; NUMERO; ESTADO; CIDADE")` | ✅ PASS — gap da iteração 1 fechado; a metade "nenhuma escrita" segue garantida por ordenação de código (`service/oficinaImportService.ts:296-298`, validação antes do loop) |
| IMPORT-04 > 5MB **ou** > 5.000 linhas → 400, nada processado | HTTP 400 nos **dois** casos | linhas: `__tests__/unit/oficinaImportService.test.ts:100` - `.toThrow("LIMITE_LINHAS_EXCEDIDO")` **e** `__tests__/integration/oficinaImport.test.ts:116-117` - `expect(response.status).toBe(400)` / `expect(response.body.message).toContain("5.000 linhas")`. **5MB: sem citação** — só configuração (`middlewares/uploadPlanilha.ts:19` `limits: { fileSize: TAMANHO_MAXIMO_BYTES }`) e o mapeamento genérico para 400 (`routes/OficinaRoute.ts:26-35`) | ⚠️ Parcial → **ranked gap 1**: metade da AC sem nenhuma asserção, e é testável sem banco |
| IMPORT-05 `ID_CAMPANHA` inexistente/soft-deleted → 404, arquivo não processado | HTTP 404 + arquivo nunca lido | `__tests__/unit/oficinaImportService.test.ts:442` - `.rejects.toThrow("CAMPANHA_NAO_ENCONTRADA")`; `:445` - `expect(AppDataSourceSync.query).not.toHaveBeenCalled()`; `__tests__/integration/oficinaImport.test.ts:80` - `expect(response.status).toBe(404)` | ✅ PASS |
| IMPORT-06 campanha sem `EMPRESA_SLUG` → 422, arquivo não processado | HTTP 422 | `__tests__/unit/oficinaImportService.test.ts:455` - `.rejects.toThrow("CAMPANHA_SEM_EMPRESA_SLUG")`; `__tests__/integration/oficinaImport.test.ts:91` - `expect(response.status).toBe(422)` | ✅ PASS |

### Story P1-B — Deduplicação e criação por CNPJ

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| IMPORT-07 CNPJ existente → reusa `ID_OFICINA`, não sobrescreve campos | mesmo `ID_OFICINA`, zero escrita na oficina | `__tests__/unit/oficinaImportService.test.ts:176` - `expect(resultado).toEqual({ ID_OFICINA: 42, criada: false })`; `:177-178` - `expect(repo.create).not.toHaveBeenCalled()` / `expect(repo.save).not.toHaveBeenCalled()` | ✅ PASS |
| IMPORT-08 CNPJ novo → cria oficina com os 7 campos + `ORIGEM = "IMPORTACAO_PLANILHA"` | os 7 campos da planilha e `ORIGEM` exato | `__tests__/unit/oficinaImportService.test.ts:191-200` - `expect(repo.create).toHaveBeenCalledWith({ NOME_FANTASIA: "Oficina Teste", CNPJ: "12.345.678/0001-90", CEP: "01310100", ENDERECO: "Rua Teste", NUMERO: "100", ESTADO: "SP", CIDADE: "Sao Paulo", ORIGEM: "IMPORTACAO_PLANILHA" })`; `:189` - `toEqual({ ID_OFICINA: 99, criada: true })` | ✅ PASS |
| IMPORT-09 CNPJ ≠ 14 dígitos → rejeita só a linha, reporta motivo, segue o arquivo | linha isolada com motivo; demais processadas | `__tests__/unit/oficinaImportService.test.ts:512` - `expect(resultado.erros).toEqual([{ linha: 2, cnpj: "123", motivo: "CNPJ_INVALIDO" }])`; `:513` - `expect(resultado.oficinas_criadas).toBe(1)` | ✅ PASS |
| IMPORT-10 CNPJ repetido no arquivo → 1ª processada, seguintes com "CNPJ duplicado no arquivo" | 1ª processada, 2ª rejeitada com motivo de duplicidade | `__tests__/unit/oficinaImportService.test.ts:527-530` - `expect(resultado.erros).toEqual([{ linha: 3, cnpj: "12345678000190", motivo: "CNPJ_DUPLICADO_NO_ARQUIVO" }])`; `:526` - `expect(resultado.oficinas_criadas).toBe(1)`; `:143-145` - `expect(resultado.has(0)).toBe(false)` / `expect(resultado.has(2)).toBe(true)` | ✅ PASS (o motivo é o código `CNPJ_DUPLICADO_NO_ARQUIVO`, não a string literal do spec — equivalente semântico, não exposto como texto ao usuário final) |

### Story P1-C — Geocodificação e vínculo sem usuário

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| IMPORT-11 oficina sem lat/long → geocodifica CEP e preenche `LATITUDE`/`LONGITUDE` | UPDATE apenas de lat/long com o valor geocodificado | `__tests__/unit/oficinaImportService.test.ts:238` - `expect(repo.update).toHaveBeenCalledWith(1, { LATITUDE: "-23.55", LONGITUDE: "-46.63" })`; `:237` - `expect(getLatLongByCep).toHaveBeenCalledWith("01310100")`; caso "já tem": `:221-222` - `expect(getLatLongByCep).not.toHaveBeenCalled()` / `expect(repo.update).not.toHaveBeenCalled()` | ✅ PASS |
| IMPORT-12 geocodificação falha → rejeita a linha e **SHALL NOT criar ou vincular** a oficina | nenhuma oficina persistida sem lat/long; linha reportada | `__tests__/unit/oficinaImportService.test.ts:542` - `expect(oficinaRepo.delete).toHaveBeenCalledWith(77)`; `:543` - `expect(resultado.oficinas_criadas).toBe(0)`; `:544-547` - `erros === [{ linha: 2, cnpj: "12345678000190", motivo: "GEOCODIFICACAO_FALHOU" }]`; caso pré-existente: `:558-560` - `delete`/`save` não chamados e `oficinas_vinculadas_existentes === 0`; `:253` - `expect(repo.update).not.toHaveBeenCalled()` | ✅ PASS — e o `delete` compensatório agora está **dentro** do try/catch (`service/oficinaImportService.ts:362`), fechando a ressalva da iteração 1 de que uma falha no próprio delete abortaria o arquivo |
| IMPORT-13 oficina ainda não vinculada ao `EMPRESA_SLUG` → cria vínculo em `OFICINA_IMPORTADA` | um registro com `ID_OFICINA`+`EMPRESA_SLUG`(+`ID_CAMPANHA`,`CREATED_BY`) | `__tests__/unit/oficinaImportService.test.ts:296-301` - `expect(repo.create).toHaveBeenCalledWith({ ID_OFICINA: 1, EMPRESA_SLUG: "empresa-x", ID_CAMPANHA: 10, CREATED_BY: 7 })`; `:294` - `expect(resultado).toBe("criado")`; `:302` - `expect(repo.save).toHaveBeenCalled()` | ✅ PASS |
| IMPORT-14 já vinculada (com ou sem usuário) → **não** cria novo vínculo, só preenche lat/long faltante | zero novo vínculo; lat/long preenchido se faltava | metade "não duplica": `:269-271` (`ja_vinculada` via `USUARIO_COMMUNITY`, `findOne`/`save` não chamados), `:282-283` (via `OFICINA_IMPORTADA`), `:314-315` (reimportação). Metade "preenche lat/long" (**nova**): `:623` - `expect(oficinaRepo.update).toHaveBeenCalledWith(33, { LATITUDE: "-23.55", LONGITUDE: "-46.63" })`; `:624` - `expect(resultado.ja_na_comunidade).toBe(1)`; `:625` - `expect(oficinaImportadaRepo.save).not.toHaveBeenCalled()` | ✅ PASS — gap da iteração 1 fechado; as duas metades agora têm asserção própria |
| IMPORT-15 mesma oficina física pode estar vinculada a **mais de um** `EMPRESA_SLUG` simultaneamente | dois vínculos coexistem para slugs distintos | `__tests__/unit/oficinaImportService.test.ts:329` - `expect(resultado).toBe("criado")`; `:330` - `expect(repo.findOne).toHaveBeenCalledWith({ where: { ID_OFICINA: 1, EMPRESA_SLUG: "empresa-y" } })`; `:331-336` - `expect(repo.create).toHaveBeenCalledWith({ ID_OFICINA: 1, EMPRESA_SLUG: "empresa-y", ID_CAMPANHA: 20, CREATED_BY: undefined })` — com o mock de `findOne` devolvendo um vínculo já existente para `"empresa-x"` no mesmo `ID_OFICINA: 1` | ✅ PASS — gap da iteração 1 fechado; discriminação confirmada pela mutação M3 |

### Story P1-D — Atribuição de rota do promotor

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| IMPORT-16 busca o promotor de menor distância Haversine dentro do raio (`RAIO`, default 20km) | promotor mais próximo dentro do raio | dentro do diff: `__tests__/unit/oficinaImportService.test.ts:355` - `expect(RotaService.assignOficinaFromCommunitySignup).toHaveBeenCalledWith(1, "empresa-x")` (pass-through). Comportamento: `__tests__/unit/rotaService.test.ts:717` - `expect(result.atribuicoes[0].promotor!.ID_PROMOTOR).toBe(9)` (**fora do diff range**; `service/rotaService.ts` verificadamente intocado) | ✅ PASS por reuso |
| IMPORT-17 promotor elegível → cria `ROTA_PROMOTOR` com `STATUS = BACKLOG` | rota criada com STATUS BACKLOG | dentro do diff: `__tests__/unit/oficinaImportService.test.ts:380` - `expect(resultado.resumo.atribuidas).toBe(1)`. Comportamento: `__tests__/unit/rotaService.test.ts:694` - `expect(result.atribuicoes[0].status).toBe('atribuida')`, `:697` - `expect(result.resumo.atribuidas).toBe(1)`. `STATUS = BACKLOG`: vem do default de coluna em `entities/RotaPromotor.ts:47` (`default: StatusRota.BACKLOG`), pois `assignOficinaFromCommunitySignup` delega a `createRotas` (`service/rotaService.ts:866`) que não passa `STATUS` (`:81-86`); asserção existente em `__tests__/integration/rotaService.test.ts:57` - `expect(rota.STATUS).toBe(StatusRota.BACKLOG)` | ⚠️ PASS com ressalva — a única asserção de `STATUS = BACKLOG` está num teste de integração com banco real, **não executável nesta sessão** (restrição absoluta) e fora do diff range |
| IMPORT-18 nenhum promotor no raio → nenhuma rota, reporta `sem_promotor_disponivel`, sem erro | sem rota, status `sem_promotor_disponivel`, HTTP 200 | dentro do diff: `__tests__/unit/oficinaImportService.test.ts:405` - `expect(resultado.resumo.sem_promotor_disponivel).toBe(1)`. Comportamento: `__tests__/unit/rotaService.test.ts:676` - `expect(result.atribuicoes[0].status).toBe('sem_promotor_disponivel')` (fora do range) | ✅ PASS |
| IMPORT-19 oficina já com rota ativa na campanha → não cria nova rota | idempotência | `__tests__/unit/rotaService.test.ts:662` - `expect(result.atribuicoes[0].status).toBe('ja_atribuida')`; `:663` - `expect(result.resumo.ja_atribuida).toBe(1)` (fora do range; T10 declara explicitamente não re-testar) | ✅ PASS por reuso |
| IMPORT-20 as consultas de "oficinas da comunidade" passam a incluir `OFICINA_IMPORTADA` | as 3 queries consideram a tabela nova | `__tests__/unit/oficinaService.test.ts:91` - `expect(AppDataSourceSync.query).toHaveBeenCalledWith(expect.stringContaining('OFICINA_IMPORTADA'), ['empresa-test', -23.55, -46.63, 20])`; `:117` - idem para `getCommunityOficinas` com `['empresa-test']`; `:158` - idem para `countCommunityOficinas` | ⚠️ Spec-precision gap (inalterado) — a asserção prova que o SQL **menciona** a tabela, não que o resultado inclui as oficinas importadas; provar o outcome exige Postgres real (proibido nesta sessão) |

**Status**: ❌ Gaps present (1 AC com metade sem evidência: IMPORT-04) + ⚠️ 2 spec-precision gaps (IMPORT-17 asserção só em teste DB-dependente, IMPORT-20 outcome não executável).

**Contagem**: 20/20 ACs com citação `file:line` (era 19/20). 17/20 com asserção que casa exatamente o outcome do spec (era 14/20). 0/20 sem qualquer evidência (era 1/20).

---

## Edge Cases

- [x] Arquivo não `.xlsx`/`.csv` → 400 sem processar — `__tests__/integration/oficinaImport.test.ts:52-53`
- [x] Cabeçalho válido e zero linhas de dados → 200 com `total_linhas: 0`, nenhuma criação — `__tests__/unit/oficinaImportService.test.ts:465-472` - `expect(resultado).toEqual({ total_linhas: 0, oficinas_criadas: 0, oficinas_vinculadas_existentes: 0, ja_na_comunidade: 0, rotas_criadas: 0, erros: [] })`
- [x] `ID_CAMPANHA` inexistente/soft-deleted → 404 — `__tests__/integration/oficinaImport.test.ts:80`
- [x] Campanha existe sem `EMPRESA_SLUG` → 422 — `__tests__/integration/oficinaImport.test.ts:91`
- [x] **CEP vazio ou ausente → linha rejeitada — AGORA ATENDIDO** (era ❌ na iteração 1). Guarda em `service/oficinaImportService.ts:332-336`; testes `__tests__/unit/oficinaImportService.test.ts:574-578` (oficina pré-existente com lat/long) e `:586-591` (CNPJ novo, `AppDataSourceSync.query` nunca chamado — economiza também as 2 chamadas HTTP de geocodificação por linha)
- [x] Duas linhas com o mesmo CNPJ → 2ª rejeitada como duplicada — `__tests__/unit/oficinaImportService.test.ts:527-530`
- [x] **Oficina já pertencente a outro `EMPRESA_SLUG` → cria vínculo adicional sem afetar o existente — AGORA ATENDIDO** (era ❌ na iteração 1) — `__tests__/unit/oficinaImportService.test.ts:318-337`
- [x] Nenhum promotor com coordenadas → todas reportadas como `sem_promotor_disponivel`, sem erro — `__tests__/unit/oficinaImportService.test.ts:405` (pass-through) + `__tests__/unit/rotaService.test.ts:676` (fora do range)
- [x] **(novo, do `design.md`) Falha de banco numa linha → linha com erro genérico, loop continua** — `__tests__/unit/oficinaImportService.test.ts:594-610`

Todos os 8 edge cases do `spec.md` estão agora atendidos com citação (eram 6/8).

---

## Discrimination Sensor (mutações NOVAS, focadas no código do fix-round)

Isolamento: worktree temporário `git worktree add --detach C:/tmp/obws2 HEAD` (nunca `git stash`), `node_modules` por junction para não instalar dependências; cada mutação revertida com `git checkout --` no scratch antes da seguinte. Baseline `git status --porcelain` da árvore real **vazio antes e depois**; `git worktree list` de volta a uma única entrada; `node_modules` intacto (529 entradas).

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ----------- | ------- |
| M1 | `service/oficinaImportService.ts:333` | Guarda de CEP em branco invertida: `if (!cepLimpo)` → `if (cepLimpo)` | ✅ Killed — 9 testes falharam, incluindo **exatamente** os dois novos: `should reject a row with a blank CEP even when the oficina already has lat/long` e `... for a brand-new CNPJ without creating anything` |
| M2 | `service/oficinaImportService.ts:390-399` | Isolamento por linha removido: corpo do `catch` substituído por `throw erroLinha` (comportamento pré-fix) | ✅ Killed — 1 teste falhou, **exatamente** `should isolate an unexpected processing error on one row without aborting the rest of the file` |
| M3 | `service/oficinaImportService.ts:236-238` | `EMPRESA_SLUG` removido do lookup de vínculo: `where: { ID_OFICINA, EMPRESA_SLUG }` → `where: { ID_OFICINA }` (quebra IMPORT-15) | ✅ Killed — 1 teste falhou, **exatamente** `should create a separate link for a different empresaSlug on the same oficina (IMPORT-15)` |
| M4 | `service/oficinaService.ts:130,173` | Um dos casts do fix-round removido dos dois ramos: `ce."numero"::text`/`o."NUMERO"::text` → sem cast | ❌ **Survived** — `oficinaService.test.ts` 14/14 passed, `promotorService.test.ts` 27/27 passed (as únicas suítes DB-free que tocam essas queries; `__tests__/integration/oficinaService.test.ts` usa banco real e não foi executado) → **ranked gap 2** |

**Sensor depth**: lightweight (4 mutações, todas em código introduzido pelo fix-round `d0d37ae..a0a0edc`)
**Result**: 3/4 killed, 1 survived — ❌

Leitura do M4: não é uma asserção fraca por descuido, e sim a ausência estrutural de qualquer mecanismo capaz de observar tipos de SQL numa suíte sem banco. É a mesma limitação já registrada como spec-precision gap de IMPORT-20. Mitigação barata e no estilo já usado pelo repositório para essas queries: acrescentar `expect.stringContaining('::text')` às asserções de `__tests__/unit/oficinaService.test.ts:91,117` — o que ao menos travaria uma regressão silenciosa do fix.

---

## Code Quality (escopo: diff `d0d37ae..a0a0edc`)

| Check | Pass? |
| ----- | ----- |
| No features beyond what was asked | ✅ — os 3 commits de código/teste endereçam exatamente 5 dos 5 gaps ranqueados; nada além |
| No abstractions for single-use code | ✅ — `cepLimpo` é uma const local, não um helper novo; nenhum wrapper/abstração criada |
| No unnecessary "flexibility" added | ✅ — `motivo` novos (`CEP_INVALIDO`, `ERRO_PROCESSAMENTO`) cabem em `ErroLinhaImportSchema` (`schemas/oficina.ts:107-111`, `motivo: z.string()`) sem mudança de contrato |
| Only touched files required for task | ✅ — 4 arquivos de código/teste (`service/oficinaImportService.ts`, `service/oficinaService.ts`, 2 arquivos de teste) + 4 de spec/docs. Nada mais |
| Didn't "improve" unrelated code | ✅ — o diff de `service/oficinaService.ts` é **só** `::text` em 36 linhas de projeção; nenhuma cláusula `WHERE`/`JOIN`/`ORDER BY` alterada (conferido linha a linha). O diff de `service/oficinaImportService.ts` é a guarda de CEP + reindentação do corpo do loop para dentro do `try` — nenhuma lógica do corpo alterada |
| Matches existing patterns/style | ✅ — `replace(/\D/g, "")` é a mesma normalização usada em `utils/sqlCadastroEmpresa.ts`; `try/catch` por unidade de trabalho é o padrão dos controllers/services do repo; comentário explicando o `catch` em português, como o resto do arquivo |
| Would senior engineer approve? | ⚠️ — sim na forma; duas ressalvas menores: o `catch {}` descarta o erro sem `console.error` (todo o resto do repo loga antes de degradar — ex. `service/oficinaService.ts:213,392,442`), o que apaga o diagnóstico de uma falha de banco em produção; e o double-count de contadores (observação O2) |
| Tests map to ACs and are non-shallow | ✅ — os 5 testes unitários e 2 de integração novos referenciam ACs explicitamente (dois deles com o ID no nome do teste); 3 de 4 mutações do sensor foram mortas por **exatamente** o teste novo correspondente, o que é a prova mais forte de non-shallowness |
| Spec-anchored outcome check | ⚠️ — 17/20 casam exatamente; 2 spec-precision gaps (IMPORT-17, IMPORT-20) + 1 metade sem evidência (IMPORT-04) |
| Per-layer Coverage Expectation met | ⚠️ — domínio agora 1:1 com os ACs (IMPORT-15 fechado); rota cobre happy + 400 (extensão, `ID_CAMPANHA`, arquivo ausente, header com lista de colunas, limite de linhas) + 404 + 422; **falta** o 400 de tamanho (5MB), que a matriz de `tasks.md` prometia cobrir "indiretamente pelo teste de integração do endpoint" |
| Every test maps to a spec requirement | ✅ — nenhum teste órfão; os 7 testes novos mapeiam a IMPORT-03, IMPORT-04(linhas), IMPORT-14, IMPORT-15 e ao edge case de CEP vazio + à linha de isolamento por linha do `design.md` |
| Documented guidelines followed | ✅ — nenhum `AGENTS.md`/`CONTRIBUTING.md` no repositório; a Test Coverage Matrix de `tasks.md` foi seguida (service mockado via `jest.mock`, nunca o padrão de banco real de `__tests__/integration/oficinaService.test.ts`) |

---

## Gate Check

- **Type gate**: `npx tsc --noEmit` — 2 erros, **ambos pré-existentes e não relacionados**: `__tests__/unit/segmentacaoCampanhaPromotor.test.ts(2,42)` e `(4,32)`, `TS2307` para `../../utils/migrationRepository` e `../helpers/mockMigrationRepo`. Verificado (não assumido) nesta sessão: `git cat-file -e 28a72c0:__tests__/unit/segmentacaoCampanhaPromotor.test.ts` confirma que o arquivo já existia na base; `git ls-tree -r --name-only HEAD | grep migrationRepo` devolve vazio (os módulos nunca existiram); `git diff --stat d0d37ae..HEAD -- <esse arquivo>` é vazio (intocado pelo fix-round). **Zero erros novos.**
- **Quick/Full gate**: `npm run test:unit`
- **Result**: **626 passed, 12 failed, 0 skipped, 638 total** (37 suítes: 34 pass, 3 fail)
- **Falhas**: as mesmas 3 suítes da iteração 1 — `__tests__/unit/campanhaService.test.ts`, `__tests__/unit/campanhaServiceVisita.test.ts` (12 testes) e `__tests__/unit/segmentacaoCampanhaPromotor.test.ts` (não compila, 0 testes contados). Todas as três **verificadamente intocadas** por `d0d37ae..HEAD` (não aparecem no `git diff --stat`), e a iteração 1 já provou empiricamente por worktree em `28a72c0` que as mesmas 12 falhas existem na base. **Zero falhas novas.**
- **Test count antes da feature (`28a72c0`)**: 537 (525 passed, 12 failed) — medição da iteração 1, por worktree
- **Test count na iteração 1 (`d0d37ae`)**: 633 (621 passed, 12 failed)
- **Test count agora (`a0a0edc`)**: 638 (626 passed, 12 failed)
- **Delta vs. o último known-good**: **+5 testes unitários, todos passando** (2 de CEP vazio, 1 de `ERRO_PROCESSAMENTO`, 1 de IMPORT-15, 1 de IMPORT-14). Total vs. a base: +101. Zero testes removidos; nenhuma asserção pré-existente enfraquecida (o único teste de integração renomeado, `:94`, **ganhou** uma asserção de corpo além do status)
- **Integration (escopo restrito)**: `npx jest --testMatch "**/__tests__/integration/oficinaImport.test.ts"` — **8 passed, 8 total** (era 7; +1 novo, 1 renomeado com asserção extra). O script completo `npm run test:integration` **não foi executado** e nenhum outro arquivo de `__tests__/integration/` foi rodado
- **Não verificável nesta sessão**: execução das 3 queries de comunidade contra Postgres real; aplicação de `scripts/migration-oficina-importada.sql`; o limite de 5MB do `multer` fim-a-fim; `__tests__/integration/rotaService.test.ts:57` (a asserção de `STATUS = BACKLOG`)

---

## Ranked Gaps / Fix Plans

### Gap 1: IMPORT-04 — teto de 5MB sem nenhuma evidência de teste — **Minor**

- **Root cause**: o comportamento existe e foi verificado por leitura (`middlewares/uploadPlanilha.ts:19` configura `limits: { fileSize: 5 * 1024 * 1024 }`, e `routes/OficinaRoute.ts:26-35` converte qualquer erro do `multer` — incluindo `LIMIT_FILE_SIZE` — em `400 { message }`). O que falta é a asserção. Evidence-or-zero: metade de uma AC P1 conta como não coberta. A Test Coverage Matrix de `tasks.md` prometia cobertura "indireta pelo teste de integração do endpoint", e nenhum teste de integração exercita tamanho.
- **Fix task**: em `__tests__/integration/oficinaImport.test.ts`, adicionar um teste que anexa um buffer > 5MB (`Buffer.alloc(6 * 1024 * 1024)`, nome `oficinas.xlsx`) e assere `response.status === 400` e que `importarPlanilhaMock` **não** foi chamado. Não requer banco (`OficinaImportService` já é mockado no arquivo).
- **Done when**: IMPORT-04 tem citação `file:line` para os **dois** gatilhos (5MB e 5.000 linhas).

### Gap 2: os casts `::text` do fix-round não têm nenhuma discriminação de teste — **Minor**

- **Root cause**: mutação M4 sobreviveu. As únicas asserções sobre essas queries são `expect.stringContaining('OFICINA_IMPORTADA')` (`__tests__/unit/oficinaService.test.ts:91,117,158`), que não observam os casts. Uma remoção acidental dos `::text` num refactor futuro reintroduz silenciosamente o risco que este fix-round eliminou (mismatch de tipo derrubando as 3 rotas de comunidade para todo cliente). Provar o outcome real exige Postgres (proibido); travar a regressão não exige.
- **Fix task**: em `__tests__/unit/oficinaService.test.ts:85-96` e `:111-120`, acrescentar `expect.stringContaining('::text')` (ou asserções por coluna, ex. `'o."NUMERO"::text'` e `'ce."numero"::text'`) às chamadas já assertadas de `AppDataSourceSync.query`.
- **Done when**: remover um cast `::text` de qualquer ramo faz `npm run test:unit` falhar.

### Observações não-bloqueantes (não são gaps de AC; registradas para o próximo revisor)

- **O1 — `catch` silencioso**: `service/oficinaImportService.ts:390` descarta o erro sem `console.error`. Todo o resto do repositório loga antes de degradar (`service/oficinaService.ts:213,392,442`; `controllers/oficinaController.ts:195`). Numa importação de 5.000 linhas, uma falha de banco recorrente fica indistinguível no log. Sugestão: `catch (erroLinha) { console.error(...); push(...) }`.
- **O2 — double-count de contadores num throw no meio da linha**: `oficinas_criadas`/`oficinas_vinculadas_existentes` são incrementados em `:372-376`, **antes** de `garantirVinculo` (:378) e `atribuirRota` (:388). Se um desses lançar, a mesma linha aparece simultaneamente num contador de sucesso **e** em `erros[]` — `total_linhas` deixa de fechar com a soma. Não é violação de AC (o `spec.md` não define a semântica dos contadores nesse caminho, e a oficina realmente foi criada), mas é uma inconsistência de relatório para o consumidor do endpoint.
- **O3 — rastreabilidade de commit em `tasks.md`**: `tasks.md:544-545` atribui os testes de IMPORT-15 e IMPORT-14 a um commit `test(oficina-import): cover multi-EMPRESA_SLUG linking and lat/long fill on existing link` que **não existe** em `git log d0d37ae..HEAD` (o fix-round tem 4 commits: `6151976`, `980f15a`, `f584fc4`, `a0a0edc`); esses testes foram dobrados em `6151976`, junto com o fix de CEP/try-catch. O código está correto — a tabela de rastreabilidade não. Vale corrigir a linha para apontar `6151976`.
- **O4 — OpenAPI sem corpo multipart** (deferido explicitamente em `tasks.md:548`): como `schemas.body` é deliberadamente omitido em T12, `utils/routeDocumentation.ts` não emite `request.body` e `ImportOficinasBodySchema` não aparece no spec gerado. O contrato multipart existe só em prosa na `description` (`routes/OficinaRoute.ts:238-247`). Gap de documentação, não de comportamento.
- **O5 — `scripts/migration-oficina-importada.sql`** continua sendo um passo manual de DBA, e as 3 queries de comunidade continuam sem nenhuma execução contra Postgres real. Nenhum dos dois é executável nesta sessão (restrição absoluta de não acessar banco).

---

## Correções ao relatório da iteração 1

Duas citações do relatório anterior não se sustentaram na re-verificação:

1. **IMPORT-17**: a iteração 1 citou `service/rotaService.ts:494 - STATUS: StatusRota.BACKLOG` como o local da criação da rota. Lendo o arquivo, `:494` é uma cláusula `where` dentro de `reassignRotasByAddress`, não uma criação. O `STATUS = BACKLOG` do caminho de import vem do **default de coluna** em `entities/RotaPromotor.ts:47` (`assignOficinaFromCommunitySignup` → `createRotas` em `service/rotaService.ts:81-86` não passa `STATUS`). Correção favorável: existe sim uma asserção — `__tests__/integration/rotaService.test.ts:57` — apenas num teste com banco real, não executável aqui.
2. **Contagem de gaps**: a iteração 1 afirmou "5 gaps ranqueados"; a tabela de fixes de `tasks.md` lista 6 linhas (IMPORT-14 e IMPORT-15 foram separadas). Sem consequência material — todas foram endereçadas.

---

## Requirement Traceability Update

| Requirement | Status na iteração 1 | Novo status |
| ----------- | -------------------- | ----------- |
| IMPORT-01 | ✅ Verified | ✅ Verified |
| IMPORT-02 | ✅ Verified | ✅ Verified |
| IMPORT-03 | ⚠️ Spec-precision gap | ✅ Verified |
| IMPORT-04 | ⚠️ Parcial (5MB e rota sem teste) | ⚠️ Parcial (linhas verificado ponta a ponta; **5MB segue sem evidência**) |
| IMPORT-05 | ✅ Verified | ✅ Verified |
| IMPORT-06 | ✅ Verified | ✅ Verified |
| IMPORT-07 | ✅ Verified | ✅ Verified |
| IMPORT-08 | ✅ Verified | ✅ Verified |
| IMPORT-09 | ✅ Verified | ✅ Verified |
| IMPORT-10 | ✅ Verified | ✅ Verified |
| IMPORT-11 | ✅ Verified | ✅ Verified |
| IMPORT-12 | ✅ Verified | ✅ Verified (compensação agora dentro do try/catch) |
| IMPORT-13 | ✅ Verified | ✅ Verified |
| IMPORT-14 | ⚠️ Spec-precision gap | ✅ Verified |
| IMPORT-15 | ❌ Needs Fix (sem evidência) | ✅ Verified |
| IMPORT-16 | ✅ Verified por reuso | ✅ Verified por reuso |
| IMPORT-17 | ✅ Verified por reuso | ⚠️ Verified por reuso (asserção de `BACKLOG` só em teste DB-dependente) |
| IMPORT-18 | ✅ Verified por reuso | ✅ Verified por reuso |
| IMPORT-19 | ✅ Verified por reuso | ✅ Verified por reuso |
| IMPORT-20 | ⚠️ Spec-precision gap | ⚠️ Spec-precision gap (inalterado) |

---

## Summary

**Overall**: ❌ Not Ready — mas o delta é grande e todos os 5 gaps ranqueados da iteração 1 estão fechados

**Spec-anchored check**: 20/20 ACs com citação (era 19/20); 17/20 casam exatamente o outcome do spec (era 14/20); 0 ACs sem evidência (era 1); 1 AC com metade sem evidência (IMPORT-04/5MB); 2 spec-precision gaps
**Sensor**: 4 mutações novas no código do fix-round, 3 killed / 1 survived (M4, casts `::text`); árvore real verificadamente intocada antes e depois
**Gate**: 626 passed / 12 failed (as mesmas 12 pré-existentes, em 3 suítes intocadas) / 638 total; +5 testes vs. `d0d37ae`, todos passando; `tsc` sem erros novos; integração restrita 8/8

**O que o fix-round realmente entregou** (verificado, não aceito por commit message): guarda de CEP em branco antes de qualquer I/O, fechando o edge case e economizando 2 chamadas HTTP por linha inválida; isolamento por linha para falha inesperada envolvendo os 5 pontos que podem lançar, incluindo o `delete` compensatório que antes ficava de fora; `::text` em todas as 9 colunas de texto dos dois ramos das 2 queries com risco, com a isenção de `countCommunityOficinas` confirmada por leitura da query; primeira evidência de teste para IMPORT-15 (multi-slug), provada load-bearing por mutação; asserção própria para a metade "preenche lat/long" de IMPORT-14; e corpo exato do 400 de header e de limite de linhas nos testes de integração.

**Issues found (ranqueados)**:
1. IMPORT-04 — teto de 5MB sem nenhuma citação de teste; comportamento existe (`middlewares/uploadPlanilha.ts:19` + `routes/OficinaRoute.ts:26-35` → 400) e o teste é barato e DB-free — Gap 1
2. Casts `::text` sem discriminação de teste (mutação M4 sobreviveu); regressão silenciosa possível — Gap 2

**Next steps**: rotear Gap 1 e Gap 2 (dois testes, nenhuma mudança de código de produção) e re-verificar — esta é a iteração 2 de 3 permitidas. Observações O1-O5 ficam ao critério do time; O3 (rastreabilidade de commit em `tasks.md`) é correção de uma linha.
