import { Request, Response } from "express";
import OficinaService from "../service/oficinaService";

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
   * Lists ALL active oficinas of a client's community (no radius filter)
   * GET /oficina/community-all
   */
  static getCommunityOficinas = async (req: Request, res: Response) => {
    try {
      const { empresaSlug } = (req as any).validatedQuery;

      const oficinas = await OficinaService.getCommunityOficinas(empresaSlug);

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
