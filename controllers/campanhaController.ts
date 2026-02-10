import { Request, Response } from "express";
import CampanhaService from "../service/campanhaService";

export default class CampanhaController {
  /**
   * Creates a new campaign
   * POST /campanha
   */
  static createCampanha = async (req: Request, res: Response) => {
    try {
      const {
        NOME,
        OBJETIVO,
        ID_CLIENT,
        START_TIME,
        END_TIME,
        CREATED_BY
      } = req.body;

      // Validate required fields
      if (!NOME) {
        return res.status(400).json({ 
          message: "O campo NOME é obrigatório." 
        });
      }

      // Create campaign data object
      const campanhaData = {
        NOME,
        OBJETIVO,
        ID_CLIENT,
        START_TIME: START_TIME ? new Date(START_TIME) : undefined,
        END_TIME: END_TIME ? new Date(END_TIME) : undefined,
        CREATED_BY
      };

      // Call the service to create the campaign
      const novaCampanha = await CampanhaService.createCampanha(campanhaData);

      return res.status(201).json({
        message: "Campanha criada com sucesso.",
        data: novaCampanha
      });
    } catch (error) {
      console.error("Erro ao criar campanha:", error);
      return res.status(500).json({
        message: "Erro interno ao criar campanha.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };

  /**
   * Updates an existing campaign
   * PUT /campanha/:id
   */
  static updateCampanha = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const campanhaId = parseInt(id, 10);

      if (isNaN(campanhaId)) {
        return res.status(400).json({
          message: "ID da campanha inválido."
        });
      }

      const {
        NOME,
        OBJETIVO,
        ID_CLIENT,
        START_TIME,
        END_TIME,
        CREATED_BY
      } = req.body;

      // Check if campaign exists
      const campanhaExistente = await CampanhaService.findCampanhaById(campanhaId);
      
      if (!campanhaExistente) {
        return res.status(404).json({
          message: "Campanha não encontrada."
        });
      }

      // Create update data object (only include provided fields)
      const updateData: any = {};
      if (NOME !== undefined) updateData.NOME = NOME;
      if (OBJETIVO !== undefined) updateData.OBJETIVO = OBJETIVO;
      if (ID_CLIENT !== undefined) updateData.ID_CLIENT = ID_CLIENT;
      if (START_TIME !== undefined) updateData.START_TIME = new Date(START_TIME);
      if (END_TIME !== undefined) updateData.END_TIME = new Date(END_TIME);
      if (CREATED_BY !== undefined) updateData.CREATED_BY = CREATED_BY;

      // Call the service to update the campaign
      const campanhaAtualizada = await CampanhaService.updateCampanha(campanhaId, updateData);

      return res.status(200).json({
        message: "Campanha atualizada com sucesso.",
        data: campanhaAtualizada
      });
    } catch (error) {
      console.error("Erro ao atualizar campanha:", error);
      return res.status(500).json({
        message: "Erro interno ao atualizar campanha.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };

  /**
   * Soft deletes a campaign
   * DELETE /campanha/delete/:id
   */
  static deleteCampanha = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const campanhaId = parseInt(id, 10);

      // Check if campaign exists
      const campanhaExistente = await CampanhaService.findCampanhaById(campanhaId);
      
      if (!campanhaExistente) {
        return res.status(404).json({
          message: "Campanha não encontrada."
        });
      }

      // Call the service to soft delete the campaign
      await CampanhaService.deleteCampanha(campanhaId);

      return res.status(200).json({
        message: "Campanha deletada com sucesso.",
        data: campanhaExistente
      });
    } catch (error) {
      console.error("Erro ao deletar campanha:", error);
      return res.status(500).json({
        message: "Erro interno ao deletar campanha.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };

  /**
   * Gets the active campaign for a promoter
   * GET /campanha/ativa?ID_PROMOTOR=X&datetime=Y
   */
  static getCampanhaAtiva = async (req: Request, res: Response) => {
    try {
      // Use validated query data from validation middleware
      const validatedQuery = (req as any).validatedQuery || {};
      const { ID_PROMOTOR, datetime } = validatedQuery;

      // Parse datetime if provided, otherwise use current time
      const currentDatetime = datetime ? new Date(datetime) : new Date();

      // Get the active campaign
      const campanhaAtiva = await CampanhaService.getActiveCampanhaByPromotor(
        ID_PROMOTOR,
        currentDatetime
      );

      if (!campanhaAtiva) {
        return res.status(200).json({
          message: "Nenhuma campanha ativa encontrada para este promotor.",
          data: null
        });
      }

      return res.status(200).json({
        message: "Campanha ativa encontrada com sucesso.",
        data: campanhaAtiva
      });
    } catch (error) {
      console.error("Erro ao buscar campanha ativa:", error);
      return res.status(500).json({
        message: "Erro interno ao buscar campanha ativa.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };

  /**
   * Gets all campaigns
   * GET /campanha
   */
  static getAllCampanha = async (req: Request, res: Response) => {
    try {
      const campanhas = await CampanhaService.getAllCampanhas();

      return res.status(200).json({
        message: "Campanhas listadas com sucesso.",
        data: campanhas
      });
    } catch (error) {
      console.error("Erro ao listar campanhas:", error);
      return res.status(500).json({
        message: "Erro interno ao listar campanhas.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };

  /**
   * Gets a campaign by ID with its relationships
   * GET /campanha/:id
   */
  static getCampanhaById = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const campanhaId = parseInt(id, 10);

      if (isNaN(campanhaId)) {
        return res.status(400).json({
          message: "ID da campanha inválido."
        });
      }

      const campanha = await CampanhaService.getCampanhaByIdWithRelations(campanhaId);

      if (!campanha) {
        return res.status(404).json({
          message: "Campanha não encontrada."
        });
      }

      return res.status(200).json({
        message: "Campanha encontrada com sucesso.",
        data: campanha
      });
    } catch (error) {
      console.error("Erro ao buscar campanha:", error);
      return res.status(500).json({
        message: "Erro interno ao buscar campanha.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };

  /**
   * Gets all campaigns by client ID
   * GET /campanha/client/:clientId
   */
  static getCampanhaByClientId = async (req: Request, res: Response) => {
    try {
      const { clientId } = req.params;
      const idClient = parseInt(clientId, 10);

      if (isNaN(idClient)) {
        return res.status(400).json({
          message: "ID do cliente inválido."
        });
      }

      const campanhas = await CampanhaService.getCampanhasByClientId(idClient);

      return res.status(200).json({
        message: "Campanhas do cliente listadas com sucesso.",
        data: campanhas
      });
    } catch (error) {
      console.error("Erro ao buscar campanhas por cliente:", error);
      return res.status(500).json({
        message: "Erro interno ao buscar campanhas.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };
}
