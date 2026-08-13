import { z } from "zod";

export const FiltroSegmentacaoSchema = z.object({
  if: z.record(z.unknown()),
  then: z.object({
    decision: z.enum(["include", "exclude"]),
    reason: z.string().optional(),
  }),
  default: z.object({
    decision: z.enum(["include", "exclude"]),
    reason: z.string().optional(),
  }),
}).passthrough();

export const UpdateFiltroSegmentacaoSchema = z.object({
  filtroSegmentacao: FiltroSegmentacaoSchema.nullable(),
});

export const PreviewSegmentacaoSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(20),
});

export const PreviewOficinasSegmentadasSchema = z.object({
  idCampanha: z.number().int().positive(),
  raio: z.number().positive(),
  filtroSegmentacao: FiltroSegmentacaoSchema,
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  CEP: z.string().max(30).optional(),
}).refine(
  (data) => (data.latitude !== undefined && data.longitude !== undefined) || data.CEP !== undefined,
  { message: "Informe latitude + longitude ou CEP para referência de localização." }
);

export const CampanhaIdParamsSchema = z.object({
  idCampanha: z.coerce.number().int().positive(),
});

export const CampanhaPromotorIdParamsSchema = z.object({
  idCampanhaPromotor: z.coerce.number().int().positive(),
});
