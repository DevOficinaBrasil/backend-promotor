# Importador de Oficinas Validation

## Validation: Importador de Oficinas — PASS ✅ (iteração 3, final)

**Date**: 2026-09-09
**Spec**: `.specs/features/importador-oficinas/spec.md`
**Diff range**: `28a72c0..fa0f9ad` (feature completa — 21 commits: 13 de implementação + fix-round 1 (4) + fix-round 2 (3), incluindo os relatórios de validação)
**Re-check desta iteração**: `a0a0edc..fa0f9ad` (3 commits novos: `9e23208`, `b52c49e`, `fa0f9ad`)
**Verifier**: independent sub-agent (author ≠ verifier), terceira sessão nova, sem memória das iterações 1 e 2, read-only sobre implementação e testes
**DB access**: nenhum. Nenhum banco real foi contatado. `npm run test:integration` (script completo) **não** foi executado; nenhum arquivo de `__tests__/integration/` além de `oficinaImport.test.ts` foi rodado; `scripts/migration-oficina-importada.sql` **não** foi executado. O worktree de mutação recebeu um `.env` sintético (`DB_HOST=127.0.0.1`, `DB_PORT=1`) justamente para que nem um `initialize()` acidental pudesse alcançar um banco real.

> **Este relatório substitui integralmente o da iteração 2** (veredito FAIL, 2 gaps menores só de teste), preservado no histórico git em `fa0f9ad`. Como esta é a **terceira e última iteração permitida** do laço fix→re-verify, o escopo aqui é a feature inteira (`28a72c0..fa0f9ad`), não só o delta: todas as tabelas abaixo foram re-derivadas do zero contra `spec.md`, com números de linha re-conferidos no HEAD atual (os do relatório anterior deslocaram com os testes novos). Três citações do relatório da iteração 2 foram corrigidas — ver "Correções ao relatório da iteração 2".

---

## Veredito curto

Os **2 gaps ranqueados da iteração 2 estão genuinamente fechados**, e o **fix não solicitado que o implementador encontrou por conta própria** (contadores de sucesso por linha) está correto, testado e discriminante. Empiricamente:

- a mutação que sobreviveu na iteração 2 (remover um cast `::text`) **agora morre**;
- a mutação que remove o teto de 5MB do `multer` morre no teste de integração novo, provando que ele é um exercício fim-a-fim real do `limits.fileSize`, não um atalho mockado;
- reverter o reordenamento dos contadores mata **exatamente um** teste em toda a suíte unitária (641 testes) — o teste novo — o que prova ao mesmo tempo que ele é load-bearing e que o reordenamento não mudou o significado de nenhum outro teste.

Contagem: 4 mutações desta iteração, 4 mortas (5/5 contando a réplica da mutação que sobreviveu na iteração 2). Zero erros de tipo novos, zero falhas de teste novas, zero testes removidos.

---

## Re-check dos 2 gaps da iteração 2

| # | Gap da iteração 2 | Correção alegada | Verificação independente | Status |
|---|---|---|---|---|
| 1 | **IMPORT-04 (teto de 5MB) sem nenhuma evidência de teste** — só a configuração do `multer` lida no código | Teste de integração com upload real de 6MB via `supertest` (`b52c49e`) | **FECHADO, e é fim-a-fim de verdade.** `__tests__/integration/oficinaImport.test.ts:108-118` monta `Buffer.alloc(6 * 1024 * 1024, "a")` e o anexa com `.attach("file", arquivoGrande, "oficinas.xlsx")` contra o `app` Express real, com `routes/OficinaRoute` montado — o que exercita o `multer` de verdade (`middlewares/uploadPlanilha.ts:19`, `limits: { fileSize: TAMANHO_MAXIMO_BYTES }`) e o wrapper `uploadPlanilhaComErro` (`routes/OficinaRoute.ts:26-35`). **Só `OficinaImportService` está mockado; `multer` não está.** As duas asserções são load-bearing e complementares: `expect(response.status).toBe(400)` (:116) e `expect(importarPlanilhaMock).not.toHaveBeenCalled()` (:117) — sem a segunda, um 400 por outro motivo passaria; com ela, se o `multer` deixasse o arquivo passar o controller chamaria o mock e o teste quebraria. Provado por duas mutações independentes: **M3** (remover a cláusula `limits`) e **M4** (subir o teto para 10MB) matam esse teste e só ele. | ✅ Fechado |
| 2 | **Casts `::text` sem discriminação de teste** — a mutação M4 da iteração 2 (remover o cast de uma coluna dos dois ramos) sobreviveu | 2 testes que contam ocorrências de `::text` na query enviada e exigem exatamente 18 (`b52c49e`) | **FECHADO, e a contagem 18 foi conferida por mim, não aceita do comentário.** Contei `::text` no `service/oficinaService.ts` real, linha a linha: `getComunityNearbyOficinas` tem 9 no ramo `dw.cadastro_empresa` (`:125-133`) + 9 no ramo `OFICINA_IMPORTADA` (`:168-176`) = **18**; `getCommunityOficinas` tem 9 (`:340-348`) + 9 (`:368-376`) = **18**. Os 8 `::double precision` de lat/long (`:166-167`, `:179-181`, `:193-195`) não casam o regex `/::text/g`, e verifiquei que os fragmentos SQL interpolados nessas queries não injetam `::text` (`utils/sqlCadastroEmpresa.ts` só emite `::bigint`, em `cnpjIntDaOficina`) — ou seja, os 18 do runtime são exatamente as 18 projeções. A asserção é **exata, não frouxa**: `expect(castCount).toBe(18)` em `__tests__/unit/oficinaService.test.ts:107` e `:143` — remover um cast dá 17 e falha. Provado: mutação **M2** (remover `ce."numero"::text` de um ramo) mata; a **réplica exata da M4 da iteração 2** (remover `ce."numero"::text` *e* `o."NUMERO"::text`, os dois ramos) também mata. | ✅ Fechado |

---

## Avaliação independente do fix não solicitado: contadores de sucesso por linha (`9e23208`)

