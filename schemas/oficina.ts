import { z } from 'zod';

/**
 * Query schema for getting oficinas by geolocation
 */
export const GetOficinasByLocationQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  limit: z.coerce.number().int().positive().max(100).default(40).optional(),
});

/**
 * Oficina schema (simplified for API response)
 */
export const OficinaSchema = z.object({
  ID_OFICINA: z.number(),
  NOME_FANTASIA: z.string().optional(),
  RAZAO_SOCIAL: z.string().optional(),
  CNPJ: z.string().optional(),
  TELEFONE: z.string().optional(),
  EMAIL_COMERCIAL: z.string().optional(),
  ENDERECO: z.string().optional(),
  BAIRRO: z.string().optional(),
  NUMERO: z.string().optional(),
  ESTADO: z.string().optional(),
  CIDADE: z.string().optional(),
  CEP: z.string().optional(),
  COMPLEMENTO: z.string().optional(),
  LATITUDE: z.string().optional(),
  LONGITUDE: z.string().optional(),
  ATIVO: z.string().optional(),
  STATUS: z.string().optional(),
  distance: z.number().optional(), // Distance in kilometers
});

/**
 * Get oficinas by location response schema
 */
export const GetOficinasByLocationResponseSchema = z.object({
  message: z.string(),
  data: z.array(OficinaSchema),
  count: z.number(),
});
