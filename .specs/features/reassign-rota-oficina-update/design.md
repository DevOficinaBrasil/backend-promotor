# Reatribuição de Rotas por Atualização de Endereço - Design

## Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────────────────────┐
│           POST /rota/reassign-by-address { CEP, ID_OFICINA }             │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              RotaController.reassignByAddress()                           │
│                                                                          │
│  1. Valida input (ReassignByAddressSchema)                               │
│  2. Chama RotaService.reassignRotasByAddress(CEP, ID_OFICINA)            │
│  3. Retorna relatório de reatribuições                                   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              RotaService.reassignRotasByAddress()                         │
│                                                                          │
│  1. GeolocationService.getLatLongByCep(CEP) → {lat, long}               │
│  2. Buscar rotas BACKLOG ativas da oficina com relations                 │
│  3. Agrupar rotas por campanha                                           │
│  4. Para cada campanha: verificar raio + buscar candidatos               │
│  5. Reatribuir em transaction (soft delete + create)                     │
│  6. Retornar relatório                                                   │
└────────────────────┬──────────────────────────────┬─────────────────────┘
                     │                              │
                     ▼                              ▼
┌────────────────────────────────┐  ┌──────────────────────────────────────┐
│  GeolocationService            │  │  haversineDistanceKm()               │
│  .getLatLongByCep()            │  │  (novo utilitário em utils/)         │
│                                │  │                                      │
│  Nominatim → fallback Google   │  │  Cálculo de distância entre dois     │
│                                │  │  pontos geográficos                  │
└────────────────────────────────┘  └──────────────────────────────────────┘
```

## Decisões de Design

### D1: Endpoint isolado (não acoplado ao update de oficina)

O endpoint `POST /rota/reassign-by-address` é independente — não atualiza a entidade Oficina. Ele apenas recebe o novo CEP e reatribui rotas.

**Motivo:** Separação de responsabilidades. O update do cadastro da oficina pode vir de múltiplas fontes (portal, integração, admin). A reatribuição é uma ação deliberada do backend de campanhas que não deve depender de quem atualizou o endereço.

**Trade-off:** Requer uma chamada adicional após o update de endereço. Pode ser integrado futuramente como hook/event se necessário.

### D2: Cálculo Haversine em JavaScript (não SQL)

A verificação de distância entre promotor↔oficina é feita em memória com função JS, **não** via query SQL.

**Motivo:**
- Os promotores candidatos por campanha são poucos (tipicamente < 20 por campanha)
- Evita queries complexas com CAST de varchar→float no banco
- Permite lógica de seleção mais flexível (ordenação, desempate)
- A única query SQL busca todos os candidatos com lat/long populados; o filtro por raio é feito em JS

**Trade-off:** Se no futuro houver campanhas com centenas de promotores, considerar mover o filtro para SQL.

### D3: Query única para buscar candidatos de todas as campanhas

Em vez de 1 query por campanha afetada, executamos **uma única query** que retorna todos os `CAMPANHA_PROMOTOR` + `PROMOTOR` das campanhas envolvidas. Agrupamos em memória.

**Motivo:** Minimizar round-trips ao banco. O número de campanhas por oficina é tipicamente < 5, mas cada uma poderia gerar uma query separada — consolidar evita N+1.

### D4: Soft delete + create (não UPDATE de FK)

A reatribuição faz soft delete da rota antiga e cria uma nova no `CAMPANHA_PROMOTOR` do novo promotor. Não fazemos UPDATE do `ID_CAMPANHA_PROMOTOR` da rota existente.

**Motivo:**
- Preserva histórico completo (quem era o promotor anterior)
- Mantém integridade referencial — a rota antiga continua vinculada ao promotor antigo
- A nova rota nasce com status `BACKLOG` e sem dados de checkin/resultado
- Auditoria: é possível rastrear quando e por que a rota foi reatribuída

### D5: Apenas rotas BACKLOG são elegíveis

Rotas com status `A CAMINHO`, `EM ANDAMENTO`, `FINALIZADO` ou `CANCELADO` são ignoradas.

**Motivo:** Uma rota em andamento ou finalizada representa trabalho já executado. Reatribuir seria perda de dados de checkin, resultados parciais, etc. Apenas rotas ainda não iniciadas podem ser movidas.

### D6: Transação por campanha

Cada reatribuição (soft delete da antiga + create da nova) é feita dentro de um `AppDataSourceSync.transaction()` isolado por campanha.

**Motivo:** Se a criação da nova rota falhar, o soft delete não deve persistir (a rota ficaria "perdida"). Porém, falha em uma campanha não deve afetar as outras — por isso transactions separadas.

### D7: Haversine como utilitário compartilhado

A função `haversineDistanceKm` será extraída para `utils/haversine.ts` em vez de ficar inline no service.

**Motivo:** Já existe cálculo Haversine em SQL no `oficinaService.ts` e potencial uso em outros pontos. Ter uma função JS reutilizável evita duplicação e facilita testes unitários.

### D8: Geocodificação via GeolocationService existente

Reutilizamos `GeolocationService.getLatLongByCep(cep)` que já tem fallback Nominatim → Google Maps.

**Motivo:** Código já testado, com throttling e fallback. Evita duplicação.

**Limitação:** O throttling de 1 req/s do Nominatim pode ser bottleneck se chamado em sequência. Como o endpoint processa uma oficina por vez, é aceitável.

## Mudanças por Arquivo

### 1. `utils/haversine.ts` (CRIAR)

```ts
const EARTH_RADIUS_KM = 6371;

