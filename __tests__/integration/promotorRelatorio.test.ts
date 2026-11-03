import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import promotorRelatorioRoutes from "../../routes/PromotorRelatorioRoute";
import PromotorReportService from "../../service/promotorReportService";
import ObAdsIntegrationClient from "../../service/obAdsIntegrationClient";
import { OrigemRelatorioEnvio } from "../../entities/PromotorRelatorioEnvio";

jest.mock("../../service/promotorReportService", () => {
  const real = jest.requireActual("../../service/promotorReportService");
  return { __esModule: true, ...real, default: { processarRelatorioCliente: jest.fn() } };
});
jest.mock("../../service/obAdsIntegrationClient", () => ({
  __esModule: true,
  default: { resolverAdminsDoCliente: jest.fn() },
}));

const processarRelatorioCliente = PromotorReportService.processarRelatorioCliente as jest.Mock;
const resolverAdminsDoCliente = ObAdsIntegrationClient.resolverAdminsDoCliente as jest.Mock;

const SEGREDO = "segredo-obads-de-teste";
const CLIENTE_OB_ADS = { idCliente: 10, nomeCliente: "SKF", admins: ["admin@skf.com"] };
const PDF = Buffer.from("%PDF-1.4");

const app = express();
app.use(express.json());
app.use("/admin", promotorRelatorioRoutes);

const tokenAdmin = () =>
  jwt.sign({ user: { ID_USUARIO: 900, NOME_USUARIO: "Admin", EMAIL: "a@b.c", IS_ADMIN: true } }, SEGREDO, {
    algorithm: "HS256",
    expiresIn: "1h",
  });
const tokenNaoAdmin = () => jwt.sign({ user: { ID_USUARIO: 901, IS_ADMIN: false } }, SEGREDO, { algorithm: "HS256", expiresIn: "1h" });

beforeEach(() => {
  jest.clearAllMocks();
  process.env.OBADS_JWT_SECRET = SEGREDO;
  resolverAdminsDoCliente.mockResolvedValue({ sucesso: true, dados: CLIENTE_OB_ADS });
  processarRelatorioCliente.mockResolvedValue({ idCliente: 10, pdf: PDF, enviado: true });
});

