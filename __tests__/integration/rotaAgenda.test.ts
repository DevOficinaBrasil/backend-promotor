import express from "express";
import request from "supertest";
import rotaRoutes from "../../routes/RotaRoute";
import RotaService from "../../service/rotaService";

jest.mock("../../service/rotaService");

const agendarVisitasMock = RotaService.agendarVisitas as jest.MockedFunction<
  typeof RotaService.agendarVisitas
>;
const optimizeMock = RotaService.optimizeAndSaveRoute as jest.MockedFunction<
  typeof RotaService.optimizeAndSaveRoute
>;
const reorderMock = RotaService.reorderRotas as jest.MockedFunction<typeof RotaService.reorderRotas>;

const app = express();
app.use(express.json());
app.use("/rota", rotaRoutes);

const resultadoAgenda = {
  ID_CAMPANHA_PROMOTOR: 7,
  DATA_VISITA: "2026-03-10",
  rotas: [
    { ID_ROTA_PROMOTOR: 1, ID_OFICINA: 101, ORDEM: 1, DATA_VISITA: "2026-03-10" },
    { ID_ROTA_PROMOTOR: 2, ID_OFICINA: 102, ORDEM: 2, DATA_VISITA: "2026-03-10" },
  ],
};

const corpoValido = { ID_CAMPANHA_PROMOTOR: 7, DATA: "2026-03-10", rotas: [1, 2] };

describe("PUT /rota/agenda", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    agendarVisitasMock.mockResolvedValue(resultadoAgenda);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("validação do corpo", () => {
    it("saves the day and echoes the resulting routes", async () => {
      const response = await request(app).put("/rota/agenda").send(corpoValido);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(resultadoAgenda);
      expect(agendarVisitasMock).toHaveBeenCalledWith(7, "2026-03-10", [1, 2], []);
    });

    it("passes the unschedule list through", async () => {
      await request(app)
        .put("/rota/agenda")
        .send({ ...corpoValido, desagendar: [9] });

      expect(agendarVisitasMock).toHaveBeenCalledWith(7, "2026-03-10", [1, 2], [9]);
    });

    it("accepts a null date, which unschedules the listed routes", async () => {
      const response = await request(app)
        .put("/rota/agenda")
        .send({ ID_CAMPANHA_PROMOTOR: 7, DATA: null, rotas: [1] });

      expect(response.status).toBe(200);
      expect(agendarVisitasMock).toHaveBeenCalledWith(7, null, [1], []);
    });

    it("rejects a body without the vinculo", async () => {
      const response = await request(app)
        .put("/rota/agenda")
        .send({ DATA: "2026-03-10", rotas: [1] });

      expect(response.status).toBe(400);
      expect(agendarVisitasMock).not.toHaveBeenCalled();
    });

    it("rejects a date that is not YYYY-MM-DD", async () => {
      const response = await request(app)
        .put("/rota/agenda")
        .send({ ...corpoValido, DATA: "10/03/2026" });

      expect(response.status).toBe(400);
      expect(agendarVisitasMock).not.toHaveBeenCalled();
    });

    it("rejects a body that touches no route at all", async () => {
      const response = await request(app)
        .put("/rota/agenda")
        .send({ ID_CAMPANHA_PROMOTOR: 7, DATA: "2026-03-10", rotas: [] });

      expect(response.status).toBe(400);
      expect(agendarVisitasMock).not.toHaveBeenCalled();
    });

    it("accepts a body that only unschedules", async () => {
      const response = await request(app)
        .put("/rota/agenda")
        .send({ ID_CAMPANHA_PROMOTOR: 7, DATA: null, rotas: [], desagendar: [9] });

      expect(response.status).toBe(200);
    });
  });

  describe("erros de domínio", () => {
    it("returns 404 for an unknown vinculo", async () => {
      agendarVisitasMock.mockRejectedValue(new Error("VINCULO_NAO_ENCONTRADO"));

      const response = await request(app).put("/rota/agenda").send(corpoValido);

      expect(response.status).toBe(404);
    });

    it("returns 422 when the date falls outside the campaign window", async () => {
      agendarVisitasMock.mockRejectedValue(new Error("DATA_FORA_DO_PERIODO"));

      const response = await request(app).put("/rota/agenda").send(corpoValido);

      expect(response.status).toBe(422);
      expect(response.body.message).toContain("fora do período da campanha");
    });

    it("returns 422 when the campaign has no window", async () => {
      agendarVisitasMock.mockRejectedValue(new Error("CAMPANHA_SEM_PERIODO"));

      const response = await request(app).put("/rota/agenda").send(corpoValido);

      expect(response.status).toBe(422);
    });

    it("returns 409 when a finished visit is in the selection", async () => {
      agendarVisitasMock.mockRejectedValue(new Error("ROTA_JA_CONCLUIDA"));

      const response = await request(app).put("/rota/agenda").send(corpoValido);

      expect(response.status).toBe(409);
      expect(response.body.message).toContain("Nada foi alterado");
    });

    it("returns 409 when a route of another promoter is in the selection", async () => {
      agendarVisitasMock.mockRejectedValue(new Error("ROTA_FORA_DO_VINCULO"));

      const response = await request(app).put("/rota/agenda").send(corpoValido);

      expect(response.status).toBe(409);
    });

    it("returns 500 for an unexpected failure", async () => {
      agendarVisitasMock.mockRejectedValue(new Error("conexão caiu"));

      const response = await request(app).put("/rota/agenda").send(corpoValido);

      expect(response.status).toBe(500);
    });
  });
});

