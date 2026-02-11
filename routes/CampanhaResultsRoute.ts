import { Router } from "express";
import { z } from "zod";
import CampanhaResultsController from "../controllers/campanhaResultsController";
import { createDocumentedRoute } from "../utils/routeDocumentation";

import {
  SaveCampanhaResultSchema,
  UpdateCampanhaResultSchema,
  CampanhaResultsIdParamsSchema,
  SaveCampanhaResultResponseSchema,
  UpdateCampanhaResultResponseSchema,
  GetCampanhaResultResponseSchema,
  GetCampanhaResultsByRotaIdResponseSchema,
  GetCampanhaResultsByCampanhaIdResponseSchema,
} from "../schemas/campanhaResults";
import { ErrorResponseSchema } from "../schemas/common";

const router = Router();

// Save a new campaign result or update if exists
createDocumentedRoute(router, {
  method: 'post',
  path: '/save',
  handler: CampanhaResultsController.saveResult,
  basePath: '/campanha-results',
  middlewares: [],
  schemas: {
    body: SaveCampanhaResultSchema,
  },
  documentation: {
    tags: ['Campanha Results'],
    summary: 'Save campaign result',
    description: 'Saves a new campaign result or updates if a result already exists for the given ID_ROTA and ID_PERGUNTA',
    security: [{ bearerAuth: [] }],
    responses: {
      201: {
        description: 'Campaign result saved successfully',
        schema: SaveCampanhaResultResponseSchema,
      },
      400: {
        description: 'Bad request - validation error',
        schema: ErrorResponseSchema,
      },
      401: {
        description: 'Unauthorized - token missing or invalid',
        schema: ErrorResponseSchema,
      },
      500: {
        description: 'Internal server error',
        schema: ErrorResponseSchema,
      },
    },
  },
});

// Update an existing campaign result by ID
createDocumentedRoute(router, {
  method: 'put',
  path: '/edit/:id',
  handler: CampanhaResultsController.updateResult,
  basePath: '/campanha-results',
  middlewares: [],
  schemas: {
    params: CampanhaResultsIdParamsSchema,
    body: UpdateCampanhaResultSchema,
  },
  documentation: {
    tags: ['Campanha Results'],
    summary: 'Update campaign result',
    description: 'Updates an existing campaign result by ID',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Campaign result updated successfully',
        schema: UpdateCampanhaResultResponseSchema,
      },
      400: {
        description: 'Bad request - validation error',
        schema: ErrorResponseSchema,
      },
      401: {
        description: 'Unauthorized - token missing or invalid',
        schema: ErrorResponseSchema,
      },
      404: {
        description: 'Campaign result not found',
        schema: ErrorResponseSchema,
      },
      500: {
        description: 'Internal server error',
        schema: ErrorResponseSchema,
      },
    },
  },
});

// Get a campaign result by ID
createDocumentedRoute(router, {
  method: 'get',
  path: '/:id',
  handler: CampanhaResultsController.getResultById,
  basePath: '/campanha-results',
  middlewares: [],
  schemas: {
    params: CampanhaResultsIdParamsSchema,
  },
  documentation: {
    tags: ['Campanha Results'],
    summary: 'Get campaign result by ID',
    description: 'Returns a campaign result by ID with its relationships (rota and pergunta)',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Campaign result found successfully',
        schema: GetCampanhaResultResponseSchema,
      },
      400: {
        description: 'Bad request - validation error',
        schema: ErrorResponseSchema,
      },
      401: {
        description: 'Unauthorized - token missing or invalid',
        schema: ErrorResponseSchema,
      },
      404: {
        description: 'Campaign result not found',
        schema: ErrorResponseSchema,
      },
      500: {
        description: 'Internal server error',
        schema: ErrorResponseSchema,
      },
    },
  },
});

// Get campaign results by rota ID
createDocumentedRoute(router, {
  method: 'get',
  path: '/rota/:rotaId',
  handler: CampanhaResultsController.getResultsByRotaId,
  basePath: '/campanha-results',
  middlewares: [],
  schemas: {
    params: z.object({ rotaId: z.coerce.number().int().positive() }),
  },
  documentation: {
    tags: ['Campanha Results'],
    summary: 'Get campaign results by rota ID',
    description: 'Returns all campaign results for a specific rota',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Campaign results found successfully',
        schema: GetCampanhaResultsByRotaIdResponseSchema,
      },
      400: {
        description: 'Bad request - validation error',
        schema: ErrorResponseSchema,
      },
      401: {
        description: 'Unauthorized - token missing or invalid',
        schema: ErrorResponseSchema,
      },
      500: {
        description: 'Internal server error',
        schema: ErrorResponseSchema,
      },
    },
  },
});

// Get campaign results by campanha ID
createDocumentedRoute(router, {
  method: 'get',
  path: '/campanha/:campanhaId',
  handler: CampanhaResultsController.getResultsByCampanhaId,
  basePath: '/campanha-results',
  middlewares: [],
  schemas: {
    params: z.object({ campanhaId: z.coerce.number().int().positive() }),
  },
  documentation: {
    tags: ['Campanha Results'],
    summary: 'Get campaign results by campanha ID',
    description: 'Returns all campaign results for a specific campanha',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Campaign results found successfully',
        schema: GetCampanhaResultsByCampanhaIdResponseSchema,
      },
      400: {
        description: 'Bad request - validation error',
        schema: ErrorResponseSchema,
      },
      401: {
        description: 'Unauthorized - token missing or invalid',
        schema: ErrorResponseSchema,
      },
      500: {
        description: 'Internal server error',
        schema: ErrorResponseSchema,
      },
    },
  },
});

export default router;
