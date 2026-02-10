import { Request, Response } from "express";
import PromotorService from "../service/promotorService";

export default class PromotorController {
  /**
   * Creates a new promoter
   * POST /promotor/create
   */
  static createPromotor = async (req: Request, res: Response) => {
    try {
      const {
        NOME,
        EMAIL,
        CPF,
        SENHA,
        ID_CLIENT,
        CREATED_BY
      } = req.body;

      // Validate required fields
      if (!NOME) {
        return res.status(400).json({ 
          message: "O campo NOME é obrigatório." 
        });
      }

      // Create promoter data object
      const promotorData = {
        NOME,
        EMAIL,
        CPF,
        SENHA,
        ID_CLIENT,
        CREATED_BY
      };

      // Call the service to create the promoter
      const novoPromotor = await PromotorService.createPromotor(promotorData);

      return res.status(201).json({
        message: "Promotor criado com sucesso.",
        data: novoPromotor
      });
    } catch (error) {
      console.error("Erro ao criar promotor:", error);
      return res.status(500).json({
        message: "Erro interno ao criar promotor.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };

  /**
   * Updates an existing promoter
   * PUT /promotor/edit/:id
   */
  static updatePromotor = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const promotorId = parseInt(id, 10);

      if (isNaN(promotorId)) {
        return res.status(400).json({
          message: "ID do promotor inválido."
        });
      }

      const {
        NOME,
        EMAIL,
        CPF,
        SENHA,
        ID_CLIENT,
        CREATED_BY
      } = req.body;

      // Check if promoter exists
      const promotorExistente = await PromotorService.findPromotorById(promotorId);
      
      if (!promotorExistente) {
        return res.status(404).json({
          message: "Promotor não encontrado."
        });
      }

      // Create update data object (only include provided fields)
      const updateData: any = {};
      if (NOME !== undefined) updateData.NOME = NOME;
      if (EMAIL !== undefined) updateData.EMAIL = EMAIL;
      if (CPF !== undefined) updateData.CPF = CPF;
      if (SENHA !== undefined) updateData.SENHA = SENHA;
      if (ID_CLIENT !== undefined) updateData.ID_CLIENT = ID_CLIENT;
      if (CREATED_BY !== undefined) updateData.CREATED_BY = CREATED_BY;

      // Call the service to update the promoter
      const promotorAtualizado = await PromotorService.updatePromotor(promotorId, updateData);

      return res.status(200).json({
        message: "Promotor atualizado com sucesso.",
        data: promotorAtualizado
      });
    } catch (error) {
      console.error("Erro ao atualizar promotor:", error);
      return res.status(500).json({
        message: "Erro interno ao atualizar promotor.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };

  /**
   * Soft deletes a promoter
   * DELETE /promotor/delete/:id
   */
  static deletePromotor = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const promotorId = parseInt(id, 10);

      if (isNaN(promotorId)) {
        return res.status(400).json({
          message: "ID do promotor inválido."
        });
      }

      // Check if promoter exists
      const promotorExistente = await PromotorService.findPromotorById(promotorId);
      
      if (!promotorExistente) {
        return res.status(404).json({
          message: "Promotor não encontrado."
        });
      }

      // Call the service to soft delete the promoter
      await PromotorService.deletePromotor(promotorId);

      return res.status(200).json({
        message: "Promotor deletado com sucesso.",
        data: promotorExistente
      });
    } catch (error) {
      console.error("Erro ao deletar promotor:", error);
      return res.status(500).json({
        message: "Erro interno ao deletar promotor.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };
}
