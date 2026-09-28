import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { adminAuthMiddleware, AdminRequest } from "../../middlewares/adminAuthMiddleware";

// CONV-03 / CONV-04 (disparo-convite-visita-admin): os endpoints /admin/* só
// aceitam o JWT de admin emitido pelo backend-ob-ads (POST /usuario/auth,
// payload { user: {...IS_ADMIN} }, 7 dias), verificado com OBADS_JWT_SECRET.
describe("adminAuthMiddleware", () => {
  const SEGREDO = "segredo-obads-de-teste";
  const ENV_KEYS = ["OBADS_JWT_SECRET", "SKIP_AUTH", "NODE_ENV"] as const;
  let envOriginal: Record<string, string | undefined>;
  let res: Response & { status: jest.Mock };
  let next: NextFunction & jest.Mock;

  const usuarioObAds = (IS_ADMIN: unknown) => ({
    ID_USUARIO: 321,
    NOME_USUARIO: "Admin OB",
    EMAIL: "admin@oficinabrasil.com.br",
    CLIENTE: null,
    IS_ADMIN,
  });

  // Mesmo formato que backend-ob-ads UsuarioService.ts:119 assina.
  const tokenObAds = (IS_ADMIN: unknown, segredo = SEGREDO, expiresIn: string | number = "7d") =>
    jwt.sign({ user: usuarioObAds(IS_ADMIN) }, segredo, { expiresIn } as jwt.SignOptions);

  const requisicao = (authorization?: string): Request =>
    ({ headers: authorization === undefined ? {} : { authorization } }) as Request;

  const corpoDaResposta = () => res.status.mock.results[0].value.json.mock.calls[0][0];

  beforeEach(() => {
    envOriginal = {};
    for (const chave of ENV_KEYS) {
      envOriginal[chave] = process.env[chave];
    }
    process.env.OBADS_JWT_SECRET = SEGREDO;
    delete process.env.SKIP_AUTH;

    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    res = { status } as unknown as Response & { status: jest.Mock };
    next = jest.fn() as unknown as NextFunction & jest.Mock;
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    for (const chave of ENV_KEYS) {
      if (envOriginal[chave] === undefined) {
        delete process.env[chave];
      } else {
        process.env[chave] = envOriginal[chave];
      }
    }
    jest.restoreAllMocks();
  });

  // CONV-03: sem header Authorization: Bearer → 401 sem executar a operação.
  it("responde 401 sem header Authorization", () => {
    adminAuthMiddleware(requisicao(), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(corpoDaResposta()).toEqual({ message: "Token não fornecido." });
    expect(next).not.toHaveBeenCalled();
  });

  it("responde 401 com header sem o esquema Bearer", () => {
    adminAuthMiddleware(requisicao(`Basic ${tokenObAds(true)}`), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(corpoDaResposta()).toEqual({ message: "Token não fornecido." });
    expect(next).not.toHaveBeenCalled();
  });

  // CONV-03: token inválido → 401.
  it("responde 401 com token assinado por outro segredo", () => {
    adminAuthMiddleware(requisicao(`Bearer ${tokenObAds(true, "outro-segredo")}`), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(corpoDaResposta()).toEqual({ message: "Token inválido ou expirado." });
    expect(next).not.toHaveBeenCalled();
  });

  it("responde 401 com token que não é JWT", () => {
    adminAuthMiddleware(requisicao("Bearer isto-nao-e-jwt"), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(corpoDaResposta()).toEqual({ message: "Token inválido ou expirado." });
    expect(next).not.toHaveBeenCalled();
  });

  // CONV-03: token expirado → 401.
  it("responde 401 com token expirado", () => {
    adminAuthMiddleware(requisicao(`Bearer ${tokenObAds(true, SEGREDO, -10)}`), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(corpoDaResposta()).toEqual({ message: "Token inválido ou expirado." });
    expect(next).not.toHaveBeenCalled();
  });

  // CONV-04: token válido sem IS_ADMIN verdadeiro → 403.
  it.each([[false], [0], [null], ["true"], [undefined]])(
    "responde 403 quando IS_ADMIN é %p",
    (IS_ADMIN) => {
      adminAuthMiddleware(requisicao(`Bearer ${tokenObAds(IS_ADMIN)}`), res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(corpoDaResposta()).toEqual({ message: "Acesso restrito a administradores." });
      expect(next).not.toHaveBeenCalled();
    }
  );

  it("responde 403 quando o payload não tem user", () => {
    const token = jwt.sign({ outro: 1 }, SEGREDO, { expiresIn: "7d" });

    adminAuthMiddleware(requisicao(`Bearer ${token}`), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(corpoDaResposta()).toEqual({ message: "Acesso restrito a administradores." });
    expect(next).not.toHaveBeenCalled();
  });

  // Design: IS_ADMIN aceita true ou 1 → next() com req.admin.
  it.each([[true], [1]])("chama next e preenche req.admin quando IS_ADMIN é %p", (IS_ADMIN) => {
    const req = requisicao(`Bearer ${tokenObAds(IS_ADMIN)}`);

    adminAuthMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect((req as AdminRequest).admin).toEqual({
      idUsuario: 321,
      nome: "Admin OB",
      email: "admin@oficinabrasil.com.br",
    });
  });

  // Design: segredo ausente → 500, fechado, sem chegar ao handler.
  it.each([[undefined], [""]])("responde 500 sem chamar next quando OBADS_JWT_SECRET é %p", (valor) => {
    if (valor === undefined) {
      delete process.env.OBADS_JWT_SECRET;
    } else {
      process.env.OBADS_JWT_SECRET = valor;
    }

    adminAuthMiddleware(requisicao(`Bearer ${tokenObAds(true)}`), res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  // Done when: SKIP_AUTH não tem efeito.
  it("ignora SKIP_AUTH em development", () => {
    process.env.SKIP_AUTH = "true";
    process.env.NODE_ENV = "development";

    adminAuthMiddleware(requisicao(), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
