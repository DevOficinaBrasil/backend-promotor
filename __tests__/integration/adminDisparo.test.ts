import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import adminDisparoRoutes from "../../routes/AdminDisparoRoute";
import AdminDisparoService, { AdminDisparoErro } from "../../service/adminDisparoService";

// Service mockado: nenhum teste deste arquivo toca banco nem CRM. AdminDisparoErro
// continua real, porque é ele que a rota traduz para HTTP.
jest.mock("../../service/adminDisparoService", () => {
  const real = jest.requireActual("../../service/adminDisparoService");
  return {
    __esModule: true,
    ...real,
    default: {
      listarCampanhasAtivas: jest.fn(),
      listarPromotores: jest.fn(),
      listarCamposSegmentacao: jest.fn(),
      listarValoresCampo: jest.fn(),
      segmentarOficinas: jest.fn(),
      listarRotasComEstado: jest.fn(),
      criarRotas: jest.fn(),
      previaDisparo: jest.fn(),
      disparar: jest.fn(),
    },
  };
});

const service = AdminDisparoService as unknown as Record<string, jest.Mock>;

const SEGREDO = "segredo-obads-de-teste";
const ID_ADMIN = 900;

const app = express();
app.use(express.json());
app.use("/admin", adminDisparoRoutes);

const tokenAdmin = () =>
  jwt.sign({ user: { ID_USUARIO: ID_ADMIN, NOME_USUARIO: "Admin", EMAIL: "a@b.c", IS_ADMIN: true } }, SEGREDO, {
    algorithm: "HS256",
    expiresIn: "1h",
  });
const tokenNaoAdmin = () =>
  jwt.sign({ user: { ID_USUARIO: 901, IS_ADMIN: false } }, SEGREDO, { algorithm: "HS256", expiresIn: "1h" });

const regiao = { uf: "SP", cidade: "Campinas" };
const filtroSegmentacao = { if: { behavior: {} }, then: { decision: "include" }, default: { decision: "exclude" } };

// As 9 rotas do design, com um corpo válido e o que cada uma deve repassar ao service.
const ROTAS: Array<{
  nome: string;
  metodo: "get" | "post";
  url: string;
  corpo?: unknown;
  metodoService: string;
  argumentos: unknown[];
  resposta: unknown;
  esperado?: unknown;
}> = [
  {
    nome: "GET /admin/campanhas/ativas",
    metodo: "get",
    url: "/admin/campanhas/ativas",
    metodoService: "listarCampanhasAtivas",
    argumentos: [],
    resposta: [{ ID_CAMPANHA: 1, NOME: "C", clienteNome: "ZF" }],
  },
  {
    nome: "GET /admin/campanhas/:id/promotores",
    metodo: "get",
    url: "/admin/campanhas/77/promotores",
    metodoService: "listarPromotores",
    argumentos: [77],
    resposta: { vinculados: [], doCliente: [] },
  },
  {
    nome: "GET /admin/segmentacao/campos",
    metodo: "get",
    url: "/admin/segmentacao/campos",
    metodoService: "listarCamposSegmentacao",
    argumentos: [],
    resposta: { fieldOptionArray: [] },
  },
  {
    nome: "GET /admin/segmentacao/valores",
    metodo: "get",
    url: "/admin/segmentacao/valores?path=contactAttributes.gender",
    metodoService: "listarValoresCampo",
    argumentos: ["contactAttributes.gender"],
    resposta: [{ valor: "Masculino", contatos: 3 }],
    esperado: { valores: [{ valor: "Masculino", contatos: 3 }] },
  },
  {
    nome: "POST /admin/campanhas/:id/oficinas/segmentar",
    metodo: "post",
    url: "/admin/campanhas/77/oficinas/segmentar",
    corpo: { regiao, filtroSegmentacao },
    metodoService: "segmentarOficinas",
    argumentos: [77, regiao, filtroSegmentacao],
    resposta: { oficinas: [], truncado: false, total: 0 },
  },
  {
    nome: "GET /admin/campanhas/:id/rotas",
    metodo: "get",
    url: "/admin/campanhas/77/rotas?estado=agendada",
    metodoService: "listarRotasComEstado",
    argumentos: [77, "agendada"],
    resposta: { rotas: [], totaisPorEstado: {} },
  },
  {
    nome: "POST /admin/campanhas/:id/rotas",
    metodo: "post",
    url: "/admin/campanhas/77/rotas",
    corpo: { atribuicoes: [{ idCampanhaPromotor: 31, idOficina: 10 }] },
    metodoService: "criarRotas",
    argumentos: [77, { atribuicoes: [{ idCampanhaPromotor: 31, idOficina: 10 }] }, ID_ADMIN],
    resposta: { criadas: [], conflitos: [], foraDoAlcance: [] },
  },
  {
    nome: "POST /admin/campanhas/:id/disparos/previa",
    metodo: "post",
    url: "/admin/campanhas/77/disparos/previa",
    corpo: { rotaIds: [1, 2], tetoDiario: 10 },
    metodoService: "previaDisparo",
    argumentos: [77, [1, 2], 10],
    resposta: { totalConvites: 2, jaDisparadas: 0, porDia: [], ultimoDia: "2026-09-29" },
  },
  {
    nome: "POST /admin/campanhas/:id/disparos",
    metodo: "post",
    url: "/admin/campanhas/77/disparos",
    corpo: { rotaIds: [1, 2], tetoDiario: 10 },
    metodoService: "disparar",
    argumentos: [77, [1, 2], 10],
    resposta: { enfileiradas: 2, jaDisparadas: 0, porDia: [], ultimoDia: "2026-09-29" },
  },
];

