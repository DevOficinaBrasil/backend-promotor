import VisitaConfirmacaoService from "../../service/visitaConfirmacaoService";
import RotaService from "../../service/rotaService";
import { AppDataSourceSync } from "../../data-source";
import NotificacaoVisita, { StatusNotificacaoVisita } from "../../entities/NotificacaoVisita";
import Oficina from "../../entities/Oficina";
import Empresa from "../../entities/CadastroEmpresa";
import RotaPromotor from "../../entities/RotaPromotor";
import Community from "../../entities/Community";
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
const EMPRESA_SLUG = "authomix";
const RAW_TOKEN = "token-de-teste-opaco";

const AGORA = new Date("2026-08-05T12:00:00.000Z");

describe("VisitaConfirmacaoService.trocarToken", () => {
  let notifRepo: { findOne: jest.Mock; update: jest.Mock; save: jest.Mock };
  let rotaRepo: { findOne: jest.Mock };
  let oficinaRepo: { findOne: jest.Mock };
  let communityRepo: { findOne: jest.Mock };

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
    process.env.VISITA_TOKEN_SECRET = "segredo-de-teste";

    notifRepo = {
      findOne: jest.fn(async () => notificacaoEnviada()),
      update: jest.fn(),
      save: jest.fn(),
    };
    rotaRepo = {
      findOne: jest.fn(async () => ({ ID_ROTA_PROMOTOR: ID_ROTA, ID_OFICINA }) as RotaPromotor),
    };
    oficinaRepo = { findOne: jest.fn(async () => oficinaPadrao) };
    communityRepo = { findOne: jest.fn(async () => ({ CommunityID: 17, Nome: "Authomix" })) };

    (AppDataSourceSync.getRepository as jest.Mock).mockImplementation((entidade: unknown) => {
      if (entidade === NotificacaoVisita) return notifRepo;
      if (entidade === RotaPromotor) return rotaRepo;
      if (entidade === Oficina) return oficinaRepo;
      if (entidade === Community) return communityRepo;
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

    it("returns the company the campaign runs for, resolved by EMPRESA_SLUG", async () => {
      rotaRepo.findOne.mockResolvedValue({
        ID_ROTA_PROMOTOR: ID_ROTA,
        ID_OFICINA,
        campanhaPromotor: {
          promotor: { NOME: "Carlos Promotor" },
          campanha: { EMPRESA_SLUG },
        },
      } as unknown as RotaPromotor);

      const resultado = await VisitaConfirmacaoService.trocarToken(RAW_TOKEN, AGORA);

      expect(communityRepo.findOne).toHaveBeenCalledWith({
        where: { EmpresaSlug: EMPRESA_SLUG },
      });
      expect(resultado).toMatchObject({ state: "PENDING", empresaNome: "Authomix" });
    });

    it("returns a null company name when the campaign carries no EMPRESA_SLUG", async () => {
      rotaRepo.findOne.mockResolvedValue({
        ID_ROTA_PROMOTOR: ID_ROTA,
        ID_OFICINA,
        campanhaPromotor: { promotor: { NOME: "Carlos Promotor" }, campanha: {} },
      } as unknown as RotaPromotor);

      const resultado = await VisitaConfirmacaoService.trocarToken(RAW_TOKEN, AGORA);

      expect(resultado).toMatchObject({ state: "PENDING", empresaNome: null });
      expect(communityRepo.findOne).not.toHaveBeenCalled();
    });

    it("returns a null company name when the community row is gone", async () => {
      rotaRepo.findOne.mockResolvedValue({
        ID_ROTA_PROMOTOR: ID_ROTA,
        ID_OFICINA,
        campanhaPromotor: {
          promotor: { NOME: "Carlos Promotor" },
          campanha: { EMPRESA_SLUG },
        },
      } as unknown as RotaPromotor);
      communityRepo.findOne.mockResolvedValue(null);

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
      promotorNome: null,
      endereco: {
        ENDERECO: "Rua das Oficinas",
        NUMERO: "1234",
        COMPLEMENTO: "Galpão 2",
        BAIRRO: "Vila Industrial",
        CIDADE: "São Paulo",
        ESTADO: "SP",
        CEP: "01234-567",
      },
      confirmadoEm,
    });
    expect(resultado).not.toHaveProperty("jwt");
  });

  // The confirmed screen restates who is coming, so the promoter's name has to
  // survive the CONFIRMADO branch the same way it does the PENDING one.
  it("returns the promoter's name on the ALREADY_CONFIRMED branch", async () => {
    notifRepo.findOne.mockResolvedValue(
      new NotificacaoVisita({
        ...notificacaoEnviada(),
        STATUS: StatusNotificacaoVisita.CONFIRMADO,
        CONFIRMADO_EM: new Date("2026-08-04T10:00:00.000Z"),
      })
    );
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

    expect(resultado).toMatchObject({
      state: "ALREADY_CONFIRMED",
      promotorNome: "Carlos Promotor",
    });
  });

  // A gap in the registry must degrade to empty fields, never to a failed
  // exchange — same rule the PENDING branch already follows.
  it("returns null address fields on ALREADY_CONFIRMED when the workshop is missing", async () => {
    notifRepo.findOne.mockResolvedValue(
      new NotificacaoVisita({
        ...notificacaoEnviada(),
        STATUS: StatusNotificacaoVisita.CONFIRMADO,
        CONFIRMADO_EM: new Date("2026-08-04T10:00:00.000Z"),
      })
    );
    oficinaRepo.findOne.mockResolvedValue(null);

    const resultado = await VisitaConfirmacaoService.trocarToken(RAW_TOKEN, AGORA);

    expect(resultado).toMatchObject({
      state: "ALREADY_CONFIRMED",
      oficinaNome: null,
      endereco: {
        ENDERECO: null,
        NUMERO: null,
        COMPLEMENTO: null,
        BAIRRO: null,
        CIDADE: null,
        ESTADO: null,
        CEP: null,
      },
    });
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
  let empresaRepo: { update: jest.Mock };
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
    empresaRepo = {
      update: jest.fn(async () => {
        ordemDeChamadas.push("empresa");
        return { affected: 1 };
      }),
    };

    (AppDataSourceSync.getRepository as jest.Mock).mockImplementation((entidade: unknown) => {
      if (entidade === NotificacaoVisita) return notifRepo;
      if (entidade === RotaPromotor) return rotaRepo;
      if (entidade === Oficina) return oficinaRepo;
      if (entidade === Empresa) return empresaRepo;
      throw new Error("repositório inesperado no teste");
    });

    // The manager handed to the transaction routes each update to the entity's
    // repository, so a rejected update propagates out of the transaction the
    // way a real rollback does.
    (AppDataSourceSync.transaction as jest.Mock).mockImplementation(
      async (executar: (manager: unknown) => Promise<unknown>) => {
        ordemDeChamadas.push("transacao:inicio");
        const manager = {
          update: (entidade: unknown, criterio: unknown, valores: unknown) =>
            (AppDataSourceSync.getRepository as jest.Mock)(entidade).update(criterio, valores),
        };
        return await executar(manager);
      }
    );

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

  // Design: "the address write happens first and must succeed".
  // VISIB-07: both writes live inside a single transaction, before the transition.
  it("writes both address rows inside one transaction before transitioning the notification", async () => {
    await VisitaConfirmacaoService.atualizarEndereco(payload, enderecoCorrigido, IP, AGORA);

    expect(ordemDeChamadas).toEqual([
      "transacao:inicio",
      "oficina",
      "empresa",
      "notificacao",
    ]);
  });

  // VISIB-07 / P1 endereço AC1: "SHALL atualizar MAIN_REGISTER.OFICINA e
  // dw.cadastro_empresa para a mesma oficina, dentro de uma única transação."
  describe("escrita em dw.cadastro_empresa (VISIB-07, VISIB-08, VISIB-11)", () => {
    it("grava o endereço dividido usando as propriedades da entity, não os nomes das colunas", async () => {
      await VisitaConfirmacaoService.atualizarEndereco(payload, enderecoCorrigido, IP, AGORA);

      expect(empresaRepo.update).toHaveBeenCalledWith(
        { ID_OFICINA },
        {
          LOGRADOURO: "Avenida",
          ENDERECO: "Nova",
          NUMERO: "500",
          COMPLEMENTO: null,
          BAIRRO: "Centro",
          CIDADE: "Campinas",
          ESTADO: "SP",
          CEP: "13010-000",
        }
      );

      const escrito = empresaRepo.update.mock.calls[0][1] as Record<string, unknown>;
      // As colunas do dw são `logradouro` e `rua`; passar esses nomes seria
      // ignorado em silêncio pelo TypeORM.
      expect(escrito).not.toHaveProperty("logradouro");
      expect(escrito).not.toHaveProperty("rua");
    });

    // AC4 do split: primeiro token desconhecido -> logradouro nulo, string inteira em rua.
    it("grava logradouro nulo e a string inteira quando o tipo não é reconhecido", async () => {
      await VisitaConfirmacaoService.atualizarEndereco(
        payload,
        { ...enderecoCorrigido, ENDERECO: "Chacara do Ze" },
        IP,
        AGORA
      );

      const escrito = empresaRepo.update.mock.calls[0][1] as Record<string, unknown>;
      expect(escrito.LOGRADOURO).toBeNull();
      expect(escrito.ENDERECO).toBe("Chacara do Ze");
    });

    // AC7: "SHALL NOT alterar dw.cadastro_empresa.latitude e .longitude".
    it("não toca em LATITUDE nem LONGITUDE", async () => {
      await VisitaConfirmacaoService.atualizarEndereco(payload, enderecoCorrigido, IP, AGORA);

      const escrito = empresaRepo.update.mock.calls[0][1] as Record<string, unknown>;
      expect(escrito).not.toHaveProperty("LATITUDE");
      expect(escrito).not.toHaveProperty("LONGITUDE");
    });

    // Edge case: "IF a oficina não tem linha em dw.cadastro_empresa THEN ...
    // SHALL NOT falhar a confirmação por causa da linha ausente no dw."
    it("confirma a visita mesmo quando o update no dw afeta 0 linhas", async () => {
      empresaRepo.update.mockResolvedValue({ affected: 0 });

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
    });
  });

  // VISIB-13 / AC2: "IF a atualização de qualquer uma das duas tabelas falha
  // THEN o sistema SHALL reverter ambas, SHALL NOT registrar a confirmação, e
  // SHALL responder 500 com error ADDRESS_UPDATE_FAILED."
  describe("falha parcial reverte as duas escritas (VISIB-13)", () => {
    it("devolve ADDRESS_UPDATE_FAILED e não confirma quando o update no dw falha", async () => {
      empresaRepo.update.mockRejectedValue(
        new Error('permission denied for table "cadastro_empresa"')
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

    it("propaga o erro para fora da transação, para o rollback alcançar as duas tabelas", async () => {
      empresaRepo.update.mockRejectedValue(new Error("deadlock detected"));

      await VisitaConfirmacaoService.atualizarEndereco(payload, enderecoCorrigido, IP, AGORA);

      const executarTransacao = (AppDataSourceSync.transaction as jest.Mock).mock.results[0]
        .value as Promise<unknown>;
      await expect(executarTransacao).rejects.toThrow("deadlock detected");
    });

    it("não grava no dw quando o update em OFICINA falha antes", async () => {
      oficinaRepo.update.mockRejectedValue(new Error("permission denied"));

      const resultado = await VisitaConfirmacaoService.atualizarEndereco(
        payload,
        enderecoCorrigido,
        IP,
        AGORA
      );

      expect(resultado).toEqual({ state: "ADDRESS_UPDATE_FAILED" });
      expect(empresaRepo.update).not.toHaveBeenCalled();
      expect(notifRepo.update).not.toHaveBeenCalled();
    });
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

      expect(ordemDeChamadas).toEqual([
        "transacao:inicio",
        "oficina",
        "empresa",
        "notificacao",
        "reassign",
      ]);
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
