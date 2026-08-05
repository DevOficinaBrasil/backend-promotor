import { Request, Response } from "express";
import VisitaConfirmacaoService from "../service/visitaConfirmacaoService";

export default class VisitaController {
  /**
   * Exchanges the WhatsApp link's opaque token for a short-lived visit JWT
   * GET /visita/:token
   *
   * Public by design - the link itself is the credential. Safe to call
   * repeatedly; only the confirm action is single-use.
   */
  static exchange = async (req: Request, res: Response) => {
    try {
      const resultado = await VisitaConfirmacaoService.trocarToken(req.params.token);

      switch (resultado.state) {
        case "PENDING":
          return res.status(200).json({
            message: "Visita pendente de confirmação.",
            data: resultado,
          });
        case "ALREADY_CONFIRMED":
          return res.status(200).json({
            message: "Visita já confirmada.",
            data: resultado,
          });
        case "EXPIRED":
          return res.status(410).json({ message: "Este link expirou.", error: "EXPIRED" });
        default:
          return res.status(404).json({ message: "Link inválido.", error: "TOKEN_INVALID" });
      }
    } catch (error) {
      console.error("Erro ao trocar token de visita:", error);
      return res.status(500).json({
        message: "Erro interno ao processar o link de visita.",
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  };
}
