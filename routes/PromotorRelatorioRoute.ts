import { Router } from "express";
import { z } from "zod";
import { createDocumentedRoute } from "../utils/routeDocumentation";
import { adminAuthMiddleware } from "../middlewares/adminAuthMiddleware";
import { PromotorReportController } from "../controllers/promotorReportController";

const router = Router();

// Mesma convenção de AdminDisparoRoute.ts: autenticação no nível do router,
// antes de qualquer validação zod (L-016, SPEC_DEVIATION documentada lá).
router.use(adminAuthMiddleware);

const IdClienteParams = z.object({ idCliente: z.coerce.number().int().positive() });
const GerarQuery = z.object({
  inicio: z.string().min(1).optional(),
  fim: z.string().min(1).optional(),
  enviarEmail: z.enum(["true", "false"]).optional(),
});

createDocumentedRoute(router, {
  method: "post",
  path: "/promotor-relatorio/:idCliente/gerar",
  basePath: "/admin",
  schemas: { params: IdClienteParams, query: GerarQuery },
  handler: PromotorReportController.gerar,
  documentation: {
    tags: ["Admin"],
    summary: "Gera (e opcionalmente envia) o relatório semanal de promotores de um cliente, sob demanda",
    description:
      'Query opcional: inicio/fim (ISO date, sempre juntos) pra período customizado; sem eles, usa a mesma janela de 7 dias do cron. enviarEmail=false só gera e retorna o PDF, sem enviar e-mail. Resposta de sucesso: PDF binário (application/pdf).',
    security: [{ bearerAuth: [] }],
    responses: {
      200: { description: "PDF do relatório" },
      400: { description: "Período inválido" },
      401: { description: "Sem token, token inválido ou expirado" },
      403: { description: "Token válido sem IS_ADMIN" },
      404: { description: 'Cliente inexistente ou sem o módulo "promotores" habilitado' },
      500: { description: "Erro ao gerar o relatório" },
      502: { description: "Falha ao consultar o backend-ob-ads" },
    },
  },
});

export default router;
