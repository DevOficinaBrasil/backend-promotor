import { Router, Request, Response, NextFunction } from "express";
import OficinaController from "../controllers/oficinaController";
import { createDocumentedRoute } from "../utils/routeDocumentation";
import uploadPlanilha from "../middlewares/uploadPlanilha";

import {
  GetOficinasByLocationQuerySchema,
  GetOficinasByLocationResponseSchema,
  GetCommunityNearbyQuerySchema,
  GetCommunityNearbyResponseSchema,
  GetCommunityAllBodySchema,
  GetCommunityAllResponseSchema,
  GetCommunityCountQuerySchema,
  GetCommunityCountResponseSchema,
  ImportOficinasResponseSchema,
} from "../schemas/oficina";
import { ErrorResponseSchema } from "../schemas/common";

const router = Router();

/**
 * Wraps `uploadPlanilha` so a fileFilter rejection (extension/size) reaches
 * the client as a clean 400 JSON response instead of falling through to
 * Express's default error handler.
 */
function uploadPlanilhaComErro(req: Request, res: Response, next: NextFunction) {
  uploadPlanilha.single("file")(req, res, (err: unknown) => {
    if (err) {
      return res.status(400).json({
        message: err instanceof Error ? err.message : "Arquivo inválido.",
      });
    }
    next();
  });
}

