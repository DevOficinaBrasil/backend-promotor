import { Request, Response } from "express";
import CampanhaPerguntasService from "../service/campanhaPerguntasService";
import CampanhaPerguntas from "../entities/CampanhaPerguntas";

export default class CampanhaPerguntasController {
  /**
   * Creates a new campanha pergunta
   * POST /campanha-perguntas/create
   */
  static createCampanhaPergunta = async (req: Request, res: Response) => {
    try {
      const { ID_CAMPANHA, PERGUNTA, TIPO } = req.body;

      // Create pergunta data object
      const perguntaData = {
        ID_CAMPANHA,
        PERGUNTA,
        TIPO
      };

      // Call the service to create the pergunta
      const novaPergunta = await CampanhaPerguntasService.createCampanhaPergunta(perguntaData);

      return res.status(201).json({
        message: "Pergunta criada com sucesso.",
        data: novaPergunta
      });
    } catch (error) {
      console.error("Erro ao criar pergunta:", error);
      return res.status(500).json({
        message: "Erro interno ao criar pergunta.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };

  /**
   * Updates an existing campanha pergunta
   * PUT /campanha-perguntas/edit/:id
   */
  static updateCampanhaPergunta = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const perguntaId = parseInt(id, 10);

      const { ID_CAMPANHA, PERGUNTA, TIPO } = req.body;

      // Check if pergunta exists
      const perguntaExistente = await CampanhaPerguntasService.findCampanhaPerguntaById(perguntaId);
      
      if (!perguntaExistente) {
        return res.status(404).json({
          message: "Pergunta não encontrada."
        });
      }

      // Create update data object (only include provided fields)
      const updateData: Partial<CampanhaPerguntas> = {};
      if (ID_CAMPANHA !== undefined) updateData.ID_CAMPANHA = ID_CAMPANHA;
      if (PERGUNTA !== undefined) updateData.PERGUNTA = PERGUNTA;
      if (TIPO !== undefined) updateData.TIPO = TIPO;

      // Call the service to update the pergunta
      const perguntaAtualizada = await CampanhaPerguntasService.updateCampanhaPergunta(perguntaId, updateData);

      return res.status(200).json({
        message: "Pergunta atualizada com sucesso.",
        data: perguntaAtualizada
      });
    } catch (error) {
      console.error("Erro ao atualizar pergunta:", error);
      return res.status(500).json({
        message: "Erro interno ao atualizar pergunta.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };

  /**
   * Soft deletes a campanha pergunta
   * DELETE /campanha-perguntas/delete/:id
   */
  static deleteCampanhaPergunta = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const perguntaId = parseInt(id, 10);

      // Check if pergunta exists
      const perguntaExistente = await CampanhaPerguntasService.findCampanhaPerguntaById(perguntaId);
      
      if (!perguntaExistente) {
        return res.status(404).json({
          message: "Pergunta não encontrada."
        });
      }

      // Call the service to soft delete the pergunta
      await CampanhaPerguntasService.deleteCampanhaPergunta(perguntaId);

      return res.status(200).json({
        message: "Pergunta deletada com sucesso.",
        data: perguntaExistente
      });
    } catch (error) {
      console.error("Erro ao deletar pergunta:", error);
      return res.status(500).json({
        message: "Erro interno ao deletar pergunta.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };

  /**
   * Gets all campanha perguntas
   * GET /campanha-perguntas
   */
  static getAllCampanhaPerguntas = async (req: Request, res: Response) => {
    try {
      const perguntas = await CampanhaPerguntasService.getAllCampanhaPerguntas();

      return res.status(200).json({
        message: "Perguntas listadas com sucesso.",
        data: perguntas
      });
    } catch (error) {
      console.error("Erro ao listar perguntas:", error);
      return res.status(500).json({
        message: "Erro interno ao listar perguntas.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };

  /**
   * Gets a campanha pergunta by ID
   * GET /campanha-perguntas/:id
   */
  static getCampanhaPerguntaById = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const perguntaId = parseInt(id, 10);

      const pergunta = await CampanhaPerguntasService.findCampanhaPerguntaById(perguntaId);

      if (!pergunta) {
        return res.status(404).json({
          message: "Pergunta não encontrada."
        });
      }

      return res.status(200).json({
        message: "Pergunta encontrada com sucesso.",
        data: pergunta
      });
    } catch (error) {
      console.error("Erro ao buscar pergunta:", error);
      return res.status(500).json({
        message: "Erro interno ao buscar pergunta.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };

  /**
   * Gets all perguntas for a specific campanha
   * GET /campanha-perguntas/campanha/:id
   */
  static getPerguntasByCampanhaId = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const campanhaId = parseInt(id, 10);

      const perguntas = await CampanhaPerguntasService.getPerguntasByCampanhaId(campanhaId);

      return res.status(200).json({
        message: "Perguntas da campanha listadas com sucesso.",
        data: perguntas
      });
    } catch (error) {
      console.error("Erro ao listar perguntas da campanha:", error);
      return res.status(500).json({
        message: "Erro interno ao listar perguntas da campanha.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };
}