Este fix não foi pedido por nenhum Verifier anterior (a iteração 2 o registrou apenas como observação não-bloqueante O2). Julgado do zero:

**Correto?** Sim. `service/oficinaImportService.ts:372-391`: `garantirVinculo` (:372) e `atribuirRota` (:378) rodam **primeiro**, e só depois os contadores avançam — `oficinas_criadas`/`oficinas_vinculadas_existentes` (:383-387), `ja_na_comunidade` (:388-390) e `rotas_criadas` (:391) — todos dentro do mesmo `try` que abre em `:348`, antes do `catch` em `:392`. O double-count está estruturalmente eliminado: não existe mais nenhum caminho em que a mesma linha incremente um contador de sucesso **e** entre em `erros[]`.

**Muda o comportamento quando `atribuirRota` lança (e não `garantirVinculo`)?** Sim, e para melhor. Antes de `9e23208` os contadores subiam logo após `garantirLatLong`, então um throw em **qualquer** um dos dois passos seguintes double-contava. Agora **os dois** passos estão cobertos pelo mesmo reordenamento — `atribuirRota` inclusive, que a iteração 2 nem citou. Nenhuma regressão: o `catch` já envolvia `atribuirRota` desde o fix-round 1, e `rotas_criadas` já era incrementado depois dela, então esse contador não mudou de semântica.

**Testado?** Sim, e o teste ataca o passo certo. `__tests__/unit/oficinaImportService.test.ts:612-626` encadeia `mockResolvedValueOnce([])` (1ª chamada de `AppDataSourceSync.query`, dentro de `buscarOuCriarOficina` em `:147` → CNPJ novo) e `mockRejectedValueOnce(new Error("boom"))` (2ª chamada, que é o `SELECT 1 ... USUARIO_COMMUNITY` de **`garantirVinculo`** em `:221`). Confirmei por leitura que `atribuirRota` **não** pode ser a fonte do throw: ela só delega a `RotaService.assignOficinaFromCommunitySignup`, que está `jest.mock`ado e recebe `mockResolvedValue(resumoAtribuicao(0))` no `beforeEach` (`:434-436`). As asserções são as certas: `expect(resultado.oficinas_criadas).toBe(0)` (:622) e `erros === [{ linha: 2, cnpj: "12345678000190", motivo: "ERRO_PROCESSAMENTO" }]` (:623-625) — o contador ficou em 0 **e** a linha foi reportada uma única vez.

**Mudou o significado de algum outro teste já passando?** Não. Rodei a **suíte unitária completa** contra a mutação que reverte só o reordenamento (M1b): **13 falhas contra as 12 do baseline** — exatamente uma falha nova, o teste novo. Nenhum outro dos 641 testes observa a ordem dos incrementos. Em particular o teste de IMPORT-14 (`:628-641`, que assere `ja_na_comunidade === 1`) e o de isolamento por linha (`:594-610`, que assere `oficinas_criadas === 1` para a 2ª linha) passam identicamente nas duas ordens.

**Risco residual introduzido (não-bloqueante, ver O2 abaixo)**: a troca foi de over-reporting por under-reporting. Se `garantirVinculo` grava o vínculo e `atribuirRota` lança depois, o vínculo e a oficina recém-criada **persistem** no banco mas a linha é reportada só como `ERRO_PROCESSAMENTO`, sem contador. Não há compensação (o `delete` de `:362` só cobre falha de geocodificação). O `spec.md` não define a semântica dos contadores nesse caminho, e o novo invariante (`total_linhas == sucessos + erros`) é o mais defensável dos dois — por isso não é gap de AC.

**Bônus verificado no mesmo commit**: `console.error` no `catch` (`:396`), fechando a observação O1 da iteração 2 (o `catch` silencioso divergia do padrão log-then-degrade do repositório).

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 `cnpjIntDaOficina` export | ✅ Done | `utils/sqlCadastroEmpresa.ts:63` |
| T2 `OficinaImportada` entity | ✅ Done | `entities/OficinaImportada.ts` |
| T3 migration script | ✅ Done | `scripts/migration-oficina-importada.sql` — nunca executado (passo manual de DBA) |
| T4 upload middleware | ✅ Done | `middlewares/uploadPlanilha.ts:12-27`; erro do `multer` → 400 em `routes/OficinaRoute.ts:26-35`. **Agora com teste fim-a-fim dos dois gatilhos** (extensão e tamanho) |
| T5 parse + header | ✅ Done | `service/oficinaImportService.ts:64-92` |
| T6 CNPJ normalize + dedupe | ✅ Done | `service/oficinaImportService.ts:110-135` |
| T7 dedupe/create oficina | ✅ Done | `service/oficinaImportService.ts:143-172` |
| T8 geocode lat/long | ✅ Done | `service/oficinaImportService.ts:180-207` |
| T9 link without user | ✅ Done | `service/oficinaImportService.ts:215-253` |
| T10 route assignment | ✅ Done | `service/oficinaImportService.ts:262-267`; `service/rotaService.ts` verificadamente **intocado** em `28a72c0..HEAD` (`git diff --stat` vazio) |
| T11 orchestration | ✅ Done | `service/oficinaImportService.ts:282-406` — isolamento por linha (`:348`/`:392`) + contadores pós-sucesso (`:383-391`) |
| T12 endpoint | ✅ Done | `controllers/oficinaController.ts:152-201`, `routes/OficinaRoute.ts:26-35`, `schemas/oficina.ts:96-123`. Corpo multipart no OpenAPI deferido — ver O4 |
| T13 community-query extension | ✅ Done | `service/oficinaService.ts` — 3 métodos; 18 casts `::text` por query nas 2 com colunas de texto, agora travados por asserção exata |
| Fix Round 1 (4 commits) | ✅ Done | 5 gaps da iteração 1, todos confirmados fechados na iteração 2 e re-confirmados aqui |
| Fix Round 2 (3 commits) | ✅ Done | 2 gaps da iteração 2 + 1 fix de correção auto-encontrado. Rastreabilidade de `tasks.md` corrigida em `fa0f9ad` (observação O3 da iteração 2, fechada) |

