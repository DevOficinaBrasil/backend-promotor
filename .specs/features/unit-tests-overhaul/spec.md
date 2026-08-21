# Atualização Completa dos Testes Unitários

## Problem Statement

Os testes unitários em `__tests__/unit/` estão desatualizados e não executam corretamente. Os problemas identificados:

1. **Incompatibilidade ts-jest / Jest 30:** O projeto usa `jest@30.0.5` com `ts-jest@29.4.1`. Jest 30 tem breaking changes e ts-jest 29 não é compatível.
2. **Mock desatualizado do data-source:** O mock em `__mocks__/data-source.ts` só expõe `getRepository` — os services agora usam `MigrationAwareRepository` e `AppDataSourceSync.query`/`.transaction` que não estão mockados.
3. **Tests referenciam API antiga:** Os testes chamam `AppDataSourceSync.getRepository` diretamente, mas os services migraram para `MigrationAwareRepository` que encapsula esse acesso. Os mocks não refletem essa abstração.
4. **Services sem cobertura:** `geolocationService`, `oficinaService`, `campanhaPromotorService`, `usuarioService` e `rotaService.reassignRotasByAddress` não possuem testes.
5. **Sem testes de tipagem/validação:** Nenhum teste verifica que os services rejeitam inputs inválidos (null, undefined, tipos errados).

## Goals

- [ ] Corrigir configuração Jest para que os testes executem sem erros
- [ ] Atualizar mock do data-source para suportar `MigrationAwareRepository`, `.query()` e `.transaction()`
- [ ] Reescrever testes existentes (`campanhaService`, `campanhaPerguntasService`, `campanhaResultsService`, `promotorService`, `rotaService`) usando a abstração correta
- [ ] Criar testes para services sem cobertura (`geolocationService`, `oficinaService`, `campanhaPromotorService`, `usuarioService`)
- [ ] Adicionar testes de type-safety: inputs inválidos, null/undefined handling, edge cases
- [ ] Garantir que `npm run test:unit` passe com 0 falhas

## Non-Goals

- Testes de integração (ficam em `__tests__/integration/`)
- Testes end-to-end de controllers/routes (escopo futuro)
- Cobertura 100% — foco nos cenários principais e alternativos de maior risco
- Alterar lógica dos services — apenas corrigir/criar testes

## Diagnóstico Técnico

### 1. Incompatibilidade Jest 30 + ts-jest 29

```
jest@30.0.5
ts-jest@29.4.1
```

`ts-jest@29.x` suporta apenas Jest ≤ 29. Opções:
- **Opção A:** Downgrade jest para `^29.7.0` (mais seguro, ts-jest 29 é estável)
- **Opção B:** Upgrade ts-jest para versão compatível com Jest 30 (se existir)

**Decisão recomendada:** Opção A — downgrade jest para 29.7.x. É a combinação estável documentada.

### 2. Mock `__mocks__/data-source.ts` incompleto

Atual:
```ts
export const AppDataSourceSync = {
  getRepository: jest.fn()
}
```

Necessário:
```ts
export const AppDataSourceSync = {
  getRepository: jest.fn(),
  query: jest.fn(),
  transaction: jest.fn(),
}
```

### 3. `MigrationAwareRepository` não mockado

Os services usam `new MigrationAwareRepository<T>(Entity, pkField)` que internamente usa `AppDataSourceSync.getRepository`. O mock precisa cobrir os métodos do MigrationAwareRepository:
- `find()`, `findOne()`, `create()`, `save()`, `saveMany()`, `softDelete()`, `update()`

**Estratégia:** Mock do módulo `utils/migrationRepository` retornando um factory que gera instâncias com métodos mockados.

### 4. Inventário de Cobertura por Service

