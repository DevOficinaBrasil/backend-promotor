# Atualização Completa dos Testes Unitários - Design

## Visão Geral da Arquitetura de Testes

```
jest.config.ts                    ← fix preset + diagnostics
│
├─ __mocks__/
│   ├─ data-source.ts             ← AppDataSourceSync + LegacyDataSource + isLegacyEnabled
│   └─ utils/
│       └─ migrationRepository.ts ← MigrationAwareRepository + queryBothAndMerge mock
│
└─ __tests__/unit/
    ├─ haversine.test.ts                  ← CRIAR (função pura)
    ├─ campanhaPromotorService.test.ts    ← CRIAR
    ├─ geolocationService.test.ts         ← CRIAR
    ├─ oficinaService.test.ts             ← CRIAR
    ├─ usuarioService.test.ts             ← CRIAR
    ├─ campanhaPerguntasService.test.ts   ← REESCREVER
    ├─ campanhaResultsService.test.ts     ← REESCREVER
    ├─ campanhaService.test.ts            ← REESCREVER
    ├─ promotorService.test.ts            ← REESCREVER
    └─ rotaService.test.ts                ← REESCREVER
```

## Decisões de Design

### D1: Downgrade Jest para 29.7.x

`ts-jest@29.4.1` não suporta Jest 30. Downgrade para `jest@^29.7.0` + `@types/jest@^29.5.0`.

**Motivo:** Combinação estável e documentada. Upgrade de ts-jest para versão com suporte a Jest 30 ainda é experimental.

### D2: Mock do MigrationAwareRepository via module mock

Em vez de mockar `AppDataSourceSync.getRepository` (abordagem dos testes atuais), mockamos o módulo `utils/migrationRepository` inteiro. Cada test file importa um helper `mockRepo` que retorna um objeto com todos os métodos do MigrationAwareRepository como jest.fn().

**Motivo:** Os services instanciam `new MigrationAwareRepository(Entity, pk)` internamente. Não é possível interceptar o constructor sem module mock. Com `jest.mock('../../utils/migrationRepository')`, o constructor retorna nosso mock controlável.

**Detalhe crítico:** Alguns services também usam `AppDataSourceSync.getRepository` diretamente (ex: `CampanhaService.linkPromotoresToCampanha`, `CampanhaPromotorService.updateRaio`). O mock do data-source continua necessário para esses casos.

### D3: Um mock factory reutilizável por test file

Cada test file cria seus mocks frescos via helper function — não compartilha estado entre suites. Isso evita contaminação entre testes e permite `clearAllMocks()` funcionar corretamente.

```ts
function createMockRepo() {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((data: any) => data),
    save: jest.fn((data: any) => Promise.resolve(data)),
    saveMany: jest.fn((data: any) => Promise.resolve(data)),
    softDelete: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
    getNewRepo: jest.fn(),
    getLegacyRepoInstance: jest.fn().mockReturnValue(null),
  };
}
```

### D4: Mock por entity via constructor tracking

O `MigrationAwareRepository` constructor recebe `(Entity, pkField)`. Para mockar diferentes repos por entity (ex: `getPerguntaRepo` vs `getCampanhaRepo` no mesmo service), usamos `jest.fn().mockImplementation()` no constructor:

```ts
const perguntaRepo = createMockRepo();
const campanhaRepo = createMockRepo();

(MigrationAwareRepository as jest.Mock).mockImplementation((entity: any) => {
  if (entity === CampanhaPerguntas) return perguntaRepo;
  if (entity === Campanha) return campanhaRepo;
  return createMockRepo();
});
```

### D5: Não mockar fetch globalmente no setup — apenas por test file

`GeolocationService` usa `global.fetch`. Mockar no `jest.setup.ts` global afetaria todos os testes. Em vez disso, cada test file que precisa mocka `fetch` localmente.

### D6: Testes de type-safety são documentais, não de runtime

TypeScript valida tipos em compile-time. Os "testes de type-safety" no spec verificam que os services se comportam de forma previsível quando recebem edge cases que passariam pela validação do controller (ex: `NaN` como ID, array vazio, objeto vazio). Não testam o type system em si.

