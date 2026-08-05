import { FindOperator } from "typeorm";
import {
  avaliarGuardas,
  enderecoRecente,
  MOTIVO_CONFIRMADO_RECENTE,
  MOTIVO_PENDENTE,
} from "../../service/envioGuards";
import { AppDataSourceSync } from "../../data-source";
import { StatusNotificacaoVisita } from "../../entities/NotificacaoVisita";

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
    expect(repo.findOne).toHaveBeenCalled();
    expect(repo.update.mock.invocationCallOrder[0]).toBeLessThan(
      repo.findOne.mock.invocationCallOrder[0]
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
