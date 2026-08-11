# Atribuição de Oficina na Inscrição em Comunidade - Design

## Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────────────────────┐
│      POST /rota/assign-oficina-community { ID_OFICINA, empresaSlug }     │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│         RotaController.assignOficinaCommunity()                           │
│                                                                          │
│  1. Valida input (AssignOficinaCommunitySchema)                          │
│  2. Chama RotaService.assignOficinaFromCommunitySignup(...)              │
│  3. Retorna resultado detalhado                                          │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│         RotaService.assignOficinaFromCommunitySignup()                    │
│                                                                          │
│  1. Buscar coordenadas da oficina (cadastro_empresa ou GeolocationSvc)   │
│  2. Buscar campanhas ativas do cliente (via empresaSlug → ID_CLIENT)     │
│  3. Para cada campanha: verificar idempotência → buscar candidatos       │
│  4. Filtrar por raio + desempatar por menor distância                    │
│  5. Criar rota via RotaService.createRotas (dispara notificação)         │
│  6. Retornar relatório                                                   │
└──────────┬────────────────────────────────┬─────────────────────────────┘
           │                                │
           ▼                                ▼
┌──────────────────────────────┐  ┌────────────────────────────────────────┐
│  GeolocationService          │  │  haversineDistanceKm()                 │
│  .getLatLongByCep()          │  │  (utils/haversine.ts — já existente)   │
│                              │  │                                        │
│  Nominatim → fallback Google │  │  Cálculo de distância entre dois       │
│  (usado apenas se            │  │  pontos geográficos                    │
│   cadastro_empresa sem lat)  │  │                                        │
└──────────────────────────────┘  └────────────────────────────────────────┘
```

## Decisões de Design

### D1: Coordenadas de `cadastro_empresa` como fonte primária

A oficina será buscada em `dw.cadastro_empresa` (que contém latitude/longitude confiáveis). Apenas se não houver coordenadas lá, faremos fallback para geocodificação via CEP com `GeolocationService`.

**Motivo:**
- `cadastro_empresa` já tem coordenadas populadas e validadas para a maioria das oficinas
- Evita hit desnecessário em APIs externas (Nominatim, Google Maps)
- Menor latência na resposta do endpoint

**Trade-off:** Se a oficina acabou de ser criada e ainda não está em `cadastro_empresa`, o fallback por CEP cobre esse caso. Se nem CEP existir, retornamos 422.

### D2: Query direta em CAMPANHA.EMPRESA_SLUG

A tabela CAMPANHA receberá um novo campo `EMPRESA_SLUG` (varchar). A busca de campanhas ativas é um simples filtro:

```sql
SELECT c."ID_CAMPANHA", c."NOME"
FROM "CAMPANHAS_OB"."CAMPANHA" c
WHERE c."EMPRESA_SLUG" = $1
  AND c."DELETED_AT" IS NULL
  AND c."START_TIME" <= NOW()
  AND c."END_TIME" >= NOW()
