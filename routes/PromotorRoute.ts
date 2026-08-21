
import { Router } from "express";
import PromotorController from "../controllers/promotorController";
import { createDocumentedRoute } from "../utils/routeDocumentation";

import {
  CreatePromotorSchema,
  UpdatePromotorSchema,
  PromotorIdParamsSchema,
  CreatePromotorResponseSchema,
  UpdatePromotorResponseSchema,
  DeletePromotorResponseSchema,
  LoginPromotorSchema,
  LoginPromotorResponseSchema,
  GetAllPromotoresResponseSchema,
  GetPromotorByIdResponseSchema,
  LinkCampanhaPromotorSchema,
  LinkCampanhaPromotorResponseSchema,
  UnlinkCampanhaPromotorSchema,
  UnlinkCampanhaPromotorResponseSchema,
  UpdateCampanhaPromotorRaioSchema,
  CampanhaPromotorIdParamsSchema,
  UpdateCampanhaPromotorRaioResponseSchema,
  GetPromotorCampanhasResponseSchema,
  ClientIdParamsSchema,
  GetPromotoresByClientIdResponseSchema,
} from "../schemas/promotor";
import { ErrorResponseSchema } from "../schemas/common";

const router = Router();

// Login promoter (public route - no auth middleware)
createDocumentedRoute(router, {
  method: 'post',
  path: '/login',
  handler: PromotorController.loginPromotor,
  basePath: '/promotor',
  schemas: {
    body: LoginPromotorSchema,
  },
  documentation: {
    tags: ['Promotor'],
    summary: 'Login a promoter',
    description: 'Authenticates a promoter with email and password, returning a JWT token',
    responses: {
      200: {
        description: 'Login successful',
        schema: LoginPromotorResponseSchema,
      },
      401: {
        description: 'Unauthorized - invalid credentials',
        schema: ErrorResponseSchema,
      },
      500: {
        description: 'Internal server error',
        schema: ErrorResponseSchema,
      },
    },
  },
});

