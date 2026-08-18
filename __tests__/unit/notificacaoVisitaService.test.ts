import NotificacaoVisitaService, {
  criarCacheCampanha,
  MOTIVO_CAMPANHA_ENCERRADA,
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
import Campanha from "../../entities/Campanha";
import CampanhaPromotor from "../../entities/CampanhaPromotor";
import Community from "../../entities/Community";
import Oficina from "../../entities/Oficina";
import Usuario from "../../entities/Usuario";
import RotaPromotor from "../../entities/RotaPromotor";
import { avaliarGuardas, enderecoRecente } from "../../service/envioGuards";
import { getChannel } from "../../channels/channelRegistry";
import { MigrationAwareRepository } from "../../utils/migrationRepository";
import { hashToken } from "../../utils/visitaToken";

jest.mock("../../data-source");
jest.mock("../../service/envioGuards");
jest.mock("../../channels/channelRegistry");
jest.mock("../../utils/migrationRepository");

const enderecoRecenteMock = enderecoRecente as jest.MockedFunction<typeof enderecoRecente>;
const avaliarGuardasMock = avaliarGuardas as jest.MockedFunction<typeof avaliarGuardas>;
const getChannelMock = getChannel as jest.MockedFunction<typeof getChannel>;
const MigrationAwareRepositoryMock =
  MigrationAwareRepository as jest.MockedClass<typeof MigrationAwareRepository>;

const ID_ROTA = 42;
const ID_OFICINA = 900;
const ID_USUARIO = 7;
const ID_CAMPANHA_PROMOTOR = 300;
const ID_CAMPANHA = 55;
const EMPRESA_SLUG = "authomix";

describe("NotificacaoVisitaService.notificarVisita", () => {
  let notifRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
  };
  // Snapshot of the row as each save saw it — the service mutates one entity
  // instance across the flow, so mock.calls alone only shows the final state.
  let persistidos: NotificacaoVisita[];
  let oficinaRepo: { findOne: jest.Mock };
  let usuarioRepo: { find: jest.Mock };
  let campanhaPromotorRepo: { findOne: jest.Mock };
  let campanhaRepo: { findOne: jest.Mock };
  let communityRepo: { findOne: jest.Mock };
  let rotaRepo: { findOne: jest.Mock };
  let rotaAtual: RotaPromotor;
  let sendMock: jest.Mock;

  // The default route carries no ID_CAMPANHA_PROMOTOR, so the campaign chain is
  // never walked and the expiry falls back to 168h. The campaign-bound expiry
  // suite below uses `rotaComCampanha` instead.
  const rota = { ID_ROTA_PROMOTOR: ID_ROTA, ID_OFICINA } as RotaPromotor;

  const rotaComCampanha = {
    ID_ROTA_PROMOTOR: ID_ROTA,
    ID_OFICINA,
    ID_CAMPANHA_PROMOTOR,
  } as RotaPromotor;

  const oficinaPadrao = {
    ID_OFICINA,
    NOME_FANTASIA: "Auto Center Silva",
    DATA_ALTERACAO: new Date("2020-01-01T00:00:00.000Z"),
  } as Oficina;

  const usuarioPadrao = {
    ID_USUARIO,
    ID_OFICINA,
    NOME: "Maria Souza",
    CELULAR: "(11) 99999-8888",
  } as Usuario;

  beforeEach(() => {
    // Sem base absoluta configurada não existe link para mandar, e o despacho
    // encerra em FALHOU_TERMINAL antes do canal — então todo teste de envio
    // precisa da env, como produção precisa.
    process.env.VISITA_CONFIRMACAO_BASE_URL = "https://app.example.com";
    persistidos = [];
    rotaAtual = rota;
    let ultimaLinha: NotificacaoVisita | null = null;
    notifRepo = {
      create: jest.fn((dados) => new NotificacaoVisita(dados)),
      save: jest.fn(async (linha: NotificacaoVisita) => {
        if (linha.ID_NOTIFICACAO_VISITA === undefined) {
          linha.ID_NOTIFICACAO_VISITA = 1;
        }
        ultimaLinha = linha;
        persistidos.push(new NotificacaoVisita({ ...linha }));
        return linha;
      }),
      // O despacho recarrega a linha pelo id (o worker só conhece o id).
      findOne: jest.fn(async () => ultimaLinha),
    };
    oficinaRepo = { findOne: jest.fn(async () => oficinaPadrao) };
    usuarioRepo = { find: jest.fn(async () => [usuarioPadrao]) };
    communityRepo = { findOne: jest.fn(async () => ({ CommunityID: 17, Nome: "Authomix" })) };

    (AppDataSourceSync.getRepository as jest.Mock).mockImplementation((entidade: unknown) => {
      if (entidade === NotificacaoVisita) return notifRepo;
      if (entidade === Oficina) return oficinaRepo;
      if (entidade === Usuario) return usuarioRepo;
      if (entidade === Community) return communityRepo;
      throw new Error("repositório inesperado no teste");
    });

    campanhaPromotorRepo = {
      findOne: jest.fn(async () => ({ ID_CAMPANHA_PROMOTOR, ID_CAMPANHA })),
    };
    campanhaRepo = {
      findOne: jest.fn(async () => ({ ID_CAMPANHA, EMPRESA_SLUG, END_TIME: null })),
    };

    // A rota também é recarregada pelo id no despacho. Cada teste ajusta
    // rotaAtual quando precisa de uma rota diferente da padrão.
    rotaRepo = { findOne: jest.fn(async () => rotaAtual) };

    MigrationAwareRepositoryMock.mockImplementation((entidade: unknown) => {
      if (entidade === CampanhaPromotor) return campanhaPromotorRepo as never;
      if (entidade === Campanha) return campanhaRepo as never;
      if (entidade === RotaPromotor) return rotaRepo as never;
      throw new Error("repositório de migração inesperado no teste");
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
    delete process.env.VISITA_CONFIRMACAO_BASE_URL;
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
      // AGND-01: a linha já nasce agendada e sem tentativas.
      AVAILABLE_AT: expect.any(Date),
      ATTEMPTS: 0,
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

    expect(usuarioRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ID_OFICINA },
        order: {
          DATA_ALTERACAO: { direction: "DESC", nulls: "LAST" },
          ID_USUARIO: "ASC",
        },
      })
    );
  });

  // The four columns the flow actually reads. USUARIO is wide and every row of
  // the workshop is loaded, so the projection is part of the contract.
  it("selects only the recipient columns the send needs", async () => {
    await NotificacaoVisitaService.notificarVisita(rota);

    expect(usuarioRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          ID_USUARIO: true,
          NOME: true,
          CELULAR: true,
          DATA_ALTERACAO: true,
        },
      })
    );
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

  // AC5: token issued before any dispatch attempt. The 168h window is the
  // fallback used when no campaign end date can be resolved — see the
  // campaign-bound expiry suite for the normal case.
  it("issues the link token before dispatch with a 168 hour fallback expiry", async () => {
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

  // Every route of one createRotas call shares a campaign, so the chain is read
  // once for the whole batch instead of once per route.
  describe("per-batch campaign cache", () => {
    beforeEach(() => {
      rotaAtual = rotaComCampanha;
    });

    it("reads the campaign chain and the client only once across a batch", async () => {
      const cache = criarCacheCampanha();

      await NotificacaoVisitaService.notificarVisita(rotaComCampanha, cache);
      await NotificacaoVisitaService.notificarVisita(rotaComCampanha, cache);
      await NotificacaoVisitaService.notificarVisita(rotaComCampanha, cache);

      expect(campanhaPromotorRepo.findOne).toHaveBeenCalledTimes(1);
      expect(campanhaRepo.findOne).toHaveBeenCalledTimes(1);
      expect(communityRepo.findOne).toHaveBeenCalledTimes(1);
    });

    // A cached miss is still a cached answer — an unresolvable client must not
    // be retried once per route.
    it("caches a null client name instead of re-querying it", async () => {
      communityRepo.findOne.mockResolvedValue(null);
      const cache = criarCacheCampanha();

      await NotificacaoVisitaService.notificarVisita(rotaComCampanha, cache);
      await NotificacaoVisitaService.notificarVisita(rotaComCampanha, cache);

      expect(communityRepo.findOne).toHaveBeenCalledTimes(1);
    });

    it("still resolves the campaign when no cache is supplied", async () => {
      await NotificacaoVisitaService.notificarVisita(rotaComCampanha);
      await NotificacaoVisitaService.notificarVisita(rotaComCampanha);

      expect(campanhaPromotorRepo.findOne).toHaveBeenCalledTimes(2);
    });
  });

  // The notification belongs to a rota, the rota to a campanha, and the
  // confirmation link may not outlive the campaign it was issued for.
  describe("campaign-bound expiry", () => {
    beforeEach(() => {
      rotaAtual = rotaComCampanha;
    });

    const AGORA = new Date("2026-08-05T12:00:00.000Z");
    const FALLBACK_168H = new Date("2026-08-12T12:00:00.000Z");

    beforeEach(() => {
      jest.useFakeTimers({ now: AGORA });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("pins EXPIRA_EM to the campaign's END_TIME", async () => {
      const fimCampanha = new Date("2026-09-30T23:59:59.000Z");
      campanhaRepo.findOne.mockResolvedValue({ ID_CAMPANHA, END_TIME: fimCampanha });

      const resultado = await NotificacaoVisitaService.notificarVisita(rotaComCampanha);

      expect(resultado.STATUS).toBe(StatusNotificacaoVisita.ENVIADO);
      expect(resultado.EXPIRA_EM).toEqual(fimCampanha);
      expect(campanhaPromotorRepo.findOne).toHaveBeenCalledWith({
        where: { ID_CAMPANHA_PROMOTOR },
      });
      expect(campanhaRepo.findOne).toHaveBeenCalledWith({ where: { ID_CAMPANHA } });
    });

    it("accepts an END_TIME handed back as a string by the legacy merge path", async () => {
      campanhaRepo.findOne.mockResolvedValue({
        ID_CAMPANHA,
        END_TIME: "2026-09-30T23:59:59.000Z",
      });

      const resultado = await NotificacaoVisitaService.notificarVisita(rotaComCampanha);

      expect(resultado.EXPIRA_EM).toEqual(new Date("2026-09-30T23:59:59.000Z"));
    });

    it("marks DISPENSADO without sending when the campaign has already ended", async () => {
      campanhaRepo.findOne.mockResolvedValue({
        ID_CAMPANHA,
        END_TIME: new Date("2026-08-01T00:00:00.000Z"),
      });

      const resultado = await NotificacaoVisitaService.notificarVisita(rotaComCampanha);

      expect(resultado.STATUS).toBe(StatusNotificacaoVisita.DISPENSADO);
      expect(resultado.ERRO_ENVIO).toBe(MOTIVO_CAMPANHA_ENCERRADA);
      expect(sendMock).not.toHaveBeenCalled();
      expect(resultado.TOKEN_HASH ?? null).toBeNull();
      // The dead campaign is ruled out before the recipient is resolved, so the
      // per-recipient anti-spam state is never touched.
      expect(usuarioRepo.find).not.toHaveBeenCalled();
      expect(avaliarGuardasMock).not.toHaveBeenCalled();
    });

    it("treats an END_TIME exactly at now as ended", async () => {
      campanhaRepo.findOne.mockResolvedValue({ ID_CAMPANHA, END_TIME: AGORA });

      const resultado = await NotificacaoVisitaService.notificarVisita(rotaComCampanha);

      expect(resultado.STATUS).toBe(StatusNotificacaoVisita.DISPENSADO);
      expect(resultado.ERRO_ENVIO).toBe(MOTIVO_CAMPANHA_ENCERRADA);
    });

    it("falls back to 168h when the campaign has no END_TIME", async () => {
      campanhaRepo.findOne.mockResolvedValue({ ID_CAMPANHA, END_TIME: null });

      const resultado = await NotificacaoVisitaService.notificarVisita(rotaComCampanha);

      expect(resultado.STATUS).toBe(StatusNotificacaoVisita.ENVIADO);
      expect(resultado.EXPIRA_EM).toEqual(FALLBACK_168H);
    });

    it("falls back to 168h when the campaign row cannot be resolved", async () => {
      campanhaRepo.findOne.mockResolvedValue(null);

      const resultado = await NotificacaoVisitaService.notificarVisita(rotaComCampanha);

      expect(resultado.STATUS).toBe(StatusNotificacaoVisita.ENVIADO);
      expect(resultado.EXPIRA_EM).toEqual(FALLBACK_168H);
    });

    it("falls back to 168h without touching the campaign when the route has no ID_CAMPANHA_PROMOTOR", async () => {
      // Esta é a exceção do bloco: rota sem campanha, inclusive na releitura
      // que o despacho faz.
      rotaAtual = rota;

      const resultado = await NotificacaoVisitaService.notificarVisita(rota);

      expect(resultado.STATUS).toBe(StatusNotificacaoVisita.ENVIADO);
      expect(resultado.EXPIRA_EM).toEqual(FALLBACK_168H);
      expect(campanhaPromotorRepo.findOne).not.toHaveBeenCalled();
    });
  });

  // AC6. Template atualizacao_dados_visita_oficina takes, in this order:
  // {{1}} recipient's name, {{2}} client the campaign runs for,
  // {{3}} confirmation link. The order is the template contract.
  describe("template variables", () => {
    beforeEach(() => {
      rotaAtual = rotaComCampanha;
    });

    it("dispatches the recipient name, the client name and the confirmation URL in order", async () => {
      process.env.VISITA_CONFIRMACAO_BASE_URL = "https://app.example.com";
      try {
        const resultado = await NotificacaoVisitaService.notificarVisita(rotaComCampanha);

        expect(sendMock).toHaveBeenCalledTimes(1);
        const enviado = sendMock.mock.calls[0][0];
        expect(enviado.toPhone).toBe("5511999998888");
        expect(enviado.variables).toHaveLength(3);
        expect(enviado.variables[0]).toBe("Maria Souza");
        expect(enviado.variables[1]).toBe("Authomix");
        expect(enviado.variables[2]).toMatch(
          /^https:\/\/app\.example\.com\/visita\/confirmacao\?token=/
        );

        expect(communityRepo.findOne).toHaveBeenCalledWith({
          where: { EmpresaSlug: EMPRESA_SLUG },
        });

        // The URL carries the raw token whose hash is what gets persisted.
        const rawToken = enviado.variables[2].split("token=")[1];
        expect(hashToken(rawToken)).toBe(resultado.TOKEN_HASH);
      } finally {
        delete process.env.VISITA_CONFIRMACAO_BASE_URL;
      }
    });

    it("sends an empty company name rather than skipping the send when the campaign has no EMPRESA_SLUG", async () => {
      campanhaRepo.findOne.mockResolvedValue({ ID_CAMPANHA, EMPRESA_SLUG: null, END_TIME: null });

      const resultado = await NotificacaoVisitaService.notificarVisita(rotaComCampanha);

      expect(resultado.STATUS).toBe(StatusNotificacaoVisita.ENVIADO);
      expect(sendMock.mock.calls[0][0].variables[1]).toBe("");
      expect(communityRepo.findOne).not.toHaveBeenCalled();
    });

    it("sends an empty company name when the community row cannot be resolved", async () => {
      communityRepo.findOne.mockResolvedValue(null);

      const resultado = await NotificacaoVisitaService.notificarVisita(rotaComCampanha);

      expect(resultado.STATUS).toBe(StatusNotificacaoVisita.ENVIADO);
      expect(sendMock.mock.calls[0][0].variables[1]).toBe("");
    });

    it("sends an empty recipient name when the user has no NOME", async () => {
      usuarioRepo.find.mockResolvedValue([{ ...usuarioPadrao, NOME: null }]);

      const resultado = await NotificacaoVisitaService.notificarVisita(rotaComCampanha);

      expect(resultado.STATUS).toBe(StatusNotificacaoVisita.ENVIADO);
      expect(sendMock.mock.calls[0][0].variables[0]).toBe("");
    });
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

    // AGND-11: falha de rede é transitória. O motivo fica registrado, mas o
    // STATUS segue PENDENTE — aposentar a linha é decisão da fila, no teto.
    expect(resultado.STATUS).toBe(StatusNotificacaoVisita.PENDENTE);
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
    // AGND-11: uma exceção inesperada é classificada como transitória, para que
    // uma falha desconhecida seja repetida em vez de aposentar a notificação em
    // silêncio. A linha continua PENDENTE e a chamada não estoura.
    it("resolves without throwing when the channel rejects", async () => {
      sendMock.mockRejectedValue(new Error("provider exploded"));

      const resultado = await NotificacaoVisitaService.notificarVisita(rota);

      expect(resultado.STATUS).toBe(StatusNotificacaoVisita.PENDENTE);
      expect(resultado.ID_ROTA_PROMOTOR).toBe(ID_ROTA);
    });

    it("resolves without throwing when the recipient query rejects", async () => {
      usuarioRepo.find.mockRejectedValue(new Error("connection lost"));

      const resultado = await NotificacaoVisitaService.notificarVisita(rota);

      expect(resultado.STATUS).toBe(StatusNotificacaoVisita.PENDENTE);
      expect(resultado.ID_ROTA_PROMOTOR).toBe(ID_ROTA);
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

    it("resolves with the in-memory row even when it can never be persisted", async () => {
      notifRepo.save.mockRejectedValue(new Error("database down"));

      const resultado = await NotificacaoVisitaService.notificarVisita(rota);

      // Sem banco não há o que agendar, mas a criação da rota não pode quebrar.
      expect(resultado.ID_ROTA_PROMOTOR).toBe(ID_ROTA);
      expect(resultado.STATUS).toBe(StatusNotificacaoVisita.PENDENTE);
    });
  });

  // AC24: creation, token issuance, dispatch attempt and dispatch result are
  // all logged with both IDs.
  it("logs each lifecycle event with both the route and notification IDs", async () => {
    await NotificacaoVisitaService.notificarVisita(rota);

    const ids = { ID_ROTA_PROMOTOR: ID_ROTA, ID_NOTIFICACAO_VISITA: 1 };
    expect(console.log).toHaveBeenCalledWith(
      "[notificacaoVisita] notificação agendada",
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
