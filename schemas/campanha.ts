import { z } from 'zod';

/**
 * Campanha entity schema
 */
export const CampanhaSchema = z.object({
  ID: z.number(),
  NOME: z.string(),
  OBJETIVO: z.string().optional(),
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
  OBJETIVO: z.string().optional(),
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
  OBJETIVO: z.string().optional(),
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
 * Client ID params schema
 */
export const ClientIdParamsSchema = z.object({
  clientId: z.coerce.number().int().positive(),
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

/**
 * Delete campanha response schema
 */
export const DeleteCampanhaResponseSchema = z.object({
  message: z.string(),
  data: CampanhaSchema,
});

/**
 * Get active campanha query schema
 */
export const GetCampanhaAtivaQuerySchema = z.object({
  ID_PROMOTOR: z.coerce.number().int().positive(),
  datetime: z.string().datetime().optional(),
});

/**
 * Oficina schema for active campanha
 */
export const OficinaSchema = z.object({
  ID_OFICINA: z.number(),
  NOME: z.string().optional(),
  RAZAO_SOCIAL: z.string().optional(),
  CNPJ: z.string().optional(),
  EMAIL: z.string().optional(),
  TELEFONE: z.string().optional(),
  ENDERECO: z.string().optional(),
  BAIRRO: z.string().optional(),
  NUMERO: z.string().optional(),
  CIDADE: z.string().optional(),
  ESTADO: z.string().optional(),
  CEP: z.string().optional(),
  LOCALIZACAO: z.string().optional(),
  ATIVO: z.string().optional(),
  CREATED_AT: z.string().optional(),
  UPDATED_AT: z.string().optional(),
});

/**
 * RotaPromotor schema for active campanha
 */
export const RotaPromotorSchema = z.object({
  ID_ROTA_PROMOTOR: z.number(),
  ID_OFICINA: z.number().optional(),
  ID_CAMPANHA_PROMOTOR: z.number().optional(),
  STATUS: z.string().optional(),
  SUCCESS: z.boolean().optional(),
  CHECKIN_TIME: z.string().optional(),
  DONE_AT: z.string().optional(),
  OBS: z.string().optional(),
  REDIRECT: z.string().optional(),
  CREATED_BY: z.number().optional(),
  CREATED_AT: z.string().optional(),
  UPDATED_AT: z.string().optional(),
  DELETED_AT: z.string().optional(),
  oficina: OficinaSchema.optional(),
});

/**
 * Campanha Ativa schema with rotas
 */
export const CampanhaAtivaSchema = z.object({
  ID_CAMPANHA: z.number(),
  NOME: z.string(),
  OBJETIVO: z.string().optional(),
  ID_CLIENT: z.number().optional(),
  START_TIME: z.string().optional(),
  END_TIME: z.string().optional(),
  CREATED_BY: z.number().optional(),
  CREATED_AT: z.string().optional(),
  UPDATED_AT: z.string().optional(),
  rotas: z.array(RotaPromotorSchema),
});

/**
 * Get campanha ativa response schema
 */
export const GetCampanhaAtivaResponseSchema = z.object({
  message: z.string(),
  data: CampanhaAtivaSchema.nullable(),
});

/**
 * Promotor schema without password for campanha relationships
 */
export const PromotorWithoutPasswordSchema = z.object({
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
 * CampanhaPromotor schema
 */
export const CampanhaPromotorSchema = z.object({
  ID_CAMPANHA_PROMOTOR: z.number(),
  ID_CAMPANHA: z.number().optional(),
  ID_PROMOTOR: z.number().optional(),
  CREATED_AT: z.date().optional(),
  UPDATED_AT: z.date().optional(),
  promotor: PromotorWithoutPasswordSchema.optional(),
});

/**
 * CampanhaPergunta schema (simplified)
 */
export const CampanhaPerguntaSchema = z.object({
  ID_PERGUNTAS: z.number(),
  ID_CAMPANHA: z.number().optional(),
  TIPO: z.string().optional(),
  PERGUNTA: z.string().optional(),
  CREATED_AT: z.date().optional(),
  UPDATED_AT: z.date().optional(),
});

/**
 * Campanha with relationships schema
 */
export const CampanhaWithRelationsSchema = z.object({
  ID_CAMPANHA: z.number(),
  NOME: z.string(),
  OBJETIVO: z.string().optional(),
  ID_CLIENT: z.number().optional(),
  START_TIME: z.date().optional(),
  END_TIME: z.date().optional(),
  CREATED_BY: z.number().optional(),
  CREATED_AT: z.date().optional(),
  UPDATED_AT: z.date().optional(),
  campanhaPromotores: z.array(CampanhaPromotorSchema).optional(),
  campanhaPerguntas: z.array(CampanhaPerguntaSchema).optional(),
});

/**
 * Get all campanhas response schema
 */
export const GetAllCampanhasResponseSchema = z.object({
  message: z.string(),
  data: z.array(CampanhaSchema),
});

/**
 * Get campanha by ID response schema
 */
export const GetCampanhaByIdResponseSchema = z.object({
  message: z.string(),
  data: CampanhaWithRelationsSchema,
});

/**
 * Get campanhas by client ID response schema
 */
export const GetCampanhasByClientIdResponseSchema = z.object({
  message: z.string(),
  data: z.array(CampanhaWithRelationsSchema),
});
