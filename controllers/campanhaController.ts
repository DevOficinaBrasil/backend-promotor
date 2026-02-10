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
        OBEJTIVO,
        PONTO_INICIAL,
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
        OBEJTIVO,
        PONTO_INICIAL,
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
        OBEJTIVO,
        PONTO_INICIAL,
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
      if (OBEJTIVO !== undefined) updateData.OBEJTIVO = OBEJTIVO;
      if (PONTO_INICIAL !== undefined) updateData.PONTO_INICIAL = PONTO_INICIAL;
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
}
