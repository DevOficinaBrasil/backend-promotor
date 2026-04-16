# DESIGN: Ordenação de Rotas de Oficinas para Promotores

> Documento técnico de design baseado em [SPEC_ORDENACAO_ROTAS.md](SPEC_ORDENACAO_ROTAS.md)

---

## 1. Visão Geral da Arquitetura

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│     ob-ads           │     │   backend-promotor    │     │  frontend-promotor  │
│  (Supervisor UI)     │────▶│     (API REST)        │◀────│   (Promotor App)    │
│                      │     │                       │     │                     │
│ • Seleciona          │     │ • PUT /rota/reorder   │     │ • Recebe ORDEM      │
│   estratégia         │     │ • POST /rota/optimize │     │ • Ordena client-side│
│ • Define ordem       │     │ • Haversine + NN      │     │   se PROXIMIDADE    │
│ • Drag-and-drop      │     │ • Persiste ORDEM      │     │ • Badge dinâmico    │
└─────────────────────┘     └──────────────────────┘     └─────────────────────┘
```

---

## 2. Alterações no Backend (backend-promotor)

### 2.1 Migração de Banco de Dados

**Arquivo:** `scripts/migration-ordenacao-rotas.sql` (novo)

```sql
-- Adicionar ENUM type para estratégia
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estrategia_ordenacao_enum') THEN
    CREATE TYPE "CAMPANHAS_OB"."estrategia_ordenacao_enum" AS ENUM (
      'ROTA_OTIMIZADA',
      'MANUAL',
      'PROXIMIDADE_PROMOTOR'
    );
  END IF;
END$$;

-- Novos campos em CAMPANHA_PROMOTOR
ALTER TABLE "CAMPANHAS_OB"."CAMPANHA_PROMOTOR"
  ADD COLUMN IF NOT EXISTS "ESTRATEGIA_ORDENACAO" "CAMPANHAS_OB"."estrategia_ordenacao_enum" DEFAULT 'PROXIMIDADE_PROMOTOR',
  ADD COLUMN IF NOT EXISTS "ID_OFICINA_INICIO" INT NULL,
  ADD COLUMN IF NOT EXISTS "ID_OFICINA_FIM" INT NULL;

-- Novo campo em ROTA_PROMOTOR
ALTER TABLE "CAMPANHAS_OB"."ROTA_PROMOTOR"
  ADD COLUMN IF NOT EXISTS "ORDEM" INT NULL;
```

### 2.2 Entidade CampanhaPromotor — Alterações

**Arquivo:** `entities/CampanhaPromotor.ts`

Adicionar:

```typescript
export enum EstrategiaOrdenacao {
  ROTA_OTIMIZADA = "ROTA_OTIMIZADA",
  MANUAL = "MANUAL",
  PROXIMIDADE_PROMOTOR = "PROXIMIDADE_PROMOTOR",
}

// Novos campos na entity:
@Column({
  type: "enum",
  enum: EstrategiaOrdenacao,
  default: EstrategiaOrdenacao.PROXIMIDADE_PROMOTOR,
  nullable: true,
  name: "ESTRATEGIA_ORDENACAO",
})
ESTRATEGIA_ORDENACAO?: EstrategiaOrdenacao;

@Column({ type: "int", nullable: true, name: "ID_OFICINA_INICIO" })
ID_OFICINA_INICIO?: number;

@Column({ type: "int", nullable: true, name: "ID_OFICINA_FIM" })
ID_OFICINA_FIM?: number;

@ManyToOne(() => Oficina)
@JoinColumn({ name: "ID_OFICINA_INICIO" })
oficinaInicio?: Oficina;

@ManyToOne(() => Oficina)
@JoinColumn({ name: "ID_OFICINA_FIM" })
oficinaFim?: Oficina;
```

### 2.3 Entidade RotaPromotor — Alterações

**Arquivo:** `entities/RotaPromotor.ts`

Adicionar:

```typescript
@Column({ type: "int", nullable: true, name: "ORDEM" })
ORDEM?: number;
```

### 2.4 Utilitário Haversine + Nearest Neighbor

**Arquivo:** `utils/routeOptimizer.ts` (novo)

```typescript
interface Coordenada {
  id: number;          // ID_ROTA_PROMOTOR
  id_oficina: number;  // ID_OFICINA
  lat: number;
  lon: number;
}

/**
 * Calcula distância haversine entre dois pontos em km
 */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Nearest Neighbor com início e fim fixos.
 * Retorna a ordem otimizada e a distância total.
 */
