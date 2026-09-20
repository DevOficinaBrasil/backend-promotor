import { Request, Response } from "express";
import OficinaService from "../service/oficinaService";
import SegmentacaoService from "../service/segmentacaoService";
import OficinaImportService from "../service/oficinaImportService";
import { ImportOficinasBodySchema } from "../schemas/oficina";

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
   * Lists ALL active oficinas of a client's community that match the
   * segmentação filter defined earlier in the wizard flow (no radius filter).
   * POST /oficina/community-all
   */
  static getCommunityOficinas = async (req: Request, res: Response) => {
    try {
      const { empresaSlug, filtroSegmentacao } = req.body;

      let oficinas;
      if (!filtroSegmentacao) {
        oficinas = await OficinaService.getCommunityOficinas(empresaSlug);
      } else {
        const validation = SegmentacaoService.validateDsl(filtroSegmentacao);
        if (!validation.valid) {
          return res.status(400).json({
            message: "Filtro de segmentação inválido.",
            details: validation.errors,
          });
        }

        const tenantId = await SegmentacaoService.resolveTenantId(empresaSlug);
        if (!tenantId) {
          return res
            .status(404)
            .json({ message: "Comunidade não encontrada para o empresaSlug informado." });
        }

        // Recorta a comunidade inteira (não amostra): a API do CRM devolve no
        // máximo 100 contatos por página, então isto pagina até o teto.
        const MAX_CONTATOS = 5000;
        const preview = await SegmentacaoService.previewContactsAll(
          filtroSegmentacao,
          tenantId,
          MAX_CONTATOS
        );

        oficinas = await OficinaService.getCommunityOficinasSegmentadas(
          empresaSlug,
          preview.externalUserIds
        );
      }

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
   * Counts ALL active oficinas of a client's community (no radius/segmentation filter)
   * GET /oficina/community-count
   */
  static getCommunityOficinasCount = async (req: Request, res: Response) => {
    try {
      const { empresaSlug } = (req as any).validatedQuery;

      const count = await OficinaService.countCommunityOficinas(empresaSlug);

      return res.status(200).json({
        message: "Contagem de oficinas da comunidade obtida.",
        empresaSlug,
        count,
      });
    } catch (error) {
      console.error("Erro ao contar oficinas da comunidade:", error);
      return res.status(500).json({
        message: "Erro interno ao contar oficinas da comunidade.",
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

  /**
   * Imports oficinas from a .xlsx/.csv planilha, linking them to the client
   * (EMPRESA_SLUG resolved from ID_CAMPANHA) even without a user.
   * POST /oficina/import (multipart/form-data: file + ID_CAMPANHA)
   */
  static importOficinas = async (req: Request, res: Response) => {
    try {
      const parsedBody = ImportOficinasBodySchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({
          message: "ID_CAMPANHA inválido.",
          details: parsedBody.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
            code: issue.code,
          })),
        });
      }

      if (!req.file) {
        return res.status(400).json({ message: "Arquivo não enviado." });
      }

      const resultado = await OficinaImportService.importarPlanilha(
        req.file.buffer,
        parsedBody.data.ID_CAMPANHA
      );

      return res.status(200).json({
        message: "Importação processada.",
        data: resultado,
      });
    } catch (error: any) {
      if (error.message === "CAMPANHA_NAO_ENCONTRADA") {
        return res.status(404).json({ message: "Campanha não encontrada." });
      }
      if (error.message === "CAMPANHA_SEM_EMPRESA_SLUG") {
        return res.status(422).json({ message: "Campanha sem empresa vinculada." });
      }
      if (error.message === "HEADER_INVALIDO") {
        return res.status(400).json({
          message:
            "Estrutura de colunas inválida. Esperado exatamente: NOME OFICINA; CNPJ; CEP; ENDEREÇO; NUMERO; BAIRRO; ESTADO; CIDADE.",
        });
      }
      if (error.message === "LIMITE_LINHAS_EXCEDIDO") {
        return res.status(400).json({ message: "Arquivo excede o limite de 5.000 linhas." });
      }
      console.error("Erro ao importar oficinas:", error);
      return res.status(500).json({
        message: "Erro interno ao importar oficinas.",
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  };
}
