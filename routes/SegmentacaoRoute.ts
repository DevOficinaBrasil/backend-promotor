import { Router } from "express";
import SegmentacaoController from "../controllers/segmentacaoController";
import { createDocumentedRoute } from "../utils/routeDocumentation";
import {
  UpdateFiltroSegmentacaoSchema,
  PreviewSegmentacaoSchema,
  PreviewOficinasSegmentadasSchema,
  DebugPreviewCrmSchema,
  CampanhaIdParamsSchema,
  CampanhaPromotorIdParamsSchema,
} from "../schemas/segmentacao";
import { ErrorResponseSchema } from "../schemas/common";

const router = Router();

// Retorna campos e operadores disponíveis para segmentação de uma campanha
createDocumentedRoute(router, {
  method: 'get',
  path: '/getFiltrosSegmentacaoByCampanha/:idCampanha',
  handler: SegmentacaoController.getFiltrosSegmentacaoByCampanha,
  basePath: '/segmentacao',
  middlewares: [],
  schemas: {
    params: CampanhaIdParamsSchema,
  },
  documentation: {
    tags: ['Segmentação'],
    summary: 'Buscar filtros de segmentação disponíveis por campanha',
    description: 'Retorna os campos (path, label, valueType, operatorArray) e operadores disponíveis no CRM para a campanha informada. O tenantId é resolvido internamente via EMPRESA_SLUG da campanha.',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Filtros retornados com sucesso — fieldOptionArray e operatorCatalogArray',
      },
      400: {
        description: 'idCampanha inválido',
        schema: ErrorResponseSchema,
      },
      404: {
        description: 'Campanha sem EMPRESA_SLUG ou comunidade não encontrada',
        schema: ErrorResponseSchema,
      },
      500: {
        description: 'Erro interno',
        schema: ErrorResponseSchema,
      },
    },
  },
});

// Persiste ou atualiza filtro de segmentação no vínculo campanha-promotor
createDocumentedRoute(router, {
  method: 'put',
  path: '/updateFiltroSegmentacao/:idCampanhaPromotor',
  handler: SegmentacaoController.updateFiltroSegmentacao,
  basePath: '/segmentacao',
  middlewares: [],
  schemas: {
    params: CampanhaPromotorIdParamsSchema,
    body: UpdateFiltroSegmentacaoSchema,
  },
  documentation: {
    tags: ['Segmentação'],
    summary: 'Atualizar filtro de segmentação',
    description: `Persiste a DSL JSON de segmentação (@obcrm/segmentation) no vínculo CAMPANHA_PROMOTOR. Envie filtroSegmentacao: null para remover o filtro.

**Estrutura do body:**
\`\`\`json
{
  "filtroSegmentacao": {
    "if": {
      "and": [
        { "equals": ["contact.professionalOccupation", "Trabalho na área de Mecânica"] },
        { "in": ["contact.state", ["SP", "RJ", "MG"]] }
      ]
    },
    "then": { "decision": "include", "reason": "segment_rule_matched" },
    "default": { "decision": "exclude", "reason": "default_exclude" }
  }
}
\`\`\`

**Operadores disponíveis no \`if\`:**
- \`equals\`: \`{ "equals": ["<campo>", <valor>] }\`
- \`in\`: \`{ "in": ["<campo>", [<valor1>, <valor2>]] }\`
- \`gt\` / \`gte\` / \`lt\` / \`lte\`: \`{ "gte": ["<campo>", <numero>] }\`
- \`exists\`: \`{ "exists": "<campo>" }\`
- \`and\`: \`{ "and": [<condição1>, <condição2>] }\`
- \`or\`: \`{ "or": [<condição1>, <condição2>] }\`
- \`not\`: \`{ "not": <condição> }\`

Os campos disponíveis (\`contact.professionalOccupation\`, \`contact.state\`, etc.) são retornados pelo endpoint \`GET /segmentacao/getFiltrosSegmentacaoByCampanha/:idCampanha\`.`,
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Filtro atualizado com sucesso',
      },
      400: {
        description: 'DSL inválida — retorna details com os erros de validação',
        schema: ErrorResponseSchema,
      },
      404: {
        description: 'Vínculo campanha-promotor não encontrado',
        schema: ErrorResponseSchema,
      },
      500: {
        description: 'Erro interno',
        schema: ErrorResponseSchema,
      },
    },
  },
});

