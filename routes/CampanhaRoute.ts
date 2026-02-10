import { Router } from "express";
import CampanhaController from "../controllers/campanhaController";
import { createDocumentedRoute } from "../utils/routeDocumentation";
import { authMiddleware } from "../middlewares/authMiddleware";
import {
  CreateCampanhaSchema,
  UpdateCampanhaSchema,
  CampanhaIdParamsSchema,
  ClientIdParamsSchema,
  CreateCampanhaResponseSchema,
  UpdateCampanhaResponseSchema,
  DeleteCampanhaResponseSchema,
  GetCampanhaAtivaQuerySchema,
  GetCampanhaAtivaResponseSchema,
  GetAllCampanhasResponseSchema,
  GetCampanhaByIdResponseSchema,
  GetCampanhasByClientIdResponseSchema,
} from "../schemas/campanha";
import { ErrorResponseSchema } from "../schemas/common";

const router = Router();

// Create a new campaign
createDocumentedRoute(router, {
  method: 'post',
  path: '/create',
  handler: CampanhaController.createCampanha,
  basePath: '/campanha',
  middlewares: [authMiddleware],
  schemas: {
    body: CreateCampanhaSchema,
  },
  documentation: {
    tags: ['Campanha'],
    summary: 'Create a new campaign',
    description: 'Creates a new campaign with the provided data',
    security: [{ bearerAuth: [] }],
    responses: {
      201: {
        description: 'Campaign created successfully',
        schema: CreateCampanhaResponseSchema,
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

// Update an existing campaign
createDocumentedRoute(router, {
  method: 'put',
  path: '/edit/:id',
  handler: CampanhaController.updateCampanha,
  basePath: '/campanha',
  middlewares: [authMiddleware],
  schemas: {
    params: CampanhaIdParamsSchema,
    body: UpdateCampanhaSchema,
  },
  documentation: {
    tags: ['Campanha'],
    summary: 'Update an existing campaign',
    description: 'Updates a campaign with the provided data',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Campaign updated successfully',
        schema: UpdateCampanhaResponseSchema,
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
        description: 'Campaign not found',
        schema: ErrorResponseSchema,
      },
      500: {
        description: 'Internal server error',
        schema: ErrorResponseSchema,
      },
    },
  },
});

// Soft delete a campaign
createDocumentedRoute(router, {
  method: 'delete',
  path: '/delete/:id',
  handler: CampanhaController.deleteCampanha,
  basePath: '/campanha',
  middlewares: [authMiddleware],
  schemas: {
    params: CampanhaIdParamsSchema,
  },
  documentation: {
    tags: ['Campanha'],
    summary: 'Delete a campaign (soft delete)',
    description: 'Soft deletes a campaign by ID',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Campaign deleted successfully',
        schema: DeleteCampanhaResponseSchema,
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
        description: 'Campaign not found',
        schema: ErrorResponseSchema,
      },
      500: {
        description: 'Internal server error',
        schema: ErrorResponseSchema,
      },
    },
  },
});

// Get active campaign for a promoter
createDocumentedRoute(router, {
  method: 'get',
  path: '/ativa',
  handler: CampanhaController.getCampanhaAtiva,
  basePath: '/campanha',
  middlewares: [authMiddleware],
  schemas: {
    query: GetCampanhaAtivaQuerySchema,
  },
  documentation: {
    tags: ['Campanha'],
    summary: 'Get active campaign for a promoter',
    description: 'Returns the active campaign for a promoter based on the current datetime (between START_TIME and END_TIME). The response includes campaign details with a rotas array, where each rota contains its associated oficina details.',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Active campaign found or no active campaign',
        schema: GetCampanhaAtivaResponseSchema,
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

// Get all campaigns
createDocumentedRoute(router, {
  method: 'get',
  path: '/',
  handler: CampanhaController.getAllCampanha,
  basePath: '/campanha',
  middlewares: [authMiddleware],
  documentation: {
    tags: ['Campanha'],
    summary: 'Get all campaigns',
    description: 'Returns a list of all campaigns (non-deleted)',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Campaigns retrieved successfully',
        schema: GetAllCampanhasResponseSchema,
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

// Get campaign by ID with relationships
createDocumentedRoute(router, {
  method: 'get',
  path: '/:id',
  handler: CampanhaController.getCampanhaById,
  basePath: '/campanha',
  middlewares: [authMiddleware],
  schemas: {
    params: CampanhaIdParamsSchema,
  },
  documentation: {
    tags: ['Campanha'],
    summary: 'Get campaign by ID',
    description: 'Returns a campaign by ID with its relationships (promoters with their routes and oficinas, and questions)',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Campaign found successfully',
        schema: GetCampanhaByIdResponseSchema,
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
        description: 'Campaign not found',
        schema: ErrorResponseSchema,
      },
      500: {
        description: 'Internal server error',
        schema: ErrorResponseSchema,
      },
    },
  },
});

// Get campaigns by client ID
createDocumentedRoute(router, {
  method: 'get',
  path: '/client/:clientId',
  handler: CampanhaController.getCampanhaByClientId,
  basePath: '/campanha',
  middlewares: [authMiddleware],
  schemas: {
    params: ClientIdParamsSchema,
  },
  documentation: {
    tags: ['Campanha'],
    summary: 'Get campaigns by client ID',
    description: 'Returns all campaigns for a specific client with relationships (promoters with their routes and oficinas, and questions)',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Campaigns found successfully',
        schema: GetCampanhasByClientIdResponseSchema,
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
