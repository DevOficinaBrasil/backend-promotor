import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import visitaRoutes from "../../routes/VisitaRoute";
import VisitaConfirmacaoService from "../../service/visitaConfirmacaoService";
import { emitirJwt, VISITA_SCOPE } from "../../utils/visitaToken";

// Supertest sobre o router real, com o service mockado: nenhum banco é tocado.
jest.mock("../../service/visitaConfirmacaoService");

const recusarMock = VisitaConfirmacaoService.recusar as jest.MockedFunction<
  typeof VisitaConfirmacaoService.recusar
>;
const trocarTokenMock = VisitaConfirmacaoService.trocarToken as jest.MockedFunction<
  typeof VisitaConfirmacaoService.trocarToken
>;

const SEGREDO = "segredo-de-teste";
const ID_NOTIFICACAO = 55;
const ID_ROTA = 42;
const ID_USUARIO = 7;
const RECUSADO_EM = new Date("2026-09-28T14:32:00.000Z");
const CONFIRMADO_EM = new Date("2026-09-20T10:00:00.000Z");

const app = express();
app.use(express.json());
app.use("/visita", visitaRoutes);

// Os buckets do limitador vivem no módulo do router, então cada teste usa um
// id de visita próprio e não gasta o orçamento dos outros.
let proximoId = 1000;
const jwtDaVisita = (idNotificacao = proximoId++) =>
  emitirJwt({ sub: ID_USUARIO, ID_NOTIFICACAO_VISITA: idNotificacao, ID_ROTA_PROMOTOR: ID_ROTA });

