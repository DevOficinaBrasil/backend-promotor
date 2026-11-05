# Base de Oficinas da Ultracar nos Promotores Specification

## Problem Statement

A Ultracar mantém sua própria base de oficinas (`ultracar_process.enterprise__tb_company` + `enterprise__tb_company_address` + `st_obads_im`), fora de `MAIN_REGISTER.OFICINA`/`dw.cadastro_empresa`. Hoje nenhuma oficina dessa base aparece para os promotores nem entra no cálculo de atribuição de rota, mesmo quando ela é fisicamente a oficina certa para a cobertura de um cliente. Sem incluir essa base, clientes perdem visibilidade e cobertura de um universo inteiro de oficinas que já existe em outro sistema.

## Goals

- [ ] Toda consulta de "oficinas da comunidade do cliente" usada pelo módulo de promotores passa a enxergar também as oficinas da Ultracar, sem duplicar quem já existe em `MAIN_REGISTER.OFICINA`/`dw.cadastro_empresa`
- [ ] Oficinas da Ultracar sem CNPJ correspondente na nossa base entram no cálculo de atribuição de rota por raio, para qualquer cliente, sem exigir vínculo prévio de comunidade
- [ ] Nenhuma oficina da Ultracar é escrita em `MAIN_REGISTER.OFICINA` — a identificação acontece por leitura (JOIN/consulta), nunca por cópia
- [ ] As consultas que passam a unir dados da Ultracar respeitam o timeout de 10 segundos já em vigor no banco
- [ ] Script de correção de CEP (oficinas já vinculadas por CNPJ cujo CEP diverge do CEP da Ultracar) com modo de teste, limitado a oficinas sem atualização cadastral nos últimos 12 meses

## Out of Scope

