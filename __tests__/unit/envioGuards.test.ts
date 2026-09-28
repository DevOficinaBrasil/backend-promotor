import { FindOperator } from "typeorm";
import {
  avaliarGuardas,
  confirmacaoRecente,
  convitePendenteDaOficina,
  enderecoRecente,
  MOTIVO_CONFIRMADO_RECENTE,
  MOTIVO_PENDENTE,
} from "../../service/envioGuards";
import { AppDataSourceSync } from "../../data-source";
import { OrigemAceite, StatusNotificacaoVisita } from "../../entities/NotificacaoVisita";

jest.mock("../../data-source");

// Spec AC26: "IF the route's Oficina has a DATA_ALTERACAO within the last 3
// months THEN the system SHALL set STATUS to DISPENSADO ... and SHALL NOT
// resolve a recipient or attempt a send."
// Spec edge case: "IF Oficina.DATA_ALTERACAO is NULL THEN the address SHALL be
// treated as stale (not fresh)."
describe("enderecoRecente", () => {
  const agora = new Date("2026-08-05T12:00:00.000Z");

  it("returns true for a workshop updated one month ago", () => {
    const oficina = { DATA_ALTERACAO: new Date("2026-07-05T12:00:00.000Z") };

    expect(enderecoRecente(oficina, agora)).toBe(true);
  });

  // Boundary choice: exactly 3 months old still counts as "within the last 3
  // months". The spec does not pin the boundary instant down (spec-precision
  // gap); inclusive is asserted here so the behaviour is pinned by a test.
  it("returns true at exactly the 3-month boundary", () => {
    const oficina = { DATA_ALTERACAO: new Date("2026-05-05T12:00:00.000Z") };

    expect(enderecoRecente(oficina, agora)).toBe(true);
  });

  it("returns false one millisecond before the 3-month boundary", () => {
    const oficina = { DATA_ALTERACAO: new Date("2026-05-05T11:59:59.999Z") };

    expect(enderecoRecente(oficina, agora)).toBe(false);
  });

  it("returns false for a workshop last updated six months ago", () => {
    const oficina = { DATA_ALTERACAO: new Date("2026-02-05T12:00:00.000Z") };

    expect(enderecoRecente(oficina, agora)).toBe(false);
  });

  it("treats a null DATA_ALTERACAO as stale", () => {
    expect(enderecoRecente({ DATA_ALTERACAO: null }, agora)).toBe(false);
  });

  it("treats an absent DATA_ALTERACAO as stale", () => {
    expect(enderecoRecente({}, agora)).toBe(false);
  });

  it("defaults the clock to the current time when agora is not provided", () => {
    const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);

    expect(enderecoRecente({ DATA_ALTERACAO: ontem })).toBe(true);
  });
});

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

function criarRepoFake(linhas: Linha[]) {
  return {
    linhas,
    update: jest.fn(async (where: Record<string, unknown>, patch: Partial<Linha>) => {
      const atingidas = linhas.filter((linha) => combina(linha, where));
      atingidas.forEach((linha) => Object.assign(linha, patch));
      return { affected: atingidas.length };
    }),
    findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return linhas.find((linha) => combina(linha, where)) ?? null;
    }),
    // An array `where` is TypeORM's OR: the row matches if it satisfies any of
    // the branches.
    find: jest.fn(
      async ({ where }: { where: Record<string, unknown> | Record<string, unknown>[] }) => {
        const ramos = Array.isArray(where) ? where : [where];
        return linhas.filter((linha) => ramos.some((ramo) => combina(linha, ramo)));
      }
    ),
  };
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

