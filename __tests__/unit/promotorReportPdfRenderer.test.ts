const setContentMock = jest.fn();
const pdfMock = jest.fn().mockResolvedValue(Buffer.from("%PDF-1.4"));
const closeMock = jest.fn();
const newPageMock = jest.fn().mockResolvedValue({ setContent: setContentMock, pdf: pdfMock });
const launchMock = jest.fn().mockResolvedValue({ newPage: newPageMock, close: closeMock });

jest.mock("playwright", () => ({
  chromium: { launch: (...args: unknown[]) => launchMock(...args) },
}));

import PromotorReportPdfRenderer from "../../service/promotorReportPdfRenderer";
import { RelatorioPromotorData } from "../../types/promotorRelatorio";

const DADOS: RelatorioPromotorData = {
  idCliente: 10,
  nomeCliente: "SKF",
  periodo: { inicio: new Date("2026-10-09T00:00:00-03:00"), fim: new Date("2026-10-22T23:59:59-03:00") },
  campanhas: [
    {
      idCampanha: 1,
      nomeCampanha: "Campanha SKF",
      visaoGeral: { concluidas: 71, canceladas: 21, abertasNaRota: 132 },
      assertividade: 77,
      porPromotor: [
        { idPromotor: 1, nomePromotor: "Willian Ferreira", concluidasPeriodo: 15, canceladasPeriodo: 0, concluidasAcumulado: 18, abertasNaRota: 11 },
      ],
      cancelamentos: [
        { idPromotor: 2, nomePromotor: "José Maria Jr.", nomeOficina: "Real Car", cidadeOficina: "Belo Horizonte/MG", obs: "Promotor de folga" },
      ],
      destaquesDeCampo: [
        { status: "cancelada", idPromotor: 2, nomePromotor: "José Maria Jr.", nomeOficina: "Real Car", cidadeOficina: "Belo Horizonte/MG", obs: "Promotor de folga" },
      ],
      proximosPassos: { abertasNaRota: 132, canceladasARedistribuir: 21, promotoresSemRegistro: 1 },
    },
  ],
};

beforeEach(() => jest.clearAllMocks());

describe("PromotorReportPdfRenderer.renderizarPdf", () => {
  it("retorna o Buffer do PDF produzido pelo Playwright — RELPROM-01", async () => {
    const resultado = await PromotorReportPdfRenderer.renderizarPdf(DADOS);

    expect(resultado.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("passa pro Playwright um HTML com o nome do cliente e de cada campanha", async () => {
    await PromotorReportPdfRenderer.renderizarPdf(DADOS);

    const [html] = setContentMock.mock.calls[0];
    expect(html).toContain("SKF");
    expect(html).toContain("Campanha SKF");
  });

  it("inclui os contadores da visao geral e dos proximos passos no HTML", async () => {
    await PromotorReportPdfRenderer.renderizarPdf(DADOS);

    const [html] = setContentMock.mock.calls[0];
    expect(html).toContain(">71<");
    expect(html).toContain(">21<");
    expect(html).toContain(">132<");
  });

  it("inclui 1 bloco por campanha (RELPROM-26) e fecha o browser mesmo em caso de sucesso", async () => {
    const dadosComDuasCampanhas: RelatorioPromotorData = {
      ...DADOS,
      campanhas: [DADOS.campanhas[0], { ...DADOS.campanhas[0], idCampanha: 2, nomeCampanha: "Campanha Outra" }],
    };

    await PromotorReportPdfRenderer.renderizarPdf(dadosComDuasCampanhas);

    const [html] = setContentMock.mock.calls[0];
    expect(html).toContain("Campanha SKF");
    expect(html).toContain("Campanha Outra");
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it("fecha o browser mesmo quando a renderizacao falha", async () => {
    pdfMock.mockRejectedValueOnce(new Error("falha de renderizacao"));

    await expect(PromotorReportPdfRenderer.renderizarPdf(DADOS)).rejects.toThrow("falha de renderizacao");
    expect(closeMock).toHaveBeenCalledTimes(1);
  });
});