export function optimizeRoute(
  pontos: Coordenada[],
  idInicio: number,   // ID_OFICINA de partida
  idFim: number       // ID_OFICINA de chegada
): { order: { id: number; id_oficina: number; ordem: number }[]; totalDistanceKm: number } {
  const inicio = pontos.find(p => p.id_oficina === idInicio);
  const fim = pontos.find(p => p.id_oficina === idFim);
  if (!inicio || !fim) throw new Error("Oficina de início ou fim não encontrada nas rotas.");

  const intermediarios = pontos.filter(p => p.id_oficina !== idInicio && p.id_oficina !== idFim);
  const unvisited = new Set(intermediarios.map(p => p.id_oficina));
  const path: Coordenada[] = [inicio];
  let current = inicio;
  let totalDist = 0;

  while (unvisited.size > 0) {
    let nearest: Coordenada | null = null;
    let nearestDist = Infinity;
    for (const p of intermediarios) {
      if (!unvisited.has(p.id_oficina)) continue;
      const d = haversine(current.lat, current.lon, p.lat, p.lon);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = p;
      }
    }
    if (nearest) {
      path.push(nearest);
      unvisited.delete(nearest.id_oficina);
      totalDist += nearestDist;
      current = nearest;
    }
  }

  totalDist += haversine(current.lat, current.lon, fim.lat, fim.lon);
  path.push(fim);

  // 2-opt local improvement
  const improved = twoOptImprove(path, inicio, fim);

  return {
    order: improved.path.map((p, i) => ({ id: p.id, id_oficina: p.id_oficina, ordem: i + 1 })),
    totalDistanceKm: Math.round(improved.totalDist * 10) / 10,
  };
}

/**
 * 2-opt: tenta inverter sub-rotas para reduzir distância total.
 * Mantém o primeiro e último ponto fixos.
 */
function twoOptImprove(
  path: Coordenada[],
  inicio: Coordenada,
  fim: Coordenada
): { path: Coordenada[]; totalDist: number } {
  let improved = true;
  let best = [...path];

  while (improved) {
    improved = false;
    for (let i = 1; i < best.length - 2; i++) {
      for (let j = i + 1; j < best.length - 1; j++) {
        const currentDist =
          haversine(best[i - 1].lat, best[i - 1].lon, best[i].lat, best[i].lon) +
          haversine(best[j].lat, best[j].lon, best[j + 1].lat, best[j + 1].lon);
        const newDist =
          haversine(best[i - 1].lat, best[i - 1].lon, best[j].lat, best[j].lon) +
          haversine(best[i].lat, best[i].lon, best[j + 1].lat, best[j + 1].lon);

        if (newDist < currentDist - 0.001) {
          // Reverse segment [i..j]
          const reversed = best.slice(i, j + 1).reverse();
          best = [...best.slice(0, i), ...reversed, ...best.slice(j + 1)];
          improved = true;
        }
      }
    }
  }

  let totalDist = 0;
  for (let i = 0; i < best.length - 1; i++) {
    totalDist += haversine(best[i].lat, best[i].lon, best[i + 1].lat, best[i + 1].lon);
  }

  return { path: best, totalDist };
}
```

### 2.5 Schemas Zod — Novos schemas

**Arquivo:** `schemas/rota.ts` — adicionar ao final:

```typescript
export const EstrategiaOrdenacaoSchema = z.enum([
  'ROTA_OTIMIZADA',
  'MANUAL',
  'PROXIMIDADE_PROMOTOR',
]);

/**
 * POST /rota/optimize — calcular rota otimizada A→B
 */
export const OptimizeRotaSchema = z.object({
  ID_CAMPANHA_PROMOTOR: z.number().int().positive(),
  ID_OFICINA_INICIO: z.number().int().positive(),
  ID_OFICINA_FIM: z.number().int().positive(),
}).refine(data => data.ID_OFICINA_INICIO !== data.ID_OFICINA_FIM, {
  message: "Oficina de início e fim devem ser diferentes.",
});

/**
 * PUT /rota/reorder — reordenar rotas manualmente
 */
export const ReorderRotasSchema = z.object({
  ID_CAMPANHA_PROMOTOR: z.number().int().positive(),
  ESTRATEGIA_ORDENACAO: EstrategiaOrdenacaoSchema,
  rotas: z.array(z.object({
    ID_ROTA_PROMOTOR: z.number().int().positive(),
    ORDEM: z.number().int().positive(),
  })).optional(), // vazio se PROXIMIDADE_PROMOTOR
});

// Response schemas
export const OptimizeRotaResponseSchema = z.object({
  message: z.string(),
  data: z.object({
    ESTRATEGIA_ORDENACAO: EstrategiaOrdenacaoSchema,
    ID_OFICINA_INICIO: z.number(),
    ID_OFICINA_FIM: z.number(),
    distancia_total_km: z.number(),
    rotas: z.array(z.object({
      ID_ROTA_PROMOTOR: z.number(),
      ORDEM: z.number(),
      ID_OFICINA: z.number(),
    })),
  }),
});

