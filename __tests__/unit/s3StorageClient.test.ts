const sendMock = jest.fn();

jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: sendMock })),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

import S3StorageClient from "../../service/s3StorageClient";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { PeriodoRelatorio } from "../../utils/promotorReportCalculos";

const ORIGINAL_ENV = { ...process.env };

const PERIODO: PeriodoRelatorio = {
  inicio: new Date("2026-10-09T00:00:00-03:00"),
  fim: new Date("2026-10-22T23:59:59-03:00"),
};
const PDF = Buffer.from("%PDF-1.4");

beforeEach(() => {
  process.env.AWS_BUCKET_NAME = "ob-relatorios";
  process.env.AWS_REGION = "us-east-1";
  process.env.AWS_ACCESS_KEY_ID = "chave";
  process.env.AWS_SECRET_ACCESS_KEY = "segredo";
  sendMock.mockReset();
  (PutObjectCommand as unknown as jest.Mock).mockClear();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("S3StorageClient.uploadPdf", () => {
  it("sobe o PDF e retorna a URL publica quando o upload da certo — RELPROM-45", async () => {
    sendMock.mockResolvedValue({});

    const resultado = await S3StorageClient.uploadPdf({ idCliente: 126, periodo: PERIODO, pdf: PDF });

    expect(resultado.sucesso).toBe(true);
    if (resultado.sucesso) {
      expect(resultado.url).toContain("ob-relatorios.s3.us-east-1.amazonaws.com");
      expect(resultado.url).toContain("promotor-relatorio/126/2026-10-09_2026-10-22-");
      expect(resultado.url.endsWith(".pdf")).toBe(true);
    }
  });

  it("chama PutObjectCommand com Bucket, Body, ContentType e ACL public-read — RELPROM-47", async () => {
    sendMock.mockResolvedValue({});

    await S3StorageClient.uploadPdf({ idCliente: 126, periodo: PERIODO, pdf: PDF });

    const [input] = (PutObjectCommand as unknown as jest.Mock).mock.calls[0];
    expect(input).toMatchObject({
      Bucket: "ob-relatorios",
      Body: PDF,
      ContentType: "application/pdf",
      ACL: "public-read",
    });
    expect(input.Key).toContain("promotor-relatorio/126/");
  });

  it("monta chaves diferentes (UUID) em 2 chamadas pro mesmo cliente/periodo — nao adivinhavel", async () => {
    sendMock.mockResolvedValue({});

    const resultado1 = await S3StorageClient.uploadPdf({ idCliente: 126, periodo: PERIODO, pdf: PDF });
    const resultado2 = await S3StorageClient.uploadPdf({ idCliente: 126, periodo: PERIODO, pdf: PDF });

    expect(resultado1.sucesso && resultado2.sucesso && resultado1.url !== resultado2.url).toBe(true);
  });

  it("retorna sucesso:false sem lancar quando o SDK falha — RELPROM-46", async () => {
    sendMock.mockRejectedValue(new Error("AccessControlListNotSupported"));

    const resultado = await S3StorageClient.uploadPdf({ idCliente: 126, periodo: PERIODO, pdf: PDF });

    expect(resultado).toEqual({ sucesso: false, motivo: "AccessControlListNotSupported" });
  });
});
