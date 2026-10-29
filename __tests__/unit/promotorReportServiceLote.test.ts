jest.mock("../../data-source");
jest.mock("../../service/obAdsIntegrationClient", () => ({
  __esModule: true,
  default: { listarClientesHabilitados: jest.fn(), enviarEmailComAnexo: jest.fn() },
}));

import PromotorReportService from "../../service/promotorReportService";
import ObAdsIntegrationClient from "../../service/obAdsIntegrationClient";
import { PeriodoRelatorio } from "../../utils/promotorReportCalculos";

const listarClientesHabilitados = ObAdsIntegrationClient.listarClientesHabilitados as jest.Mock;

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

describe("PromotorReportService.processarClientesElegiveis", () => {
  it("retorna tudo zerado e não tenta nenhum cliente quando a listagem falha — isolamento total", async () => {
    listarClientesHabilitados.mockResolvedValue({ sucesso: false, motivo: "ob-ads indisponível" });

    const resumo = await PromotorReportService.processarClientesElegiveis(PERIODO);

    expect(resumo).toEqual({ elegiveis: 0, enviados: 0, falharam: 0 });
    expect(processarRelatorioClienteMock).not.toHaveBeenCalled();
  });

  it("processa cada cliente elegível isoladamente e soma o resumo — RELPROM-19", async () => {
    listarClientesHabilitados.mockResolvedValue({
      sucesso: true,
      dados: [
        { idCliente: 10, nomeCliente: "SKF", admins: ["a@skf.com"] },
        { idCliente: 20, nomeCliente: "Outro", admins: [] },
      ],
    });
    processarRelatorioClienteMock
      .mockResolvedValueOnce({ idCliente: 10, pdf: Buffer.alloc(0), enviado: true })
      .mockResolvedValueOnce({ idCliente: 20, pdf: Buffer.alloc(0), enviado: false, motivoFalha: "sem admin" });

    const resumo = await PromotorReportService.processarClientesElegiveis(PERIODO);

    expect(resumo).toEqual({ elegiveis: 2, enviados: 1, falharam: 1 });
  });

  it("um cliente falhar não impede o processamento dos demais — RELPROM-17", async () => {
    listarClientesHabilitados.mockResolvedValue({
      sucesso: true,
      dados: [
        { idCliente: 10, nomeCliente: "A", admins: [] },
        { idCliente: 20, nomeCliente: "B", admins: ["b@b.com"] },
      ],
    });
    processarRelatorioClienteMock
      .mockResolvedValueOnce({ idCliente: 10, pdf: Buffer.alloc(0), enviado: false, motivoFalha: "sem admin" })
      .mockResolvedValueOnce({ idCliente: 20, pdf: Buffer.alloc(0), enviado: true });

    await PromotorReportService.processarClientesElegiveis(PERIODO);

    expect(processarRelatorioClienteMock).toHaveBeenCalledTimes(2);
    expect(processarRelatorioClienteMock).toHaveBeenNthCalledWith(2, { idCliente: 20, nomeCliente: "B", admins: ["b@b.com"] }, PERIODO, "CRON");
  });

  it("nenhum cliente elegível retorna resumo zerado sem chamar processarRelatorioCliente", async () => {
    listarClientesHabilitados.mockResolvedValue({ sucesso: true, dados: [] });

    const resumo = await PromotorReportService.processarClientesElegiveis(PERIODO);

    expect(resumo).toEqual({ elegiveis: 0, enviados: 0, falharam: 0 });
    expect(processarRelatorioClienteMock).not.toHaveBeenCalled();
  });
});
