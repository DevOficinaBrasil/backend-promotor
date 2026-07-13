import { Router } from "express";
import { createDocumentedRoute } from "../utils/routeDocumentation";
import { z } from "zod";

const router = Router();

// Health check response schema
const HealthCheckResponseSchema = z.object({
  status: z.string(),
  message: z.string(),
  timestamp: z.string(),
});

// Health check endpoint
createDocumentedRoute(router, {
  method: 'get',
  path: '/',
  handler: (req, res) => {
    res.status(200).json({
      status: "ok",
      message: "Teste-rota health check passed",
      timestamp: new Date().toISOString(),
    });
  },
  basePath: '/teste-rota',
  documentation: {
    tags: ['Health Check'],
    summary: 'Health check endpoint for testing',
    description: 'Simple health check endpoint that returns the status of the service',
    responses: {
      200: {
        description: 'Service is healthy',
        schema: HealthCheckResponseSchema,
      },
    },
  },
});

export default router;
