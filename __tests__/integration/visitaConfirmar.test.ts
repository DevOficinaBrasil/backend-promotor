import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import visitaRoutes from "../../routes/VisitaRoute";
import VisitaConfirmacaoService from "../../service/visitaConfirmacaoService";
import { emitirJwt, VISITA_SCOPE } from "../../utils/visitaToken";

jest.mock("../../service/visitaConfirmacaoService");

const trocarTokenMock = VisitaConfirmacaoService.trocarToken as jest.MockedFunction<
  typeof VisitaConfirmacaoService.trocarToken
>;
const confirmarMock = VisitaConfirmacaoService.confirmar as jest.MockedFunction<
  typeof VisitaConfirmacaoService.confirmar
>;

const SEGREDO = "segredo-de-teste";
const ID_NOTIFICACAO = 55;
const ID_ROTA = 42;
const ID_USUARIO = 7;
const CONFIRMADO_EM = new Date("2026-08-09T14:32:00.000Z");

const app = express();
app.use(express.json());
app.use("/visita", visitaRoutes);

const jwtValido = () =>
  emitirJwt({
    sub: ID_USUARIO,
    ID_NOTIFICACAO_VISITA: ID_NOTIFICACAO,
    ID_ROTA_PROMOTOR: ID_ROTA,
  });

// The limiter's buckets live on the router module for the whole file, so the
// rate-limit tests below use their own visit ids and never spend the budget of
// the visit the other tests exercise.
const jwtDaVisita = (idNotificacao: number) =>
  emitirJwt({
    sub: ID_USUARIO,
    ID_NOTIFICACAO_VISITA: idNotificacao,
    ID_ROTA_PROMOTOR: ID_ROTA,
  });

