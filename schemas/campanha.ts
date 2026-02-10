import { z } from 'zod';

/**
 * Campanha entity schema
 */
export const CampanhaSchema = z.object({
  ID: z.number(),
  NOME: z.string(),
  OBEJTIVO: z.string().optional(),
  PONTO_INICIAL: z.string().optional(),
  ID_CLIENT: z.number().optional(),
  START_TIME: z.date().optional(),
  END_TIME: z.date().optional(),
  CREATED_BY: z.string().optional(),
  CREATED_AT: z.date().optional(),
  UPDATED_AT: z.date().optional(),
});

/**
 * Create campanha request schema
 */
export const CreateCampanhaSchema = z.object({
  NOME: z.string().min(1, 'NOME é obrigatório'),
  OBEJTIVO: z.string().optional(),
  PONTO_INICIAL: z.string().optional(),
  ID_CLIENT: z.number().optional(),
  START_TIME: z.string().datetime().optional().or(z.date().optional()),
  END_TIME: z.string().datetime().optional().or(z.date().optional()),
  CREATED_BY: z.string().optional(),
});

/**
 * Update campanha request schema
 */
export const UpdateCampanhaSchema = z.object({
  NOME: z.string().min(1).optional(),
  OBEJTIVO: z.string().optional(),
  PONTO_INICIAL: z.string().optional(),
  ID_CLIENT: z.number().optional(),
  START_TIME: z.string().datetime().optional().or(z.date().optional()),
  END_TIME: z.string().datetime().optional().or(z.date().optional()),
  CREATED_BY: z.string().optional(),
});

/**
 * Campanha ID params schema
 */
export const CampanhaIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * Create campanha response schema
 */
export const CreateCampanhaResponseSchema = z.object({
  message: z.string(),
  data: CampanhaSchema,
});

/**
 * Update campanha response schema
 */
export const UpdateCampanhaResponseSchema = z.object({
  message: z.string(),
  data: CampanhaSchema,
});