export const ReorderRotasResponseSchema = z.object({
  message: z.string(),
  data: z.object({
    ESTRATEGIA_ORDENACAO: EstrategiaOrdenacaoSchema,
    rotas: z.array(z.object({
      ID_ROTA_PROMOTOR: z.number(),
      ORDEM: z.number().nullable(),
      ID_OFICINA: z.number(),
    })),
  }),
});
```

### 2.6 Novos Métodos no RotaService

**Arquivo:** `service/rotaService.ts` — adicionar métodos:

```typescript
import { optimizeRoute } from "../utils/routeOptimizer";
import { EstrategiaOrdenacao } from "../entities/CampanhaPromotor";

/**
 * Calcula a rota otimizada e persiste a ordem
 */
static async optimizeAndSaveRoute(
  idCampanhaPromotor: number,
  idOficinaInicio: number,
  idOficinaFim: number
): Promise<{
  estrategia: EstrategiaOrdenacao;
  idOficinaInicio: number;
  idOficinaFim: number;
  distanciaTotalKm: number;
  rotas: { ID_ROTA_PROMOTOR: number; ORDEM: number; ID_OFICINA: number }[];
}> {
  const rotaRepository = AppDataSourceSync.getRepository(RotaPromotor);
  const cpRepository = AppDataSourceSync.getRepository(CampanhaPromotor);

  // 1. Busca rotas ativas com oficina (precisa lat/lng)
  const rotas = await rotaRepository.find({
    where: { ID_CAMPANHA_PROMOTOR: idCampanhaPromotor, DELETED_AT: IsNull() },
    relations: ["oficina"],
  });

  if (rotas.length < 2) throw new Error("É necessário pelo menos 2 oficinas para otimizar.");

  // 2. Validar que inicio e fim existem nas rotas
  const oficinaIdsNasRotas = rotas.map(r => r.ID_OFICINA!);
  if (!oficinaIdsNasRotas.includes(idOficinaInicio))
    throw new Error("Oficina de início não pertence às rotas deste promotor.");
  if (!oficinaIdsNasRotas.includes(idOficinaFim))
    throw new Error("Oficina de fim não pertence às rotas deste promotor.");

  // 3. Validar coordenadas
  const semCoordenadas = rotas.filter(
    r => !r.oficina?.LATITUDE || !r.oficina?.LONGITUDE
  );
  if (semCoordenadas.length > 0) {
    const nomes = semCoordenadas.map(r => r.oficina?.NOME_FANTASIA || `ID ${r.ID_OFICINA}`);
    throw new Error(`Oficinas sem coordenadas: ${nomes.join(", ")}`);
  }

  // 4. Montar pontos para o algoritmo
  const pontos = rotas.map(r => ({
    id: r.ID_ROTA_PROMOTOR!,
    id_oficina: r.ID_OFICINA!,
    lat: parseFloat(r.oficina!.LATITUDE!),
    lon: parseFloat(r.oficina!.LONGITUDE!),
  }));

  // 5. Executar otimização
  const resultado = optimizeRoute(pontos, idOficinaInicio, idOficinaFim);

  // 6. Persistir em transação
  await AppDataSourceSync.transaction(async (em) => {
    // Atualizar ORDEM em cada rota
    for (const item of resultado.order) {
      await em.update(RotaPromotor, item.id, { ORDEM: item.ordem });
    }
    // Atualizar estratégia no CampanhaPromotor
    await em.update(CampanhaPromotor, idCampanhaPromotor, {
      ESTRATEGIA_ORDENACAO: EstrategiaOrdenacao.ROTA_OTIMIZADA,
      ID_OFICINA_INICIO: idOficinaInicio,
      ID_OFICINA_FIM: idOficinaFim,
    });
  });

  return {
    estrategia: EstrategiaOrdenacao.ROTA_OTIMIZADA,
    idOficinaInicio,
    idOficinaFim,
    distanciaTotalKm: resultado.totalDistanceKm,
    rotas: resultado.order.map(o => ({
      ID_ROTA_PROMOTOR: o.id,
      ORDEM: o.ordem,
      ID_OFICINA: o.id_oficina,
    })),
  };
}

/**
 * Reordena rotas manualmente ou define estratégia PROXIMIDADE_PROMOTOR
 */
