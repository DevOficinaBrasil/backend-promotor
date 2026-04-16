# SPEC: Ordenação de Rotas de Oficinas para Promotores

## Resumo

O supervisor (via `ob-ads`) poderá definir a **ordem de visitação** das oficinas atribuídas a um promotor em uma campanha. O promotor (via `frontend-promotor`) receberá as oficinas já ordenadas conforme a estratégia escolhida pelo supervisor.

---

## Contexto Atual

### Entidades envolvidas
- **`CAMPANHAS_OB.ROTA_PROMOTOR`** — vincula uma oficina a um `CAMPANHA_PROMOTOR`. Cada registro = 1 visita planejada.
- **`CAMPANHAS_OB.CAMPANHA_PROMOTOR`** — vincula Promotor ↔ Campanha. Possui N rotas.
- **`MAIN_REGISTER.OFICINA`** — possui `LATITUDE` e `LONGITUDE` (varchar).

### Fluxo atual
1. Supervisor cria campanha, vincula promotores e distribui oficinas (rotas) pelo `ob-ads`.
2. Promotor abre o `frontend-promotor`, carrega `GET /campanha/ativa?ID_PROMOTOR=X`.
3. Frontend ordena localmente por `distancia_km` (campo calculado client-side) e exibe num carrossel.

**Problema:** Não existe nenhum campo de ordenação persistido. A ordem é sempre por proximidade calculada no frontend.

---

## Requisitos Funcionais

### RF-01: Estratégia de Ordenação (Supervisor)

O supervisor deve poder escolher uma das 3 estratégias de ordenação para cada `CAMPANHA_PROMOTOR`:

| Código | Estratégia | Descrição |
|--------|-----------|-----------|
| `ROTA_OTIMIZADA` | Ponto A → Ponto B | Supervisor seleciona uma oficina de **início** e uma de **fim**. O sistema calcula a rota mais curta (em linha reta/distância euclidiana) passando por todas as oficinas intermediárias. Ignora ruas/trânsito. |
| `MANUAL` | Ordem manual | Supervisor organiza manualmente a lista de oficinas por drag-and-drop ou numeração. A ordem definida é persistida. |
| `PROXIMIDADE_PROMOTOR` | Proximidade do promotor | A ordenação será feita no dispositivo do promotor, baseada na geolocalização em tempo real. |

### RF-02: Ordenação Otimizada (Ponto A → Ponto B)

- Supervisor seleciona 1 oficina como **ponto de partida** e 1 como **ponto de chegada**.
- O sistema resolve o caminho mais curto visitando **todas** as oficinas intermediárias (variação do Travelling Salesman Problem com início e fim fixos).
- O cálculo usa **distância euclidiana** (haversine) entre coordenadas `LATITUDE`/`LONGITUDE` — não requer API de rotas.
- Após o cálculo, a ordem resultante é persistida no campo `ORDEM` de cada `ROTA_PROMOTOR`.
- **Algoritmo sugerido:** Nearest Neighbor Heuristic com início e fim fixos (complexidade aceitável para N < 100 oficinas). Opcionalmente, 2-opt improvement para refinar.

### RF-03: Ordenação Manual

- Supervisor visualiza a lista de oficinas atribuídas ao promotor.
- Cada oficina possui uma numeração sequencial (1, 2, 3...).
- Supervisor pode reordenar via drag-and-drop ou editando o número.
- Ao salvar, o campo `ORDEM` de cada `ROTA_PROMOTOR` é atualizado.

### RF-04: Proximidade do Promotor

- O campo `ESTRATEGIA_ORDENACAO` em `CAMPANHA_PROMOTOR` é salvo como `PROXIMIDADE_PROMOTOR`.
- O campo `ORDEM` das rotas **não é preenchido** (fica `NULL`).
- Quando o promotor abre o app, o `frontend-promotor` solicita a geolocalização do dispositivo e ordena as rotas por distância haversine entre a posição atual e a `LATITUDE`/`LONGITUDE` de cada oficina.

### RF-05: Recepção no App do Promotor

- Ao carregar a rota do dia (`GET /campanha/ativa`), a API retorna as rotas com os campos `ORDEM` e `ESTRATEGIA_ORDENACAO`.
- **Se `ESTRATEGIA_ORDENACAO` = `ROTA_OTIMIZADA` ou `MANUAL`:** frontend ordena por `ORDEM` (ASC).
- **Se `ESTRATEGIA_ORDENACAO` = `PROXIMIDADE_PROMOTOR`:** frontend calcula distância a partir da localização atual e ordena por proximidade.
- O badge atual "Ordenado por proximidade" deve refletir a estratégia real.

