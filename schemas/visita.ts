import { z } from 'zod';
import { ErrorResponseSchema } from './common';

/**
 * Every /visita failure state (TOKEN_INVALID, EXPIRED, VALIDATION_ERROR,
 * RATE_LIMITED, address-write failure) travels in the shared
 * `{ message, error, details? }` envelope used across this API.
 */
export const VisitaErrorResponseSchema = ErrorResponseSchema;

/**
 * Link token path param for GET /visita/{token}
 */
export const VisitaTokenParamsSchema = z.object({
  token: z.string().min(1, 'Token é obrigatório'),
});

/**
 * The workshop's registered address, as returned to the confirmation page.
 * Every field may be null - the registry has incomplete records.
 */
export const EnderecoOficinaSchema = z.object({
  ENDERECO: z.string().nullable(),
  NUMERO: z.string().nullable(),
  COMPLEMENTO: z.string().nullable(),
  BAIRRO: z.string().nullable(),
  CIDADE: z.string().nullable(),
  ESTADO: z.string().nullable(),
  CEP: z.string().nullable(),
});

/**
 * Address correction body for PUT /visita/endereco
 *
 * `.strict()` is the allowlist: any key outside these seven - TELEFONE, CNPJ,
 * STATUS, ID_OFICINA, anything - fails validation and nothing is written.
 * Lengths mirror the MAIN_REGISTER.OFICINA columns they land on.
 */
export const UpdateEnderecoSchema = z
  .object({
    ENDERECO: z.string().max(200).nullable(),
    NUMERO: z.string().max(200).nullable(),
    COMPLEMENTO: z.string().max(150).nullable(),
    BAIRRO: z.string().max(200).nullable(),
    CIDADE: z.string().max(150).nullable(),
    ESTADO: z.string().max(50).nullable(),
    CEP: z.string().max(30).nullable(),
  })
  .strict();

/**
 * GET /visita/{token} - pending response (workshop name, address, JWT)
 */
export const ExchangePendingResponseSchema = z.object({
  message: z.string(),
  data: z.object({
    state: z.literal('PENDING'),
    jwt: z.string(),
    oficinaNome: z.string().nullable(),
    promotorNome: z.string().nullable(),
    empresaNome: z.string().nullable(),
    endereco: EnderecoOficinaSchema,
  }),
});

/**
 * GET /visita/{token} - already-confirmed response (no JWT, no actions)
 */
export const ExchangeAlreadyConfirmedResponseSchema = z.object({
  message: z.string(),
  data: z.object({
    state: z.literal('ALREADY_CONFIRMED'),
    oficinaNome: z.string().nullable(),
    confirmadoEm: z.string().datetime().nullable(),
  }),
});

export const ExchangeResponseSchema = z.union([
  ExchangePendingResponseSchema,
  ExchangeAlreadyConfirmedResponseSchema,
]);

/**
 * POST /visita/confirmar - success response
 */
export const ConfirmarResponseSchema = z.object({
  message: z.string(),
  data: z.object({
    state: z.literal('CONFIRMED'),
    confirmadoEm: z.string().datetime(),
  }),
});

/**
 * PUT /visita/endereco - success response (address corrected and visit confirmed)
 */
export const UpdateEnderecoResponseSchema = z.object({
  message: z.string(),
  data: z.object({
    state: z.literal('CONFIRMED'),
    confirmadoEm: z.string().datetime(),
    enderecoAtualizado: z.literal(true),
  }),
});