```

**Motivo:** O `ID_CLIENT` de CAMPANHA (base SQL Server) não tem relação com o `ID_CLIENT` da tabela COMMUNITIES (PostgreSQL). Não existe de-para prático entre eles. Persistir o `EMPRESA_SLUG` diretamente na campanha é a forma mais simples e confiável de fazer essa associação.

**Trade-off:** Requer migration para adicionar a coluna e popular campanhas existentes. Dado que campanhas são criadas pelo admin com contexto do cliente, o slug pode ser informado na criação.

### D3: Reutilizar `getCandidatosPorCampanhas` existente

O método `RotaService.getCandidatosPorCampanhas(campanhaIds[])` já existe e retorna todos os promotores com coordenadas agrupados por campanha. Reutilizamos diretamente.

**Motivo:** Evita duplicação de lógica. O método já faz o JOIN com PROMOTOR, filtra por DELETED_AT e coordenadas não-nulas.

### D4: Filtro por raio em JavaScript (não SQL)

Mesma decisão do `reassign-rota-oficina-update`: o cálculo Haversine entre promotor↔oficina é feito em memória com `haversineDistanceKm()`.

**Motivo:**
- Número de promotores por campanha é tipicamente < 20
- Permite lógica de desempate e ordenação flexível
- Evita CAST de varchar→float em query SQL complexa
- Função já testada e reutilizada em outros fluxos

### D5: Idempotência via `getOficinasAssignedInCampanha`

Antes de atribuir, verificamos se `ID_OFICINA` já está em `ROTA_PROMOTOR` para a campanha em questão. Se sim, marcamos como `ja_atribuida` e seguimos.

**Motivo:** O endpoint pode ser chamado múltiplas vezes (retry, webhook duplicado). Não deve criar rotas duplicadas.

**Implementação:** Reutilizamos `RotaService.getOficinasAssignedInCampanha(idCampanha)` que já retorna IDs de oficinas com rotas ativas na campanha.

### D6: Sem transação explícita (operação atômica simples)

Cada atribuição é apenas um `createRotas(ID_CAMPANHA_PROMOTOR, ID_OFICINA)` — uma operação de INSERT simples. Não há soft delete envolvido (diferente do reassign). Se falhar em uma campanha, as outras prosseguem normalmente.

**Motivo:** Simplicidade. Não há estado intermediário inconsistente — ou a rota é criada, ou não é. Falha em uma campanha não afeta as outras.

**Trade-off:** Se precisarmos de atomicidade all-or-nothing no futuro, encapsular em transação é trivial.

### D7: Notificação automática via fluxo existente

`RotaService.createRotas()` já chama `notificarRotasCriadas()` internamente. Não precisamos de lógica adicional de notificação.

**Motivo:** Single Responsibility — o service de criação de rotas já sabe que toda rota nova gera notificação.

### D8: Desempate determinístico

Quando dois promotores estão à mesma distância exata, o desempate é feito pelo menor `ID_CAMPANHA_PROMOTOR` (ORDER BY implícito no sort estável do array + filtro da query original).

**Motivo:** Evita comportamento não-determinístico. Em testes, o resultado é previsível.

## Mudanças por Arquivo

### 1. `entities/Campanha.ts` (MODIFICAR)

Adicionar campo `EMPRESA_SLUG`:

```ts
@Column({ type: "varchar", length: 100, nullable: true, name: "EMPRESA_SLUG" })
EMPRESA_SLUG?: string;
```

### 2. `scripts/migration-empresa-slug-campanha.sql` (CRIAR)

```sql
ALTER TABLE "CAMPANHAS_OB"."CAMPANHA"
  ADD COLUMN IF NOT EXISTS "EMPRESA_SLUG" VARCHAR(100) NULL;

CREATE INDEX IF NOT EXISTS idx_campanha_empresa_slug
  ON "CAMPANHAS_OB"."CAMPANHA" ("EMPRESA_SLUG")
  WHERE "DELETED_AT" IS NULL;
```

### 3. `schemas/rota.ts` (MODIFICAR)

Adicionar schema de request e response:

```ts
export const AssignOficinaCommunitySchema = z.object({
  ID_OFICINA: z.coerce.number().int().positive(),
  empresaSlug: z.string().min(1).max(100),
});

const AtribuicaoStatusSchema = z.enum([
  "atribuida",
  "sem_promotor_disponivel",
  "ja_atribuida",
]);

export const AssignOficinaCommunityResponseSchema = z.object({
  success: z.boolean(),
  oficina: z.object({
    ID_OFICINA: z.number(),
    CEP: z.string().nullable(),
    latitude: z.number(),
    longitude: z.number(),
  }),
  campanhas_processadas: z.number(),
  atribuicoes: z.array(z.object({
    ID_CAMPANHA: z.number(),
    NOME_CAMPANHA: z.string(),
    status: AtribuicaoStatusSchema,
    promotor: z.object({
      ID_PROMOTOR: z.number(),
      NOME: z.string(),
      distancia_km: z.number(),
    }).nullable(),
    ID_ROTA_PROMOTOR: z.number().nullable(),
  })),
  resumo: z.object({
    atribuidas: z.number(),
    sem_promotor_disponivel: z.number(),
    ja_atribuida: z.number(),
  }),
});
```

### 4. `service/rotaService.ts` (MODIFICAR)

Novo método público + helper privado:

```ts
interface CampanhaAtiva {
  ID_CAMPANHA: number;
  NOME: string;
}

interface AtribuicaoResult {
  ID_CAMPANHA: number;
  NOME_CAMPANHA: string;
  status: "atribuida" | "sem_promotor_disponivel" | "ja_atribuida";
  promotor: { ID_PROMOTOR: number; NOME: string; distancia_km: number } | null;
  ID_ROTA_PROMOTOR: number | null;
}

interface AssignOficinaResult {
  oficina: { ID_OFICINA: number; CEP: string | null; latitude: number; longitude: number };
  campanhas_processadas: number;
  atribuicoes: AtribuicaoResult[];
  resumo: { atribuidas: number; sem_promotor_disponivel: number; ja_atribuida: number };
}