---

## Spec-Anchored Acceptance Criteria (re-derivada do zero, linhas re-conferidas no HEAD)

### Story P1-A — Upload e validação estrutural

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| IMPORT-01 header exato (case/acento-insensível, mesma ordem) → prossegue com as linhas | linhas processadas | `__tests__/unit/oficinaImportService.test.ts:65` - `expect(() => OficinaImportService.validarCabecalho([cabecalhoVariante])).not.toThrow()`; `:489-496` - `expect(resultado).toEqual({ total_linhas: 1, oficinas_criadas: 1, ..., rotas_criadas: 1, erros: [] })` | ✅ PASS |
| IMPORT-02 arquivo não `.xlsx`/`.csv` → 400, nada processado | HTTP 400 + zero processamento | `__tests__/integration/oficinaImport.test.ts:52` - `expect(response.status).toBe(400)`; `:53` - `expect(importarPlanilhaMock).not.toHaveBeenCalled()`; `__tests__/unit/uploadPlanilha.test.ts:23` - `expect(isPlanilhaValida("oficinas.txt")).toBe(false)` | ✅ PASS |
| IMPORT-03 cabeçalho ≠ 7 colunas/ordem → 400 **com a lista de colunas esperada**, nenhuma escrita | HTTP 400 + corpo com a lista de colunas + zero escrita | `__tests__/unit/oficinaImportService.test.ts:70` - `.toThrow("HEADER_INVALIDO")` (fora de ordem), `:75` (faltando), `:82` (extra); `__tests__/integration/oficinaImport.test.ts:102` - `expect(response.status).toBe(400)`; `:103-105` - `expect(response.body.message).toContain("NOME OFICINA; CNPJ; CEP; ENDEREÇO; NUMERO; ESTADO; CIDADE")`, casando `controllers/oficinaController.ts:189` | ✅ PASS |
| IMPORT-04 > 5MB **ou** > 5.000 linhas → 400, nada processado | HTTP 400 nos **dois** casos | **5MB (novo)**: `__tests__/integration/oficinaImport.test.ts:116` - `expect(response.status).toBe(400)` e `:117` - `expect(importarPlanilhaMock).not.toHaveBeenCalled()`, com `Buffer.alloc(6 * 1024 * 1024)` real atravessando o `multer`. **Linhas**: `__tests__/unit/oficinaImportService.test.ts:100` - `.toThrow("LIMITE_LINHAS_EXCEDIDO")` e `__tests__/integration/oficinaImport.test.ts:128-129` - `expect(response.status).toBe(400)` / `expect(response.body.message).toContain("5.000 linhas")` | ✅ PASS — **gap da iteração 2 fechado**; os dois gatilhos agora têm citação, e o de 5MB é morto por 2 mutações (M3, M4) |
| IMPORT-05 `ID_CAMPANHA` inexistente/soft-deleted → 404, arquivo não processado | HTTP 404 + arquivo nunca lido | `__tests__/unit/oficinaImportService.test.ts:442-444` - `.rejects.toThrow("CAMPANHA_NAO_ENCONTRADA")`; `:445` - `expect(AppDataSourceSync.query).not.toHaveBeenCalled()`; `__tests__/integration/oficinaImport.test.ts:80` - `expect(response.status).toBe(404)` | ✅ PASS |
| IMPORT-06 campanha sem `EMPRESA_SLUG` → 422, arquivo não processado | HTTP 422 | `__tests__/unit/oficinaImportService.test.ts:455-457` - `.rejects.toThrow("CAMPANHA_SEM_EMPRESA_SLUG")`; `__tests__/integration/oficinaImport.test.ts:91` - `expect(response.status).toBe(422)` | ✅ PASS |

### Story P1-B — Deduplicação e criação por CNPJ

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| IMPORT-07 CNPJ existente → reusa `ID_OFICINA`, não sobrescreve campos | mesmo `ID_OFICINA`, zero escrita na oficina | `__tests__/unit/oficinaImportService.test.ts:176` - `expect(resultado).toEqual({ ID_OFICINA: 42, criada: false })`; `:177-178` - `expect(repo.create).not.toHaveBeenCalled()` / `expect(repo.save).not.toHaveBeenCalled()` | ✅ PASS |
| IMPORT-08 CNPJ novo → cria oficina com os 7 campos + `ORIGEM = "IMPORTACAO_PLANILHA"` | os 7 campos da planilha e `ORIGEM` exato | `__tests__/unit/oficinaImportService.test.ts:191-200` - `expect(repo.create).toHaveBeenCalledWith({ NOME_FANTASIA: "Oficina Teste", CNPJ: "12.345.678/0001-90", CEP: "01310100", ENDERECO: "Rua Teste", NUMERO: "100", ESTADO: "SP", CIDADE: "Sao Paulo", ORIGEM: "IMPORTACAO_PLANILHA" })`; `:189` - `toEqual({ ID_OFICINA: 99, criada: true })` | ✅ PASS |
| IMPORT-09 CNPJ ≠ 14 dígitos → rejeita só a linha, reporta motivo, segue o arquivo | linha isolada com motivo; demais processadas | `__tests__/unit/oficinaImportService.test.ts:512` - `expect(resultado.erros).toEqual([{ linha: 2, cnpj: "123", motivo: "CNPJ_INVALIDO" }])`; `:513` - `expect(resultado.oficinas_criadas).toBe(1)`; unidade: `:116`/`:120`/`:124` - `normalizarCnpj` → `toBeNull()` | ✅ PASS |
| IMPORT-10 CNPJ repetido no arquivo → 1ª processada, seguintes com "CNPJ duplicado no arquivo" | 1ª processada, 2ª rejeitada com motivo de duplicidade | `__tests__/unit/oficinaImportService.test.ts:527-530` - `expect(resultado.erros).toEqual([{ linha: 3, cnpj: "12345678000190", motivo: "CNPJ_DUPLICADO_NO_ARQUIVO" }])`; `:526` - `expect(resultado.oficinas_criadas).toBe(1)`; `:143-145` - `expect(resultado.has(0)).toBe(false)` / `expect(resultado.has(2)).toBe(true)` | ✅ PASS (o `motivo` é o código `CNPJ_DUPLICADO_NO_ARQUIVO`, não a string literal do spec — equivalente semântico, não exposto como texto ao usuário final) |

