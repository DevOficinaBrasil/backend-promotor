import { AppDataSourceSync } from "../../data-source";
import NotificacaoVisita, {
  CanalNotificacao,
  StatusNotificacaoVisita,
} from "../../entities/NotificacaoVisita";
import RotaPromotor from "../../entities/RotaPromotor";
import NotificacaoVisitaService from "../../service/notificacaoVisitaService";
import { getChannel } from "../../channels/channelRegistry";

jest.mock("../../data-source");
jest.mock("../../channels/channelRegistry");

// AGND-01: route creation persists exactly one PENDENTE row with AVAILABLE_AT
// set, and resolves no recipient, issues no token and calls no provider.
// AGND-03: a failed write still must not throw at the caller.
describe("NotificacaoVisitaService.agendarVisita", () => {
  const ID_ROTA = 4242;
  const rota = { ID_ROTA_PROMOTOR: ID_ROTA, ID_OFICINA: 77 } as RotaPromotor;

  let notifRepo: { create: jest.Mock; save: jest.Mock };
  let sendMock: jest.Mock;
  let envOriginal: Record<string, string | undefined>;
  const ENV_KEYS = ["NOTIFICACAO_HORA_ENVIO", "OUTBOX_VISITA_ENVIO_IMEDIATO"] as const;

  beforeEach(() => {
    envOriginal = {};
    for (const chave of ENV_KEYS) {
      envOriginal[chave] = process.env[chave];
      delete process.env[chave];
    }

    notifRepo = {
      create: jest.fn((dados) => dados as NotificacaoVisita),
      save: jest.fn(async (linha) => ({ ...linha, ID_NOTIFICACAO_VISITA: 1 })),
    };
    (AppDataSourceSync.getRepository as jest.Mock) = jest.fn(() => notifRepo);

    sendMock = jest.fn();
    (getChannel as jest.Mock).mockReturnValue({ send: sendMock });

    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
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

  it("persists exactly one PENDENTE row for the route", async () => {
    await NotificacaoVisitaService.agendarVisita(rota);

    expect(notifRepo.save).toHaveBeenCalledTimes(1);
    expect(notifRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ID_ROTA_PROMOTOR: ID_ROTA,
        CANAL: CanalNotificacao.WHATSAPP,
        STATUS: StatusNotificacaoVisita.PENDENTE,
      })
    );
  });

  it("sets AVAILABLE_AT to the next configured hour", async () => {
    process.env.NOTIFICACAO_HORA_ENVIO = "9";

    const salva = await NotificacaoVisitaService.agendarVisita(rota);

    // 09:00 in São Paulo is 12:00Z; the row must be due at that wall hour.
    expect(salva.AVAILABLE_AT).toBeInstanceOf(Date);
    expect(salva.AVAILABLE_AT!.getUTCHours()).toBe(12);
    expect(salva.AVAILABLE_AT!.getTime()).toBeGreaterThan(Date.now());
  });

  it("sets AVAILABLE_AT to now when OUTBOX_VISITA_ENVIO_IMEDIATO is 1", async () => {
    process.env.OUTBOX_VISITA_ENVIO_IMEDIATO = "1";
    const antes = Date.now();

    const salva = await NotificacaoVisitaService.agendarVisita(rota);

    expect(salva.AVAILABLE_AT!.getTime()).toBeGreaterThanOrEqual(antes);
    expect(salva.AVAILABLE_AT!.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("logs when the immediate-send override shortened the schedule", async () => {
    process.env.OUTBOX_VISITA_ENVIO_IMEDIATO = "1";

    await NotificacaoVisitaService.agendarVisita(rota);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("OUTBOX_VISITA_ENVIO_IMEDIATO"),
      expect.objectContaining({ ID_ROTA_PROMOTOR: ID_ROTA })
    );
  });

  it("never calls the provider while enqueueing", async () => {
    await NotificacaoVisitaService.agendarVisita(rota);

    expect(sendMock).not.toHaveBeenCalled();
  });

  it("resolves no recipient and issues no token", async () => {
    const salva = await NotificacaoVisitaService.agendarVisita(rota);

    expect(salva.ID_USUARIO ?? null).toBeNull();
    expect(salva.TELEFONE_NORMALIZADO ?? null).toBeNull();
    expect(salva.TOKEN_HASH ?? null).toBeNull();
    expect(salva.EXPIRA_EM ?? null).toBeNull();
  });

  it("starts the row at zero attempts and with no lease", async () => {
    const salva = await NotificacaoVisitaService.agendarVisita(rota);

    expect(salva.ATTEMPTS).toBe(0);
    expect(salva.LOCKED_AT ?? null).toBeNull();
    expect(salva.LOCKED_BY ?? null).toBeNull();
  });

  it("does not throw when the row cannot be written, and reports the failure", async () => {
    notifRepo.save.mockRejectedValue(new Error("db indisponível"));

    await expect(NotificacaoVisitaService.agendarVisita(rota)).resolves.toBeDefined();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("falha ao agendar"),
      expect.objectContaining({ ID_ROTA_PROMOTOR: ID_ROTA })
    );
  });
});
