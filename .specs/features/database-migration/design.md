# Database Migration - Design

## Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Application Layer                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐    ┌──────────────────────────────────────────┐  │
│  │   Services   │───▶│         Migration Service Layer           │  │
│  │  (existing)  │    │                                          │  │
│  └──────────────┘    │  ┌────────────┐    ┌────────────────┐   │  │
│                       │  │   Write    │    │     Read       │   │  │
│                       │  │  Router    │    │    Merger      │   │  │
│                       │  │ (new DB)   │    │ (both DBs)    │   │  │
│                       │  └─────┬──────┘    └──┬─────┬──────┘   │  │
│                       └────────┼──────────────┼─────┼──────────┘  │
│                                │              │     │              │
├────────────────────────────────┼──────────────┼─────┼─────────────┤
│                                │              │     │              │
│  ┌─────────────────────────────▼──────────────▼─┐   │             │
│  │          AppDataSource (NEW/CORRECT)          │   │             │
│  │  oficinabrasilpostgresprd (us-east-1)         │   │             │
│  │  Schemas: CAMPANHAS_OB, MAIN_REGISTER, dw    │   │             │
│  └───────────────────────────────────────────────┘   │             │
│                                                      │             │
│  ┌───────────────────────────────────────────────────▼──────────┐  │
│  │          LegacyDataSource (OLD/WRONG) — READ-ONLY            │  │
│  │  oficinabrasilpostgresdev (sa-east-1)                        │  │
│  │  Schema: CAMPANHAS_OB (apenas leitura)                       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Decisões Arquiteturais

### D1: Dual DataSource com TypeORM

TypeORM suporta múltiplos DataSources nativamente. Criaremos:
- `AppDataSource` → banco correto (PRD) — leitura + escrita
- `LegacyDataSource` → banco antigo (DEV) — **somente leitura**

```typescript
// data-source.ts
export const AppDataSource = new DataSource({...}); // PRD - read/write
export const LegacyDataSource = new DataSource({...}); // DEV - read-only
```

### D2: Service Layer Migration Pattern

Em vez de reescrever todos os services, criaremos um padrão de **repository wrapper** que:
- **Escrita**: Usa `AppDataSource` (novo) exclusivamente
- **Leitura**: Busca em `AppDataSource` primeiro, depois complementa com `LegacyDataSource`

```typescript
// Pattern para cada service:
class MigrationAwareRepository<T> {
  private newRepo: Repository<T>;
  private legacyRepo: Repository<T>;

  async findAll(): Promise<T[]> {
    const [newResults, legacyResults] = await Promise.all([
      this.newRepo.find(),
      this.legacyRepo.find()
    ]);
    return this.mergeResults(newResults, legacyResults);
  }

  async save(entity: T): Promise<T> {
    return this.newRepo.save(entity); // Sempre no banco novo
  }
}
```

### D3: Merge Strategy

**Regras de merge para leitura:**
1. Busca em paralelo em ambos os DataSources (performance)
2. Registros do banco novo têm prioridade (se mesmo ID existe em ambos)
3. Deduplicação por chave primária
4. Relações são resolvidas após o merge

**Para consultas por ID:**
1. Busca primeiro no banco novo
2. Se não encontrar, busca no banco antigo (fallback)

### D4: Conflito de IDs

Como ambos os bancos têm auto-increment independente, os IDs podem conflitar.

**Estratégia**: Antes de ativar o dual-mode, ajustar a sequence do banco novo para começar após o MAX(ID) de cada tabela no banco antigo.

```sql
-- Executar no banco NOVO (PRD) antes do deploy
SELECT setval('"CAMPANHAS_OB"."CAMPANHA_ID_CAMPANHA_seq"', 
  (SELECT MAX("ID_CAMPANHA") FROM "CAMPANHAS_OB"."CAMPANHA"), true);
-- Repetir para cada tabela...
```