### Story P1-C — Geocodificação e vínculo sem usuário

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| IMPORT-11 oficina sem lat/long → geocodifica CEP e preenche `LATITUDE`/`LONGITUDE` | UPDATE só de lat/long com o valor geocodificado | `__tests__/unit/oficinaImportService.test.ts:238` - `expect(repo.update).toHaveBeenCalledWith(1, { LATITUDE: "-23.55", LONGITUDE: "-46.63" })`; `:237` - `expect(getLatLongByCep).toHaveBeenCalledWith("01310100")`; caso "já tem": `:221-222` - `expect(getLatLongByCep).not.toHaveBeenCalled()` / `expect(repo.update).not.toHaveBeenCalled()` | ✅ PASS |
| IMPORT-12 geocodificação falha → rejeita a linha e **SHALL NOT criar ou vincular** a oficina | nenhuma oficina persistida sem lat/long; linha reportada | `__tests__/unit/oficinaImportService.test.ts:542` - `expect(oficinaRepo.delete).toHaveBeenCalledWith(77)`; `:543` - `expect(resultado.oficinas_criadas).toBe(0)`; `:544-547` - `erros === [{ linha: 2, cnpj: "12345678000190", motivo: "GEOCODIFICACAO_FALHOU" }]`; caso pré-existente: `:558-560` - `delete`/`save` não chamados e `oficinas_vinculadas_existentes === 0`; unidade: `:253` - `expect(repo.update).not.toHaveBeenCalled()`. O `delete` compensatório está dentro do try/catch (`service/oficinaImportService.ts:362`) | ✅ PASS |
| IMPORT-13 oficina ainda não vinculada ao `EMPRESA_SLUG` → cria vínculo em `OFICINA_IMPORTADA` | um registro com `ID_OFICINA`+`EMPRESA_SLUG`(+`ID_CAMPANHA`,`CREATED_BY`) | `__tests__/unit/oficinaImportService.test.ts:296-301` - `expect(repo.create).toHaveBeenCalledWith({ ID_OFICINA: 1, EMPRESA_SLUG: "empresa-x", ID_CAMPANHA: 10, CREATED_BY: 7 })`; `:294` - `expect(resultado).toBe("criado")`; `:302` - `expect(repo.save).toHaveBeenCalled()` | ✅ PASS |
| IMPORT-14 já vinculada (com ou sem usuário) → **não** cria novo vínculo, só preenche lat/long faltante | zero novo vínculo; lat/long preenchido se faltava | metade "não duplica": `:269-271` (via `USUARIO_COMMUNITY`, `findOne`/`save` não chamados), `:282-283` (via `OFICINA_IMPORTADA`), `:314-315` (reimportação). Metade "preenche lat/long": `:639` - `expect(oficinaRepo.update).toHaveBeenCalledWith(33, { LATITUDE: "-23.55", LONGITUDE: "-46.63" })`; `:640` - `expect(resultado.ja_na_comunidade).toBe(1)`; `:641` - `expect(oficinaImportadaRepo.save).not.toHaveBeenCalled()` | ✅ PASS |
| IMPORT-15 mesma oficina física pode estar vinculada a **mais de um** `EMPRESA_SLUG` simultaneamente | dois vínculos coexistem para slugs distintos | `__tests__/unit/oficinaImportService.test.ts:329` - `expect(resultado).toBe("criado")`; `:330` - `expect(repo.findOne).toHaveBeenCalledWith({ where: { ID_OFICINA: 1, EMPRESA_SLUG: "empresa-y" } })`; `:331-336` - `expect(repo.create).toHaveBeenCalledWith({ ID_OFICINA: 1, EMPRESA_SLUG: "empresa-y", ID_CAMPANHA: 20, CREATED_BY: undefined })`, com `findOne` mockado devolvendo vínculo existente para `"empresa-x"` no mesmo `ID_OFICINA: 1` | ✅ PASS |

