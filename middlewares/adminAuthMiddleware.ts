import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

/** Admin do ob-ads autenticado, colocado em req.admin. */
export interface AdminAutenticado {
  idUsuario: number;
  nome: string | null;
  email: string | null;
}

export interface AdminRequest extends Request {
  admin?: AdminAutenticado;
}

/**
 * Deixa passar só o JWT de admin emitido pelo backend-ob-ads (CONV-03,
 * CONV-04, AD-004). O token vem de POST /usuario/auth daquele backend, com
 * payload `{ user: { ID_USUARIO, NOME_USUARIO, EMAIL, IS_ADMIN, ... } }`.
 *
 * Não reusa authMiddleware: aquele espera o payload de MAIN_REGISTER.USUARIO e
 * faz lookup no Postgres, e o backend-promotor não acessa o SQL Server onde
 * IS_ADMIN vive. A checagem é pela claim.
 *
 * OBADS_JWT_SECRET é lido a cada requisição e tem de ter o mesmo valor do
 * JWT_SECRET do backend-ob-ads. Sem ele a rota fecha com 500. SKIP_AUTH não
 * vale aqui: o disparo fala com pessoas reais.
 */
export const adminAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const segredo = process.env.OBADS_JWT_SECRET;
  if (!segredo) {
    console.error("[adminAuthMiddleware] OBADS_JWT_SECRET não configurado");
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

  const user = (payload as { user?: Record<string, unknown> } | null)?.user;
  if (!user || (user.IS_ADMIN !== true && user.IS_ADMIN !== 1)) {
    return res.status(403).json({ message: "Acesso restrito a administradores." });
  }

  (req as AdminRequest).admin = {
    idUsuario: user.ID_USUARIO as number,
    nome: (user.NOME_USUARIO as string | undefined) ?? null,
    email: (user.EMAIL as string | undefined) ?? null,
  };

  return next();
};

export default adminAuthMiddleware;