static async reorderRotas(
  idCampanhaPromotor: number,
  estrategia: EstrategiaOrdenacao,
  rotas?: { ID_ROTA_PROMOTOR: number; ORDEM: number }[]
): Promise<{
  estrategia: EstrategiaOrdenacao;
  rotas: { ID_ROTA_PROMOTOR: number; ORDEM: number | null; ID_OFICINA: number }[];
}> {
  const rotaRepository = AppDataSourceSync.getRepository(RotaPromotor);
  const cpRepository = AppDataSourceSync.getRepository(CampanhaPromotor);

  await AppDataSourceSync.transaction(async (em) => {
    if (estrategia === EstrategiaOrdenacao.PROXIMIDADE_PROMOTOR) {
      // Limpar ORDEM de todas as rotas
      const rotasExistentes = await rotaRepository.find({
        where: { ID_CAMPANHA_PROMOTOR: idCampanhaPromotor, DELETED_AT: IsNull() },
      });
      for (const r of rotasExistentes) {
        await em.update(RotaPromotor, r.ID_ROTA_PROMOTOR!, { ORDEM: null as any });
      }
      await em.update(CampanhaPromotor, idCampanhaPromotor, {
        ESTRATEGIA_ORDENACAO: EstrategiaOrdenacao.PROXIMIDADE_PROMOTOR,
        ID_OFICINA_INICIO: null as any,
        ID_OFICINA_FIM: null as any,
      });
    } else if (estrategia === EstrategiaOrdenacao.MANUAL && rotas && rotas.length > 0) {
      // Validar que todas as rotas pertencem ao CAMPANHA_PROMOTOR
      const rotasExistentes = await rotaRepository.find({
        where: { ID_CAMPANHA_PROMOTOR: idCampanhaPromotor, DELETED_AT: IsNull() },
      });
      const idsExistentes = new Set(rotasExistentes.map(r => r.ID_ROTA_PROMOTOR!));
      for (const r of rotas) {
        if (!idsExistentes.has(r.ID_ROTA_PROMOTOR))
          throw new Error(`Rota ${r.ID_ROTA_PROMOTOR} não pertence a este promotor.`);
      }

      // Atualizar ORDEM
      for (const r of rotas) {
        await em.update(RotaPromotor, r.ID_ROTA_PROMOTOR, { ORDEM: r.ORDEM });
      }
      await em.update(CampanhaPromotor, idCampanhaPromotor, {
        ESTRATEGIA_ORDENACAO: EstrategiaOrdenacao.MANUAL,
        ID_OFICINA_INICIO: null as any,
        ID_OFICINA_FIM: null as any,
      });
    }
  });

  // Retornar estado atualizado
  const rotasAtualizadas = await rotaRepository.find({
    where: { ID_CAMPANHA_PROMOTOR: idCampanhaPromotor, DELETED_AT: IsNull() },
  });

  return {
    estrategia,
    rotas: rotasAtualizadas.map(r => ({
      ID_ROTA_PROMOTOR: r.ID_ROTA_PROMOTOR!,
      ORDEM: r.ORDEM ?? null,
      ID_OFICINA: r.ID_OFICINA!,
    })),
  };
}
```

### 2.7 Controller — Novos endpoints

**Arquivo:** `controllers/rotaController.ts` — adicionar:

```typescript
/**
 * POST /rota/optimize — Calcula rota otimizada A→B
 */
static optimizeRoute = async (req: Request, res: Response) => {
  try {
    const { ID_CAMPANHA_PROMOTOR, ID_OFICINA_INICIO, ID_OFICINA_FIM } = req.body;

    const resultado = await RotaService.optimizeAndSaveRoute(
      ID_CAMPANHA_PROMOTOR,
      ID_OFICINA_INICIO,
      ID_OFICINA_FIM
    );

    return res.status(200).json({
      message: "Rota otimizada calculada com sucesso.",
      data: {
        ESTRATEGIA_ORDENACAO: resultado.estrategia,
        ID_OFICINA_INICIO: resultado.idOficinaInicio,
        ID_OFICINA_FIM: resultado.idOficinaFim,
        distancia_total_km: resultado.distanciaTotalKm,
        rotas: resultado.rotas,
      },
    });
  } catch (error) {
    console.error("Erro ao otimizar rota:", error);
    const status = (error instanceof Error && error.message.includes("não pertence")) ? 400 : 500;
    return res.status(status).json({
      message: error instanceof Error ? error.message : "Erro interno ao otimizar rota.",
    });
  }
};

/**
 * PUT /rota/reorder — Reordenar rotas
 */
