import { z } from 'zod';

/**
 * Tipo Pergunta enum
 */
export const TipoPerguntaEnum = z.enum([
  'String', 
  'Integer', 
  'Boolean', 
  'Date',
  'Float',
  'Image',
]);

/**
 * CampanhaPerguntas entity schema
 */
export const CampanhaPerguntasSchema = z.object({
  ID_PERGUNTAS: z.number(),
  ID_CAMPANHA: z.number().optional(),
  PERGUNTA: z.string().optional(),
  TIPO: TipoPerguntaEnum.optional(),
  CREATED_AT: z.date().optional(),
  UPDATED_AT: z.date().optional(),
});

/**
 * Create campanha perguntas request schema
 */
export const CreateCampanhaPerguntasSchema = z.object({
  ID_CAMPANHA: z.number().int().positive(),
  PERGUNTA: z.string().min(1, 'PERGUNTA é obrigatória').max(500),
  TIPO: TipoPerguntaEnum,
});

/**
 * Update campanha perguntas request schema
 */
export const UpdateCampanhaPerguntasSchema = z.object({
  ID_CAMPANHA: z.number().int().positive().optional(),
  PERGUNTA: z.string().min(1).max(500).optional(),
  TIPO: TipoPerguntaEnum.optional(),
});

/**
 * Campanha Perguntas ID params schema
 */
export const CampanhaPerguntasIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * Create campanha perguntas response schema
 */
export const CreateCampanhaPerguntasResponseSchema = z.object({
  message: z.string(),
  data: CampanhaPerguntasSchema,
});

/**
 * Update campanha perguntas response schema
 */
export const UpdateCampanhaPerguntasResponseSchema = z.object({
  message: z.string(),
  data: CampanhaPerguntasSchema,
});

/**
 * Delete campanha perguntas response schema
 */
export const DeleteCampanhaPerguntasResponseSchema = z.object({
  message: z.string(),
  data: CampanhaPerguntasSchema,
});

/**
 * Get all campanha perguntas response schema
 */
export const GetAllCampanhaPerguntasResponseSchema = z.object({
  message: z.string(),
  data: z.array(CampanhaPerguntasSchema),
});

/**
 * Get campanha perguntas by ID response schema
 */
export const GetCampanhaPerguntasByIdResponseSchema = z.object({
  message: z.string(),
  data: CampanhaPerguntasSchema,
});
