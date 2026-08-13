import { Router } from "express";
import SegmentacaoController from "../controllers/segmentacaoController";
import { createDocumentedRoute } from "../utils/routeDocumentation";
import {
  UpdateFiltroSegmentacaoSchema,
  PreviewSegmentacaoSchema,
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

// Preview de contatos que atendem ao filtro salvo (sem criar rotas)
createDocumentedRoute(router, {
  method: 'post',
  path: '/previewSegmentacao/:idCampanhaPromotor',
  handler: SegmentacaoController.previewSegmentacao,
  basePath: '/segmentacao',
  middlewares: [],
  schemas: {
    params: CampanhaPromotorIdParamsSchema,
    body: PreviewSegmentacaoSchema,
  },
  documentation: {
    tags: ['Segmentação'],
    summary: 'Preview de contatos segmentados',
    description: 'Executa o filtro de segmentação salvo no CRM e retorna uma amostra de contatos que atendem aos critérios. Não cria rotas — serve para o operador validar o filtro antes de confirmar.',
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

export default router;
