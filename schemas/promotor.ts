import { z } from 'zod';

/**
 * Promotor entity schema
 */
export const PromotorSchema = z.object({
  ID_PROMOTOR: z.number(),
  NOME: z.string(),
  EMAIL: z.string().email().optional(),
  CPF: z.string().optional(),
  SENHA: z.string().optional(),
  ID_CLIENT: z.number().optional(),
  CREATED_BY: z.number().optional(),
  CREATED_AT: z.date().optional(),
  UPDATED_AT: z.date().optional(),
});

/**
 * Create promotor request schema
 */
export const CreatePromotorSchema = z.object({
  NOME: z.string().min(1, 'NOME é obrigatório'),
  EMAIL: z.string().email('Email inválido').optional(),
  CPF: z.string().min(11, 'CPF deve ter pelo menos 11 caracteres').max(14, 'CPF deve ter no máximo 14 caracteres').optional(),
  SENHA: z.string().min(6, 'SENHA deve ter pelo menos 6 caracteres').optional(),
  ID_CLIENT: z.number().optional(),
  CREATED_BY: z.number().optional(),
  ID_CAMPANHA: z.union([z.number(), z.array(z.number())]).optional(),
});

/**
 * Update promotor request schema
 */
export const UpdatePromotorSchema = z.object({
  NOME: z.string().min(1).optional(),
  EMAIL: z.string().email('Email inválido').optional(),
  CPF: z.string().min(11, 'CPF deve ter pelo menos 11 caracteres').max(14, 'CPF deve ter no máximo 14 caracteres').optional(),
  SENHA: z.string().min(6, 'SENHA deve ter pelo menos 6 caracteres').optional(),
  ID_CLIENT: z.number().optional(),
  CREATED_BY: z.number().optional(),
});

/**
 * Promotor ID params schema
 */
export const PromotorIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * Create promotor response schema
 */
export const CreatePromotorResponseSchema = z.object({
  message: z.string(),
  data: PromotorSchema,
});

/**
 * Update promotor response schema
 */
export const UpdatePromotorResponseSchema = z.object({
  message: z.string(),
  data: PromotorSchema,
});

/**
 * Delete promotor response schema
 */
export const DeletePromotorResponseSchema = z.object({
  message: z.string(),
  data: PromotorSchema,
});

/**
 * Login promotor request schema
 */
export const LoginPromotorSchema = z.object({
  EMAIL: z.string().email('Email inválido'),
  SENHA: z.string().min(1, 'SENHA é obrigatória'),
});

/**
 * Login promotor response schema
 */
export const LoginPromotorResponseSchema = z.object({
  message: z.string(),
  token: z.string(),
  promotor: PromotorSchema.omit({ SENHA: true }),
});

/**
 * Promotor without password schema
 */
export const PromotorWithoutPasswordSchema = PromotorSchema.omit({ SENHA: true });

/**
 * Get all promotores response schema
 */
export const GetAllPromotoresResponseSchema = z.object({
  message: z.string(),
  data: z.array(PromotorWithoutPasswordSchema),
});

/**
 * Get promotor by ID response schema
 */
export const GetPromotorByIdResponseSchema = z.object({
  message: z.string(),
  data: PromotorWithoutPasswordSchema,
});

/**
 * Link campanha-promotor request schema
 */
export const LinkCampanhaPromotorSchema = z.object({
  ID_CAMPANHA: z.union([z.number(), z.array(z.number())]),
  ID_PROMOTOR: z.number(),
});

/**
 * Link campanha-promotor response schema
 */
export const LinkCampanhaPromotorResponseSchema = z.object({
  message: z.string(),
  data: z.object({
    created: z.number(),
    relationships: z.array(z.object({
      ID_CAMPANHA_PROMOTOR: z.number().optional(),
      ID_CAMPANHA: z.number().optional(),
      ID_PROMOTOR: z.number().optional(),
    })),
  }),
});
