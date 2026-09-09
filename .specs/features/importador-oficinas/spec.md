# Importador de Oficinas (Módulo de Promotores) Specification

**Jira:** [CON26-162](https://oficinabrasil.atlassian.net/browse/CON26-162) — Base própria de oficinas da indústria no módulo de promotores — vínculo, rotas e mapa

## Problem Statement

A indústria não consegue subir sua própria carteira de oficinas dentro do módulo de promotores — hoje o único jeito de uma oficina entrar na cobertura de um cliente é via inscrição de um usuário na comunidade (`OFICINA_PORTAL.COMMUNITIES` → `USUARIO_COMMUNITY` → `USUARIO`). Isso impede o planejamento de visitas para o portfólio próprio do cliente e gera duplicidade de cadastro quando a oficina já existe na nossa base. Este backend expõe um endpoint de importação (planilha → oficinas vinculadas ao cliente) que o wizard de campanha (ob-ads, repositório separado) vai acionar a partir de um botão no step 3.

## Goals

- [ ] Endpoint que aceita `.xlsx`/`.csv` com um padrão fixo de colunas e rejeita imediatamente qualquer arquivo fora do padrão
- [ ] Deduplicação por CNPJ contra `MAIN_REGISTER.OFICINA`: linka pelo `ID_OFICINA` quando o CNPJ já existe; cria uma nova oficina quando não existe
- [ ] Geocodificação (CEP → lat/long) preenchida em `MAIN_REGISTER.OFICINA`, condição para a oficina aparecer no mapa
- [ ] Vínculo da oficina ao cliente (`EMPRESA_SLUG`) sem depender de um usuário/comunidade — suporta oficinas "órfãs" de usuário
- [ ] Oficina já vinculada à comunidade do cliente (com ou sem usuário) não é duplicada — apenas tem lat/long preenchido se estiver faltando
- [ ] Oficinas importadas entram no cálculo de atribuição de rota do promotor (por raio), tanto no momento do import quanto em qualquer atribuição futura (novo promotor, recálculo de raio)

## Out of Scope

| Feature | Reason |
|---|---|
| Botão "Importar oficinas" no wizard (frontend) | Vive no repositório `ob-ads`, fora deste repo. Este spec cobre apenas o contrato do endpoint que o botão vai chamar. |
| Atualizar/editar oficina já existente com os dados da planilha | Deduplicação por CNPJ é só vínculo — nunca sobrescreve `NOME_FANTASIA`/`ENDERECO`/etc. de uma oficina já cadastrada. |
| Escrever em `dw.cadastro_empresa` | Tabela do data warehouse, alimentada por ETL externo. Lat/long geocodado é gravado só em `MAIN_REGISTER.OFICINA`. |
| Desfazer/reverter um lote de importação | Sem endpoint de rollback nesta iteração; correções são manuais. |
| Processamento assíncrono/em fila de arquivos grandes | Processamento é síncrono dentro do request, limitado por um teto de linhas (ver Assumptions). |
| Import antes de a campanha existir (rascunho de wizard) | Decisão do usuário: o endpoint sempre opera contra uma campanha já persistida (`ID_CAMPANHA` existente). |
| Recalcular rotas de oficinas pré-existentes ao importar | Território de `raio-recalc-e-oficinas-comunidade`; este import só tenta atribuir a oficina recém-vinculada, não reprocessa rotas já criadas. |

---

## Assumptions & Open Questions

Decisões de arquitetura com impacto direto em schema (nova tabela, gravação em `MAIN_REGISTER.OFICINA`, timing do import) foram confirmadas diretamente com o usuário antes desta spec (ver linhas marcadas `Confirmado?=y (usuário)`). As demais são defaults de implementação de baixo risco, registrados aqui para não ficarem silenciosamente indefinidos.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
|---|---|---|---|
| CNPJ novo (não encontrado em `MAIN_REGISTER.OFICINA`) | Cria nova oficina em `MAIN_REGISTER.OFICINA` a partir dos dados da planilha | Alinhado ao objetivo do Jira ("indústria sobe base própria"); dedup por CNPJ não pode significar "rejeita oficina nova" | y (usuário) |
| Vínculo de oficina sem usuário ao cliente | Nova tabela `CAMPANHAS_OB.OFICINA_IMPORTADA` (`ID_OFICINA` + `EMPRESA_SLUG`), consultada em paralelo (UNION) às queries de comunidade existentes | Não altera a semântica de `USUARIO_COMMUNITY` (que hoje sempre representa um usuário real); isolado e reversível via migration própria | y (usuário) |
| Momento do import no wizard | Sempre contra `ID_CAMPANHA` já persistido | Endpoint sempre tem um destino concreto (`Campanha.EMPRESA_SLUG`) para vincular; sem estado "rascunho" para gerenciar | y (usuário) |
| Falha de geocodificação (CEP não resolve em nenhum provedor) | Rejeita a linha (não cria/vincula oficina); reportada como erro específico; demais linhas seguem processadas | Escolha do usuário — nunca existe oficina importada sem lat/long | y (usuário) |
| Correspondência de colunas do cabeçalho | Nome exato (`NOME OFICINA`, `CNPJ`, `CEP`, `ENDEREÇO`, `NUMERO`, `ESTADO`, `CIDADE`), comparação *case*- e acento-insensível, mesma ordem, sem colunas extras nem faltantes | "Padrão de colunas" do requisito é tratado como contrato estrito — mas tolerante a variação trivial de maiúsculas/acentos, comum em planilhas exportadas manualmente | n |
| Falha estrutural do cabeçalho | Rejeita o arquivo inteiro antes de processar qualquer linha (nenhuma escrita) | Requisito explícito do usuário | y (usuário) |
| Normalização de CNPJ (arquivo e banco) | Extrai dígitos, exige exatamente 14; reutiliza a mesma convenção de `utils/sqlCadastroEmpresa.ts` (`cnpjIntParaLigacao`) | Consistência com a lógica de ligação CNPJ já testada e usada no resto do sistema | n |
| CNPJ duplicado dentro do mesmo arquivo | Primeira ocorrência processada; ocorrências seguintes marcadas como erro de linha ("CNPJ duplicado no arquivo") | Evita duas tentativas de escrita para o mesmo CNPJ na mesma transação lógica | n |
| Falha de validação em uma linha (CNPJ inválido, CEP vazio, etc.) | Só aquela linha é rejeitada e reportada; o restante do arquivo continua sendo processado | Rejeição total é reservada para falha estrutural (cabeçalho); erro de conteúdo é por linha, padrão comum de import em lote | n |
| Teto de tamanho/linhas do arquivo | 5MB (limite do `multer`) e 5.000 linhas de dados; arquivo acima do teto de linhas é rejeitado por inteiro antes de processar | Mesma ordem de grandeza do teto já usado em `SegmentacaoService.previewContactsAll` (`MAX_CONTATOS = 5000`); processamento é síncrono no request, teto evita timeout | n |
| `EMPRESA_SLUG` do vínculo | Resolvido no servidor a partir de `Campanha.EMPRESA_SLUG` (via `ID_CAMPANHA` recebido) — nunca aceito diretamente do cliente | Evita spoofing/inconsistência entre o `EMPRESA_SLUG` enviado e o real dono da campanha | n |
| Oficina já vinculada a OUTRO cliente (`EMPRESA_SLUG` diferente) | Cria um novo vínculo em `OFICINA_IMPORTADA` para o novo `EMPRESA_SLUG` — a mesma oficina física pode pertencer a mais de um cliente | Não há indicação de exclusividade de oficina por cliente em nenhuma spec existente | n |
| Rota não atribuível (nenhum promotor no raio) | Não é erro — oficina é importada/vinculada normalmente, só não ganha uma `ROTA_PROMOTOR` | Mesmo comportamento de `auto-assign-rotas` e `assign-oficina-community-signup` | n |

**Open questions:** none — todas resolvidas ou registradas acima.

---

## User Stories

### P1: Upload e validação estrutural da planilha ⭐ MVP

**User Story**: Como indústria (cliente), quero enviar uma planilha `.xlsx` ou `.csv` com minha base de oficinas, para que o sistema recuse imediatamente qualquer arquivo fora do padrão esperado, sem processar nada.

**Why P1**: É o portão de entrada de todo o fluxo — sem essa validação, dados malformados poderiam corromper o processamento seguinte.

**Acceptance Criteria**:

1. WHEN o cliente envia um arquivo `.xlsx` ou `.csv` com a primeira linha exatamente `NOME OFICINA; CNPJ; CEP; ENDEREÇO; NUMERO; ESTADO; CIDADE` (comparação case/acento-insensível, mesma ordem) THEN o sistema SHALL prosseguir com o processamento das linhas de dados
2. IF o arquivo enviado não é `.xlsx` nem `.csv` THEN o sistema SHALL responder 400 e SHALL NOT processar qualquer linha
3. IF a primeira linha do arquivo não contém exatamente as 7 colunas esperadas (nomes e ordem) THEN o sistema SHALL responder 400 com a lista de colunas esperada e SHALL NOT criar, atualizar ou vincular nenhuma oficina
4. IF o arquivo excede 5MB ou 5.000 linhas de dados THEN o sistema SHALL responder 400 e SHALL NOT processar qualquer linha
5. IF `ID_CAMPANHA` não corresponde a uma campanha existente (`DELETED_AT IS NULL`) THEN o sistema SHALL responder 404 e SHALL NOT processar o arquivo
6. IF a campanha encontrada não possui `EMPRESA_SLUG` configurado THEN o sistema SHALL responder 422 e SHALL NOT processar o arquivo

**Independent Test**: Enviar arquivos com cabeçalho correto/incorreto/fora de ordem/faltando coluna e verificar que só o cabeçalho exato é aceito; nenhuma oficina é criada nos casos de rejeição.

---

### P1: Deduplicação e criação de oficina por CNPJ ⭐ MVP

**User Story**: Como sistema, quero verificar cada CNPJ da planilha contra `MAIN_REGISTER.OFICINA` antes de qualquer escrita, para nunca duplicar uma oficina já cadastrada e ainda assim aceitar oficinas totalmente novas.

**Why P1**: É o requisito central do Jira — sem isso, toda importação duplicaria cadastro.

**Acceptance Criteria**:

1. WHEN uma linha tem um CNPJ (14 dígitos após normalização) que já existe em `MAIN_REGISTER.OFICINA` THEN o sistema SHALL reutilizar o `ID_OFICINA` existente e SHALL NOT sobrescrever `NOME_FANTASIA`, `ENDERECO`, `NUMERO`, `ESTADO`, `CIDADE` ou `CEP` já cadastrados
2. WHEN uma linha tem um CNPJ que não existe em `MAIN_REGISTER.OFICINA` THEN o sistema SHALL criar uma nova oficina com `NOME_FANTASIA`, `CNPJ`, `CEP`, `ENDERECO`, `NUMERO`, `ESTADO`, `CIDADE` da planilha e `ORIGEM = "IMPORTACAO_PLANILHA"`
3. IF o CNPJ de uma linha não normaliza para exatamente 14 dígitos THEN o sistema SHALL rejeitar apenas aquela linha, reportando o motivo, e SHALL continuar processando as demais linhas
4. IF um CNPJ aparece mais de uma vez no arquivo THEN o sistema SHALL processar a primeira ocorrência e SHALL rejeitar as ocorrências seguintes reportando "CNPJ duplicado no arquivo"

**Independent Test**: Importar uma planilha com um CNPJ já cadastrado e outro novo; verificar que não surge uma segunda linha em `MAIN_REGISTER.OFICINA` para o CNPJ existente e que uma nova linha é criada só para o CNPJ inédito.

---

### P1: Geocodificação e vínculo ao cliente sem exigir usuário ⭐ MVP

**User Story**: Como indústria, quero que minhas oficinas importadas apareçam no mapa e fiquem associadas ao meu cliente mesmo quando não têm um usuário cadastrado na comunidade, para que eu possa enxergar e cobrir meu portfólio próprio.

**Why P1**: Sem isso, a oficina importada nunca aparece no mapa nem entra em qualquer fluxo de rota — o import seria inútil na prática.

**Acceptance Criteria**:

1. WHEN uma oficina (nova ou existente) não possui `LATITUDE`/`LONGITUDE` preenchidos THEN o sistema SHALL geocodificar o CEP da linha e SHALL preencher `LATITUDE`/`LONGITUDE` em `MAIN_REGISTER.OFICINA`
2. IF a geocodificação falhar (nenhum provedor resolve o CEP) THEN o sistema SHALL rejeitar apenas aquela linha, reportando o motivo, e SHALL NOT criar ou vincular a oficina
3. WHEN a oficina resultante (nova ou existente) ainda não está vinculada ao `EMPRESA_SLUG` da campanha (nem via `USUARIO_COMMUNITY`, nem via `OFICINA_IMPORTADA`) THEN o sistema SHALL criar um vínculo em `CAMPANHAS_OB.OFICINA_IMPORTADA`
4. WHILE a oficina já está vinculada ao `EMPRESA_SLUG` da campanha (com ou sem usuário) THE sistema SHALL NOT criar um novo vínculo, apenas preencher `LATITUDE`/`LONGITUDE` caso estivessem faltando
5. The sistema SHALL permitir que a mesma oficina física esteja vinculada a mais de um `EMPRESA_SLUG` simultaneamente

**Independent Test**: Importar a mesma planilha duas vezes para o mesmo `EMPRESA_SLUG`; verificar que a segunda execução não cria vínculos novos em `OFICINA_IMPORTADA` (idempotência) e reporta as oficinas como "já na comunidade".

---

### P1: Atribuição de rota do promotor para oficinas importadas ⭐ MVP

**User Story**: Como indústria, quero que minhas oficinas importadas sejam automaticamente atribuídas a um promotor da campanha (quando dentro do raio de atuação), para que a visita possa ser planejada sem trabalho manual adicional.

**Why P1**: É o critério de sucesso do Jira — sem rota atribuída, a oficina aparece no mapa mas nunca vira uma visita.

**Acceptance Criteria**:

1. WHEN uma oficina é vinculada (nova ou recém-vinculada) e possui `LATITUDE`/`LONGITUDE` válidos THEN o sistema SHALL buscar, entre os promotores da campanha informada (`CAMPANHA_PROMOTOR` com `PROMOTOR.LATITUDE`/`LONGITUDE` não nulos), o de menor distância Haversine dentro do seu raio (`CAMPANHA_PROMOTOR.RAIO`, default 20km)
2. WHEN um promotor elegível é encontrado THEN o sistema SHALL criar uma `ROTA_PROMOTOR` (`STATUS = BACKLOG`) vinculando a oficina a esse promotor
3. IF nenhum promotor da campanha alcança a oficina dentro do raio THEN o sistema SHALL NOT criar rota para aquela oficina e SHALL reportar "sem_promotor_disponivel", sem tratar como erro
4. IF a oficina já possui uma rota ativa nesta campanha (qualquer promotor) THEN o sistema SHALL NOT criar uma nova rota (idempotência)
5. WHILE outras consultas de "oficinas da comunidade" (usadas por atribuição automática ao cadastrar promotor e por recálculo de raio) já existem no sistema, o sistema SHALL incluir as oficinas de `OFICINA_IMPORTADA` nessas consultas, para que atribuições futuras (novo promotor, raio recalculado) também considerem as oficinas importadas

**Independent Test**: Importar uma oficina dentro do raio de um promotor já vinculado à campanha; verificar que uma `ROTA_PROMOTOR` com `STATUS = BACKLOG` é criada para esse promotor. Importar uma oficina fora de qualquer raio; verificar que nenhuma rota é criada e o relatório indica "sem_promotor_disponivel".

---

## Edge Cases

- IF o arquivo não é `.xlsx`/`.csv`, THEN o sistema SHALL responder 400 sem processar nada
- IF a planilha tem cabeçalho válido mas zero linhas de dados THEN o sistema SHALL responder 200 com `total_linhas: 0` e nenhuma criação
- IF `ID_CAMPANHA` não existe ou está com `DELETED_AT` preenchido THEN o sistema SHALL responder 404
- IF a campanha existe mas não tem `EMPRESA_SLUG` THEN o sistema SHALL responder 422
- IF uma linha tem CEP vazio ou ausente THEN o sistema SHALL rejeitar a linha (não há como geocodificar)
- IF duas linhas do arquivo têm o mesmo CNPJ THEN a segunda SHALL ser rejeitada como duplicada no arquivo
- IF a oficina já pertence a outro `EMPRESA_SLUG` (não o da campanha atual) THEN o sistema SHALL criar um vínculo adicional para o `EMPRESA_SLUG` atual, sem afetar o vínculo existente do outro cliente
- IF nenhum promotor da campanha tem coordenadas THEN todas as oficinas importadas SHALL ser reportadas como "sem_promotor_disponivel", sem erro

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| IMPORT-01 | P1: Upload e validação estrutural | Design | Pending |
| IMPORT-02 | P1: Upload e validação estrutural | Design | Pending |
| IMPORT-03 | P1: Upload e validação estrutural | Design | Pending |
| IMPORT-04 | P1: Upload e validação estrutural | Design | Pending |
| IMPORT-05 | P1: Upload e validação estrutural | Design | Pending |
| IMPORT-06 | P1: Upload e validação estrutural | Design | Pending |
| IMPORT-07 | P1: Deduplicação e criação por CNPJ | Design | Pending |
| IMPORT-08 | P1: Deduplicação e criação por CNPJ | Design | Pending |
| IMPORT-09 | P1: Deduplicação e criação por CNPJ | Design | Pending |
| IMPORT-10 | P1: Deduplicação e criação por CNPJ | Design | Pending |
| IMPORT-11 | P1: Geocodificação e vínculo sem usuário | Design | Pending |
| IMPORT-12 | P1: Geocodificação e vínculo sem usuário | Design | Pending |
| IMPORT-13 | P1: Geocodificação e vínculo sem usuário | Design | Pending |
| IMPORT-14 | P1: Geocodificação e vínculo sem usuário | Design | Pending |
| IMPORT-15 | P1: Geocodificação e vínculo sem usuário | Design | Pending |
| IMPORT-16 | P1: Atribuição de rota do promotor | Design | Pending |
| IMPORT-17 | P1: Atribuição de rota do promotor | Design | Pending |
| IMPORT-18 | P1: Atribuição de rota do promotor | Design | Pending |
| IMPORT-19 | P1: Atribuição de rota do promotor | Design | Pending |
| IMPORT-20 | P1: Atribuição de rota do promotor | Design | Pending |

**ID format:** `IMPORT-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 20 total, 20 mapped to design, 0 unmapped

---

## Success Criteria

- [ ] Uma planilha fora do padrão de colunas é rejeitada em menos de 1 request, sem nenhuma escrita no banco
- [ ] Reimportar a mesma planilha para o mesmo cliente não duplica oficinas nem vínculos (idempotente)
- [ ] Toda oficina importada com CEP geocodificável aparece no mapa (lat/long preenchidos)
- [ ] Oficinas importadas dentro do raio de um promotor da campanha recebem `ROTA_PROMOTOR` automaticamente
- [ ] Zero oficinas duplicadas em `MAIN_REGISTER.OFICINA` para CNPJs já cadastrados