### Story P1-D — Atribuição de rota do promotor

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| IMPORT-16 busca o promotor de menor distância Haversine dentro do raio (`RAIO`, default 20km) | promotor mais próximo dentro do raio | dentro do diff: `__tests__/unit/oficinaImportService.test.ts:355` - `expect(RotaService.assignOficinaFromCommunitySignup).toHaveBeenCalledWith(1, "empresa-x")` (pass-through). Comportamento reusado: `__tests__/unit/rotaService.test.ts:717` - `expect(result.atribuicoes[0].promotor!.ID_PROMOTOR).toBe(9)` (fora do diff; `service/rotaService.ts` verificadamente intocado em `28a72c0..HEAD`) | ✅ PASS por reuso |
| IMPORT-17 promotor elegível → cria `ROTA_PROMOTOR` com `STATUS = BACKLOG` | rota criada com `STATUS = BACKLOG` | dentro do diff: `__tests__/unit/oficinaImportService.test.ts:380` - `expect(resultado.resumo.atribuidas).toBe(1)`. Comportamento reusado: `__tests__/unit/rotaService.test.ts:694` - `expect(result.atribuicoes[0].status).toBe('atribuida')`, `:697` - `expect(result.resumo.atribuidas).toBe(1)`. `STATUS = BACKLOG` vem do default de coluna (`entities/RotaPromotor.ts:47` - `default: StatusRota.BACKLOG`), pois `assignOficinaFromCommunitySignup` delega a `createRotas` sem passar `STATUS`; asserção literal em `__tests__/integration/rotaService.test.ts:57` - `expect(rota.STATUS).toBe(StatusRota.BACKLOG)` | ✅ PASS por reuso — com a ressalva de **escopo de execução**: a asserção literal de `BACKLOG` vive num teste com banco real, não executável nesta sessão (restrição absoluta) e fora do diff range. Evidence-or-zero satisfeito (existe `file:line` + asserção que casa o outcome do spec); o mecanismo foi confirmado por leitura |
| IMPORT-18 nenhum promotor no raio → nenhuma rota, reporta `sem_promotor_disponivel`, sem erro | sem rota, status `sem_promotor_disponivel`, HTTP 200 | dentro do diff: `__tests__/unit/oficinaImportService.test.ts:405` - `expect(resultado.resumo.sem_promotor_disponivel).toBe(1)`. Comportamento reusado: `__tests__/unit/rotaService.test.ts:676` - `expect(result.atribuicoes[0].status).toBe('sem_promotor_disponivel')` | ✅ PASS |
| IMPORT-19 oficina já com rota ativa na campanha → não cria nova rota | idempotência | `__tests__/unit/rotaService.test.ts:662` - `expect(result.atribuicoes[0].status).toBe('ja_atribuida')`; `:663` - `expect(result.resumo.ja_atribuida).toBe(1)` (fora do range; T10 declara explicitamente não re-testar código reusado) | ✅ PASS por reuso |
| IMPORT-20 as consultas de "oficinas da comunidade" passam a incluir `OFICINA_IMPORTADA` | as 3 queries consideram a tabela nova | `__tests__/unit/oficinaService.test.ts:90-94` - `expect(AppDataSourceSync.query).toHaveBeenCalledWith(expect.stringContaining('OFICINA_IMPORTADA'), ['empresa-test', -23.55, -46.63, 20])`; `:130-134` - idem para `getCommunityOficinas` (`['empresa-test']`); `:181-185` - idem para `countCommunityOficinas`. **Reforçado nesta iteração**: `:107` e `:143` - `expect(castCount).toBe(18)`, que trava a forma do ramo novo, não só a menção da tabela | ⚠️ Spec-precision gap (inalterado, não-bloqueante) — as asserções provam que o SQL **contém** o ramo `OFICINA_IMPORTADA` com a projeção correta, não que o *result set* traz as oficinas importadas; provar o outcome exige Postgres real (proibido nesta sessão). Estrutural à restrição, não uma asserção fraca por descuido |

**Status**: ✅ Todas as 20 ACs cobertas com citação `file:line`; 19/20 com asserção que casa exatamente o outcome do spec; 1 ⚠️ spec-precision gap não-bloqueante (IMPORT-20) + 1 ressalva de escopo de execução (IMPORT-17).

**Contagem**: 20/20 com citação (iteração 1: 19/20 · iteração 2: 20/20). 19/20 casando exatamente o outcome (iteração 1: 14/20 · iteração 2: 17/20). 0 ACs sem evidência. 0 ACs com metade sem evidência (iteração 2: 1 — IMPORT-04).

---

## Edge Cases

Todos os 8 edge cases do `spec.md` atendidos com citação:

- [x] Arquivo não `.xlsx`/`.csv` → 400 sem processar — `__tests__/integration/oficinaImport.test.ts:52-53`
- [x] Cabeçalho válido e zero linhas de dados → 200 com `total_linhas: 0`, nenhuma criação — `__tests__/unit/oficinaImportService.test.ts:465-472` - `expect(resultado).toEqual({ total_linhas: 0, oficinas_criadas: 0, oficinas_vinculadas_existentes: 0, ja_na_comunidade: 0, rotas_criadas: 0, erros: [] })`
- [x] `ID_CAMPANHA` inexistente/soft-deleted → 404 — `__tests__/integration/oficinaImport.test.ts:80`
- [x] Campanha existe sem `EMPRESA_SLUG` → 422 — `__tests__/integration/oficinaImport.test.ts:91`
- [x] CEP vazio ou ausente → linha rejeitada — guarda em `service/oficinaImportService.ts:332-336`; testes `__tests__/unit/oficinaImportService.test.ts:574-578` (oficina pré-existente com lat/long) e `:586-591` (CNPJ novo, com `expect(AppDataSourceSync.query).not.toHaveBeenCalled()`)
- [x] Duas linhas com o mesmo CNPJ → 2ª rejeitada como duplicada — `__tests__/unit/oficinaImportService.test.ts:527-530`
- [x] Oficina já pertencente a outro `EMPRESA_SLUG` → vínculo adicional sem afetar o existente — `__tests__/unit/oficinaImportService.test.ts:318-337`
- [x] Nenhum promotor com coordenadas → todas reportadas como `sem_promotor_disponivel`, sem erro — `__tests__/unit/oficinaImportService.test.ts:405` (pass-through) + `__tests__/unit/rotaService.test.ts:676`

Extras cobertos além do `spec.md` (vindos do `design.md` e desta rodada de fixes):

- [x] Falha de banco numa linha → linha com `ERRO_PROCESSAMENTO`, loop continua — `__tests__/unit/oficinaImportService.test.ts:594-610`
- [x] Falha **depois** de a oficina já ter sido criada → linha não conta como sucesso — `__tests__/unit/oficinaImportService.test.ts:612-626`
- [x] Arquivo acima de 5MB → 400 antes de qualquer processamento — `__tests__/integration/oficinaImport.test.ts:108-118`

---

## Discrimination Sensor (mutações novas, focadas nas mudanças desta iteração)