// Create a new promoter
createDocumentedRoute(router, {
  method: 'post',
  path: '/create',
  handler: PromotorController.createPromotor,
  basePath: '/promotor',
  middlewares: [],
  schemas: {
    body: CreatePromotorSchema,
  },
  documentation: {
    tags: ['Promotor'],
    summary: 'Create a new promoter',
    description: `Creates a new promoter with the provided data. Accepts optional FILTRO_SEGMENTACAO to apply CRM segmentation on initial route auto-assignment.

**FILTRO_SEGMENTACAO example:**
\`\`\`json
{
  "if": {
    "behavior": {
      "section": "LEAD_DATA",
      "criterion": "LEAD_FIELD",
      "value": { "fieldKey": "professionalOccupation", "fieldType": "text", "operator": "EQUALS", "value": "Mecânico" }
    }
  },
  "then": { "decision": "include", "reason": "segment_rule_matched" },
  "default": { "decision": "exclude", "reason": "default_exclude" }
}
\`\`\`
\`fieldKey\` deve ser o nome do campo sem prefixo (ex: \`"gender"\`, não \`"attributeKey.gender"\`). Campos disponíveis via \`GET /segmentacao/getFiltrosSegmentacaoByCampanha/:idCampanha\`.`,
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
  middlewares: [],
  schemas: {
    params: PromotorIdParamsSchema,
    body: UpdatePromotorSchema,
  },
  documentation: {
    tags: ['Promotor'],
    summary: 'Update an existing promoter',
    description: `Updates a promoter with the provided data. Accepts optional FILTRO_SEGMENTACAO to update the CRM segmentation filter on all active campanha-promotor links.

**FILTRO_SEGMENTACAO example:**
\`\`\`json
{
  "if": {
    "behavior": {
      "section": "LEAD_DATA",
      "criterion": "LEAD_FIELD",
      "value": { "fieldKey": "gender", "fieldType": "text", "operator": "EQUALS", "value": "Masculino" }
    }
  },
  "then": { "decision": "include", "reason": "segment_rule_matched" },
  "default": { "decision": "exclude", "reason": "default_exclude" }
}
\`\`\`
\`fieldKey\` deve ser o nome do campo sem prefixo (ex: \`"gender"\`, não \`"attributeKey.gender"\`). Send \`null\` to remove the filter. If CEP is also changed, routes will be reassigned using the new filter.`,
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
  middlewares: [],
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

// Get all promoters
createDocumentedRoute(router, {
  method: 'get',
  path: '/',
  handler: PromotorController.getAllPromotores,
  basePath: '/promotor',
  middlewares: [],
  documentation: {
    tags: ['Promotor'],
    summary: 'Get all promoters',
    description: 'Returns a list of all promoters (non-deleted, without passwords)',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Promoters retrieved successfully',
        schema: GetAllPromotoresResponseSchema,
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

// Get promoter by ID
createDocumentedRoute(router, {
  method: 'get',
  path: '/:id',
  handler: PromotorController.getPromotoresById,
  basePath: '/promotor',
  middlewares: [],
  schemas: {
    params: PromotorIdParamsSchema,
  },
  documentation: {
    tags: ['Promotor'],
    summary: 'Get promoter by ID',
    description: 'Returns a promoter by ID (without password)',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Promoter found successfully',
        schema: GetPromotorByIdResponseSchema,
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

// Link promoter to campaign(s)
createDocumentedRoute(router, {
  method: 'post',
  path: '/link-campanha',
  handler: PromotorController.linkCampanhaPromotor,
  basePath: '/promotor',
  middlewares: [],
  schemas: {
    body: LinkCampanhaPromotorSchema,
  },
  documentation: {
    tags: ['Promotor'],
    summary: 'Link promoter to campaign(s)',
    description: `Creates a relationship between a promoter and one or more campaigns. Accepts optional FILTRO_SEGMENTACAO to apply CRM segmentation during route auto-assignment.

**FILTRO_SEGMENTACAO example:**
\`\`\`json
{
  "if": {
    "behavior": {
      "section": "LEAD_DATA",
      "criterion": "LEAD_FIELD",
      "value": { "fieldKey": "professionalOccupation", "fieldType": "text", "operator": "EQUALS", "value": "Mecânico" }
    }
  },
  "then": { "decision": "include", "reason": "segment_rule_matched" },
  "default": { "decision": "exclude", "reason": "default_exclude" }
}
\`\`\`
\`fieldKey\` deve ser o nome do campo sem prefixo (ex: \`"gender"\`, não \`"attributeKey.gender"\`). Campos disponíveis via \`GET /segmentacao/getFiltrosSegmentacaoByCampanha/:idCampanha\`.`,
    security: [{ bearerAuth: [] }],
    responses: {
      201: {
        description: 'Link created successfully',
        schema: LinkCampanhaPromotorResponseSchema,
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

// Unlink promoter from campaign(s)
createDocumentedRoute(router, {
  method: 'delete',
  path: '/unlink-campanha-promotor/:id_campanha_promotor',
  handler: PromotorController.unlinkCampanhaPromotor,
  basePath: '/promotor',
  middlewares: [],
  schemas: {
    params: UnlinkCampanhaPromotorSchema,
  },
  documentation: {
    tags: ['Promotor'],
    summary: 'Unlink promoter from campaign(s)',
    description: 'Remove relationship between a promoter and one or more campaigns',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Unlink successful',
        schema: UnlinkCampanhaPromotorResponseSchema,
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
        description: 'Promoter or campaign not found',
        schema: ErrorResponseSchema,
      },
      500: {
        description: 'Internal server error',
        schema: ErrorResponseSchema,
      },
    },
  },
});

// Update campanha-promotor RAIO and recalculate routes
createDocumentedRoute(router, {
  method: 'put',
  path: '/campanha-promotor/:id/raio',
  handler: PromotorController.updateCampanhaPromotorRaio,
  basePath: '/promotor',
  middlewares: [],
  schemas: {
    params: CampanhaPromotorIdParamsSchema,
    body: UpdateCampanhaPromotorRaioSchema,
  },
  documentation: {
    tags: ['Promotor'],
    summary: 'Update link radius and recalculate routes',
    description:
      'Updates CAMPANHA_PROMOTOR.RAIO and recalculates this link\'s routes: ' +
      'adds BACKLOG routes for community oficinas now inside the radius (respecting ' +
      'campaign exclusivity) and soft-deletes BACKLOG routes that fell outside. ' +
      'Routes in any other status are never touched.',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Radius updated and routes recalculated',
        schema: UpdateCampanhaPromotorRaioResponseSchema,
      },
      400: {
        description: 'Bad request - validation error or promoter without coordinates',
        schema: ErrorResponseSchema,
      },
      401: {
        description: 'Unauthorized - token missing or invalid',
        schema: ErrorResponseSchema,
      },
      404: {
        description: 'Campanha-promotor link not found',
        schema: ErrorResponseSchema,
      },
      500: {
        description: 'Internal server error',
        schema: ErrorResponseSchema,
      },
    },
  },
});

// Get all campaign IDs linked to a promoter
createDocumentedRoute(router, {
  method: 'get',
  path: '/:id/campanhas',
  handler: PromotorController.getCampanhasByPromotor,
  basePath: '/promotor',
  middlewares: [],
  schemas: {
    params: PromotorIdParamsSchema,
  },
  documentation: {
    tags: ['Promotor'],
    summary: 'Get all campaign IDs linked to a promoter',
    description: 'Returns an array of campaign IDs linked to the given promoter',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Campaign IDs retrieved successfully',
        schema: GetPromotorCampanhasResponseSchema,
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

// Get promotors by client ID
createDocumentedRoute(router, {
  method: 'get',
  path: '/client/:clientId',
  handler: PromotorController.getPromotoresByClientId,
  basePath: '/promotor',
  middlewares: [],
  schemas: {
    params: ClientIdParamsSchema,
  },
  documentation: {
    tags: ['Promotor'],
    summary: 'Get promotors by client ID',
    description: 'Returns a list of all promotors for a specific client ID (without passwords)',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Promotors retrieved successfully',
        schema: GetPromotoresByClientIdResponseSchema,
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
