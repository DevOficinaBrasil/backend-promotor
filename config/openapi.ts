import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

export class OpenAPIDocumentGenerator {
  private registry: OpenAPIRegistry;

  constructor() {
    this.registry = new OpenAPIRegistry();
    this.setupBasicInfo();
  }

  private setupBasicInfo() {
    this.registry.registerComponent('securitySchemes', 'bearerAuth', {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });
  }

  registerPath(config: {
    method: 'get' | 'post' | 'put' | 'delete' | 'patch';
    path: string;
    tags?: string[];
    summary?: string;
    description?: string;
    request?: any;
    responses: any;
    security?: Array<Record<string, string[]>>;
  }) {
    this.registry.registerPath({
      method: config.method,
      path: config.path,
      tags: config.tags || [],
      summary: config.summary || '',
      description: config.description || '',
      request: config.request,
      responses: config.responses,
      security: config.security,
    });
  }

  generateDocument() {
    const generator = new OpenApiGeneratorV3(this.registry.definitions);

    return generator.generateDocument({
      openapi: '3.0.0',
      info: {
        version: '1.0.0',
        title: 'Backend Promotor API',
        description: 'API documentation for Backend Promotor project',
        contact: {
          name: 'API Support',
        },
      },
      servers: [
        {
          url: process.env.NODE_ENV === 'development'
            ? process.env.API_URL || 'http://localhost:8185'
            : 'https://apipromotor.oficinabrasil.com.br',
          description: 'Development server',
        },
      ],
      tags: [
        { name: 'Campanha', description: 'Operations related to campaigns' }
      ],
      security: [
        {
          bearerAuth: [],
        },
      ],
    });
  }

  getRegistry() {
    return this.registry;
  }
}

export const openAPIGenerator = new OpenAPIDocumentGenerator();