// Spec AC27-AC29: the per-recipient anti-spam guards. Scope is the Usuario,
// across every Oficina — "skip the send when that person already has a
// blocking notification, on any Oficina".
describe("avaliarGuardas", () => {
  const agora = new Date("2026-08-05T12:00:00.000Z");
  const RECEBEDOR = 7;
  const OUTRO_RECEBEDOR = 8;

  function montarRepo(linhas: Linha[]) {
    const repo = criarRepoFake(linhas);
    (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(repo);
    return repo;
  }

  // AC28
  it("blocks with the outstanding-notification reason for an unexpired ENVIADO row", async () => {
    montarRepo([
      linha({
        ID_NOTIFICACAO_VISITA: 1,
        STATUS: StatusNotificacaoVisita.ENVIADO,
        EXPIRA_EM: new Date("2026-08-07T12:00:00.000Z"),
      }),
    ]);

    const resultado = await avaliarGuardas(RECEBEDOR, agora);

    expect(resultado).toEqual({ bloqueado: true, motivo: MOTIVO_PENDENTE });
    expect(MOTIVO_PENDENTE).toBe("recipient has outstanding notification");
  });

  // AC28 "on any Oficina" — the guard is scoped per ID_USUARIO, not per Oficina.
  it("blocks on an outstanding notification belonging to a different route/Oficina of the same recipient", async () => {
    montarRepo([
      linha({
        ID_NOTIFICACAO_VISITA: 1,
        ID_ROTA_PROMOTOR: 501,
        ID_USUARIO: RECEBEDOR,
        STATUS: StatusNotificacaoVisita.ENVIADO,
        EXPIRA_EM: new Date("2026-08-07T12:00:00.000Z"),
      }),
    ]);

    const resultado = await avaliarGuardas(RECEBEDOR, agora);

    expect(resultado).toEqual({ bloqueado: true, motivo: MOTIVO_PENDENTE });
  });

  it("ignores another recipient's outstanding notification", async () => {
    const repo = montarRepo([
      linha({
        ID_NOTIFICACAO_VISITA: 1,
        ID_USUARIO: OUTRO_RECEBEDOR,
        STATUS: StatusNotificacaoVisita.ENVIADO,
        EXPIRA_EM: new Date("2026-08-07T12:00:00.000Z"),
      }),
    ]);

    const resultado = await avaliarGuardas(RECEBEDOR, agora);

    expect(resultado).toEqual({ bloqueado: false });
    expect(repo.linhas[0].STATUS).toBe(StatusNotificacaoVisita.ENVIADO);
  });

  // AC27: the persist happens, and the lapsed row must not block.
  it("persists EXPIRADO to a lapsed ENVIADO row and lets the new send through", async () => {
    const repo = montarRepo([
      linha({
        ID_NOTIFICACAO_VISITA: 1,
        STATUS: StatusNotificacaoVisita.ENVIADO,
        EXPIRA_EM: new Date("2026-08-04T12:00:00.000Z"),
      }),
    ]);

    const resultado = await avaliarGuardas(RECEBEDOR, agora);

    expect(repo.linhas[0].STATUS).toBe(StatusNotificacaoVisita.EXPIRADO);
    expect(resultado).toEqual({ bloqueado: false });
  });

  // AC27 says the persist happens FIRST, so an expired row is never counted as
  // outstanding by AC28. This assertion fails if the two steps are swapped.
  it("runs the EXPIRADO persist before the outstanding check", async () => {
    const repo = montarRepo([
      linha({
        ID_NOTIFICACAO_VISITA: 1,
        STATUS: StatusNotificacaoVisita.ENVIADO,
        EXPIRA_EM: new Date("2026-08-04T12:00:00.000Z"),
      }),
    ]);

    await avaliarGuardas(RECEBEDOR, agora);

    expect(repo.update).toHaveBeenCalledTimes(1);
    expect(repo.find).toHaveBeenCalled();
    expect(repo.update.mock.invocationCallOrder[0]).toBeLessThan(
      repo.find.mock.invocationCallOrder[0]
    );
  });

  it("does not expire another recipient's lapsed rows", async () => {
    const repo = montarRepo([
      linha({
        ID_NOTIFICACAO_VISITA: 1,
        ID_USUARIO: OUTRO_RECEBEDOR,
        STATUS: StatusNotificacaoVisita.ENVIADO,
        EXPIRA_EM: new Date("2026-08-04T12:00:00.000Z"),
      }),
    ]);

    await avaliarGuardas(RECEBEDOR, agora);

    expect(repo.linhas[0].STATUS).toBe(StatusNotificacaoVisita.ENVIADO);
  });

  // AC29
  it("blocks with the recent-confirmation reason for a CONFIRMADO row inside the 3-month window", async () => {
    montarRepo([
      linha({
        ID_NOTIFICACAO_VISITA: 1,
        STATUS: StatusNotificacaoVisita.CONFIRMADO,
        CONFIRMADO_EM: new Date("2026-07-01T12:00:00.000Z"),
      }),
    ]);

    const resultado = await avaliarGuardas(RECEBEDOR, agora);

    expect(resultado).toEqual({ bloqueado: true, motivo: MOTIVO_CONFIRMADO_RECENTE });
    expect(MOTIVO_CONFIRMADO_RECENTE).toBe("recipient confirmed recently");
  });

  it("does not block on a confirmation older than 3 months", async () => {
    montarRepo([
      linha({
        ID_NOTIFICACAO_VISITA: 1,
        STATUS: StatusNotificacaoVisita.CONFIRMADO,
        CONFIRMADO_EM: new Date("2026-01-10T12:00:00.000Z"),
      }),
    ]);

    const resultado = await avaliarGuardas(RECEBEDOR, agora);

    expect(resultado).toEqual({ bloqueado: false });
  });

  it.each([
    [StatusNotificacaoVisita.FALHOU],
    [StatusNotificacaoVisita.DISPENSADO],
    [StatusNotificacaoVisita.EXPIRADO],
  ])("does not block on a %s row", async (status) => {
    montarRepo([
      linha({
        ID_NOTIFICACAO_VISITA: 1,
        STATUS: status,
        EXPIRA_EM: new Date("2026-08-07T12:00:00.000Z"),
        CONFIRMADO_EM: new Date("2026-08-01T12:00:00.000Z"),
      }),
    ]);

    const resultado = await avaliarGuardas(RECEBEDOR, agora);

    expect(resultado).toEqual({ bloqueado: false });
  });

  it("does not block a recipient with no notifications at all", async () => {
    montarRepo([]);

    const resultado = await avaliarGuardas(RECEBEDOR, agora);

    expect(resultado).toEqual({ bloqueado: false });
  });

  it("reports the outstanding reason when the recipient is both outstanding and recently confirmed", async () => {
    montarRepo([
      linha({
        ID_NOTIFICACAO_VISITA: 1,
        STATUS: StatusNotificacaoVisita.CONFIRMADO,
        CONFIRMADO_EM: new Date("2026-07-01T12:00:00.000Z"),
      }),
      linha({
        ID_NOTIFICACAO_VISITA: 2,
        STATUS: StatusNotificacaoVisita.ENVIADO,
        EXPIRA_EM: new Date("2026-08-07T12:00:00.000Z"),
      }),
    ]);

    const resultado = await avaliarGuardas(RECEBEDOR, agora);

    expect(resultado).toEqual({ bloqueado: true, motivo: MOTIVO_PENDENTE });
  });

  it("defaults the clock to the current time when agora is not provided", async () => {
    montarRepo([
      linha({
        ID_NOTIFICACAO_VISITA: 1,
        STATUS: StatusNotificacaoVisita.ENVIADO,
        EXPIRA_EM: new Date(Date.now() + 60 * 60 * 1000),
      }),
    ]);

    const resultado = await avaliarGuardas(RECEBEDOR);

    expect(resultado).toEqual({ bloqueado: true, motivo: MOTIVO_PENDENTE });
  });
});

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
