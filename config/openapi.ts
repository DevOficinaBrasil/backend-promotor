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
        title: 'Backend Hijack API',
        description: 'API documentation for Backend Hijack project',
        contact: {
          name: 'API Support',
        },
      },
      servers: [
        {
          url: process.env.NODE_ENV === 'development'
            ? process.env.API_URL || 'http://localhost:8185'
            : 'https://manualadmin.oficinabrasil.com.br',
          description: 'Development server',
        },
      ],
      tags: [
        { name: 'Marca', description: 'Operations related to marcas' },
        { name: 'Modelo', description: 'Operations related to modelos' },
        { name: 'Versao', description: 'Operations related to versões' },
        { name: 'Sistema', description: 'Operations related to sistemas' },
        { name: 'Peca', description: 'Operations related to peças' },
        { name: 'Manual', description: 'Operations related to manuais' },
        { name: 'ManualUsuario', description: 'Operations related to manuais usuario' },
        { name: 'ManualSolicitacao', description: 'Operations related to manual solicitacao' },
        { name: 'ManualSteps', description: 'Operations related to manual steps' },
        { name: 'Logs', description: 'Operations related to logs' },
        { name: "UsuarioSatisfacao", description: "Operations related to UsuarioSatisfacao" },
        { name: 'SolicitacaoAcessoAntecipado', description: 'Operations related to solicitacao acesso antecipado' },
        { name: 'RAG', description: 'Operations related to Retrieval-Augmented Generation' },
        { name: 'ManualFonte', description: 'Operations related to manual fontes' },
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