import { Request, Response } from "express";
import RotaService from "../service/rotaService";
import RotaPromotor, { StatusRota } from "../entities/RotaPromotor";

export default class RotaController {
  /**
   * Creates one or multiple routes
   * POST /rota/create
   */
  static createRotas = async (req: Request, res: Response) => {
    try {
      const { ID_CAMPANHA_PROMOTOR, ID_OFICINA, CREATED_BY } = req.body;

      // Call the service to create the route(s)
      const novasRotas = await RotaService.createRotas(
        ID_CAMPANHA_PROMOTOR,
        ID_OFICINA,
        CREATED_BY
      );

      return res.status(201).json({
        message: Array.isArray(novasRotas)
          ? "Rotas criadas com sucesso."
          : "Rota criada com sucesso.",
        data: novasRotas,
      });
    } catch (error) {
      console.error("Erro ao criar rota(s):", error);
      return res.status(500).json({
        message: "Erro interno ao criar rota(s).",
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  };

  /**
   * Updates workshops for a route (campaign promoter)
   * PUT /rota/workshops
   */
  static updateRotaWorkshops = async (req: Request, res: Response) => {
    try {
      const { ID_CAMPANHA_PROMOTOR, ID_OFICINA } = req.body;

      // Call the service to update workshops
      const resultado = await RotaService.updateRotaWorkshops(
        ID_CAMPANHA_PROMOTOR,
        ID_OFICINA
      );

      return res.status(200).json({
        message: "Oficinas da rota atualizadas com sucesso.",
        data: resultado,
      });
    } catch (error) {
      console.error("Erro ao atualizar oficinas da rota:", error);
      return res.status(500).json({
        message: "Erro interno ao atualizar oficinas da rota.",
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  };

  /**
   * Updates a route's options (not the workshops)
   * PUT /rota/:id/options
   */
  static updateRotaOptions = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const rotaId = parseInt(id, 10);

      if (isNaN(rotaId)) {
        return res.status(400).json({
          message: "ID da rota inválido.",
        });
      }

      const { STATUS, SUCCESS, CHECKIN_TIME, DONE_AT, OBS } = req.body;

      // Check if route exists
      const rotaExistente = await RotaService.findRotaById(rotaId);

      if (!rotaExistente) {
        return res.status(404).json({
          message: "Rota não encontrada.",
        });
      }

      // Create update data object (only include provided fields)
      const updateData: Partial<RotaPromotor> = {};
      if (STATUS !== undefined) updateData.STATUS = STATUS as StatusRota;
      if (SUCCESS !== undefined) updateData.SUCCESS = SUCCESS;
      if (CHECKIN_TIME !== undefined)
        updateData.CHECKIN_TIME = new Date(CHECKIN_TIME);
      if (DONE_AT !== undefined) updateData.DONE_AT = new Date(DONE_AT);
      if (OBS !== undefined) updateData.OBS = OBS;

      // Call the service to update the route
      const rotaAtualizada = await RotaService.updateRotaOptions(
        rotaId,
        updateData
      );

      return res.status(200).json({
        message: "Rota atualizada com sucesso.",
        data: rotaAtualizada,
      });
    } catch (error) {
      console.error("Erro ao atualizar rota:", error);
      return res.status(500).json({
        message: "Erro interno ao atualizar rota.",
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  };

  /**
   * Gets a route by ID with its relationships
   * GET /rota/:id
   */
  static getRotaByIdROTA_PROMOTOR = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const rotaId = parseInt(id, 10);

      if (isNaN(rotaId)) {
        return res.status(400).json({
          message: "ID da rota inválido.",
        });
      }

      const rota = await RotaService.getRotaByIdWithRelations(rotaId);

      if (!rota) {
        return res.status(404).json({
          message: "Rota não encontrada.",
        });
      }

      return res.status(200).json({
        message: "Rota encontrada com sucesso.",
        data: rota,
      });
    } catch (error) {
      console.error("Erro ao buscar rota:", error);
      return res.status(500).json({
        message: "Erro interno ao buscar rota.",
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  };
}