export function haversineDistanceKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

### 2. `schemas/rota.ts` (MODIFICAR)

Adicionar schemas de request e response:

```ts
export const ReassignByAddressSchema = z.object({
  CEP: z.string().min(8).max(10),
  ID_OFICINA: z.coerce.number().int().positive(),
});

const ReatribuicaoStatusSchema = z.enum([
  "reatribuida",
  "mantida_dentro_do_raio", 
  "sem_promotor_disponivel"
]);

export const ReassignByAddressResponseSchema = z.object({
  message: z.string(),
  data: z.object({
    oficina: z.object({
      ID_OFICINA: z.number(),
      novo_cep: z.string(),
      nova_latitude: z.number(),
      nova_longitude: z.number(),
    }),
    campanhas_processadas: z.number(),
    reatribuicoes: z.array(z.object({
      ID_CAMPANHA: z.number(),
      promotor_anterior: z.object({
        ID_PROMOTOR: z.number(),
        NOME: z.string(),
        distancia_km: z.number(),
      }),
      promotor_novo: z.object({
        ID_PROMOTOR: z.number(),
        NOME: z.string(),
        distancia_km: z.number(),
      }).nullable(),
      rota_removida: z.number().nullable(),
      rota_criada: z.number().nullable(),
      status: ReatribuicaoStatusSchema,
    })),
    resumo: z.object({
      mantidas: z.number(),
      reatribuidas: z.number(),
      sem_promotor_disponivel: z.number(),
    }),
  }),
});
```

### 3. `service/rotaService.ts` (MODIFICAR)

Novo método público:

