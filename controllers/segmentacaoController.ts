import { Request, Response } from "express";
import { AppDataSourceSync } from "../data-source";
import CampanhaPromotorService from "../service/campanhaPromotorService";
import SegmentacaoService from "../service/segmentacaoService";
import OficinaService from "../service/oficinaService";
import GeolocationService from "../service/geolocationService";

/**
 * Campos "core" (fora de `contactAttributes.*`) que o CRM remoto resolve com
 * JOIN ao vivo em MAIN_REGISTER, não via CRM.contact_attribute — confirmado
 * batendo `previewOficinasComunidade` com IS_SET em cada um (uma coluna
 * inexistente derruba a query remota com o nome da tabela/coluna no erro).
 * Só os paths abaixo — os mesmos que `ALIAS_CORE` expõe no builder do
 * frontend — têm coluna validada; qualquer outro path cai no fallback vazio.
 */
const CORE_FIELD_TABLE: Record<string, "OFICINA" | "USUARIO"> = {
  "oficina.ELEVADOR": "OFICINA",
  "oficina.QUANTIDADE_ELEVADOR": "OFICINA",
  "oficina.ATIVO": "OFICINA",
  "oficina.CIDADE": "OFICINA",
  "oficina.ESTADO": "OFICINA",
  "oficina.QUANTIDADE_FUNCIONARIOS": "OFICINA",
  "oficina.ESTOQUE_PECAS": "OFICINA",
  "oficina.QUANTIDADE_VEICULOS": "OFICINA",
  "oficina.ORIGEM": "OFICINA",
  "oficina.STATUS": "OFICINA",
  "mainRegisterUser.CARGO": "USUARIO",
  "mainRegisterUser.ATIVO": "USUARIO",
  "mainRegisterUser.ORIGEM": "USUARIO",
  "mainRegisterUser.INTERESSE": "USUARIO",
};

