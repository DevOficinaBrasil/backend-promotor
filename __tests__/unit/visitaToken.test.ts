import jwt from 'jsonwebtoken';
import {
  gerarLinkToken,
  hashToken,
  emitirJwt,
  verificarJwt,
  VISITA_SCOPE,
} from '../../utils/visitaToken';

// Spec: AC5 — signed link token bound to ID_NOTIFICACAO_VISITA, opaque,
// re-exchangeable while valid.
// Spec: AC14 — JWT issued on exchange: 30 minutes, scope visita:confirmar,
// subject = ID_USUARIO, claims include ID_NOTIFICACAO_VISITA and
// ID_ROTA_PROMOTOR, signed with JWT_SECRET via jsonwebtoken.
// Spec: AC19-20 — confirm endpoint validates signature, expiry, and scope;
// rejects an expired, invalidly-signed, or wrong-scope JWT.
describe('visitaToken', () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-jwt-secret';
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  describe('gerarLinkToken', () => {
    it('generates a unique raw token on every call', () => {
      const first = gerarLinkToken();
      const second = gerarLinkToken();
      expect(first.raw).not.toBe(second.raw);
    });

    it('returns a base64url-encoded raw token with no padding/URL-unsafe characters', () => {
      const { raw } = gerarLinkToken();
      expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('returns hash as the deterministic SHA-256 hex digest of raw', () => {
      const { raw, hash } = gerarLinkToken();
      expect(hash).toBe(hashToken(raw));
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('hashToken', () => {
    it('is deterministic: the same raw value always hashes to the same digest', () => {
      const raw = 'a-fixed-raw-token-value';
      expect(hashToken(raw)).toBe(hashToken(raw));
    });

    it('produces different hashes for different raw values', () => {
      expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
    });
  });

  describe('emitirJwt / verificarJwt round trip', () => {
    it('issues a JWT that verifies back to the original claims', () => {
      const token = emitirJwt({ sub: 42, ID_NOTIFICACAO_VISITA: 7, ID_ROTA_PROMOTOR: 99 });
      const payload = verificarJwt(token);

      expect(payload.sub).toBe(42);
      expect(payload.ID_NOTIFICACAO_VISITA).toBe(7);
      expect(payload.ID_ROTA_PROMOTOR).toBe(99);
      expect(payload.scope).toBe(VISITA_SCOPE);
    });

    it('signs with a 30-minute expiry', () => {
      const token = emitirJwt({ sub: 1, ID_NOTIFICACAO_VISITA: 1, ID_ROTA_PROMOTOR: 1 });
      const decoded = jwt.decode(token) as jwt.JwtPayload;

      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp! - decoded.iat!).toBe(30 * 60);
    });

    it('throws on a tampered signature', () => {
      const token = emitirJwt({ sub: 1, ID_NOTIFICACAO_VISITA: 1, ID_ROTA_PROMOTOR: 1 });
      const tampered = token.slice(0, -2) + (token.slice(-2) === 'aa' ? 'bb' : 'aa');

      expect(() => verificarJwt(tampered)).toThrow();
    });

    it('throws on a JWT signed with a different secret', () => {
      const foreignToken = jwt.sign(
        { sub: 1, ID_NOTIFICACAO_VISITA: 1, ID_ROTA_PROMOTOR: 1, scope: VISITA_SCOPE },
        'a-different-secret',
        { expiresIn: '30m' }
      );

      expect(() => verificarJwt(foreignToken)).toThrow();
    });

    it('throws on an expired token', () => {
      const expiredToken = jwt.sign(
        { sub: 1, ID_NOTIFICACAO_VISITA: 1, ID_ROTA_PROMOTOR: 1, scope: VISITA_SCOPE },
        process.env.JWT_SECRET as string,
        { expiresIn: '-1s' }
      );

      expect(() => verificarJwt(expiredToken)).toThrow();
    });

    it('throws when the scope claim is missing', () => {
      const noScopeToken = jwt.sign(
        { sub: 1, ID_NOTIFICACAO_VISITA: 1, ID_ROTA_PROMOTOR: 1 },
        process.env.JWT_SECRET as string,
        { expiresIn: '30m' }
      );

      expect(() => verificarJwt(noScopeToken)).toThrow();
    });

    it('throws when the scope claim does not match visita:confirmar', () => {
      const wrongScopeToken = jwt.sign(
        { sub: 1, ID_NOTIFICACAO_VISITA: 1, ID_ROTA_PROMOTOR: 1, scope: 'promotor:login' },
        process.env.JWT_SECRET as string,
        { expiresIn: '30m' }
      );

      expect(() => verificarJwt(wrongScopeToken)).toThrow();
    });
  });
});