static async assignOficinaFromCommunitySignup(
  idOficina: number,
  empresaSlug: string
): Promise<AssignOficinaResult> {
  // 1. Buscar coordenadas da oficina
  const { lat, lon, cep } = await this.getOficinaCoordinates(idOficina);

  // 2. Buscar campanhas ativas do cliente
  const campanhasAtivas = await this.getActiveCampanhasBySlug(empresaSlug);

  if (campanhasAtivas.length === 0) {
    return {
      oficina: { ID_OFICINA: idOficina, CEP: cep, latitude: lat, longitude: lon },
      campanhas_processadas: 0,
      atribuicoes: [],
      resumo: { atribuidas: 0, sem_promotor_disponivel: 0, ja_atribuida: 0 },
    };
  }

  // 3. Buscar candidatos de todas as campanhas (query única)
  const campanhaIds = campanhasAtivas.map(c => c.ID_CAMPANHA);
  const candidatos = await this.getCandidatosPorCampanhas(campanhaIds);

  // 4. Processar cada campanha
  const atribuicoes: AtribuicaoResult[] = [];

  for (const campanha of campanhasAtivas) {
    // 4a. Verificar idempotência
    const assignedOficinas = await this.getOficinasAssignedInCampanha(campanha.ID_CAMPANHA);
    if (assignedOficinas.includes(idOficina)) {
      atribuicoes.push({
        ID_CAMPANHA: campanha.ID_CAMPANHA,
        NOME_CAMPANHA: campanha.NOME,
        status: "ja_atribuida",
        promotor: null,
        ID_ROTA_PROMOTOR: null,
      });
      continue;
    }

    // 4b. Buscar promotores candidatos desta campanha
    const candidatosCampanha = candidatos.get(campanha.ID_CAMPANHA) ?? [];

    // 4c. Calcular distância e filtrar por raio
    const candidatosElegiveis = candidatosCampanha
      .map(c => ({
        ...c,
        distancia: haversineDistanceKm(c.lat, c.lon, lat, lon),
      }))
      .filter(c => c.distancia <= (c.RAIO ?? 20))
      .sort((a, b) => a.distancia - b.distancia || a.ID_CAMPANHA_PROMOTOR - b.ID_CAMPANHA_PROMOTOR);

    // 4d. Nenhum promotor alcança
    if (candidatosElegiveis.length === 0) {
      atribuicoes.push({
        ID_CAMPANHA: campanha.ID_CAMPANHA,
        NOME_CAMPANHA: campanha.NOME,
        status: "sem_promotor_disponivel",
        promotor: null,
        ID_ROTA_PROMOTOR: null,
      });
      continue;
    }

    // 4e. Atribuir ao mais próximo
    const melhor = candidatosElegiveis[0];
    const rota = await this.createRotas(melhor.ID_CAMPANHA_PROMOTOR, idOficina);
    const rotaCriada = Array.isArray(rota) ? rota[0] : rota;

    atribuicoes.push({
      ID_CAMPANHA: campanha.ID_CAMPANHA,
      NOME_CAMPANHA: campanha.NOME,
      status: "atribuida",
      promotor: {
        ID_PROMOTOR: melhor.ID_PROMOTOR,
        NOME: melhor.NOME,
        distancia_km: Math.round(melhor.distancia * 10) / 10,
      },
      ID_ROTA_PROMOTOR: rotaCriada.ID_ROTA_PROMOTOR!,
    });
  }

  // 5. Montar resumo
  const resumo = {
    atribuidas: atribuicoes.filter(a => a.status === "atribuida").length,
    sem_promotor_disponivel: atribuicoes.filter(a => a.status === "sem_promotor_disponivel").length,
    ja_atribuida: atribuicoes.filter(a => a.status === "ja_atribuida").length,
  };

  return {
    oficina: { ID_OFICINA: idOficina, CEP: cep, latitude: lat, longitude: lon },
    campanhas_processadas: campanhasAtivas.length,
    atribuicoes,
    resumo,
  };
}
```

Helper para buscar coordenadas da oficina:

```ts
private static async getOficinaCoordinates(
  idOficina: number
): Promise<{ lat: number; lon: number; cep: string | null }> {
  // Tentar cadastro_empresa primeiro (coordenadas mais confiáveis)
  const ceResult = await AppDataSourceSync.query(
    `SELECT ce."latitude", ce."longitude", ce."cep"
     FROM "dw"."cadastro_empresa" ce
     WHERE ce."id_oficina" = $1
     LIMIT 1`,
    [idOficina]
  );

  if (ceResult.length > 0 && ceResult[0].latitude && ceResult[0].longitude) {
    return {
      lat: parseFloat(ceResult[0].latitude),
      lon: parseFloat(ceResult[0].longitude),
      cep: ceResult[0].cep ?? null,
    };
  }

  // Fallback: buscar CEP da oficina e geocodificar
  const oficinaResult = await AppDataSourceSync.query(
    `SELECT o."CEP", o."LATITUDE", o."LONGITUDE"
     FROM "MAIN_REGISTER"."OFICINA" o
     WHERE o."ID_OFICINA" = $1`,
    [idOficina]
  );

  if (oficinaResult.length === 0) {
    throw new Error("NOT_FOUND");
  }

  const oficina = oficinaResult[0];

  // Se OFICINA já tem coordenadas, usar
  if (oficina.LATITUDE && oficina.LONGITUDE) {
    return {
      lat: parseFloat(oficina.LATITUDE),
      lon: parseFloat(oficina.LONGITUDE),
      cep: oficina.CEP ?? null,
    };
  }

  // Geocodificar via CEP
  if (!oficina.CEP) {
    throw new Error("UNPROCESSABLE");
  }

  const geolocationService = new GeolocationService();
  const coords = await geolocationService.getLatLongByCep(oficina.CEP);

  if (!coords) {
    throw new Error("UNPROCESSABLE");
  }

  return { lat: coords.lat, lon: coords.long, cep: oficina.CEP };
}
```

Helper para buscar campanhas ativas por slug:

```ts
private static async getActiveCampanhasBySlug(
  empresaSlug: string
): Promise<CampanhaAtiva[]> {
  const results = await AppDataSourceSync.query(
    `SELECT c."ID_CAMPANHA", c."NOME"
     FROM "CAMPANHAS_OB"."CAMPANHA" c
     WHERE c."EMPRESA_SLUG" = $1
       AND c."DELETED_AT" IS NULL
       AND c."START_TIME" <= NOW()
       AND c."END_TIME" >= NOW()`,
    [empresaSlug]
  );

  return results.map((r: any) => ({
    ID_CAMPANHA: r.ID_CAMPANHA,
    NOME: r.NOME,
  }));
}
```

### 5. `controllers/rotaController.ts` (MODIFICAR)

Novo handler:

```ts
static assignOficinaCommunity = async (req: Request, res: Response) => {
  try {
    const { ID_OFICINA, empresaSlug } = req.body;

    const result = await RotaService.assignOficinaFromCommunitySignup(
      ID_OFICINA,
      empresaSlug
    );

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    if (error.message === "NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: "Oficina não encontrada.",
      });
    }
    if (error.message === "UNPROCESSABLE") {
      return res.status(422).json({
        success: false,
        error: "Não foi possível geocodificar o CEP da oficina.",
      });
    }
    console.error("Erro ao atribuir oficina por comunidade:", error);
    return res.status(500).json({
      success: false,
      error: "Erro interno ao processar atribuição.",
    });
  }
};
```

### 6. `routes/RotaRoute.ts` (MODIFICAR)

Registrar o novo endpoint:

```ts
createDocumentedRoute(router, {
  method: "post",
  path: "/assign-oficina-community",
  handler: RotaController.assignOficinaCommunity,
  basePath: "/rota",
  middlewares: [],
  schemas: {
    body: AssignOficinaCommunitySchema,
  },
  documentation: {
    tags: ["Rota"],
    summary: "Atribui oficina ao promotor mais próximo na inscrição em comunidade",
    description:
      "Recebe ID_OFICINA e empresaSlug. Busca campanhas ativas do cliente, " +
      "calcula distância para cada promotor e atribui ao mais próximo dentro do raio.",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "Atribuição processada (pode conter atribuições, skips ou sem promotor)",
        schema: AssignOficinaCommunityResponseSchema,
      },
      404: { description: "Oficina não encontrada", schema: ErrorResponseSchema },
      422: { description: "CEP sem coordenadas", schema: ErrorResponseSchema },
      500: { description: "Erro interno", schema: ErrorResponseSchema },
    },
  },
});
```

## Sequência de Execução

```
Client                Controller                   RotaService                      DB
  │                      │                            │                             │
  │─POST /assign─────────▶                            │                             │
  │                      │─assignOficina──────────────▶                             │
  │                      │                            │─getOficinaCoordinates──────▶│
  │                      │                            │◀──── { lat, lon, cep } ─────│
  │                      │                            │                             │
  │                      │                            │─getActiveCampanhasBySlug───▶│
  │                      │                            │◀──── [campanhas] ───────────│
  │                      │                            │                             │
  │                      │                            │─getCandidatosPorCampanhas──▶│
  │                      │                            │◀──── Map<campanha,proms> ───│
  │                      │                            │                             │
  │                      │                            │ ┌─loop campanhas────────┐   │
  │                      │                            │ │getOficinasAssigned────▶│   │
  │                      │                            │ │◀── [ids] ─────────────│   │
  │                      │                            │ │                       │   │
  │                      │                            │ │ haversine + filter    │   │
  │                      │                            │ │ sort by distance      │   │
  │                      │                            │ │                       │   │
  │                      │                            │ │createRotas───────────▶│   │
  │                      │                            │ │◀── rota ─────────────│   │
  │                      │                            │ │                       │   │
  │                      │                            │ │ notificarRotasCriadas │   │
  │                      │                            │ └───────────────────────┘   │
  │                      │                            │                             │
  │                      │◀──── result ───────────────│                             │
  │◀──── 200 JSON ───────│                            │                             │
