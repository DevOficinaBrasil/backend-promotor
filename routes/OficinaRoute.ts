import { Router } from "express";
import OficinaController from "../controllers/oficinaController";
import { createDocumentedRoute } from "../utils/routeDocumentation";

import {
  GetOficinasByLocationQuerySchema,
  GetOficinasByLocationResponseSchema,
  GetCommunityNearbyQuerySchema,
  GetCommunityNearbyResponseSchema,
  GetCommunityAllQuerySchema,
  GetCommunityAllResponseSchema,
} from "../schemas/oficina";
import { ErrorResponseSchema } from "../schemas/common";

const router = Router();

// Get nearby oficinas by latitude and longitude
createDocumentedRoute(router, {
  method: "get",
  path: "/nearby",
  handler: OficinaController.getNearbyOficinas,
  basePath: "/oficina",
  middlewares: [],
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

// Get community nearby oficinas filtered by radius
createDocumentedRoute(router, {
  method: "get",
  path: "/community-nearby",
  handler: OficinaController.getCommunityNearbyOficinas,
  basePath: "/oficina",
  middlewares: [],
  schemas: {
    query: GetCommunityNearbyQuerySchema,
  },
  documentation: {
    tags: ["Oficina"],
    summary: "Get community nearby oficinas by geolocation and radius",
    description:
      "Returns oficinas from community members within a given radius. " +
      "Uses the Haversine formula to filter by distance. " +
      "Filters by EmpresaSlug to scope to a specific community.",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "Community oficinas found successfully",
        schema: GetCommunityNearbyResponseSchema,
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

// List ALL active community oficinas (no radius filter)
createDocumentedRoute(router, {
  method: "get",
  path: "/community-all",
  handler: OficinaController.getCommunityOficinas,
  basePath: "/oficina",
  middlewares: [],
  schemas: {
    query: GetCommunityAllQuerySchema,
  },
  documentation: {
    tags: ["Oficina"],
    summary: "List all active community oficinas",
    description:
      "Returns every active oficina from community members of the given EmpresaSlug, " +
      "with coordinates. Used by the campaign wizard map to plot uncovered oficinas.",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "Community oficinas listed successfully",
        schema: GetCommunityAllResponseSchema,
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