```ts
import { haversineDistanceKm } from "../utils/haversine";
import GeolocationService from "./geolocationService";
import { StatusRota } from "../entities/RotaPromotor";

interface ReatribuicaoResult {
  ID_CAMPANHA: number;
  promotor_anterior: { ID_PROMOTOR: number; NOME: string; distancia_km: number };
  promotor_novo: { ID_PROMOTOR: number; NOME: string; distancia_km: number } | null;
  rota_removida: number | null;
  rota_criada: number | null;
  status: "reatribuida" | "mantida_dentro_do_raio" | "sem_promotor_disponivel";
}

interface ReassignResult {
  oficina: {
    ID_OFICINA: number;
    novo_cep: string;
    nova_latitude: number;
    nova_longitude: number;
  };
  campanhas_processadas: number;
  reatribuicoes: ReatribuicaoResult[];
  resumo: { mantidas: number; reatribuidas: number; sem_promotor_disponivel: number };
}

static async reassignRotasByAddress(
  cep: string,
  idOficina: number
): Promise<ReassignResult> {
  // 1. Geocodificar novo CEP
  const geolocationService = new GeolocationService();
  const coords = await geolocationService.getLatLongByCep(cep);
  if (!coords) {
    throw new Error("Não foi possível geocodificar o CEP informado.");
  }

  const { lat: novaLat, long: novaLong } = coords;

  // 2. Buscar rotas BACKLOG ativas da oficina com relations
  const repo = this.getRotaRepo();
  const rotasAtivas = await repo.find({
    where: {
      ID_OFICINA: idOficina,
      STATUS: StatusRota.BACKLOG,
      DELETED_AT: IsNull(),
    },
    relations: ["campanhaPromotor", "campanhaPromotor.promotor"],
  });

  if (rotasAtivas.length === 0) {
    throw new Error("NOT_FOUND");
  }

  // 3. Agrupar rotas por campanha
  const rotasPorCampanha = new Map<number, RotaPromotor[]>();
  for (const rota of rotasAtivas) {
    const idCampanha = rota.campanhaPromotor?.ID_CAMPANHA;
    if (!idCampanha) continue;
    if (!rotasPorCampanha.has(idCampanha)) {
      rotasPorCampanha.set(idCampanha, []);
    }
    rotasPorCampanha.get(idCampanha)!.push(rota);
  }

  // 4. Buscar todos promotores candidatos das campanhas afetadas (query única)
  const campanhaIds = Array.from(rotasPorCampanha.keys());
  const candidatos = await this.getCandidatosPorCampanhas(campanhaIds);

  // 5. Processar cada campanha
  const reatribuicoes: ReatribuicaoResult[] = [];

  for (const [idCampanha, rotas] of rotasPorCampanha) {
    // Pegar a primeira rota (mesma oficina, mesmo promotor por campanha)
    const rota = rotas[0];
    const promotorAtual = rota.campanhaPromotor?.promotor;
    const cpAtual = rota.campanhaPromotor;

    if (!promotorAtual?.LATITUDE || !promotorAtual?.LONGITUDE) {
      // Promotor sem coords — não pode calcular distância, manter
      reatribuicoes.push({
        ID_CAMPANHA: idCampanha,
        promotor_anterior: {
          ID_PROMOTOR: promotorAtual?.ID_PROMOTOR ?? 0,
          NOME: promotorAtual?.NOME ?? "Desconhecido",
          distancia_km: 0,
        },
        promotor_novo: null,
        rota_removida: null,
        rota_criada: null,
        status: "sem_promotor_disponivel",
      });
      continue;
    }

    // Calcular distância do promotor atual à nova posição da oficina
    const distanciaAtual = haversineDistanceKm(
      parseFloat(promotorAtual.LATITUDE),
      parseFloat(promotorAtual.LONGITUDE),
      novaLat,
      novaLong
    );

    const raioAtual = cpAtual?.RAIO ?? 20;

    // Se ainda dentro do raio, manter
    if (distanciaAtual <= raioAtual) {
      reatribuicoes.push({
        ID_CAMPANHA: idCampanha,
        promotor_anterior: {
          ID_PROMOTOR: promotorAtual.ID_PROMOTOR!,
          NOME: promotorAtual.NOME,
          distancia_km: Math.round(distanciaAtual * 10) / 10,
        },
        promotor_novo: null,
        rota_removida: null,
        rota_criada: null,
        status: "mantida_dentro_do_raio",
      });
      continue;
    }

    // Fora do raio — buscar candidato mais próximo
    const candidatosCampanha = (candidatos.get(idCampanha) ?? [])
      .filter(c => c.ID_PROMOTOR !== promotorAtual.ID_PROMOTOR);

    // Calcular distância de cada candidato e filtrar por raio
    const candidatosElegiveis = candidatosCampanha
      .map(c => ({
        ...c,
        distancia: haversineDistanceKm(c.lat, c.lon, novaLat, novaLong),
      }))
      .filter(c => c.distancia <= (c.RAIO ?? 20))
      .sort((a, b) => a.distancia - b.distancia);

    if (candidatosElegiveis.length === 0) {
      reatribuicoes.push({
        ID_CAMPANHA: idCampanha,
        promotor_anterior: {
          ID_PROMOTOR: promotorAtual.ID_PROMOTOR!,
          NOME: promotorAtual.NOME,
          distancia_km: Math.round(distanciaAtual * 10) / 10,
        },
        promotor_novo: null,
        rota_removida: null,
        rota_criada: null,
        status: "sem_promotor_disponivel",
      });
      continue;
    }

    // Reatribuir para o mais próximo (transação atômica)
    const melhorCandidato = candidatosElegiveis[0];

    const { rotaRemovida, rotaCriada } = await AppDataSourceSync.transaction(
      async (manager) => {
        // Soft delete de todas rotas BACKLOG desta oficina nesta campanha
        const idsParaDeletar = rotas
          .map(r => r.ID_ROTA_PROMOTOR!)
          .filter(Boolean);
        
        await manager.softDelete(RotaPromotor, idsParaDeletar);

        // Criar nova rota no CAMPANHA_PROMOTOR do novo promotor
        const novaRota = manager.create(RotaPromotor, {
          ID_CAMPANHA_PROMOTOR: melhorCandidato.ID_CAMPANHA_PROMOTOR,
          ID_OFICINA: idOficina,
        });
        const rotaSalva = await manager.save(novaRota);

        return {
          rotaRemovida: idsParaDeletar[0],
          rotaCriada: rotaSalva.ID_ROTA_PROMOTOR!,
        };
      }
    );

    reatribuicoes.push({
      ID_CAMPANHA: idCampanha,
      promotor_anterior: {
        ID_PROMOTOR: promotorAtual.ID_PROMOTOR!,
        NOME: promotorAtual.NOME,
        distancia_km: Math.round(distanciaAtual * 10) / 10,
      },
      promotor_novo: {
        ID_PROMOTOR: melhorCandidato.ID_PROMOTOR,
        NOME: melhorCandidato.NOME,
        distancia_km: Math.round(melhorCandidato.distancia * 10) / 10,
      },
      rota_removida: rotaRemovida,
      rota_criada: rotaCriada,
      status: "reatribuida",
    });
  }

  // 6. Montar resumo
  const resumo = {
    mantidas: reatribuicoes.filter(r => r.status === "mantida_dentro_do_raio").length,
    reatribuidas: reatribuicoes.filter(r => r.status === "reatribuida").length,
    sem_promotor_disponivel: reatribuicoes.filter(r => r.status === "sem_promotor_disponivel").length,
  };

  return {
    oficina: { ID_OFICINA: idOficina, novo_cep: cep, nova_latitude: novaLat, nova_longitude: novaLong },
    campanhas_processadas: campanhaIds.length,
    reatribuicoes,
    resumo,
  };
}
```

