import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

/**
 * Valida o JWT emitido pelo backend-communities para o portal (POST
 * /usuario/auth, payload `{ user: { ID_USUARIO, EMAIL } }`).
 *
 * Não reusa authMiddleware: aquele verifica com o JWT_SECRET do próprio
 * backend-promotor, que assina o login dos promotores e é outro segredo.
 * PORTAL_JWT_SECRET tem de ter o mesmo valor do JWT_SECRET do
 * backend-communities. É lido a cada requisição; sem ele a rota fecha com 500.
 * SKIP_AUTH não vale aqui: a rota grava dados de oficinas.
 *
 * Token ausente, malformado, de outro segredo ou expirado responde 401 (o
 * mesmo código do backend-communities, que o front já trata).
 */
export const portalAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const segredo = process.env.PORTAL_JWT_SECRET;
  if (!segredo) {
    console.error("[portalAuthMiddleware] PORTAL_JWT_SECRET não configurado");
    return res.status(500).json({ message: "Secret key not configured." });
  }

  const [esquema, token] = (req.headers["authorization"] ?? "").split(" ");
  if (esquema !== "Bearer" || !token) {
    return res.status(401).json({ message: "Token não fornecido." });
  }

  let payload: unknown;
  try {
    payload = jwt.verify(token, segredo, { algorithms: ["HS256"] });
  } catch {
    return res.status(401).json({ message: "Token inválido ou expirado." });
  }

  const user = (payload as { user?: { ID_USUARIO?: unknown; EMAIL?: unknown } } | null)?.user;
  const idUsuario = Number(user?.ID_USUARIO);
  if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
    return res.status(401).json({ message: "Payload do token sem ID_USUARIO." });
  }

  // req.user é tipado como a entity Usuario inteira; aqui só ID e e-mail (o que o JWT traz).
  (req as any).user = {
    ID_USUARIO: idUsuario,
    EMAIL: typeof user?.EMAIL === "string" ? user.EMAIL : "",
  };

  return next();
};

export default portalAuthMiddleware;