### D7: campanhaService.getActiveCampanhaByPromotor e getCampanhasByClientId usam raw SQL

Esses métodos usam `queryBothAndMerge()` e `AppDataSourceSync.query()` diretamente. Para testá-los, mockamos a função `queryBothAndMerge` e `AppDataSourceSync.query`.

### D8: geolocationService usa instance methods (não static)

`GeolocationService` é instanciado (`new GeolocationService()`). Os métodos privados (`getLatLongByNominatim`, `getLatLongByGoogleMaps`) não podem ser testados diretamente. Testamos via `getLatLongByCep()` que é o entry point público, controlando o comportamento de `fetch`.

## Mudanças por Arquivo

### 1. `package.json` (MODIFICAR)

```diff
  "devDependencies": {
-   "@types/jest": "^30.0.0",
-   "jest": "^30.0.5",
+   "@types/jest": "^29.5.0",
+   "jest": "^29.7.0",
    "ts-jest": "^29.4.1",
```

### 2. `jest.config.ts` (MODIFICAR)

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

**Mudanças:**
- `transform` com `diagnostics.ignoreDiagnostics: [5103]` — ignora o erro TS5103 do `ignoreDeprecations` no tsconfig
- Remove `"utils"` de `coveragePathIgnorePatterns` — queremos cobrir `utils/haversine.ts`

### 3. `__mocks__/data-source.ts` (MODIFICAR)

```ts
export const AppDataSourceSync = {
  getRepository: jest.fn(),
  query: jest.fn(),
  transaction: jest.fn((cb: Function) => cb({
    create: jest.fn((_: any, data: any) => data),
    save: jest.fn((data: any) => Promise.resolve(data)),
    softDelete: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  })),
};

export const LegacyDataSource = {
  isInitialized: false,
  getRepository: jest.fn(),
  query: jest.fn(),
};

export const isLegacyEnabled = jest.fn().mockReturnValue(false);
```

### 4. `__tests__/helpers/mockMigrationRepo.ts` (CRIAR)

```ts
export function createMockRepo() {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((data: any) => data),
    save: jest.fn((data: any) => Promise.resolve(data)),
    saveMany: jest.fn((data: any) => Promise.resolve(data)),
    softDelete: jest.fn(),
    update: jest.fn(),
    remove: jest.fn((data: any) => Promise.resolve(data)),
    createQueryBuilder: jest.fn(),
    getNewRepo: jest.fn(),
    getLegacyRepoInstance: jest.fn().mockReturnValue(null),
  };
}
```

### 5-14. Test Files

Cada test file segue o padrão:

```ts
import ServiceUnderTest from '../../service/xxxService';
import { MigrationAwareRepository } from '../../utils/migrationRepository';
import { AppDataSourceSync } from '../../data-source';
import { createMockRepo } from '../helpers/mockMigrationRepo';
// entity imports...

jest.mock('../../data-source');
jest.mock('../../utils/migrationRepository');

describe('XxxService', () => {
  const mockRepo = createMockRepo();
  // additional repos if service uses multiple entities...

  beforeEach(() => {
    jest.clearAllMocks();
    (MigrationAwareRepository as jest.Mock).mockImplementation((entity: any) => {
      // return appropriate mock repo per entity
      return mockRepo;
    });
  });

  describe('methodName', () => {
    it('should do X', async () => { ... });
    it('should handle Y edge case', async () => { ... });
  });

  describe('type safety', () => {
    it('should handle NaN ID gracefully', async () => { ... });
    it('should handle empty object gracefully', async () => { ... });
  });
});
```

#### Detalhes por test file:

**`haversine.test.ts`** — Sem mocks. Testa a função pura com coordenadas conhecidas:
- São Paulo ↔ Curitiba (~338km)
- Mesma coordenada → 0
- Antípodas → ~20015km

**`campanhaPromotorService.test.ts`** — Mock MigrationAwareRepository + AppDataSourceSync.getRepository (para `updateRaio`, `unlinkCampanhaPromotor`, `getCampanhasByPromotor` que usam getRepository diretamente).

