import crypto from "crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";

// Read fresh on every call (not captured at module-load time like
// promotorController.ts's SECRET_KEY) so the signing/verification path is
// directly testable without relying on module-import ordering.
const getSecretKey = (): string => {
  const key = process.env.JWT_SECRET;
  if (!key) {
    throw new Error("JWT_SECRET is not configured");
  }
  return key;
};

export const VISITA_SCOPE = "visita:confirmar" as const;

const VisitaJwtPayloadSchema = z.object({
  sub: z.number(),
  ID_NOTIFICACAO_VISITA: z.number(),
  ID_ROTA_PROMOTOR: z.number(),
  scope: z.literal(VISITA_SCOPE),
  iat: z.number().optional(),
  exp: z.number().optional(),
});

export type VisitaJwtPayload = z.infer<typeof VisitaJwtPayloadSchema>;

export interface EmitirJwtParams {
  sub: number;
  ID_NOTIFICACAO_VISITA: number;
  ID_ROTA_PROMOTOR: number;
}

/**
 * Generates an opaque link token for the WhatsApp visit-confirmation link.
 *
 * `raw` (32 bytes of crypto-random entropy, base64url-encoded) is what goes
 * into the URL and is never persisted. `hash` (its SHA-256 hex digest) is
 * the only thing stored in NotificacaoVisita.TOKEN_HASH, so a DB read/leak
 * doesn't hand out a usable confirmation link.
 */
export function gerarLinkToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

/** Deterministic SHA-256 hex digest of a raw link token, for lookup by TOKEN_HASH. */
export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Signs a short-lived, visit-scoped JWT (30 minutes) exchanged for the link
 * token via GET /visita/{token}. Mirrors the signing pattern in
 * controllers/promotorController.ts:164 (same jsonwebtoken library and
 * JWT_SECRET) but with its own payload shape — not authMiddleware's, which
 * is a known mismatch for this codebase's actual login payloads.
 */
export function emitirJwt(params: EmitirJwtParams): string {
  return jwt.sign(
    {
      sub: params.sub,
      ID_NOTIFICACAO_VISITA: params.ID_NOTIFICACAO_VISITA,
      ID_ROTA_PROMOTOR: params.ID_ROTA_PROMOTOR,
      scope: VISITA_SCOPE,
    },
    getSecretKey(),
    { expiresIn: "30m" }
  );
}

/**
 * Verifies a visit-scoped JWT's signature and expiry, then Zod-parses the
 * decoded payload against VisitaJwtPayloadSchema. Throws on any failure —
 * bad signature, expiry, or a payload missing/mismatching the
 * visita:confirmar scope — so the caller (visitaAuthMiddleware) can map
 * every failure mode to a single rejection path.
 */
export function verificarJwt(token: string): VisitaJwtPayload {
  const decoded = jwt.verify(token, getSecretKey());
  return VisitaJwtPayloadSchema.parse(decoded);
}
