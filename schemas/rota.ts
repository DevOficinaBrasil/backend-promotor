import { z } from 'zod';

/**
 * Status Rota enum schema
 * Note: 'EM ANDANMENTO' preserves the database typo for compatibility
 */
export const StatusRotaSchema = z.enum([
  'BACKLOG',
  'A CAMINHO',
  'EM ANDANMENTO', // Database has typo - kept for compatibility
  'FINALIZADO',
  'CANCELADO',
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
  OBS: z.string().max(1000, 'OBS deve ter no máximo 1000 caracteres').optional(),
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
  OBEJTIVO: z.string().optional(),
  PONTO_INICIAL: z.string().optional(),
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
  CREATED_BY: z.number().optional(),
  CREATED_AT: z.date().optional(),
  UPDATED_AT: z.date().optional(),
  DELETED_AT: z.date().optional(),
  campanhaPromotor: CampanhaPromotorSimplifiedSchema.optional(),
  campanhaResults: z.array(CampanhaResultsSimplifiedSchema).optional(),
});

/**
 * Get rota by ID response schema
 */
export const GetRotaByIdResponseSchema = z.object({
  message: z.string(),
  data: RotaWithRelationsSchema,
});