| Feature | Reason |
|---|---|
| Alterar o contrato de qualquer endpoint de API existente | Requisito explícito do usuário — o formato de request/response dos endpoints do módulo de promotores não muda |
| Criar/gravar oficina da Ultracar em `MAIN_REGISTER.OFICINA` | Requisito explícito do usuário — a oficina da Ultracar nunca é materializada nessa tabela, mesmo quando não há match |
| Buscar telefone da oficina a partir das tabelas da Ultracar | Nenhuma das três tabelas (`enterprise__tb_company`, `enterprise__tb_company_address`, `st_obads_im`) expõe telefone — campo sai nulo para oficina não casada |
| Busca de oficinas do admin (`OficinaService.buscarOficinasBase`, `opcoesFiltroBusca`, `cidadesPorUf`) | Opera só sobre `MAIN_REGISTER.OFICINA`/`dw.cadastro_empresa`; não é uma consulta de "oficinas da comunidade" nem de cálculo de rota do promotor — fora do pedido original |
| `OficinaService.findNearestOficinas` (endpoint `/oficina/nearby` genérico) | Não é filtrado por `EMPRESA_SLUG`/comunidade — fora do escopo "oficinas da comunidade do cliente" definido nesta spec |
| Aplicar a correção de CEP do script a oficinas sem match de CNPJ | O script só corrige oficina que já existe na nossa base (match por CNPJ); oficina sem match não tem linha em `MAIN_REGISTER.OFICINA` para corrigir |
| Executar a DDL de qualquer tabela/índice novo que o Design definir | Decisão explícita do usuário — toda DDL é revisada e rodada manualmente, nunca por este trabalho |
| Preencher dados de exibição completos (nome, endereço, status de visita) de oficina Ultracar não casada em telas fora da visibilidade/cálculo de rota (ex.: notificação de visita, confirmação de visita, templates de WhatsApp, relatórios de CRM) | Esses fluxos hoje fazem `JOIN` direto com `MAIN_REGISTER.OFICINA` por `ID_OFICINA`; estender cada um é trabalho adicional não descrito no pedido original — ver Assumptions |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
|---|---|---|---|
| Escopo do "aparecer para o cliente" | Vale para **todo** cliente/`EMPRESA_SLUG`, não só Ultracar: a oficina Ultracar sem match soma-se à lista de oficinas da comunidade de qualquer cliente, dentro do raio de busca | Confirmado com o usuário durante a clarificação desta spec | y (usuário) |
| Regra para oficina Ultracar **com** match de CNPJ | Nenhuma lógica nova — ela já é uma linha de `MAIN_REGISTER.OFICINA`/`dw.cadastro_empresa` e já segue a regra de comunidade hoje em vigor (aparece só se pertencer à comunidade do cliente) | Confirmado com o usuário: "oficinas que derem match na nossa base aí valera a regra da comunidade" | y (usuário) |
| Fonte do "match" de CNPJ | União de `MAIN_REGISTER.OFICINA."CNPJ"` (dígitos) e `dw.cadastro_empresa.cnpj_int`, reaproveitando a convenção já usada em `utils/sqlCadastroEmpresa.ts` (`cnpjIntDaOficina`/`cnpjIntParaLigacao`) e no script `scripts/atualizar-lat-long-comunidade.ts` | É a mesma definição de "nossa base" já usada em todo o resto do sistema para ligar CNPJ; evita inventar uma terceira regra de comparação | n |
| Normalização do CNPJ da Ultracar | Extrai só dígitos do CNPJ de `ultracar_process` (já vem sem pontuação, por declaração do usuário) e compara numericamente (`bigint`) contra o CNPJ normalizado da nossa base — mesmo corte de 14 dígitos já usado na ligação existente | Consistência com a regra de dedupe já validada em produção; evita que lixo de formatação gere falso-negativo ou falso-positivo de match | n |
| Consultas em escopo ("cálculo de rota"/"oficinas da comunidade") | As 5 consultas de `OficinaService` usadas pelo fluxo de promotor: `getComunityNearbyOficinas`, `getSegmentedNearbyOficinas`, `getCommunityOficinas`, `countCommunityOficinas`, `getCommunityOficinasSegmentadas` | São as únicas hoje consumidas por `promotorService.ts` para raio/atribuição e para listar o mapa de comunidade — é o que o pedido chama de "oficinas da comunidade"/"cálculo de rota" | n |
| Identificador da oficina Ultracar sem match na resposta (`ID_OFICINA`) | Design deve definir um esquema de ID estável e sem colisão com `MAIN_REGISTER.OFICINA."ID_OFICINA"` (ex.: faixa reservada/offset), já que o contrato de API mantém o campo como inteiro e `ROTA_PROMOTOR."ID_OFICINA"` não tem FK física (mesmo padrão de `OFICINA_IMPORTADA`) | Sem isso a oficina Ultracar não teria identidade utilizável para dedupe entre chamadas nem para registrar uma `ROTA_PROMOTOR`; mecanismo exato é decisão de Design, não de Specify | n |
| Telas que hoje fazem `JOIN` direto com `MAIN_REGISTER.OFICINA` por `ID_OFICINA` (notificação de visita, confirmação de visita, templates, relatórios) | Fora de escopo nesta iteração para oficina Ultracar sem match — ver Out of Scope | O pedido original fala em "aparecer"/"entrar no cálculo de rota", não em reescrever cada fluxo posterior; risco fica registrado para o Design avaliar o tamanho real do impacto | n |
| Fonte do CEP "da Ultracar" para o script de correção | `ultracar_process.enterprise__tb_company_address` (tabela de endereço); nome exato da coluna de CEP a confirmar em Design | É a tabela de endereço citada pelo usuário; `st_obads_im` é citada só como fonte de cidade, não de CEP | n |
| Campo de "atualização cadastral recente" | `MAIN_REGISTER.OFICINA."DATA_ALTERACAO"` (já existe, auto-atualizado pelo TypeORM) | Único campo de data de alteração já existente na entidade `OFICINA`; nenhuma outra coluna de auditoria de cadastro existe hoje | n |
| Modo de execução do script de correção de CEP | Segue a mesma convenção do script existente `scripts/atualizar-lat-long-comunidade.ts`: flag `--teste[=N]` roda em modo relatório/teto de N linhas antes de qualquer `UPDATE` real | Reaproveita um padrão já revisado e em uso no repositório para o mesmo tipo de operação (correção de endereço em lote) | n |
| Estratégia de otimização para respeitar o timeout de 10s | Decisão de Design (ex.: tabela/visão materializada da Ultracar vs. JOIN ao vivo em `ultracar_process`) — esta spec fixa o resultado exigido (⩽10s), não o mecanismo | "Specify" define o quê, não o como; a tabela `ultracar_process` é schema externo sem índice garantido, então a forma de consulta precisa de investigação técnica própria do Design | n |
| DDL de qualquer tabela/índice novo necessário | Nunca executada automaticamente nesta funcionalidade — script `.sql` gerado, revisado e rodado manualmente pelo usuário | Restrição explícita do usuário | y (usuário) |
| Acesso ao banco durante Design/Tasks/Execute | Somente `SELECT`, para conferência de schema/dados; nenhuma escrita fora do script de correção de CEP (que roda fora do fluxo automatizado, com confirmação do usuário) | Restrição explícita do usuário | y (usuário) |

