import express from "express";
import request from "supertest";
import oficinaRoutes from "../../routes/OficinaRoute";
import OficinaImportService from "../../service/oficinaImportService";
import { montarParserDeLotePlanilha } from "../../middlewares/jsonLimitPlanilha";

jest.mock("../../service/oficinaImportService");

const resolverEmpresaSlugMock =
  OficinaImportService.resolverEmpresaSlug as jest.MockedFunction<
    typeof OficinaImportService.resolverEmpresaSlug
  >;
const importarLinhasMock = OficinaImportService.importarLinhas as jest.MockedFunction<
  typeof OficinaImportService.importarLinhas
>;

/**
 * Monta o app na MESMA ordem de `app.ts`: o parser de lote antes do parser
 * global. Invertendo, o parser global de 100kb recusaria o lote com 413 antes
 * de a requisição chegar ao controller — é exatamente o que o teste de tamanho
 * de corpo abaixo verifica.
 */
const app = express();
montarParserDeLotePlanilha(app);
app.use(express.json());
app.use("/oficina", oficinaRoutes);

const resultadoPadrao = {
  total_linhas: 2,
  oficinas_criadas: 1,
  oficinas_vinculadas_existentes: 1,
  ja_na_comunidade: 0,
  rotas_criadas: 1,
  rotas_sem_promotor_disponivel: 0,
  campanhas_ativas_consideradas: 1,
  erros: [],
};

const linhaValida = { cnpj: "12345678000190", cep: "01310100" };

const corpoValido = { ID_CAMPANHA: 10, oficinas: [linhaValida, linhaValida] };

/** Quebra o corpo NDJSON da resposta na lista de eventos que ele carrega. */
const eventosDe = (texto: string) =>
  texto
    .split("\n")
    .filter((linha) => linha.trim() !== "")
    .map((linha) => JSON.parse(linha));

