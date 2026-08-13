import { proximoHorarioEnvio } from "../../utils/agendamento";

// AGND-02: AVAILABLE_AT is the next occurrence of NOTIFICACAO_HORA_ENVIO in
// America/Sao_Paulo strictly after the creation instant.
// AGND-16: OUTBOX_VISITA_ENVIO_IMEDIATO="1" makes it the creation instant.
//
// Every case injects "now" — the rule must never read the wall clock, or the
// suite would pass or fail depending on the hour it runs at.
describe("proximoHorarioEnvio", () => {
  const ENV_KEYS = ["NOTIFICACAO_HORA_ENVIO", "OUTBOX_VISITA_ENVIO_IMEDIATO"] as const;
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

  it("schedules the same day when called before the configured hour", () => {
    // 2026-08-13 06:00 in São Paulo = 09:00Z
    const agora = new Date("2026-08-13T09:00:00.000Z");

    const resultado = proximoHorarioEnvio(agora);

    expect(resultado.toISOString()).toBe("2026-08-13T12:00:00.000Z");
  });

  it("schedules the next day when called after the configured hour", () => {
    // 2026-08-13 23:40 in São Paulo = 2026-08-14 02:40Z — the import-at-night case
    const agora = new Date("2026-08-14T02:40:00.000Z");

    const resultado = proximoHorarioEnvio(agora);

    expect(resultado.toISOString()).toBe("2026-08-14T12:00:00.000Z");
  });

  it("schedules the next day when called exactly at the configured hour", () => {
    // "strictly after the creation instant" — 09:00:00 itself must roll forward
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
    // 2026-08-31 23:40 in São Paulo = 2026-09-01 02:40Z
    const agora = new Date("2026-09-01T02:40:00.000Z");

    const resultado = proximoHorarioEnvio(agora);

    expect(resultado.toISOString()).toBe("2026-09-01T12:00:00.000Z");
  });

  it("honours NOTIFICACAO_HORA_ENVIO", () => {
    process.env.NOTIFICACAO_HORA_ENVIO = "14";
    const agora = new Date("2026-08-13T09:00:00.000Z");

    const resultado = proximoHorarioEnvio(agora);

    // 14:00 in São Paulo = 17:00Z
    expect(resultado.toISOString()).toBe("2026-08-13T17:00:00.000Z");
  });

  it("falls back to 9 when the configured hour is not a usable number", () => {
    process.env.NOTIFICACAO_HORA_ENVIO = "nove";
    const agora = new Date("2026-08-13T09:00:00.000Z");

    const resultado = proximoHorarioEnvio(agora);

    expect(resultado.toISOString()).toBe("2026-08-13T12:00:00.000Z");
  });

  it("falls back to 9 when the configured hour is out of range", () => {
    process.env.NOTIFICACAO_HORA_ENVIO = "27";
    const agora = new Date("2026-08-13T09:00:00.000Z");

    const resultado = proximoHorarioEnvio(agora);

    expect(resultado.toISOString()).toBe("2026-08-13T12:00:00.000Z");
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

    expect(resultado.toISOString()).toBe("2026-08-13T12:00:00.000Z");
  });
});