```

## Queries SQL

### Q1: Buscar coordenadas da oficina (cadastro_empresa)

```sql
SELECT ce."latitude", ce."longitude", ce."cep"
FROM "dw"."cadastro_empresa" ce
WHERE ce."id_oficina" = $1
LIMIT 1
```

### Q2: Fallback — buscar CEP/coordenadas da entidade OFICINA

```sql
SELECT o."CEP", o."LATITUDE", o."LONGITUDE"
FROM "MAIN_REGISTER"."OFICINA" o
WHERE o."ID_OFICINA" = $1
```

### Q3: Buscar campanhas ativas por empresaSlug

```sql
SELECT c."ID_CAMPANHA", c."NOME"
FROM "CAMPANHAS_OB"."CAMPANHA" c
WHERE c."EMPRESA_SLUG" = $1
  AND c."DELETED_AT" IS NULL
  AND c."START_TIME" <= NOW()
  AND c."END_TIME" >= NOW()
```

### Q4: Buscar candidatos (reutiliza `getCandidatosPorCampanhas`)

```sql
SELECT 
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
  AND p."LONGITUDE" IS NOT NULL
```

### Q5: Verificar idempotência (reutiliza `getOficinasAssignedInCampanha`)

```sql
SELECT DISTINCT rp."ID_OFICINA"
FROM "CAMPANHAS_OB"."ROTA_PROMOTOR" rp
INNER JOIN "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" cp
  ON rp."ID_CAMPANHA_PROMOTOR" = cp."ID_CAMPANHA_PROMOTOR"
