import { Router } from "express";
import CampanhaController from "../controllers/campanhaController";
import { createDocumentedRoute } from "../utils/routeDocumentation";
import {
  CreateCampanhaSchema,
  UpdateCampanhaSchema,
  CampanhaIdParamsSchema,
  CreateCampanhaResponseSchema,
  UpdateCampanhaResponseSchema,
} from "../schemas/campanha";
import { ErrorResponseSchema } from "../schemas/common";

const router = Router();

// Create a new campaign
createDocumentedRoute(router, {
  method: 'post',
  path: '/create',
  handler: CampanhaController.createCampanha,
  schemas: {
    body: CreateCampanhaSchema,
  },
  documentation: {
    tags: ['Campanha'],
    summary: 'Create a new campaign',
    description: 'Creates a new campaign with the provided data',
    responses: {
      201: {
        description: 'Campaign created successfully',
        schema: CreateCampanhaResponseSchema,
      },
      400: {
        description: 'Bad request - validation error',
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
  schemas: {
    params: CampanhaIdParamsSchema,
    body: UpdateCampanhaSchema,
  },
  documentation: {
    tags: ['Campanha'],
    summary: 'Update an existing campaign',
    description: 'Updates a campaign with the provided data',
    responses: {
      200: {
        description: 'Campaign updated successfully',
        schema: UpdateCampanhaResponseSchema,
      },
      400: {
        description: 'Bad request - validation error',
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
