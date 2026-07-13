# Migração de Banco de Dados - CAMPANHAS_OB (Zero-Downtime)

## Problem Statement

O schema `CAMPANHAS_OB` está sendo armazenado no banco de dados **errado** (`oficinabrasilpostgresdev` em sa-east-1) quando deveria estar no banco de dados **correto** (`oficinabrasilpostgresprd` em us-east-1). A estrutura já foi clonada para o banco correto, mas os dados (~5000 registros) ainda residem no banco errado. A migração precisa ser **zero-downtime** — nenhum dado pode ser perdido durante a transição.

## Goals

- [ ] Aplicação operando com dual-connection (leitura merge de ambos, escrita no banco correto)
- [ ] Zero perda de dados durante todo o período de transição
- [ ] Zero-downtime — aplicação nunca fica indisponível
- [ ] Migração completa dos dados antigos para o banco correto
- [ ] Remoção limpa da conexão antiga após validação

## Contexto Técnico

### Topologia Atual

| Schema          | Banco Atual (ERRADO)                                     | Banco Correto (DESTINO)                                 |
|-----------------|----------------------------------------------------------|---------------------------------------------------------|
| `CAMPANHAS_OB`  | `oficinabrasilpostgresdev.chaoam4eqnpu.sa-east-1.rds.amazonaws.com` | `oficinabrasilpostgresprd.cdo2simiqjlr.us-east-1.rds.amazonaws.com` |
| `MAIN_REGISTER` | — (já está no correto)                                   | `oficinabrasilpostgresprd` ✅                            |
| `dw`            | — (já está no correto)                                   | `oficinabrasilpostgresprd` ✅                            |

### Entidades Afetadas (schema CAMPANHAS_OB)

| Entidade              | Tabela                    | Volume Estimado |
|-----------------------|---------------------------|-----------------|
| Campanha              | CAMPANHA                  | < 100           |
| CampanhaPerguntas     | CAMPANHA_PERGUNTAS        | < 500           |
| CampanhaPerguntaOpcao | CAMPANHA_PERGUNTA_OPCOES  | < 500           |
| CampanhaPromotor      | CAMPANHA_PROMOTOR         | < 500           |
| CampanhaResults       | CAMPANHA_RESULTS          | ~2200           |
| RotaPromotor          | ROTA_PROMOTOR             | ~1000           |
| Promotor              | PROMOTOR                  | < 100           |

### Entidades NÃO Afetadas (já no banco correto)

- Oficina (`MAIN_REGISTER.OFICINA`)
- Usuario (`MAIN_REGISTER.USUARIO`)
- CadastroEmpresa (`dw.cadastro_empresa`)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Migração de MAIN_REGISTER / dw | Já estão no banco correto |
| Alteração de schemas/tabelas | Estrutura já clonada, é idêntica |
| Reescrita de endpoints/APIs | Comportamento externo não muda |
| Sincronização bidirecional | Banco antigo vira read-only para a app |

---

## User Stories

### P1: Dual DataSource Configuration ⭐ MVP

**User Story**: Como desenvolvedor, quero que a aplicação inicie com duas conexões de banco simultâneas, para que possa ler do banco antigo e escrever no banco novo.

**Why P1**: Sem isso, nenhuma outra etapa funciona — é a fundação da migração.

**Acceptance Criteria**:

1. WHEN a aplicação inicia THEN sistema SHALL conectar em ambos os DataSources (antigo e novo) com sucesso
2. WHEN qualquer DataSource falhar na inicialização THEN sistema SHALL logar o erro e não iniciar (fail-fast)
3. WHEN ambos conectam com sucesso THEN sistema SHALL logar confirmação de ambas as conexões
4. WHEN variáveis de ambiente do banco novo não estão definidas THEN sistema SHALL operar apenas com a conexão antiga (backward-compatible)

**Independent Test**: Iniciar a aplicação com as duas configurações de banco no .env e verificar que ambos os DataSources reportam conexão bem-sucedida nos logs.

---

### P1: Write Routing (Novas Escritas no Banco Correto) ⭐ MVP

**User Story**: Como sistema, quero que todas as novas operações de escrita (INSERT/UPDATE/DELETE) no schema CAMPANHAS_OB sejam direcionadas ao banco correto, para que novos dados já sejam persistidos no destino final.

**Why P1**: Garante que a partir do deploy, nenhum dado novo vai para o banco errado.

**Acceptance Criteria**:

1. WHEN um novo Promotor é criado THEN sistema SHALL persistir no banco correto (PRD)
2. WHEN uma Campanha é atualizada THEN sistema SHALL atualizar no banco correto (PRD)
3. WHEN um CampanhaResults é inserido THEN sistema SHALL inserir no banco correto (PRD)
4. WHEN qualquer entidade CAMPANHAS_OB é escrita THEN sistema SHALL usar exclusivamente o DataSource novo
5. WHEN entidades de MAIN_REGISTER/dw são acessadas THEN sistema SHALL continuar usando o DataSource principal (que já é o correto)

**Independent Test**: Criar um Promotor via API e verificar que o registro existe no banco PRD e NÃO existe no banco DEV.

---

### P1: Read Merging (Consultas Unificadas) ⭐ MVP