### D5: Entidades Cross-Database (Oficina ↔ RotaPromotor)

`RotaPromotor` (CAMPANHAS_OB) referencia `Oficina` (MAIN_REGISTER). 

**No banco novo (PRD)**: Ambos os schemas coexistem → JOIN funciona normalmente.
**No banco antigo (DEV)**: MAIN_REGISTER não existe → relação com Oficina retorna null.

**Decisão**: Para dados do banco antigo, resolver relações com Oficina fazendo query separada no banco novo (onde MAIN_REGISTER existe).

### D6: Configuração via Environment Variables

```env
# Conexão principal (banco correto - PRD)
DB_TYPE=postgres
DB_HOST="oficinabrasilpostgresprd.cdo2simiqjlr.us-east-1.rds.amazonaws.com"
DB_PORT=5432
DB_USERNAME="..."
DB_PASSWORD="..."
DB_DATABASE="OFICINA_BRASIL"

# Conexão legada (banco antigo - DEV) — opcional
LEGACY_DB_HOST="oficinabrasilpostgresdev.chaoam4eqnpu.sa-east-1.rds.amazonaws.com"
LEGACY_DB_PORT=5432
LEGACY_DB_USERNAME="..."
LEGACY_DB_PASSWORD="..."
LEGACY_DB_DATABASE="OFICINA_BRASIL"
LEGACY_DB_ENABLED=true
```

Quando `LEGACY_DB_ENABLED` não está definido ou é `false`, a aplicação opera normalmente com apenas a conexão principal.

---

## Componentes a Criar/Modificar

| Componente | Ação | Descrição |
|------------|------|-----------|
| `data-source.ts` | Modificar | Adicionar LegacyDataSource + lógica de inicialização condicional |
| `utils/migrationRepository.ts` | Criar | Classe genérica de merge read + write routing |
| `service/campanhaService.ts` | Modificar | Usar MigrationAwareRepository para queries |
| `service/campanhaPerguntasService.ts` | Modificar | Usar MigrationAwareRepository para queries |
| `service/campanhaResultsService.ts` | Modificar | Usar MigrationAwareRepository para queries |
| `service/promotorService.ts` | Modificar | Usar MigrationAwareRepository para queries |
| `service/rotaService.ts` | Modificar | Usar MigrationAwareRepository para queries |
| `app.ts` | Modificar | Inicializar ambos os DataSources |
| `scripts/migrate-data.ts` | Criar | Script de migração bulk |
| `scripts/adjust-sequences.sql` | Criar | SQL para ajustar sequences no banco novo |

---

## Fluxo de Migração (Timeline)

```
Fase 1: Deploy Dual-Mode
├── Ajustar sequences no banco novo (evitar conflito de IDs)
├── Deploy da aplicação com dual DataSource
├── Novas escritas → banco novo
└── Leituras → merge (ambos)

Fase 2: Migração de Dados
├── Executar script de migração bulk (idempotente)
├── Validar contagens: antigo vs novo
└── Verificar integridade referencial

Fase 3: Remoção do Legado
├── Setar LEGACY_DB_ENABLED=false
├── Monitorar por 24-48h
├── Remover código de merge
└── Remover variáveis LEGACY_DB_*
```

---

## Ordem de Migração de Dados (respeitando FKs)

```
1. PROMOTOR (sem dependências)
2. CAMPANHA (sem dependências)
3. CAMPANHA_PERGUNTAS (depende de CAMPANHA)
4. CAMPANHA_PERGUNTA_OPCOES (depende de CAMPANHA_PERGUNTAS)
5. CAMPANHA_PROMOTOR (depende de CAMPANHA + PROMOTOR)
6. ROTA_PROMOTOR (depende de CAMPANHA_PROMOTOR + OFICINA*)
7. CAMPANHA_RESULTS (depende de ROTA_PROMOTOR + CAMPANHA_PERGUNTAS)

* OFICINA já está no banco correto
```
