import { Request, Response, NextFunction } from "express";
import { AppDataSourceSync } from "../data-source";

/** ID_ROLE do FREELANCER em MAIN_REGISTER.ROLE (o mesmo que o layout do painel exige). */
export const FREELANCER_ROLE_ID = 4;

export interface FreelancerRequest extends Request {
  freelancerId?: number;
}

/**
 * Roda depois do authMiddleware: exige que o usuário do JWT tenha a role
 * FREELANCER em MAIN_REGISTER.ROLE_USUARIO. Sem usuário na requisição (por
 * exemplo SKIP_AUTH em desenvolvimento) a rota fecha com 401, nunca abre.
 */
export const freelancerRoleMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const idUsuario = Number((req as any).user?.ID_USUARIO);

  if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
    return res.status(401).json({ message: "Usuário não autenticado." });
  }

  try {
    const linhas: unknown[] = await AppDataSourceSync.query(
      `SELECT 1
         FROM "MAIN_REGISTER"."ROLE_USUARIO" ru
         JOIN "MAIN_REGISTER"."ROLE" r ON r."ID" = ru."ID_ROLE"
        WHERE ru."ID_USUARIO" = $1
          AND (r."ID" = $2 OR upper(r."DESCRICAO") = 'FREELANCER')
        LIMIT 1`,
      [idUsuario, FREELANCER_ROLE_ID]
    );

    if (linhas.length === 0) {
      return res.status(403).json({ message: "Acesso restrito a freelancers." });
    }

    (req as FreelancerRequest).freelancerId = idUsuario;
    return next();
  } catch {
    console.error("[freelancerRole] falha ao validar a role");
    return res.status(500).json({ message: "Erro ao validar permissão." });
  }
};

export default freelancerRoleMiddleware;
