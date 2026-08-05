import VisitaConfirmacaoService from "../../service/visitaConfirmacaoService";
import { AppDataSourceSync } from "../../data-source";
import NotificacaoVisita, { StatusNotificacaoVisita } from "../../entities/NotificacaoVisita";
import Oficina from "../../entities/Oficina";
import RotaPromotor from "../../entities/RotaPromotor";
import {
  hashToken,
  verificarJwt,
  VisitaJwtPayload,
  VISITA_SCOPE,
} from "../../utils/visitaToken";
import { MoreThan } from "typeorm";

jest.mock("../../data-source");

const ID_NOTIFICACAO = 55;
const ID_ROTA = 42;
const ID_OFICINA = 900;
const ID_USUARIO = 7;
const RAW_TOKEN = "token-de-teste-opaco";

const AGORA = new Date("2026-08-05T12:00:00.000Z");

describe("VisitaConfirmacaoService.trocarToken", () => {
  let notifRepo: { findOne: jest.Mock; update: jest.Mock; save: jest.Mock };
  let rotaRepo: { findOne: jest.Mock };
  let oficinaRepo: { findOne: jest.Mock };

  const oficinaPadrao = {
    ID_OFICINA,
    NOME_FANTASIA: "Auto Center Silva",
    ENDERECO: "Rua das Oficinas",
    NUMERO: "1234",
    COMPLEMENTO: "Galpão 2",
    BAIRRO: "Vila Industrial",
    CIDADE: "São Paulo",
    ESTADO: "SP",
    CEP: "01234-567",
    CNPJ: "12345678000199",
    TELEFONE: "1133334444",
  } as Oficina;

  const notificacaoEnviada = () =>
    new NotificacaoVisita({
      ID_NOTIFICACAO_VISITA: ID_NOTIFICACAO,
      ID_ROTA_PROMOTOR: ID_ROTA,
      ID_USUARIO,
      STATUS: StatusNotificacaoVisita.ENVIADO,
      TOKEN_HASH: hashToken(RAW_TOKEN),
      EXPIRA_EM: new Date("2026-08-07T12:00:00.000Z"),
    });

  beforeEach(() => {
    process.env.JWT_SECRET = "segredo-de-teste";

    notifRepo = {
      findOne: jest.fn(async () => notificacaoEnviada()),
      update: jest.fn(),
      save: jest.fn(),
    };
    rotaRepo = {
      findOne: jest.fn(async () => ({ ID_ROTA_PROMOTOR: ID_ROTA, ID_OFICINA }) as RotaPromotor),
    };
    oficinaRepo = { findOne: jest.fn(async () => oficinaPadrao) };

    (AppDataSourceSync.getRepository as jest.Mock).mockImplementation((entidade: unknown) => {
      if (entidade === NotificacaoVisita) return notifRepo;
      if (entidade === RotaPromotor) return rotaRepo;
      if (entidade === Oficina) return oficinaRepo;
      throw new Error("repositório inesperado no teste");
    });
  });

  // AC14: "...SHALL issue a short-lived JWT (30 minutes, scope visita:confirmar,
  // subject = ID_USUARIO, claims include ID_NOTIFICACAO_VISITA and
  // ID_ROTA_PROMOTOR) ... and SHALL return it together with the Oficina name".
  it("returns PENDING with a visit-scoped JWT carrying both IDs and the subject", async () => {
    const resultado = await VisitaConfirmacaoService.trocarToken(RAW_TOKEN, AGORA);

    expect(resultado.state).toBe("PENDING");

    const payload = verificarJwt((resultado as { jwt: string }).jwt);
    expect(payload.sub).toBe(ID_USUARIO);
    expect(payload.ID_NOTIFICACAO_VISITA).toBe(ID_NOTIFICACAO);
    expect(payload.ID_ROTA_PROMOTOR).toBe(ID_ROTA);
    expect(payload.scope).toBe(VISITA_SCOPE);
  });

  // AC30: "...SHALL include the workshop's name and its current registered
  // address (ENDERECO, NUMERO, COMPLEMENTO, BAIRRO, CIDADE, ESTADO, CEP)".
  it("returns the workshop name and all seven registered address fields", async () => {
    const resultado = await VisitaConfirmacaoService.trocarToken(RAW_TOKEN, AGORA);

    expect(resultado).toMatchObject({
      state: "PENDING",
      oficinaNome: "Auto Center Silva",
      endereco: {
        ENDERECO: "Rua das Oficinas",
        NUMERO: "1234",
        COMPLEMENTO: "Galpão 2",
        BAIRRO: "Vila Industrial",
        CIDADE: "São Paulo",
        ESTADO: "SP",
        CEP: "01234-567",
      },
    });
  });

  // AC30: "...and SHALL NOT include any visit date."
  it("exposes no visit date and no field outside the address allowlist", async () => {
    const resultado = (await VisitaConfirmacaoService.trocarToken(RAW_TOKEN, AGORA)) as {
      endereco: Record<string, unknown>;
    };

    expect(Object.keys(resultado.endereco).sort()).toEqual([
      "BAIRRO",
      "CEP",
      "CIDADE",
      "COMPLEMENTO",
      "ENDERECO",
      "ESTADO",
      "NUMERO",
    ]);
    expect(Object.keys(resultado)).not.toContain("dataVisita");
    expect(Object.keys(resultado)).not.toContain("data");
  });

  // The raw token is never persisted, so lookup must go through its SHA-256 hash.
  it("looks the notification up by the token hash, never by the raw token", async () => {
    await VisitaConfirmacaoService.trocarToken(RAW_TOKEN, AGORA);

    expect(notifRepo.findOne).toHaveBeenCalledWith({
      where: { TOKEN_HASH: hashToken(RAW_TOKEN) },
    });
  });

  // AC15: "...SHALL allow the same link token to be exchanged for a fresh JWT
  // on every call to GET /visita/{token}".
  it("issues a fresh JWT on every exchange of a live token", async () => {
    const primeiro = await VisitaConfirmacaoService.trocarToken(RAW_TOKEN, AGORA);
    const segundo = await VisitaConfirmacaoService.trocarToken(RAW_TOKEN, AGORA);

    expect(primeiro.state).toBe("PENDING");
    expect(segundo.state).toBe("PENDING");
    expect(verificarJwt((segundo as { jwt: string }).jwt).ID_NOTIFICACAO_VISITA).toBe(
      ID_NOTIFICACAO
    );
  });

  // AC18: "IF the linked NotificacaoVisita STATUS is already CONFIRMADO THEN
  // ... a distinct ALREADY_CONFIRMED state (including CONFIRMADO_EM) and SHALL
  // NOT issue a JWT."
  it("returns ALREADY_CONFIRMED with CONFIRMADO_EM and no JWT", async () => {
    const confirmadoEm = new Date("2026-08-04T10:00:00.000Z");
    notifRepo.findOne.mockResolvedValue(
      new NotificacaoVisita({
        ...notificacaoEnviada(),
        STATUS: StatusNotificacaoVisita.CONFIRMADO,
        CONFIRMADO_EM: confirmadoEm,
      })
    );

    const resultado = await VisitaConfirmacaoService.trocarToken(RAW_TOKEN, AGORA);

    expect(resultado).toEqual({
      state: "ALREADY_CONFIRMED",
      oficinaNome: "Auto Center Silva",
      confirmadoEm,
    });
    expect(resultado).not.toHaveProperty("jwt");
  });

  // AC17: "IF the linked NotificacaoVisita's EXPIRA_EM has passed THEN ...
  // a distinct EXPIRED state, and SHALL NOT issue a JWT."
  it("returns EXPIRED without a JWT once EXPIRA_EM has passed", async () => {
    const depoisDaExpiracao = new Date("2026-08-07T12:00:00.001Z");

    const resultado = await VisitaConfirmacaoService.trocarToken(RAW_TOKEN, depoisDaExpiracao);

    expect(resultado).toEqual({ state: "EXPIRED" });
    expect(resultado).not.toHaveProperty("jwt");
  });

  // AC22: expiry is "derived at read time ... rather than from a stored
  // transition" — this read path must not write the STATUS column.
  it("does not mutate the stored STATUS when reporting EXPIRED", async () => {
    const depoisDaExpiracao = new Date("2026-08-07T12:00:00.001Z");

    await VisitaConfirmacaoService.trocarToken(RAW_TOKEN, depoisDaExpiracao);

    expect(notifRepo.update).not.toHaveBeenCalled();
    expect(notifRepo.save).not.toHaveBeenCalled();
  });

  // AC16: "IF the link token is malformed or fails signature verification THEN
  // ... a distinct TOKEN_INVALID state and SHALL NOT issue a JWT."
  it("returns TOKEN_INVALID for an unrecognised token hash", async () => {
    notifRepo.findOne.mockResolvedValue(null);

    const resultado = await VisitaConfirmacaoService.trocarToken("desconhecido", AGORA);

    expect(resultado).toEqual({ state: "TOKEN_INVALID" });
  });

  it("returns TOKEN_INVALID for an empty token without querying the database", async () => {
    const resultado = await VisitaConfirmacaoService.trocarToken("   ", AGORA);

    expect(resultado).toEqual({ state: "TOKEN_INVALID" });
    expect(notifRepo.findOne).not.toHaveBeenCalled();
  });

  // AC14 exchanges only a notification whose STATUS is ENVIADO; a row that was
  // never dispatched has no delivered link to open.
  it.each([
    StatusNotificacaoVisita.PENDENTE,
    StatusNotificacaoVisita.FALHOU,
    StatusNotificacaoVisita.DISPENSADO,
  ])("returns TOKEN_INVALID and no JWT for a %s notification", async (status) => {
    notifRepo.findOne.mockResolvedValue(
      new NotificacaoVisita({ ...notificacaoEnviada(), STATUS: status })
    );

    const resultado = await VisitaConfirmacaoService.trocarToken(RAW_TOKEN, AGORA);

    expect(resultado).toEqual({ state: "TOKEN_INVALID" });
  });
});