WHERE cp."ID_CAMPANHA" = $1
  AND rp."DELETED_AT" IS NULL
  AND cp."DELETED_AT" IS NULL
```

## Complexidade e Performance

| Operação | Complexidade | Observação |
|----------|-------------|------------|
| Buscar coordenadas oficina | O(1) | Query com PK |
| Buscar campanhas ativas | O(1) | Filtro direto por EMPRESA_SLUG (indexado) |
| Buscar candidatos | O(1) | Uma query para todas as campanhas |
| Verificar idempotência | O(n) | n = número de campanhas ativas (tipicamente < 5) |
| Filtro Haversine | O(n*m) | n = campanhas, m = promotores/campanha (tipicamente < 20) |
| Criar rota | O(1) | INSERT simples |
| **Total worst case** | **~5 queries + cálculo em memória** | Para caso típico de 1-3 campanhas |

## Testes

### Unitários (`__tests__/unit/rotaService.test.ts`)

| Cenário | Setup | Asserção |
|---------|-------|----------|
| Oficina com coordenadas em cadastro_empresa | Mock query retorna lat/lon | Não chama GeolocationService |
| Oficina sem coords em CE, com CEP em OFICINA | Mock fallback | Chama getLatLongByCep |
| Oficina sem CEP e sem coords | Mock retorna vazio | Lança "UNPROCESSABLE" |
| Oficina não encontrada | Mock retorna [] | Lança "NOT_FOUND" |
| Nenhuma campanha ativa | getActiveCampanhasBySlug retorna [] | Retorna campanhas_processadas=0 |
| Oficina já atribuída na campanha | getOficinasAssigned inclui ID | status="ja_atribuida" |
| Múltiplos promotores, atribui ao mais próximo | 2 candidatos com distâncias diferentes | Seleciona o menor |
| Nenhum promotor no raio | Todos com distância > RAIO | status="sem_promotor_disponivel" |
| Promotor sem coordenadas é ignorado | getCandidatos não retorna sem coords | Filtrado na query SQL |
| RAIO null usa default 20km | RAIO=null, distância=15km | Atribui normalmente |
| Desempate por ID quando distância igual | 2 candidatos com mesma distância | Menor ID_CAMPANHA_PROMOTOR vence |