static reorderRotas = async (req: Request, res: Response) => {
  try {
    const { ID_CAMPANHA_PROMOTOR, ESTRATEGIA_ORDENACAO, rotas } = req.body;

    const resultado = await RotaService.reorderRotas(
      ID_CAMPANHA_PROMOTOR,
      ESTRATEGIA_ORDENACAO,
      rotas
    );

    return res.status(200).json({
      message: "Ordem das rotas atualizada com sucesso.",
      data: {
        ESTRATEGIA_ORDENACAO: resultado.estrategia,
        rotas: resultado.rotas,
      },
    });
  } catch (error) {
    console.error("Erro ao reordenar rotas:", error);
    return res.status(500).json({
      message: error instanceof Error ? error.message : "Erro interno ao reordenar rotas.",
    });
  }
};
```

### 2.8 Rotas — Registrar novos endpoints

**Arquivo:** `routes/RotaRoute.ts` — adicionar:

```typescript
// POST /rota/optimize
createDocumentedRoute(router, {
  method: "post",
  path: "/optimize",
  handler: RotaController.optimizeRoute,
  basePath: "/rota",
  middlewares: [],
  schemas: { body: OptimizeRotaSchema },
  documentation: {
    tags: ["Rota"],
    summary: "Calcular rota otimizada A→B",
    description: "Calcula a menor rota passando por todas as oficinas usando Nearest Neighbor + 2-opt.",
    security: [{ bearerAuth: [] }],
    responses: {
      200: { description: "Rota otimizada com sucesso", schema: OptimizeRotaResponseSchema },
      400: { description: "Validação ou oficina inválida", schema: ErrorResponseSchema },
      500: { description: "Erro interno", schema: ErrorResponseSchema },
    },
  },
});

// PUT /rota/reorder
createDocumentedRoute(router, {
  method: "put",
  path: "/reorder",
  handler: RotaController.reorderRotas,
  basePath: "/rota",
  middlewares: [],
  schemas: { body: ReorderRotasSchema },
  documentation: {
    tags: ["Rota"],
    summary: "Reordenar rotas manualmente ou definir estratégia",
    description: "Atualiza a ordem e estratégia de ordenação das rotas de um promotor.",
    security: [{ bearerAuth: [] }],
    responses: {
      200: { description: "Rotas reordenadas com sucesso", schema: ReorderRotasResponseSchema },
      400: { description: "Validação inválida", schema: ErrorResponseSchema },
      500: { description: "Erro interno", schema: ErrorResponseSchema },
    },
  },
});
```

### 2.9 Alteração em CampanhaService.getActiveCampanhaByPromotor

**Arquivo:** `service/campanhaService.ts`

Na função `getActiveCampanhaByPromotor`, alterar a query de rotas para incluir `ORDEM` e retornar `ESTRATEGIA_ORDENACAO`:

```typescript
// Antes: rotasPromotor via find simples
// Depois: ordenar por ORDEM quando definida

const rotasPromotor = await rotaPromotorRepository.find({
  where: {
    ID_CAMPANHA_PROMOTOR: activeCampanha.ID_CAMPANHA_PROMOTOR,
    DELETED_AT: IsNull(),
  },
  relations: ['oficina'],
  order: { ORDEM: { direction: "ASC", nulls: "LAST" } }, // ← ADICIONAR
});

// No retorno, incluir ESTRATEGIA_ORDENACAO:
return {
  ...campanha,
  ESTRATEGIA_ORDENACAO: activeCampanha.ESTRATEGIA_ORDENACAO || "PROXIMIDADE_PROMOTOR", // ← ADICIONAR
  rotas: rotasWithDuckDBData,
};
```

---

## 3. Alterações no Frontend — frontend-promotor

### 3.1 Types

**Arquivo:** `lib/types.ts`

```typescript
// Adicionar:
export type EstrategiaOrdenacao = "ROTA_OTIMIZADA" | "MANUAL" | "PROXIMIDADE_PROMOTOR";

// Alterar RotaAPI — adicionar campo:
export interface RotaAPI {
  // ... existente ...
  ORDEM: number | null;          // ← NOVO
}

// Alterar CampanhaAtivaResponse.data — adicionar campo:
export interface CampanhaAtivaResponse {
  message: string;
  data: {
    // ... existente ...
    ESTRATEGIA_ORDENACAO: EstrategiaOrdenacao;  // ← NOVO
    rotas: RotaAPI[];
  };
}

// Alterar RotaPromotor — adicionar campo:
export interface RotaPromotor {
  // ... existente ...
  ordem: number | null;          // ← NOVO
}