**User Story**: Como usuário da API, quero que as consultas retornem dados tanto do banco antigo quanto do novo, para que nenhum dado histórico desapareça durante a transição.

**Why P1**: Sem o merge, dados antigos ficam invisíveis — equivale a perda de dados do ponto de vista do usuário.

**Acceptance Criteria**:

1. WHEN consulto lista de Promotores THEN sistema SHALL retornar promotores do banco antigo + banco novo (sem duplicatas)
2. WHEN consulto Campanhas THEN sistema SHALL retornar campanhas de ambos os bancos
3. WHEN consulto RotaPromotor com relações (oficina, campanhaPromotor) THEN sistema SHALL resolver relações cross-database corretamente
4. WHEN um registro existe em ambos os bancos (mesmo ID) THEN sistema SHALL priorizar a versão do banco novo (é a mais recente)
5. WHEN consulto por ID específico THEN sistema SHALL buscar primeiro no banco novo, depois no antigo (fallback)

**Independent Test**: Com dados existentes no banco antigo e novos dados no banco novo, fazer GET /promotores e verificar que ambos aparecem na resposta.

---

### P2: Data Migration (Bulk Transfer)

**User Story**: Como DBA/desenvolvedor, quero migrar todos os dados existentes do banco antigo para o banco novo, para que eventualmente a conexão antiga possa ser removida.

**Why P2**: Necessário para completar a transição, mas a aplicação já funciona corretamente com o merge (P1).

**Acceptance Criteria**:

1. WHEN o script de migração executa THEN sistema SHALL copiar todos os registros de CAMPANHAS_OB para o banco novo
2. WHEN existem foreign keys entre tabelas THEN sistema SHALL respeitar a ordem de inserção (tabelas pai primeiro)
3. WHEN um registro já existe no banco novo (por ID) THEN sistema SHALL pular (não duplicar) ou atualizar se mais recente
4. WHEN a migração completa THEN sistema SHALL reportar contagem de registros migrados por tabela
5. WHEN a migração falha no meio THEN sistema SHALL ser idempotente (re-executável sem efeitos colaterais)

**Independent Test**: Executar script de migração, comparar contagens entre banco antigo e novo — devem ser iguais.

---

### P2: Legacy Connection Removal

**User Story**: Como desenvolvedor, quero remover a conexão com o banco antigo após validação de que todos os dados foram migrados, simplificando a arquitetura.

**Why P2**: Limpeza necessária pós-migração, mas não urgente — pode rodar em dual-mode por tempo indeterminado.

**Acceptance Criteria**:

1. WHEN todos os dados estão migrados e validados THEN sistema SHALL poder operar com apenas a conexão nova
2. WHEN a variável de ambiente LEGACY_DB é removida THEN sistema SHALL operar normalmente sem merge
3. WHEN a conexão antiga é removida THEN sistema SHALL manter performance igual ou melhor (sem overhead de merge)

**Independent Test**: Remover configuração do banco antigo, reiniciar aplicação, e verificar que todas as APIs retornam dados corretos.

---

## Edge Cases

- WHEN banco novo fica indisponível durante operação de escrita THEN sistema SHALL retornar erro 500 (não fazer fallback para banco antigo)
- WHEN banco antigo fica indisponível durante leitura THEN sistema SHALL retornar apenas dados do banco novo (degradação graceful)
- WHEN IDs auto-incrementados conflitam entre bancos THEN sistema SHALL distinguir pela origem (não misturar sequences)
- WHEN uma relação cross-banco referencia ID que não existe no outro THEN sistema SHALL tratar como nullable (não quebrar)
- WHEN deploy do dual-mode é feito THEN sistema SHALL não requerer migração de dados prévia (funciona imediatamente)

---

## Requirement Traceability

| ID     | Story                          | Priority |
|--------|--------------------------------|----------|
| REQ-01 | Dual DataSource Configuration  | P1       |
| REQ-02 | Write Routing                  | P1       |
| REQ-03 | Read Merging                   | P1       |
| REQ-04 | Data Migration                 | P2       |
| REQ-05 | Legacy Connection Removal      | P2       |

---

## Technical Constraints

1. **TypeORM**: Framework de ORM em uso — suporta múltiplos DataSources nativamente
2. **Mesmo schema name**: `CAMPANHAS_OB` existe em ambos os bancos com estrutura idêntica
3. **Relações cross-schema**: RotaPromotor → Oficina (MAIN_REGISTER) — Oficina já está no banco correto, o join funciona só se ambos estiverem no mesmo banco OU tratado em memória
4. **Sequences/IDs**: Auto-increment do banco antigo provavelmente conflita com o novo — precisa strategy para evitar colisão

## Riscos Identificados

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Conflito de IDs auto-increment | Dados duplicados/corrompidos | Ajustar sequence do banco novo para começar após max(ID) do antigo |
| Latência cross-region (sa-east-1 → us-east-1) | Lentidão no merge de leitura | Merge em memória com queries paralelas |
| Relações cross-database (FK de CAMPANHAS_OB → MAIN_REGISTER) | Joins não funcionam cross-DB | No banco novo ambos os schemas coexistem — resolve naturalmente |
