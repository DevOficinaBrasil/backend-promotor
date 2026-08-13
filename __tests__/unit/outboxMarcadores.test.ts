import { AppDataSourceSync } from "../../data-source";
import NotificacaoVisita, {
  StatusNotificacaoVisita,
} from "../../entities/NotificacaoVisita";
import OutboxNotificacaoService from "../../service/outboxNotificacaoService";

jest.mock("../../data-source");

// AGND-10, AGND-11: the queue owns lease, attempts and AVAILABLE_AT; the
// dispatch owns domain status. These helpers are the queue's half.
describe("OutboxNotificacaoService mark helpers", () => {
  const ID = 77;
  let repo: { update: jest.Mock };

  beforeEach(() => {
    repo = { update: jest.fn(async () => ({ affected: 1 })) };
    (AppDataSourceSync.getRepository as jest.Mock) = jest.fn(() => repo);
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function patchDaChamada(): Partial<NotificacaoVisita> {
    return repo.update.mock.calls[0][1] as Partial<NotificacaoVisita>;
  }

  describe("marcarEnviado", () => {
    it("records ENVIADO with the provider identifiers and the send time", async () => {
      await OutboxNotificacaoService.marcarEnviado(ID, "msg-1", "wamid.1");

      expect(repo.update).toHaveBeenCalledWith({ ID_NOTIFICACAO_VISITA: ID }, expect.anything());
      const patch = patchDaChamada();
      expect(patch.STATUS).toBe(StatusNotificacaoVisita.ENVIADO);
      expect(patch.MESSAGE_ID).toBe("msg-1");
      expect(patch.PROVIDER_MESSAGE_ID).toBe("wamid.1");
      expect(patch.ENVIADO_EM).toBeInstanceOf(Date);
    });

    it("releases the lease", async () => {
      await OutboxNotificacaoService.marcarEnviado(ID, null, null);

      const patch = patchDaChamada();
      expect(patch.LOCKED_AT).toBeNull();
      expect(patch.LOCKED_BY).toBeNull();
    });
  });

  describe("liberarLease", () => {
    // DISPENSADO and terminal FALHOU are already persisted by the dispatch, so
    // for the queue they are only "done — let go of the row".
    it("clears the lease without touching STATUS", async () => {
      await OutboxNotificacaoService.liberarLease(ID);

      const patch = patchDaChamada();
      expect(patch.LOCKED_AT).toBeNull();
      expect(patch.LOCKED_BY).toBeNull();
      expect(patch).not.toHaveProperty("STATUS");
      expect(patch).not.toHaveProperty("ATTEMPTS");
    });
  });

  describe("marcarRetentativa", () => {
    it("keeps the row PENDENTE and records the reason", async () => {
      await OutboxNotificacaoService.marcarRetentativa(ID, "network error", 15_000);

      const patch = patchDaChamada();
      expect(patch.STATUS).toBe(StatusNotificacaoVisita.PENDENTE);
      expect(patch.ERRO_ENVIO).toBe("network error");
    });

    it("pushes AVAILABLE_AT forward by the backoff", async () => {
      const antes = Date.now();

      await OutboxNotificacaoService.marcarRetentativa(ID, "network error", 60_000);

      const patch = patchDaChamada();
      expect(patch.AVAILABLE_AT!.getTime()).toBeGreaterThanOrEqual(antes + 60_000);
      expect(patch.AVAILABLE_AT!.getTime()).toBeLessThanOrEqual(Date.now() + 60_000);
    });

    it("releases the lease so another worker can pick the row up", async () => {
      await OutboxNotificacaoService.marcarRetentativa(ID, "network error", 0);

      const patch = patchDaChamada();
      expect(patch.LOCKED_AT).toBeNull();
      expect(patch.LOCKED_BY).toBeNull();
    });

    // The bug NOT inherited from OutboxPublisher.ts:116, which resets attempts
    // to 1 and lets a repeatedly crashing row retry forever.
    it("never rewrites ATTEMPTS", async () => {
      await OutboxNotificacaoService.marcarRetentativa(ID, "network error", 0);

      expect(patchDaChamada()).not.toHaveProperty("ATTEMPTS");
    });
  });

  describe("marcarFalhou", () => {
    it("records the terminal failure with its reason and releases the lease", async () => {
      await OutboxNotificacaoService.marcarFalhou(ID, "provider error: BOOM");

      const patch = patchDaChamada();
      expect(patch.STATUS).toBe(StatusNotificacaoVisita.FALHOU);
      expect(patch.ERRO_ENVIO).toBe("provider error: BOOM");
      expect(patch.LOCKED_AT).toBeNull();
      expect(patch.LOCKED_BY).toBeNull();
    });

    it("never rewrites ATTEMPTS", async () => {
      await OutboxNotificacaoService.marcarFalhou(ID, "provider error");

      expect(patchDaChamada()).not.toHaveProperty("ATTEMPTS");
    });
  });
});
