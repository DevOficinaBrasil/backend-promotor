import { Request, Response } from "express";
import OficinaService from "../service/oficinaService";

export default class OficinaController {
  /**
   * Gets the nearest oficinas based on latitude and longitude
   * GET /oficina/nearby
   */
  static getNearbyOficinas = async (req: Request, res: Response) => {
    try {
      const { latitude, longitude, limit } = req.query;

      const lat = parseFloat(latitude as string);
      const lon = parseFloat(longitude as string);
      const maxResults = limit ? parseInt(limit as string, 10) : 40;

      if (isNaN(lat) || isNaN(lon)) {
        return res.status(400).json({
          message: "Latitude e longitude devem ser números válidos.",
        });
      }

      if (lat < -90 || lat > 90) {
        return res.status(400).json({
          message: "Latitude deve estar entre -90 e 90.",
        });
      }

      if (lon < -180 || lon > 180) {
        return res.status(400).json({
          message: "Longitude deve estar entre -180 e 180.",
        });
      }

      if (maxResults < 1 || maxResults > 100) {
        return res.status(400).json({
          message: "Limit deve estar entre 1 e 100.",
        });
      }

      const oficinas = await OficinaService.findNearestOficinas(
        lat,
        lon,
        maxResults
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
