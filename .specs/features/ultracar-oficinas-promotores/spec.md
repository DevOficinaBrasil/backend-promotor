# Base de Oficinas da Ultracar nos Promotores Specification

## Problem Statement

A Ultracar mantém sua própria base de oficinas (`ultracar_process.enterprise__tb_company` + `enterprise__tb_company_address` + `st_obads_im`), fora de `MAIN_REGISTER.OFICINA`/`dw.cadastro_empresa`. Nenhuma das tabelas da Ultracar expõe telefone da oficina, então uma oficina que só existe na base da Ultracar (sem CNPJ correspondente na nossa base) não tem nenhum canal de contato hoje — mostrá-la ao cliente seria uma oficina "visível mas incontatável". Já uma oficina com CNPJ correspondente na nossa base tem usuário/telefone reais via `MAIN_REGISTER.OFICINA`/`USUARIO`, então pode ser contatada normalmente. O problema a resolver é mais estreito do que "trazer a base da Ultracar inteira": é liberar a visibilidade de oficinas que **já são nossas** (por CNPJ) para qualquer cliente, mesmo fora da comunidade dele, usando a base da Ultracar só como sinal de que aquela oficina é relevante.

## Goals

- [ ] Oficina com CNPJ correspondente entre a base da Ultracar e `MAIN_REGISTER.OFICINA`/`dw.cadastro_empresa` aparece para **qualquer** cliente nas consultas de comunidade do módulo de promotores, mesmo sem pertencer à comunidade dele
- [ ] Oficina da Ultracar sem CNPJ correspondente na nossa base **não aparece** em nenhuma consulta nem entra no cálculo de rota, até existir uma forma de contatá-la
- [ ] Nenhuma oficina da Ultracar é escrita em `MAIN_REGISTER.OFICINA` — a identificação acontece por leitura (JOIN/consulta), nunca por cópia
- [ ] As consultas que passam a considerar a base da Ultracar respeitam o timeout de 10 segundos já em vigor no banco
- [ ] Script de correção de CEP (oficinas já vinculadas por CNPJ cujo CEP diverge do CEP da Ultracar) com modo de teste, limitado a oficinas sem atualização cadastral nos últimos 12 meses

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
| Campo de "atualização cadastral recente" | `MAIN_REGISTER.OFICINA."DATA_ALTERACAO"` (já existe, auto-atualizado pelo TypeORM) | Único campo de data de alteração já existente na entidade `OFICINA` | n |
| Modo de execução do script de correção de CEP | Segue a mesma convenção do script existente `scripts/atualizar-lat-long-comunidade.ts`: flag `--teste[=N]` roda em modo relatório/teto de N linhas antes de qualquer `UPDATE` real | Reaproveita um padrão já revisado e em uso no repositório para o mesmo tipo de operação | n |
| Estratégia de otimização para respeitar o timeout de 10s | Join explícito (`LEFT JOIN` com CTE de CNPJ normalizado) contra `MAIN_REGISTER.OFICINA`/`dw.cadastro_empresa`, nunca `EXISTS`/`OR` correlacionado | Medido durante a investigação técnica desta spec: a versão com `EXISTS` estourou o timeout de 10s; a reescrita como `LEFT JOIN` rodou em ~2s para a base Ultracar inteira (ver `.specs/STATE.md` AD-010) | y (medido) |
| `enterprise__tb_company_address`/`st_obads_im` continuam necessárias? | Só `enterprise__tb_company_address` (para o script de CEP, P2). `st_obads_im` não é mais necessária nesta spec — era usada só para endereço/cidade de oficina sem match, que não aparece mais | A inversão da regra elimina a necessidade de endereço/lat-long/cidade da Ultracar para exibição | y (consequência da regra invertida) |
| DDL de qualquer tabela/índice novo necessário | Nunca executada automaticamente nesta funcionalidade — script `.sql` gerado, revisado e rodado manualmente pelo usuário | Restrição explícita do usuário | y (usuário) |
| Acesso ao banco durante Design/Tasks/Execute | Somente `SELECT`, para conferência de schema/dados; nenhuma escrita fora do script de correção de CEP (que roda fora do fluxo automatizado, com confirmação do usuário) | Restrição explícita do usuário | y (usuário) |

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
3. The sistema SHALL considerar "candidata" só a oficina que (a) tem CNPJ com match confirmado em `ultracar_process.enterprise__tb_company`, (b) tem CEP divergente (dígitos diferentes) do CEP de `ultracar_process.enterprise__tb_company_address` para esse CNPJ, e (c) não teve `DATA_ALTERACAO` nos últimos 12 meses (ou nunca teve `DATA_ALTERACAO` registrada)
4. IF a oficina teve `DATA_ALTERACAO` dentro dos últimos 12 meses THEN o sistema SHALL excluí-la do cálculo de candidatas, mesmo que o CEP divirja
5. IF o CEP da Ultracar para aquele CNPJ está vazio/não resolvível THEN o sistema SHALL excluir a oficina da lista de candidatas, reportando o motivo
6. The sistema SHALL NOT executar nenhuma alteração de schema (DDL) — qualquer tabela/índice que o script precise é entregue como `.sql` separado, para execução manual