// Alterar Oficina — adicionar coordenadas para cálculo client-side:
export interface Oficina {
  // ... existente ...
  latitude?: string;             // ← NOVO
  longitude?: string;            // ← NOVO
}
```

### 3.2 Normalização — campanha.service.ts

**Arquivo:** `service/campanha.service.ts`

```typescript
// Em normalizeRota — adicionar:
function normalizeRota(rota: RotaAPI, campanha: Campanha): RotaPromotor {
  // ... existente ...
  return {
    // ... existente ...
    ordem: rota.ORDEM ?? null,                    // ← NOVO
    oficina: {
      // ... existente ...
      latitude: o.LATITUDE,                       // ← NOVO (precisa adicionar ao OficinaAPI)
      longitude: o.LONGITUDE,                     // ← NOVO
    },
  };
}

// Em getCampanhaAtiva — agora retorna estrategia_ordenacao:
export async function getCampanhaAtiva(
  idPromotor: number,
): Promise<{ campanha: Campanha; rotas: RotaPromotor[]; estrategiaOrdenacao: EstrategiaOrdenacao }> {
  // ... existente ...
  const estrategiaOrdenacao = (d.ESTRATEGIA_ORDENACAO || "PROXIMIDADE_PROMOTOR") as EstrategiaOrdenacao;
  return { campanha, rotas, estrategiaOrdenacao };  // ← NOVO campo
}
```

### 3.3 Utilitário Haversine (client-side)

**Arquivo:** `lib/haversine.ts` (novo)

```typescript
/**
 * Calcula distância em km entre duas coordenadas usando fórmula Haversine
 */
export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
```

### 3.4 Lógica de Ordenação — home-screen.tsx

**Arquivo:** `components/home-screen.tsx`

Alterações principais:

```typescript
// State novo:
const [estrategiaOrdenacao, setEstrategiaOrdenacao] = useState<EstrategiaOrdenacao>("PROXIMIDADE_PROMOTOR");
const [userPosition, setUserPosition] = useState<{ lat: number; lon: number } | null>(null);

// Em loadRotas — extrair estratégia:
const loadRotas = useCallback(async () => {
  setIsRefreshing(true);
  if (process.env.NEXT_PUBLIC_API_URL && promotor) {
    try {
      const { rotas: apiRotas, estrategiaOrdenacao: estrategia } = await getCampanhaAtiva(promotor.ID_PROMOTOR);
      setRotas(apiRotas);
      setEstrategiaOrdenacao(estrategia);
    } catch { setRotas([]); }
  } else { setRotas([]); }
  setInitialLoading(false);
  setIsRefreshing(false);
}, [promotor]);

// Geolocalização se PROXIMIDADE_PROMOTOR:
useEffect(() => {
  if (estrategiaOrdenacao === "PROXIMIDADE_PROMOTOR" && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserPosition({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => setUserPosition(null)
    );
  }
}, [estrategiaOrdenacao]);

// Lógica de ordenação condicional:
const pendingRotas = useMemo(() => {
  const pending = rotas.filter(
    (r) => r.status !== "FINALIZADO" && r.status !== "CANCELADO"
  );

  if (estrategiaOrdenacao === "PROXIMIDADE_PROMOTOR") {
    if (userPosition) {
      return pending.sort((a, b) => {
        const distA = a.oficina.latitude && a.oficina.longitude
          ? haversineDistance(userPosition.lat, userPosition.lon, parseFloat(a.oficina.latitude), parseFloat(a.oficina.longitude))
          : 999;
        const distB = b.oficina.latitude && b.oficina.longitude
          ? haversineDistance(userPosition.lat, userPosition.lon, parseFloat(b.oficina.latitude), parseFloat(b.oficina.longitude))
          : 999;
        return distA - distB;
      });
    }
    // Fallback: ordem original
    return pending;
  }

  // ROTA_OTIMIZADA ou MANUAL — usar campo ORDEM
  return pending.sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999));
}, [rotas, estrategiaOrdenacao, userPosition]);
```

### 3.5 Badge dinâmico

No JSX de `home-screen.tsx`, substituir o badge estático:

```tsx
// Antes:
<Badge variant="secondary" className="text-[10px]">Ordenado por proximidade</Badge>

// Depois:
<Badge variant="secondary" className="text-[10px]">
  {estrategiaOrdenacao === "ROTA_OTIMIZADA" && "Rota otimizada"}
  {estrategiaOrdenacao === "MANUAL" && "Ordem do supervisor"}
  {estrategiaOrdenacao === "PROXIMIDADE_PROMOTOR" && "Ordenado por proximidade"}
</Badge>
```

---

## 4. Alterações no Frontend — ob-ads (Supervisor)

### 4.1 Types

**Arquivo:** `types/vinculo.ts` — adicionar:

```typescript
export type EstrategiaOrdenacao = "ROTA_OTIMIZADA" | "MANUAL" | "PROXIMIDADE_PROMOTOR";

