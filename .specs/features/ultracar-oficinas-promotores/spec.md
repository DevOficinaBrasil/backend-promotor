# Base de Oficinas da Ultracar nos Promotores Specification

## Problem Statement

A Ultracar mantém sua própria base de oficinas (`ultracar_process.enterprise__tb_company` + `enterprise__tb_company_address` + `st_obads_im`), fora de `MAIN_REGISTER.OFICINA`/`dw.cadastro_empresa`. Nenhuma das tabelas da Ultracar expõe telefone da oficina, então uma oficina que só existe na base da Ultracar (sem CNPJ correspondente na nossa base) não tem nenhum canal de contato hoje — mostrá-la ao cliente seria uma oficina "visível mas incontatável". Já uma oficina com CNPJ correspondente na nossa base tem usuário/telefone reais via `MAIN_REGISTER.OFICINA`/`USUARIO`, então pode ser contatada normalmente. O problema a resolver é mais estreito do que "trazer a base da Ultracar inteira": é liberar a visibilidade de oficinas que **já são nossas** (por CNPJ) para qualquer cliente, mesmo fora da comunidade dele, usando a base da Ultracar só como sinal de que aquela oficina é relevante.

**Revisão (Jira [CON26-408](https://oficinabrasil.atlassian.net/browse/CON26-408))**: a "tratativa" que faltava para oficina sem match (bloqueada desde a revisão anterior desta spec) é registrá-la na nossa base — depois de criada, ela passa a ter CNPJ correspondente e a regra de match já definida (acima) passa a valer para ela normalmente, sem nenhuma lógica nova de visibilidade. O ticket também pede marcar toda oficina casada com um atributo "também é Ultracar" e completar campos de endereço vazios com dado da Ultracar — enriquecimento de dado, não mudança de regra de visibilidade.

## Goals

- [ ] Oficina com CNPJ correspondente entre a base da Ultracar e `MAIN_REGISTER.OFICINA`/`dw.cadastro_empresa` aparece para **qualquer** cliente nas consultas de comunidade do módulo de promotores, mesmo sem pertencer à comunidade dele
- [ ] Oficina da Ultracar sem CNPJ correspondente na nossa base **não aparece** em nenhuma consulta nem entra no cálculo de rota, até existir uma forma de contatá-la
- [ ] Nenhuma oficina da Ultracar é escrita em `MAIN_REGISTER.OFICINA` — a identificação acontece por leitura (JOIN/consulta), nunca por cópia
- [ ] As consultas que passam a considerar a base da Ultracar respeitam o timeout de 10 segundos já em vigor no banco
- [ ] Script de correção de CEP (oficinas já vinculadas por CNPJ cujo CEP diverge do CEP da Ultracar) com modo de teste, limitado a oficinas sem atualização de endereço nos últimos 12 meses
- [ ] Sobreposição real por CNPJ medida entre `ultracar_process.st_obads_im` e a base da OB (CON26-408): **1.988 de 3.652 CNPJs distintos (54%) já têm match**; **1.664 (46%) não têm** — medido em produção, só `SELECT`, ver design.md
- [ ] Toda oficina com CNPJ casado ganha o atributo `OFICINA."ULTRACAR" = true` e tem seus campos de endereço vazios completados com dado da Ultracar, sem nunca sobrescrever um campo já preenchido
- [ ] Script de disparo único registra em `MAIN_REGISTER.OFICINA` as oficinas ativas da Ultracar sem match — a partir daí elas passam a aparecer pela regra de match já definida, sem mudança adicional nas consultas

## Out of Scope

| Feature | Reason |
|---|---|
| Alterar o contrato de qualquer endpoint de API existente | Requisito explícito do usuário — o formato de request/response dos endpoints do módulo de promotores não muda |
| Criar/gravar oficina da Ultracar em `MAIN_REGISTER.OFICINA` | Requisito explícito do usuário — a oficina da Ultracar nunca é materializada nessa tabela |
| Oficina Ultracar **sem** CNPJ correspondente na nossa base aparecer em qualquer consulta ou entrar no cálculo de rota | Decisão do usuário após revisão da spec: sem telefone, não há como contatar essa oficina — mostrá-la seria oficina visível e incontatável. Fica bloqueado até existir alguma tratativa de contato (fora desta spec) |
| Buscar telefone da oficina a partir das tabelas da Ultracar | Nenhuma das três tabelas (`enterprise__tb_company`, `enterprise__tb_company_address`, `st_obads_im`) expõe telefone — é exatamente o motivo da regra acima |
| Endereço/latitude/longitude/cidade vindos da Ultracar para exibição | Oficina com match usa o endereço já cadastrado em `MAIN_REGISTER.OFICINA`/`dw.cadastro_empresa` (fonte já confiável); oficina sem match não aparece, então não precisa de endereço da Ultracar para exibição. O endereço da Ultracar é usado só internamente, pelo script de correção de CEP (P2) |
| Busca de oficinas do admin (`OficinaService.buscarOficinasBase`, `opcoesFiltroBusca`, `cidadesPorUf`) | Opera só sobre `MAIN_REGISTER.OFICINA`/`dw.cadastro_empresa`; não é uma consulta de "oficinas da comunidade" nem de cálculo de rota do promotor — fora do pedido original |
| `OficinaService.findNearestOficinas` (endpoint `/oficina/nearby` genérico) | Não é filtrado por `EMPRESA_SLUG`/comunidade — fora do escopo "oficinas da comunidade do cliente" definido nesta spec |
| Bypass de comunidade em `OficinaService.getSegmentedNearbyOficinas` | Esse método não recebe `EMPRESA_SLUG`/conceito de comunidade — filtra por uma lista de contatos do CRM (segmentação). "Pertencer à comunidade" não se aplica a ele; ver Assumptions |
| Aplicar a correção de CEP do script a oficinas sem match de CNPJ | O script só corrige oficina que já existe na nossa base (match por CNPJ) — oficina sem match não tem linha em `MAIN_REGISTER.OFICINA` para corrigir, e nem aparece nas consultas |
| Executar a DDL de qualquer tabela/índice novo que o Design definir | Decisão explícita do usuário — toda DDL é revisada e rodada manualmente, nunca por este trabalho |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
|---|---|---|---|
| Regra de visibilidade (revisão) | Oficina **com** match de CNPJ aparece para qualquer cliente, independente de comunidade. Oficina **sem** match não aparece em nenhuma consulta nem entra em cálculo de rota | Confirmado com o usuário: sem telefone, oficina sem match é incontatável — mostrá-la seria pior do que não mostrar. Substitui a regra anterior (sem match aparecia para qualquer cliente; com match seguia a regra de comunidade) | y (usuário) |
| Escopo do "aparecer para qualquer cliente" | Vale para **todo** cliente/`EMPRESA_SLUG` — a oficina com match deixa de depender de pertencer à comunidade de quem consulta | Mantido da clarificação anterior desta spec, ainda válido com a regra invertida | y (usuário) |
| Fonte do "match" de CNPJ | União de `MAIN_REGISTER.OFICINA."CNPJ"` (dígitos) e `dw.cadastro_empresa.cnpj_int`, reaproveitando a convenção já usada em `utils/sqlCadastroEmpresa.ts` (`cnpjIntDaOficina`/`cnpjIntParaLigacao`) | É a mesma definição de "nossa base" já usada em todo o resto do sistema para ligar CNPJ | n |
| Consultas em escopo do bypass de comunidade | Os métodos de `OficinaService` que filtram por `EMPRESA_SLUG`/comunidade: `getComunityNearbyOficinas`, `getCommunityOficinas`, `countCommunityOficinas`, `getCommunityOficinasSegmentadas`. `getSegmentedNearbyOficinas` fica fora (não tem conceito de comunidade — ver Out of Scope) | São os únicos onde "pertencer à comunidade" é literalmente uma condição da query hoje; só eles fazem sentido para "bypassar" essa condição | n |
| Endereço exibido para oficina com match | Sempre o já cadastrado em `MAIN_REGISTER.OFICINA`/`dw.cadastro_empresa` — nunca o da Ultracar | A oficina já existe na nossa base; usar o endereço da Ultracar só criaria divergência com o que o resto do sistema já exibe para essa oficina | y (usuário, implícito na regra de não mexer em exibição) |
| Fonte do CEP "da Ultracar" para o script de correção (P2) | `ultracar_process.enterprise__tb_company_address` (coluna `zip_code`, confirmado presente em 100% das 6.103 linhas) | Único lugar com CEP "cadastral" estável da Ultracar; `st_obads_im.cep` é por nota fiscal, pode variar/estar desatualizado | n |
| Campo de "atualização cadastral recente" (CEP) | `MAIN_REGISTER.OFICINA."DATA_ATUALIZACAO_ENDERECO"` (já existe, criado pelo backend-communities especificamente para marcar a última confirmação de endereço — não `DATA_ALTERACAO`, que é genérico e muda a qualquer edição da linha) | É o campo certo para "endereço confirmado recentemente": `DATA_ALTERACAO` dispararia falso-negativo sempre que qualquer outro campo da oficina mudasse, mesmo sem relação com endereço | n |
| Modo de execução do script de correção de CEP | Segue a mesma convenção do script existente `scripts/atualizar-lat-long-comunidade.ts`: flag `--teste[=N]` roda em modo relatório/teto de N linhas antes de qualquer `UPDATE` real | Reaproveita um padrão já revisado e em uso no repositório para o mesmo tipo de operação | n |
| Estratégia de otimização para respeitar o timeout de 10s | Join explícito (`LEFT JOIN` com CTE de CNPJ normalizado) contra `MAIN_REGISTER.OFICINA`/`dw.cadastro_empresa`, nunca `EXISTS`/`OR` correlacionado | Medido durante a investigação técnica desta spec: a versão com `EXISTS` estourou o timeout de 10s; a reescrita como `LEFT JOIN` rodou em ~2s para a base Ultracar inteira (ver `.specs/STATE.md` AD-010) | y (medido) |
| `enterprise__tb_company_address`/`st_obads_im` continuam necessárias? | Só `enterprise__tb_company_address` (para o script de CEP, P2). `st_obads_im` não é mais necessária nesta spec — era usada só para endereço/cidade de oficina sem match, que não aparece mais | A inversão da regra elimina a necessidade de endereço/lat-long/cidade da Ultracar para exibição | y (consequência da regra invertida) |
| DDL de qualquer tabela/índice novo necessário | Nunca executada automaticamente nesta funcionalidade — script `.sql` gerado, revisado e rodado manualmente pelo usuário | Restrição explícita do usuário | y (usuário) |
| Acesso ao banco durante Design/Tasks/Execute | Somente `SELECT`, para conferência de schema/dados; nenhuma escrita fora dos scripts desta spec (que rodam fora do fluxo automatizado, com confirmação do usuário) | Restrição explícita do usuário | y (usuário) |
| Regra de prevalência pra completar campo vazio (CON26-408) | Só preenche campo da `OFICINA` que está `NULL`/vazio; nunca sobrescreve um valor já existente, de nenhum campo | Confirmado com o usuário — leitura literal do critério de aceite do ticket ("completar os campos **vazios**") | y (usuário) |
| Campos elegíveis para o preenchimento | `ENDERECO`, `NUMERO`, `BAIRRO`, `CEP`, `LATITUDE`, `LONGITUDE` (de `enterprise__tb_company_address`) e `CIDADE`/`ESTADO` (de `st_obads_im`, único lugar com esses dois campos — `enterprise__tb_company_address` não tem coluna de cidade/estado, e `zipcode__tb_city` está vazia). `CNPJ`, `NOME_FANTASIA`, `RAZAO_SOCIAL` e `TELEFONE` nunca são preenchidos/alterados por este fluxo (identidade, não endereço; telefone não existe na origem) | Campos de endereço são os únicos que o ticket pede para "completar"; mexer em identidade ou telefone a partir de um dado que a Ultracar não tem (telefone) ou que já define o match (CNPJ) não faz sentido | n |
| Atributo "também é Ultracar" | Coluna nova `MAIN_REGISTER.OFICINA."ULTRACAR"` (`boolean`, `NOT NULL DEFAULT false`) | Nome direto, consistente com o padrão de coluna única em maiúsculas já usado na entidade (`ATIVO`, `ROTA`, etc.) | n |
| Quando marcar a flag "também é Ultracar" | Em qualquer match de CNPJ com `enterprise__tb_company`, **independente** do campo `active` — é um atributo histórico/descritivo, não um gatilho de visibilidade | A regra de visibilidade (match-bypass) já tem seu próprio filtro de `active`; a flag é só metadado, não precisa herdar essa restrição | n |
| `ORIGEM` da oficina criada pelo registro de disparo único | `"ULTRACAR"` (valor novo em `MAIN_REGISTER.OFICINA."ORIGEM"`) | Confirmado com o usuário — mesmo padrão de proveniência já usado por `OFICINA.ORIGEM` (ex.: `IMPORTACAO_PLANILHA` do importador de oficinas), sem precisar de tabela nova | y (usuário) |
| Fonte de oficina a registrar (disparo único) | `ultracar_process.enterprise__tb_company` com `active = true` sem CNPJ correspondente em `MAIN_REGISTER.OFICINA` nem `dw.cadastro_empresa` — mesmo critério de match já usado nas consultas de comunidade | Consistência: é a mesma definição de "sem match" já validada e testada nas 4 consultas de comunidade | n |
| Idempotência do disparo único | Script é seguro de rodar mais de uma vez — re-execução não cria uma segunda linha para um CNPJ já registrado por execução anterior | "Disparo único" descreve a intenção de uso (uma vez), não uma garantia técnica de que será literalmente executado uma vez só; idempotência evita duplicata em caso de reexecução acidental | n |

**Open questions:** none — todas resolvidas ou registradas acima.

---

## User Stories

### P1: Oficina com match aparece para qualquer cliente, independente de comunidade ⭐ MVP

**User Story**: Como cliente do módulo de promotores, quero ver oficinas que já existem na nossa base e que a Ultracar também reconhece, mesmo que elas não pertençam à minha comunidade, para que meu promotor possa cobri-las normalmente — afinal elas têm contato real (telefone/usuário) na nossa base.

**Why P1**: É o requisito central após a revisão — só faz sentido abrir visibilidade cross-comunidade para oficina que pode de fato ser contatada.

**Acceptance Criteria**:

1. WHEN uma consulta de oficinas da comunidade (`getComunityNearbyOficinas`, `getCommunityOficinas`, `countCommunityOficinas` ou `getCommunityOficinasSegmentadas`) é executada para qualquer `EMPRESA_SLUG` THEN o sistema SHALL incluir no resultado as oficinas de `MAIN_REGISTER.OFICINA`/`dw.cadastro_empresa` cujo CNPJ (normalizado) corresponde a uma oficina ativa em `ultracar_process.enterprise__tb_company`
2. WHILE uma oficina tem CNPJ correspondente na base da Ultracar, o sistema SHALL incluí-la no resultado independentemente de ela pertencer à comunidade do `EMPRESA_SLUG` consultado
3. The sistema SHALL exibir, para essa oficina, os mesmos dados (nome, endereço, telefone, coordenadas) que a consulta já exibe hoje para uma oficina de comunidade — nunca dado vindo de `ultracar_process`
4. WHEN a oficina com match já pertence à comunidade do `EMPRESA_SLUG` consultado (pela regra já existente) THEN o sistema SHALL NOT incluí-la duas vezes no resultado (dedupe por `ID_OFICINA`)
5. The sistema SHALL NOT alterar o formato (nomes e tipos de campo) da resposta dos endpoints existentes que consomem essas consultas
6. The sistema SHALL identificar o match exclusivamente pelo CNPJ, comparando os dígitos do CNPJ de `ultracar_process.enterprise__tb_company` com os dígitos do CNPJ já cadastrado (que pode conter pontuação) — nunca por nome ou endereço

**Independent Test**: Tomar uma oficina com CNPJ que existe tanto em `MAIN_REGISTER.OFICINA` quanto em `ultracar_process.enterprise__tb_company` (ativa) e que NÃO pertence à comunidade de um `EMPRESA_SLUG` de teste; chamar `getComunityNearbyOficinas` para esse `EMPRESA_SLUG` com raio que a alcance e verificar que ela aparece, sem duplicata, com os dados da nossa base.

---

### P1: Oficina sem match não aparece em nenhuma consulta nem recebe rota

**User Story**: Como sistema, quero garantir que nenhuma oficina só conhecida pela Ultracar (sem CNPJ correspondente na nossa base) apareça para qualquer cliente ou receba uma rota de promotor, para nunca gerar uma expectativa de visita que não pode ser confirmada por falta de contato.

**Why P1**: É a trava de segurança da funcionalidade — sem ela, a inclusão da base da Ultracar criaria oficinas "fantasma" para o promotor.

**Acceptance Criteria**:

1. IF uma oficina de `ultracar_process.enterprise__tb_company` não tem CNPJ (normalizado) correspondente em `MAIN_REGISTER.OFICINA` nem em `dw.cadastro_empresa` THEN o sistema SHALL NOT incluí-la em nenhuma das consultas de comunidade listadas
2. The sistema SHALL NOT criar nenhuma linha em `MAIN_REGISTER.OFICINA` nem em `CAMPANHAS_OB.ROTA_PROMOTOR` para uma oficina da Ultracar sem match
3. The sistema SHALL NOT expor, em nenhum endpoint do módulo de promotores, um identificador de oficina que não corresponda a um `ID_OFICINA` real de `MAIN_REGISTER.OFICINA`
4. WHILE não existir uma forma de contato (telefone ou equivalente) para a oficina, o sistema SHALL manter essa exclusão — reavaliar exige uma nova decisão de produto, não é automático

**Independent Test**: Tomar uma oficina Ultracar ativa e confirmar (via consulta direta ao banco) que seu CNPJ não existe em `MAIN_REGISTER.OFICINA` nem em `dw.cadastro_empresa`; verificar que ela não aparece em nenhuma das 4 consultas de comunidade para nenhum `EMPRESA_SLUG` de teste, em nenhum raio.

---

### P1: Consultas com verificação de match na Ultracar respeitam o timeout de 10 segundos ⭐ MVP

**User Story**: Como operação do sistema, quero que verificar o match de CNPJ contra a base da Ultracar não estoure o timeout de banco já configurado, para não quebrar nenhuma tela de promotor que hoje funciona.

**Why P1**: Um timeout de consulta é uma regressão total da tela, não uma degradação parcial.

**Acceptance Criteria**:

1. The sistema SHALL completar cada uma das 4 consultas de comunidade em escopo (com a verificação de match contra `ultracar_process.enterprise__tb_company`) dentro do limite de 10 segundos já aplicado pelo banco, para os volumes de dados observados em produção
2. The sistema SHALL verificar o match usando `LEFT JOIN` com CTE de CNPJ normalizado (nunca `EXISTS`/`OR` correlacionado), conforme medido e registrado em `.specs/STATE.md` (AD-010)
3. The sistema SHALL NOT consultar `ultracar_process.st_obads_im` nem `ultracar_process.enterprise__tb_company_address` como parte dessas 4 consultas — nenhuma delas é necessária para decidir match ou para exibir a oficina
4. The sistema SHALL NOT remover nem afrouxar o timeout de 10 segundos já configurado como forma de acomodar a nova consulta

**Independent Test**: Medir o tempo de execução de cada uma das 4 consultas, com e sem a verificação de match, contra uma cópia/réplica com volume de produção; nenhuma delas SHALL ultrapassar 10 segundos.

---

### P2: Script de correção de CEP para oficinas já casadas com a Ultracar

**User Story**: Como responsável pela qualidade de dados, quero um script que aponte (e, quando confirmado, corrija) o CEP de oficinas nossas cujo CEP diverge do CEP registrado na Ultracar para o mesmo CNPJ, para manter o endereço correto sem reprocessar oficinas atualizadas recentemente.

**Why P2**: É uma correção de qualidade de dados complementar — não bloqueia a visibilidade cross-comunidade, mas evita endereço desatualizado se acumular silenciosamente.

**Acceptance Criteria**:

1. WHEN o script roda em modo de teste THEN o sistema SHALL apenas listar (sem gravar) as oficinas candidatas e o CEP atual vs. o CEP da Ultracar, limitado a um teto configurável de linhas processadas
2. WHEN o script roda fora do modo de teste, após validação do modo de teste THEN o sistema SHALL atualizar `MAIN_REGISTER.OFICINA."CEP"` apenas das oficinas candidatas, uma a uma
3. The sistema SHALL considerar "candidata" só a oficina que (a) tem CNPJ com match confirmado em `ultracar_process.enterprise__tb_company`, (b) tem CEP divergente (dígitos diferentes) do CEP de `ultracar_process.enterprise__tb_company_address` para esse CNPJ, e (c) não teve `DATA_ATUALIZACAO_ENDERECO` nos últimos 12 meses (ou nunca teve `DATA_ATUALIZACAO_ENDERECO` registrada)
4. IF a oficina teve `DATA_ATUALIZACAO_ENDERECO` dentro dos últimos 12 meses THEN o sistema SHALL excluí-la do cálculo de candidatas, mesmo que o CEP divirja
5. IF o CEP da Ultracar para aquele CNPJ está vazio/não resolvível THEN o sistema SHALL excluir a oficina da lista de candidatas, reportando o motivo
6. The sistema SHALL NOT executar nenhuma alteração de schema (DDL) — qualquer tabela/índice que o script precise é entregue como `.sql` separado, para execução manual

**Independent Test**: Rodar o script em modo de teste contra uma oficina conhecida com CEP propositalmente divergente e `DATA_ATUALIZACAO_ENDERECO` há mais de 12 meses; verificar que ela aparece no relatório sem nenhum `UPDATE` executado. Rodar fora do modo de teste e verificar que só o `CEP` dessa oficina foi alterado.

---

### P1: Marcar oficina como também-Ultracar e completar campos vazios de endereço (CON26-408)

**User Story**: Como time de operação de promotores, quero que toda oficina com CNPJ casado na Ultracar fique marcada como tal e tenha seus campos de endereço vazios completados com dado da Ultracar, para que a automação de promotores use a base mais completa possível sem depender de recadastro manual.

**Why P1**: É o critério de aceite central do CON26-408 ("a automação de promotores passa a considerar esses dados") — sem o atributo e o enriquecimento, a automação continua vendo só o que a OB já tinha.

**Acceptance Criteria**:

1. WHEN o script de sincronização roda (fora do modo de teste) THEN o sistema SHALL marcar `MAIN_REGISTER.OFICINA."ULTRACAR" = true` para toda oficina cujo CNPJ (normalizado) exista em `ultracar_process.enterprise__tb_company`, independente do campo `active` dessa tabela
2. WHEN uma oficina tem `"ULTRACAR" = true` e um dos campos `ENDERECO`/`NUMERO`/`BAIRRO`/`CEP`/`LATITUDE`/`LONGITUDE` está nulo ou vazio THEN o sistema SHALL preenchê-lo com o dado correspondente de `ultracar_process.enterprise__tb_company_address`, quando disponível
3. WHEN os campos `CIDADE`/`ESTADO` da oficina estão nulos ou vazios THEN o sistema SHALL preenchê-los a partir do registro mais recente de `ultracar_process.st_obads_im` para aquele CNPJ, quando existir
4. IF um campo da oficina já tem valor não nulo/não vazio THEN o sistema SHALL NOT sobrescrevê-lo com dado da Ultracar, para nenhum campo
5. The sistema SHALL NOT alterar `CNPJ`, `NOME_FANTASIA`, `RAZAO_SOCIAL` ou `TELEFONE` de uma oficina existente a partir de dado da Ultracar
6. WHEN o script roda em modo de teste THEN o sistema SHALL apenas listar quantas oficinas receberiam a flag e quais campos seriam preenchidos, sem gravar nada

**Independent Test**: Tomar uma oficina com CNPJ casado e `BAIRRO` nulo, mas `ENDERECO` já preenchido; rodar o script fora do modo de teste; verificar que `"ULTRACAR"` virou `true`, `BAIRRO` foi preenchido com o dado da Ultracar, e `ENDERECO` permaneceu exatamente como estava.

---

### P1: Registrar, uma única vez, as oficinas Ultracar sem match (CON26-408)

**User Story**: Como time de operação de promotores, quero rodar um script de disparo único que cadastre em `MAIN_REGISTER.OFICINA` as oficinas da Ultracar que ainda não existem na nossa base, para que a automação de promotores enxergue a base da Ultracar inteira — mantendo exatamente a regra de visibilidade já definida (match-bypass de comunidade).

**Why P1**: É a "tratativa" que a revisão anterior desta spec deixou pendente para oficina sem match — sem ela, 1.664 oficinas (medidas via `st_obads_im`) continuam permanentemente invisíveis.

**Acceptance Criteria**:

1. WHEN o script de registro roda (fora do modo de teste) THEN o sistema SHALL criar uma linha em `MAIN_REGISTER.OFICINA` para cada oficina ativa (`active = true`) de `ultracar_process.enterprise__tb_company` cujo CNPJ (normalizado) não tem match em `MAIN_REGISTER.OFICINA` nem em `dw.cadastro_empresa`
2. The sistema SHALL preencher a oficina criada com `NOME_FANTASIA`/`CNPJ` (de `enterprise__tb_company`), `ENDERECO`/`NUMERO`/`BAIRRO`/`CEP`/`LATITUDE`/`LONGITUDE` (de `enterprise__tb_company_address`, quando disponível), `CIDADE`/`ESTADO` (do registro mais recente de `st_obads_im`, quando disponível), `ORIGEM = "ULTRACAR"` e `"ULTRACAR" = true`
3. The sistema SHALL deixar `TELEFONE` nulo na oficina criada
4. IF o CNPJ já foi registrado por uma execução anterior do script THEN o sistema SHALL NOT criar uma segunda linha para o mesmo CNPJ
5. WHILE as consultas de comunidade já estendidas (ver histórias anteriores) não mudam, uma oficina registrada por este script SHALL aparecer nelas assim que casar por CNPJ — nenhuma lógica adicional de visibilidade é necessária
6. WHEN o script roda em modo de teste THEN o sistema SHALL apenas listar as oficinas que seriam criadas e com quais dados, sem gravar nada

**Independent Test**: Escolher uma oficina Ultracar ativa sem CNPJ na nossa base; rodar o script fora do modo de teste; verificar que uma nova linha aparece em `MAIN_REGISTER.OFICINA` com `ORIGEM = "ULTRACAR"`, `TELEFONE` nulo, e que `getComunityNearbyOficinas` para qualquer `EMPRESA_SLUG` passa a incluí-la (dentro do raio) sem nenhuma mudança de código adicional.

---

## Edge Cases

- IF o mesmo CNPJ aparece mais de uma vez em `ultracar_process.enterprise__tb_company` (franquia/matriz com `matrix_id`) THEN o sistema SHALL tratar como um único match (basta existir ao menos uma linha ativa com aquele CNPJ) — não duplica a oficina correspondente
- IF a oficina com match já pertence à comunidade do `EMPRESA_SLUG` consultado THEN o sistema SHALL exibi-la apenas uma vez (idempotência do `UNION`/dedupe por `ID_OFICINA`)
- IF o mesmo CNPJ corresponde a mais de uma linha em `MAIN_REGISTER.OFICINA` (CNPJ duplicado na nossa base, caso já conhecido) THEN o sistema SHALL seguir a mesma regra de desempate que `utils/sqlCadastroEmpresa.ts` já usa para o resto do sistema, sem inventar uma nova
- IF a consulta a `ultracar_process.enterprise__tb_company` falhar (schema fora do ar, erro de conexão) THEN a consulta de comunidade inteira SHALL falhar de forma visível (erro), sem devolver resultado parcial silencioso
- IF uma oficina Ultracar está `active = false` THEN o sistema SHALL tratá-la como se não existisse match (não libera bypass de comunidade para oficina inativa na Ultracar)
- IF uma oficina já tem `ROTA_PROMOTOR` ativa nesta campanha THEN o sistema SHALL NOT criar uma segunda rota para a mesma oficina (idempotência), igual ao comportamento já existente
- IF uma oficina Ultracar sem match não tem endereço resolvível em `enterprise__tb_company_address` THEN o sistema SHALL ainda criar a oficina (nome e CNPJ bastam), deixando os campos de endereço nulos e reportando o caso no relatório do script
- IF o mesmo CNPJ aparece mais de uma vez em `enterprise__tb_company` (franquia/matriz, `matrix_id`) THEN o sistema SHALL registrar/enriquecer uma única oficina por CNPJ, com o mesmo critério de desempate já definido para o match (nunca duas linhas para o mesmo CNPJ)
- IF a oficina a registrar não tem nenhum registro em `st_obads_im` THEN o sistema SHALL criá-la mesmo assim, com `CIDADE`/`ESTADO` nulos

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| ULTRACAR-01 | P1: Oficina com match aparece para qualquer cliente | Implementing | T2 done |
| ULTRACAR-02 | P1: Oficina com match aparece para qualquer cliente | Implementing | T2 done |
| ULTRACAR-03 | P1: Oficina com match aparece para qualquer cliente | Design | Pending |
| ULTRACAR-04 | P1: Oficina com match aparece para qualquer cliente | Implementing | T2 done |
| ULTRACAR-05 | P1: Oficina com match aparece para qualquer cliente | Design | Pending |
| ULTRACAR-06 | P1: Oficina com match aparece para qualquer cliente | Implementing | T1 done |
| ULTRACAR-07 | P1: Oficina sem match não aparece nem recebe rota | Implementing | T2 done |
| ULTRACAR-08 | P1: Oficina sem match não aparece nem recebe rota | Design | Pending |
| ULTRACAR-09 | P1: Oficina sem match não aparece nem recebe rota | Design | Pending |
| ULTRACAR-10 | P1: Oficina sem match não aparece nem recebe rota | Design | Pending |
| ULTRACAR-11 | P1: Consultas respeitam timeout de 10s | Implementing | T6 done |
| ULTRACAR-12 | P1: Consultas respeitam timeout de 10s | Implementing | T1 done |
| ULTRACAR-13 | P1: Consultas respeitam timeout de 10s | Implementing | T6 done |
| ULTRACAR-14 | P1: Consultas respeitam timeout de 10s | Implementing | T6 done |
| ULTRACAR-15 | P2: Script de correção de CEP | Implementing | T7 done |
| ULTRACAR-16 | P2: Script de correção de CEP | Implementing | T7 done |
| ULTRACAR-17 | P2: Script de correção de CEP | Implementing | T7 done |
| ULTRACAR-18 | P2: Script de correção de CEP | Implementing | T7 done |
| ULTRACAR-19 | P2: Script de correção de CEP | Implementing | T7 done |
| ULTRACAR-20 | P2: Script de correção de CEP | Implementing | T7 done |
| ULTRACAR-21 | P1: Marcar também-Ultracar e completar campos vazios | Implementing | T8 done (DDL+entidade) |
| ULTRACAR-22 | P1: Marcar também-Ultracar e completar campos vazios | Design | Pending |
| ULTRACAR-23 | P1: Marcar também-Ultracar e completar campos vazios | Design | Pending |
| ULTRACAR-24 | P1: Marcar também-Ultracar e completar campos vazios | Design | Pending |
| ULTRACAR-25 | P1: Marcar também-Ultracar e completar campos vazios | Design | Pending |
| ULTRACAR-26 | P1: Marcar também-Ultracar e completar campos vazios | Design | Pending |
| ULTRACAR-27 | P1: Registrar oficinas sem match (disparo único) | Design | Pending |
| ULTRACAR-28 | P1: Registrar oficinas sem match (disparo único) | Design | Pending |
| ULTRACAR-29 | P1: Registrar oficinas sem match (disparo único) | Design | Pending |
| ULTRACAR-30 | P1: Registrar oficinas sem match (disparo único) | Design | Pending |
| ULTRACAR-31 | P1: Registrar oficinas sem match (disparo único) | Design | Pending |
| ULTRACAR-32 | P1: Registrar oficinas sem match (disparo único) | Design | Pending |

**ID format:** `ULTRACAR-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 32 total, 32 mapped to design, 0 unmapped

---

## Success Criteria

- [ ] Uma oficina com CNPJ correspondente na base da Ultracar aparece nas consultas de comunidade de qualquer `EMPRESA_SLUG`, mesmo fora da comunidade dela, sem duplicata
- [ ] Nenhuma oficina sem match de CNPJ aparece em qualquer consulta de comunidade nem recebe `ROTA_PROMOTOR`
- [ ] Nenhuma linha nova surge em `MAIN_REGISTER.OFICINA` por efeito desta funcionalidade
- [ ] As 4 consultas de comunidade com a verificação de match completam em até 10 segundos com volume de produção
- [ ] O contrato (formato de request/response) dos endpoints existentes não muda
- [ ] O script de correção de CEP, em modo de teste, reporta candidatas sem gravar nada; fora do modo de teste, altera só `CEP` de oficinas com match, CEP divergente e sem atualização de endereço nos últimos 12 meses
- [ ] Toda oficina com CNPJ casado tem `"ULTRACAR" = true` e nenhum campo de endereço preenchido foi sobrescrito
- [ ] Rodar o script de registro uma vez cadastra todas as oficinas Ultracar ativas sem match; rodar de novo não duplica nenhuma
