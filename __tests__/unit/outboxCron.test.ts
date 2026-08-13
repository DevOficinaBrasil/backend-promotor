import cron from "node-cron";
import { registrarOutboxCron } from "../../schedule/outboxNotificacaoCron";
import OutboxNotificacaoService from "../../service/outboxNotificacaoService";

jest.mock("node-cron", () => ({ __esModule: true, default: { schedule: jest.fn() } }));
jest.mock("../../service/outboxNotificacaoService", () => ({
  __esModule: true,
  default: { tick: jest.fn() },
  idDoWorker: (sufixo = "") => `outbox-visita${sufixo}-1234`,
}));

const scheduleMock = cron.schedule as jest.Mock;
const tickMock = OutboxNotificacaoService.tick as jest.Mock;

// AGND-13: default-off, and never running under a test run.
describe("registrarOutboxCron", () => {
  const ENV_KEYS = [
    "NODE_ENV",
    "OUTBOX_VISITA_ENABLED",
    "OUTBOX_VISITA_CRON_EXPRESSION",
  ] as const;
  let envOriginal: Record<string, string | undefined>;

  beforeEach(() => {
    envOriginal = {};
    for (const chave of ENV_KEYS) {
      envOriginal[chave] = process.env[chave];
      delete process.env[chave];
    }
    // Registration only ever happens outside a test run; every case here sets
    // NODE_ENV explicitly, so the test lock is exercised rather than assumed.
    process.env.NODE_ENV = "production";
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    for (const chave of ENV_KEYS) {
      if (envOriginal[chave] === undefined) {
        delete process.env[chave];
      } else {
        process.env[chave] = envOriginal[chave];
      }
    }
    jest.restoreAllMocks();
  });

  it("does not register when OUTBOX_VISITA_ENABLED is unset", () => {
    registrarOutboxCron();

    expect(scheduleMock).not.toHaveBeenCalled();
  });

  // The known cost of borrowing the other repo's '1' convention: this repo's
  // own flags use "true", so the wrong spelling must fail visibly.
  it('does not register for "true", only for exactly "1"', () => {
    process.env.OUTBOX_VISITA_ENABLED = "true";

    registrarOutboxCron();

    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it("registers on the default expression when enabled", () => {
    process.env.OUTBOX_VISITA_ENABLED = "1";

    registrarOutboxCron();

    expect(scheduleMock).toHaveBeenCalledWith("*/1 * * * *", expect.any(Function));
  });

  it("honours OUTBOX_VISITA_CRON_EXPRESSION", () => {
    process.env.OUTBOX_VISITA_ENABLED = "1";
    process.env.OUTBOX_VISITA_CRON_EXPRESSION = "*/5 * * * *";

    registrarOutboxCron();

    expect(scheduleMock).toHaveBeenCalledWith("*/5 * * * *", expect.any(Function));
  });

  it("never registers under NODE_ENV=test, whatever else is set", () => {
    process.env.NODE_ENV = "test";
    process.env.OUTBOX_VISITA_ENABLED = "1";
    process.env.OUTBOX_VISITA_CRON_EXPRESSION = "*/1 * * * *";

    registrarOutboxCron();

    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it("logs the parsed flag so a wrong spelling is visible at startup", () => {
    process.env.OUTBOX_VISITA_ENABLED = "true";

    registrarOutboxCron();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("configuração da fila"),
      expect.objectContaining({ habilitado: false, OUTBOX_VISITA_ENABLED: "true" })
    );
  });

  it("ticks when the scheduled callback fires", async () => {
    process.env.OUTBOX_VISITA_ENABLED = "1";
    tickMock.mockResolvedValue(undefined);

    registrarOutboxCron();
    const callback = scheduleMock.mock.calls[0][1] as () => Promise<void>;
    await callback();

    expect(tickMock).toHaveBeenCalledTimes(1);
  });

  // A slow batch must not stack ticks on top of itself.
  it("skips a tick while the previous one is still running", async () => {
    process.env.OUTBOX_VISITA_ENABLED = "1";
    let liberar: () => void = () => {};
    tickMock.mockImplementation(() => new Promise<void>((resolve) => (liberar = resolve)));

    registrarOutboxCron();
    const callback = scheduleMock.mock.calls[0][1] as () => Promise<void>;

    const primeiro = callback();
    await callback();

    expect(tickMock).toHaveBeenCalledTimes(1);

    liberar();
    await primeiro;

    // Solta o tique pendente antes do próximo, senão o terceiro await ficaria
    // esperando a mesma promise que nunca resolve.
    tickMock.mockResolvedValue(undefined);
    await callback();
    expect(tickMock).toHaveBeenCalledTimes(2);
  });

  it("releases the guard when a tick rejects, so the next one still runs", async () => {
    process.env.OUTBOX_VISITA_ENABLED = "1";
    tickMock.mockRejectedValueOnce(new Error("tick explodiu")).mockResolvedValueOnce(undefined);

    registrarOutboxCron();
    const callback = scheduleMock.mock.calls[0][1] as () => Promise<void>;

    await expect(callback()).rejects.toThrow("tick explodiu");
    await callback();

    expect(tickMock).toHaveBeenCalledTimes(2);
  });
});