// Adicionar ao CampanhaPromotorRota:
export interface CampanhaPromotorRota {
  // ... existente ...
  ORDEM?: number | null;         // ← NOVO
}

// Adicionar ao VinculoWithDetails:
export interface VinculoWithDetails extends CampanhaPromotor {
  // ... existente ...
  ESTRATEGIA_ORDENACAO?: EstrategiaOrdenacao;   // ← NOVO
  ID_OFICINA_INICIO?: number;                   // ← NOVO
  ID_OFICINA_FIM?: number;                      // ← NOVO
}
```

### 4.2 Service — novos métodos

**Arquivo:** `service/vinculoService.ts` — adicionar:

```typescript
import { EstrategiaOrdenacao } from "@/types/vinculo";

/**
 * POST /rota/optimize — Calcular rota otimizada
 */
export const optimizeRoute = async (
  campanhaPromotorId: number,
  idOficinaInicio: number,
  idOficinaFim: number
) => {
  const response = await api_promotores.post("/rota/optimize", {
    ID_CAMPANHA_PROMOTOR: campanhaPromotorId,
    ID_OFICINA_INICIO: idOficinaInicio,
    ID_OFICINA_FIM: idOficinaFim,
  });
  return response.data;
};

/**
 * PUT /rota/reorder — Reordenar rotas
 */
export const reorderRotas = async (
  campanhaPromotorId: number,
  estrategia: EstrategiaOrdenacao,
  rotas?: { ID_ROTA_PROMOTOR: number; ORDEM: number }[]
) => {
  const response = await api_promotores.put("/rota/reorder", {
    ID_CAMPANHA_PROMOTOR: campanhaPromotorId,
    ESTRATEGIA_ORDENACAO: estrategia,
    rotas: rotas || [],
  });
  return response.data;
};
```

### 4.3 Componente RotasDistributionSection — nova seção

**Arquivo:** `app/(dashboard)/dashboard/campanha-para-promotores/components/RotasDistributionSection.tsx`

Após o botão "Salvar Rotas", adicionar seção **"4. Ordenação da Rota"** dentro de cada accordion de promotor. O componente é adicionado **após** as oficinas serem salvas (quando `hasRotas === true`):

```
┌────────────────────────────────────────────────────────┐
│ 4. Ordenação da Rota                                   │
│                                                        │
│ ○ Rota Otimizada (A → B)                              │
│ ○ Ordem Manual                                        │
│ ● Proximidade do Promotor (padrão)                   │
│                                                        │
│ ┌── Se Rota Otimizada ──────────────────────────────┐ │
│ │ Oficina de partida: [Select ▼]                    │ │
│ │ Oficina de chegada: [Select ▼]                    │ │
│ │ [Calcular Rota]                                    │ │
│ │                                                    │ │
│ │ ✅ Rota calculada: 47.3 km total                  │ │
│ │ 1. Oficina A (início)                             │ │
│ │ 2. Oficina C                                       │ │
│ │ 3. Oficina B                                       │ │
│ │ 4. Oficina D (fim)                                │ │
│ └────────────────────────────────────────────────────┘ │
│                                                        │
│ ┌── Se Ordem Manual ────────────────────────────────┐ │
│ │ ≡ 1. Oficina A              [drag handle]         │ │
│ │ ≡ 2. Oficina B              [drag handle]         │ │
│ │ ≡ 3. Oficina C              [drag handle]         │ │
│ │ [Salvar Ordem]                                     │ │
│ └────────────────────────────────────────────────────┘ │
│                                                        │
│ ┌── Se Proximidade ─────────────────────────────────┐ │
│ │ ℹ️ A ordem será calculada automaticamente pelo     │ │
│ │   app do promotor baseada na localização GPS.     │ │
│ └────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

**Implementação em alto nível:**

```tsx
// Novo componente: RouteOrderingSection.tsx (dentro de components/)
interface RouteOrderingSectionProps {
  vinculo: VinculoWithDetails;
  campanhaId: number;
}

// Estado:
// - selectedStrategy: EstrategiaOrdenacao (default: vinculo.ESTRATEGIA_ORDENACAO || "PROXIMIDADE_PROMOTOR")
// - startOficina / endOficina: number (para ROTA_OTIMIZADA)  
// - orderedRotas: CampanhaPromotorRota[] (para MANUAL, reordenável)
// - optimizeResult: resposta do POST /rota/optimize

// Mutations:
// - optimizeMutation → POST /rota/optimize
// - reorderMutation → PUT /rota/reorder

// Para drag-and-drop no modo MANUAL:
// Usar @dnd-kit/core + @dnd-kit/sortable (já comum em projetos MUI)
// Ou implementar com botões ▲▼ para simplificar
```

