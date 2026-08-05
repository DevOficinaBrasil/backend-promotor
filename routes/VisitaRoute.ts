import { Request, Response, Router } from "express";
import rateLimit from "express-rate-limit";
import VisitaController from "../controllers/visitaController";
import { createDocumentedRoute } from "../utils/routeDocumentation";
import { visitaAuthMiddleware, VisitaRequest } from "../middlewares/visitaAuthMiddleware";
import {
  ConfirmarResponseSchema,
  ExchangeResponseSchema,
  VisitaErrorResponseSchema,
  VisitaTokenParamsSchema,
} from "../schemas/visita";

const router = Router();

const JANELA_MS = 60 * 1000;
const LIMITE_POR_VISITA = 20;

const respostaLimite = (req: Request, res: Response) =>
  res.status(429).json({
    message: "Muitas tentativas. Aguarde um minuto.",
    error: "RATE_LIMITED",
  });

/**
 * Spec AC25: 20 requests/minute per *visit*, keyed on the link token.
 *
 * Deliberately not IP-keyed: app.ts sets no `trust proxy`, so req.ip resolves
 * to the ALB's address for every request behind the public endpoint - an
 * IP-keyed limiter would put all callers in one shared bucket and lock the
 * service out after 20 requests/minute in total.
 */
export const limitadorExchange = rateLimit({
  windowMs: JANELA_MS,
  limit: LIMITE_POR_VISITA,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => `visita-token:${req.params.token ?? ""}`,
  handler: respostaLimite,
});

/**
 * Same per-visit limit for the authenticated actions, keyed on the JWT's
 * ID_NOTIFICACAO_VISITA claim. Mounted after visitaAuthMiddleware so the claim
 * is available; an unauthenticated request is rejected before it ever reaches
 * a bucket.
 */
export const limitadorAcao = rateLimit({
  windowMs: JANELA_MS,
  limit: LIMITE_POR_VISITA,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) =>
    `visita-jwt:${(req as VisitaRequest).visitaJwt?.ID_NOTIFICACAO_VISITA ?? ""}`,
  handler: respostaLimite,
});

// Confirm the visit and that the displayed address is correct
createDocumentedRoute(router, {
  method: "post",
  path: "/confirmar",
  handler: VisitaController.confirmar,
  basePath: "/visita",
  middlewares: [visitaAuthMiddleware, limitadorAcao],
  documentation: {
    tags: ["Visita"],
    summary: "Confirm a scheduled visit",
    description:
      "Confirms the visit and that the workshop's registered address is correct. " +
      "Requires the visita:confirmar JWT returned by GET /visita/{token}. No request body.",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "Visit confirmed",
        schema: ConfirmarResponseSchema,
      },
      401: {
        description: "Unauthorized - JWT missing or malformed header",
        schema: VisitaErrorResponseSchema,
      },
      403: {
        description: "Forbidden - JWT invalid, expired or wrong scope",
        schema: VisitaErrorResponseSchema,
      },
      404: {
        description: "Visit no longer confirmable",
        schema: VisitaErrorResponseSchema,
      },
      409: {
        description: "Visit already confirmed",
        schema: VisitaErrorResponseSchema,
      },
      410: {
        description: "Link expired",
        schema: VisitaErrorResponseSchema,
      },
      429: {
        description: "Too many requests for this visit",
        schema: VisitaErrorResponseSchema,
      },
      500: {
        description: "Internal server error",
        schema: VisitaErrorResponseSchema,
      },
    },
  },
});

// Exchange the WhatsApp link token for a visit-scoped JWT
createDocumentedRoute(router, {
  method: "get",
  path: "/:token",
  handler: VisitaController.exchange,
  basePath: "/visita",
  middlewares: [limitadorExchange],
  schemas: {
    params: VisitaTokenParamsSchema,
  },
  documentation: {
    tags: ["Visita"],
    summary: "Exchange a visit link token for a short-lived JWT",
    description:
      "Public endpoint opened from the WhatsApp confirmation link. Returns the workshop name, " +
      "its current registered address and a 30-minute visita:confirmar JWT. " +
      "Re-exchangeable while the visit is live - only the confirmation itself is single-use. " +
      "No visit date is returned.",
    responses: {
      200: {
        description: "Visit pending confirmation, or already confirmed (no JWT issued)",
        schema: ExchangeResponseSchema,
      },
      404: {
        description: "Malformed or unrecognized token",
        schema: VisitaErrorResponseSchema,
      },
      410: {
        description: "Link expired",
        schema: VisitaErrorResponseSchema,
      },
      429: {
        description: "Too many requests for this visit",
        schema: VisitaErrorResponseSchema,
      },
      500: {
        description: "Internal server error",
        schema: VisitaErrorResponseSchema,
      },
    },
  },
});

export default router;
