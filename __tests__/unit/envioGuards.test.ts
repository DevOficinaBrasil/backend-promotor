import { FindOperator } from "typeorm";
import { confirmacaoRecente, convitePendenteDaOficina } from "../../service/envioGuards";
import { AppDataSourceSync } from "../../data-source";
import { OrigemAceite, StatusNotificacaoVisita } from "../../entities/NotificacaoVisita";

jest.mock("../../data-source");

type Linha = {
  ID_NOTIFICACAO_VISITA: number;
  ID_ROTA_PROMOTOR: number;
  ID_USUARIO: number;
  STATUS: StatusNotificacaoVisita;
  EXPIRA_EM: Date | null;
  CONFIRMADO_EM: Date | null;
};

/**
 * Evaluates a TypeORM `where` object against one row, honouring the find
 * operators this guard uses. Lets the tests below assert on resulting row
 * state rather than on the shape of the queries that produced it.
 */
function combina(linha: Linha, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([campo, criterio]) => {
    const valor = (linha as unknown as Record<string, unknown>)[campo];

    if (criterio instanceof FindOperator) {
      const alvo = criterio.value as Date;
      if (!(valor instanceof Date)) {
        return false;
      }
      if (criterio.type === "lessThan") {
        return valor.getTime() < alvo.getTime();
      }
      if (criterio.type === "moreThanOrEqual") {
        return valor.getTime() >= alvo.getTime();
      }
      throw new Error(`Operador não suportado no fake: ${criterio.type}`);
    }

    return valor === criterio;
  });
}

function linha(dados: Partial<Linha> & { ID_NOTIFICACAO_VISITA: number }): Linha {
  return {
    ID_ROTA_PROMOTOR: dados.ID_NOTIFICACAO_VISITA * 10,
    ID_USUARIO: 7,
    STATUS: StatusNotificacaoVisita.ENVIADO,
    EXPIRA_EM: null,
    CONFIRMADO_EM: null,
    ...dados,
  };
}