---

## Alterações no Banco de Dados

### Tabela `CAMPANHAS_OB.CAMPANHA_PROMOTOR` — novos campos

| Campo | Tipo | Nullable | Default | Descrição |
|-------|------|----------|---------|-----------|
| `ESTRATEGIA_ORDENACAO` | `ENUM('ROTA_OTIMIZADA', 'MANUAL', 'PROXIMIDADE_PROMOTOR')` | YES | `PROXIMIDADE_PROMOTOR` | Estratégia de ordenação escolhida pelo supervisor |
| `ID_OFICINA_INICIO` | `INT` | YES | NULL | FK para `OFICINA.ID_OFICINA` — ponto A (apenas para `ROTA_OTIMIZADA`) |
| `ID_OFICINA_FIM` | `INT` | YES | NULL | FK para `OFICINA.ID_OFICINA` — ponto B (apenas para `ROTA_OTIMIZADA`) |

### Tabela `CAMPANHAS_OB.ROTA_PROMOTOR` — novo campo

| Campo | Tipo | Nullable | Default | Descrição |
|-------|------|----------|---------|-----------|
| `ORDEM` | `INT` | YES | NULL | Posição da oficina na sequência de visitação (1-indexed). NULL = sem ordem definida. |

### SQL de migração

```sql
-- Enum type
CREATE TYPE "CAMPANHAS_OB"."ESTRATEGIA_ORDENACAO_ENUM" AS ENUM (
  'ROTA_OTIMIZADA',
  'MANUAL',
  'PROXIMIDADE_PROMOTOR'
);

-- Novos campos em CAMPANHA_PROMOTOR
ALTER TABLE "CAMPANHAS_OB"."CAMPANHA_PROMOTOR"
  ADD COLUMN "ESTRATEGIA_ORDENACAO" "CAMPANHAS_OB"."ESTRATEGIA_ORDENACAO_ENUM" DEFAULT 'PROXIMIDADE_PROMOTOR',
  ADD COLUMN "ID_OFICINA_INICIO" INT NULL REFERENCES "MAIN_REGISTER"."OFICINA"("ID_OFICINA"),
  ADD COLUMN "ID_OFICINA_FIM" INT NULL REFERENCES "MAIN_REGISTER"."OFICINA"("ID_OFICINA");

-- Novo campo em ROTA_PROMOTOR
ALTER TABLE "CAMPANHAS_OB"."ROTA_PROMOTOR"
  ADD COLUMN "ORDEM" INT NULL;
```

---

## Alterações na API (backend-promotor)

### Endpoints existentes modificados

#### `GET /campanha/ativa?ID_PROMOTOR=X`
- Response agora inclui `ESTRATEGIA_ORDENACAO` na raiz da campanha-promotor.
- Cada rota inclui o campo `ORDEM`.
- Se `ESTRATEGIA_ORDENACAO` ≠ `PROXIMIDADE_PROMOTOR`, as rotas vêm **pré-ordenadas** por `ORDEM ASC`.

#### `POST /rota/create-with-campanha-promotor`
- Body aceita campo opcional `ESTRATEGIA_ORDENACAO`.

#### `PUT /rota/workshops`
- Se a estratégia for `MANUAL` ou `ROTA_OTIMIZADA`, recalcular/resetar `ORDEM` conforme necessário.

### Novos endpoints

#### `PUT /rota/reorder` — Reordenar rotas
Atualiza a ordem de todas as rotas de um `CAMPANHA_PROMOTOR`.

**Request Body:**
```json
{
  "ID_CAMPANHA_PROMOTOR": 42,
  "ESTRATEGIA_ORDENACAO": "MANUAL",
  "rotas": [
    { "ID_ROTA_PROMOTOR": 101, "ORDEM": 1 },
    { "ID_ROTA_PROMOTOR": 104, "ORDEM": 2 },
    { "ID_ROTA_PROMOTOR": 102, "ORDEM": 3 },
    { "ID_ROTA_PROMOTOR": 103, "ORDEM": 4 }
  ]
}
```

**Response (200):**
```json
{
  "message": "Ordem das rotas atualizada com sucesso.",
  "data": {
    "ESTRATEGIA_ORDENACAO": "MANUAL",
    "rotas": [
      { "ID_ROTA_PROMOTOR": 101, "ORDEM": 1, "ID_OFICINA": 501 },
      { "ID_ROTA_PROMOTOR": 104, "ORDEM": 2, "ID_OFICINA": 504 },
      { "ID_ROTA_PROMOTOR": 102, "ORDEM": 3, "ID_OFICINA": 502 },
      { "ID_ROTA_PROMOTOR": 103, "ORDEM": 4, "ID_OFICINA": 503 }
    ]
  }
}
```

