import express from "express";
import request from "supertest";
import visitaRoutes from "../../routes/VisitaRoute";
import VisitaConfirmacaoService from "../../service/visitaConfirmacaoService";
import { emitirJwt } from "../../utils/visitaToken";

jest.mock("../../service/visitaConfirmacaoService");

const atualizarEnderecoMock =
  VisitaConfirmacaoService.atualizarEndereco as jest.MockedFunction<
    typeof VisitaConfirmacaoService.atualizarEndereco
  >;

const SEGREDO = "segredo-de-teste";
const ID_NOTIFICACAO = 55;
const ID_ROTA = 42;
const ID_USUARIO = 7;
const CONFIRMADO_EM = new Date("2026-08-09T14:32:00.000Z");

const app = express();
app.use(express.json());
app.use("/visita", visitaRoutes);

const enderecoCorrigido = {
  ENDERECO: "Avenida Nova",
  NUMERO: "500",
  COMPLEMENTO: null,
  BAIRRO: "Centro",
  CIDADE: "Campinas",
  ESTADO: "SP",
  CEP: "13010-000",
};

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

describe("PUT /visita/endereco", () => {
  beforeEach(() => {
    process.env.VISITA_TOKEN_SECRET = SEGREDO;
    atualizarEnderecoMock.mockResolvedValue({
      state: "CONFIRMED",
      confirmadoEm: CONFIRMADO_EM,
      enderecoAtualizado: true,
    });
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // AC31: the correction applies the same confirmation transition and sets
  // ENDERECO_ATUALIZADO.
  it("returns 200 CONFIRMED with enderecoAtualizado for a valid correction", async () => {
    const resposta = await request(app)
      .put("/visita/endereco")
      .set("Authorization", `Bearer ${jwtValido()}`)
      .send(enderecoCorrigido);

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({
      message: "Endereço atualizado e visita confirmada.",
      data: {
        state: "CONFIRMED",
        confirmadoEm: CONFIRMADO_EM.toISOString(),
        enderecoAtualizado: true,
      },
    });
  });

  // AC31: "SHALL update only the address columns of the linked
  // MAIN_REGISTER.OFICINA row." Only the seven allowlisted columns may reach
  // the write. (The repository-level assertion lives in
  // __tests__/unit/visitaConfirmacaoService.test.ts, "writes only the seven
  // address columns to the Oficina row".)
  it("forwards exactly the seven address columns and nothing else", async () => {
    await request(app)
      .put("/visita/endereco")
      .set("Authorization", `Bearer ${jwtValido()}`)
      .send(enderecoCorrigido);

    const enviado = atualizarEnderecoMock.mock.calls[0][1];
    expect(enviado).toEqual(enderecoCorrigido);
    expect(Object.keys(enviado).sort()).toEqual([
      "BAIRRO",
      "CEP",
      "CIDADE",
      "COMPLEMENTO",
      "ENDERECO",
      "ESTADO",
      "NUMERO",
    ]);
  });

  // AC32: "IF a PUT /visita/endereco request carries any field outside the
  // address column allowlist THEN the system SHALL reject the request with a
  // validation error and SHALL NOT write to Oficina."
  it("returns 400 and writes nothing when a non-allowlisted field is sent", async () => {
    const resposta = await request(app)
      .put("/visita/endereco")
      .set("Authorization", `Bearer ${jwtValido()}`)
      .send({ ...enderecoCorrigido, CNPJ: "99999999000199", TELEFONE: "11999998888" });

    expect(resposta.status).toBe(400);
    expect(atualizarEnderecoMock).not.toHaveBeenCalled();
  });

  it("returns 401 and writes nothing when the JWT is missing", async () => {
    const resposta = await request(app).put("/visita/endereco").send(enderecoCorrigido);

    expect(resposta.status).toBe(401);
    expect(atualizarEnderecoMock).not.toHaveBeenCalled();
  });

  // AC31 inherits AC20's rejection rules through the shared transition.
  it("returns 409 when the visit was already confirmed", async () => {
    atualizarEnderecoMock.mockResolvedValue({
      state: "ALREADY_CONFIRMED",
      confirmadoEm: CONFIRMADO_EM,
    });

    const resposta = await request(app)
      .put("/visita/endereco")
      .set("Authorization", `Bearer ${jwtValido()}`)
      .send(enderecoCorrigido);

    expect(resposta.status).toBe(409);
    expect(resposta.body).toEqual({
      message: "Visita já confirmada.",
      error: "ALREADY_CONFIRMED",
    });
  });

  // AC33: "IF the Oficina address update fails at the database level
  // (including a missing UPDATE grant on MAIN_REGISTER) THEN ... SHALL NOT
  // report the confirmation as successful, and SHALL surface a distinct error
  // state to the caller."
  it("returns a distinct error and no confirmation when the Oficina write fails", async () => {
    atualizarEnderecoMock.mockResolvedValue({ state: "ADDRESS_UPDATE_FAILED" });

    const resposta = await request(app)
      .put("/visita/endereco")
      .set("Authorization", `Bearer ${jwtValido()}`)
      .send(enderecoCorrigido);

    expect(resposta.status).toBe(500);
    expect(resposta.body).toEqual({
      message: "Não foi possível atualizar o endereço.",
      error: "ADDRESS_UPDATE_FAILED",
    });
    expect(JSON.stringify(resposta.body)).not.toContain("CONFIRMED");
  });

  // AC25: the same per-visit limit guards the authenticated PUT, keyed on the
  // JWT's ID_NOTIFICACAO_VISITA claim.
  it("returns 429 after 20 corrections for the same visit within a minute", async () => {
    const token = jwtDaVisita(911);

    const respostas = [];
    for (let i = 0; i < 21; i += 1) {
      respostas.push(
        await request(app)
          .put("/visita/endereco")
          .set("Authorization", `Bearer ${token}`)
          .send(enderecoCorrigido)
      );
    }

    expect(respostas.slice(0, 20).every((r) => r.status !== 429)).toBe(true);
    expect(respostas[20].status).toBe(429);
    expect(respostas[20].body).toEqual({
      message: "Muitas tentativas. Aguarde um minuto.",
      error: "RATE_LIMITED",
    });
  });

  // AC25 keys the limit per visit, so exhausting one visit must leave another
  // visit's budget untouched - the assertion a constant keyGenerator fails.
  it("keeps a separate limit bucket per ID_NOTIFICACAO_VISITA", async () => {
    const tokenBarulhento = jwtDaVisita(912);

    for (let i = 0; i < 21; i += 1) {
      await request(app)
        .put("/visita/endereco")
        .set("Authorization", `Bearer ${tokenBarulhento}`)
        .send(enderecoCorrigido);
    }

    const outraVisita = await request(app)
      .put("/visita/endereco")
      .set("Authorization", `Bearer ${jwtDaVisita(913)}`)
      .send(enderecoCorrigido);

    expect(outraVisita.status).toBe(200);
    expect(outraVisita.body.data.state).toBe("CONFIRMED");
  });
});