// CONV-26: "a mesma oficina já tem um convite ENVIADO não expirado" → a
// notificação aguarda aquele convite. A guarda devolve o id de referência.
describe("convitePendenteDaOficina", () => {
  const agora = new Date("2026-09-28T12:00:00.000Z");
  const OFICINA = 300;
  const OUTRA_OFICINA = 301;
  const PROPRIA = 90;

  type LinhaOficina = {
    ID_NOTIFICACAO_VISITA: number;
    ID_OFICINA: number;
    STATUS: StatusNotificacaoVisita;
    EXPIRA_EM: Date | null;
  };

  const normalizarSql = (sql: string) => sql.replace(/\s+/g, " ").trim();

  /**
   * Fake do query runner que aplica a semântica das duas statements às linhas
   * em memória, lendo só os parâmetros. A forma da SQL é afirmada à parte
   * (L-004), então o fake e a SQL não divergem sem um teste quebrar.
   */
  function montarBanco(linhas: LinhaOficina[]) {
    const query = AppDataSourceSync.query as jest.Mock;
    query.mockReset();
    query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (normalizarSql(sql).startsWith("UPDATE")) {
        const [idOficina, instante] = params as [number, Date];
        linhas
          .filter(
            (l) =>
              l.ID_OFICINA === idOficina &&
              l.STATUS === StatusNotificacaoVisita.ENVIADO &&
              l.EXPIRA_EM !== null &&
              l.EXPIRA_EM.getTime() < instante.getTime()
          )
          .forEach((l) => (l.STATUS = StatusNotificacaoVisita.EXPIRADO));
        return [];
      }
      const [idOficina, idPropria, instante] = params as [number, number, Date];
      return linhas
        .filter(
          (l) =>
            l.ID_OFICINA === idOficina &&
            l.ID_NOTIFICACAO_VISITA !== idPropria &&
            l.STATUS === StatusNotificacaoVisita.ENVIADO &&
            l.EXPIRA_EM !== null &&
            l.EXPIRA_EM.getTime() >= instante.getTime()
        )
        .sort((a, b) => a.ID_NOTIFICACAO_VISITA - b.ID_NOTIFICACAO_VISITA)
        .slice(0, 1)
        .map((l) => ({ ID_NOTIFICACAO_VISITA: String(l.ID_NOTIFICACAO_VISITA) }));
    });
    return { linhas, query };
  }

  const aberta = new Date("2026-09-30T12:00:00.000Z");
  const vencida = new Date("2026-09-27T12:00:00.000Z");

  it("devolve o id do ENVIADO não expirado de outra rota da mesma oficina", async () => {
    montarBanco([
      { ID_NOTIFICACAO_VISITA: 11, ID_OFICINA: OFICINA, STATUS: StatusNotificacaoVisita.ENVIADO, EXPIRA_EM: aberta },
    ]);

    await expect(convitePendenteDaOficina(OFICINA, PROPRIA, agora)).resolves.toBe(11);
  });

  it("ignora a própria notificação", async () => {
    montarBanco([
      { ID_NOTIFICACAO_VISITA: PROPRIA, ID_OFICINA: OFICINA, STATUS: StatusNotificacaoVisita.ENVIADO, EXPIRA_EM: aberta },
    ]);

    await expect(convitePendenteDaOficina(OFICINA, PROPRIA, agora)).resolves.toBeNull();
  });

  it("ignora convite aberto de outra oficina", async () => {
    montarBanco([
      { ID_NOTIFICACAO_VISITA: 11, ID_OFICINA: OUTRA_OFICINA, STATUS: StatusNotificacaoVisita.ENVIADO, EXPIRA_EM: aberta },
    ]);

    await expect(convitePendenteDaOficina(OFICINA, PROPRIA, agora)).resolves.toBeNull();
  });

  it("grava EXPIRADO no ENVIADO vencido da oficina e não o usa como referência", async () => {
    const { linhas } = montarBanco([
      { ID_NOTIFICACAO_VISITA: 11, ID_OFICINA: OFICINA, STATUS: StatusNotificacaoVisita.ENVIADO, EXPIRA_EM: vencida },
      { ID_NOTIFICACAO_VISITA: 12, ID_OFICINA: OUTRA_OFICINA, STATUS: StatusNotificacaoVisita.ENVIADO, EXPIRA_EM: vencida },
    ]);

    const resultado = await convitePendenteDaOficina(OFICINA, PROPRIA, agora);

    expect(resultado).toBeNull();
    expect(linhas[0].STATUS).toBe(StatusNotificacaoVisita.EXPIRADO);
    expect(linhas[1].STATUS).toBe(StatusNotificacaoVisita.ENVIADO);
  });

  it.each([
    [StatusNotificacaoVisita.PENDENTE],
    [StatusNotificacaoVisita.CONFIRMADO],
    [StatusNotificacaoVisita.RECUSADO],
    [StatusNotificacaoVisita.AGUARDANDO],
    [StatusNotificacaoVisita.FALHOU],
  ])("não conta notificação %s como convite aberto", async (status) => {
    montarBanco([{ ID_NOTIFICACAO_VISITA: 11, ID_OFICINA: OFICINA, STATUS: status, EXPIRA_EM: aberta }]);

    await expect(convitePendenteDaOficina(OFICINA, PROPRIA, agora)).resolves.toBeNull();
  });

  // L-004: a oficina vem do join com ROTA_PROMOTOR; o fake acima só vale se a
  // SQL tiver exatamente esses predicados.
  it("expira antes de buscar, com a oficina vinda do join com ROTA_PROMOTOR", async () => {
    const { query } = montarBanco([]);

    await convitePendenteDaOficina(OFICINA, PROPRIA, agora);

    expect(query).toHaveBeenCalledTimes(2);
    const [sqlUpdate, paramsUpdate] = query.mock.calls[0];
    const [sqlSelect, paramsSelect] = query.mock.calls[1];
    const update = normalizarSql(sqlUpdate);
    const select = normalizarSql(sqlSelect);

    expect(update).toContain(`UPDATE "CAMPANHAS_OB"."NOTIFICACAO_VISITA" nv SET "STATUS" = 'EXPIRADO'`);
    expect(update).toContain(`FROM "CAMPANHAS_OB"."ROTA_PROMOTOR" rp`);
    expect(update).toContain(`rp."ID_ROTA_PROMOTOR" = nv."ID_ROTA_PROMOTOR"`);
    expect(update).toContain(`rp."ID_OFICINA" = $1`);
    expect(update).toContain(`nv."STATUS" = 'ENVIADO'`);
    expect(update).toContain(`nv."EXPIRA_EM" < $2`);
    expect(paramsUpdate).toEqual([OFICINA, agora]);

    expect(select).toContain(
      `FROM "CAMPANHAS_OB"."NOTIFICACAO_VISITA" nv JOIN "CAMPANHAS_OB"."ROTA_PROMOTOR" rp ON rp."ID_ROTA_PROMOTOR" = nv."ID_ROTA_PROMOTOR"`
    );
    expect(select).toContain(`rp."ID_OFICINA" = $1`);
    expect(select).toContain(`nv."ID_NOTIFICACAO_VISITA" <> $2`);
    expect(select).toContain(`nv."STATUS" = 'ENVIADO'`);
    expect(select).toContain(`nv."EXPIRA_EM" >= $3`);
    expect(paramsSelect).toEqual([OFICINA, PROPRIA, agora]);
  });
});

