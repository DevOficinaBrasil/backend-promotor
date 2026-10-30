jest.mock("../../data-source");
jest.mock("../../service/promotorReportPdfRenderer", () => ({
  __esModule: true,
  default: { renderizarPdf: jest.fn() },
}));
jest.mock("../../service/obAdsIntegrationClient", () => ({
  __esModule: true,
  default: { enviarEmailComAnexo: jest.fn() },
}));
jest.mock("../../config/promotorReportRecipients", () => ({
  __esModule: true,
  resolverDestinatarios: jest.fn(),
}));
jest.mock("../../service/s3StorageClient", () => ({
  __esModule: true,
  default: { uploadPdf: jest.fn() },
}));

import { AppDataSourceSync } from "../../data-source";
import PromotorReportService from "../../service/promotorReportService";
import { OrigemRelatorioEnvio, StatusRelatorioEnvio } from "../../entities/PromotorRelatorioEnvio";
import PromotorReportPdfRenderer from "../../service/promotorReportPdfRenderer";
import ObAdsIntegrationClient from "../../service/obAdsIntegrationClient";
import { resolverDestinatarios } from "../../config/promotorReportRecipients";
import S3StorageClient from "../../service/s3StorageClient";
import { PeriodoRelatorio } from "../../utils/promotorReportCalculos";

const renderizarPdf = PromotorReportPdfRenderer.renderizarPdf as jest.Mock;
const enviarEmailComAnexo = ObAdsIntegrationClient.enviarEmailComAnexo as jest.Mock;
const resolverDestinatariosMock = resolverDestinatarios as jest.Mock;
const uploadPdf = S3StorageClient.uploadPdf as jest.Mock;

const PERIODO: PeriodoRelatorio = {
  inicio: new Date("2026-10-09T00:00:00-03:00"),
  fim: new Date("2026-10-22T23:59:59-03:00"),
};
const CLIENTE = { idCliente: 10, nomeCliente: "SKF", admins: ["admin@skf.com"] };
const PDF = Buffer.from("%PDF-1.4");

let saveMock: jest.Mock;
let createMock: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(PromotorReportService, "gerarRelatorioCliente").mockResolvedValue({
    idCliente: 10,
    nomeCliente: "SKF",
    periodo: PERIODO,
    campanhas: [],
  });
  renderizarPdf.mockResolvedValue(PDF);
  resolverDestinatariosMock.mockReturnValue({ destinatarios: ["admin@skf.com"], adminsReaisParaLog: ["admin@skf.com"] });
  enviarEmailComAnexo.mockResolvedValue({ sucesso: true });
  uploadPdf.mockResolvedValue({ sucesso: true, url: "https://bucket.s3.amazonaws.com/relatorio.pdf" });

  createMock = jest.fn((data: unknown) => data);
  saveMock = jest.fn((data: unknown) => Promise.resolve(data));
  (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue({ create: createMock, save: saveMock });
});

afterEach(() => {
  delete process.env.NODE_ENV;
});