describe("POST /oficina/import-stream", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    resolverEmpresaSlugMock.mockResolvedValue("empresa-x");
    importarLinhasMock.mockResolvedValue(resultadoPadrao);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("pré-voo", () => {
    // API-02
    it("returns 400 when the body has no ID_CAMPANHA", async () => {
      const response = await request(app)
        .post("/oficina/import-stream")
        .send({ oficinas: [linhaValida] });

      expect(response.status).toBe(400);
      expect(importarLinhasMock).not.toHaveBeenCalled();
    });

    it("returns 400 when the oficinas array is empty", async () => {
      const response = await request(app)
        .post("/oficina/import-stream")
        .send({ ID_CAMPANHA: 10, oficinas: [] });

      expect(response.status).toBe(400);
      expect(importarLinhasMock).not.toHaveBeenCalled();
    });

    it("returns 400 when a row is missing CEP", async () => {
      const response = await request(app)
        .post("/oficina/import-stream")
        .send({ ID_CAMPANHA: 10, oficinas: [{ cnpj: "12345678000190" }] });

      expect(response.status).toBe(400);
      expect(importarLinhasMock).not.toHaveBeenCalled();
    });

    // API-03
    it("returns 400 when the batch is over the row cap", async () => {
      const oficinas = Array.from({ length: 5001 }, () => linhaValida);

      const response = await request(app)
        .post("/oficina/import-stream")
        .send({ ID_CAMPANHA: 10, oficinas });

      expect(response.status).toBe(400);
      expect(importarLinhasMock).not.toHaveBeenCalled();
    });

    // API-05
    it("returns 404 as plain JSON when the campaign does not exist", async () => {
      resolverEmpresaSlugMock.mockRejectedValue(new Error("CAMPANHA_NAO_ENCONTRADA"));

      const response = await request(app).post("/oficina/import-stream").send(corpoValido);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe("Campanha não encontrada.");
      expect(importarLinhasMock).not.toHaveBeenCalled();
    });

    // API-06
    it("returns 422 as plain JSON when the campaign has no EMPRESA_SLUG", async () => {
      resolverEmpresaSlugMock.mockRejectedValue(new Error("CAMPANHA_SEM_EMPRESA_SLUG"));

      const response = await request(app).post("/oficina/import-stream").send(corpoValido);

      expect(response.status).toBe(422);
      expect(response.body.message).toBe("Campanha sem empresa vinculada.");
      expect(importarLinhasMock).not.toHaveBeenCalled();
    });

    it("returns 500 as plain JSON when resolving the campaign blows up unexpectedly", async () => {
      resolverEmpresaSlugMock.mockRejectedValue(new Error("conexão caiu"));

      const response = await request(app).post("/oficina/import-stream").send(corpoValido);

      expect(response.status).toBe(500);
      expect(importarLinhasMock).not.toHaveBeenCalled();
    });

    // API-04: o slug nunca vem do cliente.
    it("ignores an EMPRESA_SLUG sent by the client and resolves it from the campaign", async () => {
      await request(app)
        .post("/oficina/import-stream")
        .send({ ...corpoValido, EMPRESA_SLUG: "empresa-do-vizinho" });

      expect(resolverEmpresaSlugMock).toHaveBeenCalledWith(10);
      expect(importarLinhasMock).toHaveBeenCalledWith(
        corpoValido.oficinas,
        10,
        undefined,
        expect.any(Function)
      );
    });
  });

  describe("limite de corpo", () => {
    // O middleware montado antes do parser global é o que torna isto possível.
    it("accepts a body well over the 100kb express default", async () => {
      const oficinas = Array.from({ length: 4000 }, (_, i) => ({
        cnpj: String(10000000000000 + i),
        cep: "01310100",
        nomeOficina: "Oficina com um nome razoavelmente longo para encorpar o payload",
        endereco: "Avenida das Oficinas Reunidas do Brasil, quadra 12",
        bairro: "Distrito Industrial",
        cidade: "Sao Paulo",
        estado: "SP",
        numero: "1234",
      }));
      const tamanhoBytes = Buffer.byteLength(JSON.stringify({ ID_CAMPANHA: 10, oficinas }));

      const response = await request(app)
        .post("/oficina/import-stream")
        .send({ ID_CAMPANHA: 10, oficinas });

      expect(tamanhoBytes).toBeGreaterThan(100 * 1024);
      expect(response.status).toBe(200);
    });

    it("rejects a body past the 8MB cap", async () => {
      const recheio = "x".repeat(9 * 1024 * 1024);

      const response = await request(app)
        .post("/oficina/import-stream")
        .set("Content-Type", "application/json")
        .send(`{"ID_CAMPANHA":10,"oficinas":[{"cnpj":"1","cep":"1","nomeOficina":"${recheio}"}]}`);

      expect(response.status).toBe(413);
      expect(importarLinhasMock).not.toHaveBeenCalled();
    });
  });

  describe("stream NDJSON", () => {
    // STREAM-01 e STREAM-05
    it("opens with inicio carrying the total and closes with fim carrying the result", async () => {
      const response = await request(app).post("/oficina/import-stream").send(corpoValido);

      const eventos = eventosDe(response.text);
      expect(response.status).toBe(200);
      expect(eventos[0]).toEqual({ tipo: "inicio", total: 2 });
      expect(eventos[eventos.length - 1]).toEqual({ tipo: "fim", resultado: resultadoPadrao });
    });

    it("answers as application/x-ndjson and asks proxies not to buffer", async () => {
      const response = await request(app).post("/oficina/import-stream").send(corpoValido);

      expect(response.headers["content-type"]).toContain("application/x-ndjson");
      expect(response.headers["x-accel-buffering"]).toBe("no");
    });

    // STREAM-02
    it("emits a progresso event carrying the running counters", async () => {
      importarLinhasMock.mockImplementation(async (_linhas, _id, _by, onProgress) => {
        onProgress?.({
          processadas: 2,
          total: 2,
          oficinas_criadas: 1,
          oficinas_vinculadas_existentes: 1,
          ja_na_comunidade: 0,
          erros: 0,
        });
        return resultadoPadrao;
      });

      const response = await request(app).post("/oficina/import-stream").send(corpoValido);

      const progresso = eventosDe(response.text).filter((e) => e.tipo === "progresso");
      expect(progresso).toHaveLength(1);
      expect(progresso[0].progresso).toMatchObject({
        processadas: 2,
        total: 2,
        oficinas_criadas: 1,
        oficinas_vinculadas_existentes: 1,
      });
    });

    // STREAM-03: o throttle segura os intermediários...
    it("drops intermediate progress events that arrive inside the same 500ms window", async () => {
      importarLinhasMock.mockImplementation(async (_linhas, _id, _by, onProgress) => {
        for (let i = 1; i <= 20; i += 1) {
          onProgress?.({
            processadas: i,
            total: 40,
            oficinas_criadas: i,
            oficinas_vinculadas_existentes: 0,
            ja_na_comunidade: 0,
            erros: 0,
          });
        }
        return resultadoPadrao;
      });

      const response = await request(app).post("/oficina/import-stream").send(corpoValido);

      const progresso = eventosDe(response.text).filter((e) => e.tipo === "progresso");
      expect(progresso.length).toBeLessThan(20);
    });

    // ...mas a última linha passa sempre, para a barra fechar em 100%.
    it("always emits the final progress event even inside the throttle window", async () => {
      importarLinhasMock.mockImplementation(async (_linhas, _id, _by, onProgress) => {
        for (let i = 1; i <= 3; i += 1) {
          onProgress?.({
            processadas: i,
            total: 3,
            oficinas_criadas: i,
            oficinas_vinculadas_existentes: 0,
            ja_na_comunidade: 0,
            erros: 0,
          });
        }
        return resultadoPadrao;
      });

      const response = await request(app).post("/oficina/import-stream").send(corpoValido);

      const progresso = eventosDe(response.text).filter((e) => e.tipo === "progresso");
      expect(progresso[progresso.length - 1].progresso).toMatchObject({
        processadas: 3,
        total: 3,
      });
    });

    // STREAM-06
    it("turns a failure after the first byte into an erro event instead of a status code", async () => {
      importarLinhasMock.mockRejectedValue(new Error("banco caiu no meio do lote"));

      const response = await request(app).post("/oficina/import-stream").send(corpoValido);

      const eventos = eventosDe(response.text);
      expect(response.status).toBe(200);
      expect(eventos[0].tipo).toBe("inicio");
      expect(eventos[eventos.length - 1]).toEqual({
        tipo: "erro",
        mensagem: "banco caiu no meio do lote",
      });
    });

    it("reports row errors inside the fim event rather than failing the request", async () => {
      importarLinhasMock.mockResolvedValue({
        ...resultadoPadrao,
        oficinas_criadas: 0,
        oficinas_vinculadas_existentes: 0,
        erros: [
          { linha: 2, cnpj: "abc", motivo: "CNPJ_INVALIDO" },
          { linha: 3, cnpj: "12345678000190", motivo: "GEOCODIFICACAO_FALHOU" },
        ],
      });

      const response = await request(app).post("/oficina/import-stream").send(corpoValido);

      const eventos = eventosDe(response.text);
      const fim = eventos[eventos.length - 1];
      expect(response.status).toBe(200);
      expect(fim.resultado.erros).toHaveLength(2);
    });

    it("emits every event as its own parseable JSON line", async () => {
      const response = await request(app).post("/oficina/import-stream").send(corpoValido);

      const linhas = response.text.split("\n").filter((l) => l.trim() !== "");
      expect(linhas.length).toBeGreaterThanOrEqual(2);
      for (const linha of linhas) {
        expect(() => JSON.parse(linha)).not.toThrow();
      }
    });
  });
});
