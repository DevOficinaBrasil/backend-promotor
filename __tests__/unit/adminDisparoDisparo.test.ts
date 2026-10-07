import { AppDataSourceSync } from "../../data-source";
import AdminDisparoService, { MSG_TETO_INVALIDO } from "../../service/adminDisparoService";
import NotificacaoVisita, { CanalNotificacao, StatusNotificacaoVisita } from "../../entities/NotificacaoVisita";
import { planejarDisparo } from "../../utils/agendamento";

jest.mock("../../data-source");

const normalizarSql = (sql: string) => sql.replace(/\s+/g, " ").trim();

// T19 (CONV-19 a CONV-24)
describe("AdminDisparoService.previaDisparo / disparar", () => {
  // 12:00 em São Paulo; a janela de envio é 9h-17h.
  const agora = new Date("2026-09-28T15:00:00.000Z");
  const fimLongo = new Date("2026-12-31T23:59:00-03:00");
  const envAnterior = { ...process.env };

  const queryMock = AppDataSourceSync.query as jest.Mock;
  let valuesMock: jest.Mock;
  let orIgnoreMock: jest.Mock;
  let intoMock: jest.Mock;
  let executeMock: jest.Mock;
  let createQueryBuilderMock: jest.Mock;
  let campanha: Record<string, unknown>;
  let rotas: { ID_ROTA_PROMOTOR: number; ID_NOTIFICACAO_VISITA: number | null }[];

  const rotasSemNotificacao = (n: number, desde = 1) =>
    Array.from({ length: n }, (_, i) => ({ ID_ROTA_PROMOTOR: desde + i, ID_NOTIFICACAO_VISITA: null }));

  beforeEach(() => {
    process.env.NOTIFICACAO_HORA_ENVIO = "9";
    process.env.NOTIFICACAO_HORA_ENVIO_FIM = "17";
    delete process.env.OUTBOX_VISITA_ENVIO_IMEDIATO;

    campanha = { ID_CAMPANHA: 77, ID_CLIENT: 5, EMPRESA_SLUG: "zf", END_TIME: fimLongo };
    rotas = [];
    queryMock.mockReset();
    queryMock.mockImplementation(async (sql: string) => {
      const s = normalizarSql(sql);
      if (s.includes('FROM "CAMPANHAS_OB"."CAMPANHA" c WHERE c."ID_CAMPANHA" = $1')) return [campanha];
      if (s.includes("= ANY($2::int[])")) return rotas;
      return [];
    });

    // Por padrão toda linha entra: o RETURNING devolve todas.
    executeMock = jest.fn(async () => ({
      raw: (valuesMock.mock.calls[valuesMock.mock.calls.length - 1][0] as any[]).map((l, i) => ({
        ID_NOTIFICACAO_VISITA: 5000 + i,
        ID_ROTA_PROMOTOR: l.ID_ROTA_PROMOTOR,
      })),
    }));
    const returningMock = jest.fn(() => ({ execute: executeMock }));
    orIgnoreMock = jest.fn(() => ({ returning: returningMock }));
    valuesMock = jest.fn(() => ({ orIgnore: orIgnoreMock }));
    intoMock = jest.fn(() => ({ values: valuesMock }));
    createQueryBuilderMock = jest.fn(() => ({ insert: jest.fn(() => ({ into: intoMock })) }));
    (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue({ createQueryBuilder: createQueryBuilderMock });
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...envAnterior };
    jest.restoreAllMocks();
  });

  it.each([
    ["zero", 0],
    ["acima de 1000", 1001],
    ["fracionário", 1.5],
    ["texto", "10"],
    ["ausente", undefined],
  ])("teto %s → 400 'Teto diário deve ser um inteiro entre 1 e 1000' sem enfileirar", async (_, teto) => {
    rotas = rotasSemNotificacao(3);

    await expect(AdminDisparoService.disparar(77, [1, 2, 3], teto, agora)).rejects.toMatchObject({
      status: 400,
      message: "Teto diário deve ser um inteiro entre 1 e 1000",
    });
    await expect(AdminDisparoService.previaDisparo(77, [1, 2, 3], teto, agora)).rejects.toMatchObject({
      status: 400,
      message: MSG_TETO_INVALIDO,
    });
    expect(createQueryBuilderMock).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("aceita os limites 1 e 1000", async () => {
    rotas = rotasSemNotificacao(2);

    await expect(AdminDisparoService.previaDisparo(77, [1, 2], 1, agora)).resolves.toMatchObject({ totalConvites: 2 });
    await expect(AdminDisparoService.previaDisparo(77, [1, 2], 1000, agora)).resolves.toMatchObject({ totalConvites: 2 });
  });

  it("prévia de 25 rotas com teto 10: 10 / 10 / 5 a partir de amanhã, sem escrever nada (CONV-19)", async () => {
    rotas = rotasSemNotificacao(25);

    const r = await AdminDisparoService.previaDisparo(77, rotas.map((x) => x.ID_ROTA_PROMOTOR), 10, agora);

    expect(r).toEqual({
      totalConvites: 25,
      jaDisparadas: 0,
      porDia: [
        { data: "2026-09-29", quantidade: 10 },
        { data: "2026-09-30", quantidade: 10 },
        { data: "2026-10-01", quantidade: 5 },
      ],
      ultimoDia: "2026-10-01",
    });
    expect(createQueryBuilderMock).not.toHaveBeenCalled();
  });

  it("carrega só rotas desta campanha, ativas e em BACKLOG, com a notificação (L-004)", async () => {
    rotas = rotasSemNotificacao(1);

    await AdminDisparoService.previaDisparo(77, [1, 1, 2], 10, agora);

    const chamada = queryMock.mock.calls.find(([sql]) => sql.includes("= ANY($2::int[])"))!;
    const s = normalizarSql(chamada[0]);
    expect(s).toContain(
      'JOIN "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" cp ON cp."ID_CAMPANHA_PROMOTOR" = rp."ID_CAMPANHA_PROMOTOR" LEFT JOIN "CAMPANHAS_OB"."NOTIFICACAO_VISITA" nv ON nv."ID_ROTA_PROMOTOR" = rp."ID_ROTA_PROMOTOR"'
    );
    expect(s).toContain(
      `WHERE rp."ID_ROTA_PROMOTOR" = ANY($2::int[]) AND cp."ID_CAMPANHA" = $1 AND rp."DELETED_AT" IS NULL AND cp."DELETED_AT" IS NULL AND COALESCE(rp."STATUS", 'BACKLOG') = 'BACKLOG'`
    );
    expect(chamada[1]).toEqual([77, [1, 2]]);
  });

  it("dispara: uma linha PENDENTE por rota não disparada, AVAILABLE_AT do plano e nunca mais que o teto por dia (CONV-21)", async () => {
    rotas = rotasSemNotificacao(25);

    const r = await AdminDisparoService.disparar(77, rotas.map((x) => x.ID_ROTA_PROMOTOR), 10, agora);

    expect(intoMock).toHaveBeenCalledWith(NotificacaoVisita);
    expect(orIgnoreMock).toHaveBeenCalled();
    const linhas = valuesMock.mock.calls[0][0] as any[];
    const plano = planejarDisparo(agora, 25, 10);
    expect(linhas).toHaveLength(25);
    expect(linhas[0]).toEqual({
      ID_ROTA_PROMOTOR: 1,
      CANAL: CanalNotificacao.WHATSAPP,
      STATUS: StatusNotificacaoVisita.PENDENTE,
      AVAILABLE_AT: plano.slots[0],
      ATTEMPTS: 0,
    });
    expect(linhas.map((l) => l.AVAILABLE_AT)).toEqual(plano.slots);
    // Primeiro envio na janela de amanhã, 9h de São Paulo.
    expect(linhas[0].AVAILABLE_AT.toISOString()).toBe("2026-09-29T12:00:00.000Z");
    const porDia = new Map<string, number>();
    for (const l of linhas) {
      const dia = new Date(l.AVAILABLE_AT.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
      porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
    }
    expect([...porDia.values()].every((q) => q <= 10)).toBe(true);
    expect([...porDia]).toEqual([
      ["2026-09-29", 10],
      ["2026-09-30", 10],
      ["2026-10-01", 5],
    ]);
    expect(r).toEqual({
      enfileiradas: 25,
      jaDisparadas: 0,
      porDia: [
        { data: "2026-09-29", quantidade: 10 },
        { data: "2026-09-30", quantidade: 10 },
        { data: "2026-10-01", quantidade: 5 },
      ],
      ultimoDia: "2026-10-01",
    });
  });

  it("rota que já tem notificação é ignorada e contada como já disparada (CONV-22)", async () => {
    rotas = [
      { ID_ROTA_PROMOTOR: 1, ID_NOTIFICACAO_VISITA: 700 },
      { ID_ROTA_PROMOTOR: 2, ID_NOTIFICACAO_VISITA: null },
      { ID_ROTA_PROMOTOR: 3, ID_NOTIFICACAO_VISITA: 701 },
    ];

    const r = await AdminDisparoService.disparar(77, [1, 2, 3], 10, agora);

    expect((valuesMock.mock.calls[0][0] as any[]).map((l) => l.ID_ROTA_PROMOTOR)).toEqual([2]);
    expect(r).toEqual({
      enfileiradas: 1,
      jaDisparadas: 2,
      porDia: [{ data: "2026-09-29", quantidade: 1 }],
      ultimoDia: "2026-09-29",
    });
  });

  it("todas já disparadas: nada é inserido", async () => {
    rotas = [{ ID_ROTA_PROMOTOR: 1, ID_NOTIFICACAO_VISITA: 700 }];

    const r = await AdminDisparoService.disparar(77, [1], 10, agora);

    expect(createQueryBuilderMock).not.toHaveBeenCalled();
    expect(r).toEqual({ enfileiradas: 0, jaDisparadas: 1, porDia: [], ultimoDia: null });
  });

  it("disparo concorrente: enfileiradas = linhas inseridas de fato; as perdidas contam como já disparadas (CONV-24)", async () => {
    rotas = rotasSemNotificacao(12);
    // O outro disparo levou as rotas 1 e 11: o ON CONFLICT DO NOTHING não as devolve.
    executeMock.mockImplementation(async () => ({
      raw: (valuesMock.mock.calls[0][0] as any[])
        .filter((l) => l.ID_ROTA_PROMOTOR !== 1 && l.ID_ROTA_PROMOTOR !== 11)
        .map((l) => ({ ID_NOTIFICACAO_VISITA: 1, ID_ROTA_PROMOTOR: l.ID_ROTA_PROMOTOR })),
    }));

    const r = await AdminDisparoService.disparar(77, rotas.map((x) => x.ID_ROTA_PROMOTOR), 10, agora);

    expect(r).toEqual({
      enfileiradas: 10,
      jaDisparadas: 2,
      porDia: [
        { data: "2026-09-29", quantidade: 9 },
        { data: "2026-09-30", quantidade: 1 },
      ],
      ultimoDia: "2026-09-30",
    });
  });

  it("último envio depois do END_TIME → 422 com o teto mínimo, sem escrever (CONV-21 AC5)", async () => {
    // Termina no fim de 30/09: dois dias de envio. 25 rotas pedem 13 por dia.
    campanha.END_TIME = new Date("2026-09-30T23:59:00-03:00");
    rotas = rotasSemNotificacao(25);

    const ids = rotas.map((x) => x.ID_ROTA_PROMOTOR);
    await expect(AdminDisparoService.disparar(77, ids, 10, agora)).rejects.toMatchObject({
      status: 422,
      extra: { tetoMinimo: 13 },
    });
    await expect(AdminDisparoService.previaDisparo(77, ids, 10, agora)).rejects.toMatchObject({
      status: 422,
      extra: { tetoMinimo: 13 },
    });
    expect(createQueryBuilderMock).not.toHaveBeenCalled();

    // Com o teto mínimo, cabe.
    await expect(AdminDisparoService.disparar(77, ids, 13, agora)).resolves.toMatchObject({ enfileiradas: 25 });
  });

  it("campanha sem END_TIME não tem limite de fim", async () => {
    campanha.END_TIME = null;
    rotas = rotasSemNotificacao(3);

    await expect(AdminDisparoService.disparar(77, [1, 2, 3], 1, agora)).resolves.toMatchObject({
      enfileiradas: 3,
      ultimoDia: "2026-10-01",
    });
  });

  it.each([
    ["vazias", []],
    ["ausentes", undefined],
    ["id inválido", [1, "2"]],
  ])("rotas %s → 400", async (_, ids) => {
    await expect(AdminDisparoService.disparar(77, ids, 10, agora)).rejects.toMatchObject({ status: 400 });
    expect(createQueryBuilderMock).not.toHaveBeenCalled();
  });

  it("campanha inexistente → 404", async () => {
    queryMock.mockResolvedValue([]);

    await expect(AdminDisparoService.disparar(999, [1], 10, agora)).rejects.toMatchObject({ status: 404 });
    expect(createQueryBuilderMock).not.toHaveBeenCalled();
  });
});
