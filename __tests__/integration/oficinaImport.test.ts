import express from "express";
import request from "supertest";
import oficinaRoutes from "../../routes/OficinaRoute";
import OficinaImportService from "../../service/oficinaImportService";

jest.mock("../../service/oficinaImportService");

const importarPlanilhaMock = OficinaImportService.importarPlanilha as jest.MockedFunction<
  typeof OficinaImportService.importarPlanilha
>;

const app = express();
app.use(express.json());
app.use("/oficina", oficinaRoutes);

const resultadoPadrao = {
  total_linhas: 1,
  oficinas_criadas: 1,
  oficinas_vinculadas_existentes: 0,
  ja_na_comunidade: 0,
  rotas_criadas: 1,
  erros: [],
};

describe("POST /oficina/import", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 200 with the import report for a valid upload", async () => {
    importarPlanilhaMock.mockResolvedValue(resultadoPadrao);

    const response = await request(app)
      .post("/oficina/import")
      .field("ID_CAMPANHA", "10")
      .attach("file", Buffer.from("conteudo"), "oficinas.xlsx");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: "Importação processada.",
      data: resultadoPadrao,
    });
    expect(importarPlanilhaMock).toHaveBeenCalledWith(expect.any(Buffer), 10);
  });

  it("should reject a file with a disallowed extension with 400, without calling the service", async () => {
    const response = await request(app)
      .post("/oficina/import")
      .field("ID_CAMPANHA", "10")
      .attach("file", Buffer.from("conteudo"), "oficinas.txt");

    expect(response.status).toBe(400);
    expect(importarPlanilhaMock).not.toHaveBeenCalled();
  });

  it("should return 400 when ID_CAMPANHA is missing", async () => {
    const response = await request(app)
      .post("/oficina/import")
      .attach("file", Buffer.from("conteudo"), "oficinas.xlsx");

    expect(response.status).toBe(400);
    expect(importarPlanilhaMock).not.toHaveBeenCalled();
  });

  it("should return 400 when no file is attached", async () => {
    const response = await request(app).post("/oficina/import").field("ID_CAMPANHA", "10");

    expect(response.status).toBe(400);
    expect(importarPlanilhaMock).not.toHaveBeenCalled();
  });

  it("should return 404 when the campaign does not exist", async () => {
    importarPlanilhaMock.mockRejectedValue(new Error("CAMPANHA_NAO_ENCONTRADA"));

    const response = await request(app)
      .post("/oficina/import")
      .field("ID_CAMPANHA", "999")
      .attach("file", Buffer.from("conteudo"), "oficinas.xlsx");

    expect(response.status).toBe(404);
  });

  it("should return 422 when the campaign has no EMPRESA_SLUG", async () => {
    importarPlanilhaMock.mockRejectedValue(new Error("CAMPANHA_SEM_EMPRESA_SLUG"));

    const response = await request(app)
      .post("/oficina/import")
      .field("ID_CAMPANHA", "10")
      .attach("file", Buffer.from("conteudo"), "oficinas.xlsx");

    expect(response.status).toBe(422);
  });

  it("should return 400 when the file header does not match the expected structure", async () => {
    importarPlanilhaMock.mockRejectedValue(new Error("HEADER_INVALIDO"));

    const response = await request(app)
      .post("/oficina/import")
      .field("ID_CAMPANHA", "10")
      .attach("file", Buffer.from("conteudo"), "oficinas.xlsx");

    expect(response.status).toBe(400);
  });
});
