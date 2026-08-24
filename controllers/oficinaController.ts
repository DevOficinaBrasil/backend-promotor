import { Request, Response } from "express";
import OficinaService from "../service/oficinaService";
import SegmentacaoService from "../service/segmentacaoService";

export default class OficinaController {
  /**
   * Gets community nearby oficinas filtered by radius
   * GET /oficina/community-nearby
   */
  static getCommunityNearbyOficinas = async (req: Request, res: Response) => {
    try {
      const { latitude, longitude, radiusKm, empresaSlug } = (req as any).validatedQuery;

      const oficinas = await OficinaService.getComunityNearbyOficinas(
        latitude,
        longitude,
        radiusKm,
        empresaSlug
      );

      return res.status(200).json({
        message: "Oficinas da comunidade encontradas.",
        data: oficinas,
        count: oficinas.length,
      });
    } catch (error) {
      console.error("Erro ao buscar oficinas da comunidade:", error);
      return res.status(500).json({
        message: "Erro interno ao buscar oficinas da comunidade.",
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  };

  /**
   * Lists ALL active oficinas of a client's community that match the
   * segmentação filter defined earlier in the wizard flow (no radius filter).
   * POST /oficina/community-all
   */
  static getCommunityOficinas = async (req: Request, res: Response) => {
    try {
      const { empresaSlug, filtroSegmentacao } = req.body;

      let oficinas;
      if (!filtroSegmentacao) {
        oficinas = await OficinaService.getCommunityOficinas(empresaSlug);
      } else {
        const validation = SegmentacaoService.validateDsl(filtroSegmentacao);
        if (!validation.valid) {
          return res.status(400).json({
            message: "Filtro de segmentação inválido.",
            details: validation.errors,
          });
        }

        const tenantId = await SegmentacaoService.resolveTenantId(empresaSlug);
        if (!tenantId) {
          return res
            .status(404)
            .json({ message: "Comunidade não encontrada para o empresaSlug informado." });
        }

        // Recorta a comunidade inteira (não amostra): a API do CRM devolve no
        // máximo 100 contatos por página, então isto pagina até o teto.
        const MAX_CONTATOS = 5000;
        const preview = await SegmentacaoService.previewContactsAll(
          filtroSegmentacao,
          tenantId,
          MAX_CONTATOS
        );

        oficinas = await OficinaService.getCommunityOficinasSegmentadas(
          empresaSlug,
          preview.externalUserIds
        );
      }

      return res.status(200).json({
        message: "Oficinas da comunidade listadas.",
        data: oficinas,
        count: oficinas.length,
      });
    } catch (error) {
      console.error("Erro ao listar oficinas da comunidade:", error);
      return res.status(500).json({
        message: "Erro interno ao listar oficinas da comunidade.",
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  };

  /**
   * Counts ALL active oficinas of a client's community (no radius/segmentation filter)
   * GET /oficina/community-count
   */
  static getCommunityOficinasCount = async (req: Request, res: Response) => {
    try {
      const { empresaSlug } = (req as any).validatedQuery;

      const count = await OficinaService.countCommunityOficinas(empresaSlug);

      return res.status(200).json({
        message: "Contagem de oficinas da comunidade obtida.",
        empresaSlug,
        count,
      });
    } catch (error) {
      console.error("Erro ao contar oficinas da comunidade:", error);
      return res.status(500).json({
        message: "Erro interno ao contar oficinas da comunidade.",
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  };

  /**
   * Gets the nearest oficinas based on latitude and longitude
   * GET /oficina/nearby
   */
  static getNearbyOficinas = async (req: Request, res: Response) => {
    try {
      // Schema validation is handled by middleware and stored in validatedQuery
      const { latitude, longitude, limit = 40 } = (req as any).validatedQuery;

      const oficinas = await OficinaService.findNearestOficinas(
        latitude,
        longitude,
        limit
      );

      return res.status(200).json({
        message: "Oficinas encontradas com sucesso.",
        data: oficinas,
        count: oficinas.length,
      });
    } catch (error) {
      console.error("Erro ao buscar oficinas próximas:", error);
      return res.status(500).json({
        message: "Erro interno ao buscar oficinas próximas.",
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  };
}
