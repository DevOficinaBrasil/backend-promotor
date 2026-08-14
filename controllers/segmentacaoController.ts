import { Request, Response } from "express";
import CampanhaPromotorService from "../service/campanhaPromotorService";
import SegmentacaoService from "../service/segmentacaoService";
import OficinaService from "../service/oficinaService";
import GeolocationService from "../service/geolocationService";

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