#### `POST /rota/optimize` — Calcular rota otimizada (A→B)
Calcula a rota mais curta passando por todas as oficinas e retorna a ordem sugerida.

**Request Body:**
```json
{
  "ID_CAMPANHA_PROMOTOR": 42,
  "ID_OFICINA_INICIO": 501,
  "ID_OFICINA_FIM": 504
}
```

**Response (200):**
```json
{
  "message": "Rota otimizada calculada com sucesso.",
  "data": {
    "ESTRATEGIA_ORDENACAO": "ROTA_OTIMIZADA",
    "ID_OFICINA_INICIO": 501,
    "ID_OFICINA_FIM": 504,
    "distancia_total_km": 47.3,
    "rotas": [
      { "ID_ROTA_PROMOTOR": 101, "ORDEM": 1, "ID_OFICINA": 501, "oficina": { "NOME_FANTASIA": "...", "LATITUDE": "...", "LONGITUDE": "..." } },
      { "ID_ROTA_PROMOTOR": 102, "ORDEM": 2, "ID_OFICINA": 502, "oficina": { "..." : "..." } },
      { "ID_ROTA_PROMOTOR": 103, "ORDEM": 3, "ID_OFICINA": 503, "oficina": { "..." : "..." } },
      { "ID_ROTA_PROMOTOR": 104, "ORDEM": 4, "ID_OFICINA": 504, "oficina": { "..." : "..." } }
    ]
  }
}
```

**Lógica:**
1. Busca todas as rotas ativas do `CAMPANHA_PROMOTOR` com as coordenadas das oficinas.
2. Fixa a oficina de início na posição 1 e a de fim na última posição.
3. Aplica Nearest Neighbor Heuristic nas intermediárias.
4. (Opcional) Aplica 2-opt para otimização local.
5. Persiste `ORDEM` em cada `ROTA_PROMOTOR`, `ESTRATEGIA_ORDENACAO`, `ID_OFICINA_INICIO` e `ID_OFICINA_FIM` em `CAMPANHA_PROMOTOR`.

---

## Alterações no Frontend — ob-ads (Supervisor)

### Tela de edição de campanha (aba de distribuição de rotas)

Após atribuir oficinas a um promotor, exibir uma seção de **"Ordenação da Rota"** com 3 opções (radio/select):

#### Opção 1: Rota Otimizada (A → B)
- Exibe 2 selects: "Oficina de partida" e "Oficina de chegada" (populados com as oficinas já atribuídas ao promotor).
- Botão "Calcular rota" chama `POST /rota/optimize`.
- Exibe preview da rota otimizada com a listagem numerada e distância total.
- Supervisor pode confirmar ou ajustar manualmente após o cálculo.

#### Opção 2: Ordem Manual
- Exibe lista com drag-and-drop (ou input numérico) das oficinas.
- Ao salvar, chama `PUT /rota/reorder` com `ESTRATEGIA_ORDENACAO: "MANUAL"`.

#### Opção 3: Proximidade do Promotor
- Nenhuma configuração adicional.
- Ao salvar, chama `PUT /rota/reorder` com `ESTRATEGIA_ORDENACAO: "PROXIMIDADE_PROMOTOR"` e `rotas: []`.

---

## Alterações no Frontend — frontend-promotor (Promotor)

### Tipos (`lib/types.ts`)

```typescript
export type EstrategiaOrdenacao = "ROTA_OTIMIZADA" | "MANUAL" | "PROXIMIDADE_PROMOTOR";

// Adicionar a RotaPromotor:
export interface RotaPromotor {
  // ... campos existentes ...
  ordem: number | null;
}

// Adicionar a resposta da campanha ativa:
export interface CampanhaAtivaData {
  // ... campos existentes ...
  estrategia_ordenacao: EstrategiaOrdenacao;
}
```

### Lógica de ordenação (`home-screen.tsx`)

```typescript
const pendingRotas = useMemo(() => {
  const pending = rotas.filter(
    (r) => r.status !== "FINALIZADO" && r.status !== "CANCELADO"
  );

  if (estrategiaOrdenacao === "PROXIMIDADE_PROMOTOR" || !estrategiaOrdenacao) {
    // Ordenação por proximidade (comportamento atual)
    return pending.sort((a, b) => (a.oficina.distancia_km ?? 999) - (b.oficina.distancia_km ?? 999));
  }

  // ROTA_OTIMIZADA ou MANUAL — respeitar campo ORDEM
  return pending.sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999));
}, [rotas, estrategiaOrdenacao]);
```

