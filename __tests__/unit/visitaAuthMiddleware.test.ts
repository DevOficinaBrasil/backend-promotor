import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import {
  visitaAuthMiddleware,
  VisitaRequest,
} from "../../middlewares/visitaAuthMiddleware";
import { emitirJwt, VISITA_SCOPE } from "../../utils/visitaToken";

const SEGREDO = "segredo-de-teste";
const ID_NOTIFICACAO = 55;
const ID_ROTA = 42;
const ID_USUARIO = 7;

describe("visitaAuthMiddleware", () => {
  let res: Response & { status: jest.Mock; json: jest.Mock };
  let next: NextFunction & jest.Mock;

  const requisicao = (authorization?: string): Request =>
    ({ headers: authorization === undefined ? {} : { authorization } }) as Request;

  beforeEach(() => {
    process.env.VISITA_TOKEN_SECRET = SEGREDO;

    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    res = { status, json } as unknown as Response & { status: jest.Mock; json: jest.Mock };
    next = jest.fn() as unknown as NextFunction & jest.Mock;
  });

  const corpoDaResposta = () => res.status.mock.results[0].value.json.mock.calls[0][0];

  // AC19: "WHEN the reparador submits POST /visita/confirmar with header
  // Authorization: Bearer {jwt} THEN the system SHALL validate the JWT's
  // signature, expiry, and visita:confirmar scope".
  it("attaches the verified payload and calls next for a valid token", () => {
    const req = requisicao(
      `Bearer ${emitirJwt({
        sub: ID_USUARIO,
        ID_NOTIFICACAO_VISITA: ID_NOTIFICACAO,
        ID_ROTA_PROMOTOR: ID_ROTA,
      })}`
    );

    visitaAuthMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect((req as VisitaRequest).visitaJwt).toMatchObject({
      sub: ID_USUARIO,
      ID_NOTIFICACAO_VISITA: ID_NOTIFICACAO,
      ID_ROTA_PROMOTOR: ID_ROTA,
      scope: VISITA_SCOPE,
    });
  });

  it("responds 401 when the Authorization header is missing", () => {
    visitaAuthMiddleware(requisicao(), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("responds 401 when the Authorization header is malformed", () => {
    visitaAuthMiddleware(requisicao("umtokensolto"), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  // AC20: "IF a JWT presented to POST /visita/confirmar is expired, has an
  // invalid signature, lacks the visita:confirmar scope ... THEN the system
  // SHALL reject the confirmation".
  it("responds 403 for a token signed with a different secret", () => {
    const token = jwt.sign(
      {
        sub: ID_USUARIO,
        ID_NOTIFICACAO_VISITA: ID_NOTIFICACAO,
        ID_ROTA_PROMOTOR: ID_ROTA,
        scope: VISITA_SCOPE,
      },
      "outro-segredo",
      { expiresIn: "30m" }
    );

    visitaAuthMiddleware(requisicao(`Bearer ${token}`), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(corpoDaResposta()).toEqual({
      message: "Token inválido ou expirado.",
      error: "TOKEN_INVALID",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("responds 403 for an expired token", () => {
    const token = jwt.sign(
      {
        sub: ID_USUARIO,
        ID_NOTIFICACAO_VISITA: ID_NOTIFICACAO,
        ID_ROTA_PROMOTOR: ID_ROTA,
        scope: VISITA_SCOPE,
      },
      SEGREDO,
      { expiresIn: "-1s" }
    );

    visitaAuthMiddleware(requisicao(`Bearer ${token}`), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("responds 403 for a validly signed token carrying the wrong scope", () => {
    const token = jwt.sign(
      {
        sub: ID_USUARIO,
        ID_NOTIFICACAO_VISITA: ID_NOTIFICACAO,
        ID_ROTA_PROMOTOR: ID_ROTA,
        scope: "visita:reagendar",
      },
      SEGREDO,
      { expiresIn: "30m" }
    );

    visitaAuthMiddleware(requisicao(`Bearer ${token}`), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
