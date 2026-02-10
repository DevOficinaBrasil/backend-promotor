import { z } from 'zod';

/**
 * Common pagination query schema
 */
export const PaginateQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1).optional(),
  limit: z.coerce.number().int().positive().max(100).default(10).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc').optional(),
});

/**
 * Common error response schema
 */
export const ErrorResponseSchema = z.object({
  error: z.string().optional(),
  message: z.string(),
  details: z.array(z.object({
    field: z.string(),
    message: z.string(),
    code: z.string(),
  })).optional(),
});

/**
 * Common success response schema
 */
export const SuccessResponseSchema = z.object({
  status: z.boolean().default(true),
  message: z.string(),
});
