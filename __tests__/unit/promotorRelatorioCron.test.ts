import cron from "node-cron";
import { registrarPromotorRelatorioCron } from "../../schedule/promotorRelatorioCron";
import PromotorReportService from "../../service/promotorReportService";

jest.mock("node-cron", () => ({ __esModule: true, default: { schedule: jest.fn() } }));
jest.mock("../../service/promotorReportService", () => ({
  __esModule: true,
  default: { processarClientesElegiveis: jest.fn() },
}));

const scheduleMock = cron.schedule as jest.Mock;
const processarClientesElegiveis = PromotorReportService.processarClientesElegiveis as jest.Mock;

describe("registrarPromotorRelatorioCron", () => {
  const ENV_KEYS = ["NODE_ENV", "PROMOTOR_RELATORIO_ENABLED", "PROMOTOR_RELATORIO_CRON_EXPRESSION"] as const;
  let envOriginal: Record<string, string | undefined>;

  beforeEach(() => {
    envOriginal = {};
    for (const chave of ENV_KEYS) {
      envOriginal[chave] = process.env[chave];
      delete process.env[chave];
    }
    process.env.NODE_ENV = "production";
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.clearAllMocks();
  });

  afterEach(() => {
    for (const chave of ENV_KEYS) {
      if (envOriginal[chave] === undefined) delete process.env[chave];
      else process.env[chave] = envOriginal[chave];
    }
    jest.restoreAllMocks();
  });

  it("nunca registra quando NODE_ENV=test, mesmo com a flag ligada — RELPROM-16", () => {
    process.env.NODE_ENV = "test";
    process.env.PROMOTOR_RELATORIO_ENABLED = "1";

    registrarPromotorRelatorioCron();

    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it("não registra quando PROMOTOR_RELATORIO_ENABLED não está definido", () => {
    registrarPromotorRelatorioCron();

    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it('não registra para "true", só para exatamente "1" — RELPROM-16', () => {
    process.env.PROMOTOR_RELATORIO_ENABLED = "true";

    registrarPromotorRelatorioCron();

    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it('registra com a expressão padrão (sexta 07:00) e fuso America/Sao_Paulo quando a flag é "1"', () => {
    process.env.PROMOTOR_RELATORIO_ENABLED = "1";

    registrarPromotorRelatorioCron();

    expect(scheduleMock).toHaveBeenCalledWith("0 7 * * 5", expect.any(Function), { timezone: "America/Sao_Paulo" });
  });

  it("usa PROMOTOR_RELATORIO_CRON_EXPRESSION quando definida", () => {
    process.env.PROMOTOR_RELATORIO_ENABLED = "1";
    process.env.PROMOTOR_RELATORIO_CRON_EXPRESSION = "*/10 * * * *";

    registrarPromotorRelatorioCron();

    expect(scheduleMock).toHaveBeenCalledWith("*/10 * * * *", expect.any(Function), expect.anything());
  });

  it("o tick chama processarClientesElegiveis com o periodo calculado", async () => {
    process.env.PROMOTOR_RELATORIO_ENABLED = "1";
    processarClientesElegiveis.mockResolvedValue({ elegiveis: 0, enviados: 0, falharam: 0 });

    registrarPromotorRelatorioCron();
    const tick = scheduleMock.mock.calls[0][1];
    await tick();

    expect(processarClientesElegiveis).toHaveBeenCalledTimes(1);
    const [periodo] = processarClientesElegiveis.mock.calls[0];
    expect(periodo.fim.getTime()).toBeGreaterThan(periodo.inicio.getTime());
  });

  it("pula o tick se o anterior ainda estiver rodando (lock de sobreposição)", async () => {
    process.env.PROMOTOR_RELATORIO_ENABLED = "1";
    let resolverPrimeiro!: () => void;
    processarClientesElegiveis.mockReturnValueOnce(new Promise<void>((resolve) => (resolverPrimeiro = () => resolve(undefined as any))));

    registrarPromotorRelatorioCron();
    const tick = scheduleMock.mock.calls[0][1];

    const primeiraExecucao = tick();
    await tick(); // segunda chamada, enquanto a primeira ainda não resolveu

    expect(processarClientesElegiveis).toHaveBeenCalledTimes(1);

    resolverPrimeiro();
    await primeiraExecucao;
  });
});
