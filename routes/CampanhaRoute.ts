import { Router } from "express";
import CampanhaController from "../controllers/campanhaController";
import { createDocumentedRoute } from "../utils/routeDocumentation";
import { authMiddleware } from "../middlewares/authMiddleware";
import {
  CreateCampanhaSchema,
  UpdateCampanhaSchema,
  CampanhaIdParamsSchema,
  CreateCampanhaResponseSchema,
  UpdateCampanhaResponseSchema,
  DeleteCampanhaResponseSchema,
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

export default router;