**Open questions:** none — todas resolvidas ou registradas acima.

---

## User Stories

### P1: Oficina Ultracar sem match aparece para qualquer cliente ⭐ MVP

**User Story**: Como cliente do módulo de promotores, quero ver as oficinas da Ultracar que ainda não estão na nossa base dentro da minha área de cobertura, para que meu promotor possa planejar visita a elas como a qualquer outra oficina.

**Why P1**: É o requisito central do pedido — sem isso, a base da Ultracar continua invisível para os promotores.

**Acceptance Criteria**:

1. WHEN uma consulta de oficinas da comunidade (`getComunityNearbyOficinas`, `getSegmentedNearbyOficinas`, `getCommunityOficinas`, `countCommunityOficinas` ou `getCommunityOficinasSegmentadas`) é executada para qualquer `EMPRESA_SLUG` THEN o sistema SHALL incluir no resultado as oficinas de `ultracar_process` cujo CNPJ (normalizado) não existe em `MAIN_REGISTER.OFICINA` nem em `dw.cadastro_empresa`
2. WHILE uma oficina da Ultracar não tem CNPJ correspondente na nossa base, o sistema SHALL incluí-la no resultado independentemente de ela pertencer à comunidade do `EMPRESA_SLUG` consultado
3. WHEN a oficina Ultracar sem match tem latitude/longitude válidos (resolvidos a partir de `enterprise__tb_company_address`) e a consulta aplica filtro de raio THEN o sistema SHALL calcular a distância Haversine a partir desse par de coordenadas, do mesmo jeito que já faz para as demais fontes
4. IF a oficina Ultracar sem match não tem latitude/longitude resolvíveis THEN o sistema SHALL excluí-la do resultado de consultas com raio, sem erro
5. The sistema SHALL devolver `TELEFONE` nulo/vazio para toda oficina Ultracar sem match, já que nenhuma das três tabelas de origem expõe telefone
6. The sistema SHALL NOT alterar o formato (nomes e tipos de campo) da resposta dos endpoints existentes que consomem essas consultas

**Independent Test**: Para um `EMPRESA_SLUG` sem nenhuma oficina Ultracar vinculada à sua comunidade, chamar `getComunityNearbyOficinas` com um centro/raio que cubra uma oficina Ultracar conhecida sem CNPJ na nossa base; verificar que ela aparece no resultado com `TELEFONE` nulo.

---

### P1: Oficina Ultracar com match segue a regra de comunidade existente ⭐ MVP

**User Story**: Como sistema, quero que uma oficina da Ultracar que já existe na nossa base (mesmo CNPJ) continue seguindo a regra de comunidade atual, para não duplicar oficina nem criar uma segunda forma de decidir visibilidade para quem já está cadastrado.