Método auxiliar privado para buscar candidatos:

```ts
private static async getCandidatosPorCampanhas(
  campanhaIds: number[]
): Promise<Map<number, Array<{
  ID_CAMPANHA_PROMOTOR: number;
  ID_CAMPANHA: number;
  ID_PROMOTOR: number;
  NOME: string;
  RAIO: number | null;
  lat: number;
  lon: number;
}>>> {
  if (campanhaIds.length === 0) return new Map();

  const results = await AppDataSourceSync.query(
    `SELECT 
      cp."ID_CAMPANHA_PROMOTOR",
      cp."ID_CAMPANHA",
      cp."ID_PROMOTOR",
      cp."RAIO",
      p."NOME",
      p."LATITUDE",
      p."LONGITUDE"
    FROM "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" cp
    INNER JOIN "CAMPANHAS_OB"."PROMOTOR" p
      ON cp."ID_PROMOTOR" = p."ID_PROMOTOR"
    WHERE cp."ID_CAMPANHA" = ANY($1)
      AND cp."DELETED_AT" IS NULL
      AND p."DELETED_AT" IS NULL
      AND p."LATITUDE" IS NOT NULL
      AND p."LONGITUDE" IS NOT NULL`,
    [campanhaIds]
  );

  const mapa = new Map<number, Array<any>>();
  for (const row of results) {
    const idCampanha = row.ID_CAMPANHA;
    if (!mapa.has(idCampanha)) mapa.set(idCampanha, []);
    mapa.get(idCampanha)!.push({
      ID_CAMPANHA_PROMOTOR: row.ID_CAMPANHA_PROMOTOR,
      ID_CAMPANHA: row.ID_CAMPANHA,
      ID_PROMOTOR: row.ID_PROMOTOR,
      NOME: row.NOME,
      RAIO: row.RAIO,
      lat: parseFloat(row.LATITUDE),
      lon: parseFloat(row.LONGITUDE),
    });
  }
  return mapa;
}
```

### 4. `controllers/rotaController.ts` (MODIFICAR)

```ts
static reassignByAddress = async (req: Request, res: Response) => {
  try {
    const { CEP, ID_OFICINA } = req.body;

    const result = await RotaService.reassignRotasByAddress(CEP, ID_OFICINA);

    return res.status(200).json({
      message: "Reatribuição de rotas concluída.",
      data: result,
    });
  } catch (error: any) {
    if (error.message === "NOT_FOUND") {
      return res.status(404).json({
        message: "Nenhuma rota ativa encontrada para a oficina informada.",
      });
    }
    if (error.message?.includes("geocodificar")) {
      return res.status(400).json({
        message: error.message,
      });
    }
    console.error("Erro na reatribuição de rotas:", error);
    return res.status(500).json({
      message: "Erro interno ao processar reatribuição de rotas.",
    });
  }
};
```

### 5. `routes/RotaRoute.ts` (MODIFICAR)