describe("VisitaConfirmacaoService.confirmar", () => {
  let notifRepo: { findOne: jest.Mock; update: jest.Mock };

  const IP = "203.0.113.7";

  const payload: VisitaJwtPayload = {
    sub: ID_USUARIO,
    ID_NOTIFICACAO_VISITA: ID_NOTIFICACAO,
    ID_ROTA_PROMOTOR: ID_ROTA,
    scope: VISITA_SCOPE,
  };

  const linhaConfirmada = (confirmadoEm: Date) =>
    new NotificacaoVisita({
      ID_NOTIFICACAO_VISITA: ID_NOTIFICACAO,
      ID_ROTA_PROMOTOR: ID_ROTA,
      ID_USUARIO,
      STATUS: StatusNotificacaoVisita.CONFIRMADO,
      CONFIRMADO_EM: confirmadoEm,
    });

  beforeEach(() => {
    notifRepo = {
      findOne: jest.fn(async () => null),
      update: jest.fn(async () => ({ affected: 1 })),
    };

    (AppDataSourceSync.getRepository as jest.Mock).mockImplementation((entidade: unknown) => {
      if (entidade === NotificacaoVisita) return notifRepo;
      throw new Error("repositório inesperado no teste");
    });
  });

  // AC19: "...SHALL atomically transition it to CONFIRMADO, setting on that
  // same row CONFIRMADO_EM (timestamp), CONFIRMADO_POR (= the JWT's
  // sub/ID_USUARIO), and CONFIRMADO_IP (source IP of the request)."
  it("transitions to CONFIRMADO and writes all three audit fields", async () => {
    const resultado = await VisitaConfirmacaoService.confirmar(payload, IP, AGORA);

    expect(resultado).toEqual({
      state: "CONFIRMED",
      confirmadoEm: AGORA,
      enderecoAtualizado: false,
    });
    expect(notifRepo.update).toHaveBeenCalledWith(expect.anything(), {
      STATUS: StatusNotificacaoVisita.CONFIRMADO,
      CONFIRMADO_EM: AGORA,
      CONFIRMADO_POR: ID_USUARIO,
      CONFIRMADO_IP: IP,
    });
  });

  // AC19: "re-check the linked NotificacaoVisita is still STATUS ENVIADO and
  // unexpired" — both conditions must live in the guarded UPDATE itself.
  it("guards the update on STATUS ENVIADO and an unexpired EXPIRA_EM", async () => {
    await VisitaConfirmacaoService.confirmar(payload, IP, AGORA);

    expect(notifRepo.update).toHaveBeenCalledWith(
      {
        ID_NOTIFICACAO_VISITA: ID_NOTIFICACAO,
        STATUS: StatusNotificacaoVisita.ENVIADO,
        EXPIRA_EM: MoreThan(AGORA),
      },
      expect.anything()
    );
  });

  // Spec edge case: "IF a JWT was validly issued before EXPIRA_EM passed but is
  // presented to POST /visita/confirmar after it has passed THEN the system
  // SHALL still reject it."
  it("rejects a JWT issued before expiry but presented after it", async () => {
    notifRepo.update.mockResolvedValue({ affected: 0 });
    notifRepo.findOne.mockResolvedValue(
      new NotificacaoVisita({
        ID_NOTIFICACAO_VISITA: ID_NOTIFICACAO,
        STATUS: StatusNotificacaoVisita.ENVIADO,
        EXPIRA_EM: new Date("2026-08-05T11:59:59.999Z"),
      })
    );

    const resultado = await VisitaConfirmacaoService.confirmar(payload, IP, AGORA);

    expect(resultado).toEqual({ state: "EXPIRED" });
  });

  // AC20: "IF ... its linked NotificacaoVisita is no longer ENVIADO THEN the
  // system SHALL reject the confirmation, return an ALREADY_CONFIRMED ...
  // response as appropriate, and SHALL NOT alter STATUS."
  it("returns ALREADY_CONFIRMED with the original CONFIRMADO_EM when the row is already confirmed", async () => {
    const confirmadoEm = new Date("2026-08-04T10:00:00.000Z");
    notifRepo.update.mockResolvedValue({ affected: 0 });
    notifRepo.findOne.mockResolvedValue(linhaConfirmada(confirmadoEm));

    const resultado = await VisitaConfirmacaoService.confirmar(payload, IP, AGORA);

    expect(resultado).toEqual({ state: "ALREADY_CONFIRMED", confirmadoEm });
  });

  it("returns TOKEN_INVALID when the notification no longer exists", async () => {
    notifRepo.update.mockResolvedValue({ affected: 0 });
    notifRepo.findOne.mockResolvedValue(null);

    const resultado = await VisitaConfirmacaoService.confirmar(payload, IP, AGORA);

    expect(resultado).toEqual({ state: "TOKEN_INVALID" });
  });

  // AC20: a rejected confirmation must never be reported as a success.
  it("never reports CONFIRMED when the guarded update affects zero rows", async () => {
    notifRepo.update.mockResolvedValue({ affected: 0 });
    notifRepo.findOne.mockResolvedValue(linhaConfirmada(new Date("2026-08-04T10:00:00.000Z")));

    const resultado = await VisitaConfirmacaoService.confirmar(payload, IP, AGORA);

    expect(resultado.state).not.toBe("CONFIRMED");
  });

  // AC21: "IF two POST /visita/confirmar requests for the same
  // NotificacaoVisita are received concurrently THEN the system SHALL apply
  // exactly one CONFIRMADO transition and SHALL return an ALREADY_CONFIRMED
  // response to the other."
  it("applies exactly one transition for two concurrent confirmations", async () => {
    let confirmada = false;
    notifRepo.update.mockImplementation(async () => {
      if (confirmada) return { affected: 0 };
      confirmada = true;
      return { affected: 1 };
    });
    notifRepo.findOne.mockImplementation(async () => linhaConfirmada(AGORA));

    const [primeiro, segundo] = await Promise.all([
      VisitaConfirmacaoService.confirmar(payload, IP, AGORA),
      VisitaConfirmacaoService.confirmar(payload, "198.51.100.9", AGORA),
    ]);

    const estados = [primeiro.state, segundo.state].sort();
    expect(estados).toEqual(["ALREADY_CONFIRMED", "CONFIRMED"]);
  });
});
