# Auto-Atribuição de Rotas - Design

## Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         POST /promotor/create                            │
│                   { ...promotorData, EMPRESA_SLUG }                      │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        PromotorService.createPromotor()                   │
│                                                                          │
│  1. encrypt(SENHA)                                                       │
│  2. getLatLongByCep(CEP) → LATITUDE, LONGITUDE                          │
│  3. repo.save(promotor)                                                  │
│  4. linkCampanhaPromotor(campanhaIds, promotorId, raio)                  │
│  5. ⭐ autoAssignRotas(promotorSalvo, campanhaPromotores, empresaSlug)   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              OficinaService.getComunityNearbyOficinas()                   │
│                                                                          │
│  Params: latitude, longitude, radiusKm, empresaSlug                      │
│                                                                          │
│  Query: COMMUNITIES → USUARIO_COMMUNITY → USUARIO → cadastro_empresa     │
│         + Haversine filter (distance <= radiusKm)                         │
│         + status_receita = 'ATIVA'                                        │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    RotaService.createRotas()                              │
│                                                                          │
│  Para cada CAMPANHA_PROMOTOR:                                            │
│    createRotas(ID_CAMPANHA_PROMOTOR, [ID_OFICINA...])                    │
└─────────────────────────────────────────────────────────────────────────┘
```

## Decisões de Design

### D1: `empresaSlug` como parâmetro do endpoint

O `empresaSlug` será enviado pelo frontend no body do `POST /promotor/create`. Não será persistido — é usado apenas no momento da auto-atribuição.

**Motivo:** Simplicidade. Evita lookup adicional e relação nova no banco. O front já conhece o slug do cliente logado.

### D2: Auto-atribuição síncrona no fluxo de criação

A auto-atribuição acontece dentro do `createPromotor`, após o link com campanhas. É síncrona — o response só retorna após as rotas serem criadas.

**Motivo:** A quantidade de oficinas é limitada pelo raio (tipicamente < 100 registros). O overhead de criar rotas em batch é negligível.

**Trade-off:** Se a busca de oficinas falhar, o promotor ainda é criado (as rotas não são criadas). Log de erro é registrado.

### D3: Fail-safe — promotor sempre é criado

Se qualquer etapa da auto-atribuição falhar (CEP sem lat/long, query falha, nenhuma oficina encontrada), o promotor é criado normalmente. A auto-atribuição é best-effort com log.

**Motivo:** O cadastro do promotor não deve ser bloqueado por falha na atribuição de rotas. Rotas podem ser atribuídas manualmente depois.

### D4: Uma execução de `getComunityNearbyOficinas` por CAMPANHA_PROMOTOR

Como o RAIO pode variar por campanha (vem de CAMPANHA_PROMOTOR.RAIO), a busca é executada uma vez para cada vínculo campanha-promotor criado.

**Otimização possível (não implementar agora):** Se todos os RAIO forem iguais, executar a query uma única vez.

### D5: DISTINCT no id_oficina

A query de comunidade pode retornar oficinas duplicadas (múltiplos usuários na mesma oficina na mesma comunidade). Aplicamos `DISTINCT ON (ce."id_oficina")` para evitar rotas duplicadas.

## Mudanças por Arquivo

### 1. `schemas/promotor.ts`

Adicionar `EMPRESA_SLUG` ao `CreatePromotorSchema`:

```ts
export const CreatePromotorSchema = z.object({
  // ... campos existentes ...
  EMPRESA_SLUG: z.string().min(1).optional(), // para auto-assign de rotas
});
```

### 2. `controllers/promotorController.ts`

Extrair `EMPRESA_SLUG` do body e passar ao service:

```ts
static createPromotor = async (req: Request, res: Response) => {
  const { ..., EMPRESA_SLUG } = req.body;
  // ...
  const novoPromotor = await PromotorService.createPromotor(
    promotorData, ID_CAMPANHA, RAIO, EMPRESA_SLUG
  );
};
```

### 3. `service/promotorService.ts`

Alterar assinatura de `createPromotor` para receber `empresaSlug`:

```ts
static async createPromotor(
  promotorData: Partial<Promotor>, 
  campanhaIds?: number | number[],
  raio?: number,
  empresaSlug?: string
): Promise<Promotor> {
  // ... lógica existente ...
  
  // Após linkCampanhaPromotor:
  if (empresaSlug && promotorSalvo.LATITUDE && promotorSalvo.LONGITUDE) {
    await this.autoAssignRotas(promotorSalvo, campanhaPromotores, empresaSlug);
  }
  
  return promotorSalvo;
}
```

Novo método privado:

```ts
private static async autoAssignRotas(
  promotor: Promotor,
  campanhaPromotores: CampanhaPromotor[],
  empresaSlug: string
): Promise<void> {
  for (const cp of campanhaPromotores) {
    try {
      const raio = cp.RAIO ?? 20;
      const oficinas = await OficinaService.getComunityNearbyOficinas(
        parseFloat(promotor.LATITUDE!),
        parseFloat(promotor.LONGITUDE!),
        raio,
        empresaSlug
      );

      if (oficinas.length > 0) {
        const oficinaIds = oficinas.map(o => o.ID_OFICINA);
        await RotaService.createRotas(cp.ID_CAMPANHA_PROMOTOR!, oficinaIds);
      }
    } catch (error) {
      console.error(`Auto-assign rotas failed for CAMPANHA_PROMOTOR ${cp.ID_CAMPANHA_PROMOTOR}:`, error);
    }
  }
}
```

**Nota:** `linkCampanhaPromotor` precisa retornar os `CampanhaPromotor[]` criados para que possamos iterar sobre eles.

### 4. `service/campanhaPromotorService.ts`

Nenhuma mudança na assinatura — `linkCampanhaPromotor` já retorna `CampanhaPromotor[]`.

### 5. `service/oficinaService.ts`

Implementar `getComunityNearbyOficinas`:

```ts
static async getComunityNearbyOficinas(
  latitude: number,
  longitude: number,
  radiusKm: number,
  empresaSlug: string
): Promise<Array<{
  ID_OFICINA: number;
  LATITUDE: number;
  LONGITUDE: number;
  NOME_FANTASIA: string;
  ENDERECO: string;
  BAIRRO: string;
  CIDADE: string;
  ESTADO: string;
  NUMERO: string;
  CEP: string;
  CNPJ: string;
  TELEFONE: string;
  distance: number;
}>> {
  const query = `
    SELECT DISTINCT ON (ce."id_oficina")
      ce."id_oficina" AS "ID_OFICINA",
      ce."latitude" AS "LATITUDE",
      ce."longitude" AS "LONGITUDE",
      ce."razao_social" AS "NOME_FANTASIA",
      CONCAT(ce."logradouro", ' ', ce."rua") AS "ENDERECO",
      ce."bairro" AS "BAIRRO",
      ce."cidade" AS "CIDADE",
      ce."estado" AS "ESTADO",
      ce."numero" AS "NUMERO",
      ce."cep" AS "CEP",
      ce."cnpj" AS "CNPJ",
      ce."telefone" AS "TELEFONE",
      (
        6371 * acos(
          cos(radians($2)) * cos(radians(ce."latitude")) *
          cos(radians(ce."longitude") - radians($3)) +
          sin(radians($2)) * sin(radians(ce."latitude"))
        )
      ) AS distance
    FROM "OFICINA_PORTAL"."COMMUNITIES" cm
    INNER JOIN "MAIN_REGISTER"."USUARIO_COMMUNITY" uc
      ON cm."CommunityID" = uc."id_community"
    INNER JOIN "MAIN_REGISTER"."USUARIO" us
      ON us."ID_USUARIO" = uc."id_usuario"
    INNER JOIN "dw"."cadastro_empresa" ce
      ON ce."id_oficina" = us."ID_OFICINA"
    WHERE cm."EmpresaSlug" = $1
      AND ce."longitude" IS NOT NULL
      AND ce."latitude" IS NOT NULL
      AND ce."status_receita" = 'ATIVA'
      AND (
        6371 * acos(
          cos(radians($2)) * cos(radians(ce."latitude")) *
          cos(radians(ce."longitude") - radians($3)) +
          sin(radians($2)) * sin(radians(ce."latitude"))
        )
      ) <= $4
    ORDER BY ce."id_oficina", distance ASC
  `;

  const results = await AppDataSourceSync.query(query, [
    empresaSlug,
    latitude,
    longitude,
    radiusKm,
  ]);

  return results;
}
```

### 6. `controllers/oficinaController.ts`

Novo handler para endpoint de debug:

```ts
static getCommunityNearbyOficinas = async (req: Request, res: Response) => {
  const { latitude, longitude, radiusKm, empresaSlug } = (req as any).validatedQuery;

  const oficinas = await OficinaService.getComunityNearbyOficinas(
    latitude, longitude, radiusKm, empresaSlug
  );

  return res.status(200).json({
    message: "Oficinas da comunidade encontradas.",
    data: oficinas,
    count: oficinas.length,
  });
};
```

### 7. `schemas/oficina.ts`

Novo schema para o endpoint de debug:

```ts
export const GetCommunityNearbyQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().positive().max(200).default(20),
  empresaSlug: z.string().min(1),
});
```

### 8. `routes/OficinaRoute.ts`

Registrar novo endpoint:

```ts
createDocumentedRoute(router, {
  method: "get",
  path: "/community-nearby",
  handler: OficinaController.getCommunityNearbyOficinas,
  basePath: "/oficina",
  schemas: { query: GetCommunityNearbyQuerySchema },
  // ...documentation
});
```

## Fluxo de Retorno do `linkCampanhaPromotor`

`CampanhaPromotorService.linkCampanhaPromotor` já retorna `CampanhaPromotor[]`. O `PromotorService.createPromotor` precisa capturar esse retorno para iterar:

```ts
let campanhaPromotores: CampanhaPromotor[] = [];
if (campanhaIds !== undefined) {
  campanhaPromotores = await this.linkCampanhaPromotor(campanhaIds, promotorSalvo.ID_PROMOTOR!, raio);
}