### Badge dinâmico

| Estratégia | Badge |
|-----------|-------|
| `ROTA_OTIMIZADA` | "Rota otimizada" |
| `MANUAL` | "Ordem definida pelo supervisor" |
| `PROXIMIDADE_PROMOTOR` | "Ordenado por proximidade" |

### Geolocalização

- Quando `ESTRATEGIA_ORDENACAO = PROXIMIDADE_PROMOTOR`, solicitar permissão de geolocalização ao abrir o app e calcular `distancia_km` via haversine para cada oficina.
- Para as demais estratégias, a geolocalização não é necessária para ordenação (mas ainda pode ser usada para navegação GPS).

---

## Algoritmo: Nearest Neighbor com Início e Fim Fixos

```
Entrada: lista de oficinas com coords, oficina_inicio, oficina_fim
Saída: lista ordenada

1. current = oficina_inicio
2. unvisited = todas as oficinas intermediárias (sem início e sem fim)
3. path = [oficina_inicio]
4. Enquanto unvisited não está vazio:
   a. next = oficina em unvisited mais próxima de current (haversine)
   b. path.push(next)
   c. unvisited.remove(next)
   d. current = next
5. path.push(oficina_fim)
6. Retornar path com ORDEM = index + 1
```

**Fórmula Haversine (distância em km):**
```
a = sin²(Δlat/2) + cos(lat1) × cos(lat2) × sin²(Δlon/2)
c = 2 × atan2(√a, √(1-a))
d = R × c     (R = 6371 km)
```

---

## Validações

| Regra | Onde |
|-------|------|
| `ID_OFICINA_INICIO` e `ID_OFICINA_FIM` devem pertencer às rotas do `CAMPANHA_PROMOTOR` | `POST /rota/optimize` |
| `ID_OFICINA_INICIO` ≠ `ID_OFICINA_FIM` | `POST /rota/optimize` |
| Todas as oficinas devem ter `LATITUDE` e `LONGITUDE` para `ROTA_OTIMIZADA` | `POST /rota/optimize` |
| `ORDEM` deve ser sequencial (1..N) sem gaps | `PUT /rota/reorder` |
| Todos os `ID_ROTA_PROMOTOR` no payload devem pertencer ao `ID_CAMPANHA_PROMOTOR` informado | `PUT /rota/reorder` |

---

## Casos de borda

1. **Oficinas sem coordenadas:** Se alguma oficina não tem `LATITUDE`/`LONGITUDE` e a estratégia é `ROTA_OTIMIZADA`, retornar erro 400 listando quais oficinas precisam de geocoding.
2. **Apenas 1 oficina:** Ordem é sempre 1, qualquer estratégia funciona trivialmente.
3. **2 oficinas com ROTA_OTIMIZADA:** Início = primeira, fim = segunda. Sem intermediárias.
4. **Promotor sem GPS (PROXIMIDADE_PROMOTOR):** Exibir rotas na ordem original (por `ID_ROTA_PROMOTOR`) e alertar que a localização é necessária para ordenação.
5. **Adição/remoção de oficinas após ordenação:** Ao usar `PUT /rota/workshops`, se a estratégia for `MANUAL`, novas oficinas recebem `ORDEM = max(ORDEM) + 1`. Se for `ROTA_OTIMIZADA`, recalcular automaticamente.

---

## Escopo de implementação por sistema

| Sistema | Alterações |
|---------|-----------|
| **backend-promotor** | Migração DB, entidades TypeORM, `POST /rota/optimize`, `PUT /rota/reorder`, ajustar `GET /campanha/ativa`, lógica haversine + nearest neighbor |
| **ob-ads** | UI de seleção de estratégia na aba de rotas, drag-and-drop para manual, selects A/B para otimizada, chamadas aos novos endpoints |
| **frontend-promotor** | Novos campos nos types, lógica de ordenação condicional, badge dinâmico, cálculo haversine client-side para `PROXIMIDADE_PROMOTOR` |

---

## Fora de escopo

- Cálculo de rota real por ruas (Google Directions API / OSRM) — apenas distância euclidiana.
- Re-cálculo automático em tempo real durante a rota do promotor.
- Otimização com restrições de horário/janela de atendimento.
- Histórico de alterações de ordenação.
