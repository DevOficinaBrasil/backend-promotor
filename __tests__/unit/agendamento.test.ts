import { proximoHorarioEnvio } from "../../utils/agendamento";

// AGND-02: AVAILABLE_AT is the next occurrence of NOTIFICACAO_HORA_ENVIO in
// America/Sao_Paulo strictly after the creation instant.
// AGND-16: OUTBOX_VISITA_ENVIO_IMEDIATO="1" makes it the creation instant.
//
// Every case injects "now" — the rule must never read the wall clock, or the
// suite would pass or fail depending on the hour it runs at.
describe("proximoHorarioEnvio", () => {
  const ENV_KEYS = [
    "NOTIFICACAO_HORA_ENVIO",
    "NOTIFICACAO_HORA_ENVIO_FIM",
    "OUTBOX_VISITA_ENVIO_IMEDIATO",
  ] as const;
  let envOriginal: Record<string, string | undefined>;

  // São Paulo is UTC-3 (Brazil abolished DST in 2019), so 09:00 local is 12:00Z.
  const NOVE_EM_SP_COMO_UTC = 12;

  beforeEach(() => {
    envOriginal = {};
    for (const chave of ENV_KEYS) {
      envOriginal[chave] = process.env[chave];
      delete process.env[chave];
    }
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

  it("schedules the next day even when called before the configured hour", () => {
    // 2026-08-13 06:00 in São Paulo = 09:00Z. The rule is deliberately "always
    // tomorrow": send time must never depend on what hour ops imported.
    const agora = new Date("2026-08-13T09:00:00.000Z");

    const resultado = proximoHorarioEnvio(agora);

    expect(resultado.toISOString()).toBe("2026-08-14T12:00:00.000Z");
  });

  it("schedules the next day when called after the configured hour", () => {
    // 2026-08-13 23:40 in São Paulo = 2026-08-14 02:40Z — the import-at-night case
    const agora = new Date("2026-08-14T02:40:00.000Z");

    const resultado = proximoHorarioEnvio(agora);

    expect(resultado.toISOString()).toBe("2026-08-14T12:00:00.000Z");
  });

  it("schedules the next day when called exactly at the configured hour", () => {
    const agora = new Date("2026-08-13T12:00:00.000Z");

    const resultado = proximoHorarioEnvio(agora);

    expect(resultado.toISOString()).toBe("2026-08-14T12:00:00.000Z");
  });

  it("lands on the configured hour in São Paulo, not in UTC", () => {
    const agora = new Date("2026-08-13T09:00:00.000Z");

    const resultado = proximoHorarioEnvio(agora);

    // 12:00Z is 09:00 in São Paulo; asserting the UTC hour pins the conversion
    expect(resultado.getUTCHours()).toBe(NOVE_EM_SP_COMO_UTC);
    expect(resultado.getUTCMinutes()).toBe(0);
    expect(resultado.getUTCSeconds()).toBe(0);
    expect(resultado.getUTCMilliseconds()).toBe(0);
  });

  it("crosses the month boundary correctly", () => {
    // 2026-09-01 02:40Z ainda é 31/08 23:40 em São Paulo, então o dia seguinte
    // local é 01/09 — a conversão de fuso decide a data, não o UTC.
    const agora = new Date("2026-09-01T02:40:00.000Z");

    const resultado = proximoHorarioEnvio(agora);

    expect(resultado.toISOString()).toBe("2026-09-01T12:00:00.000Z");
  });

  it("honours NOTIFICACAO_HORA_ENVIO", () => {
    process.env.NOTIFICACAO_HORA_ENVIO = "14";
    const agora = new Date("2026-08-13T09:00:00.000Z");

    const resultado = proximoHorarioEnvio(agora);

    // 14:00 in São Paulo = 17:00Z, next day
    expect(resultado.toISOString()).toBe("2026-08-14T17:00:00.000Z");
  });

  it("falls back to 9 when the configured hour is not a usable number", () => {
    process.env.NOTIFICACAO_HORA_ENVIO = "nove";
    const agora = new Date("2026-08-13T09:00:00.000Z");

    const resultado = proximoHorarioEnvio(agora);

    expect(resultado.toISOString()).toBe("2026-08-14T12:00:00.000Z");
  });

  it("falls back to 9 when the configured hour is out of range", () => {
    process.env.NOTIFICACAO_HORA_ENVIO = "27";
    const agora = new Date("2026-08-13T09:00:00.000Z");

    const resultado = proximoHorarioEnvio(agora);

    expect(resultado.toISOString()).toBe("2026-08-14T12:00:00.000Z");
  });

  it("returns the instant unchanged when OUTBOX_VISITA_ENVIO_IMEDIATO is 1", () => {
    process.env.OUTBOX_VISITA_ENVIO_IMEDIATO = "1";
    const agora = new Date("2026-08-13T09:00:00.000Z");

    const resultado = proximoHorarioEnvio(agora);

    expect(resultado.toISOString()).toBe("2026-08-13T09:00:00.000Z");
  });

  it("ignores the override for any value other than exactly 1", () => {
    process.env.OUTBOX_VISITA_ENVIO_IMEDIATO = "true";
    const agora = new Date("2026-08-13T09:00:00.000Z");

    const resultado = proximoHorarioEnvio(agora);

    expect(resultado.toISOString()).toBe("2026-08-14T12:00:00.000Z");
  });

  // Janela 07:00–10:00 SP = 10:00Z–13:00Z. Espalhar o lote é o que impede um
  // import de 500 rotas de virar rajada num único instante.
  describe("send window", () => {
    const INICIO_UTC = "2026-08-14T10:00:00.000Z";

    beforeEach(() => {
      process.env.NOTIFICACAO_HORA_ENVIO = "7";
      process.env.NOTIFICACAO_HORA_ENVIO_FIM = "10";
    });

    it("puts a lone notification at the start of the window", () => {
      const resultado = proximoHorarioEnvio(new Date("2026-08-13T09:00:00.000Z"));

      expect(resultado.toISOString()).toBe(INICIO_UTC);
    });

    it("spreads a batch evenly across the window", () => {
      const agora = new Date("2026-08-13T09:00:00.000Z");

      const horarios = [0, 1, 2].map((i) => proximoHorarioEnvio(agora, i, 3).toISOString());

      // 3 horas / 3 rotas = uma por hora
      expect(horarios).toEqual([
        "2026-08-14T10:00:00.000Z",
        "2026-08-14T11:00:00.000Z",
        "2026-08-14T12:00:00.000Z",
      ]);
    });

    it("never schedules anything at or after the end of the window", () => {
      const agora = new Date("2026-08-13T09:00:00.000Z");
      const fim = new Date("2026-08-14T13:00:00.000Z").getTime();

      for (let i = 0; i < 50; i += 1) {
        const instante = proximoHorarioEnvio(agora, i, 50).getTime();
        expect(instante).toBeGreaterThanOrEqual(new Date(INICIO_UTC).getTime());
        expect(instante).toBeLessThan(fim);
      }
    });

    it("keeps the batch in creation order", () => {
      const agora = new Date("2026-08-13T09:00:00.000Z");

      const horarios = [0, 1, 2, 3, 4].map((i) => proximoHorarioEnvio(agora, i, 5).getTime());

      expect([...horarios]).toEqual([...horarios].sort((a, b) => a - b));
    });

    it("clamps a position beyond the batch size instead of overshooting the window", () => {
      const agora = new Date("2026-08-13T09:00:00.000Z");

      const resultado = proximoHorarioEnvio(agora, 99, 3);

      expect(resultado.toISOString()).toBe("2026-08-14T12:00:00.000Z");
    });

    it("collapses to the start hour when the end is not after the start", () => {
      process.env.NOTIFICACAO_HORA_ENVIO_FIM = "7";
      const agora = new Date("2026-08-13T09:00:00.000Z");

      const horarios = [0, 1, 2].map((i) => proximoHorarioEnvio(agora, i, 3).toISOString());

      expect(horarios).toEqual([INICIO_UTC, INICIO_UTC, INICIO_UTC]);
    });

    it("ignores an unusable end hour and keeps the single-hour behaviour", () => {
      process.env.NOTIFICACAO_HORA_ENVIO_FIM = "vinte e duas";
      const agora = new Date("2026-08-13T09:00:00.000Z");

      const resultado = proximoHorarioEnvio(agora, 1, 3);

      expect(resultado.toISOString()).toBe(INICIO_UTC);
    });

    it("still honours the immediate-send override inside a window", () => {
      process.env.OUTBOX_VISITA_ENVIO_IMEDIATO = "1";
      const agora = new Date("2026-08-13T09:00:00.000Z");

      expect(proximoHorarioEnvio(agora, 2, 5).toISOString()).toBe("2026-08-13T09:00:00.000Z");
    });
  });
});