describe("POST /visita/recusar", () => {
  beforeEach(() => {
    process.env.VISITA_TOKEN_SECRET = SEGREDO;
    recusarMock.mockReset();
    recusarMock.mockResolvedValue({ state: "DECLINED", recusadoEm: RECUSADO_EM });
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // CONV-35
  it("devolve 200 DECLINED com a data da recusa", async () => {
    const resposta = await request(app)
      .post("/visita/recusar")
      .set("Authorization", `Bearer ${jwtDaVisita()}`);

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({
      message: "Visita recusada.",
      data: { state: "DECLINED", recusadoEm: RECUSADO_EM.toISOString() },
    });
  });

  // CONV-35: RECUSADO_POR = sub do JWT, RECUSADO_IP = IP da requisição.
  it("repassa o payload do JWT e o IP ao service", async () => {
    await request(app)
      .post("/visita/recusar")
      .set("Authorization", `Bearer ${jwtDaVisita(ID_NOTIFICACAO)}`);

    expect(recusarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: ID_USUARIO,
        ID_NOTIFICACAO_VISITA: ID_NOTIFICACAO,
        ID_ROTA_PROMOTOR: ID_ROTA,
        scope: VISITA_SCOPE,
      }),
      expect.any(String)
    );
  });

  // CONV-40 / L-002: o middleware de acesso montado nesta rota.
  it("devolve 401 sem header Authorization, sem chamar o service", async () => {
    const resposta = await request(app).post("/visita/recusar");

    expect(resposta.status).toBe(401);
    expect(recusarMock).not.toHaveBeenCalled();
  });

  it("devolve 403 para JWT assinado com outro segredo, sem chamar o service", async () => {
    const token = jwt.sign(
      { sub: ID_USUARIO, ID_NOTIFICACAO_VISITA: 1, ID_ROTA_PROMOTOR: ID_ROTA, scope: VISITA_SCOPE },
      "outro-segredo",
      { expiresIn: "30m" }
    );

    const resposta = await request(app).post("/visita/recusar").set("Authorization", `Bearer ${token}`);

    expect(resposta.status).toBe(403);
    expect(recusarMock).not.toHaveBeenCalled();
  });

  it("devolve 403 para JWT expirado", async () => {
    const token = jwt.sign(
      { sub: ID_USUARIO, ID_NOTIFICACAO_VISITA: 1, ID_ROTA_PROMOTOR: ID_ROTA, scope: VISITA_SCOPE },
      SEGREDO,
      { expiresIn: "-1s" }
    );

    const resposta = await request(app).post("/visita/recusar").set("Authorization", `Bearer ${token}`);

    expect(resposta.status).toBe(403);
    expect(recusarMock).not.toHaveBeenCalled();
  });

  // CONV-37: estado terminal → 409 com o estado atual, no formato de /confirmar.
  it("devolve 409 ALREADY_CONFIRMED para convite já confirmado", async () => {
    recusarMock.mockResolvedValue({ state: "ALREADY_CONFIRMED", confirmadoEm: CONFIRMADO_EM });

    const resposta = await request(app)
      .post("/visita/recusar")
      .set("Authorization", `Bearer ${jwtDaVisita()}`);

    expect(resposta.status).toBe(409);
    expect(resposta.body).toEqual({ message: "Visita já confirmada.", error: "ALREADY_CONFIRMED" });
  });

  it("devolve 409 ALREADY_DECLINED para convite já recusado", async () => {
    recusarMock.mockResolvedValue({ state: "ALREADY_DECLINED", recusadoEm: RECUSADO_EM });

    const resposta = await request(app)
      .post("/visita/recusar")
      .set("Authorization", `Bearer ${jwtDaVisita()}`);

    expect(resposta.status).toBe(409);
    expect(resposta.body).toEqual({ message: "Visita já recusada.", error: "ALREADY_DECLINED" });
  });

  it("devolve 410 EXPIRED para convite vencido", async () => {
    recusarMock.mockResolvedValue({ state: "EXPIRED" });

    const resposta = await request(app)
      .post("/visita/recusar")
      .set("Authorization", `Bearer ${jwtDaVisita()}`);

    expect(resposta.status).toBe(410);
    expect(resposta.body).toEqual({ message: "Este link expirou.", error: "EXPIRED" });
  });

  it("devolve 404 TOKEN_INVALID quando a notificação não é recusável", async () => {
    recusarMock.mockResolvedValue({ state: "TOKEN_INVALID" });

    const resposta = await request(app)
      .post("/visita/recusar")
      .set("Authorization", `Bearer ${jwtDaVisita()}`);

    expect(resposta.status).toBe(404);
    expect(resposta.body).toEqual({ message: "Link inválido.", error: "TOKEN_INVALID" });
  });

  it("devolve 500 sem vazar a mensagem do erro quando o service lança", async () => {
    recusarMock.mockRejectedValue(new Error('relation "CAMPANHAS_OB" does not exist'));

    const resposta = await request(app)
      .post("/visita/recusar")
      .set("Authorization", `Bearer ${jwtDaVisita()}`);

    expect(resposta.status).toBe(500);
    expect(resposta.body).toEqual({
      message: "Erro interno ao recusar a visita.",
      error: "INTERNAL_ERROR",
    });
  });

  // CONV-40: mesmo rate limit de /confirmar, 20 por minuto por visita.
  it("devolve 429 na 21ª recusa da mesma visita no minuto", async () => {
    const token = jwtDaVisita();
    const respostas = [];
    for (let i = 0; i < 21; i += 1) {
      respostas.push(await request(app).post("/visita/recusar").set("Authorization", `Bearer ${token}`));
    }

    expect(respostas.slice(0, 20).every((r) => r.status !== 429)).toBe(true);
    expect(respostas[20].status).toBe(429);
    expect(respostas[20].body).toEqual({
      message: "Muitas tentativas. Aguarde um minuto.",
      error: "RATE_LIMITED",
    });
  });
});

// CONV-37 / CONV-39: GET /visita/:token de convite recusado.
describe("GET /visita/:token — convite recusado", () => {
  it("devolve 200 ALREADY_DECLINED com a empresa e a data, sem JWT", async () => {
    trocarTokenMock.mockResolvedValue({
      state: "ALREADY_DECLINED",
      empresaNome: "Bosch Brasil",
      empresaLogoUrl: "https://bucket.exemplo/logo.png",
      recusadoEm: RECUSADO_EM,
    });

    const resposta = await request(app).get("/visita/token-recusado");

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({
      message: "Visita recusada.",
      data: {
        state: "ALREADY_DECLINED",
        empresaNome: "Bosch Brasil",
        empresaLogoUrl: "https://bucket.exemplo/logo.png",
        recusadoEm: RECUSADO_EM.toISOString(),
      },
    });
    expect(resposta.body.data).not.toHaveProperty("jwt");
  });
});