describe("POST /rota/optimize com dia", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    optimizeMock.mockResolvedValue({
      ESTRATEGIA_ORDENACAO: "ROTA_OTIMIZADA",
      DATA_VISITA: "2026-03-10",
      ID_OFICINA_INICIO: 101,
      ID_OFICINA_FIM: 102,
      distancia_total_km: 15,
      route_geometry: null,
      rotas: [],
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("forwards the day to the service", async () => {
    await request(app).post("/rota/optimize").send({
      ID_CAMPANHA_PROMOTOR: 7,
      ID_OFICINA_INICIO: 101,
      ID_OFICINA_FIM: 102,
      DATA_VISITA: "2026-03-10",
    });

    expect(optimizeMock).toHaveBeenCalledWith(7, 101, 102, "2026-03-10");
  });

  it("passes null when no day is given, keeping the whole-vinculo behaviour", async () => {
    await request(app).post("/rota/optimize").send({
      ID_CAMPANHA_PROMOTOR: 7,
      ID_OFICINA_INICIO: 101,
      ID_OFICINA_FIM: 102,
    });

    expect(optimizeMock).toHaveBeenCalledWith(7, 101, 102, null);
  });

  it("rejects a day that is not YYYY-MM-DD", async () => {
    const response = await request(app).post("/rota/optimize").send({
      ID_CAMPANHA_PROMOTOR: 7,
      ID_OFICINA_INICIO: 101,
      ID_OFICINA_FIM: 102,
      DATA_VISITA: "amanhã",
    });

    expect(response.status).toBe(400);
    expect(optimizeMock).not.toHaveBeenCalled();
  });
});

describe("PUT /rota/reorder com agenda ativa", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns 409 when a day agenda blocks GPS ordering", async () => {
    reorderMock.mockRejectedValue(new Error("AGENDA_ATIVA_IMPEDE_PROXIMIDADE"));

    const response = await request(app).put("/rota/reorder").send({
      ID_CAMPANHA_PROMOTOR: 7,
      ESTRATEGIA_ORDENACAO: "PROXIMIDADE_PROMOTOR",
    });

    expect(response.status).toBe(409);
    expect(response.body.message).toContain("apagaria a ordem");
  });
});
