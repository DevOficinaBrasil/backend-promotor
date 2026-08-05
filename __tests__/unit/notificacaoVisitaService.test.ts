import NotificacaoVisitaService, {
  MOTIVO_ENDERECO_RECENTE,
  MOTIVO_SEM_TELEFONE,
  MOTIVO_SEM_USUARIO,
  MOTIVO_TELEFONE_INVALIDO,
} from "../../service/notificacaoVisitaService";
import { AppDataSourceSync } from "../../data-source";
import NotificacaoVisita, {
  CanalNotificacao,
  StatusNotificacaoVisita,
} from "../../entities/NotificacaoVisita";
import Oficina from "../../entities/Oficina";
import Usuario from "../../entities/Usuario";
import RotaPromotor from "../../entities/RotaPromotor";
import { avaliarGuardas, enderecoRecente } from "../../service/envioGuards";
import { getChannel } from "../../channels/channelRegistry";
import { hashToken } from "../../utils/visitaToken";

jest.mock("../../data-source");
jest.mock("../../service/envioGuards");
jest.mock("../../channels/channelRegistry");

const enderecoRecenteMock = enderecoRecente as jest.MockedFunction<typeof enderecoRecente>;
const avaliarGuardasMock = avaliarGuardas as jest.MockedFunction<typeof avaliarGuardas>;
const getChannelMock = getChannel as jest.MockedFunction<typeof getChannel>;

const ID_ROTA = 42;
const ID_OFICINA = 900;
const ID_USUARIO = 7;

