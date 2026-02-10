import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { openAPIGenerator } from '../config/openapi';
import { validateSchema } from '../middlewares/validation';

interface RouteConfig {
  method: 'get' | 'post' | 'put' | 'delete' | 'patch';
  path: string;
  handler: (req: Request, res: Response, next?: NextFunction) => any;

  // Validation schemas
  schemas?: {
    body?: z.ZodSchema;
    params?: z.ZodSchema;
    query?: z.ZodSchema;
  };

  middlewares?: any[];

  // Documentation
  documentation: {
    tags?: string[];
    summary: string;
    description?: string;
    responses: Record<
      number,
      {
        description: string;
        schema?: z.ZodSchema;
      }
    >;
    security?: Array<Record<string, string[]>>;
  };
}

/**
 * Creates a documented route with validation and OpenAPI documentation
 * @param router - Express Router instance
 * @param config - Route configuration
 */
export function createDocumentedRoute(router: Router, config: RouteConfig) {
  const {
    method,
    path,
    handler,
    schemas,
    middlewares = [],
    documentation,
  } = config;

  // Build middleware array
  const allMiddlewares: any[] = [];

  // Add validation middleware if schemas are provided
  if (schemas) {
    allMiddlewares.push(validateSchema(schemas));
  }

  // Add custom middlewares
  allMiddlewares.push(...middlewares);

  // Register the route with Express
  router[method](path, ...allMiddlewares, handler);

  // Register the route with OpenAPI documentation
  const openApiPath = path.replace(/:(\w+)/g, '{$1}'); // Convert :id to {id}

  const openApiConfig: any = {
    method,
    path: openApiPath,
    tags: documentation.tags || [],
    summary: documentation.summary,
    description: documentation.description || '',
    responses: {},
    security: documentation.security,
  };

  // Build request object if we have schemas
  if (schemas) {
    const request: any = {};

    if (schemas.body) {
      request.body = {
        content: {
          'application/json': {
            schema: schemas.body,
          },
        },
      };
    }

    if (schemas.params) {
      request.params = schemas.params;
    }

    if (schemas.query) {
      request.query = schemas.query;
    }

    if (Object.keys(request).length > 0) {
      openApiConfig.request = request;
    }
  }

  // Build responses
  for (const [statusCode, response] of Object.entries(documentation.responses)) {
    openApiConfig.responses[statusCode] = {
      description: response.description,
      content: response.schema
        ? {
            'application/json': {
              schema: response.schema,
            },
          }
        : undefined,
    };
  }

  // Register with OpenAPI generator
  openAPIGenerator.registerPath(openApiConfig);
}
