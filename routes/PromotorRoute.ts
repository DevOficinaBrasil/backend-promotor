import { Router } from "express";
import PromotorController from "../controllers/promotorController";
import { createDocumentedRoute } from "../utils/routeDocumentation";
import { authMiddleware } from "../middlewares/authMiddleware";
import {
  CreatePromotorSchema,
  UpdatePromotorSchema,
  PromotorIdParamsSchema,
  CreatePromotorResponseSchema,
  UpdatePromotorResponseSchema,
  DeletePromotorResponseSchema,
} from "../schemas/promotor";
import { ErrorResponseSchema } from "../schemas/common";

const router = Router();

// Create a new promoter
createDocumentedRoute(router, {
  method: 'post',
  path: '/create',
  handler: PromotorController.createPromotor,
  basePath: '/promotor',
  middlewares: [authMiddleware],
  schemas: {
    body: CreatePromotorSchema,
  },
  documentation: {
    tags: ['Promotor'],
    summary: 'Create a new promoter',
    description: 'Creates a new promoter with the provided data',
    security: [{ bearerAuth: [] }],
    responses: {
      201: {
        description: 'Promoter created successfully',
        schema: CreatePromotorResponseSchema,
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

// Update an existing promoter
createDocumentedRoute(router, {
  method: 'put',
  path: '/edit/:id',
  handler: PromotorController.updatePromotor,
  basePath: '/promotor',
  middlewares: [authMiddleware],
  schemas: {
    params: PromotorIdParamsSchema,
    body: UpdatePromotorSchema,
  },
  documentation: {
    tags: ['Promotor'],
    summary: 'Update an existing promoter',
    description: 'Updates a promoter with the provided data',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Promoter updated successfully',
        schema: UpdatePromotorResponseSchema,
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
        description: 'Promoter not found',
        schema: ErrorResponseSchema,
      },
      500: {
        description: 'Internal server error',
        schema: ErrorResponseSchema,
      },
    },
  },
});

// Soft delete a promoter
createDocumentedRoute(router, {
  method: 'delete',
  path: '/delete/:id',
  handler: PromotorController.deletePromotor,
  basePath: '/promotor',
  middlewares: [authMiddleware],
  schemas: {
    params: PromotorIdParamsSchema,
  },
  documentation: {
    tags: ['Promotor'],
    summary: 'Delete a promoter (soft delete)',
    description: 'Soft deletes a promoter by ID',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Promoter deleted successfully',
        schema: DeletePromotorResponseSchema,
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
        description: 'Promoter not found',
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
