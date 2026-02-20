import { Router } from "express";
import CampanhaPerguntasController from "../controllers/campanhaPerguntasController";
import { createDocumentedRoute } from "../utils/routeDocumentation";
import {
  CreateCampanhaPerguntasSchema,
  UpdateCampanhaPerguntasSchema,
  CampanhaPerguntasIdParamsSchema,
  CampanhaIdParamsSchema,
  CreateCampanhaPerguntasResponseSchema,
  UpdateCampanhaPerguntasResponseSchema,
  DeleteCampanhaPerguntasResponseSchema,
  GetAllCampanhaPerguntasResponseSchema,
  GetCampanhaPerguntasByIdResponseSchema,
  GetPerguntasByCampanhaIdResponseSchema,
} from "../schemas/campanhaPerguntas";
import { ErrorResponseSchema } from "../schemas/common";

const router = Router();

// Create a new campanha pergunta
createDocumentedRoute(router, {
  method: "post",
  path: "/create",
  handler: CampanhaPerguntasController.createCampanhaPergunta,
  basePath: "/campanha-perguntas",
  middlewares: [],
  schemas: {
    body: CreateCampanhaPerguntasSchema,
  },
  documentation: {
    tags: ["Campanha Perguntas"],
    summary: "Create a new campaign question",
    description: "Creates a new question for a campaign with the provided data",
    security: [{ bearerAuth: [] }],
    responses: {
      201: {
        description: "Question created successfully",
        schema: CreateCampanhaPerguntasResponseSchema,
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

// Update an existing campanha pergunta
createDocumentedRoute(router, {
  method: "put",
  path: "/edit/:id",
  handler: CampanhaPerguntasController.updateCampanhaPergunta,
  basePath: "/campanha-perguntas",
  middlewares: [],
  schemas: {
    params: CampanhaPerguntasIdParamsSchema,
    body: UpdateCampanhaPerguntasSchema,
  },
  documentation: {
    tags: ["Campanha Perguntas"],
    summary: "Update an existing campaign question",
    description: "Updates a campaign question with the provided data",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "Question updated successfully",
        schema: UpdateCampanhaPerguntasResponseSchema,
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
        description: "Question not found",
        schema: ErrorResponseSchema,
      },
      500: {
        description: "Internal server error",
        schema: ErrorResponseSchema,
      },
    },
  },
});

// Soft delete a campanha pergunta
createDocumentedRoute(router, {
  method: "delete",
  path: "/delete/:id",
  handler: CampanhaPerguntasController.deleteCampanhaPergunta,
  basePath: "/campanha-perguntas",
  middlewares: [],
  schemas: {
    params: CampanhaPerguntasIdParamsSchema,
  },
  documentation: {
    tags: ["Campanha Perguntas"],
    summary: "Delete a campaign question (soft delete)",
    description: "Soft deletes a campaign question by ID",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "Question deleted successfully",
        schema: DeleteCampanhaPerguntasResponseSchema,
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
        description: "Question not found",
        schema: ErrorResponseSchema,
      },
      500: {
        description: "Internal server error",
        schema: ErrorResponseSchema,
      },
    },
  },
});

// Get all campanha perguntas
createDocumentedRoute(router, {
  method: "get",
  path: "/",
  handler: CampanhaPerguntasController.getAllCampanhaPerguntas,
  basePath: "/campanha-perguntas",
  middlewares: [],
  documentation: {
    tags: ["Campanha Perguntas"],
    summary: "Get all campaign questions",
    description: "Returns a list of all campaign questions (non-deleted)",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "Questions retrieved successfully",
        schema: GetAllCampanhaPerguntasResponseSchema,
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

// Get campanha pergunta by ID
createDocumentedRoute(router, {
  method: "get",
  path: "/:id",
  handler: CampanhaPerguntasController.getCampanhaPerguntaById,
  basePath: "/campanha-perguntas",
  middlewares: [],
  schemas: {
    params: CampanhaPerguntasIdParamsSchema,
  },
  documentation: {
    tags: ["Campanha Perguntas"],
    summary: "Get campaign question by ID",
    description: "Returns a campaign question by ID",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "Question found successfully",
        schema: GetCampanhaPerguntasByIdResponseSchema,
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
        description: "Question not found",
        schema: ErrorResponseSchema,
      },
      500: {
        description: "Internal server error",
        schema: ErrorResponseSchema,
      },
    },
  },
});

// Get perguntas by campanha ID
createDocumentedRoute(router, {
  method: "get",
  path: "/campanha/:id",
  handler: CampanhaPerguntasController.getPerguntasByCampanhaId,
  basePath: "/campanha-perguntas",
  middlewares: [],
  schemas: {
    params: CampanhaIdParamsSchema,
  },
  documentation: {
    tags: ["Campanha Perguntas"],
    summary: "Get questions by campaign ID",
    description: "Returns all questions for a specific campaign",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "Questions retrieved successfully",
        schema: GetPerguntasByCampanhaIdResponseSchema,
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
