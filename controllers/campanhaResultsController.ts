import { Request, Response } from "express";
import CampanhaResultsService from "../service/campanhaResultsService";
import CampanhaResults from "../entities/CampanhaResults";

export default class CampanhaResultsController {
  /**
   * Saves a new campaign result or updates if it already exists
   * POST /campanha-results/save
   */
  static saveResult = async (req: Request, res: Response) => {
    try {
      const { ID_ROTA, ID_PERGUNTA, RESPOSTA } = req.body;

      // Create result data object
      const resultData = {
        ID_ROTA,
        ID_PERGUNTA,
        RESPOSTA
      };

      // Call the service to save or update the result
      const result = await CampanhaResultsService.saveOrUpdateResult(resultData);

      return res.status(201).json({
        message: "Resultado da campanha salvo com sucesso.",
        data: result
      });
    } catch (error) {
      console.error("Erro ao salvar resultado da campanha:", error);
      return res.status(500).json({
        message: "Erro interno ao salvar resultado da campanha.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };

  /**
   * Updates an existing campaign result by ID
   * PUT /campanha-results/edit/:id
   */
  static updateResult = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const resultId = parseInt(id, 10);

      const { ID_ROTA, ID_PERGUNTA, RESPOSTA } = req.body;

      // Check if result exists
      const resultExistente = await CampanhaResultsService.findResultById(resultId);
      
      if (!resultExistente) {
        return res.status(404).json({
          message: "Resultado da campanha não encontrado."
        });
      }

      // Create update data object (only include provided fields)
      const updateData: Partial<CampanhaResults> = {};
      if (ID_ROTA !== undefined) updateData.ID_ROTA = ID_ROTA;
      if (ID_PERGUNTA !== undefined) updateData.ID_PERGUNTA = ID_PERGUNTA;
      if (RESPOSTA !== undefined) updateData.RESPOSTA = RESPOSTA;

      // Call the service to update the result
      const resultAtualizado = await CampanhaResultsService.updateResult(resultId, updateData);

      return res.status(200).json({
        message: "Resultado da campanha atualizado com sucesso.",
        data: resultAtualizado
      });
    } catch (error) {
      console.error("Erro ao atualizar resultado da campanha:", error);
      return res.status(500).json({
        message: "Erro interno ao atualizar resultado da campanha.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };

  /**
   * Gets a campaign result by ID
   * GET /campanha-results/:id
   */
  static getResultById = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const resultId = parseInt(id, 10);

      const result = await CampanhaResultsService.findResultById(resultId);

      if (!result) {
        return res.status(404).json({
          message: "Resultado da campanha não encontrado."
        });
      }

      return res.status(200).json({
        message: "Resultado da campanha encontrado com sucesso.",
        data: result
      });
    } catch (error) {
      console.error("Erro ao buscar resultado da campanha:", error);
      return res.status(500).json({
        message: "Erro interno ao buscar resultado da campanha.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };

  /**
   * Gets all campaign results for a specific rota
   * GET /campanha-results/rota/:rotaId
   */
  static getResultsByRotaId = async (req: Request, res: Response) => {
    try {
      const { rotaId } = req.params;
      const idRota = parseInt(rotaId, 10);

      const results = await CampanhaResultsService.getResultsByRotaId(idRota);

      return res.status(200).json({
        message: "Resultados da campanha listados com sucesso.",
        data: results
      });
    } catch (error) {
      console.error("Erro ao buscar resultados da campanha:", error);
      return res.status(500).json({
        message: "Erro interno ao buscar resultados da campanha.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };
}
