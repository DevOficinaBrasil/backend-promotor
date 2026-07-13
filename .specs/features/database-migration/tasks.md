# Database Migration - Tasks

## Fase 1: Infraestrutura Dual-Connection

### Task 1.1: Configurar LegacyDataSource
**REQ**: REQ-01  
**Files**: `data-source.ts`  
**Depends on**: —

**Steps**:
1. Adicionar variáveis LEGACY_DB_* ao `.env` / `exemple.env`
2. Criar `LegacyDataSource` condicional (só inicializa se LEGACY_DB_ENABLED=true)
3. Configurar como **read-only** (sem synchronize, sem migrations)
4. Exportar `LegacyDataSource` e helper `isLegacyEnabled()`

**Verification**:
- [ ] App inicia com ambas as conexões quando LEGACY_DB_ENABLED=true
- [ ] App inicia normalmente quando LEGACY_DB_ENABLED não está definido
- [ ] Log indica status de ambas as conexões

---

### Task 1.2: Atualizar inicialização em app.ts
**REQ**: REQ-01  
**Files**: `app.ts`  
**Depends on**: Task 1.1

**Steps**:
1. Importar `LegacyDataSource` e `isLegacyEnabled`
2. Inicializar `LegacyDataSource` em paralelo com `AppDataSource`
3. Tratar falha do `LegacyDataSource` como warning (não impede startup)
4. Logar status das conexões

**Verification**:
- [ ] Aplicação inicia com dual-connection
- [ ] Falha no LegacyDataSource gera warning mas app continua
- [ ] Logs mostram status de ambas conexões

---

### Task 1.3: Criar MigrationAwareRepository
**REQ**: REQ-02, REQ-03  
**Files**: `utils/migrationRepository.ts` (novo)  
**Depends on**: Task 1.1

**Steps**:
1. Criar classe genérica `MigrationAwareRepository<T>`
2. Implementar `find()` com merge de ambos os DataSources
3. Implementar `findOne()` com fallback (novo → antigo)
4. Implementar `save()` / `remove()` direcionado ao banco novo
5. Implementar deduplicação por PK
6. Tratar cenário onde LegacyDataSource está desabilitado (bypass merge)

**Verification**:
- [ ] `find()` retorna registros de ambos os bancos sem duplicatas
- [ ] `findOne(id)` busca primeiro no novo, fallback no antigo
- [ ] `save()` persiste exclusivamente no banco novo
- [ ] Quando LEGACY_DB_ENABLED=false, comporta-se como repository normal

---

## Fase 2: Adaptar Services

### Task 2.1: Migrar promotorService.ts
**REQ**: REQ-02, REQ-03  
**Files**: `service/promotorService.ts`  
**Depends on**: Task 1.3

**Steps**:
1. Substituir `AppDataSourceSync.getRepository(Promotor)` por `MigrationAwareRepository`
2. Adaptar métodos de leitura para usar merge
3. Manter métodos de escrita apontando para banco novo
4. Garantir login/autenticação funciona com dados em ambos os bancos

**Verification**:
- [ ] GET /promotores retorna dados de ambos os bancos
- [ ] POST /promotores cria no banco novo
- [ ] Login funciona com promotor do banco antigo

---

### Task 2.2: Migrar campanhaService.ts
**REQ**: REQ-02, REQ-03  
**Files**: `service/campanhaService.ts`  
**Depends on**: Task 1.3

**Steps**:
1. Substituir repositories diretos por `MigrationAwareRepository`
2. Adaptar queries com relações (campanhaPromotores, campanhaPerguntas)
3. Manter writes no banco novo

**Verification**:
- [ ] GET /campanhas retorna campanhas de ambos os bancos
- [ ] GET /campanhas/:id funciona para IDs em qualquer banco
- [ ] POST /campanhas cria no banco novo
- [ ] Relações (perguntas, promotores) resolvidas corretamente

---

### Task 2.3: Migrar campanhaPerguntasService.ts
**REQ**: REQ-02, REQ-03  
**Files**: `service/campanhaPerguntasService.ts`  
**Depends on**: Task 1.3

**Steps**:
1. Adaptar createCampanhaPergunta para banco novo
2. Adaptar queries de leitura para merge
3. Manter lógica de opções (CampanhaPerguntaOpcao) no banco novo

**Verification**:
- [ ] Perguntas de campanhas antigas aparecem nas consultas
- [ ] Novas perguntas são criadas no banco novo
- [ ] Opções (Multi) funcionam em ambos os cenários

