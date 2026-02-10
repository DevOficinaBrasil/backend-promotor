import { usuarioService } from "../service/usuarioService";
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import z from "zod";

const SECRET_KEY = process.env.JWT_SECRET;

const UsuarioSchemaFlexible = z
    .object({
        ID_USUARIO: z.number(),
        NOME: z.string(),
        EMAIL: z.string().email(),
        SENHA: z.string(),
    })
    .passthrough(); // permite campos extras

const JwtPayloadSchema = z.object({
    user: UsuarioSchemaFlexible,
    iat: z.number()
});

const validateToken = (token: string): { valid: boolean; payload?: any; error?: string } => {
    try {
        const decoded = jwt.verify(token, SECRET_KEY as string);

        const payload = JwtPayloadSchema.parse(decoded);

        return { valid: true, payload };
    } catch (err: unknown) {
        return { valid: false, error: err instanceof Error ? err.message : "Token inválido" };
    }
};

const getToken = (authHeader: string): string | null => {
    let [ , token ] = authHeader.split(" ");

    return token;
};

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    // se setado SKIP_AUTH e estiver em development pula a autenticação
    if (process.env.SKIP_AUTH === "true" && process.env.NODE_ENV === "development") {
        return next();
    }

    if (!SECRET_KEY) {
        return res.status(500).json({ message: "Secret key not configured." });
    }

    const authHeader = req.headers["authorization"];

    if (!authHeader) {
        return res.status(401).json({ message: "Token não fornecido." });
    }

    const token = getToken(authHeader);

    if (!token) {
        return res.status(401).json({ message: "Formato de token inválido." });
    }

    const tokenIsValid = validateToken(token);

    if (!tokenIsValid.valid) {
        return res.status(403).json({ message: "Token inválido ou expirado.", error: tokenIsValid.error });
    }

    try {
        const userId = tokenIsValid.payload?.user?.ID_USUARIO;

        if (!userId) {
            return res.status(403).json({ message: "Payload do token sem ID_USUARIO." });
        }

        const user = await usuarioService.getUserById(userId);

        if (!user) {
            return res.status(403).json({ message: "Usuário não encontrado." });
        }

        (req as any).user = user;

        return next();
    } catch (e: unknown) {
        return res.status(500).json({ message: "Erro ao validar usuário.", error: (e as Error).message });
    }
};