// CONV-30: "o destinatário (ID_USUARIO) confirmou algum convite nos últimos 3
// meses" → aceita por confirmação recente. Só conta o aceite do próprio
// reparador (design: evita a cadeia infinita de aceites automáticos).
describe("confirmacaoRecente", () => {
  const agora = new Date("2026-09-28T12:00:00.000Z");
  const RECEBEDOR = 7;

  type LinhaConfirmacao = Linha & { ORIGEM_ACEITE: OrigemAceite | null };

  function montarRepo(linhas: LinhaConfirmacao[]) {
    const repo = {
      findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const achadas = linhas.filter((l) => combina(l, where));
        achadas.sort(
          (a, b) => (b.CONFIRMADO_EM?.getTime() ?? 0) - (a.CONFIRMADO_EM?.getTime() ?? 0)
        );
        return achadas[0] ?? null;
      }),
    };
    (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(repo);
    return repo;
  }

  const confirmada = (
    dados: Partial<LinhaConfirmacao> & { ID_NOTIFICACAO_VISITA: number }
  ): LinhaConfirmacao => ({
    ...linha({ ...dados, STATUS: StatusNotificacaoVisita.CONFIRMADO }),
    ORIGEM_ACEITE: OrigemAceite.REPARADOR,
    ...dados,
  });

  it("devolve o id da confirmação do reparador dentro de 3 meses", async () => {
    montarRepo([confirmada({ ID_NOTIFICACAO_VISITA: 21, CONFIRMADO_EM: new Date("2026-08-01T12:00:00.000Z") })]);

    await expect(confirmacaoRecente(RECEBEDOR, agora)).resolves.toBe(21);
  });

  it("devolve a confirmação mais recente quando há mais de uma", async () => {
    montarRepo([
      confirmada({ ID_NOTIFICACAO_VISITA: 21, CONFIRMADO_EM: new Date("2026-08-01T12:00:00.000Z") }),
      confirmada({ ID_NOTIFICACAO_VISITA: 22, CONFIRMADO_EM: new Date("2026-09-01T12:00:00.000Z") }),
    ]);

    await expect(confirmacaoRecente(RECEBEDOR, agora)).resolves.toBe(22);
  });

  it("conta a confirmação exatamente no limite de 3 meses", async () => {
    montarRepo([confirmada({ ID_NOTIFICACAO_VISITA: 21, CONFIRMADO_EM: new Date("2026-06-28T12:00:00.000Z") })]);

    await expect(confirmacaoRecente(RECEBEDOR, agora)).resolves.toBe(21);
  });

  it("não conta confirmação com mais de 3 meses", async () => {
    montarRepo([confirmada({ ID_NOTIFICACAO_VISITA: 21, CONFIRMADO_EM: new Date("2026-06-28T11:59:59.999Z") })]);

    await expect(confirmacaoRecente(RECEBEDOR, agora)).resolves.toBeNull();
  });

  it.each([
    [OrigemAceite.CONFIRMACAO_RECENTE],
    [OrigemAceite.CONVITE_VINCULADO],
    [OrigemAceite.IMPORTADA],
  ])("não conta aceite com origem %s", async (origem) => {
    montarRepo([
      confirmada({
        ID_NOTIFICACAO_VISITA: 21,
        CONFIRMADO_EM: new Date("2026-09-01T12:00:00.000Z"),
        ORIGEM_ACEITE: origem,
      }),
    ]);

    await expect(confirmacaoRecente(RECEBEDOR, agora)).resolves.toBeNull();
  });

  it("não conta confirmação de outro destinatário", async () => {
    montarRepo([
      confirmada({ ID_NOTIFICACAO_VISITA: 21, ID_USUARIO: 8, CONFIRMADO_EM: new Date("2026-09-01T12:00:00.000Z") }),
    ]);

    await expect(confirmacaoRecente(RECEBEDOR, agora)).resolves.toBeNull();
  });

  it("filtra por usuário, CONFIRMADO, origem REPARADOR e janela de 3 meses", async () => {
    const repo = montarRepo([]);

    await confirmacaoRecente(RECEBEDOR, agora);

    const { where, order } = repo.findOne.mock.calls[0][0] as unknown as {
      where: Record<string, unknown>;
      order: Record<string, unknown>;
    };
    expect(where.ID_USUARIO).toBe(RECEBEDOR);
    expect(where.STATUS).toBe(StatusNotificacaoVisita.CONFIRMADO);
    expect(where.ORIGEM_ACEITE).toBe(OrigemAceite.REPARADOR);
    const janela = where.CONFIRMADO_EM as FindOperator<Date>;
    expect(janela.type).toBe("moreThanOrEqual");
    expect(janela.value).toEqual(new Date("2026-06-28T12:00:00.000Z"));
    expect(order).toEqual({ CONFIRMADO_EM: "DESC" });
  });
});