export default class SegmentacaoController {
  /**
   * Retorna os campos e operadores disponíveis no CRM para montar filtros de segmentação.
   * Resolve o tenantId internamente a partir do ID da campanha.
   * GET /segmentacao/getFiltrosSegmentacaoByCampanha/:idCampanha
   */
  static getFiltrosSegmentacaoByCampanha = async (req: Request, res: Response) => {
    try {
      const idCampanha = parseInt(req.params.idCampanha, 10);
      if (isNaN(idCampanha)) {
        return res.status(400).json({ message: "idCampanha inválido." });
      }

      const tenantId = await SegmentacaoService.resolveTenantIdByCampanha(idCampanha);
      if (!tenantId) {
        return res.status(404).json({ message: "Campanha não possui EMPRESA_SLUG ou comunidade não encontrada." });
      }

      const options = await SegmentacaoService.listFilterOptions(tenantId);
      return res.json(options);
    } catch (error) {
      console.error("Erro ao buscar filtros de segmentação:", error);
      return res.status(500).json({
        message: "Erro interno ao buscar filtros de segmentação.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };

  /**
   * Persiste ou atualiza o filtro de segmentação DSL no vínculo campanha-promotor.
   * PUT /segmentacao/updateFiltroSegmentacao/:idCampanhaPromotor
   *
   * @body filtroSegmentacao — Objeto DSL do @obcrm/segmentation (ou null para remover)
   */
  static updateFiltroSegmentacao = async (req: Request, res: Response) => {
    try {
      const idCampanhaPromotor = parseInt(req.params.idCampanhaPromotor, 10);
      if (isNaN(idCampanhaPromotor)) {
        return res.status(400).json({ message: "idCampanhaPromotor inválido." });
      }

      const { filtroSegmentacao } = req.body;

      if (filtroSegmentacao) {
        const validation = SegmentacaoService.validateDsl(filtroSegmentacao);
        if (!validation.valid) {
          return res.status(400).json({
            message: "Filtro de segmentação inválido.",
            details: validation.errors,
          });
        }
      }

      const result = await CampanhaPromotorService.updateFiltroSegmentacao(idCampanhaPromotor, filtroSegmentacao);
      if (!result) {
        return res.status(404).json({ message: "Vínculo campanha-promotor não encontrado." });
      }

      return res.json({
        message: "Filtro de segmentação atualizado.",
        idCampanhaPromotor,
      });
    } catch (error) {
      console.error("Erro ao atualizar filtro de segmentação:", error);
      return res.status(500).json({
        message: "Erro interno ao atualizar filtro de segmentação.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };

  /**
   * Retorna as oficinas que seriam atribuídas dado um filtro, raio e localização.
   * Não cria rotas — serve para o operador validar antes de criar o promotor.
   * POST /segmentacao/previewOficinasSegmentadas
   *
   * @body idCampanha — ID da campanha (resolve tenantId internamente)
   * @body raio — Raio em km a partir da localização
   * @body filtroSegmentacao — DSL de segmentação do CRM
   * @body latitude/longitude — Coordenadas de referência (ou CEP para geocodificar)
   * @body CEP — Alternativa a lat/lon, será geocodificado
   */
  static previewOficinasSegmentadas = async (req: Request, res: Response) => {
    try {
      const { idCampanha, raio, filtroSegmentacao, CEP } = req.body;
      let { latitude, longitude } = req.body;

      // Geocodifica CEP se lat/lon não fornecidos
      if (latitude === undefined || longitude === undefined) {
        const geo = new GeolocationService();
        const coords = await geo.getLatLongByCep(CEP);
        if (!coords) {
          return res.status(400).json({ message: "Não foi possível geocodificar o CEP informado." });
        }
        latitude = coords.lat;
        longitude = coords.long;
      }

      const validation = SegmentacaoService.validateDsl(filtroSegmentacao);
      if (!validation.valid) {
        return res.status(400).json({
          message: "Filtro de segmentação inválido.",
          details: validation.errors,
        });
      }

      const tenantId = await SegmentacaoService.resolveTenantIdByCampanha(idCampanha);
      if (!tenantId) {
        return res.status(404).json({ message: "Campanha não possui EMPRESA_SLUG ou comunidade não encontrada." });
      }

      const PREVIEW_LIMIT = 100;
      const preview = await SegmentacaoService.previewContacts(filtroSegmentacao, tenantId, PREVIEW_LIMIT);

      const oficinas = await OficinaService.getSegmentedNearbyOficinas(
        latitude, longitude, raio, preview.externalUserIds
      );

      return res.json({
        totalOficinasEncontradas: oficinas.length,
        contatosCrmTotal: preview.estimatedCount,
        contatosCrmHasMore: preview.hasMore,
        oficinas,
      });
    } catch (error) {
      console.error("Erro ao gerar preview de oficinas segmentadas:", error);
      return res.status(500).json({
        message: "Erro interno ao gerar preview de oficinas segmentadas.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };

  /**
   * Oficinas da comunidade que atendem à segmentação — sem raio.
   * POST /segmentacao/previewOficinasComunidade
   *
   * Usado pelo passo de segmentação do wizard: a segmentação é definida antes
   * de existir promotor, então aqui não há centro nem raio. O recorte por raio
   * continua em previewOficinasSegmentadas / auto-assign.
   *
   * @body idCampanha — resolve EMPRESA_SLUG e tenantId internamente
   * @body filtroSegmentacao — DSL de segmentação do CRM
   */
  static previewOficinasComunidade = async (req: Request, res: Response) => {
    try {
      const { idCampanha, filtroSegmentacao } = req.body;

      const validation = SegmentacaoService.validateDsl(filtroSegmentacao);
      if (!validation.valid) {
        return res.status(400).json({
          message: "Filtro de segmentação inválido.",
          details: validation.errors,
        });
      }

      const rows = await AppDataSourceSync.query(
        `SELECT "EMPRESA_SLUG" FROM "CAMPANHAS_OB"."CAMPANHA" WHERE "ID_CAMPANHA" = $1 LIMIT 1`,
        [idCampanha]
      );
      const empresaSlug = rows[0]?.EMPRESA_SLUG;
      if (!empresaSlug) {
        return res
          .status(404)
          .json({ message: "Campanha não possui EMPRESA_SLUG." });
      }

      const tenantId = await SegmentacaoService.resolveTenantIdByCampanha(idCampanha);
      if (!tenantId) {
        return res
          .status(404)
          .json({ message: "Comunidade não encontrada para a campanha." });
      }

      // Aqui o objetivo é recortar a comunidade inteira, não amostrar. A API do
      // CRM devolve no máximo 100 contatos por página, então isto pagina até o
      // teto; `truncado` avisa a tela quando não deu para varrer tudo.
      const MAX_CONTATOS = 5000;
      const preview = await SegmentacaoService.previewContactsAll(
        filtroSegmentacao,
        tenantId,
        MAX_CONTATOS
      );

      const oficinas = await OficinaService.getCommunityOficinasSegmentadas(
        empresaSlug,
        preview.externalUserIds
      );

      return res.json({
        totalOficinasEncontradas: oficinas.length,
        contatosCrmTotal: preview.estimatedCount,
        contatosCrmAvaliados: preview.externalUserIds.length,
        contatosCrmHasMore: preview.truncado,
        oficinas,
      });
    } catch (error) {
      console.error("Erro ao gerar preview de oficinas da comunidade:", error);
      return res.status(500).json({
        message: "Erro interno ao gerar preview de oficinas da comunidade.",
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  };

  /**
   * Valores existentes de um atributo de contato, para a tela oferecer um
   * select em vez de texto livre.
   * GET /segmentacao/valoresDeCampo/:idCampanha?path=contactAttributes.gender
   *
   * Lê `CRM.contact_attribute` direto: o CRM não expõe endpoint de valores —
   * `criteria-options` só reorganiza os mesmos campos de `filter-options`.
   * Digitar o valor à mão erra fácil, porque a base tem variações reais como
   * "Médio"/"Medio" e "Masculino"/"M".
   */
  static valoresDeCampo = async (req: Request, res: Response) => {
    try {
      const idCampanha = parseInt(req.params.idCampanha, 10);
      const path = String(req.query.path ?? "");

      if (path.startsWith("contactTagByNameMap.")) {
        // Tag é booleana, não tem domínio de valores.
        return res.status(200).json({ valores: [] });
      }

      const tenantId = await SegmentacaoService.resolveTenantIdByCampanha(idCampanha);
      if (!tenantId) {
        return res
          .status(404)
          .json({ message: "Campanha sem EMPRESA_SLUG ou comunidade não encontrada." });
      }

      const prefixo = "contactAttributes.";
      let linhas: Array<{ valor: string; contatos: number }>;

      if (path.startsWith(prefixo)) {
        const attributeKey = path.slice(prefixo.length);
        linhas = await AppDataSourceSync.query(
          `SELECT ca."attribute_value_json" #>> '{}' AS valor, COUNT(*)::int AS contatos
           FROM "CRM"."contact_attribute" ca
           INNER JOIN "CRM"."contact" ct ON ct."id" = ca."contact_id"
           WHERE ct."tenant_id" = $1 AND ca."attribute_key" = $2
             AND ca."attribute_value_json" #>> '{}' IS NOT NULL
             AND ca."attribute_value_json" #>> '{}' <> ''
           GROUP BY 1
           ORDER BY contatos DESC, valor ASC
           LIMIT 50`,
          [tenantId, attributeKey]
        );
      } else {
        const tabela = CORE_FIELD_TABLE[path];
        if (!tabela) {
          // Path core sem coluna validada (ou desconhecido) — sem domínio de
          // valores pra oferecer com segurança.
          return res.status(200).json({ valores: [] });
        }

        // Mesmo JOIN ao vivo que o CRM remoto usa pra resolver campos core:
        // contato → USUARIO pelo external_user_id, e OFICINA quando o path
        // pede um campo da oficina. A coluna vem só do whitelist acima —
        // nunca de `path` interpolado direto — pra não abrir injeção de SQL.
        const coluna = path.split(".")[1];
        const query =
          tabela === "OFICINA"
            ? `SELECT o."${coluna}"::text AS valor, COUNT(*)::int AS contatos
               FROM "CRM"."contact" ct
               INNER JOIN "MAIN_REGISTER"."USUARIO" us ON us."ID_USUARIO" = ct."external_user_id"
               INNER JOIN "MAIN_REGISTER"."OFICINA" o ON o."ID_OFICINA" = us."ID_OFICINA"
               WHERE ct."tenant_id" = $1
                 AND o."${coluna}" IS NOT NULL AND o."${coluna}"::text <> ''
               GROUP BY 1
               ORDER BY contatos DESC, valor ASC
               LIMIT 50`
            : `SELECT us."${coluna}"::text AS valor, COUNT(*)::int AS contatos
               FROM "CRM"."contact" ct
               INNER JOIN "MAIN_REGISTER"."USUARIO" us ON us."ID_USUARIO" = ct."external_user_id"
               WHERE ct."tenant_id" = $1
                 AND us."${coluna}" IS NOT NULL AND us."${coluna}"::text <> ''
               GROUP BY 1
               ORDER BY contatos DESC, valor ASC
               LIMIT 50`;

        linhas = await AppDataSourceSync.query(query, [tenantId]);
      }

      return res.status(200).json({ valores: linhas });
    } catch (error) {
      console.error("Erro ao listar valores do campo:", error);
      return res.status(500).json({
        message: "Erro interno ao listar valores do campo.",
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  };

  /**
   * Debug: retorna contatos brutos do CRM que atendem ao filtro salvo no vínculo.
   * POST /segmentacao/previewContatosCrm/:idCampanhaPromotor
   */
  static previewContatosCrm = async (req: Request, res: Response) => {
    try {
      const idCampanhaPromotor = parseInt(req.params.idCampanhaPromotor, 10);
      if (isNaN(idCampanhaPromotor)) {
        return res.status(400).json({ message: "idCampanhaPromotor inválido." });
      }

      const { limit } = req.body;

      const data = await CampanhaPromotorService.getFiltroSegmentacao(idCampanhaPromotor);
      if (!data) {
        return res.status(404).json({ message: "Vínculo campanha-promotor não encontrado." });
      }
      if (!data.filtro) {
        return res.status(400).json({ message: "Nenhum filtro de segmentação definido para este vínculo." });
      }
      if (!data.empresaSlug) {
        return res.status(400).json({ message: "Campanha não possui EMPRESA_SLUG configurado." });
      }

      const tenantId = await SegmentacaoService.resolveTenantId(data.empresaSlug);
      if (!tenantId) {
        return res.status(400).json({ message: "Comunidade não encontrada para o EMPRESA_SLUG da campanha." });
      }

      const preview = await SegmentacaoService.previewContacts(data.filtro, tenantId, limit ?? 20);
      return res.json({
        estimatedCount: preview.estimatedCount,
        hasMore: preview.hasMore,
        sampleArray: preview.sampleArray,
      });
    } catch (error) {
      console.error("Erro ao gerar preview de contatos CRM:", error);
      return res.status(500).json({
        message: "Erro interno ao gerar preview de contatos CRM.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };

  /**
   * Debug: chama previewSegmentDefinition diretamente com tenantId + DSL.
   * POST /segmentacao/debugPreviewCrm
   */
  static debugPreviewCrm = async (req: Request, res: Response) => {
    try {
      const { tenantId, filtroSegmentacao, limit } = req.body;

      const { previewSegmentDefinition } = require("@obcrm/segmentation");
      const result = await previewSegmentDefinition(filtroSegmentacao, {
        tenantId,
        limit: limit ?? 20,
        includeEstimatedCount: true,
        accessToken: process.env.CRM_API_TOKEN!,
      });

      return res.json(result);
    } catch (error) {
      console.error("Erro no debugPreviewCrm:", error);
      return res.status(500).json({
        message: "Erro ao chamar previewSegmentDefinition.",
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  };
}