**Isolamento**: worktree temporário `git worktree add --detach C:/tmp/obws3 HEAD` (nunca `git stash`), `node_modules` por junction, `.env` sintético apontando para `127.0.0.1:1` para tornar impossível alcançar um banco real. Cada mutação revertida com `git checkout --` no scratch antes da seguinte. Baseline `git status --porcelain` da árvore real **vazio antes e depois**; `git worktree list` de volta a uma única entrada; `HEAD` inalterado em `fa0f9ad`.

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ----------- | ------- |
| M1 | `service/oficinaImportService.ts:372-391` | Reordenamento revertido: incrementos de contador movidos de volta para **antes** de `garantirVinculo` (ordem pré-`9e23208`) | ✅ Killed — na suíte `oficinaImportService`: 1 falha, **exatamente** `should not count a row as created when garantirVinculo throws after the oficina was already created` (42 outros testes do arquivo passaram) |
| M1b | `service/oficinaImportService.ts:372-391` | Idem M1, mas rodada contra a **suíte unitária completa** para caçar dependências silenciosas de ordem | ✅ Killed — 13 falhas vs. 12 do baseline: **exatamente uma falha nova**, o mesmo teste. Nenhum outro dos 641 testes observa a ordem dos incrementos |
| M2 | `service/oficinaService.ts:130` | Um cast removido de um ramo: `ce."numero"::text AS "NUMERO"` → sem cast (contagem 18 → 17) | ✅ Killed — 1 falha, **exatamente** `should cast every text column on both UNION branches to a common type` de `getComunityNearbyOficinas` |
| M2b | `service/oficinaService.ts:130,173` | **Réplica exata da mutação que SOBREVIVEU na iteração 2** (M4 de então): cast removido dos **dois** ramos de `getComunityNearbyOficinas` (18 → 16) | ✅ Killed — o mutante que antes sobrevivia agora morre. `promotorService.test.ts` segue 27/27 (nenhum falso positivo colateral) |
| M3 | `middlewares/uploadPlanilha.ts:19` | Teto de tamanho removido: cláusula `limits: { fileSize: TAMANHO_MAXIMO_BYTES }` deletada | ✅ Killed — 1 falha em `__tests__/integration/oficinaImport.test.ts`, **exatamente** `should return 400 when the file exceeds the 5MB size limit` (os outros 8 testes do arquivo passaram) — prova que o teste é fim-a-fim através do `multer` |
| M4 | `middlewares/uploadPlanilha.ts:4` | Teto elevado: `5 * 1024 * 1024` → `10 * 1024 * 1024` (o buffer de 6MB passaria) | ✅ Killed — mesma falha única. O teste discrimina o **valor** do teto do spec, não apenas a existência de um teto |

**Sensor depth**: lightweight+ (6 execuções de mutação cobrindo os 3 pontos de mudança desta iteração, uma delas contra a suíte unitária inteira)
**Result**: 6/6 killed — PASS ✅

Leitura: as três mudanças desta iteração são todas discriminadas por um teste dedicado, e cada mutação mata **exatamente** o teste correspondente e nenhum outro — o sinal mais forte de que as asserções são load-bearing e não colaterais. O único mutante que sobreviveu em três iterações (os casts `::text`) agora morre.

**Disclosure de efeito colateral desta sessão (fora da árvore versionada)**: no cleanup, `git worktree remove --force` seguiu a junction de `node_modules` e esvaziou o `node_modules` **real** do repositório (gitignorado, portanto invisível para `git status`). Foi restaurado com `npm ci` a partir de `package-lock.json` e o gate foi re-executado depois da restauração, com resultados idênticos (629 passed / 641 total unit; 9/9 na integração restrita). Nenhum arquivo versionado foi tocado. **Lição operacional para o próximo Verifier: nunca criar `node_modules` como junction dentro do worktree de scratch — copie, ou aponte `NODE_PATH`/`--rootDir`, ou remova a junction antes do `git worktree remove --force`.**

---

## Code Quality (escopo: diff `a0a0edc..fa0f9ad`, com re-leitura do escopo completo)

| Check | Pass? |
| ----- | ----- |
| No features beyond what was asked | ✅ — os 2 commits de código/teste endereçam os 2 gaps ranqueados + 1 correção de reporting que o próprio Verifier anterior havia registrado como observação real (O2). Nada além |
| No abstractions for single-use code | ✅ — nenhum helper, wrapper ou utilitário novo. `castCount` é uma const local dentro do teste; a mutação de código é puramente um reordenamento de 3 blocos `if` já existentes |
| No unnecessary "flexibility" added | ✅ — nenhuma opção, flag ou parâmetro novo; nenhuma mudança de contrato (`ImportResult` e `ErroLinhaImportSchema` inalterados) |
| Only touched files required for task | ✅ — 4 arquivos: `service/oficinaImportService.ts` (reordenamento + `console.error`), `__tests__/unit/oficinaImportService.test.ts` (+1 teste), `__tests__/unit/oficinaService.test.ts` (+2 testes), `__tests__/integration/oficinaImport.test.ts` (+1 teste). Nenhum arquivo de produção fora de `oficinaImportService.ts` |
| Didn't "improve" unrelated code | ✅ — `service/oficinaService.ts` **não foi tocado** nesta iteração (só os testes dele); o diff do service de import é exclusivamente o reordenamento + a linha de log, sem nenhuma alteração de lógica de negócio (conferido linha a linha) |
| Matches existing patterns/style | ✅ — `console.error` no `catch` alinha com o padrão log-then-degrade do repositório (`service/oficinaService.ts:213,392,442`; `controllers/oficinaController.ts:195`); comentários em português como o resto do arquivo; os testes novos seguem o estilo dos vizinhos (`jest.mock` do data-source, `createMockRepo`, `supertest` com service mockado) |
| Would senior engineer approve? | ✅ — sim. As duas ressalvas da iteração 2 foram atendidas (log no `catch`; contadores). Resta uma observação de design, não de código: sem compensação para falha pós-vínculo (O2) |
| Tests map to ACs and are non-shallow | ✅ — os 4 testes novos mapeiam a IMPORT-04 (5MB), IMPORT-20/T13 (casts, ×2) e ao invariante de reporting de T11. As 6 mutações do sensor foram mortas **exatamente** pelo teste novo correspondente |
| Spec-anchored outcome check | ✅ — 19/20 casam exatamente o outcome do spec; 1 ⚠️ spec-precision gap (IMPORT-20) flagado, não silenciosamente aprovado |
| Per-layer Coverage Expectation met | ✅ — domínio 1:1 com as ACs; a rota cobre happy path + **todos** os caminhos de erro do endpoint (400 de extensão, 400 de `ID_CAMPANHA`, 400 de arquivo ausente, 400 de header com a lista literal, 400 de tamanho, 400 de limite de linhas, 404, 422). A lacuna da matriz de `tasks.md` (400 de tamanho) foi fechada |
| Every test maps to a spec requirement | ✅ — nenhum teste órfão; os 4 novos mapeiam a IMPORT-04, IMPORT-20/T13 e ao "Done when" de T11 (relatório consistente) |
| Documented guidelines followed | ✅ — nenhum `AGENTS.md`/`CONTRIBUTING.md` no repositório; a Test Coverage Matrix de `tasks.md` foi seguida (service mockado, nunca o padrão de banco real de `__tests__/integration/oficinaService.test.ts`). Lições L-002 e L-004 de `.specs/LESSONS.md` — que esta rodada promoveu a "Active" — descrevem exatamente os 2 gaps corrigidos |