| Service | Arquivo de Teste | Status | Métodos Cobertos | Métodos Faltando |
|---------|-----------------|--------|-----------------|------------------|
| campanhaPerguntasService | ✅ existe | ❌ desatualizado | `getPerguntasByCampanhaId` | `createCampanhaPergunta`, `updateCampanhaPergunta`, `deleteCampanhaPergunta`, `findCampanhaPerguntaById`, `getAllCampanhaPerguntas` |
| campanhaResultsService | ✅ existe | ❌ desatualizado | `saveOrUpdateResult`, `updateResult`, `findResultById`, `getResultsByRotaId`, `getResultsByCampanhaId` | Precisa adaptar ao MigrationAwareRepository |
| campanhaService | ✅ existe | ❌ desatualizado | `getActiveCampanhaByPromotor`, `createCampanha`, `updateCampanha` | `deleteCampanha`, `findCampanhaById`, `getAllCampanhas`, `getCampanhaByIdWithRelations`, `getCampanhasByClientId` |
| promotorService | ✅ existe | ❌ desatualizado | `createPromotor`, `linkCampanhaPromotor`, `getPromotoresByClientId` | `updatePromotor`, `deletePromotor`, `findPromotorById`, `findPromotorByEmail`, `loginPromotor`, `getAllPromotores`, `unlinkCampanhaPromotor` |
| rotaService | ✅ existe | ❌ desatualizado | `createRotaWithCampanhaPromotor`, `createRotas` | `updateRotaWorkshops`, `updateRotaOptions`, `findRotaById`, `getRotaByIdWithRelations`, `optimizeAndSaveRoute`, `reorderRotas`, `reassignRotasByAddress`, `removeCampanhaPromotorRota`, `getOficinasAssignedInCampanha` |
| geolocationService | ❌ não existe | — | — | `getLatLongByCep`, `getLatLongByNominatim`, `getLatLongByGoogleMaps` |
| oficinaService | ❌ não existe | — | — | `findNearestOficinas`, `getComunityNearbyOficinas` |
| campanhaPromotorService | ❌ não existe | — | — | `linkCampanhaPromotor`, `updateRaio`, `unlinkCampanhaPromotor`, `getCampanhasByPromotor` |
| usuarioService | ❌ não existe | — | — | `getUserById` |

## Cenários de Teste por Service

### campanhaPerguntasService

| Método | Cenários |
|--------|----------|
| `createCampanhaPergunta` | Cria pergunta simples; cria com opções; valida campanha inexistente (throw); input sem ID_CAMPANHA |
| `updateCampanhaPergunta` | Atualiza campos; atualiza opções (replace); retorna null se não encontrado; valida campanha inexistente em update de ID_CAMPANHA |
| `deleteCampanhaPergunta` | Soft delete sucesso; retorna null se não encontrado |
| `findCampanhaPerguntaById` | Encontra com relations; retorna null |
| `getAllCampanhaPerguntas` | Retorna lista; retorna vazio |
| `getPerguntasByCampanhaId` | Retorna perguntas com opções ordenadas; retorna vazio |

### campanhaResultsService

| Método | Cenários |
|--------|----------|
| `saveOrUpdateResult` | Cria novo; atualiza existente; throw rota não encontrada; throw pergunta não encontrada |
| `updateResult` | Atualiza; retorna null; valida rota/pergunta inexistente |
| `findResultById` | Encontra com relations; retorna null |
| `getResultsByRotaId` | Retorna resultados; retorna vazio |
| `getResultsByCampanhaId` | Retorna com joins; retorna vazio |

### campanhaService

| Método | Cenários |
|--------|----------|
| `createCampanha` | Sem promotores; com promotores + oficinas; dados parciais |
| `updateCampanha` | Com replace de promotores; sem promotores (mantém); retorna null |
| `deleteCampanha` | Soft delete; retorna null |
| `findCampanhaById` | Encontra; retorna null |
| `getActiveCampanhaByPromotor` | Campanha ativa com rotas; sem campanha ativa; rotas sem oficina |
| `getAllCampanhas` | Retorna lista ordenada |
| `getCampanhasByClientId` | Retorna campanhas do client com nested data |

