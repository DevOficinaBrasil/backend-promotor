

import { Request, Response } from "express";
import PromotorService from "../service/promotorService";
import Promotor from "../entities/Promotor";
import jwt from "jsonwebtoken";

const SECRET_KEY = process.env.JWT_SECRET;

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
        CREATED_BY,
        ID_CAMPANHA
      } = req.body;

      // Create promoter data object
      const promotorData = {
        NOME,
        EMAIL,
        CPF,
        SENHA,
        ID_CLIENT,
        CREATED_BY
      };

      // Call the service to create the promoter with optional campaign associations
      const novoPromotor = await PromotorService.createPromotor(promotorData, ID_CAMPANHA);

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
      const updateData: Partial<Promotor> = {};
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

  /**
   * Login a promoter
   * POST /promotor/login
   */
  static loginPromotor = async (req: Request, res: Response) => {
    try {
      if (!SECRET_KEY) {
        console.error('JWT_SECRET is not configured');
        return res.status(500).json({
          message: "Erro interno no servidor."
        });
      }

      const { EMAIL, SENHA } = req.body;

      // Validate credentials
      const promotor = await PromotorService.loginPromotor(EMAIL, SENHA);
      
      if (!promotor) {
        return res.status(401).json({
          message: "Email ou senha inválidos."
        });
      }

      // Generate JWT token
      const token = jwt.sign(
        { 
          promotor: {
            ID_PROMOTOR: promotor.ID_PROMOTOR,
            NOME: promotor.NOME,
            EMAIL: promotor.EMAIL,
            CPF: promotor.CPF,
            ID_CLIENT: promotor.ID_CLIENT
          }
        },
        SECRET_KEY,
        { expiresIn: '24h' }
      );

      // Remove password from response
      const { SENHA: _, ...promotorSemSenha } = promotor;

      return res.status(200).json({
        message: "Login realizado com sucesso.",
        token,
        promotor: promotorSemSenha
      });
    } catch (error) {
      console.error("Erro ao fazer login:", error);
      return res.status(500).json({
        message: "Erro interno ao fazer login."
      });
    }
  };

  /**
   * Gets all promoters
   * GET /promotor
   */
  static getAllPromotores = async (req: Request, res: Response) => {
    try {
      const promotores = await PromotorService.getAllPromotores();

      // Remove passwords from response
      const promotoresSemSenha = promotores.map(({ SENHA, ...rest }) => rest);

      return res.status(200).json({
        message: "Promotores listados com sucesso.",
        data: promotoresSemSenha
      });
    } catch (error) {
      console.error("Erro ao listar promotores:", error);
      return res.status(500).json({
        message: "Erro interno ao listar promotores.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };

  /**
   * Gets a promoter by ID
   * GET /promotor/:id
   */
  static getPromotoresById = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const promotorId = parseInt(id, 10);

      if (isNaN(promotorId)) {
        return res.status(400).json({
          message: "ID do promotor inválido."
        });
      }

      const promotor = await PromotorService.findPromotorById(promotorId);

      if (!promotor) {
        return res.status(404).json({
          message: "Promotor não encontrado."
        });
      }

      // Remove password from response
      const { SENHA, ...promotorSemSenha } = promotor;

      return res.status(200).json({
        message: "Promotor encontrado com sucesso.",
        data: promotorSemSenha
      });
    } catch (error) {
      console.error("Erro ao buscar promotor:", error);
      return res.status(500).json({
        message: "Erro interno ao buscar promotor.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };

  /**
   * Links a promoter to one or more campaigns
   * POST /promotor/link-campanha
   */
  static linkCampanhaPromotor = async (req: Request, res: Response) => {
    try {
      const { ID_CAMPANHA, ID_PROMOTOR } = req.body;

      // Validate that promoter exists
      const promotor = await PromotorService.findPromotorById(ID_PROMOTOR);
      if (!promotor) {
        return res.status(404).json({
          message: "Promotor não encontrado."
        });
      }

      // Call the service to link the promoter with campaigns
      const newRelationships = await PromotorService.linkCampanhaPromotor(ID_CAMPANHA, ID_PROMOTOR);

      return res.status(201).json({
        message: "Vínculo entre campanha(s) e promotor criado com sucesso.",
        data: {
          created: newRelationships.length,
          relationships: newRelationships
        }
      });
    } catch (error) {
      console.error("Erro ao vincular campanha e promotor:", error);
      return res.status(500).json({
        message: "Erro interno ao vincular campanha e promotor.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };

    /**
   * Unlinks a promoter from one or more campaigns
   * DELETE /promotor/unlink-campanha
   */
  static unlinkCampanhaPromotor = async (req: Request, res: Response) => {
    try {
      const { ID_CAMPANHA, ID_PROMOTOR } = req.body;

      // Validate that promoter exists
      const promotor = await PromotorService.findPromotorById(ID_PROMOTOR);
      if (!promotor) {
        return res.status(404).json({
          message: "Promotor não encontrado."
        });
      }

      // Call the service to unlink the promoter from campaigns
      const removedRelationships = await PromotorService.unlinkCampanhaPromotor(ID_CAMPANHA, ID_PROMOTOR);

      return res.status(200).json({
        message: "Vínculo entre campanha(s) e promotor removido com sucesso.",
        data: {
          removed: removedRelationships.length,
          relationships: removedRelationships
        }
      });
    } catch (error) {
      console.error("Erro ao remover vínculo campanha e promotor:", error);
      return res.status(500).json({
        message: "Erro interno ao remover vínculo campanha e promotor.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };

    /**
   * Gets all campaign IDs linked to a promoter
   * GET /promotor/:id/campanhas
   */
  static getCampanhasByPromotor = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const promotorId = parseInt(id, 10);
      if (isNaN(promotorId)) {
        return res.status(400).json({
          message: "ID do promotor inválido."
        });
      }
      const campanhas = await PromotorService.getCampanhasByPromotor(promotorId);
      return res.status(200).json({
        message: "Campanhas vinculadas ao promotor.",
        data: campanhas
      });
    } catch (error) {
      console.error("Erro ao buscar campanhas vinculadas ao promotor:", error);
      return res.status(500).json({
        message: "Erro interno ao buscar campanhas vinculadas ao promotor.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };

  /**
   * Gets all promotors by client ID
   * GET /promotor/client/:clientId
   */
  static getPromotoresByClientId = async (req: Request, res: Response) => {
    try {
      const { clientId } = req.params;
      const clientIdNumber = parseInt(clientId, 10);

      const promotores = await PromotorService.getPromotoresByClientId(clientIdNumber);

      // Remove passwords from response
      const promotoresSemSenha = promotores.map(({ SENHA, ...rest }) => rest);

      return res.status(200).json({
        message: "Promotores encontrados com sucesso.",
        data: promotoresSemSenha
      });
    } catch (error) {
      console.error("Erro ao buscar promotores por ID de cliente:", error);
      return res.status(500).json({
        message: "Erro interno ao buscar promotores por ID de cliente.",
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  };
}
