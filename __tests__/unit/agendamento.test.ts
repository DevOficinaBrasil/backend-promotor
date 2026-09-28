import { proximoHorarioEnvio, horarioNoDia, planejarDisparo, tetoMinimo } from "../../utils/agendamento";
import { formatInTimeZone } from "date-fns-tz";

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

// CONV-21 (disparo-convite-visita-admin): planejamento do disparo com teto
// diário. A janela é a mesma de proximoHorarioEnvio (dia seguinte,
// NOTIFICACAO_HORA_ENVIO..FIM, America/Sao_Paulo) e vale dentro de cada dia.
describe("planejamento do disparo com teto diário", () => {
  const ENV_KEYS = [
    "NOTIFICACAO_HORA_ENVIO",
    "NOTIFICACAO_HORA_ENVIO_FIM",
    "OUTBOX_VISITA_ENVIO_IMEDIATO",
  ] as const;
  let envOriginal: Record<string, string | undefined>;

  // 2026-08-13 12:00 em São Paulo (UTC-3). Janela 09h-19h = 12:00Z-22:00Z.
  const AGORA = new Date("2026-08-13T15:00:00.000Z");
  const diaSP = (d: Date) => formatInTimeZone(d, "America/Sao_Paulo", "yyyy-MM-dd");

  beforeEach(() => {
    envOriginal = {};
    for (const chave of ENV_KEYS) {
      envOriginal[chave] = process.env[chave];
      delete process.env[chave];
    }
    process.env.NOTIFICACAO_HORA_ENVIO = "9";
    process.env.NOTIFICACAO_HORA_ENVIO_FIM = "19";
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

  describe("horarioNoDia", () => {
    // Done when 1: proximoHorarioEnvio(a,p,t) === horarioNoDia(a,1,p,t).
    it.each([
      [0, 1],
      [0, 4],
      [3, 4],
      [9, 10],
    ])("é igual a proximoHorarioEnvio com diasAFrente = 1 (posicao %i de %i)", (posicao, total) => {
      expect(horarioNoDia(AGORA, 1, posicao, total).toISOString()).toBe(
        proximoHorarioEnvio(AGORA, posicao, total).toISOString(),
      );
    });

    it("é igual a proximoHorarioEnvio também sem fim de janela", () => {
      delete process.env.NOTIFICACAO_HORA_ENVIO_FIM;
      expect(horarioNoDia(AGORA, 1, 2, 5).toISOString()).toBe(proximoHorarioEnvio(AGORA, 2, 5).toISOString());
    });

    it("é igual a proximoHorarioEnvio com envio imediato", () => {
      process.env.OUTBOX_VISITA_ENVIO_IMEDIATO = "1";
      expect(horarioNoDia(AGORA, 1, 2, 5).toISOString()).toBe(proximoHorarioEnvio(AGORA, 2, 5).toISOString());
    });

    it("desloca a janela pelo número de dias pedido", () => {
      // dia 16, posição 1 de 2 numa janela de 10h: 09:00 + 5h = 14:00 SP = 17:00Z
      expect(horarioNoDia(AGORA, 3, 1, 2).toISOString()).toBe("2026-08-16T17:00:00.000Z");
    });
  });

  describe("planejarDisparo", () => {
    // Done when 2: 25 itens com teto 10 → 10/10/5 em três dias consecutivos a
    // partir de amanhã, espaçados na janela (spec, Independent Test do Disparo).
    it("distribui 25 itens com teto 10 em 10/10/5 a partir de amanhã, espaçados na janela", () => {
      const plano = planejarDisparo(AGORA, 25, 10);

      expect(plano.porDia).toEqual([
        { data: "2026-08-14", quantidade: 10 },
        { data: "2026-08-15", quantidade: 10 },
        { data: "2026-08-16", quantidade: 5 },
      ]);
      expect(plano.ultimoDia).toBe("2026-08-16");
      expect(plano.slots).toHaveLength(25);

      const horasDia = (inicio: number) =>
        Array.from({ length: 10 }, (_, i) => new Date(Date.UTC(2026, 7, inicio, 12 + i)).toISOString());
      expect(plano.slots.slice(0, 10).map((d) => d.toISOString())).toEqual(horasDia(14));
      expect(plano.slots.slice(10, 20).map((d) => d.toISOString())).toEqual(horasDia(15));
      // 5 no último dia: janela de 10h dividida por 5 → a cada 2h
      expect(plano.slots.slice(20).map((d) => d.toISOString())).toEqual([
        "2026-08-16T12:00:00.000Z",
        "2026-08-16T14:00:00.000Z",
        "2026-08-16T16:00:00.000Z",
        "2026-08-16T18:00:00.000Z",
        "2026-08-16T20:00:00.000Z",
      ]);
    });

    // Done when 3: nenhum dia passa do teto (CONV-21 AC4).
    it.each([
      [1, 1],
      [7, 3],
      [100, 7],
      [1001, 1000],
      [50, 50],
    ])("nunca agenda mais que o teto num mesmo dia (n=%i, teto=%i)", (n, teto) => {
      const plano = planejarDisparo(AGORA, n, teto);

      const contagem = new Map<string, number>();
      for (const slot of plano.slots) {
        contagem.set(diaSP(slot), (contagem.get(diaSP(slot)) ?? 0) + 1);
      }
      expect(plano.slots).toHaveLength(n);
      expect(Math.max(...contagem.values())).toBeLessThanOrEqual(teto);
      expect(plano.porDia).toEqual([...contagem.entries()].map(([data, quantidade]) => ({ data, quantidade })));
      expect(plano.ultimoDia).toBe(diaSP(plano.slots[plano.slots.length - 1]));
    });

    it("com teto maior que o total usa só o dia seguinte", () => {
      const plano = planejarDisparo(AGORA, 3, 1000);
      expect(plano.porDia).toEqual([{ data: "2026-08-14", quantidade: 3 }]);
      expect(plano.ultimoDia).toBe("2026-08-14");
    });

    it("sem itens devolve plano vazio", () => {
      expect(planejarDisparo(AGORA, 0, 10)).toEqual({ slots: [], porDia: [], ultimoDia: null });
    });
  });

  describe("tetoMinimo", () => {
    // Done when 3: o menor teto que cabe até o fim da campanha.
    it("devolve o menor teto cujo último envio cai até o fim da campanha", () => {
      // Fim: 2026-08-15 23:59 SP. 25 itens cabem em 2 dias com teto 13, não com 12 (3 dias).
      const fim = new Date("2026-08-16T02:59:00.000Z");

      const teto = tetoMinimo(AGORA, 25, fim);

      expect(teto).toBe(13);
      const cabe = planejarDisparo(AGORA, 25, 13);
      expect(cabe.slots[cabe.slots.length - 1].getTime()).toBeLessThanOrEqual(fim.getTime());
      const naoCabe = planejarDisparo(AGORA, 25, 12);
      expect(naoCabe.slots[naoCabe.slots.length - 1].getTime()).toBeGreaterThan(fim.getTime());
    });

    it("aceita último envio exatamente no fim da campanha", () => {
      // 1 item, teto 1: sai 2026-08-14 09:00 SP = 12:00Z
      expect(tetoMinimo(AGORA, 1, new Date("2026-08-14T12:00:00.000Z"))).toBe(1)
    });

    it("devolve null quando nem o teto 1000 cabe até o fim", () => {
      // A campanha acaba antes da primeira janela de amanhã.
      expect(tetoMinimo(AGORA, 5, new Date("2026-08-14T11:59:00.000Z"))).toBeNull();
    });

    it("devolve null quando os itens não cabem nem espalhados no único dia disponível", () => {
      // 2 itens no dia 14 caem às 12:00Z e 17:00Z. Fim às 12:00Z não comporta o segundo.
      expect(tetoMinimo(AGORA, 2, new Date("2026-08-14T12:00:00.000Z"))).toBeNull();
    });
  });
});