const chamar = (rota: (typeof ROTAS)[number], token?: string) => {
  let req = request(app)[rota.metodo](rota.url);
  if (token) req = req.set("Authorization", `Bearer ${token}`);
  return rota.corpo === undefined ? req : req.send(rota.corpo as object);
};

beforeEach(() => {
  process.env.OBADS_JWT_SECRET = SEGREDO;
  Object.values(service).forEach((m) => m.mockReset());
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// L-002: cada rota que monta o adminAuthMiddleware tem os três casos (CONV-03, CONV-04).
describe.each(ROTAS)("$nome", (rota) => {
  it("sem token → 401 sem chamar o service", async () => {
    const r = await chamar(rota);

    expect(r.status).toBe(401);
    expect(r.body).toEqual({ message: "Token não fornecido." });
    expect(service[rota.metodoService]).not.toHaveBeenCalled();
  });

  it("token inválido → 401 sem chamar o service", async () => {
    const r = await chamar(rota, jwt.sign({ user: { IS_ADMIN: true } }, "outro-segredo"));

    expect(r.status).toBe(401);
    expect(r.body).toEqual({ message: "Token inválido ou expirado." });
    expect(service[rota.metodoService]).not.toHaveBeenCalled();
  });

  it("token de não admin → 403 sem chamar o service", async () => {
    const r = await chamar(rota, tokenNaoAdmin());

    expect(r.status).toBe(403);
    expect(r.body).toEqual({ message: "Acesso restrito a administradores." });
    expect(service[rota.metodoService]).not.toHaveBeenCalled();
  });

  it("admin → 200 com a resposta do service", async () => {
    service[rota.metodoService].mockResolvedValue(rota.resposta);

    const r = await chamar(rota, tokenAdmin());

    expect(r.status).toBe(200);
    expect(r.body).toEqual(rota.esperado ?? rota.resposta);
    expect(service[rota.metodoService]).toHaveBeenCalledWith(...rota.argumentos);
  });
});

describe("autenticação antes da validação", () => {
  it("id inválido sem token dá 401, não 400", async () => {
    const r = await request(app).get("/admin/campanhas/abc/promotores");

    expect(r.status).toBe(401);
  });

  it("id inválido com token de admin dá 400 da validação", async () => {
    const r = await request(app).get("/admin/campanhas/abc/promotores").set("Authorization", `Bearer ${tokenAdmin()}`);

    expect(r.status).toBe(400);
    expect(service.listarPromotores).not.toHaveBeenCalled();
  });

  it("OBADS_JWT_SECRET ausente → 500 sem chegar ao service", async () => {
    delete process.env.OBADS_JWT_SECRET;

    const r = await request(app).get("/admin/campanhas/ativas").set("Authorization", `Bearer ${tokenAdmin()}`);

    expect(r.status).toBe(500);
    expect(service.listarCampanhasAtivas).not.toHaveBeenCalled();
  });
});

// Erros de domínio viram o status do design, com a mensagem e os extras no corpo.
describe("mapeamento de erros de domínio", () => {
  it("400: sem região na segmentação", async () => {
    service.segmentarOficinas.mockRejectedValue(
      new AdminDisparoErro(400, "Informe a região (UF e cidade, ou CEP e raio)")
    );

    const r = await request(app)
      .post("/admin/campanhas/77/oficinas/segmentar")
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ filtroSegmentacao });

    expect(r.status).toBe(400);
    expect(r.body).toEqual({ message: "Informe a região (UF e cidade, ou CEP e raio)" });
    expect(service.segmentarOficinas).toHaveBeenCalledWith(77, undefined, filtroSegmentacao);
  });

  it("400: teto inválido no disparo", async () => {
    service.disparar.mockRejectedValue(new AdminDisparoErro(400, "Teto diário deve ser um inteiro entre 1 e 1000"));

    const r = await request(app)
      .post("/admin/campanhas/77/disparos")
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ rotaIds: [1], tetoDiario: 0 });

    expect(r.status).toBe(400);
    expect(r.body).toEqual({ message: "Teto diário deve ser um inteiro entre 1 e 1000" });
  });

  it("404: campanha inexistente", async () => {
    service.listarPromotores.mockRejectedValue(new AdminDisparoErro(404, "Campanha não encontrada"));

    const r = await request(app).get("/admin/campanhas/999/promotores").set("Authorization", `Bearer ${tokenAdmin()}`);

    expect(r.status).toBe(404);
    expect(r.body).toEqual({ message: "Campanha não encontrada" });
  });

  it("409: erro de conflito do domínio", async () => {
    service.criarRotas.mockRejectedValue(new AdminDisparoErro(409, "Oficina recusou a visita nesta campanha"));

    const r = await request(app)
      .post("/admin/campanhas/77/rotas")
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ atribuicoes: [{ idCampanhaPromotor: 31, idOficina: 10 }] });

    expect(r.status).toBe(409);
    expect(r.body).toEqual({ message: "Oficina recusou a visita nesta campanha" });
  });

  it("422: disparo passa do fim da campanha, com o teto mínimo no corpo", async () => {
    service.disparar.mockRejectedValue(
      new AdminDisparoErro(422, "O último envio cairia depois do fim da campanha", { tetoMinimo: 13 })
    );

    const r = await request(app)
      .post("/admin/campanhas/77/disparos")
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ rotaIds: [1], tetoDiario: 10 });

    expect(r.status).toBe(422);
    expect(r.body).toEqual({ message: "O último envio cairia depois do fim da campanha", tetoMinimo: 13 });
  });

  it("422 também na prévia", async () => {
    service.previaDisparo.mockRejectedValue(
      new AdminDisparoErro(422, "O último envio cairia depois do fim da campanha", { tetoMinimo: 13 })
    );

    const r = await request(app)
      .post("/admin/campanhas/77/disparos/previa")
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ rotaIds: [1], tetoDiario: 10 });

    expect(r.status).toBe(422);
    expect(r.body.tetoMinimo).toBe(13);
  });

  it("502: CRM indisponível", async () => {
    service.segmentarOficinas.mockRejectedValue(new AdminDisparoErro(502, "Segmentação indisponível"));

    const r = await request(app)
      .post("/admin/campanhas/77/oficinas/segmentar")
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ regiao, filtroSegmentacao });

    expect(r.status).toBe(502);
    expect(r.body).toEqual({ message: "Segmentação indisponível" });
  });

  it("erro inesperado → 500 genérico, sem vazar a mensagem interna", async () => {
    service.listarCampanhasAtivas.mockRejectedValue(new Error("connection terminated"));

    const r = await request(app).get("/admin/campanhas/ativas").set("Authorization", `Bearer ${tokenAdmin()}`);

    expect(r.status).toBe(500);
    expect(r.body).toEqual({ message: "Erro interno." });
  });
});
