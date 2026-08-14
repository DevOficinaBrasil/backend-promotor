import { parseArgs, podeRearmar } from "../../scripts/outboxConsole";
import { StatusNotificacaoVisita } from "../../entities/NotificacaoVisita";

// AGND-17 a AGND-19: o parsing decide o que o console faz com a fila, então um
// argumento mal lido é um tique ou um rearme no alvo errado.
describe("outboxConsole parseArgs", () => {
  it("reads the status command", () => {
    expect(parseArgs(["status"])).toEqual({
      comando: "status",
      vezes: 1,
      idRota: null,
      idNotificacao: null,
    });
  });

  it("defaults tick to a single cycle", () => {
    expect(parseArgs(["tick"]).vezes).toBe(1);
  });

  it("reads --vezes for repeated ticks", () => {
    expect(parseArgs(["tick", "--vezes", "3"]).vezes).toBe(3);
  });

  it("reads agendar with a route id", () => {
    expect(parseArgs(["agendar", "--rota", "123"])).toEqual({
      comando: "agendar",
      vezes: 1,
      idRota: 123,
      idNotificacao: null,
    });
  });

  it("reads agendar with a notification id", () => {
    expect(parseArgs(["agendar", "--notificacao", "456"]).idNotificacao).toBe(456);
  });

  it("rejects an unknown command", () => {
    expect(() => parseArgs(["despachar"])).toThrow(/comando desconhecido/);
  });

  it("rejects a missing command", () => {
    expect(() => parseArgs([])).toThrow(/comando desconhecido/);
  });

  it("rejects agendar without a target", () => {
    expect(() => parseArgs(["agendar"])).toThrow(/exige --rota ou --notificacao/);
  });

  it.each([["abc"], ["0"], ["-5"], ["1.5"]])(
    "rejects %s as an id instead of silently coercing it",
    (valor) => {
      expect(() => parseArgs(["agendar", "--rota", valor])).toThrow(/id inteiro positivo/);
    }
  );

  // AGND-19: a única guarda do console cuja falha apaga dado real.
  describe("podeRearmar", () => {
    it("refuses a CONFIRMADO row, so a replay cannot destroy a real confirmation", () => {
      expect(podeRearmar(StatusNotificacaoVisita.CONFIRMADO)).toBe(false);
    });

    it.each([
      [StatusNotificacaoVisita.PENDENTE],
      [StatusNotificacaoVisita.ENVIADO],
      [StatusNotificacaoVisita.FALHOU],
      [StatusNotificacaoVisita.DISPENSADO],
      [StatusNotificacaoVisita.EXPIRADO],
    ])("allows re-arming a row in %s", (status) => {
      expect(podeRearmar(status)).toBe(true);
    });
  });
});
