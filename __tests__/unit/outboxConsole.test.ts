import { parseArgs } from "../../scripts/outboxConsole";

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
});
