import { z } from 'zod';
import { FiltroSegmentacaoSchema } from './segmentacao';

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

/**
 * Body schema for listing ALL community oficinas, optionally matching a
 * segmentation filter (no radius filter). Mirrors the filtroSegmentacao
 * contract used by the other segmentação endpoints (see schemas/segmentacao.ts).
 * When omitted (or null), every active community oficina is returned.
 */
export const GetCommunityAllBodySchema = z.object({
  empresaSlug: z.string().min(1),
  filtroSegmentacao: FiltroSegmentacaoSchema.nullable().optional(),
});

export const GetCommunityAllResponseSchema = z.object({
  message: z.string(),
  data: z.array(OficinaSchema),
  count: z.number(),
});

/**
 * Query schema for counting ALL active community oficinas (no radius filter,
 * no segmentation filter — just the total for the community).
 */
export const GetCommunityCountQuerySchema = z.object({
  empresaSlug: z.string().min(1),
});

export const GetCommunityCountResponseSchema = z.object({
  message: z.string(),
  empresaSlug: z.string(),
  count: z.number(),
});

/**
 * Body schema for importing oficinas from a planilha (.xlsx/.csv). Validated
 * manually in the controller (not via createDocumentedRoute's `schemas.body`)
 * because the request is multipart/form-data: the body-validation middleware
 * runs before custom middlewares, so it would see `req.body` before `multer`
 * has parsed the multipart stream and populated it.
 */
export const ImportOficinasBodySchema = z.object({
  ID_CAMPANHA: z.coerce.number().int().positive(),
});

const ErroLinhaImportSchema = z.object({
  linha: z.number(),
  cnpj: z.string().optional(),
  motivo: z.string(),
});

export const ImportOficinasResponseSchema = z.object({
  message: z.string(),
  data: z.object({
    total_linhas: z.number(),
    oficinas_criadas: z.number(),
    oficinas_vinculadas_existentes: z.number(),
    ja_na_comunidade: z.number(),
    rotas_criadas: z.number(),
    rotas_sem_promotor_disponivel: z.number(),
    campanhas_ativas_consideradas: z.number(),
    erros: z.array(ErroLinhaImportSchema),
  }),
});

/**
 * Teto de linhas de um lote de importação. Mesmo valor de
 * `LIMITE_LINHAS_DE_DADOS` em `service/oficinaImportService.ts` — repetido aqui
 * porque o schema roda antes do serviço e precisa recusar o corpo grande demais
 * sem carregar o serviço.
 */
export const IMPORT_STREAM_MAX_LINHAS = 5000;

/**
 * Uma linha de oficina já mapeada pelo "de-para" feito no cliente. Só CNPJ e
 * CEP são obrigatórios: o CNPJ é a chave de deduplicação e o CEP é a única
 * entrada da geocodificação. Os demais campos só entram quando a oficina é
 * inédita e precisa ser criada.
 *
 * Nenhum nome nem ordem de coluna chega aqui — é justamente isso que o
 * "de-para" resolve no browser.
 */
export const LinhaOficinaImportSchema = z.object({
  linha: z.coerce.number().int().positive().optional(),
  nomeOficina: z.string().optional(),
  cnpj: z.string().trim().min(1),
  cep: z.string().trim().min(1),
  endereco: z.string().optional(),
  numero: z.string().optional(),
  bairro: z.string().optional(),
  estado: z.string().optional(),
  cidade: z.string().optional(),
});

export const ImportOficinasStreamBodySchema = z.object({
  ID_CAMPANHA: z.coerce.number().int().positive(),
  oficinas: z.array(LinhaOficinaImportSchema).min(1).max(IMPORT_STREAM_MAX_LINHAS),
});

/**
 * Forma de cada evento NDJSON da resposta em stream. Serve à documentação da
 * rota; o corpo em si é escrito linha a linha, não validado na saída.
 */
export const ImportStreamEventoSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('inicio'), total: z.number() }),
  z.object({
    tipo: z.literal('progresso'),
    progresso: z.object({
      processadas: z.number(),
      total: z.number(),
      oficinas_criadas: z.number(),
      oficinas_vinculadas_existentes: z.number(),
      ja_na_comunidade: z.number(),
      erros: z.number(),
    }),
  }),
  z.object({
    tipo: z.literal('fim'),
    resultado: ImportOficinasResponseSchema.shape.data,
  }),
  z.object({ tipo: z.literal('erro'), mensagem: z.string() }),
]);