**Why P1**: Sem essa regra, a mesma oficina física apareceria duas vezes (uma como registro nosso, outra como registro Ultracar) ou vazaria para clientes fora da comunidade dela.

**Acceptance Criteria**:

1. WHEN uma oficina da Ultracar tem CNPJ (normalizado) correspondente a uma linha em `MAIN_REGISTER.OFICINA` ou `dw.cadastro_empresa` THEN o sistema SHALL NOT incluí-la como uma linha adicional vinda de `ultracar_process` no resultado das consultas de comunidade
2. WHILE a oficina casada pertence à comunidade do `EMPRESA_SLUG` consultado (pela regra já existente de `USUARIO_COMMUNITY`/`OFICINA_IMPORTADA`), o sistema SHALL continuar a exibi-la normalmente, sem mudança de comportamento
3. WHILE a oficina casada NÃO pertence à comunidade do `EMPRESA_SLUG` consultado, o sistema SHALL NOT exibi-la para esse cliente, mesmo estando presente na base da Ultracar
4. The sistema SHALL identificar o match exclusivamente pelo CNPJ, comparando os dígitos do CNPJ de `ultracar_process` com os dígitos do CNPJ já cadastrado (que pode conter pontuação) — nunca por nome ou endereço

**Independent Test**: Tomar uma oficina Ultracar cujo CNPJ já existe em `MAIN_REGISTER.OFICINA` e que NÃO pertence à comunidade de um `EMPRESA_SLUG` de teste; verificar que ela não aparece nas consultas de comunidade desse `EMPRESA_SLUG` nem duplicada, nem via ramo Ultracar.

---

### P1: Oficina Ultracar sem match entra no cálculo de atribuição de rota ⭐ MVP

**User Story**: Como indústria, quero que uma oficina da Ultracar sem cadastro prévio na nossa base possa receber uma rota de promotor automaticamente, para que ela não fique visível no mapa sem nunca virar uma visita.

**Why P1**: "Aparecer" sem poder ser roteada não atende ao pedido — o cálculo de rota precisa enxergar a mesma oficina.

**Acceptance Criteria**:

1. WHEN o fluxo de atribuição de rota consulta oficinas candidatas dentro do raio de um promotor (via `getComunityNearbyOficinas`/`getSegmentedNearbyOficinas`) THEN o sistema SHALL considerar também as oficinas Ultracar sem match retornadas por essas consultas como candidatas válidas
2. WHEN uma oficina Ultracar sem match é escolhida para uma rota THEN o sistema SHALL criar a `ROTA_PROMOTOR` referenciando essa oficina por um identificador estável que não colide com nenhum `ID_OFICINA` existente em `MAIN_REGISTER.OFICINA`
3. The sistema SHALL NOT criar nenhuma linha em `MAIN_REGISTER.OFICINA` como efeito colateral de atribuir uma rota a uma oficina Ultracar sem match
4. WHILE a mesma oficina Ultracar sem match está dentro do raio de promotores de mais de um `EMPRESA_SLUG`, o sistema SHALL permitir que ela receba rota em cada campanha/cliente de forma independente, do mesmo jeito que já é permitido hoje para oficinas de `OFICINA_IMPORTADA`

**Independent Test**: Vincular um promotor com raio que alcance uma oficina Ultracar sem match conhecida; disparar o fluxo de atribuição de rota e verificar que uma `ROTA_PROMOTOR` é criada apontando para essa oficina, sem nenhuma nova linha em `MAIN_REGISTER.OFICINA`.

---

### P1: Consultas com Ultracar respeitam o timeout de 10 segundos ⭐ MVP

**User Story**: Como operação do sistema, quero que incluir a base da Ultracar nas consultas de comunidade não estoure o timeout de banco já configurado, para não quebrar nenhuma tela de promotor que hoje funciona.

**Why P1**: Um timeout de consulta é uma regressão total da tela, não uma degradação parcial — é bloqueante para qualquer cliente, não só para quem tem oficina Ultracar por perto.

