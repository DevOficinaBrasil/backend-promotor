import OutboxNotificacaoService from "../../service/outboxNotificacaoService";
import NotificacaoVisitaService from "../../service/notificacaoVisitaService";
import { AppDataSourceSync } from "../../data-source";

jest.mock("../../data-source");
jest.mock("../../service/notificacaoVisitaService");

// AGND-12, AGND-14, AGND-20: one tick claims a bounded batch, dispatches each
// row in isolation, routes the verdict to the right mark helper, and never
// throws at the process hosting it.
describe("OutboxNotificacaoService.tick", () => {
  const despachar = NotificacaoVisitaService.despacharNotificacao as jest.Mock;

  let claimBatch: jest.SpyInstance;
  let marcarEnviado: jest.SpyInstance;
  let marcarRetentativa: jest.SpyInstance;
  let marcarFalhou: jest.SpyInstance;
  let liberarLease: jest.SpyInstance;
  let envOriginal: Record<string, string | undefined>;
  const ENV_KEYS = ["OUTBOX_VISITA_BATCH_SIZE", "OUTBOX_VISITA_MAX_ATTEMPTS"] as const;

  beforeEach(() => {
    envOriginal = {};
    for (const chave of ENV_KEYS) {
      envOriginal[chave] = process.env[chave];
      delete process.env[chave];
    }

    claimBatch = jest.spyOn(OutboxNotificacaoService, "claimBatch").mockResolvedValue([]);
    marcarEnviado = jest.spyOn(OutboxNotificacaoService, "marcarEnviado").mockResolvedValue();
    marcarRetentativa = jest
      .spyOn(OutboxNotificacaoService, "marcarRetentativa")
      .mockResolvedValue();
    marcarFalhou = jest.spyOn(OutboxNotificacaoService, "marcarFalhou").mockResolvedValue();
    liberarLease = jest.spyOn(OutboxNotificacaoService, "liberarLease").mockResolvedValue();

    (AppDataSourceSync.getRepository as jest.Mock) = jest.fn(() => ({
      findOne: jest.fn(async () => ({ ID_NOTIFICACAO_VISITA: 1, ATTEMPTS: 1, ID_ROTA_PROMOTOR: 9 })),
    }));

    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
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

  it("claims nothing more than the configured batch size", async () => {
    process.env.OUTBOX_VISITA_BATCH_SIZE = "7";

    await OutboxNotificacaoService.tick();

    expect(claimBatch).toHaveBeenCalledWith(7, expect.stringContaining("outbox-visita"));
  });

  it("does not dispatch when nothing is due", async () => {
    claimBatch.mockResolvedValue([]);

    await OutboxNotificacaoService.tick();

    expect(despachar).not.toHaveBeenCalled();
  });

  it("dispatches every claimed row", async () => {
    claimBatch.mockResolvedValue([1, 2, 3]);
    despachar.mockResolvedValue({ desfecho: "ENVIADO", messageId: "m", providerMessageId: "p" });

    await OutboxNotificacaoService.tick();

    expect(despachar).toHaveBeenCalledTimes(3);
    expect(despachar).toHaveBeenCalledWith(1);
    expect(despachar).toHaveBeenCalledWith(2);
    expect(despachar).toHaveBeenCalledWith(3);
  });

  it("records a successful dispatch with its provider identifiers", async () => {
    claimBatch.mockResolvedValue([42]);
    despachar.mockResolvedValue({
      desfecho: "ENVIADO",
      messageId: "msg-9",
      providerMessageId: "wamid.9",
    });

    await OutboxNotificacaoService.tick();

    expect(marcarEnviado).toHaveBeenCalledWith(42, "msg-9", "wamid.9");
  });

  it("only releases the lease for a suppressed notification", async () => {
    claimBatch.mockResolvedValue([42]);
    despachar.mockResolvedValue({ desfecho: "DISPENSADO", motivo: "address recently updated" });

    await OutboxNotificacaoService.tick();

    expect(liberarLease).toHaveBeenCalledWith(42);
    expect(marcarFalhou).not.toHaveBeenCalled();
    expect(marcarRetentativa).not.toHaveBeenCalled();
  });

  it("only releases the lease for a terminal failure the dispatch already persisted", async () => {
    claimBatch.mockResolvedValue([42]);
    despachar.mockResolvedValue({ desfecho: "FALHOU_TERMINAL", erro: "invalid phone" });

    await OutboxNotificacaoService.tick();

    expect(liberarLease).toHaveBeenCalledWith(42);
    expect(marcarFalhou).not.toHaveBeenCalled();
  });

  it("schedules a retry with backoff while below the ceiling", async () => {
    claimBatch.mockResolvedValue([42]);
    despachar.mockResolvedValue({ desfecho: "FALHOU_TRANSITORIO", erro: "network error" });

    await OutboxNotificacaoService.tick();

    // ATTEMPTS is 1 on the loaded row, so the ladder's first step: no wait.
    expect(marcarRetentativa).toHaveBeenCalledWith(42, "network error", 0);
    expect(marcarFalhou).not.toHaveBeenCalled();
  });

  it("retires a transient failure once the attempt ceiling is reached", async () => {
    claimBatch.mockResolvedValue([42]);
    despachar.mockResolvedValue({ desfecho: "FALHOU_TRANSITORIO", erro: "network error" });
    (AppDataSourceSync.getRepository as jest.Mock) = jest.fn(() => ({
      findOne: jest.fn(async () => ({ ID_NOTIFICACAO_VISITA: 42, ATTEMPTS: 3, ID_ROTA_PROMOTOR: 9 })),
    }));

    await OutboxNotificacaoService.tick();

    expect(marcarFalhou).toHaveBeenCalledWith(42, "network error");
    expect(marcarRetentativa).not.toHaveBeenCalled();
  });

  // One bad row must not cost the rest of the batch.
  it("keeps dispatching the batch when one row throws", async () => {
    claimBatch.mockResolvedValue([1, 2, 3]);
    despachar
      .mockResolvedValueOnce({ desfecho: "ENVIADO", messageId: "a", providerMessageId: "b" })
      .mockRejectedValueOnce(new Error("linha explodiu"))
      .mockResolvedValueOnce({ desfecho: "ENVIADO", messageId: "c", providerMessageId: "d" });

    await OutboxNotificacaoService.tick();

    expect(despachar).toHaveBeenCalledTimes(3);
    expect(marcarEnviado).toHaveBeenCalledTimes(2);
  });

  it("treats a row that throws as a transient failure, so it is retried", async () => {
    claimBatch.mockResolvedValue([5]);
    despachar.mockRejectedValue(new Error("linha explodiu"));

    await OutboxNotificacaoService.tick();

    expect(marcarRetentativa).toHaveBeenCalledWith(5, expect.stringContaining("linha explodiu"), 0);
  });

  // AGND-12: the tick runs inside the API process; it may never take it down.
  it("never throws when the claim itself fails", async () => {
    claimBatch.mockRejectedValue(new Error("banco fora"));

    await expect(OutboxNotificacaoService.tick()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("falha no tick"),
      expect.objectContaining({ erro: "banco fora" })
    );
  });

  it("never throws when a mark helper fails", async () => {
    claimBatch.mockResolvedValue([1]);
    despachar.mockResolvedValue({ desfecho: "ENVIADO", messageId: "m", providerMessageId: "p" });
    marcarEnviado.mockRejectedValue(new Error("update falhou"));

    await expect(OutboxNotificacaoService.tick()).resolves.toBeUndefined();
  });

  // AGND-14: both ids on every outcome, so a queue problem is traceable.
  it("logs the claim count and each row outcome with both ids", async () => {
    claimBatch.mockResolvedValue([42]);
    despachar.mockResolvedValue({ desfecho: "ENVIADO", messageId: "m", providerMessageId: "p" });

    await OutboxNotificacaoService.tick();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("reivindicadas"),
      expect.objectContaining({ quantidade: 1 })
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("desfecho"),
      expect.objectContaining({
        ID_NOTIFICACAO_VISITA: 42,
        ID_ROTA_PROMOTOR: 9,
        acao: "ENVIADO",
      })
    );
  });
});
