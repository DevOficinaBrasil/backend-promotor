import { Request, Response, NextFunction } from "express";
import { verificarJwt, VisitaJwtPayload } from "../utils/visitaToken";

/** Express request carrying the verified visit JWT payload. */
export interface VisitaRequest extends Request {
  visitaJwt?: VisitaJwtPayload;
}

/**
 * Verifies the visit-scoped JWT on the mutating /visita actions
 * (spec AC19-AC20).
 *
 * Structurally mirrors middlewares/authMiddleware.ts — same header parsing and
 * same 401/403 split — but validates against utils/visitaToken's own payload
 * schema. authMiddleware's schema does not match what any login in this
 * codebase issues, so reusing it would import a bug rather than reuse code.
 *
 * 401 means the caller sent no usable credential at all; 403 means it sent one
 * that failed verification (bad signature, expired, or missing the
 * visita:confirmar scope).
 */
export const visitaAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    return res.status(401).json({ message: "Token não fornecido.", error: "TOKEN_INVALID" });
  }

  const [esquema, token] = authHeader.split(" ");

  if (esquema !== "Bearer" || !token) {
    return res
      .status(401)
      .json({ message: "Formato de token inválido.", error: "TOKEN_INVALID" });
  }

  try {
    (req as VisitaRequest).visitaJwt = verificarJwt(token);
    return next();
  } catch (erro) {
    return res.status(403).json({
      message: "Token inválido ou expirado.",
      error: "TOKEN_INVALID",
    });
  }
};

export default visitaAuthMiddleware;
