import { Router } from "express";
import RotaController from "../controllers/rotaController";
import { createDocumentedRoute } from "../utils/routeDocumentation";
import { authMiddleware } from "../middlewares/authMiddleware";
import {
  CreateRotaSchema,
  UpdateRotaWorkshopsSchema,
  UpdateRotaOptionsSchema,
  RotaIdParamsSchema,
  CreateRotaResponseSchema,
  UpdateRotaWorkshopsResponseSchema,
  UpdateRotaOptionsResponseSchema,
  GetRotaByIdResponseSchema,
  GetGeolocationByCepResponseSchema,
  GetGeolocationByCepRequestSchema,
} from "../schemas/rota";
import { ErrorResponseSchema } from "../schemas/common";

const router = Router();

// Create one or multiple routes
createDocumentedRoute(router, {
  method: "post",
  path: "/create",
  handler: RotaController.createRotas,
  basePath: "/rota",
  middlewares: [authMiddleware],
  schemas: {
    body: CreateRotaSchema,
  },
  documentation: {
    tags: ["Rota"],
    summary: "Create one or multiple routes",
    description:
      "Creates one or multiple routes for a campaign promoter. " +
      "Can receive a single ID_OFICINA or an array of ID_OFICINA for batch creation.",
    security: [{ bearerAuth: [] }],
    responses: {
      201: {
        description: "Route(s) created successfully",
        schema: CreateRotaResponseSchema,
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

// Update workshops for a route
createDocumentedRoute(router, {
  method: "put",
  path: "/workshops",
  handler: RotaController.updateRotaWorkshops,
  basePath: "/rota",
  middlewares: [authMiddleware],
  schemas: {
    body: UpdateRotaWorkshopsSchema,
  },
  documentation: {
    tags: ["Rota"],
    summary: "Update workshops for a route",
    description:
      "Updates workshops for a route (campaign promoter). " +
      "Soft deletes old workshop links that are no longer needed and creates new ones. " +
      "Receives ID_CAMPANHA_PROMOTOR and an array of ID_OFICINA.",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "Workshops updated successfully",
        schema: UpdateRotaWorkshopsResponseSchema,
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

// Update route options
createDocumentedRoute(router, {
  method: "put",
  path: "/:id/options",
  handler: RotaController.updateRotaOptions,
  basePath: "/rota",
  middlewares: [authMiddleware],
  schemas: {
    params: RotaIdParamsSchema,
    body: UpdateRotaOptionsSchema,
  },
  documentation: {
    tags: ["Rota"],
    summary: "Update route options",
    description:
      "Updates a route's options (not the workshops). " +
      "Can update STATUS, SUCCESS, CHECKIN_TIME, DONE_AT, and OBS. " +
      "All fields are optional in the request body.",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "Route options updated successfully",
        schema: UpdateRotaOptionsResponseSchema,
      },
      400: {
        description: "Bad request - validation error",
        schema: ErrorResponseSchema,
      },
      401: {
        description: "Unauthorized - token missing or invalid",
        schema: ErrorResponseSchema,
      },
      404: {
        description: "Route not found",
        schema: ErrorResponseSchema,
      },
      500: {
        description: "Internal server error",
        schema: ErrorResponseSchema,
      },
    },
  },
});

// Get route by ID with relationships
createDocumentedRoute(router, {
  method: "get",
  path: "/:id",
  handler: RotaController.getRotaByIdROTA_PROMOTOR,
  basePath: "/rota",
  middlewares: [authMiddleware],
  schemas: {
    params: RotaIdParamsSchema,
  },
  documentation: {
    tags: ["Rota"],
    summary: "Get route by ID",
    description:
      "Returns a route by ID with its relationships " +
      "(campaign promoter, campaign, promoter, and results).",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "Route found successfully",
        schema: GetRotaByIdResponseSchema,
      },
      400: {
        description: "Bad request - validation error",
        schema: ErrorResponseSchema,
      },
      401: {
        description: "Unauthorized - token missing or invalid",
        schema: ErrorResponseSchema,
      },
      404: {
        description: "Route not found",
        schema: ErrorResponseSchema,
      },
      500: {
        description: "Internal server error",
        schema: ErrorResponseSchema,
      },
    },
  },
});

// Get geolocation by CEP
createDocumentedRoute(router, {
  method: "post",
  path: "/geolocation",
  handler: RotaController.getGeolocationDataByCep,
  basePath: "/rota",
  middlewares: [authMiddleware],
  schemas: {
    body: GetGeolocationByCepRequestSchema,
  },
  documentation: {
    tags: ["Rota"],
    summary: "Get geolocation by CEP",
    description: "Returns latitude and longitude for a given CEP (postal code).",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "Geolocation found or not found",
        schema: GetGeolocationByCepResponseSchema,
      },
      400: {
        description: "Bad request - invalid CEP",
        schema: GetGeolocationByCepResponseSchema,
      },
      401: {
        description: "Unauthorized - token missing or invalid",
        schema: ErrorResponseSchema,
      },
      500: {
        description: "Internal server error",
        schema: GetGeolocationByCepResponseSchema,
      },
    },
  },
});

export default router;