describe("PromotorReportService.processarRelatorioCliente", () => {
  it("gera, envia e grava auditoria de sucesso — RELPROM-11, RELPROM-18", async () => {
    const resultado = await PromotorReportService.processarRelatorioCliente(CLIENTE, PERIODO, OrigemRelatorioEnvio.CRON);

    expect(resultado).toEqual({ idCliente: 10, pdf: PDF, enviado: true });
    expect(enviarEmailComAnexo).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["admin@skf.com"], attachment: expect.objectContaining({ content: PDF }) })
    );
    expect(saveMock).toHaveBeenCalledWith(
      expect.objectContaining({ ID_CLIENTE: 10, STATUS: StatusRelatorioEnvio.SUCESSO, ORIGEM: OrigemRelatorioEnvio.CRON })
    );
  });

  it("modo preview (enviarEmail:false) retorna o PDF sem enviar nem gravar auditoria — RELPROM-38", async () => {
    const resultado = await PromotorReportService.processarRelatorioCliente(CLIENTE, PERIODO, OrigemRelatorioEnvio.MANUAL, {
      enviarEmail: false,
    });

    expect(resultado).toEqual({ idCliente: 10, pdf: PDF, enviado: false });
    expect(enviarEmailComAnexo).not.toHaveBeenCalled();
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("modo preview (enviarEmail:false) nao sobe o pdf pro s3 — RELPROM-48", async () => {
    await PromotorReportService.processarRelatorioCliente(CLIENTE, PERIODO, OrigemRelatorioEnvio.MANUAL, { enviarEmail: false });

    expect(uploadPdf).not.toHaveBeenCalled();
  });

  it("sobe o pdf pro s3 e grava LINK_PDF na auditoria quando o upload da certo — RELPROM-45", async () => {
    await PromotorReportService.processarRelatorioCliente(CLIENTE, PERIODO, OrigemRelatorioEnvio.CRON);

    expect(uploadPdf).toHaveBeenCalledWith({ idCliente: 10, periodo: PERIODO, pdf: PDF });
    expect(saveMock).toHaveBeenCalledWith(
      expect.objectContaining({ LINK_PDF: "https://bucket.s3.amazonaws.com/relatorio.pdf" })
    );
  });

  it("falha no upload pro s3 nao bloqueia o envio: grava LINK_PDF nulo, e-mail sai normal — RELPROM-46", async () => {
    uploadPdf.mockResolvedValue({ sucesso: false, motivo: "AccessControlListNotSupported" });

    const resultado = await PromotorReportService.processarRelatorioCliente(CLIENTE, PERIODO, OrigemRelatorioEnvio.CRON);

    expect(resultado).toEqual({ idCliente: 10, pdf: PDF, enviado: true });
    expect(enviarEmailComAnexo).toHaveBeenCalled();
    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ LINK_PDF: null }));
  });

  it("isola falha de geração/PDF: não lança, grava FALHA — RELPROM-17", async () => {
    (PromotorReportService.gerarRelatorioCliente as jest.Mock).mockRejectedValue(new Error("banco fora do ar"));

    const resultado = await PromotorReportService.processarRelatorioCliente(CLIENTE, PERIODO, OrigemRelatorioEnvio.CRON);

    expect(resultado).toEqual({ idCliente: 10, pdf: Buffer.alloc(0), enviado: false, motivoFalha: "banco fora do ar" });
    expect(enviarEmailComAnexo).not.toHaveBeenCalled();
    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ STATUS: StatusRelatorioEnvio.FALHA }));
  });

  it("cliente sem admin resolvido: não envia, grava FALHA — RELPROM-12", async () => {
    resolverDestinatariosMock.mockReturnValue({ destinatarios: [], adminsReaisParaLog: [] });

    const resultado = await PromotorReportService.processarRelatorioCliente(CLIENTE, PERIODO, OrigemRelatorioEnvio.CRON);

    expect(resultado.enviado).toBe(false);
    expect(resultado.motivoFalha).toBe("nenhum admin resolvido para o cliente");
    expect(enviarEmailComAnexo).not.toHaveBeenCalled();
  });

  it("lista de teste vazia fora de produção: não envia, grava FALHA — RELPROM-30", async () => {
    process.env.NODE_ENV = "development";
    resolverDestinatariosMock.mockReturnValue({ destinatarios: [], adminsReaisParaLog: ["admin@skf.com"] });

    const resultado = await PromotorReportService.processarRelatorioCliente(CLIENTE, PERIODO, OrigemRelatorioEnvio.CRON);

    expect(resultado.motivoFalha).toBe("lista fixa de destinatários de teste está vazia");
  });

  it("isola falha de envio (ob-ads indisponível): grava FALHA com o motivo retornado — RELPROM-17", async () => {
    enviarEmailComAnexo.mockResolvedValue({ sucesso: false, motivo: "ob-ads respondeu 502" });

    const resultado = await PromotorReportService.processarRelatorioCliente(CLIENTE, PERIODO, OrigemRelatorioEnvio.CRON);

    expect(resultado).toEqual({ idCliente: 10, pdf: PDF, enviado: false, motivoFalha: "ob-ads respondeu 502" });
    expect(saveMock).toHaveBeenCalledWith(
      expect.objectContaining({ STATUS: StatusRelatorioEnvio.FALHA, MOTIVO_FALHA: "ob-ads respondeu 502" })
    );
  });

  it("grava AMBIENTE=production quando NODE_ENV=production", async () => {
    process.env.NODE_ENV = "production";

    await PromotorReportService.processarRelatorioCliente(CLIENTE, PERIODO, OrigemRelatorioEnvio.CRON);

    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ AMBIENTE: "production" }));
  });

  it("grava AMBIENTE=nao-production fora de produção — RELPROM-28", async () => {
    process.env.NODE_ENV = "development";

    await PromotorReportService.processarRelatorioCliente(CLIENTE, PERIODO, OrigemRelatorioEnvio.CRON);

    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ AMBIENTE: "nao-production" }));
  });

  it("falha ao gravar auditoria (ex.: tabela ainda não migrada) não derruba o chamador — e-mail já enviado continua sucesso", async () => {
    saveMock.mockRejectedValue(new Error('relation "PROMOTOR_RELATORIO_ENVIO" does not exist'));

    const resultado = await PromotorReportService.processarRelatorioCliente(CLIENTE, PERIODO, OrigemRelatorioEnvio.CRON);

    expect(resultado).toEqual({ idCliente: 10, pdf: PDF, enviado: true });
    expect(enviarEmailComAnexo).toHaveBeenCalled();
  });

  it("ORIGEM=MANUAL na auditoria quando chamado pelo endpoint manual", async () => {
    await PromotorReportService.processarRelatorioCliente(CLIENTE, PERIODO, OrigemRelatorioEnvio.MANUAL);

    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ ORIGEM: OrigemRelatorioEnvio.MANUAL }));
  });
});