describe("NotificacaoVisitaService.notificarVisita", () => {
  let notifRepo: {
    create: jest.Mock;
    save: jest.Mock;
  };
  // Snapshot of the row as each save saw it — the service mutates one entity
  // instance across the flow, so mock.calls alone only shows the final state.
  let persistidos: NotificacaoVisita[];
  let oficinaRepo: { findOne: jest.Mock };
  let usuarioRepo: { find: jest.Mock };
  let sendMock: jest.Mock;

  const rota = { ID_ROTA_PROMOTOR: ID_ROTA, ID_OFICINA } as RotaPromotor;

  const oficinaPadrao = {
    ID_OFICINA,
    NOME_FANTASIA: "Auto Center Silva",
    DATA_ALTERACAO: new Date("2020-01-01T00:00:00.000Z"),
  } as Oficina;

  const usuarioPadrao = {
    ID_USUARIO,
    ID_OFICINA,
    CELULAR: "(11) 99999-8888",
  } as Usuario;

  beforeEach(() => {
    persistidos = [];
    notifRepo = {
      create: jest.fn((dados) => new NotificacaoVisita(dados)),
      save: jest.fn(async (linha: NotificacaoVisita) => {
        if (linha.ID_NOTIFICACAO_VISITA === undefined) {
          linha.ID_NOTIFICACAO_VISITA = 1;
        }
        persistidos.push(new NotificacaoVisita({ ...linha }));
        return linha;
      }),
    };
    oficinaRepo = { findOne: jest.fn(async () => oficinaPadrao) };
    usuarioRepo = { find: jest.fn(async () => [usuarioPadrao]) };

    (AppDataSourceSync.getRepository as jest.Mock).mockImplementation((entidade: unknown) => {
      if (entidade === NotificacaoVisita) return notifRepo;
      if (entidade === Oficina) return oficinaRepo;
      if (entidade === Usuario) return usuarioRepo;
      throw new Error("repositório inesperado no teste");
    });

    enderecoRecenteMock.mockReturnValue(false);
    avaliarGuardasMock.mockResolvedValue({ bloqueado: false });

    sendMock = jest.fn(async () => ({
      success: true as const,
      messageId: "msg-1",
      providerMessageId: "wamid.1",
    }));
    getChannelMock.mockReturnValue({ canal: CanalNotificacao.WHATSAPP, send: sendMock });

    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // AC1: "WHEN a new RotaPromotor record is created THEN the system SHALL
  // create exactly one NotificacaoVisita record in STATUS PENDENTE linked to
  // that ID_ROTA_PROMOTOR."
  it("creates exactly one row in PENDENTE linked to the route", async () => {
    await NotificacaoVisitaService.notificarVisita(rota);

    expect(notifRepo.create).toHaveBeenCalledTimes(1);
    expect(notifRepo.create).toHaveBeenCalledWith({
      ID_ROTA_PROMOTOR: ID_ROTA,
      CANAL: CanalNotificacao.WHATSAPP,
      STATUS: StatusNotificacaoVisita.PENDENTE,
    });
    expect(persistidos[0].STATUS).toBe(StatusNotificacaoVisita.PENDENTE);
    expect(persistidos[0].ID_ROTA_PROMOTOR).toBe(ID_ROTA);
  });

  // AC26
  it("marks DISPENSADO with address recently updated and never resolves a recipient", async () => {
    enderecoRecenteMock.mockReturnValue(true);

    const resultado = await NotificacaoVisitaService.notificarVisita(rota);

    expect(resultado.STATUS).toBe(StatusNotificacaoVisita.DISPENSADO);
    expect(resultado.ERRO_ENVIO).toBe("address recently updated");
    expect(MOTIVO_ENDERECO_RECENTE).toBe("address recently updated");
    expect(usuarioRepo.find).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  // Spec edge case: "IF the route's Oficina has zero linked Usuario records
  // THEN ... FALHOU with ERRO_ENVIO = 'no usuario linked to oficina'."
  it("marks FALHOU with no usuario linked to oficina when the workshop has no users", async () => {
    usuarioRepo.find.mockResolvedValue([]);

    const resultado = await NotificacaoVisitaService.notificarVisita(rota);

    expect(resultado.STATUS).toBe(StatusNotificacaoVisita.FALHOU);
    expect(resultado.ERRO_ENVIO).toBe("no usuario linked to oficina");
    expect(MOTIVO_SEM_USUARIO).toBe("no usuario linked to oficina");
    expect(sendMock).not.toHaveBeenCalled();
  });

  // AC3
  it("marks FALHOU with no recipient with phone when no user has a CELULAR", async () => {
    usuarioRepo.find.mockResolvedValue([
      { ID_USUARIO: 3, CELULAR: "" },
      { ID_USUARIO: 4, CELULAR: null },
      { ID_USUARIO: 5, CELULAR: "   " },
    ]);

    const resultado = await NotificacaoVisitaService.notificarVisita(rota);

    expect(resultado.STATUS).toBe(StatusNotificacaoVisita.FALHOU);
    expect(resultado.ERRO_ENVIO).toBe("no recipient with phone");
    expect(MOTIVO_SEM_TELEFONE).toBe("no recipient with phone");
    expect(sendMock).not.toHaveBeenCalled();
  });

  // AC2: ordering is delegated to the database, so the query's order clause is
  // the observable contract.
  it("resolves the recipient ordered by DATA_ALTERACAO DESC nulls last then ID_USUARIO ASC", async () => {
    await NotificacaoVisitaService.notificarVisita(rota);

    expect(usuarioRepo.find).toHaveBeenCalledWith({
      where: { ID_OFICINA },
      order: {
        DATA_ALTERACAO: { direction: "DESC", nulls: "LAST" },
        ID_USUARIO: "ASC",
      },
    });
  });

  // AC2: "SHALL take the first result" — of those that qualify.
  it("takes the first ordered user that actually has a phone", async () => {
    usuarioRepo.find.mockResolvedValue([
      { ID_USUARIO: 3, CELULAR: null },
      { ID_USUARIO: 4, CELULAR: "11988887777" },
      { ID_USUARIO: 5, CELULAR: "11977776666" },
    ]);

    const resultado = await NotificacaoVisitaService.notificarVisita(rota);

    expect(resultado.ID_USUARIO).toBe(4);
    expect(resultado.TELEFONE_NORMALIZADO).toBe("5511988887777");
    expect(avaliarGuardasMock).toHaveBeenCalledWith(4);
  });

  // AC28 / AC29 via the guard
  it("marks DISPENSADO with the guard reason when the anti-spam guard blocks", async () => {
    avaliarGuardasMock.mockResolvedValue({
      bloqueado: true,
      motivo: "recipient has outstanding notification",
    });

    const resultado = await NotificacaoVisitaService.notificarVisita(rota);

    expect(resultado.STATUS).toBe(StatusNotificacaoVisita.DISPENSADO);
    expect(resultado.ERRO_ENVIO).toBe("recipient has outstanding notification");
    expect(resultado.ID_USUARIO).toBe(ID_USUARIO);
    expect(sendMock).not.toHaveBeenCalled();
  });

  // AC4 + edge case: normalization fails closed, no dispatch.
  it("marks FALHOU with invalid phone and does not dispatch when the number cannot be normalized", async () => {
    usuarioRepo.find.mockResolvedValue([{ ID_USUARIO: ID_USUARIO, CELULAR: "(00) 1234" }]);

    const resultado = await NotificacaoVisitaService.notificarVisita(rota);

    expect(resultado.STATUS).toBe(StatusNotificacaoVisita.FALHOU);
    expect(resultado.ERRO_ENVIO).toBe("invalid phone");
    expect(MOTIVO_TELEFONE_INVALIDO).toBe("invalid phone");
    expect(sendMock).not.toHaveBeenCalled();
    expect(resultado.TOKEN_HASH ?? null).toBeNull();
  });

  // AC5: token issued before any dispatch attempt, EXPIRA_EM = issuance + 168h.
  it("issues the link token before dispatch with a 168 hour expiry", async () => {
    jest.useFakeTimers({ now: new Date("2026-08-05T12:00:00.000Z") });
    try {
      const resultado = await NotificacaoVisitaService.notificarVisita(rota);

      expect(resultado.TOKEN_HASH).toMatch(/^[0-9a-f]{64}$/);
      expect(resultado.EXPIRA_EM).toEqual(new Date("2026-08-12T12:00:00.000Z"));

      // The persist that carried the token must precede the dispatch call.
      const indiceComToken = persistidos.findIndex((linha) => linha.TOKEN_HASH != null);
      expect(indiceComToken).toBeGreaterThanOrEqual(0);
      expect(sendMock.mock.invocationCallOrder[0]).toBeGreaterThan(
        notifRepo.save.mock.invocationCallOrder[indiceComToken]
      );
    } finally {
      jest.useRealTimers();
    }
  });

  // AC6: the confirmation URL carried in the message is derived from the raw
  // token whose hash is what gets persisted.
  it("dispatches the workshop name and a confirmation URL built from the issued token", async () => {
    process.env.VISITA_CONFIRMACAO_BASE_URL = "https://app.example.com";
    try {
      const resultado = await NotificacaoVisitaService.notificarVisita(rota);

      expect(sendMock).toHaveBeenCalledTimes(1);
      const enviado = sendMock.mock.calls[0][0];
      expect(enviado.toPhone).toBe("5511999998888");
      expect(enviado.variables[0]).toBe("Auto Center Silva");
      expect(enviado.variables[1]).toMatch(
        /^https:\/\/app\.example\.com\/visita\/confirmacao\?token=/
      );

      const rawToken = enviado.variables[1].split("token=")[1];
      expect(hashToken(rawToken)).toBe(resultado.TOKEN_HASH);
    } finally {
      delete process.env.VISITA_CONFIRMACAO_BASE_URL;
    }
  });

  // AC7
  it("marks ENVIADO with the provider identifiers on a successful dispatch", async () => {
    const resultado = await NotificacaoVisitaService.notificarVisita(rota);

    expect(resultado.STATUS).toBe(StatusNotificacaoVisita.ENVIADO);
    expect(resultado.MESSAGE_ID).toBe("msg-1");
    expect(resultado.PROVIDER_MESSAGE_ID).toBe("wamid.1");
    expect(resultado.ENVIADO_EM).toBeInstanceOf(Date);
  });

  // AC8: the reason and the provider's code are both recorded.
  it("marks FALHOU recording the reason and provider code on a failed dispatch", async () => {
    sendMock.mockResolvedValue({
      success: false,
      reason: "channel not configured",
      providerCode: "TEMPLATE_NOT_FOUND",
    });

    const resultado = await NotificacaoVisitaService.notificarVisita(rota);

    expect(resultado.STATUS).toBe(StatusNotificacaoVisita.FALHOU);
    expect(resultado.ERRO_ENVIO).toBe("channel not configured: TEMPLATE_NOT_FOUND");
  });

  it("records the reason alone when the channel reports no provider code", async () => {
    sendMock.mockResolvedValue({ success: false, reason: "network error", providerCode: null });

    const resultado = await NotificacaoVisitaService.notificarVisita(rota);

    expect(resultado.STATUS).toBe(StatusNotificacaoVisita.FALHOU);
    expect(resultado.ERRO_ENVIO).toBe("network error");
  });

  // AC11: "the confirmation token from step 5 still exists and remains valid
  // even though the message was never delivered".
  it("keeps the issued token and expiry after a failed dispatch", async () => {
    sendMock.mockResolvedValue({
      success: false,
      reason: "channel not configured",
      providerCode: null,
    });

    const resultado = await NotificacaoVisitaService.notificarVisita(rota);

    expect(resultado.STATUS).toBe(StatusNotificacaoVisita.FALHOU);
    expect(resultado.TOKEN_HASH).toMatch(/^[0-9a-f]{64}$/);
    expect(resultado.EXPIRA_EM).toBeInstanceOf(Date);
  });

  // AC10: notification failure must never propagate to route creation.
  describe("never throws", () => {
    it("resolves with a FALHOU row when the channel rejects", async () => {
      sendMock.mockRejectedValue(new Error("provider exploded"));

      const resultado = await NotificacaoVisitaService.notificarVisita(rota);

      expect(resultado.STATUS).toBe(StatusNotificacaoVisita.FALHOU);
      expect(resultado.ERRO_ENVIO).toContain("provider exploded");
    });

    it("resolves with a FALHOU row when the recipient query rejects", async () => {
      usuarioRepo.find.mockRejectedValue(new Error("connection lost"));

      const resultado = await NotificacaoVisitaService.notificarVisita(rota);

      expect(resultado.STATUS).toBe(StatusNotificacaoVisita.FALHOU);
      expect(resultado.ERRO_ENVIO).toContain("connection lost");
    });

    // No spec AC covers a route whose Oficina row is missing; it is handled
    // explicitly rather than left to throw, since this function may never throw.
    it("resolves with a FALHOU row when the route's Oficina cannot be found", async () => {
      oficinaRepo.findOne.mockResolvedValue(null);

      const resultado = await NotificacaoVisitaService.notificarVisita(rota);

      expect(resultado.STATUS).toBe(StatusNotificacaoVisita.FALHOU);
      expect(resultado.ERRO_ENVIO).toBe("oficina not found");
      expect(sendMock).not.toHaveBeenCalled();
    });

    it("resolves with a FALHOU row even when the row itself can never be persisted", async () => {
      notifRepo.save.mockRejectedValue(new Error("database down"));

      const resultado = await NotificacaoVisitaService.notificarVisita(rota);

      expect(resultado.STATUS).toBe(StatusNotificacaoVisita.FALHOU);
      expect(resultado.ID_ROTA_PROMOTOR).toBe(ID_ROTA);
    });
  });

  // AC24: creation, token issuance, dispatch attempt and dispatch result are
  // all logged with both IDs.
  it("logs each lifecycle event with both the route and notification IDs", async () => {
    await NotificacaoVisitaService.notificarVisita(rota);

    const ids = { ID_ROTA_PROMOTOR: ID_ROTA, ID_NOTIFICACAO_VISITA: 1 };
    expect(console.log).toHaveBeenCalledWith(
      "[notificacaoVisita] notificação criada em PENDENTE",
      ids
    );
    expect(console.log).toHaveBeenCalledWith("[notificacaoVisita] link token emitido", ids);
    expect(console.log).toHaveBeenCalledWith(
      "[notificacaoVisita] tentando despachar notificação",
      ids
    );
    expect(console.log).toHaveBeenCalledWith("[notificacaoVisita] notificação enviada", ids);
  });
});