**`campanhaPerguntasService.test.ts`** — 3 repos mockados (pergunta, opcao, campanha). Testa a lógica de validação de campanha e replace de opções.

**`campanhaResultsService.test.ts`** — 3 repos mockados (result, rota, pergunta). Testa validação de existência de rota/pergunta e merge com legacy via `getLegacyRepoInstance` + `createQueryBuilder`.

**`campanhaService.test.ts`** — Mock MigrationAwareRepository + `queryBothAndMerge` + `AppDataSourceSync.query`. Os métodos `getActiveCampanhaByPromotor` e `getCampanhasByClientId` usam raw SQL e `queryBothAndMerge`, enquanto CRUD básico usa MigrationAwareRepository.

**`promotorService.test.ts`** — Mock MigrationAwareRepository + `encrypt`/`decrypt` + `GeolocationService` + `CampanhaPromotorService` + `OficinaService` + `RotaService` (auto-assign depende de múltiplos services).

**`rotaService.test.ts`** — Mock MigrationAwareRepository + `AppDataSourceSync.transaction` + `AppDataSourceSync.query` + `optimizeRoute`/`fetchOSRMRoute` + `GeolocationService` + `haversineDistanceKm`.

**`geolocationService.test.ts`** — Mock de `global.fetch`. Testa a cadeia Nominatim → Google Maps → null.

**`oficinaService.test.ts`** — Mock de `AppDataSourceSync.query`. Testa que as queries SQL são chamadas com os parâmetros corretos.

**`usuarioService.test.ts`** — Mock de `AppDataSourceSync.getRepository`. Cenário simples (findOne).

## Mock Strategy Matrix

| Service | MigrationAwareRepository | AppDataSourceSync.getRepository | AppDataSourceSync.query | AppDataSourceSync.transaction | queryBothAndMerge | fetch | Outros |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| campanhaPerguntas | ✅ | | | | | | |
| campanhaResults | ✅ | | | | | | |
| campanhaPromotor | ✅ | ✅ | | | | | |
| campanha | ✅ | ✅ | ✅ | | ✅ | | DuckDBClient |
| promotor | ✅ | ✅ | | | | | encrypt/decrypt, GeolocationService, CampanhaPromotorService, OficinaService, RotaService |
| rota | ✅ | | ✅ | ✅ | | | optimizeRoute, fetchOSRMRoute, GeolocationService, haversineDistanceKm |
| geolocation | | | | | | ✅ | |
| oficina | | | ✅ | | | | |
| usuario | | ✅ | | | | | |
| haversine | (nenhum mock) | | | | | | |

## Tasks de Implementação

1. **Fix Jest config + downgrade** — `package.json`, `jest.config.ts`, `npm install`
2. **Atualizar `__mocks__/data-source.ts`** — adicionar `query`, `transaction`, `LegacyDataSource`, `isLegacyEnabled`
3. **Criar `__tests__/helpers/mockMigrationRepo.ts`** — factory reutilizável
4. **Criar `haversine.test.ts`** — função pura, sem dependências
5. **Reescrever `campanhaPerguntasService.test.ts`** — 3 repos, todos métodos
6. **Reescrever `campanhaResultsService.test.ts`** — 3 repos, QueryBuilder mock
7. **Reescrever `campanhaService.test.ts`** — MigrationAwareRepo + queryBothAndMerge + getRepository
8. **Criar `campanhaPromotorService.test.ts`** — MigrationAwareRepo + getRepository
9. **Reescrever `promotorService.test.ts`** — multi-service mocks, login, auto-assign
10. **Reescrever `rotaService.test.ts`** — transaction, query, optimizer, reassign
11. **Criar `geolocationService.test.ts`** — fetch mock, fallback chain
12. **Criar `oficinaService.test.ts`** — query mock
13. **Criar `usuarioService.test.ts`** — getRepository mock
14. **Validar execução** — `npm run test:unit` deve passar 100%
