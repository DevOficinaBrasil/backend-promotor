import express from "express";
import request from "supertest";
import visitaRoutes from "../../routes/VisitaRoute";
import VisitaConfirmacaoService from "../../service/visitaConfirmacaoService";

jest.mock("../../service/visitaConfirmacaoService");

const trocarTokenMock = VisitaConfirmacaoService.trocarToken as jest.MockedFunction<
  typeof VisitaConfirmacaoService.trocarToken
>;

// The router is mounted the same way api.ts mounts it, without importing app.ts
// (which opens a port and initializes the datasource on import).
const app = express();
app.use(express.json());
app.use("/visita", visitaRoutes);

const enderecoRegistrado = {
  ENDERECO: "Rua das Oficinas",
  NUMERO: "1234",
  COMPLEMENTO: "Galpão 2",
  BAIRRO: "Vila Industrial",
  CIDADE: "São Paulo",
  ESTADO: "SP",
  CEP: "01234-567",
};

describe("GET /visita/:token", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // AC14 + AC30: JWT, workshop name and the current registered address.
  it("returns 200 with a JWT, the workshop name and its address for a live token", async () => {
    trocarTokenMock.mockResolvedValue({
      state: "PENDING",
      jwt: "jwt-de-teste",
      oficinaNome: "Auto Center Silva",
      endereco: enderecoRegistrado,
    });

    const resposta = await request(app).get("/visita/token-vivo");

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({
      message: "Visita pendente de confirmação.",
      data: {
        state: "PENDING",
        jwt: "jwt-de-teste",
        oficinaNome: "Auto Center Silva",
        endereco: enderecoRegistrado,
      },
    });
    expect(trocarTokenMock).toHaveBeenCalledWith("token-vivo");
  });

  // AC30: "SHALL NOT include any visit date."
  it("returns no visit date field anywhere in the payload", async () => {
    trocarTokenMock.mockResolvedValue({
      state: "PENDING",
      jwt: "jwt-de-teste",
      oficinaNome: "Auto Center Silva",
      endereco: enderecoRegistrado,
    });

    const resposta = await request(app).get("/visita/token-sem-data");

    expect(JSON.stringify(resposta.body)).not.toMatch(/dataVisita|DATA_VISITA/);
    expect(Object.keys(resposta.body.data)).toEqual([
      "state",
      "jwt",
      "oficinaNome",
      "endereco",
    ]);
  });

  // AC18: already-confirmed is a distinct state and issues no JWT.
  it("returns 200 ALREADY_CONFIRMED with no JWT", async () => {
    const confirmadoEm = new Date("2026-08-04T10:00:00.000Z");
    trocarTokenMock.mockResolvedValue({
      state: "ALREADY_CONFIRMED",
      oficinaNome: "Auto Center Silva",
      confirmadoEm,
    });

    const resposta = await request(app).get("/visita/token-confirmado");

    expect(resposta.status).toBe(200);
    expect(resposta.body.data.state).toBe("ALREADY_CONFIRMED");
    expect(resposta.body.data.confirmadoEm).toBe(confirmadoEm.toISOString());
    expect(resposta.body.data).not.toHaveProperty("jwt");
  });

  // AC17: expired links get a distinct state and no JWT.
  it("returns 410 EXPIRED for a link past its EXPIRA_EM", async () => {
    trocarTokenMock.mockResolvedValue({ state: "EXPIRED" });

    const resposta = await request(app).get("/visita/token-expirado");

    expect(resposta.status).toBe(410);
    expect(resposta.body).toEqual({ message: "Este link expirou.", error: "EXPIRED" });
  });

  // AC16: malformed or unrecognized tokens get a distinct state and no JWT.
  it("returns 404 TOKEN_INVALID for an unrecognized token", async () => {
    trocarTokenMock.mockResolvedValue({ state: "TOKEN_INVALID" });

    const resposta = await request(app).get("/visita/token-invalido");

    expect(resposta.status).toBe(404);
    expect(resposta.body).toEqual({ message: "Link inválido.", error: "TOKEN_INVALID" });
  });

  it("returns 500 when the exchange throws", async () => {
    trocarTokenMock.mockRejectedValue(new Error("banco fora do ar"));

    const resposta = await request(app).get("/visita/token-quebrado");

    expect(resposta.status).toBe(500);
    expect(resposta.body.error).toBe("banco fora do ar");
  });

  // AC25: "SHALL reject more than 20 requests per minute targeting the same
  // visit - keyed on the link token for GET /visita/{token}".
  it("returns 429 after 20 requests for the same visit within a minute", async () => {
    trocarTokenMock.mockResolvedValue({ state: "TOKEN_INVALID" });

    const respostas = [];
    for (let i = 0; i < 21; i += 1) {
      respostas.push(await request(app).get("/visita/token-martelado"));
    }

    expect(respostas.slice(0, 20).every((r) => r.status !== 429)).toBe(true);
    expect(respostas[20].status).toBe(429);
    expect(respostas[20].body).toEqual({
      message: "Muitas tentativas. Aguarde um minuto.",
      error: "RATE_LIMITED",
    });
  });

  // AC25 keys the limit per visit, so hammering one link must not lock out another.
  it("keeps a separate limit bucket per link token", async () => {
    trocarTokenMock.mockResolvedValue({ state: "TOKEN_INVALID" });

    for (let i = 0; i < 21; i += 1) {
      await request(app).get("/visita/token-vizinho-barulhento");
    }

    const outra = await request(app).get("/visita/token-vizinho-tranquilo");

    expect(outra.status).toBe(404);
  });
});
