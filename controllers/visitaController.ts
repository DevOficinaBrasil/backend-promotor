import { Request, Response } from "express";
import VisitaConfirmacaoService from "../service/visitaConfirmacaoService";
import { VisitaRequest } from "../middlewares/visitaAuthMiddleware";
import { ipDoCliente } from "../utils/ipCliente";

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
          // Mantém o envelope de erro (o front decide o estado pelo status), mas
          // acrescenta quem convidou: a tela de expirado atribui o próximo
          // contato à empresa, não à Oficina Brasil.
          return res.status(410).json({
            message: "Este link expirou.",
            error: "EXPIRED",
            data: {
              empresaNome: resultado.empresaNome,
              empresaLogoUrl: resultado.empresaLogoUrl,
            },
          });
        default:
          return res.status(404).json({ message: "Link inválido.", error: "TOKEN_INVALID" });
      }
    } catch (error) {
      console.error("Erro ao trocar token de visita:", error);
      return res.status(500).json({
        // A mensagem do erro fica no log, não na resposta: esta rota é pública e
        // texto de erro de banco carrega nome de coluna, schema e constraint.
        message: "Erro interno ao processar o link de visita.",
        error: "INTERNAL_ERROR",
      });
    }
  };

  /**
   * Confirms the visit and that the displayed address is correct
   * POST /visita/confirmar
   *
   * Reaches here only past visitaAuthMiddleware, so the JWT is already
   * verified; the service still re-checks live state before transitioning.
   */
  static confirmar = async (req: Request, res: Response) => {
    try {
      const payload = (req as VisitaRequest).visitaJwt!;
      const resultado = await VisitaConfirmacaoService.confirmar(payload, ipDoCliente(req));

      if (resultado.state === "CONFIRMED") {
        return res.status(200).json({
          message: "Visita confirmada com sucesso.",
          data: { state: "CONFIRMED", confirmadoEm: resultado.confirmadoEm },
        });
      }

      return VisitaController.responderFalhaDeConfirmacao(res, resultado.state);
    } catch (error) {
      console.error("Erro ao confirmar visita:", error);
      return res.status(500).json({
        message: "Erro interno ao confirmar a visita.",
        error: "INTERNAL_ERROR",
      });
    }
  };

  /**
   * Corrects the workshop's address and confirms the visit in one call
   * PUT /visita/endereco
   *
   * The address allowlist is enforced twice on purpose: the route's strict Zod
   * body schema rejects unknown keys before the handler runs, and the service
   * re-checks before it writes anything.
   */
  static atualizarEndereco = async (req: Request, res: Response) => {
    try {
      const payload = (req as VisitaRequest).visitaJwt!;
      const resultado = await VisitaConfirmacaoService.atualizarEndereco(
        payload,
        req.body,
        ipDoCliente(req)
      );

      if (resultado.state === "CONFIRMED") {
        return res.status(200).json({
          message: "Endereço atualizado e visita confirmada.",
          data: {
            state: "CONFIRMED",
            confirmadoEm: resultado.confirmadoEm,
            enderecoAtualizado: true,
          },
        });
      }

      if (resultado.state === "VALIDATION_ERROR") {
        return res.status(400).json({
          message: "Dados inválidos.",
          error: "VALIDATION_ERROR",
          details: resultado.campos.map((campo) => ({
            field: campo,
            message: "Campo não permitido.",
            code: "unrecognized_keys",
          })),
        });
      }

      // AC33: a failed registry write is never reported as a confirmation.
      if (resultado.state === "ADDRESS_UPDATE_FAILED") {
        return res.status(500).json({
          message: "Não foi possível atualizar o endereço.",
          error: "ADDRESS_UPDATE_FAILED",
        });
      }

      return VisitaController.responderFalhaDeConfirmacao(res, resultado.state);
    } catch (error) {
      console.error("Erro ao atualizar endereço da visita:", error);
      return res.status(500).json({
        message: "Erro interno ao atualizar o endereço.",
        error: "INTERNAL_ERROR",
      });
    }
  };

  /**
   * Maps a rejected confirmation to its HTTP response.
   *
   * 409 for an already-confirmed visit is what the frontend contract renders as
   * the already-confirmed state; 410 mirrors the exchange endpoint's expired
   * response so both surfaces report a dead link the same way.
   */
  protected static responderFalhaDeConfirmacao(res: Response, state: string) {
    switch (state) {
      case "ALREADY_CONFIRMED":
        return res
          .status(409)
          .json({ message: "Visita já confirmada.", error: "ALREADY_CONFIRMED" });
      case "EXPIRED":
        return res.status(410).json({ message: "Este link expirou.", error: "EXPIRED" });
      default:
        return res.status(404).json({ message: "Link inválido.", error: "TOKEN_INVALID" });
    }
  }
}
