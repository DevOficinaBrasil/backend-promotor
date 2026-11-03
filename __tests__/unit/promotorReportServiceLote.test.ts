jest.mock("../../data-source");
jest.mock("../../service/obAdsIntegrationClient", () => ({
  __esModule: true,
  default: { resolverAdminsDoCliente: jest.fn(), enviarEmailComAnexo: jest.fn() },
}));
jest.mock("../../config/promotorReportClientesProducao", () => ({
  __esModule: true,
  CLIENTES_PRODUCAO_HABILITADOS: [10, 20],
}));

import PromotorReportService from "../../service/promotorReportService";
import ObAdsIntegrationClient from "../../service/obAdsIntegrationClient";
import { PeriodoRelatorio } from "../../utils/promotorReportCalculos";

const resolverAdminsDoCliente = ObAdsIntegrationClient.resolverAdminsDoCliente as jest.Mock;

const PERIODO: PeriodoRelatorio = {
  inicio: new Date("2026-10-09T00:00:00-03:00"),
  fim: new Date("2026-10-22T23:59:59-03:00"),
};

let processarRelatorioClienteMock: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  processarRelatorioClienteMock = jest.spyOn(PromotorReportService, "processarRelatorioCliente");
});

afterEach(() => processarRelatorioClienteMock.mockRestore());

describe("PromotorReportService.processarClientesElegiveis (pos-Execute, AD-006 — allowlist fixa)", () => {
  it("itera a allowlist fixa (CLIENTES_PRODUCAO_HABILITADOS), nao uma listagem dinamica por modulo — RELPROM-40", async () => {
    resolverAdminsDoCliente.mockResolvedValue({ sucesso: true, dados: { idCliente: 10, nomeCliente: "SKF", admins: ["a@skf.com"] } });
    processarRelatorioClienteMock.mockResolvedValue({ idCliente: 10, pdf: Buffer.alloc(0), enviado: true });

    const resumo = await PromotorReportService.processarClientesElegiveis(PERIODO);

    expect(resumo.elegiveis).toBe(2);
    expect(resolverAdminsDoCliente).toHaveBeenCalledWith(10);
    expect(resolverAdminsDoCliente).toHaveBeenCalledWith(20);
  });

  it("processa cada cliente da allowlist isoladamente e soma o resumo — RELPROM-19", async () => {
    resolverAdminsDoCliente
      .mockResolvedValueOnce({ sucesso: true, dados: { idCliente: 10, nomeCliente: "SKF", admins: ["a@skf.com"] } })
      .mockResolvedValueOnce({ sucesso: true, dados: { idCliente: 20, nomeCliente: "Outro", admins: [] } });
    processarRelatorioClienteMock
      .mockResolvedValueOnce({ idCliente: 10, pdf: Buffer.alloc(0), enviado: true })
      .mockResolvedValueOnce({ idCliente: 20, pdf: Buffer.alloc(0), enviado: false, motivoFalha: "sem admin" });

    const resumo = await PromotorReportService.processarClientesElegiveis(PERIODO);

    expect(resumo).toEqual({ elegiveis: 2, enviados: 1, falharam: 1 });
  });

  it("falha ao resolver admins de 1 cliente nao impede os demais (sem mais 1 chamada unica de listagem) — RELPROM-17", async () => {
    resolverAdminsDoCliente
      .mockResolvedValueOnce({ sucesso: false, motivo: "ob-ads indisponível" })
      .mockResolvedValueOnce({ sucesso: true, dados: { idCliente: 20, nomeCliente: "B", admins: ["b@b.com"] } });
    processarRelatorioClienteMock.mockResolvedValueOnce({ idCliente: 20, pdf: Buffer.alloc(0), enviado: true });

    const resumo = await PromotorReportService.processarClientesElegiveis(PERIODO);

    expect(resumo).toEqual({ elegiveis: 2, enviados: 1, falharam: 1 });
    expect(processarRelatorioClienteMock).toHaveBeenCalledTimes(1);
    expect(processarRelatorioClienteMock).toHaveBeenCalledWith(
      { idCliente: 20, nomeCliente: "B", admins: ["b@b.com"] },
      PERIODO,
      "CRON"
    );
  });

  it("todos os clientes falharem ao resolver admins retorna falharam = elegiveis, sem lançar", async () => {
    resolverAdminsDoCliente.mockResolvedValue({ sucesso: false, motivo: "ob-ads indisponível" });

    const resumo = await PromotorReportService.processarClientesElegiveis(PERIODO);

    expect(resumo).toEqual({ elegiveis: 2, enviados: 0, falharam: 2 });
    expect(processarRelatorioClienteMock).not.toHaveBeenCalled();
  });
});
