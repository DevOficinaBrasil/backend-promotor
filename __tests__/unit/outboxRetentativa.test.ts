import {
  computeBackoffMs,
  shouldMarkFailed,
  acaoDaFila,
} from "../../service/outboxNotificacaoService";

// AGND-11: transient failures retry with the ladder copied from
// OutboxService.computeBackoffMs; everything else retires on the first attempt.
describe("outbox retry policy", () => {
  describe("computeBackoffMs", () => {
    // Copied verbatim from backend-communities so both services age the same way.
    it.each([
      [1, 0],
      [2, 15_000],
      [3, 60_000],
      [4, 5 * 60_000],
      [5, 15 * 60_000],
      [9, 15 * 60_000],
    ])("waits %ims of backoff on attempt %i", (tentativa, esperado) => {
      expect(computeBackoffMs(tentativa)).toBe(esperado);
    });

    it("treats a zero or negative attempt as the first one", () => {
      expect(computeBackoffMs(0)).toBe(0);
      expect(computeBackoffMs(-3)).toBe(0);
    });
  });

  describe("shouldMarkFailed", () => {
    const ENV = "OUTBOX_VISITA_MAX_ATTEMPTS";
    let original: string | undefined;

    beforeEach(() => {
      original = process.env[ENV];
      delete process.env[ENV];
    });

    afterEach(() => {
      if (original === undefined) {
        delete process.env[ENV];
      } else {
        process.env[ENV] = original;
      }
    });

    it("retires a non-transient failure on the first attempt", () => {
      expect(shouldMarkFailed(1, false)).toBe(true);
    });

    it("retries a transient failure below the ceiling", () => {
      expect(shouldMarkFailed(1, true)).toBe(false);
      expect(shouldMarkFailed(2, true)).toBe(false);
    });

    it("retires a transient failure at the ceiling", () => {
      expect(shouldMarkFailed(3, true)).toBe(true);
    });

    it("retires a transient failure past the ceiling", () => {
      expect(shouldMarkFailed(4, true)).toBe(true);
    });

    it("honours OUTBOX_VISITA_MAX_ATTEMPTS", () => {
      process.env[ENV] = "5";

      expect(shouldMarkFailed(4, true)).toBe(false);
      expect(shouldMarkFailed(5, true)).toBe(true);
    });

    it("falls back to 3 when the ceiling is not a usable number", () => {
      process.env[ENV] = "muitas";

      expect(shouldMarkFailed(2, true)).toBe(false);
      expect(shouldMarkFailed(3, true)).toBe(true);
    });
  });

  // The queue reads the dispatch verdict; it never re-reads channel reasons.
  describe("acaoDaFila", () => {
    it("finishes a successful dispatch", () => {
      expect(
        acaoDaFila({ desfecho: "ENVIADO", messageId: "m", providerMessageId: "p" }, 1)
      ).toEqual({ acao: "ENVIADO", messageId: "m", providerMessageId: "p" });
    });

    it("finishes a suppressed notification without failing it", () => {
      expect(acaoDaFila({ desfecho: "DISPENSADO", motivo: "address recently updated" }, 1)).toEqual(
        { acao: "CONCLUIDO" }
      );
    });

    it("finishes a terminal failure without retrying", () => {
      expect(acaoDaFila({ desfecho: "FALHOU_TERMINAL", erro: "invalid phone" }, 1)).toEqual({
        acao: "CONCLUIDO",
      });
    });

    it("retries a transient failure below the ceiling, with backoff", () => {
      expect(acaoDaFila({ desfecho: "FALHOU_TRANSITORIO", erro: "network error" }, 2)).toEqual({
        acao: "RETENTAR",
        erro: "network error",
        backoffMs: 15_000,
      });
    });

    it("retires a transient failure once the ceiling is reached", () => {
      expect(acaoDaFila({ desfecho: "FALHOU_TRANSITORIO", erro: "network error" }, 3)).toEqual({
        acao: "FALHOU",
        erro: "network error",
      });
    });
  });
});