### 4.4 Dependência para drag-and-drop

```bash
cd ob-ads
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Alternativa mais simples: usar botões "mover para cima / mover para baixo" sem lib extra.

---

## 5. Fluxo de Dados Completo

### 5.1 Supervisor define Rota Otimizada

```
ob-ads                          backend-promotor                    DB
  │                                   │                              │
  │ 1. Atribui oficinas ao promotor   │                              │
  │──POST /rota/workshops────────────▶│──INSERT ROTA_PROMOTOR───────▶│
  │                                   │                              │
  │ 2. Seleciona "Rota Otimizada"     │                              │
  │    escolhe oficina A e B          │                              │
  │──POST /rota/optimize─────────────▶│                              │
  │                                   │──SELECT rotas + oficinas────▶│
  │                                   │◀─────────────────────────────│
  │                                   │  Haversine + NN + 2-opt     │
  │                                   │──UPDATE ROTA_PROMOTOR.ORDEM─▶│
  │                                   │──UPDATE CAMPANHA_PROMOTOR───▶│
  │◀──200 { rotas ordenadas }─────────│                              │
  │                                   │                              │
```

### 5.2 Promotor recebe rotas ordenadas

```
frontend-promotor               backend-promotor                    DB
  │                                   │                              │
  │──GET /campanha/ativa─────────────▶│                              │
  │                                   │──SELECT campanha + rotas────▶│
  │                                   │  ORDER BY ORDEM ASC NULLS LAST
  │                                   │◀─────────────────────────────│
  │◀──200 { ESTRATEGIA_ORDENACAO,     │                              │
  │         rotas: [{ORDEM: 1},...] } │                              │
  │                                   │                              │
  │  if ROTA_OTIMIZADA/MANUAL:        │                              │
  │    sort by ORDEM                  │                              │
  │  if PROXIMIDADE_PROMOTOR:         │                              │
  │    GPS → haversine → sort         │                              │
```

---

## 6. Checklist de Arquivos

### backend-promotor

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `scripts/migration-ordenacao-rotas.sql` | CRIAR | DDL para novos campos |
| `entities/CampanhaPromotor.ts` | EDITAR | Adicionar ESTRATEGIA_ORDENACAO, ID_OFICINA_INICIO, ID_OFICINA_FIM |
| `entities/RotaPromotor.ts` | EDITAR | Adicionar ORDEM |
| `utils/routeOptimizer.ts` | CRIAR | Haversine + Nearest Neighbor + 2-opt |
| `schemas/rota.ts` | EDITAR | Adicionar schemas de optimize e reorder |
| `service/rotaService.ts` | EDITAR | Adicionar optimizeAndSaveRoute() e reorderRotas() |
| `controllers/rotaController.ts` | EDITAR | Adicionar optimizeRoute() e reorderRotas() |
| `routes/RotaRoute.ts` | EDITAR | Registrar POST /optimize e PUT /reorder |
| `service/campanhaService.ts` | EDITAR | Retornar ESTRATEGIA_ORDENACAO e ordenar por ORDEM |

### frontend-promotor

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `lib/types.ts` | EDITAR | Adicionar EstrategiaOrdenacao, ordem, latitude/longitude |
| `lib/haversine.ts` | CRIAR | Função haversine client-side |
| `service/campanha.service.ts` | EDITAR | Normalizar ORDEM e ESTRATEGIA_ORDENACAO |
| `components/home-screen.tsx` | EDITAR | Lógica de ordenação condicional + badge dinâmico |

### ob-ads

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `types/vinculo.ts` | EDITAR | Adicionar EstrategiaOrdenacao, ORDEM, campos novos |
| `service/vinculoService.ts` | EDITAR | Adicionar optimizeRoute() e reorderRotas() |
| `app/(dashboard)/.../components/RouteOrderingSection.tsx` | CRIAR | Componente de seleção de estratégia + drag-and-drop |
| `app/(dashboard)/.../components/RotasDistributionSection.tsx` | EDITAR | Integrar RouteOrderingSection após salvar oficinas |

---

## 7. Ordem de Implementação Sugerida

1. **Migration SQL** — executar em dev
2. **Entidades TypeORM** — CampanhaPromotor + RotaPromotor
3. **routeOptimizer.ts** — utilitário puro, pode ter testes unitários
4. **Schemas Zod** — validação dos novos endpoints
5. **RotaService** — novos métodos
6. **RotaController + Rotas** — expor endpoints
7. **CampanhaService** — ajustar retorno da campanha ativa
8. **frontend-promotor** — types → service → home-screen
9. **ob-ads** — types → service → RouteOrderingSection → integrar
