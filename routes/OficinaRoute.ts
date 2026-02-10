import { Router } from "express";
import OficinaController from "../controllers/oficinaController";
import { createDocumentedRoute } from "../utils/routeDocumentation";
import { authMiddleware } from "../middlewares/authMiddleware";
import {
  GetOficinasByLocationQuerySchema,
  GetOficinasByLocationResponseSchema,
} from "../schemas/oficina";
import { ErrorResponseSchema } from "../schemas/common";

const router = Router();

// Get nearby oficinas by latitude and longitude
createDocumentedRoute(router, {
  method: "get",
  path: "/nearby",
  handler: OficinaController.getNearbyOficinas,
  basePath: "/oficina",
  middlewares: [authMiddleware],
  schemas: {
    query: GetOficinasByLocationQuerySchema,
  },
  documentation: {
    tags: ["Oficina"],
    summary: "Get nearby oficinas by geolocation",
    description:
      "Returns the nearest oficinas based on latitude and longitude coordinates. " +
      "Uses the Haversine formula to calculate distances. " +
      "Returns up to 40 results by default (customizable via limit parameter).",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "Oficinas found successfully",
        schema: GetOficinasByLocationResponseSchema,
      },
      400: {
        description: "Bad request - validation error",
        schema: ErrorResponseSchema,
      },
      401: {
        description: "Unauthorized - token missing or invalid",
        schema: ErrorResponseSchema,
      },
      500: {
        description: "Internal server error",
        schema: ErrorResponseSchema,
      },
    },
  },
});

export default router;
