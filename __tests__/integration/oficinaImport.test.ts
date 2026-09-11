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
  rotas_sem_promotor_disponivel: 0,
  campanhas_ativas_consideradas: 1,
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

  it("should return 400 with the expected column list when the file header does not match", async () => {
    importarPlanilhaMock.mockRejectedValue(new Error("HEADER_INVALIDO"));

    const response = await request(app)
      .post("/oficina/import")
      .field("ID_CAMPANHA", "10")
      .attach("file", Buffer.from("conteudo"), "oficinas.xlsx");

    expect(response.status).toBe(400);
    expect(response.body.message).toContain(
      "NOME OFICINA; CNPJ; CEP; ENDEREÇO; NUMERO; BAIRRO; ESTADO; CIDADE"
    );
  });

  it("should return 400 when the file exceeds the 5MB size limit", async () => {
    const arquivoGrande = Buffer.alloc(6 * 1024 * 1024, "a"); // 6MB > o teto de 5MB

    const response = await request(app)
      .post("/oficina/import")
      .field("ID_CAMPANHA", "10")
      .attach("file", arquivoGrande, "oficinas.xlsx");

    expect(response.status).toBe(400);
    expect(importarPlanilhaMock).not.toHaveBeenCalled();
  });

  it("should return 400 when the file exceeds the 5,000-row limit", async () => {
    importarPlanilhaMock.mockRejectedValue(new Error("LIMITE_LINHAS_EXCEDIDO"));

    const response = await request(app)
      .post("/oficina/import")
      .field("ID_CAMPANHA", "10")
      .attach("file", Buffer.from("conteudo"), "oficinas.xlsx");

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("5.000 linhas");
  });
});
