
import { z } from 'zod';

/**
 * Status Rota enum schema
 * Note: 'EM ANDAMENTO' preserves the database typo for compatibility
 */
export const StatusRotaSchema = z.enum([
  'BACKLOG',
  'A CAMINHO',
  'EM ANDAMENTO', // Database has typo - kept for compatibility
  'FINALIZADO',
  'CANCELADO',
]);

/**
 * Redirect Rota enum schema
 */
export const RedirectRotaSchema = z.enum([
  'SAC',
  'VENDAS',
  'LOGÍSTICA',
]);

/**
 * Create rota(s) request schema
 * Receives ID_CAMPANHA_PROMOTOR and ID_OFICINA (or array of ID_OFICINA)
 */
export const CreateRotaSchema = z.object({
  ID_CAMPANHA_PROMOTOR: z.number().int().positive('ID_CAMPANHA_PROMOTOR deve ser um número positivo'),
  ID_OFICINA: z.union([
    z.number().int().positive('ID_OFICINA deve ser um número positivo'),
    z.array(z.number().int().positive('Cada ID_OFICINA deve ser um número positivo')),
  ]),
  CREATED_BY: z.number().int().positive().optional(),
});

/**
 * Create rota with campaign promoter request schema
 * Receives ID_PROMOTOR, ID_CAMPANHA and array of ID_OFICINA
 */
export const CreateRotaWithCampanhaPromotorSchema = z.object({
  ID_PROMOTOR: z.number().int().positive('ID_PROMOTOR deve ser um número positivo'),
  ID_CAMPANHA: z.number().int().positive('ID_CAMPANHA deve ser um número positivo'),
  ID_OFICINA: z.array(z.number().int().positive('Cada ID_OFICINA deve ser um número positivo')).min(1, 'Deve fornecer pelo menos uma oficina'),
  CREATED_BY: z.number().int().positive().optional(),
});

/**
 * Update workshops for a route request schema
 * Receives ID_CAMPANHA_PROMOTOR and array of ID_OFICINA
 */
export const UpdateRotaWorkshopsSchema = z.object({
  ID_CAMPANHA_PROMOTOR: z.number().int().positive('ID_CAMPANHA_PROMOTOR deve ser um número positivo'),
  ID_OFICINA: z.array(z.number().int().positive('Cada ID_OFICINA deve ser um número positivo')),
});

/**
 * Update rota options request schema
 * All fields are optional
 */
export const UpdateRotaOptionsSchema = z.object({
  STATUS: StatusRotaSchema.optional(),
  SUCCESS: z.boolean().optional(),
  CHECKIN_TIME: z.string().datetime().optional().or(z.date().optional()),
  DONE_AT: z.string().datetime().optional().or(z.date().optional()),
  OBS: z.string().optional(), // No length restriction - maps to TEXT column in database
  REDIRECT: RedirectRotaSchema.optional(),
});

/**
 * Rota ID params schema
 */
export const RotaIdParamsSchema = z.object({
  id: z.coerce.number().int().positive('ID_ROTA_PROMOTOR deve ser um número positivo'),
});

/**
 * Rota entity schema
 */
export const RotaSchema = z.object({
  ID_ROTA_PROMOTOR: z.number(),
  ID_OFICINA: z.number().optional(),
  ID_CAMPANHA_PROMOTOR: z.number().optional(),
  STATUS: StatusRotaSchema.optional(),
  SUCCESS: z.boolean().optional(),
  CHECKIN_TIME: z.date().optional(),
  DONE_AT: z.date().optional(),
  OBS: z.string().optional(),
  REDIRECT: RedirectRotaSchema.optional(),
  CREATED_BY: z.number().optional(),
  CREATED_AT: z.date().optional(),
  UPDATED_AT: z.date().optional(),
  DELETED_AT: z.date().optional(),
});

/**
 * Create rota response schema
 */
export const CreateRotaResponseSchema = z.object({
  message: z.string(),
  data: z.union([
    RotaSchema,
    z.array(RotaSchema),
  ]),
});

/**
 * Create rota with campaign promoter response schema
 */
export const CreateRotaWithCampanhaPromotorResponseSchema = z.object({
  message: z.string(),
  data: z.object({
    campanhaPromotor: z.object({
      ID_CAMPANHA_PROMOTOR: z.number(),
      ID_CAMPANHA: z.number(),
      ID_PROMOTOR: z.number(),
      CREATED_AT: z.date().optional(),
      UPDATED_AT: z.date().optional(),
    }),
    rotas: z.array(RotaSchema),
  }),
});

/**
 * Update rota workshops response schema
 */
export const UpdateRotaWorkshopsResponseSchema = z.object({
  message: z.string(),
  data: z.object({
    created: z.array(RotaSchema),
    deleted: z.array(z.number()),
  }),
});

/**
 * Update rota options response schema
 */
export const UpdateRotaOptionsResponseSchema = z.object({
  message: z.string(),
  data: RotaSchema,
});

/**
 * Campanha schema for rota relationships (simplified)
 */
export const CampanhaSimplifiedSchema = z.object({
  ID_CAMPANHA: z.number(),
  NOME: z.string(),
  OBJETIVO: z.string().optional(),
  ID_CLIENT: z.number().optional(),
  START_TIME: z.date().optional(),
  END_TIME: z.date().optional(),
  CREATED_BY: z.number().optional(),
  CREATED_AT: z.date().optional(),
  UPDATED_AT: z.date().optional(),
});