describe("POST /visita/confirmar", () => {
  beforeEach(() => {
    process.env.VISITA_TOKEN_SECRET = SEGREDO;
    confirmarMock.mockResolvedValue({
      state: "CONFIRMED",
      confirmadoEm: CONFIRMADO_EM,
      enderecoAtualizado: false,
    });
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // AC19: a valid, in-scope JWT confirms the visit.
  it("returns 200 CONFIRMED for a valid visit JWT", async () => {
    const resposta = await request(app)
      .post("/visita/confirmar")
      .set("Authorization", `Bearer ${jwtValido()}`);

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({
      message: "Visita confirmada com sucesso.",
      data: { state: "CONFIRMED", confirmadoEm: CONFIRMADO_EM.toISOString() },
    });
  });

  // AC19: CONFIRMADO_POR comes from the JWT's subject, CONFIRMADO_IP from the request.
  it("passes the JWT payload and the request IP through to the service", async () => {
    await request(app).post("/visita/confirmar").set("Authorization", `Bearer ${jwtValido()}`);

    expect(confirmarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: ID_USUARIO,
        ID_NOTIFICACAO_VISITA: ID_NOTIFICACAO,
        ID_ROTA_PROMOTOR: ID_ROTA,
        scope: VISITA_SCOPE,
      }),
      expect.any(String)
    );
  });

  it("returns 401 when the Authorization header is missing", async () => {
    const resposta = await request(app).post("/visita/confirmar");

    expect(resposta.status).toBe(401);
    expect(confirmarMock).not.toHaveBeenCalled();
  });

  // AC20: an invalid signature never reaches the confirmation logic.
  it("returns 403 for a JWT signed with a different secret", async () => {
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

    const resposta = await request(app)
      .post("/visita/confirmar")
      .set("Authorization", `Bearer ${token}`);

    expect(resposta.status).toBe(403);
    expect(confirmarMock).not.toHaveBeenCalled();
  });

  // AC20: an expired JWT is rejected.
  it("returns 403 for an expired JWT", async () => {
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

    const resposta = await request(app)
      .post("/visita/confirmar")
      .set("Authorization", `Bearer ${token}`);

    expect(resposta.status).toBe(403);
    expect(confirmarMock).not.toHaveBeenCalled();
  });

  // AC20/AC21: the second confirmation of the same visit is rejected.
  it("returns 409 when the visit was already confirmed", async () => {
    confirmarMock.mockResolvedValue({ state: "ALREADY_CONFIRMED", confirmadoEm: CONFIRMADO_EM });

    const resposta = await request(app)
      .post("/visita/confirmar")
      .set("Authorization", `Bearer ${jwtValido()}`);

    expect(resposta.status).toBe(409);
    expect(resposta.body).toEqual({
      message: "Visita já confirmada.",
      error: "ALREADY_CONFIRMED",
    });
  });

  // Spec edge case: a JWT issued before EXPIRA_EM passed is still rejected after it.
  it("returns 410 when the visit expired before the confirmation arrived", async () => {
    confirmarMock.mockResolvedValue({ state: "EXPIRED" });

    const resposta = await request(app)
      .post("/visita/confirmar")
      .set("Authorization", `Bearer ${jwtValido()}`);

    expect(resposta.status).toBe(410);
    expect(resposta.body).toEqual({ message: "Este link expirou.", error: "EXPIRED" });
  });

  // Independent Test from spec P1: GET the link, then POST with the JWT it issued.
  it("completes a full GET exchange to POST confirm round trip", async () => {
    trocarTokenMock.mockResolvedValue({
      state: "PENDING",
      jwt: jwtValido(),
      oficinaNome: "Auto Center Silva",
      promotorNome: "Carlos Promotor",
      empresaNome: "Bosch Brasil",
      endereco: {
        ENDERECO: "Rua das Oficinas",
        NUMERO: "1234",
        COMPLEMENTO: null,
        BAIRRO: "Vila Industrial",
        CIDADE: "São Paulo",
        ESTADO: "SP",
        CEP: "01234-567",
      },
    });

    const troca = await request(app).get("/visita/token-do-round-trip");
    expect(troca.status).toBe(200);

    const confirmacao = await request(app)
      .post("/visita/confirmar")
      .set("Authorization", `Bearer ${troca.body.data.jwt}`);

    expect(confirmacao.status).toBe(200);
    expect(confirmacao.body.data.state).toBe("CONFIRMED");
  });

  // AC25: "SHALL reject more than 20 requests per minute targeting the same
  // visit - keyed on ... the JWT's ID_NOTIFICACAO_VISITA claim for the
  // authenticated POST/PUT actions".
  it("returns 429 after 20 confirmations for the same visit within a minute", async () => {
    const token = jwtDaVisita(901);

    const respostas = [];
    for (let i = 0; i < 21; i += 1) {
      respostas.push(
        await request(app).post("/visita/confirmar").set("Authorization", `Bearer ${token}`)
      );
    }

    expect(respostas.slice(0, 20).every((r) => r.status !== 429)).toBe(true);
    expect(respostas[20].status).toBe(429);
    expect(respostas[20].body).toEqual({
      message: "Muitas tentativas. Aguarde um minuto.",
      error: "RATE_LIMITED",
    });
  });

  // AC25 keys the limit per visit ("independent of the caller's source IP"), so
  // exhausting one visit must leave another visit's budget untouched. A
  // keyGenerator that returned a constant would collapse both into one bucket.
  it("keeps a separate limit bucket per ID_NOTIFICACAO_VISITA", async () => {
    const tokenBarulhento = jwtDaVisita(902);

    for (let i = 0; i < 21; i += 1) {
      await request(app)
        .post("/visita/confirmar")
        .set("Authorization", `Bearer ${tokenBarulhento}`);
    }

    const outraVisita = await request(app)
      .post("/visita/confirmar")
      .set("Authorization", `Bearer ${jwtDaVisita(903)}`);

    expect(outraVisita.status).toBe(200);
    expect(outraVisita.body.data.state).toBe("CONFIRMED");
  });
});
