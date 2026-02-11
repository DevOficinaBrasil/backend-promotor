import { z } from 'zod';

/**
 * CampanhaResults entity schema
 */
export const CampanhaResultsSchema = z.object({
  ID_CAMPANHA_RESULTS: z.number(),
  ID_ROTA: z.number().optional(),
  ID_PERGUNTA: z.number().optional(),
  RESPOSTA: z.string().optional(),
  CREATED_AT: z.date().optional(),
  UPDATED_AT: z.date().optional(),
});

/**
 * Create/Save campanha result request schema
 */
export const SaveCampanhaResultSchema = z.object({
  ID_ROTA: z.number({
    required_error: 'ID_ROTA é obrigatório',
    invalid_type_error: 'ID_ROTA deve ser um número',
  }),
  ID_PERGUNTA: z.number({
    required_error: 'ID_PERGUNTA é obrigatório',
    invalid_type_error: 'ID_PERGUNTA deve ser um número',
  }),
  RESPOSTA: z.string({
    required_error: 'RESPOSTA é obrigatória',
  }).min(1, 'RESPOSTA não pode estar vazia'),
});

/**
 * Update campanha result request schema
 */
export const UpdateCampanhaResultSchema = z.object({
  ID_ROTA: z.number().optional(),
  ID_PERGUNTA: z.number().optional(),
  RESPOSTA: z.string().optional(),
});

/**
 * CampanhaResults ID params schema
 */
export const CampanhaResultsIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * Response schemas
 */
export const SaveCampanhaResultResponseSchema = z.object({
  message: z.string(),
  data: CampanhaResultsSchema,
});

export const UpdateCampanhaResultResponseSchema = z.object({
  message: z.string(),
  data: CampanhaResultsSchema,
});

export const GetCampanhaResultResponseSchema = z.object({
  message: z.string(),
  data: CampanhaResultsSchema,
});

export const GetCampanhaResultsByRotaIdResponseSchema = z.object({
  message: z.string(),
  data: z.array(CampanhaResultsSchema),
});

export const GetCampanhaResultsByCampanhaIdResponseSchema = z.object({
  message: z.string(),
  data: z.array(CampanhaResultsSchema),
});
