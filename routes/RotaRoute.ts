import { Router } from "express";
import RotaController from "../controllers/rotaController";
import { createDocumentedRoute } from "../utils/routeDocumentation";
import {
  CreateRotaSchema,
  CreateRotaWithCampanhaPromotorSchema,
  UpdateRotaWorkshopsSchema,
  UpdateRotaOptionsSchema,
  RotaIdParamsSchema,
  CreateRotaResponseSchema,
  CreateRotaWithCampanhaPromotorResponseSchema,
  UpdateRotaWorkshopsResponseSchema,
  UpdateRotaOptionsResponseSchema,
  GetRotaByIdResponseSchema,
  GetGeolocationByCepResponseSchema,
  GetGeolocationByCepRequestSchema,
  OptimizeRotaSchema,
  ReorderRotasSchema,
  OptimizeRotaResponseSchema,
  ReorderRotasResponseSchema,
  ReassignByAddressSchema,
  ReassignByAddressResponseSchema,
  AssignOficinaCommunitySchema,
  AssignOficinaCommunityResponseSchema,
} from "../schemas/rota";
import { ErrorResponseSchema } from "../schemas/common";

const router = Router();

// Create one or multiple routes
createDocumentedRoute(router, {
  method: "post",
  path: "/create",
  handler: RotaController.createRotas,
  basePath: "/rota",
  middlewares: [],
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

// Create campaign promoter with routes
createDocumentedRoute(router, {
  method: "post",
  path: "/create-with-campanha-promotor",
  handler: RotaController.createRotaWithCampanhaPromotor,
  basePath: "/rota",
  middlewares: [],
  schemas: {
    body: CreateRotaWithCampanhaPromotorSchema,
  },
  documentation: {
    tags: ["Rota"],
    summary: "Create campaign promoter with routes",
    description:
      "Creates a campaign promoter (CAMPANHA_PROMOTOR) and its associated routes with workshops. " +
      "Receives ID_PROMOTOR, ID_CAMPANHA and an array of ID_OFICINA. " +
      "First creates the CAMPANHA_PROMOTOR record, then creates ROTA_PROMOTOR records for each workshop.",
    security: [{ bearerAuth: [] }],
    responses: {
      201: {
        description: "Campaign promoter and routes created successfully",
        schema: CreateRotaWithCampanhaPromotorResponseSchema,
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
  middlewares: [],
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
  middlewares: [],
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
  middlewares: [],
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
  middlewares: [],
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

// Optimize route order (A→B with Nearest Neighbor + 2-opt)
createDocumentedRoute(router, {
  method: "post",
  path: "/optimize",
  handler: RotaController.optimizeRoute,
  basePath: "/rota",
  middlewares: [],
  schemas: {
    body: OptimizeRotaSchema,
  },
  documentation: {
    tags: ["Rota"],
    summary: "Optimize route order",
    description:
      "Calculates the optimal visit order from a starting oficina to an ending oficina " +
      "using Nearest Neighbor heuristic + 2-opt improvement. Persists ORDEM on each rota " +
      "and sets ESTRATEGIA_ORDENACAO = ROTA_OTIMIZADA on the CampanhaPromotor.",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "Route optimized successfully",
        schema: OptimizeRotaResponseSchema,
      },
      400: {
        description: "Bad request - validation or business error",
        schema: ErrorResponseSchema,
      },
      500: {
        description: "Internal server error",
        schema: ErrorResponseSchema,
      },
    },
  },
});

// Reorder routes (manual or proximity-based)
createDocumentedRoute(router, {
  method: "put",
  path: "/reorder",
  handler: RotaController.reorderRotas,
  basePath: "/rota",
  middlewares: [],
  schemas: {
    body: ReorderRotasSchema,
  },
  documentation: {
    tags: ["Rota"],
    summary: "Reorder routes",
    description:
      "Reorders routes for a campaign promoter. For MANUAL strategy, expects an array of " +
      "{ ID_ROTA_PROMOTOR, ORDEM }. For PROXIMIDADE_PROMOTOR, clears all ORDEM values (calculated client-side).",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "Routes reordered successfully",
        schema: ReorderRotasResponseSchema,
      },
      400: {
        description: "Bad request - validation or business error",
        schema: ErrorResponseSchema,
      },
      500: {
        description: "Internal server error",
        schema: ErrorResponseSchema,
      },
    },
  },
});

// Reassign routes after oficina address change
createDocumentedRoute(router, {
  method: "post",
  path: "/reassign-by-address",
  handler: RotaController.reassignByAddress,
  basePath: "/rota",
  middlewares: [],
  schemas: {
    body: ReassignByAddressSchema,
  },
  documentation: {
    tags: ["Rota"],
    summary: "Reassign routes after oficina address change",
    description:
      "Receives a new CEP and ID_OFICINA. Geocodes the CEP, checks if the oficina is still within " +
      "each assigned promotor's radius, and reassigns to the nearest eligible promotor if not.",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "Reassignment completed",
        schema: ReassignByAddressResponseSchema,
      },
      400: {
        description: "Invalid CEP or geocoding failure",
        schema: ErrorResponseSchema,
      },
      404: {
        description: "No active routes found for the oficina",
        schema: ErrorResponseSchema,
      },
      500: {
        description: "Internal server error",
        schema: ErrorResponseSchema,
      },
    },
  },
});

// Assign oficina to nearest promotor on community signup
createDocumentedRoute(router, {
  method: "post",
  path: "/assign-oficina-community",
  handler: RotaController.assignOficinaCommunity,
  basePath: "/rota",
  middlewares: [],
  schemas: {
    body: AssignOficinaCommunitySchema,
  },
  documentation: {
    tags: ["Rota"],
    summary: "Atribui oficina ao promotor mais próximo na inscrição em comunidade",
    description:
      "Recebe ID_OFICINA e empresaSlug. Busca campanhas ativas do cliente, " +
      "calcula distância para cada promotor e atribui ao mais próximo dentro do raio.",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "Atribuição processada (pode conter atribuições, skips ou sem promotor)",
        schema: AssignOficinaCommunityResponseSchema,
      },
      404: { description: "Oficina não encontrada", schema: ErrorResponseSchema },
      422: { description: "CEP sem coordenadas", schema: ErrorResponseSchema },
      500: { description: "Erro interno", schema: ErrorResponseSchema },
    },
  },
});

export default router;