describe("POST /admin/promotor-relatorio/:idCliente/gerar", () => {
  it("401 sem token — RELPROM-32", async () => {
    const res = await request(app).post("/admin/promotor-relatorio/10/gerar");

    expect(res.status).toBe(401);
    expect(processarRelatorioCliente).not.toHaveBeenCalled();
  });

  it("403 com token de usuário não-admin", async () => {
    const res = await request(app)
      .post("/admin/promotor-relatorio/10/gerar")
      .set("Authorization", `Bearer ${tokenNaoAdmin()}`);

    expect(res.status).toBe(403);
  });

  it("200 com o PDF e Content-Type correto quando tudo dá certo — RELPROM-32, RELPROM-36", async () => {
    const res = await request(app)
      .post("/admin/promotor-relatorio/10/gerar")
      .set("Authorization", `Bearer ${tokenAdmin()}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(Buffer.from(res.body).subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("usa a janela padrão de 7 dias quando inicio/fim não são informados — RELPROM-33", async () => {
    await request(app).post("/admin/promotor-relatorio/10/gerar").set("Authorization", `Bearer ${tokenAdmin()}`);

    const [, periodo] = processarRelatorioCliente.mock.calls[0];
    expect(periodo.fim.getTime() - periodo.inicio.getTime()).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
  });

  it("usa o período customizado quando inicio/fim são informados, ancorado no dia civil de Brasília — RELPROM-34, RELPROM-68", async () => {
    // RELPROM-68: mesmo com horário UTC explícito na query, o dia pedido
    // (01 a 02/01) é respeitado — não passa direto sem reancorar o fuso.
    await request(app)
      .post("/admin/promotor-relatorio/10/gerar?inicio=2026-01-01T00:00:00.000Z&fim=2026-01-02T00:00:00.000Z")
      .set("Authorization", `Bearer ${tokenAdmin()}`);

    const [, periodo] = processarRelatorioCliente.mock.calls[0];
    expect(periodo.inicio.toISOString()).toBe("2026-01-01T03:00:00.000Z");
    expect(periodo.fim.toISOString()).toBe("2026-01-03T02:59:59.999Z");
  });

  it("data pura (sem horário) é ancorada em America/Sao_Paulo, não UTC — evita exibir o dia anterior na capa", async () => {
    await request(app)
      .post("/admin/promotor-relatorio/10/gerar?inicio=2026-10-09&fim=2026-10-22")
      .set("Authorization", `Bearer ${tokenAdmin()}`);

    const [, periodo] = processarRelatorioCliente.mock.calls[0];
    expect(periodo.inicio.toISOString()).toBe("2026-10-09T03:00:00.000Z"); // 00:00 em -03:00
    expect(periodo.fim.toISOString()).toBe("2026-10-23T02:59:59.999Z"); // 23:59:59.999 em -03:00
  });

  it("400 quando o período customizado é inválido (fim antes de inicio)", async () => {
    const res = await request(app)
      .post("/admin/promotor-relatorio/10/gerar?inicio=2026-01-02T00:00:00.000Z&fim=2026-01-01T00:00:00.000Z")
      .set("Authorization", `Bearer ${tokenAdmin()}`);

    expect(res.status).toBe(400);
    expect(processarRelatorioCliente).not.toHaveBeenCalled();
  });

  it("enviarEmail=false passa enviarEmail:false pro service — RELPROM-37, RELPROM-38", async () => {
    await request(app)
      .post("/admin/promotor-relatorio/10/gerar?enviarEmail=false")
      .set("Authorization", `Bearer ${tokenAdmin()}`);

    expect(processarRelatorioCliente).toHaveBeenCalledWith(
      CLIENTE_OB_ADS,
      expect.anything(),
      OrigemRelatorioEnvio.MANUAL,
      { enviarEmail: false }
    );
  });

  it("por padrão (sem enviarEmail=false) chama com enviarEmail:true", async () => {
    await request(app).post("/admin/promotor-relatorio/10/gerar").set("Authorization", `Bearer ${tokenAdmin()}`);

    expect(processarRelatorioCliente).toHaveBeenCalledWith(
      CLIENTE_OB_ADS,
      expect.anything(),
      OrigemRelatorioEnvio.MANUAL,
      { enviarEmail: true }
    );
  });

  it("404 quando o cliente nao existe (ob-ads responde 404) — RELPROM-39", async () => {
    resolverAdminsDoCliente.mockResolvedValue({ sucesso: false, motivo: "ob-ads respondeu 404", status: 404 });

    const res = await request(app)
      .post("/admin/promotor-relatorio/10/gerar")
      .set("Authorization", `Bearer ${tokenAdmin()}`);

    expect(res.status).toBe(404);
    expect(processarRelatorioCliente).not.toHaveBeenCalled();
  });

  it("502 quando a resolucao do ob-ads falha por outro motivo (timeout/infra)", async () => {
    resolverAdminsDoCliente.mockResolvedValue({ sucesso: false, motivo: "timeout" });

    const res = await request(app)
      .post("/admin/promotor-relatorio/10/gerar")
      .set("Authorization", `Bearer ${tokenAdmin()}`);

    expect(res.status).toBe(502);
  });

  it("500 quando a geração do relatório falha (PDF vazio)", async () => {
    processarRelatorioCliente.mockResolvedValue({ idCliente: 10, pdf: Buffer.alloc(0), enviado: false, motivoFalha: "erro interno" });

    const res = await request(app)
      .post("/admin/promotor-relatorio/10/gerar")
      .set("Authorization", `Bearer ${tokenAdmin()}`);

    expect(res.status).toBe(500);
  });

  it("400 quando idCliente não é um inteiro positivo", async () => {
    const res = await request(app)
      .post("/admin/promotor-relatorio/abc/gerar")
      .set("Authorization", `Bearer ${tokenAdmin()}`);

    expect(res.status).toBe(400);
  });
});