### promotorService

| Método | Cenários |
|--------|----------|
| `createPromotor` | Sem campanha; com campanha(s); com CEP (geocode); com empresaSlug (auto-assign); senha encriptada |
| `updatePromotor` | Atualiza campos; atualiza CEP (recalcula lat/long); retorna null; encripta nova senha |
| `deletePromotor` | Soft delete; retorna null |
| `findPromotorById` | Encontra; retorna null |
| `findPromotorByEmail` | Encontra; retorna null |
| `loginPromotor` | Credenciais válidas; senha errada; email inexistente; promotor sem senha |
| `getAllPromotores` | Retorna lista |
| `linkCampanhaPromotor` | Link simples; com auto-assign; sem duplicatas |
| `unlinkCampanhaPromotor` | Remove rotas + unlink |
| `getPromotoresByClientId` | Retorna por client |

### rotaService

| Método | Cenários |
|--------|----------|
| `createRotas` | Única; batch; com CREATED_BY |
| `createRotaWithCampanhaPromotor` | Transação com múltiplas oficinas |
| `updateRotaWorkshops` | Adiciona novas; remove antigas; mix |
| `updateRotaOptions` | Atualiza status/obs; retorna null |
| `findRotaById` | Encontra; retorna null |
| `getOficinasAssignedInCampanha` | Retorna IDs; retorna vazio |
| `optimizeAndSaveRoute` | Otimiza com OSRM; throw sem rotas; throw sem coordenadas |
| `reorderRotas` | Manual com array; PROXIMIDADE limpa ordem; throw manual sem array |
| `reassignRotasByAddress` | Mantém no raio; reatribui; sem candidato; throw CEP invalido; throw NOT_FOUND |
| `removeCampanhaPromotorRota` | Hard delete |

### geolocationService

| Método | Cenários |
|--------|----------|
| `getLatLongByCep` | Retorno via Nominatim; fallback Google; ambos falham → null |
| `getLatLongByNominatim` | Endereço completo; fallback sem bairro; CEP inválido |
| `getLatLongByGoogleMaps` | Sucesso; sem API key → null; API retorna erro |

### oficinaService

| Método | Cenários |
|--------|----------|
| `findNearestOficinas` | Retorna com distância e flags default; limit customizado; erro DB (rethrow) |
| `getComunityNearbyOficinas` | Retorna filtrado por raio; retorna vazio; erro DB (rethrow) |

### campanhaPromotorService

| Método | Cenários |
|--------|----------|
| `linkCampanhaPromotor` | ID único; array; sem duplicata; com RAIO; default RAIO 20 |
| `updateRaio` | Atualiza; retorna null |
| `unlinkCampanhaPromotor` | Remove; retorna vazio se não encontrado |
| `getCampanhasByPromotor` | Retorna IDs; vazio |

### usuarioService

| Método | Cenários |
|--------|----------|
| `getUserById` | Encontra; retorna null |

## Testes de Type-Safety

Para cada service, adicionar um bloco `describe('type safety')` com:

| Cenário | Validação |
|---------|-----------|
| ID numérico recebe `NaN` | Não quebra / retorna null / throw adequado |
| String onde espera number | Service não salva dado corrupto |
| `undefined` em campos obrigatórios | Comportamento previsível |
| Array vazio onde espera array com items | Não cria registros fantasma |
| Objeto parcial extremo (todos campos undefined) | Não corrompe entidade |

## Estrutura de Mocks

### `__mocks__/data-source.ts` (atualizado)

```ts
export const AppDataSourceSync = {
  getRepository: jest.fn(),
  query: jest.fn(),
  transaction: jest.fn((cb: Function) => cb({
    create: jest.fn((_, data) => data),
    save: jest.fn((data) => Promise.resolve(data)),
    softDelete: jest.fn(),
    find: jest.fn(),
  })),
};
```

