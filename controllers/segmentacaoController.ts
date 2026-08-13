import { Request, Response } from "express";
import CampanhaPromotorService from "../service/campanhaPromotorService";
import SegmentacaoService from "../service/segmentacaoService";

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
   * Retorna preview dos contatos que atendem ao filtro de segmentação salvo,
   * sem criar rotas. Útil para o operador validar o filtro antes de confirmar.
   * POST /segmentacao/previewSegmentacao/:idCampanhaPromotor
   *
   * @body limit — Quantidade máxima de contatos no preview (default 20, max 100)
   */
  static previewSegmentacao = async (req: Request, res: Response) => {
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
      console.error("Erro ao gerar preview de segmentação:", error);
      return res.status(500).json({
        message: "Erro interno ao gerar preview de segmentação.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };
}
