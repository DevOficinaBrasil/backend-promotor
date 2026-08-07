import VisitaConfirmacaoService from "../../service/visitaConfirmacaoService";
import RotaService from "../../service/rotaService";
import { AppDataSourceSync } from "../../data-source";
import NotificacaoVisita, { StatusNotificacaoVisita } from "../../entities/NotificacaoVisita";
import Oficina from "../../entities/Oficina";
import RotaPromotor from "../../entities/RotaPromotor";
import Clientes from "../../entities/Clientes";
import {
  hashToken,
  verificarJwt,
  VisitaJwtPayload,
  VISITA_SCOPE,
} from "../../utils/visitaToken";
import { MoreThan } from "typeorm";

jest.mock("../../data-source");
jest.mock("../../service/rotaService", () => ({
  __esModule: true,
  default: { reassignRotasByAddress: jest.fn() },
}));

const ID_NOTIFICACAO = 55;
const ID_ROTA = 42;
const ID_OFICINA = 900;
const ID_USUARIO = 7;
const ID_CLIENT = 31;
const RAW_TOKEN = "token-de-teste-opaco";

const AGORA = new Date("2026-08-05T12:00:00.000Z");

describe("VisitaConfirmacaoService.trocarToken", () => {
  let notifRepo: { findOne: jest.Mock; update: jest.Mock; save: jest.Mock };
  let rotaRepo: { findOne: jest.Mock };
  let oficinaRepo: { findOne: jest.Mock };
  let clientesRepo: { findOne: jest.Mock };

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
    clientesRepo = { findOne: jest.fn(async () => ({ ID: ID_CLIENT, NOME: "Bosch Brasil" })) };

    (AppDataSourceSync.getRepository as jest.Mock).mockImplementation((entidade: unknown) => {
      if (entidade === NotificacaoVisita) return notifRepo;
      if (entidade === RotaPromotor) return rotaRepo;
      if (entidade === Oficina) return oficinaRepo;
      if (entidade === Clientes) return clientesRepo;
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

  // The reparador needs to know who is coming, so the page names the promoter
  // assigned to the route.
  describe("visiting promoter", () => {
    it("returns the promoter's name for the route", async () => {
      rotaRepo.findOne.mockImplementation(async (opcoes: { relations?: string[] }) =>
        opcoes.relations === undefined
          ? ({ ID_ROTA_PROMOTOR: ID_ROTA, ID_OFICINA } as RotaPromotor)
          : ({
              ID_ROTA_PROMOTOR: ID_ROTA,
              ID_OFICINA,
              campanhaPromotor: { promotor: { NOME: "Carlos Promotor" } },
            } as unknown as RotaPromotor)
      );

      const resultado = await VisitaConfirmacaoService.trocarToken(RAW_TOKEN, AGORA);

      expect(resultado).toMatchObject({ state: "PENDING", promotorNome: "Carlos Promotor" });
    });

    it("loads the promoter through the campanhaPromotor relation", async () => {
      await VisitaConfirmacaoService.trocarToken(RAW_TOKEN, AGORA);

      expect(rotaRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: [
            "campanhaPromotor",
            "campanhaPromotor.promotor",
            "campanhaPromotor.campanha",
          ],
        })
      );
    });

    // The link must keep working even when the promoter cannot be resolved.
    it("returns a null promoter name instead of failing when the relation is missing", async () => {
      rotaRepo.findOne.mockResolvedValue({
        ID_ROTA_PROMOTOR: ID_ROTA,
        ID_OFICINA,
      } as RotaPromotor);

      const resultado = await VisitaConfirmacaoService.trocarToken(RAW_TOKEN, AGORA);

      expect(resultado).toMatchObject({ state: "PENDING", promotorNome: null });
    });

    it("returns the client company the campaign runs for", async () => {
      rotaRepo.findOne.mockResolvedValue({
        ID_ROTA_PROMOTOR: ID_ROTA,
        ID_OFICINA,
        campanhaPromotor: {
          promotor: { NOME: "Carlos Promotor" },
          campanha: { ID_CLIENT: ID_CLIENT },
        },
      } as unknown as RotaPromotor);

      const resultado = await VisitaConfirmacaoService.trocarToken(RAW_TOKEN, AGORA);

      expect(clientesRepo.findOne).toHaveBeenCalledWith({ where: { ID: ID_CLIENT } });
      expect(resultado).toMatchObject({ state: "PENDING", empresaNome: "Bosch Brasil" });
    });

    it("returns a null company name when the campaign carries no ID_CLIENT", async () => {
      rotaRepo.findOne.mockResolvedValue({
        ID_ROTA_PROMOTOR: ID_ROTA,
        ID_OFICINA,
        campanhaPromotor: { promotor: { NOME: "Carlos Promotor" }, campanha: {} },
      } as unknown as RotaPromotor);

      const resultado = await VisitaConfirmacaoService.trocarToken(RAW_TOKEN, AGORA);

      expect(resultado).toMatchObject({ state: "PENDING", empresaNome: null });
      expect(clientesRepo.findOne).not.toHaveBeenCalled();
    });

    it("returns a null company name when the client row is gone", async () => {
      rotaRepo.findOne.mockResolvedValue({
        ID_ROTA_PROMOTOR: ID_ROTA,
        ID_OFICINA,
        campanhaPromotor: {
          promotor: { NOME: "Carlos Promotor" },
          campanha: { ID_CLIENT: ID_CLIENT },
        },
      } as unknown as RotaPromotor);
      clientesRepo.findOne.mockResolvedValue(null);

      const resultado = await VisitaConfirmacaoService.trocarToken(RAW_TOKEN, AGORA);

      expect(resultado).toMatchObject({ state: "PENDING", empresaNome: null });
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

describe("VisitaConfirmacaoService.atualizarEndereco", () => {
  let notifRepo: { findOne: jest.Mock; update: jest.Mock };
  let rotaRepo: { findOne: jest.Mock };
  let oficinaRepo: { findOne: jest.Mock; update: jest.Mock };
  let ordemDeChamadas: string[];

  const IP = "203.0.113.7";

  const payload: VisitaJwtPayload = {
    sub: ID_USUARIO,
    ID_NOTIFICACAO_VISITA: ID_NOTIFICACAO,
    ID_ROTA_PROMOTOR: ID_ROTA,
    scope: VISITA_SCOPE,
  };

  const enderecoCorrigido = {
    ENDERECO: "Avenida Nova",
    NUMERO: "500",
    COMPLEMENTO: null,
    BAIRRO: "Centro",
    CIDADE: "Campinas",
    ESTADO: "SP",
    CEP: "13010-000",
  };

  const notificacaoEnviada = () =>
    new NotificacaoVisita({
      ID_NOTIFICACAO_VISITA: ID_NOTIFICACAO,
      ID_ROTA_PROMOTOR: ID_ROTA,
      ID_USUARIO,
      STATUS: StatusNotificacaoVisita.ENVIADO,
      EXPIRA_EM: new Date("2026-08-07T12:00:00.000Z"),
    });

  beforeEach(() => {
    ordemDeChamadas = [];

    notifRepo = {
      findOne: jest.fn(async () => notificacaoEnviada()),
      update: jest.fn(async () => {
        ordemDeChamadas.push("notificacao");
        return { affected: 1 };
      }),
    };
    rotaRepo = {
      findOne: jest.fn(async () => ({ ID_ROTA_PROMOTOR: ID_ROTA, ID_OFICINA }) as RotaPromotor),
    };
    oficinaRepo = {
      findOne: jest.fn(async () => ({ ID_OFICINA }) as Oficina),
      update: jest.fn(async () => {
        ordemDeChamadas.push("oficina");
        return { affected: 1 };
      }),
    };

    (AppDataSourceSync.getRepository as jest.Mock).mockImplementation((entidade: unknown) => {
      if (entidade === NotificacaoVisita) return notifRepo;
      if (entidade === RotaPromotor) return rotaRepo;
      if (entidade === Oficina) return oficinaRepo;
      throw new Error("repositório inesperado no teste");
    });

    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // AC31: "...SHALL apply the same ENVIADO→CONFIRMADO transition and audit
  // fields as AC19, and SHALL set ENDERECO_ATUALIZADO to true."
  it("confirms the visit and flags ENDERECO_ATUALIZADO on success", async () => {
    const resultado = await VisitaConfirmacaoService.atualizarEndereco(
      payload,
      enderecoCorrigido,
      IP,
      AGORA
    );

    expect(resultado).toEqual({
      state: "CONFIRMED",
      confirmadoEm: AGORA,
      enderecoAtualizado: true,
    });
    expect(notifRepo.update).toHaveBeenCalledWith(expect.anything(), {
      STATUS: StatusNotificacaoVisita.CONFIRMADO,
      CONFIRMADO_EM: AGORA,
      CONFIRMADO_POR: ID_USUARIO,
      CONFIRMADO_IP: IP,
      ENDERECO_ATUALIZADO: true,
    });
  });

  // AC31: "...SHALL update only the address columns of the linked
  // MAIN_REGISTER.OFICINA row." Coordinates are left as-is by design.
  it("writes only the seven address columns to the Oficina row", async () => {
    await VisitaConfirmacaoService.atualizarEndereco(payload, enderecoCorrigido, IP, AGORA);

    expect(oficinaRepo.update).toHaveBeenCalledWith({ ID_OFICINA }, enderecoCorrigido);

    const escrito = oficinaRepo.update.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(escrito).sort()).toEqual([
      "BAIRRO",
      "CEP",
      "CIDADE",
      "COMPLEMENTO",
      "ENDERECO",
      "ESTADO",
      "NUMERO",
    ]);
    expect(escrito).not.toHaveProperty("LATITUDE");
    expect(escrito).not.toHaveProperty("LONGITUDE");
  });

  // AC32: "IF a PUT /visita/endereco request carries any field outside the
  // address column allowlist THEN the system SHALL reject the request with a
  // validation error and SHALL NOT write to Oficina."
  it("rejects a payload carrying CNPJ, TELEFONE or STATUS without writing to Oficina", async () => {
    const resultado = await VisitaConfirmacaoService.atualizarEndereco(
      payload,
      {
        ...enderecoCorrigido,
        CNPJ: "99999999000199",
        TELEFONE: "11999998888",
        STATUS: "ATIVO",
      },
      IP,
      AGORA
    );

    expect(resultado).toEqual({
      state: "VALIDATION_ERROR",
      campos: ["CNPJ", "TELEFONE", "STATUS"],
    });
    expect(oficinaRepo.update).not.toHaveBeenCalled();
    expect(notifRepo.update).not.toHaveBeenCalled();
  });

  // AC33: "IF the Oficina address update fails at the database level
  // (including a missing UPDATE grant on MAIN_REGISTER) THEN the system SHALL
  // leave NotificacaoVisita STATUS unchanged, SHALL NOT report the
  // confirmation as successful, and SHALL surface a distinct error state."
  it("returns ADDRESS_UPDATE_FAILED and leaves STATUS untouched when the grant is missing", async () => {
    oficinaRepo.update.mockRejectedValue(
      new Error('permission denied for table "OFICINA"')
    );

    const resultado = await VisitaConfirmacaoService.atualizarEndereco(
      payload,
      enderecoCorrigido,
      IP,
      AGORA
    );

    expect(resultado).toEqual({ state: "ADDRESS_UPDATE_FAILED" });
    expect(notifRepo.update).not.toHaveBeenCalled();
  });

  it("never reports CONFIRMED when the Oficina write fails", async () => {
    oficinaRepo.update.mockRejectedValue(new Error("permission denied"));

    const resultado = await VisitaConfirmacaoService.atualizarEndereco(
      payload,
      enderecoCorrigido,
      IP,
      AGORA
    );

    expect(resultado.state).not.toBe("CONFIRMED");
  });

  // Design: "the Oficina write happens first and must succeed".
  it("writes the Oficina row before transitioning the notification", async () => {
    await VisitaConfirmacaoService.atualizarEndereco(payload, enderecoCorrigido, IP, AGORA);

    expect(ordemDeChamadas).toEqual(["oficina", "notificacao"]);
  });

  // AC31 applies "the same transition as AC19", so AC20's rejection rules hold:
  // a visit that is no longer ENVIADO must not confirm — nor write the registry.
  it("returns ALREADY_CONFIRMED without touching Oficina when the visit is confirmed", async () => {
    const confirmadoEm = new Date("2026-08-04T10:00:00.000Z");
    notifRepo.findOne.mockResolvedValue(
      new NotificacaoVisita({
        ...notificacaoEnviada(),
        STATUS: StatusNotificacaoVisita.CONFIRMADO,
        CONFIRMADO_EM: confirmadoEm,
      })
    );

    const resultado = await VisitaConfirmacaoService.atualizarEndereco(
      payload,
      enderecoCorrigido,
      IP,
      AGORA
    );

    expect(resultado).toEqual({ state: "ALREADY_CONFIRMED", confirmadoEm });
    expect(oficinaRepo.update).not.toHaveBeenCalled();
  });

  it("returns EXPIRED without touching Oficina once EXPIRA_EM has passed", async () => {
    const depoisDaExpiracao = new Date("2026-08-07T12:00:00.001Z");

    const resultado = await VisitaConfirmacaoService.atualizarEndereco(
      payload,
      enderecoCorrigido,
      IP,
      depoisDaExpiracao
    );

    expect(resultado).toEqual({ state: "EXPIRED" });
    expect(oficinaRepo.update).not.toHaveBeenCalled();
  });

  // A corrected CEP moves the workshop on the map, so promoter assignment is
  // re-evaluated against the new coordinates.
  describe("promoter reassignment after a corrected CEP", () => {
    const reassign = RotaService.reassignRotasByAddress as jest.Mock;

    beforeEach(() => {
      reassign.mockReset();
      reassign.mockResolvedValue({
        resumo: { mantidas: 0, reatribuidas: 1, sem_promotor_disponivel: 0 },
      });
      jest.spyOn(console, "log").mockImplementation(() => {});
    });

    it("reassigns routes using the corrected CEP", async () => {
      oficinaRepo.findOne.mockResolvedValue({ ID_OFICINA, CEP: "01001-000" } as Oficina);

      const resultado = await VisitaConfirmacaoService.atualizarEndereco(
        payload,
        enderecoCorrigido,
        IP,
        AGORA
      );

      expect(resultado).toMatchObject({ state: "CONFIRMED", enderecoAtualizado: true });
      expect(reassign).toHaveBeenCalledTimes(1);
      expect(reassign).toHaveBeenCalledWith("13010-000", ID_OFICINA);
    });

    it("reassigns only after the CONFIRMADO transition is persisted", async () => {
      oficinaRepo.findOne.mockResolvedValue({ ID_OFICINA, CEP: "01001-000" } as Oficina);
      reassign.mockImplementation(async () => {
        ordemDeChamadas.push("reassign");
        return { resumo: { mantidas: 0, reatribuidas: 0, sem_promotor_disponivel: 0 } };
      });

      await VisitaConfirmacaoService.atualizarEndereco(payload, enderecoCorrigido, IP, AGORA);

      expect(ordemDeChamadas).toEqual(["oficina", "notificacao", "reassign"]);
    });

    it("does not reassign when the CEP is unchanged", async () => {
      oficinaRepo.findOne.mockResolvedValue({ ID_OFICINA, CEP: "13010-000" } as Oficina);

      const resultado = await VisitaConfirmacaoService.atualizarEndereco(
        payload,
        { ...enderecoCorrigido, CEP: "13010-000" },
        IP,
        AGORA
      );

      expect(resultado).toMatchObject({ state: "CONFIRMED" });
      expect(reassign).not.toHaveBeenCalled();
    });

    it("does not reassign when the confirmation did not go through", async () => {
      oficinaRepo.findOne.mockResolvedValue({ ID_OFICINA, CEP: "01001-000" } as Oficina);
      // The conditional UPDATE matches nothing: someone confirmed first.
      notifRepo.update.mockResolvedValue({ affected: 0 });
      notifRepo.findOne
        .mockResolvedValueOnce(notificacaoEnviada())
        .mockResolvedValueOnce(
          new NotificacaoVisita({
            ID_NOTIFICACAO_VISITA: ID_NOTIFICACAO,
            ID_ROTA_PROMOTOR: ID_ROTA,
            STATUS: StatusNotificacaoVisita.CONFIRMADO,
            CONFIRMADO_EM: new Date("2026-08-05T11:00:00.000Z"),
          })
        );

      const resultado = await VisitaConfirmacaoService.atualizarEndereco(
        payload,
        enderecoCorrigido,
        IP,
        AGORA
      );

      expect(resultado.state).not.toBe("CONFIRMED");
      expect(reassign).not.toHaveBeenCalled();
    });

    // The confirmation is already committed; a workshop with no BACKLOG route
    // throws NOT_FOUND and an unresolvable CEP throws too. Neither may undo it.
    it("keeps the confirmation when the reassignment throws", async () => {
      oficinaRepo.findOne.mockResolvedValue({ ID_OFICINA, CEP: "01001-000" } as Oficina);
      reassign.mockRejectedValue(new Error("NOT_FOUND"));

      const resultado = await VisitaConfirmacaoService.atualizarEndereco(
        payload,
        enderecoCorrigido,
        IP,
        AGORA
      );

      expect(resultado).toMatchObject({ state: "CONFIRMED", enderecoAtualizado: true });
    });
  });
});