---

## Gate Check

- **Type gate**: `npx tsc --noEmit` — **2 erros, ambos pré-existentes e não relacionados**: `__tests__/unit/segmentacaoCampanhaPromotor.test.ts(2,42)` e `(4,32)`, `TS2307` para `../../utils/migrationRepository` e `../helpers/mockMigrationRepo`. **Re-confirmado nesta sessão (não assumido do relatório anterior)**: `git cat-file -e 28a72c0:__tests__/unit/segmentacaoCampanhaPromotor.test.ts` → o arquivo já existia na base; `git ls-tree -r --name-only HEAD | grep -i migrationRepo` → vazio (os módulos nunca existiram no repo); `git diff --stat 28a72c0..HEAD -- <esse arquivo>` → vazio (intocado pela feature inteira). **Zero erros novos.**
- **Quick/Full gate**: `npm run test:unit`
- **Result**: **629 passed, 12 failed, 0 skipped, 641 total** (37 suítes: 34 pass, 3 fail)
- **Falhas**: as mesmas 3 suítes das iterações 1 e 2 — `__tests__/unit/campanhaService.test.ts`, `__tests__/unit/campanhaServiceVisita.test.ts` (12 testes) e `__tests__/unit/segmentacaoCampanhaPromotor.test.ts` (não compila, 0 testes contados). **Re-confirmado**: `git diff --stat 28a72c0..HEAD` sobre as 3 é vazio (intocadas pela feature inteira), e a iteração 1 já provou por worktree em `28a72c0` que as mesmas 12 falhas existem na base. **Zero falhas novas.**
- **Test count antes da feature (`28a72c0`)**: 537 (525 passed, 12 failed) — medição da iteração 1
- **Test count na iteração 1 (`d0d37ae`)**: 633 (621 passed, 12 failed)
- **Test count na iteração 2 (`a0a0edc`)**: 638 (626 passed, 12 failed)
- **Test count agora (`fa0f9ad`)**: **641 (629 passed, 12 failed)**
- **Delta vs. iteração 2**: **+3 testes unitários, todos passando** (1 de contador pós-sucesso, 2 de contagem de casts `::text`). Total vs. a base: **+104**. Zero testes removidos; nenhuma asserção pré-existente enfraquecida (conferido no diff: os 3 commits só adicionam blocos `it(...)`, sem editar nenhuma asserção existente)
- **Integration (escopo restrito)**: `npx jest --testMatch "**/__tests__/integration/oficinaImport.test.ts"` — **9 passed, 9 total** (era 8 na iteração 2; +1, o teste de 5MB). O script completo `npm run test:integration` **não foi executado** e nenhum outro arquivo de `__tests__/integration/` foi rodado
- **Re-execução pós-restauração de `node_modules`**: idêntica (629/641 unit, 9/9 integração) — a restauração via `npm ci` não alterou nenhum resultado
- **Não verificável nesta sessão (restrição absoluta de banco, sem mudança nas 3 iterações)**: execução das 3 queries de comunidade contra Postgres real; aplicação de `scripts/migration-oficina-importada.sql`; `__tests__/integration/rotaService.test.ts:57` (a asserção literal de `STATUS = BACKLOG`)

---

## Observações não-bloqueantes (não são gaps de AC; para o time, não para um novo fix-round automático)

- **O2 — sem compensação para falha pós-vínculo**: se `garantirVinculo` gravou o vínculo (ou `buscarOuCriarOficina` criou a oficina) e um passo seguinte lança, os registros **persistem** mas a linha é reportada só como `ERRO_PROCESSAMENTO`, sem contador. O `delete` compensatório de `service/oficinaImportService.ts:362` só cobre falha de geocodificação. O fix `9e23208` trocou over-reporting por under-reporting; o `spec.md` não define a semântica dos contadores nesse caminho, e o invariante novo (`total_linhas == sucessos + erros`) é o mais defensável. Se o time quiser exatidão, o caminho é uma transação por linha, não mais um contador.
- **O2b — o branch `atribuirRota` lança não tem teste próprio**: o teste novo cobre `garantirVinculo`; `atribuirRota` compartilha exatamente o mesmo `try`/`catch` e a mesma posição relativa aos contadores, então está coberto por construção, não por asserção. Custo de fechar: um teste de 8 linhas com `assignOficinaFromCommunitySignup` mockado para rejeitar.
- **O3 — mensagem do 400 de 5MB não é traduzida**: o `multer` devolve `"File too large"` e `routes/OficinaRoute.ts:26-35` repassa esse texto cru, diferente dos outros 400 do endpoint (todos em português). O spec só exige o status 400, então não é violação de AC — mas é inconsistência de UX para o consumidor do endpoint.
- **O4 — asserção de casts conta, não localiza**: `expect(castCount).toBe(18)` mata qualquer remoção de cast, mas um refactor que **mova** um cast (ex.: tirar de `ce."numero"` e pôr em `ce."latitude"`) mantém 18 e sobreviveria. Endurecimento barato, se o time quiser: trocar a contagem por asserções por coluna (`expect(query).toContain('o."NUMERO"::text')`). Como está, cobre o cenário de regressão realista (remoção acidental).
- **O5 — OpenAPI sem corpo multipart** (deferido explicitamente em `tasks.md`): `schemas.body` é omitido de propósito em T12, então `utils/routeDocumentation.ts` não emite `request.body` e `ImportOficinasBodySchema` não aparece no spec gerado. O contrato multipart existe só em prosa na `description` da rota. Gap de documentação, não de comportamento — aceito nas três iterações.
- **O6 — `scripts/migration-oficina-importada.sql` segue sendo passo manual de DBA**, e as 3 queries de comunidade seguem sem nenhuma execução contra Postgres real. Nenhum dos dois é executável sob a restrição de não acessar banco. **Recomendação de release**: antes do deploy, rodar a migration e um smoke test das 3 rotas de comunidade em staging — é o único risco que nenhuma das três iterações de verificação pôde tocar.

