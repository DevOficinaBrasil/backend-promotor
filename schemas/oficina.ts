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
 * Note: LATITUDE and LONGITUDE are stored as strings in the database
 * but are used as numbers for calculations
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
  LATITUDE: z.string().optional(), // Stored as string in DB
  LONGITUDE: z.string().optional(), // Stored as string in DB
  ATIVO: z.string().optional(),
  STATUS: z.string().optional(),
  distance: z.number().optional(), // Distance in kilometers (calculated)
  flag_engajamento: z.string().optional(), // From DuckDB
  flag_sentimento: z.string().optional(), // From DuckDB
  flag_treinamento: z.string().optional(), // From DuckDB
  cor_icone: z.string().optional(), // From DuckDB
});

/**
 * Get oficinas by location response schema
 */
export const GetOficinasByLocationResponseSchema = z.object({
  message: z.string(),
  data: z.array(OficinaSchema),
  count: z.number(),
});

export const GetCommunityNearbyQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().positive().max(200).default(20),
  empresaSlug: z.string().min(1),
});

export const GetCommunityNearbyResponseSchema = z.object({
  message: z.string(),
  data: z.array(OficinaSchema),
  count: z.number(),
});
