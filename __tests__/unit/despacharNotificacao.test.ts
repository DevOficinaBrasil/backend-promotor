import { AppDataSourceSync } from "../../data-source";
import NotificacaoVisita, {
  StatusNotificacaoVisita,
} from "../../entities/NotificacaoVisita";
import Oficina from "../../entities/Oficina";
import RotaPromotor from "../../entities/RotaPromotor";
import Usuario from "../../entities/Usuario";
import Community from "../../entities/Community";
import CampanhaPromotor from "../../entities/CampanhaPromotor";
import NotificacaoVisitaService, {
  MOTIVO_ENDERECO_RECENTE,
  MOTIVO_OFICINA_INEXISTENTE,
  MOTIVO_SEM_TELEFONE,
  MOTIVO_TELEFONE_INVALIDO,
} from "../../service/notificacaoVisitaService";
import { getChannel } from "../../channels/channelRegistry";
import { avaliarGuardas, enderecoRecente } from "../../service/envioGuards";
import { MigrationAwareRepository } from "../../utils/migrationRepository";

jest.mock("../../data-source");
jest.mock("../../channels/channelRegistry");
jest.mock("../../service/envioGuards");
jest.mock("../../utils/migrationRepository");

// AGND-09: dispatch runs the existing flow against state as of the send, and
// returns a verdict instead of deciding retry policy. The queue owns retries.
describe("NotificacaoVisitaService.despacharNotificacao", () => {
  const ID_NOTIFICACAO = 501;
  const ID_ROTA = 4242;
  const ID_OFICINA = 77;
  const ID_USUARIO = 900;

  let notifRepo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
  let oficinaRepo: { findOne: jest.Mock };
  let usuarioRepo: { find: jest.Mock };
  let communityRepo: { findOne: jest.Mock };
  let rotaRepo: { findOne: jest.Mock };
  let sendMock: jest.Mock;

  const linhaPendente = (): NotificacaoVisita =>
    ({
      ID_NOTIFICACAO_VISITA: ID_NOTIFICACAO,
      ID_ROTA_PROMOTOR: ID_ROTA,
      STATUS: StatusNotificacaoVisita.PENDENTE,
      ATTEMPTS: 1,
    }) as NotificacaoVisita;

  beforeEach(() => {
    process.env.VISITA_CONFIRMACAO_BASE_URL = "https://app.example.com";

    notifRepo = {
      findOne: jest.fn(async () => linhaPendente()),
      save: jest.fn(async (linha) => linha),
      create: jest.fn((dados) => dados),
    };
    oficinaRepo = {
      findOne: jest.fn(async () => ({ ID_OFICINA, NOME_FANTASIA: "Auto Center" }) as Oficina),
    };
    usuarioRepo = {
      find: jest.fn(async () => [
        { ID_USUARIO, NOME: "Maria Souza", CELULAR: "11999998888" } as Usuario,
      ]),
    };
    communityRepo = { findOne: jest.fn(async () => ({ Nome: "Authomix" }) as Community) };
    rotaRepo = {
      findOne: jest.fn(async () => ({
        ID_ROTA_PROMOTOR: ID_ROTA,
        ID_OFICINA,
        ID_CAMPANHA_PROMOTOR: 10,
      }) as RotaPromotor),
    };

    (AppDataSourceSync.getRepository as jest.Mock) = jest.fn((entidade) => {
      if (entidade === NotificacaoVisita) return notifRepo;
      if (entidade === Oficina) return oficinaRepo;
      if (entidade === Usuario) return usuarioRepo;
      if (entidade === Community) return communityRepo;
      return { findOne: jest.fn(), find: jest.fn(), save: jest.fn() };
    });

    (MigrationAwareRepository as jest.Mock).mockImplementation((entidade: unknown) => {
      if (entidade === RotaPromotor) return rotaRepo;
      if (entidade === CampanhaPromotor) {
        return { findOne: jest.fn(async () => ({ ID_CAMPANHA: 1 })) };
      }
      // Campanha sem END_TIME: cai no fallback de 168h, com slug resolvível.
      return {
        findOne: jest.fn(async () => ({ ID_CAMPANHA: 1, END_TIME: null, EMPRESA_SLUG: "authomix" })),
      };
    });

    (enderecoRecente as jest.Mock).mockReturnValue(false);
    (avaliarGuardas as jest.Mock).mockResolvedValue({ bloqueado: false });

    sendMock = jest.fn(async () => ({
      success: true,
      messageId: "m-1",
      providerMessageId: "wamid.1",
    }));
    (getChannel as jest.Mock).mockReturnValue({ send: sendMock });

    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.VISITA_CONFIRMACAO_BASE_URL;
    jest.restoreAllMocks();
  });

  it("dispatches and reports ENVIADO with the provider identifiers", async () => {
    const desfecho = await NotificacaoVisitaService.despacharNotificacao(ID_NOTIFICACAO);

    expect(desfecho).toEqual({
      desfecho: "ENVIADO",
      messageId: "m-1",
      providerMessageId: "wamid.1",
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("persists ENVIADO with ENVIADO_EM and both provider ids", async () => {
    await NotificacaoVisitaService.despacharNotificacao(ID_NOTIFICACAO);

    expect(notifRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        STATUS: StatusNotificacaoVisita.ENVIADO,
        MESSAGE_ID: "m-1",
        PROVIDER_MESSAGE_ID: "wamid.1",
        ENVIADO_EM: expect.any(Date),
      })
    );
  });

  it("issues the link token before dispatching, and sends the confirmation URL", async () => {
    await NotificacaoVisitaService.despacharNotificacao(ID_NOTIFICACAO);

    expect(notifRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        TOKEN_HASH: expect.any(String),
        EXPIRA_EM: expect.any(Date),
        TELEFONE_NORMALIZADO: "5511999998888",
        ID_USUARIO,
      })
    );
    const variaveis = sendMock.mock.calls[0][0].variables;
    expect(variaveis[0]).toBe("Maria Souza");
    expect(variaveis[1]).toBe("Authomix");
    expect(variaveis[2]).toContain("https://app.example.com/visita/confirmacao?token=");
  });

  it("reports DISPENSADO when a guard blocks the send", async () => {
    (enderecoRecente as jest.Mock).mockReturnValue(true);

    const desfecho = await NotificacaoVisitaService.despacharNotificacao(ID_NOTIFICACAO);

    expect(desfecho).toEqual({ desfecho: "DISPENSADO", motivo: MOTIVO_ENDERECO_RECENTE });
    expect(sendMock).not.toHaveBeenCalled();
    expect(notifRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ STATUS: StatusNotificacaoVisita.DISPENSADO })
    );
  });

  it("reports DISPENSADO when the recipient anti-spam guard blocks", async () => {
    (avaliarGuardas as jest.Mock).mockResolvedValue({
      bloqueado: true,
      motivo: "recipient has outstanding notification",
    });

    const desfecho = await NotificacaoVisitaService.despacharNotificacao(ID_NOTIFICACAO);

    expect(desfecho).toEqual({
      desfecho: "DISPENSADO",
      motivo: "recipient has outstanding notification",
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("reports FALHOU_TERMINAL when the oficina no longer exists", async () => {
    oficinaRepo.findOne.mockResolvedValue(null);

    const desfecho = await NotificacaoVisitaService.despacharNotificacao(ID_NOTIFICACAO);

    expect(desfecho).toEqual({
      desfecho: "FALHOU_TERMINAL",
      erro: MOTIVO_OFICINA_INEXISTENTE,
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("reports FALHOU_TERMINAL when no recipient has a phone", async () => {
    usuarioRepo.find.mockResolvedValue([{ ID_USUARIO, NOME: "Sem Fone", CELULAR: "" } as Usuario]);

    const desfecho = await NotificacaoVisitaService.despacharNotificacao(ID_NOTIFICACAO);

    expect(desfecho).toEqual({ desfecho: "FALHOU_TERMINAL", erro: MOTIVO_SEM_TELEFONE });
  });

  it("reports FALHOU_TERMINAL when the phone does not normalize", async () => {
    usuarioRepo.find.mockResolvedValue([
      { ID_USUARIO, NOME: "Fone Ruim", CELULAR: "(00) 1234" } as Usuario,
    ]);

    const desfecho = await NotificacaoVisitaService.despacharNotificacao(ID_NOTIFICACAO);

    expect(desfecho).toEqual({ desfecho: "FALHOU_TERMINAL", erro: MOTIVO_TELEFONE_INVALIDO });
  });

  it("reports FALHOU_TERMINAL for a provider failure no retry can fix", async () => {
    sendMock.mockResolvedValue({
      success: false,
      reason: "channel not configured",
      providerCode: "TEMPLATE_NOT_FOUND",
    });

    const desfecho = await NotificacaoVisitaService.despacharNotificacao(ID_NOTIFICACAO);

    expect(desfecho).toEqual({
      desfecho: "FALHOU_TERMINAL",
      erro: "channel not configured: TEMPLATE_NOT_FOUND",
    });
  });

  it("reports FALHOU_TRANSITORIO for a network error, leaving STATUS PENDENTE", async () => {
    sendMock.mockResolvedValue({
      success: false,
      reason: "network error",
      providerCode: null,
    });

    const desfecho = await NotificacaoVisitaService.despacharNotificacao(ID_NOTIFICACAO);

    expect(desfecho).toEqual({ desfecho: "FALHOU_TRANSITORIO", erro: "network error" });
    // The queue decides retry vs terminal — dispatch must not resolve it.
    expect(notifRepo.save).not.toHaveBeenCalledWith(
      expect.objectContaining({ STATUS: StatusNotificacaoVisita.FALHOU })
    );
  });

  it("reports FALHOU_TRANSITORIO for a provider rate limit", async () => {
    sendMock.mockResolvedValue({
      success: false,
      reason: "provider rate/quota",
      providerCode: "RATE_LIMITED",
    });

    const desfecho = await NotificacaoVisitaService.despacharNotificacao(ID_NOTIFICACAO);

    expect(desfecho).toEqual({
      desfecho: "FALHOU_TRANSITORIO",
      erro: "provider rate/quota: RATE_LIMITED",
    });
  });

  // An unknown crash must retry rather than silently retire a notification.
  it("classifies an unexpected throw as FALHOU_TRANSITORIO", async () => {
    sendMock.mockRejectedValue(new Error("boom"));

    const desfecho = await NotificacaoVisitaService.despacharNotificacao(ID_NOTIFICACAO);

    expect(desfecho.desfecho).toBe("FALHOU_TRANSITORIO");
    expect((desfecho as { erro: string }).erro).toContain("boom");
  });

  it("reports FALHOU_TERMINAL when the notification row does not exist", async () => {
    notifRepo.findOne.mockResolvedValue(null);

    const desfecho = await NotificacaoVisitaService.despacharNotificacao(ID_NOTIFICACAO);

    expect(desfecho).toEqual({
      desfecho: "FALHOU_TERMINAL",
      erro: "notificacao not found",
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("reports FALHOU_TERMINAL when the route behind the notification is gone", async () => {
    rotaRepo.findOne.mockResolvedValue(null);

    const desfecho = await NotificacaoVisitaService.despacharNotificacao(ID_NOTIFICACAO);

    expect(desfecho).toEqual({ desfecho: "FALHOU_TERMINAL", erro: "rota not found" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("never touches queue state — no lease and no attempt count", async () => {
    await NotificacaoVisitaService.despacharNotificacao(ID_NOTIFICACAO);

    for (const chamada of notifRepo.save.mock.calls) {
      expect(chamada[0]).not.toHaveProperty("LOCKED_AT", expect.anything());
      expect(chamada[0].ATTEMPTS).toBe(1);
      expect(chamada[0].AVAILABLE_AT).toBeUndefined();
    }
  });
});