### `__mocks__/utils/migrationRepository.ts` (novo)

```ts
export const mockMigrationRepo = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn((data) => data),
  save: jest.fn((data) => Promise.resolve(data)),
  saveMany: jest.fn((data) => Promise.resolve(data)),
  softDelete: jest.fn(),
  update: jest.fn(),
  getLegacyRepoInstance: jest.fn(),
  queryBothAndMerge: jest.fn(),
};

export class MigrationAwareRepository {
  constructor() {
    return mockMigrationRepo;
  }
}
```

### Mock de fetch (para GeolocationService)

```ts
// Mock global fetch para testes de geolocationService
global.fetch = jest.fn();
```

## Configuração Jest Corrigida

### `jest.config.ts`

```ts
import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleFileExtensions: ["ts", "js", "json"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  clearMocks: true,
  verbose: true,
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  coveragePathIgnorePatterns: [
    "entities",
    "data-source.ts",
  ],
  transform: {
    "^.+\\.ts$": ["ts-jest", {
      tsconfig: "tsconfig.json",
      diagnostics: { ignoreDiagnostics: [5103] },
    }],
  },
};

export default config;
```

### `package.json` — downgrade jest

```json
"devDependencies": {
  "@types/jest": "^29.5.0",
  "jest": "^29.7.0",
  "ts-jest": "^29.4.1",
  ...
}
```

## Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `package.json` | Modificar | Downgrade jest + @types/jest para 29.x |
| `jest.config.ts` | Modificar | Adicionar transform com diagnostics ignore |
| `__mocks__/data-source.ts` | Modificar | Adicionar `query` e `transaction` |
| `__mocks__/migrationRepository.ts` | Criar | Mock do MigrationAwareRepository |
| `__tests__/unit/campanhaPerguntasService.test.ts` | Reescrever | Cobertura completa com novo mock |
| `__tests__/unit/campanhaResultsService.test.ts` | Reescrever | Adaptar ao MigrationAwareRepository |
| `__tests__/unit/campanhaService.test.ts` | Reescrever | Cobertura de todos métodos |
| `__tests__/unit/promotorService.test.ts` | Reescrever | Incluir login, update, delete, type safety |
| `__tests__/unit/rotaService.test.ts` | Reescrever | Incluir todos métodos + reassign |
| `__tests__/unit/geolocationService.test.ts` | Criar | Mock de fetch + cenários |
| `__tests__/unit/oficinaService.test.ts` | Criar | Mock de query + cenários |
| `__tests__/unit/campanhaPromotorService.test.ts` | Criar | Cobertura completa |
| `__tests__/unit/usuarioService.test.ts` | Criar | Cenário simples |
| `__tests__/unit/haversine.test.ts` | Criar | Testes da função pura |

## Tasks de Implementação

1. **Fix Jest config** — downgrade jest/types, ajustar `jest.config.ts`
2. **Atualizar mocks** — `__mocks__/data-source.ts` + criar `__mocks__/migrationRepository.ts`
3. **Reescrever `campanhaPerguntasService.test.ts`** — todos métodos + type safety
4. **Reescrever `campanhaResultsService.test.ts`** — adaptar mocks + type safety
5. **Reescrever `campanhaService.test.ts`** — cobertura ampla
6. **Reescrever `promotorService.test.ts`** — login, CRUD, auto-assign, type safety
7. **Reescrever `rotaService.test.ts`** — todos métodos incluindo reassign
8. **Criar `geolocationService.test.ts`** — mock fetch + fallback
9. **Criar `oficinaService.test.ts`** — mock query
10. **Criar `campanhaPromotorService.test.ts`** — CRUD completo
11. **Criar `usuarioService.test.ts`** — cenário simples
12. **Criar `haversine.test.ts`** — função pura com valores conhecidos
13. **Validar execução** — `npm run test:unit` deve passar 100%
