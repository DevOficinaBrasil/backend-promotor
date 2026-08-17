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
    // Dono do link, para a saudação da tela inicial. Só nesta resposta.
    usuarioNome: z.string().nullable(),
    promotorNome: z.string().nullable(),
    empresaNome: z.string().nullable(),
    // URL absoluta já montada a partir de COMMUNITIES.Icon (chave do bucket).
    empresaLogoUrl: z.string().nullable(),
    endereco: EnderecoOficinaSchema,
  }),
});

/**
 * GET /visita/{token} - already-confirmed response
 *
 * Carries no JWT: there is no remaining action to authorize. It does carry
 * `promotorNome`, a empresa e `endereco` so the confirmed screen can restate
 * who is coming and which address was confirmed, rather than only the date.
 */
export const ExchangeAlreadyConfirmedResponseSchema = z.object({
  message: z.string(),
  data: z.object({
    state: z.literal('ALREADY_CONFIRMED'),
    oficinaNome: z.string().nullable(),
    promotorNome: z.string().nullable(),
    empresaNome: z.string().nullable(),
    empresaLogoUrl: z.string().nullable(),
    endereco: EnderecoOficinaSchema,
    confirmadoEm: z.string().datetime().nullable(),
  }),
});

export const ExchangeResponseSchema = z.union([
  ExchangePendingResponseSchema,
  ExchangeAlreadyConfirmedResponseSchema,
]);

/**
 * GET /visita/{token} - 410 (link expirado)
 *
 * Envelope de erro padrão mais `data` com a empresa do convite: a tela de
 * expirado diz que a empresa entra em contato de novo, e sem isso a copy
 * atribuiria o contato à Oficina Brasil. Os 410 das rotas autenticadas
 * (`/confirmar`, `/endereco`) seguem sem `data` — ali a empresa não foi
 * resolvida.
 */
export const ExchangeExpiredResponseSchema = VisitaErrorResponseSchema.extend({
  data: z
    .object({
      empresaNome: z.string().nullable(),
      empresaLogoUrl: z.string().nullable(),
    })
    .optional(),
});

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