**Acceptance Criteria**:

1. The sistema SHALL completar cada uma das 5 consultas de comunidade listadas (com a união dos dados da Ultracar) dentro do limite de 10 segundos já aplicado pelo banco, para os volumes de dados observados em produção
2. IF uma consulta com a união de dados da Ultracar excederia o timeout de 10 segundos com o volume de dados atual THEN o Design SHALL escolher uma estratégia de otimização (ex.: pré-cálculo/materialização, índice, filtro antecipado) antes da consulta ir para produção, mantendo o resultado funcional definido nas histórias anteriores
3. The sistema SHALL NOT remover nem afrouxar o timeout de 10 segundos já configurado como forma de acomodar a nova consulta

**Independent Test**: Medir o tempo de execução de cada uma das 5 consultas, com e sem a união Ultracar, contra uma cópia/réplica com volume de produção; nenhuma delas SHALL ultrapassar 10 segundos.

---

### P2: Script de correção de CEP para oficinas já casadas com a Ultracar

**User Story**: Como responsável pela qualidade de dados, quero um script que aponte (e, quando confirmado, corrija) o CEP de oficinas nossas cujo CEP diverge do CEP registrado na Ultracar para o mesmo CNPJ, para manter o endereço correto sem reprocessar oficinas atualizadas recentemente.

**Why P2**: É uma correção de qualidade de dados complementar — não bloqueia oficina Ultracar aparecer nem ser roteada, mas evita endereço desatualizado se acumular silenciosamente.

**Acceptance Criteria**:

1. WHEN o script roda em modo de teste THEN o sistema SHALL apenas listar (sem gravar) as oficinas candidatas e o CEP atual vs. o CEP da Ultracar, limitado a um teto configurável de linhas processadas
2. WHEN o script roda fora do modo de teste, após validação do modo de teste THEN o sistema SHALL atualizar `MAIN_REGISTER.OFICINA."CEP"` apenas das oficinas candidatas, uma a uma
3. The sistema SHALL considerar "candidata" só a oficina que (a) tem CNPJ com match confirmado em `ultracar_process`, (b) tem CEP divergente (dígitos diferentes) do CEP da Ultracar para esse CNPJ, e (c) não teve `DATA_ALTERACAO` nos últimos 12 meses (ou nunca teve `DATA_ALTERACAO` registrada)
4. IF a oficina teve `DATA_ALTERACAO` dentro dos últimos 12 meses THEN o sistema SHALL excluí-la do cálculo de candidatas, mesmo que o CEP divirja
5. IF o CEP da Ultracar para aquele CNPJ está vazio/não resolvível THEN o sistema SHALL excluir a oficina da lista de candidatas, reportando o motivo
6. The sistema SHALL NOT executar nenhuma alteração de schema (DDL) — qualquer tabela/índice que o script precise é entregue como `.sql` separado, para execução manual

**Independent Test**: Rodar o script em modo de teste contra uma oficina conhecida com CEP propositalmente divergente e `DATA_ALTERACAO` há mais de 12 meses; verificar que ela aparece no relatório sem nenhum `UPDATE` executado. Rodar fora do modo de teste e verificar que só o `CEP` dessa oficina foi alterado.

---

## Edge Cases

