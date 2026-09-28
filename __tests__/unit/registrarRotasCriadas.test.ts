import { AppDataSourceSync } from "../../data-source";
import NotificacaoVisita, {
  CanalNotificacao,
  OrigemAceite,
  StatusNotificacaoVisita,
} from "../../entities/NotificacaoVisita";
import RotaPromotor from "../../entities/RotaPromotor";
import NotificacaoVisitaService from "../../service/notificacaoVisitaService";

jest.mock("../../data-source");

// CONV-45: rota de oficina importada para o slug da campanha nasce aceita
// (CONFIRMADO / IMPORTADA), sem mensagem, em todos os fluxos.
// CONV-15: rota criada pela tela de admin (agendar:false) não enfileira nada.
describe("NotificacaoVisitaService.registrarRotasCriadas", () => {
  const agora = new Date("2026-09-28T12:00:00.000Z");
  const rotas = [
    { ID_ROTA_PROMOTOR: 1, ID_OFICINA: 10 },
    { ID_ROTA_PROMOTOR: 2, ID_OFICINA: 20 },
    { ID_ROTA_PROMOTOR: 3, ID_OFICINA: 30 },
  ] as RotaPromotor[];

  let queryMock: jest.Mock;
  let valuesMock: jest.Mock;
  let orIgnoreMock: jest.Mock;
  let agendarLoteSpy: jest.SpyInstance;

  const normalizarSql = (sql: string) => sql.replace(/\s+/g, " ").trim();

  beforeEach(() => {
    queryMock = AppDataSourceSync.query as jest.Mock;
    queryMock.mockReset();
    queryMock.mockResolvedValue([]);

    const executeMock = jest.fn(async () => ({}));
    orIgnoreMock = jest.fn(() => ({ execute: executeMock }));
    valuesMock = jest.fn(() => ({ orIgnore: orIgnoreMock }));
    const intoMock = jest.fn(() => ({ values: valuesMock }));
    const qb = { insert: jest.fn(() => ({ into: intoMock })) };
    (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue({
      createQueryBuilder: jest.fn(() => qb),
    });

    agendarLoteSpy = jest
      .spyOn(NotificacaoVisitaService, "agendarVisitasEmLote")
      .mockResolvedValue(undefined);
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("insere CONFIRMADO/IMPORTADA sem token para a rota importada e não a agenda", async () => {
    queryMock.mockResolvedValue([{ ID_ROTA_PROMOTOR: "2" }]);

    await NotificacaoVisitaService.registrarRotasCriadas(rotas, { agendar: true }, agora);

    expect(valuesMock).toHaveBeenCalledTimes(1);
    const linhas = valuesMock.mock.calls[0][0] as Partial<NotificacaoVisita>[];
    expect(linhas).toEqual([
      {
        ID_ROTA_PROMOTOR: 2,
        CANAL: CanalNotificacao.WHATSAPP,
        STATUS: StatusNotificacaoVisita.CONFIRMADO,
        ORIGEM_ACEITE: OrigemAceite.IMPORTADA,
        CONFIRMADO_EM: agora,
        ATTEMPTS: 0,
      },
    ]);
    expect(linhas[0]).not.toHaveProperty("TOKEN_HASH");
    expect(linhas[0]).not.toHaveProperty("AVAILABLE_AT");
    expect(orIgnoreMock).toHaveBeenCalled();

    const agendadas = agendarLoteSpy.mock.calls[0][0] as RotaPromotor[];
    expect(agendadas.map((r) => r.ID_ROTA_PROMOTOR)).toEqual([1, 3]);
  });

  it("com agendar:true e nenhuma importada, agenda todas as rotas", async () => {
    await NotificacaoVisitaService.registrarRotasCriadas(rotas, { agendar: true }, agora);

    expect(valuesMock).not.toHaveBeenCalled();
    expect(agendarLoteSpy).toHaveBeenCalledWith(rotas, agora);
  });

  it("com agendar:false não enfileira nada", async () => {
    await NotificacaoVisitaService.registrarRotasCriadas(rotas, { agendar: false }, agora);

    expect(agendarLoteSpy).not.toHaveBeenCalled();
    expect(valuesMock).not.toHaveBeenCalled();
  });

  it("com agendar:false a importada ainda nasce aceita", async () => {
    queryMock.mockResolvedValue([{ ID_ROTA_PROMOTOR: 1 }]);

    await NotificacaoVisitaService.registrarRotasCriadas(rotas, { agendar: false }, agora);

    expect(agendarLoteSpy).not.toHaveBeenCalled();
    const linhas = valuesMock.mock.calls[0][0] as Partial<NotificacaoVisita>[];
    expect(linhas.map((l) => [l.ID_ROTA_PROMOTOR, l.STATUS, l.ORIGEM_ACEITE])).toEqual([
      [1, StatusNotificacaoVisita.CONFIRMADO, OrigemAceite.IMPORTADA],
    ]);
  });

  // L-004: a detecção é a SQL; o fake acima só vale se o join estiver certo.
  it("detecta a importada por ID_OFICINA + EMPRESA_SLUG da campanha, só linha ativa", async () => {
    await NotificacaoVisitaService.registrarRotasCriadas(rotas, { agendar: true }, agora);

    const [sql, params] = queryMock.mock.calls[0];
    const s = normalizarSql(sql);
    expect(s).toContain(`FROM "CAMPANHAS_OB"."ROTA_PROMOTOR" rp`);
    expect(s).toContain(
      `JOIN "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" cp ON cp."ID_CAMPANHA_PROMOTOR" = rp."ID_CAMPANHA_PROMOTOR"`
    );
    expect(s).toContain(`JOIN "CAMPANHAS_OB"."CAMPANHA" c ON c."ID_CAMPANHA" = cp."ID_CAMPANHA"`);
    expect(s).toContain(
      `JOIN "CAMPANHAS_OB"."OFICINA_IMPORTADA" oi ON oi."ID_OFICINA" = rp."ID_OFICINA" AND oi."EMPRESA_SLUG" = c."EMPRESA_SLUG" AND oi."DELETED_AT" IS NULL`
    );
    expect(s).toContain(`WHERE rp."ID_ROTA_PROMOTOR" = ANY($1)`);
    expect(params).toEqual([[1, 2, 3]]);
  });

  it("sem rotas não consulta nem agenda", async () => {
    await NotificacaoVisitaService.registrarRotasCriadas([], { agendar: true }, agora);

    expect(queryMock).not.toHaveBeenCalled();
    expect(agendarLoteSpy).not.toHaveBeenCalled();
  });

  it("não lança se a detecção falhar, e agenda como hoje", async () => {
    queryMock.mockRejectedValue(new Error("db down"));

    await expect(
      NotificacaoVisitaService.registrarRotasCriadas(rotas, { agendar: true }, agora)
    ).resolves.toBeUndefined();
    expect(agendarLoteSpy).toHaveBeenCalledWith(rotas, agora);
  });
});