// Preview de oficinas que seriam atribuídas dado filtro + raio + localização
createDocumentedRoute(router, {
  method: 'post',
  path: '/previewOficinasSegmentadas',
  handler: SegmentacaoController.previewOficinasSegmentadas,
  basePath: '/segmentacao',
  middlewares: [],
  schemas: {
    body: PreviewOficinasSegmentadasSchema,
  },
  documentation: {
    tags: ['Segmentação'],
    summary: 'Preview de oficinas segmentadas',
    description: `Retorna as oficinas que seriam atribuídas ao promotor considerando o filtro de segmentação CRM, o raio e a localização de referência. Não cria rotas — serve para o operador validar antes de criar o promotor.

**Body:**
\`\`\`json
{
  "idCampanha": 123,
  "raio": 20,
  "filtroSegmentacao": {
    "if": { "equals": ["contact.professionalOccupation", "Mecânico"] },
    "then": { "decision": "include", "reason": "segment_rule_matched" },
    "default": { "decision": "exclude", "reason": "default_exclude" }
  },
  "latitude": -23.55,
  "longitude": -46.63
}
\`\`\`

Ou com CEP (será geocodificado):
\`\`\`json
{
  "idCampanha": 123,
  "raio": 20,
  "filtroSegmentacao": { ... },
  "CEP": "01001-000"
}
\`\`\``,
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Preview gerado — totalOficinasEncontradas, contatosCrmTotal, oficinas[]',
      },
      400: {
        description: 'Filtro inválido, CEP não geocodificável ou parâmetros ausentes',
        schema: ErrorResponseSchema,
      },
      404: {
        description: 'Campanha sem EMPRESA_SLUG ou comunidade não encontrada',
        schema: ErrorResponseSchema,
      },
      500: {
        description: 'Erro interno',
        schema: ErrorResponseSchema,
      },
    },
  },
});

// Debug: preview de contatos brutos do CRM (sem cálculo de oficinas)
createDocumentedRoute(router, {
  method: 'post',
  path: '/previewContatosCrm/:idCampanhaPromotor',
  handler: SegmentacaoController.previewContatosCrm,
  basePath: '/segmentacao',
  middlewares: [],
  schemas: {
    params: CampanhaPromotorIdParamsSchema,
    body: PreviewSegmentacaoSchema,
  },
  documentation: {
    tags: ['Segmentação'],
    summary: 'Debug: preview de contatos CRM',
    description: 'Retorna os contatos brutos do CRM que atendem ao filtro de segmentação salvo no vínculo campanha-promotor. Endpoint de debug — não retorna oficinas, apenas contatos.',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Preview gerado — estimatedCount, hasMore, sampleArray',
      },
      400: {
        description: 'Nenhum filtro definido ou campanha sem EMPRESA_SLUG',
        schema: ErrorResponseSchema,
      },
      404: {
        description: 'Vínculo campanha-promotor não encontrado',
        schema: ErrorResponseSchema,
      },
      500: {
        description: 'Erro interno',
        schema: ErrorResponseSchema,
      },
    },
  },
});

// Debug: chama previewSegmentDefinition diretamente
createDocumentedRoute(router, {
  method: 'post',
  path: '/debugPreviewCrm',
  handler: SegmentacaoController.debugPreviewCrm,
  basePath: '/segmentacao',
  middlewares: [],
  schemas: {
    body: DebugPreviewCrmSchema,
  },
  documentation: {
    tags: ['Segmentação'],
    summary: 'Debug: previewSegmentDefinition direto',
    description: 'Chama previewSegmentDefinition do @obcrm/segmentation com tenantId e DSL informados. Retorna resposta bruta do CRM sem processamento.',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Resposta bruta do CRM — sampleArray, estimatedCount, hasMore',
      },
      500: {
        description: 'Erro na chamada ao CRM',
        schema: ErrorResponseSchema,
      },
    },
  },
});

export default router;