/**
 * Promotor schema without password for rota relationships
 */
export const PromotorSimplifiedSchema = z.object({
  ID_PROMOTOR: z.number(),
  NOME: z.string(),
  EMAIL: z.string().optional(),
  CPF: z.string().optional(),
  ID_CLIENT: z.number().optional(),
  CREATED_BY: z.number().optional(),
  CREATED_AT: z.date().optional(),
  UPDATED_AT: z.date().optional(),
});

/**
 * CampanhaPromotor schema for rota relationships
 */
export const CampanhaPromotorSimplifiedSchema = z.object({
  ID_CAMPANHA_PROMOTOR: z.number(),
  ID_CAMPANHA: z.number().optional(),
  ID_PROMOTOR: z.number().optional(),
  CREATED_AT: z.date().optional(),
  UPDATED_AT: z.date().optional(),
  campanha: CampanhaSimplifiedSchema.optional(),
  promotor: PromotorSimplifiedSchema.optional(),
});

/**
 * CampanhaResults schema (simplified)
 */
export const CampanhaResultsSimplifiedSchema = z.object({
  ID_CAMPANHA_RESULTS: z.number(),
  ID_ROTA_PROMOTOR: z.number().optional(),
  ID_CAMPANHA_PERGUNTAS: z.number().optional(),
  RESPOSTA: z.string().optional(),
  CREATED_AT: z.date().optional(),
  UPDATED_AT: z.date().optional(),
});

/**
 * Effective visit-confirmation status enum schema (NOTIF-19 / P2 AC1-2).
 * Mirrors entities/NotificacaoVisita.ts's StatusNotificacaoVisita — kept as
 * its own string enum here, matching this file's existing convention of not
 * importing entity enums directly (see StatusRotaSchema/RedirectRotaSchema).
 */
export const NotificacaoVisitaStatusSchema = z.enum([
  'PENDENTE',
  'ENVIADO',
  'FALHOU',
  'DISPENSADO',
  'CONFIRMADO',
  'EXPIRADO',
  'REAGENDADO',
]);

/**
 * Nested visit-confirmation status object surfaced on route reads
 * (NOTIF-19 / P2 AC1: dashboard/app SHALL include STATUS and CONFIRMADO_EM).
 * STATUS here is always the *effective* status (statusEfetivo()), not the
 * raw stored column.
 */
export const NotificacaoVisitaStatusInfoSchema = z.object({
  STATUS: NotificacaoVisitaStatusSchema,
  CONFIRMADO_EM: z.date().nullable().optional(),
});

/**
 * Rota with relationships schema
 */
export const RotaWithRelationsSchema = z.object({
  ID_ROTA_PROMOTOR: z.number(),
  ID_OFICINA: z.number().optional(),
  ID_CAMPANHA_PROMOTOR: z.number().optional(),
  STATUS: StatusRotaSchema.optional(),
  SUCCESS: z.boolean().optional(),
  CHECKIN_TIME: z.date().optional(),
  DONE_AT: z.date().optional(),
  OBS: z.string().optional(),
  REDIRECT: RedirectRotaSchema.optional(),
  CREATED_BY: z.number().optional(),
  CREATED_AT: z.date().optional(),
  UPDATED_AT: z.date().optional(),
  DELETED_AT: z.date().optional(),
  campanhaPromotor: CampanhaPromotorSimplifiedSchema.optional(),
  campanhaResults: z.array(CampanhaResultsSimplifiedSchema).optional(),
  notificacaoVisita: NotificacaoVisitaStatusInfoSchema.optional(),
});

/**
 * Get rota by ID response schema
 */
export const GetRotaByIdResponseSchema = z.object({
  message: z.string(),
  data: RotaWithRelationsSchema,
});

/**
 * Get geolocation by CEP request schema
 */
export const GetGeolocationByCepRequestSchema = z.object({
  cep: z.string().min(8, 'CEP deve ter pelo menos 8 dígitos'),
});

/**
 * Get geolocation by CEP response schema
 */
export const GetGeolocationByCepResponseSchema = z.object({
  message: z.string(),
  data: z.object({
    lat: z.number(),
    lng: z.number(),
  }).nullable(),
});

/**
 * Estratégia de ordenação enum schema
 */
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
  })).optional(),
});

/**
 * Optimize rota response schema
 */
export const OptimizeRotaResponseSchema = z.object({
  message: z.string(),
  data: z.object({
    ESTRATEGIA_ORDENACAO: EstrategiaOrdenacaoSchema,
    ID_OFICINA_INICIO: z.number(),
    ID_OFICINA_FIM: z.number(),
    distancia_total_km: z.number(),
    route_geometry: z.object({
      type: z.string(),
      coordinates: z.array(z.array(z.number())),
    }).nullable(),
    rotas: z.array(z.object({
      ID_ROTA_PROMOTOR: z.number(),
      ORDEM: z.number(),
      ID_OFICINA: z.number(),
    })),
  }),
});

/**
 * Reorder rotas response schema
 */
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

/**
 * POST /rota/reassign-by-address — reatribuir rotas após mudança de endereço
 */
export const ReassignByAddressSchema = z.object({
  CEP: z.string().min(8).max(10),
  ID_OFICINA: z.coerce.number().int().positive(),
});

const ReatribuicaoStatusSchema = z.enum([
  "reatribuida",
  "mantida_dentro_do_raio",
  "sem_promotor_disponivel",
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

/**
 * POST /rota/assign-oficina-community
 */
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