// Get nearby oficinas by latitude and longitude
createDocumentedRoute(router, {
  method: "get",
  path: "/nearby",
  handler: OficinaController.getNearbyOficinas,
  basePath: "/oficina",
  middlewares: [],
  schemas: {
    query: GetOficinasByLocationQuerySchema,
  },
  documentation: {
    tags: ["Oficina"],
    summary: "Get nearby oficinas by geolocation",
    description:
      "Returns the nearest oficinas based on latitude and longitude coordinates. " +
      "Uses the Haversine formula to calculate distances. " +
      "Returns up to 40 results by default (customizable via limit parameter).",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "Oficinas found successfully",
        schema: GetOficinasByLocationResponseSchema,
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

// Get community nearby oficinas filtered by radius
createDocumentedRoute(router, {
  method: "get",
  path: "/community-nearby",
  handler: OficinaController.getCommunityNearbyOficinas,
  basePath: "/oficina",
  middlewares: [],
  schemas: {
    query: GetCommunityNearbyQuerySchema,
  },
  documentation: {
    tags: ["Oficina"],
    summary: "Get community nearby oficinas by geolocation and radius",
    description:
      "Returns oficinas from community members within a given radius. " +
      "Uses the Haversine formula to filter by distance. " +
      "Filters by EmpresaSlug to scope to a specific community.",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "Community oficinas found successfully",
        schema: GetCommunityNearbyResponseSchema,
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

// List ALL active community oficinas, optionally matching a segmentação filter (no radius filter)
createDocumentedRoute(router, {
  method: "post",
  path: "/community-all",
  handler: OficinaController.getCommunityOficinas,
  basePath: "/oficina",
  middlewares: [],
  schemas: {
    body: GetCommunityAllBodySchema,
  },
  documentation: {
    tags: ["Oficina"],
    summary: "List all active community oficinas, optionally matching a segmentação filter",
    description: `Retorna toda oficina ATIVA da comunidade do \`empresaSlug\` informado, sem recorte de raio. Usado pelo mapa do wizard de campanha, no passo exibido logo após a segmentação, para plotar as oficinas elegíveis.

\`filtroSegmentacao\` é opcional: quando omitido ou \`null\`, retorna todas as oficinas ativas da comunidade, sem filtro do CRM. Quando informado, retorna apenas as oficinas que atendem à DSL.

**Estrutura do body:**
\`\`\`json
{
  "empresaSlug": "oficina-exemplo",
  "filtroSegmentacao": {
    "if": {
      "behavior": {
        "section": "LEAD_DATA",
        "criterion": "LEAD_FIELD",
        "value": {
          "fieldKey": "professionalOccupation",
          "fieldType": "text",
          "operator": "EQUALS",
          "value": "Mecânico"
        }
      }
    },
    "then": { "decision": "include", "reason": "segment_rule_matched" },
    "default": { "decision": "exclude", "reason": "default_exclude" }
  }
}
\`\`\`

**Estrutura do behavior:**
- \`section\`: \`"LEAD_DATA"\`
- \`criterion\`: \`"LEAD_FIELD"\`
- \`value.fieldKey\`: nome do campo (ex: \`"gender"\`, \`"professionalOccupation"\`). Usar apenas o nome do campo, sem prefixo.
- \`value.fieldType\`: \`"text"\`, \`"number"\`, etc.
- \`value.operator\`: \`"EQUALS"\`, \`"EXISTS"\`, \`"IN"\`, \`"GT"\`, \`"GTE"\`, \`"LT"\`, \`"LTE"\`
- \`value.value\`: valor para comparação (\`true\` para EXISTS)

Combine condições com \`and\`, \`or\`, \`not\`. Campos disponíveis via \`GET /segmentacao/getFiltrosSegmentacaoByCampanha/:idCampanha\`.`,
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "Community oficinas listed successfully",
        schema: GetCommunityAllResponseSchema,
      },
      400: {
        description: "Bad request - validation error, or invalid filtroSegmentacao DSL",
        schema: ErrorResponseSchema,
      },
      401: {
        description: "Unauthorized - token missing or invalid",
        schema: ErrorResponseSchema,
      },
      404: {
        description: "Comunidade não encontrada para o empresaSlug informado",
        schema: ErrorResponseSchema,
      },
      500: {
        description: "Internal server error",
        schema: ErrorResponseSchema,
      },
    },
  },
});

// Count ALL active community oficinas (no radius/segmentation filter)
createDocumentedRoute(router, {
  method: "get",
  path: "/community-count",
  handler: OficinaController.getCommunityOficinasCount,
  basePath: "/oficina",
  middlewares: [],
  schemas: {
    query: GetCommunityCountQuerySchema,
  },
  documentation: {
    tags: ["Oficina"],
    summary: "Count all active community oficinas",
    description:
      "Retorna o total de oficinas ATIVAS da comunidade do EmpresaSlug informado, " +
      "sem recorte de raio nem filtro de segmentação.",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "Contagem obtida com sucesso",
        schema: GetCommunityCountResponseSchema,
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

// Import oficinas from a planilha (.xlsx/.csv), linking them to a campanha's client
createDocumentedRoute(router, {
  method: "post",
  path: "/import",
  handler: OficinaController.importOficinas,
  basePath: "/oficina",
  middlewares: [uploadPlanilhaComErro],
  documentation: {
    tags: ["Oficina"],
    summary: "Importa oficinas de uma planilha vinculada a uma campanha",
    description:
      "Recebe um arquivo `.xlsx`/`.csv` (multipart/form-data, campo `file`) e `ID_CAMPANHA` " +
      "(campo de texto do form). A planilha deve ter exatamente as colunas " +
      "`NOME OFICINA; CNPJ; CEP; ENDEREÇO; NUMERO; BAIRRO; ESTADO; CIDADE`, nessa ordem " +
      "(comparação case/acento-insensível) — fora do padrão, o arquivo inteiro é rejeitado " +
      "sem nenhuma escrita. `EMPRESA_SLUG` é resolvido no servidor a partir de `ID_CAMPANHA`, " +
      "nunca aceito do cliente. Deduplica por CNPJ contra `MAIN_REGISTER.OFICINA`, geocodifica " +
      "o CEP quando faltam lat/long, vincula a oficina ao cliente mesmo sem usuário, e tenta " +
      "atribuir rota do promotor. Erros de linha (CNPJ inválido/duplicado, geocodificação " +
      "malsucedida) não abortam o arquivo — vêm reportados em `data.erros`.",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "Planilha processada (pode conter linhas rejeitadas em data.erros)",
        schema: ImportOficinasResponseSchema,
      },
      400: {
        description:
          "Arquivo inválido (extensão/tamanho), cabeçalho fora do padrão, limite de linhas excedido, ou ID_CAMPANHA inválido",
        schema: ErrorResponseSchema,
      },
      404: { description: "Campanha não encontrada", schema: ErrorResponseSchema },
      422: { description: "Campanha sem EMPRESA_SLUG configurado", schema: ErrorResponseSchema },
      500: { description: "Erro interno", schema: ErrorResponseSchema },
    },
  },
});

export default router;