- IF o mesmo CNPJ aparece mais de uma vez em `ultracar_process` (qualidade de dado da origem) THEN o sistema SHALL tratar como uma única oficina candidata, preferindo a linha mais recente/completa (critério de desempate definido em Design)
- IF uma oficina Ultracar sem match não tem endereço resolvível em `enterprise__tb_company_address`/`st_obads_im` THEN o sistema SHALL excluí-la de qualquer consulta que dependa de coordenada, sem lançar erro
- IF duas oficinas (uma nossa, outra Ultracar) têm o mesmo CNPJ mas dados cadastrais (nome/endereço) diferentes THEN o sistema SHALL exibir os dados da nossa base (`MAIN_REGISTER.OFICINA`/`dw.cadastro_empresa`), nunca sobrescrever com o dado da Ultracar fora do script de CEP
- IF a consulta à Ultracar falhar (schema fora do ar, erro de conexão) THEN essa consulta específica SHALL falhar de forma visível (erro), sem devolver resultado parcial silencioso que pareça completo — comportamento exato (fallback vs. erro) é decisão de Design
- WHEN a mesma oficina Ultracar sem match está no raio de promotores de clientes diferentes THEN o sistema SHALL permitir rota para cada cliente independentemente, sem exclusividade de cliente
- IF uma oficina já tem `ROTA_PROMOTOR` ativa nesta campanha THEN o sistema SHALL NOT criar uma segunda rota para a mesma oficina (idempotência), igual ao comportamento já existente para outras fontes de oficina

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| ULTRACAR-01 | P1: Oficina sem match aparece para qualquer cliente | Design | Pending |
| ULTRACAR-02 | P1: Oficina sem match aparece para qualquer cliente | Design | Pending |
| ULTRACAR-03 | P1: Oficina sem match aparece para qualquer cliente | Design | Pending |
| ULTRACAR-04 | P1: Oficina sem match aparece para qualquer cliente | Design | Pending |
| ULTRACAR-05 | P1: Oficina sem match aparece para qualquer cliente | Design | Pending |
| ULTRACAR-06 | P1: Oficina sem match aparece para qualquer cliente | Design | Pending |
| ULTRACAR-07 | P1: Oficina com match segue regra de comunidade | Design | Pending |
| ULTRACAR-08 | P1: Oficina com match segue regra de comunidade | Design | Pending |
| ULTRACAR-09 | P1: Oficina com match segue regra de comunidade | Design | Pending |
| ULTRACAR-10 | P1: Oficina com match segue regra de comunidade | Design | Pending |
| ULTRACAR-11 | P1: Oficina sem match entra no cálculo de rota | Design | Pending |
| ULTRACAR-12 | P1: Oficina sem match entra no cálculo de rota | Design | Pending |
| ULTRACAR-13 | P1: Oficina sem match entra no cálculo de rota | Design | Pending |
| ULTRACAR-14 | P1: Oficina sem match entra no cálculo de rota | Design | Pending |
| ULTRACAR-15 | P1: Consultas respeitam timeout de 10s | Design | Pending |
| ULTRACAR-16 | P1: Consultas respeitam timeout de 10s | Design | Pending |
| ULTRACAR-17 | P1: Consultas respeitam timeout de 10s | Design | Pending |
| ULTRACAR-18 | P2: Script de correção de CEP | Design | Pending |
| ULTRACAR-19 | P2: Script de correção de CEP | Design | Pending |
| ULTRACAR-20 | P2: Script de correção de CEP | Design | Pending |
| ULTRACAR-21 | P2: Script de correção de CEP | Design | Pending |
| ULTRACAR-22 | P2: Script de correção de CEP | Design | Pending |
| ULTRACAR-23 | P2: Script de correção de CEP | Design | Pending |

**ID format:** `ULTRACAR-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 23 total, 23 mapped to design, 0 unmapped

---

## Success Criteria

- [ ] Uma oficina Ultracar sem CNPJ correspondente na nossa base aparece nas consultas de comunidade de qualquer `EMPRESA_SLUG` cujo raio a alcance
- [ ] Uma oficina Ultracar com CNPJ correspondente nunca aparece duplicada, e só é visível para quem já a tinha por regra de comunidade
- [ ] Nenhuma linha nova surge em `MAIN_REGISTER.OFICINA` por efeito desta funcionalidade
- [ ] As 5 consultas de comunidade com a união Ultracar completam em até 10 segundos com volume de produção
- [ ] O contrato (formato de request/response) dos endpoints existentes não muda
- [ ] O script de correção de CEP, em modo de teste, reporta candidatas sem gravar nada; fora do modo de teste, altera só `CEP` de oficinas com match, CEP divergente e sem atualização cadastral nos últimos 12 meses