---

### Task 2.4: Migrar campanhaResultsService.ts
**REQ**: REQ-02, REQ-03  
**Files**: `service/campanhaResultsService.ts`  
**Depends on**: Task 1.3

**Steps**:
1. Adaptar escrita de resultados para banco novo
2. Adaptar leitura para merge
3. Garantir relações com RotaPromotor e CampanhaPerguntas resolvidas

**Verification**:
- [ ] Resultados antigos aparecem nas consultas
- [ ] Novos resultados são salvos no banco novo
- [ ] Relações com rotas/perguntas funcionam

---

### Task 2.5: Migrar rotaService.ts
**REQ**: REQ-02, REQ-03  
**Files**: `service/rotaService.ts`  
**Depends on**: Task 1.3

**Steps**:
1. Adaptar queries de rotas para merge
2. Garantir que relação com Oficina (banco correto) funciona para dados de ambos os bancos
3. Manter lógica de ordenação funcionando
4. Escrita de novas rotas no banco novo

**Verification**:
- [ ] Rotas antigas com oficinas aparecem corretamente
- [ ] Novas rotas são criadas no banco novo
- [ ] Checkin/checkout funciona para rotas de ambos os bancos

---

## Fase 3: Migração de Dados

### Task 3.1: ~~Criar script de ajuste de sequences~~ ✅ DONE
**REQ**: REQ-04  
**Files**: `scripts/adjust-sequences.sql` (novo)  
**Depends on**: —

**Status**: Concluído manualmente pelo usuário — sequences já ajustadas no banco novo.

**Verification**:
- [x] Sequences no banco novo começam após os IDs existentes
- [x] Novos registros não conflitam com IDs antigos

---

### Task 3.2: Criar script de migração bulk
**REQ**: REQ-04  
**Files**: `scripts/migrate-data.ts` (novo)  
**Depends on**: Task 1.1, Task 3.1

**Steps**:
1. Criar script TypeScript que usa ambos os DataSources
2. Implementar migração na ordem correta (respeitando FKs)
3. Implementar lógica idempotente (skip se já existe)
4. Adicionar logging de progresso e contagens
5. Implementar rollback em caso de erro parcial

**Verification**:
- [ ] Script migra todos os registros na ordem correta
- [ ] Re-executar não gera duplicatas
- [ ] Contagens finais batem: antigo == novo
- [ ] Foreign keys válidas após migração

---

## Fase 4: Remoção do Legado

### Task 4.1: Feature flag para desabilitar merge
**REQ**: REQ-05  
**Files**: `utils/migrationRepository.ts`, `data-source.ts`  
**Depends on**: Task 3.2

**Steps**:
1. Quando LEGACY_DB_ENABLED=false, MigrationAwareRepository bypassa merge
2. Testar que toda a API funciona sem a conexão antiga
3. Documentar processo de remoção final

**Verification**:
- [ ] App funciona normalmente com LEGACY_DB_ENABLED=false
- [ ] Nenhum erro de conexão ao banco antigo
- [ ] Performance igual ou melhor (sem overhead)

---

## Dependency Graph

```
Task 1.1 (LegacyDataSource)
  ├── Task 1.2 (app.ts init)
  ├── Task 1.3 (MigrationAwareRepository)
  │     ├── Task 2.1 (promotorService)
  │     ├── Task 2.2 (campanhaService)
  │     ├── Task 2.3 (campanhaPerguntasService)
  │     ├── Task 2.4 (campanhaResultsService)
  │     └── Task 2.5 (rotaService)
  └── Task 3.2 (migrate-data script)

Task 3.1 (adjust-sequences) ─── standalone, executar ANTES do deploy

Task 4.1 (remoção legado) ← depende de TODAS as tasks anteriores
```

## Execution Order Recomendada

1. ~~**Task 3.1** — Ajustar sequences~~ ✅ (já feito)
2. **Task 1.1** — Criar LegacyDataSource ← **PRÓXIMO**
3. **Task 1.2** — Atualizar app.ts
4. **Task 1.3** — Criar MigrationAwareRepository
5. **Tasks 2.1–2.5** — Migrar services (podem ser em paralelo)
6. **Deploy** — Aplicação em dual-mode
7. **Task 3.2** — Executar migração bulk
8. **Task 4.1** — Desabilitar legado + limpeza