---

## Correções ao relatório da iteração 2

Três pontos do relatório anterior não se sustentaram na re-verificação (nenhum material):

1. **Contagem de commits do re-check**: o prompt/relatório falava de "4 novos commits" sobre `a0a0edc`; `git log --oneline a0a0edc..HEAD` mostra **3** (`9e23208`, `b52c49e`, `fa0f9ad`).
2. **Citação de `rotaService.test.ts`**: a iteração 2 citou `:694 - expect(result.atribuicoes[0].status).toBe('atribuida')`. A linha 694 é essa asserção, correto — mas ela citou também `:697` como `resumo.atribuidas`, que confere; o desvio real está em `:717`, que a iteração 2 atribuiu ao caso "promotor mais próximo" — verificado e correto (`expect(result.atribuicoes[0].promotor!.ID_PROMOTOR).toBe(9)`). Sem correção material; re-conferido.
3. **Números de linha dos testes de IMPORT-14**: a iteração 2 citou `:623-625` para o teste de IMPORT-14; com o teste novo de contador inserido antes, as linhas corretas no HEAD são **`:639-641`**. Todas as citações desta tabela foram re-conferidas contra o HEAD `fa0f9ad`.

---

## Requirement Traceability Update

| Requirement | Status na iteração 2 | Novo status |
| ----------- | -------------------- | ----------- |
| IMPORT-01 | ✅ Verified | ✅ Verified |
| IMPORT-02 | ✅ Verified | ✅ Verified |
| IMPORT-03 | ✅ Verified | ✅ Verified |
| IMPORT-04 | ⚠️ Parcial (5MB sem evidência) | ✅ **Verified** (os dois gatilhos com citação; 5MB morto por 2 mutações) |
| IMPORT-05 | ✅ Verified | ✅ Verified |
| IMPORT-06 | ✅ Verified | ✅ Verified |
| IMPORT-07 | ✅ Verified | ✅ Verified |
| IMPORT-08 | ✅ Verified | ✅ Verified |
| IMPORT-09 | ✅ Verified | ✅ Verified |
| IMPORT-10 | ✅ Verified | ✅ Verified |
| IMPORT-11 | ✅ Verified | ✅ Verified |
| IMPORT-12 | ✅ Verified | ✅ Verified |
| IMPORT-13 | ✅ Verified | ✅ Verified |
| IMPORT-14 | ✅ Verified | ✅ Verified |
| IMPORT-15 | ✅ Verified | ✅ Verified |
| IMPORT-16 | ✅ Verified por reuso | ✅ Verified por reuso |
| IMPORT-17 | ⚠️ Verified por reuso (asserção de `BACKLOG` só em teste DB-dependente) | ✅ Verified por reuso (ressalva de escopo de execução mantida, evidence-or-zero satisfeito) |
| IMPORT-18 | ✅ Verified por reuso | ✅ Verified por reuso |
| IMPORT-19 | ✅ Verified por reuso | ✅ Verified por reuso |
| IMPORT-20 | ⚠️ Spec-precision gap | ⚠️ Spec-precision gap (não-bloqueante; reforçado pela asserção de casts, mas o *result set* só é provável com Postgres) |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 20/20 ACs com citação `file:line`; 19/20 casando exatamente o outcome do spec; 1 ⚠️ spec-precision gap não-bloqueante (IMPORT-20, estrutural à restrição de não acessar banco)
**Sensor**: 6 execuções de mutação nas mudanças desta iteração, **6/6 mortas** — incluindo a réplica exata do único mutante que sobreviveu em três iterações. Árvore real verificadamente intocada antes e depois (`git status --porcelain` vazio; `HEAD` em `fa0f9ad`)
**Gate**: `tsc` com 2 erros pré-existentes re-provados e zero novos; unit 629 passed / 12 failed (as mesmas 12 pré-existentes, em 3 suítes intocadas pela feature) / 641 total, +3 vs. iteração 2 e +104 vs. a base; integração restrita 9/9

**O que esta rodada realmente entregou** (verificado, não aceito por commit message):
1. Teste de integração que sobe um buffer de 6MB de verdade contra o `multer` real, fechando a metade órfã de IMPORT-04 — e que morre tanto se o teto for removido quanto se for elevado.
2. Asserção exata de contagem de casts (`toBe(18)`) nas duas queries de UNION, cuja contagem eu re-derivei coluna a coluna no SQL real (9 × 2 em cada método) e cuja discriminação matou o mutante que sobrevivia desde a iteração 1.
3. Um fix de correção que ninguém pediu e que é genuinamente certo: contadores de sucesso só avançam depois que a linha inteira processou, cobrindo `garantirVinculo` **e** `atribuirRota`, com teste que ataca o passo correto e sem mudar o significado de nenhum dos outros 640 testes (provado rodando a suíte inteira sob a mutação inversa).
4. `console.error` no `catch` por linha, fechando a última ressalva de padrão de código da iteração 2.

**Issues found**: nenhum gap bloqueante. Seis observações não-bloqueantes (O2, O2b, O3, O4, O5, O6) registradas acima, todas com o custo de fechamento explícito. A única de peso operacional é **O6**: a migration e as 3 queries de comunidade nunca foram exercitadas contra Postgres em nenhuma das três iterações — smoke test em staging antes do release.

**Next steps**: marcar a feature como concluída. Rodar `scripts/migration-oficina-importada.sql` e um smoke test das rotas de comunidade em staging antes do deploy (O6). As observações O2-O5 ficam a critério do time — nenhuma justifica outra rodada de fix.
