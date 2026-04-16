import { Request, Response } from "express";
import RotaService from "../service/rotaService";
import RotaPromotor, { StatusRota, RedirectRota } from "../entities/RotaPromotor";

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
   * Creates a campaign promoter and its associated routes with workshops
   * POST /rota/create-with-campanha-promotor
   */
  static createRotaWithCampanhaPromotor = async (req: Request, res: Response) => {
    try {
      const { ID_PROMOTOR, ID_CAMPANHA, ID_OFICINA, CREATED_BY } = req.body;

      // Call the service to create the campaign promoter and routes
      const resultado = await RotaService.createRotaWithCampanhaPromotor(
        ID_PROMOTOR,
        ID_CAMPANHA,
        ID_OFICINA,
        CREATED_BY
      );

      return res.status(201).json({
        message: "Campanha promotor e rotas criadas com sucesso.",
        data: resultado,
      });
    } catch (error) {
      console.error("Erro ao criar campanha promotor e rotas:", error);
      return res.status(500).json({
        message: "Erro interno ao criar campanha promotor e rotas.",
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

      const { STATUS, SUCCESS, CHECKIN_TIME, DONE_AT, OBS, REDIRECT } = req.body;

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
      if (REDIRECT !== undefined) updateData.REDIRECT = REDIRECT as RedirectRota;

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

    /**
   * Gets geolocation data by CEP
   * POST /rota/geolocation
   */
  static getGeolocationDataByCep = async (req: Request, res: Response) => {
    try {
      const { cep } = req.body;
      if (!cep || typeof cep !== 'string' || cep.length < 8) {
        return res.status(400).json({
          message: 'CEP inválido.',
          data: null,
        });
      }
      const location = await RotaService.getGeolocationDataByCep(cep);
      return res.status(200).json({
        message: location ? 'Geolocalização encontrada.' : 'Geolocalização não encontrada.',
        data: location,
      });
    } catch (error) {
      console.error('Erro ao buscar geolocalização por CEP:', error);
      return res.status(500).json({
        message: 'Erro interno ao buscar geolocalização.',
        data: null,
      });
    }
  };

  /**
   * Calcula rota otimizada A→B
   * POST /rota/optimize
   */
  static optimizeRoute = async (req: Request, res: Response) => {
    try {
      const { ID_CAMPANHA_PROMOTOR, ID_OFICINA_INICIO, ID_OFICINA_FIM } = req.body;

      const result = await RotaService.optimizeAndSaveRoute(
        ID_CAMPANHA_PROMOTOR,
        ID_OFICINA_INICIO,
        ID_OFICINA_FIM
      );

      return res.status(200).json({
        message: "Rota otimizada com sucesso.",
        data: result,
      });
    } catch (error) {
      console.error("Erro ao otimizar rota:", error);
      return res.status(400).json({
        message: error instanceof Error ? error.message : "Erro ao otimizar rota.",
      });
    }
  };

  /**
   * Reordena rotas (MANUAL ou PROXIMIDADE_PROMOTOR)
   * PUT /rota/reorder
   */
  static reorderRotas = async (req: Request, res: Response) => {
    try {
      const { ID_CAMPANHA_PROMOTOR, ESTRATEGIA_ORDENACAO, rotas } = req.body;

      const result = await RotaService.reorderRotas(
        ID_CAMPANHA_PROMOTOR,
        ESTRATEGIA_ORDENACAO,
        rotas
      );

      return res.status(200).json({
        message: "Rotas reordenadas com sucesso.",
        data: result,
      });
    } catch (error) {
      console.error("Erro ao reordenar rotas:", error);
      return res.status(400).json({
        message: error instanceof Error ? error.message : "Erro ao reordenar rotas.",
      });
    }
  };
}