**Independent Test**: Rodar o script em modo de teste contra uma oficina conhecida com CEP propositalmente divergente e `DATA_ALTERACAO` há mais de 12 meses; verificar que ela aparece no relatório sem nenhum `UPDATE` executado. Rodar fora do modo de teste e verificar que só o `CEP` dessa oficina foi alterado.

---

## Edge Cases

- IF o mesmo CNPJ aparece mais de uma vez em `ultracar_process.enterprise__tb_company` (franquia/matriz com `matrix_id`) THEN o sistema SHALL tratar como um único match (basta existir ao menos uma linha ativa com aquele CNPJ) — não duplica a oficina correspondente
- IF a oficina com match já pertence à comunidade do `EMPRESA_SLUG` consultado THEN o sistema SHALL exibi-la apenas uma vez (idempotência do `UNION`/dedupe por `ID_OFICINA`)
- IF o mesmo CNPJ corresponde a mais de uma linha em `MAIN_REGISTER.OFICINA` (CNPJ duplicado na nossa base, caso já conhecido) THEN o sistema SHALL seguir a mesma regra de desempate que `utils/sqlCadastroEmpresa.ts` já usa para o resto do sistema, sem inventar uma nova
- IF a consulta a `ultracar_process.enterprise__tb_company` falhar (schema fora do ar, erro de conexão) THEN a consulta de comunidade inteira SHALL falhar de forma visível (erro), sem devolver resultado parcial silencioso
- IF uma oficina Ultracar está `active = false` THEN o sistema SHALL tratá-la como se não existisse match (não libera bypass de comunidade para oficina inativa na Ultracar)
- IF uma oficina já tem `ROTA_PROMOTOR` ativa nesta campanha THEN o sistema SHALL NOT criar uma segunda rota para a mesma oficina (idempotência), igual ao comportamento já existente

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| ULTRACAR-01 | P1: Oficina com match aparece para qualquer cliente | Design | Pending |
| ULTRACAR-02 | P1: Oficina com match aparece para qualquer cliente | Design | Pending |
| ULTRACAR-03 | P1: Oficina com match aparece para qualquer cliente | Design | Pending |
| ULTRACAR-04 | P1: Oficina com match aparece para qualquer cliente | Design | Pending |
| ULTRACAR-05 | P1: Oficina com match aparece para qualquer cliente | Design | Pending |
| ULTRACAR-06 | P1: Oficina com match aparece para qualquer cliente | Design | Pending |
| ULTRACAR-07 | P1: Oficina sem match não aparece nem recebe rota | Design | Pending |
| ULTRACAR-08 | P1: Oficina sem match não aparece nem recebe rota | Design | Pending |
| ULTRACAR-09 | P1: Oficina sem match não aparece nem recebe rota | Design | Pending |
| ULTRACAR-10 | P1: Oficina sem match não aparece nem recebe rota | Design | Pending |
| ULTRACAR-11 | P1: Consultas respeitam timeout de 10s | Design | Pending |
| ULTRACAR-12 | P1: Consultas respeitam timeout de 10s | Design | Pending |
| ULTRACAR-13 | P1: Consultas respeitam timeout de 10s | Design | Pending |
| ULTRACAR-14 | P1: Consultas respeitam timeout de 10s | Design | Pending |
| ULTRACAR-15 | P2: Script de correção de CEP | Design | Pending |
| ULTRACAR-16 | P2: Script de correção de CEP | Design | Pending |
| ULTRACAR-17 | P2: Script de correção de CEP | Design | Pending |
| ULTRACAR-18 | P2: Script de correção de CEP | Design | Pending |
| ULTRACAR-19 | P2: Script de correção de CEP | Design | Pending |
| ULTRACAR-20 | P2: Script de correção de CEP | Design | Pending |

**ID format:** `ULTRACAR-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 20 total, 20 mapped to design, 0 unmapped

---

## Success Criteria

- [ ] Uma oficina com CNPJ correspondente na base da Ultracar aparece nas consultas de comunidade de qualquer `EMPRESA_SLUG`, mesmo fora da comunidade dela, sem duplicata
- [ ] Nenhuma oficina sem match de CNPJ aparece em qualquer consulta de comunidade nem recebe `ROTA_PROMOTOR`
- [ ] Nenhuma linha nova surge em `MAIN_REGISTER.OFICINA` por efeito desta funcionalidade
- [ ] As 4 consultas de comunidade com a verificação de match completam em até 10 segundos com volume de produção
- [ ] O contrato (formato de request/response) dos endpoints existentes não muda
- [ ] O script de correção de CEP, em modo de teste, reporta candidatas sem gravar nada; fora do modo de teste, altera só `CEP` de oficinas com match, CEP divergente e sem atualização cadastral nos últimos 12 meses