if (empresaSlug && promotorSalvo.LATITUDE && promotorSalvo.LONGITUDE && campanhaPromotores.length > 0) {
  await this.autoAssignRotas(promotorSalvo, campanhaPromotores, empresaSlug);
}
```

## Considerações de Performance

| Aspecto | Impacto | Mitigação |
|---------|---------|-----------|
| Query com 4 JOINs | Médio — depende do volume da comunidade | Índices já existem nas PKs/FKs |
| Haversine no WHERE | Baixo — PostgreSQL otimiza bem com filtros IS NOT NULL | Se necessário futuro: GiST index |
| Batch createRotas | Baixo — insert em batch, tipicamente < 100 registros | Já usa `saveMany` |
| Uma query por CAMPANHA_PROMOTOR | Baixo — tipicamente 1-3 campanhas por promotor | Aceitável para MVP |

## Diagrama de Sequência

```
Frontend          Controller           PromotorService        CampanhaPromotorSvc    OficinaService     RotaService
   │                  │                      │                       │                    │                 │
   │ POST /promotor   │                      │                       │                    │                 │
   │ {EMPRESA_SLUG}   │                      │                       │                    │                 │
   │─────────────────▶│                      │                       │                    │                 │
   │                  │  createPromotor()     │                       │                    │                 │
   │                  │─────────────────────▶│                       │                    │                 │
   │                  │                      │ getLatLongByCep()      │                    │                 │
   │                  │                      │──────┐                 │                    │                 │
   │                  │                      │◀─────┘                 │                    │                 │
   │                  │                      │ save(promotor)         │                    │                 │
   │                  │                      │──────┐                 │                    │                 │
   │                  │                      │◀─────┘                 │                    │                 │
   │                  │                      │ linkCampanhaPromotor() │                    │                 │
   │                  │                      │──────────────────────▶│                    │                 │
   │                  │                      │◀──────────────────────│ CampanhaPromotor[] │                 │
   │                  │                      │                       │                    │                 │
   │                  │                      │ autoAssignRotas()      │                    │                 │
   │                  │                      │──────────────────────────────────────────▶│                 │
   │                  │                      │                       │  getComunityNearby │                 │
   │                  │                      │◀──────────────────────────────────────────│ oficinas[]       │
   │                  │                      │                       │                    │                 │
   │                  │                      │─────────────────────────────────────────────────────────────▶│
   │                  │                      │                       │                    │  createRotas()  │
   │                  │                      │◀─────────────────────────────────────────────────────────────│
   │                  │                      │                       │                    │                 │
   │                  │◀─────────────────────│ promotor              │                    │                 │
   │◀─────────────────│ 201 { data }         │                       │                    │                 │
```

## Edge Cases

| Caso | Comportamento |
|------|---------------|
| CEP inválido (sem lat/long) | Promotor criado, auto-assign ignorado, log warning |
| `EMPRESA_SLUG` não enviado | Promotor criado normalmente, sem auto-assign |
| Nenhuma oficina encontrada no raio | Promotor criado, nenhuma rota criada, log info |
| Comunidade sem membros | Query retorna vazio, mesmo comportamento acima |
| `ID_CAMPANHA` não enviado | Sem CAMPANHA_PROMOTOR, sem auto-assign |
| Query de oficinas falha (DB error) | Promotor criado, erro logado, rota não criada |
| Oficina duplicada na comunidade | `DISTINCT ON` garante unicidade |