```ts
createDocumentedRoute(router, {
  method: "post",
  path: "/reassign-by-address",
  handler: RotaController.reassignByAddress,
  basePath: "/rota",
  schemas: {
    body: ReassignByAddressSchema,
  },
  documentation: {
    tags: ["Rota"],
    summary: "Reatribui rotas após mudança de endereço de oficina",
    description: "Recebe novo CEP e ID_OFICINA. Verifica se a oficina saiu do raio do promotor atual em cada campanha e reatribui para o promotor mais próximo disponível.",
    security: [{ bearerAuth: [] }],
    responses: {
      200: { description: "Reatribuição concluída", schema: ReassignByAddressResponseSchema },
      400: { description: "CEP inválido ou não geocodificável" },
      404: { description: "Nenhuma rota ativa encontrada para a oficina" },
      500: { description: "Erro interno" },
    },
  },
  middlewares: [],
});
```

## Diagrama de Sequência

```
Client          Controller        RotaService        GeolocationSvc      Database
  │                 │                 │                    │                  │
  │ POST /reassign  │                 │                    │                  │
  │─────────────────►                 │                    │                  │
  │                 │ reassignRotas() │                    │                  │
  │                 │─────────────────►                    │                  │
  │                 │                 │ getLatLongByCep()  │                  │
  │                 │                 │────────────────────►                  │
  │                 │                 │    {lat, long}     │                  │
  │                 │                 │◄────────────────────                  │
  │                 │                 │                    │                  │
  │                 │                 │ find rotas BACKLOG │                  │
  │                 │                 │───────────────────────────────────────►
  │                 │                 │   rotas[] + relations                 │
  │                 │                 │◄───────────────────────────────────────
  │                 │                 │                    │                  │
  │                 │                 │ getCandidatos(campanhaIds)            │
  │                 │                 │───────────────────────────────────────►
  │                 │                 │   candidatos[]                        │
  │                 │                 │◄───────────────────────────────────────
  │                 │                 │                    │                  │
  │                 │                 │─── haversine() ──► │                  │
  │                 │                 │    (em memória)    │                  │
  │                 │                 │                    │                  │
  │                 │                 │ [para cada reatribuição]              │
  │                 │                 │ BEGIN TRANSACTION  │                  │
  │                 │                 │───────────────────────────────────────►
  │                 │                 │  softDelete + create                  │
  │                 │                 │◄───────────────────────────────────────
  │                 │                 │ COMMIT             │                  │
  │                 │                 │                    │                  │
  │                 │  result         │                    │                  │
  │                 │◄─────────────────                    │                  │
  │  200 + report   │                 │                    │                  │
  │◄─────────────────                 │                    │                  │
```

## Complexidade e Performance

| Operação | Complexidade | Nota |
|----------|-------------|------|
| Geocodificação | O(1) | 1 chamada HTTP (Nominatim/Google) |
| Buscar rotas da oficina | O(1) | Query por ID_OFICINA + STATUS indexados |
| Buscar candidatos | O(1) | Query única com ANY(campanhaIds) |
| Haversine por candidato | O(P×C) | P = promotores por campanha (~20), C = campanhas (~5) |
| Transactions de reatribuição | O(C) | 1 transaction por campanha afetada |

**Pior caso:** Oficina em 10 campanhas × 50 promotores/campanha = 500 cálculos Haversine (< 1ms total).

**Bottleneck real:** Geocodificação (1-2s com Nominatim throttling). Aceitável para endpoint síncrono.

## Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Nominatim throttle atrasa resposta | Média | Baixo | Fallback Google Maps já existe |
| Oficina em muitas campanhas (>10) | Baixa | Baixo | Query única + processamento em memória |
| Promotor sem lat/long | Média | Baixo | Filtrado na query de candidatos (WHERE NOT NULL) |
| Race condition (2 calls simultâneas) | Baixa | Médio | Transaction garante atomicidade; idempotência por design |
| Rotas duplicadas pós-reatribuição | Baixa | Alto | Verificação: se já existe rota BACKLOG da oficina no novo CAMPANHA_PROMOTOR, skip |

## Tasks de Implementação

1. **Criar `utils/haversine.ts`** — função pura, testável isoladamente
2. **Adicionar schemas em `schemas/rota.ts`** — ReassignByAddressSchema + ResponseSchema
3. **Implementar `RotaService.reassignRotasByAddress()`** — lógica principal
4. **Implementar `RotaService.getCandidatosPorCampanhas()`** — query auxiliar
5. **Adicionar handler em `controllers/rotaController.ts`** — `reassignByAddress`
6. **Registrar rota em `routes/RotaRoute.ts`** — `POST /reassign-by-address`
7. **Criar testes unitários** — `__tests__/unit/rotaReassignService.test.ts`
