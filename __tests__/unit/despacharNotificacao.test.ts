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
  MOTIVO_LINK_NAO_CONFIGURADO,
} from "../../service/notificacaoVisitaService";
import { getChannel } from "../../channels/channelRegistry";
import { avaliarGuardas, enderecoRecente } from "../../service/envioGuards";

jest.mock("../../data-source");
jest.mock("../../channels/channelRegistry");
jest.mock("../../service/envioGuards");

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
  // A base do link vinha de VISITA_CONFIRMACAO_BASE_URL com fallback para
  // API_URL e, faltando as duas, montava "/visita/confirmacao?token=..." — um
  // caminho relativo, que numa mensagem de WhatsApp não é link. A notificação
  // ainda era marcada ENVIADO, então ninguém descobria pelo status.
  describe("base do link de confirmação ausente ou relativa", () => {
    let apiUrlOriginal: string | undefined;

    beforeEach(() => {
      apiUrlOriginal = process.env.API_URL;
      delete process.env.API_URL;
      delete process.env.VISITA_CONFIRMACAO_BASE_URL;
    });

    afterEach(() => {
      if (apiUrlOriginal === undefined) delete process.env.API_URL;
      else process.env.API_URL = apiUrlOriginal;
    });

    it("reporta falha de configuração sem chamar o canal quando não há base", async () => {
      const desfecho = await NotificacaoVisitaService.despacharNotificacao(ID_NOTIFICACAO);

      expect(desfecho).toEqual({
        desfecho: "FALHOU_TERMINAL",
        erro: MOTIVO_LINK_NAO_CONFIGURADO,
      });
      expect(sendMock).not.toHaveBeenCalled();
    });

    it("não grava TOKEN_HASH nem EXPIRA_EM: a janela do token não é queimada", async () => {
      await NotificacaoVisitaService.despacharNotificacao(ID_NOTIFICACAO);

      for (const chamada of notifRepo.save.mock.calls) {
        expect(chamada[0].TOKEN_HASH).toBeUndefined();
        expect(chamada[0].EXPIRA_EM).toBeUndefined();
      }
      // A linha fica FALHOU com o motivo, para o painel mostrar o que houve.
      const chamadas = notifRepo.save.mock.calls;
      const ultimaEscrita = chamadas[chamadas.length - 1][0];
      expect(ultimaEscrita.STATUS).toBe(StatusNotificacaoVisita.FALHOU);
      expect(ultimaEscrita.ERRO_ENVIO).toBe(MOTIVO_LINK_NAO_CONFIGURADO);
    });

    it("recusa base sem esquema, que o WhatsApp não transforma em link", async () => {
      process.env.VISITA_CONFIRMACAO_BASE_URL = "app.example.com";

      const desfecho = await NotificacaoVisitaService.despacharNotificacao(ID_NOTIFICACAO);

      expect(desfecho).toEqual({
        desfecho: "FALHOU_TERMINAL",
        erro: MOTIVO_LINK_NAO_CONFIGURADO,
      });
      expect(sendMock).not.toHaveBeenCalled();
    });

    it("aceita a base vinda de API_URL quando ela é absoluta", async () => {
      process.env.API_URL = "https://api.example.com/";

      const desfecho = await NotificacaoVisitaService.despacharNotificacao(ID_NOTIFICACAO);

      expect(desfecho).toMatchObject({ desfecho: "ENVIADO" });
      const [{ variables }] = sendMock.mock.calls[0];
      expect(variables[2]).toMatch(
        /^https:\/\/api\.example\.com\/visita\/confirmacao\?token=/
      );
    });
  });
  // 131049: a Meta recusou a entrega para esta pessoa por fadiga dela, não por
  // problema nosso. Vira DISPENSADO — supressão deliberada — em vez de falha
  // transitória, cuja escada de retentativa é de minutos contra a orientação de
  // esperar 24h.
  describe("limite do destinatário (131049)", () => {
    beforeEach(() => {
      sendMock.mockResolvedValue({
        success: false,
        reason: "recipient message limit",
        providerCode: "131049",
      });
    });

    it("reporta DISPENSADO, não falha nem retentativa", async () => {
      const desfecho = await NotificacaoVisitaService.despacharNotificacao(ID_NOTIFICACAO);

      expect(desfecho).toEqual({
        desfecho: "DISPENSADO",
        motivo: "recipient message limit: 131049",
      });
    });

    it("persiste DISPENSADO com o código do provider e o destinatário resolvido", async () => {
      await NotificacaoVisitaService.despacharNotificacao(ID_NOTIFICACAO);

      const chamadas = notifRepo.save.mock.calls;
      const gravado = chamadas[chamadas.length - 1][0];
      expect(gravado.STATUS).toBe(StatusNotificacaoVisita.DISPENSADO);
      expect(gravado.ERRO_ENVIO).toBe("recipient message limit: 131049");
      expect(gravado.ID_USUARIO).toBe(ID_USUARIO);
    });

    it("não marca FALHOU: o número e o template continuam saudáveis", async () => {
      await NotificacaoVisitaService.despacharNotificacao(ID_NOTIFICACAO);

      for (const chamada of notifRepo.save.mock.calls) {
        expect(chamada[0].STATUS).not.toBe(StatusNotificacaoVisita.FALHOU);
      }
    });
  });
});
