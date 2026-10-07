import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { AppDataSourceSync } from "../../data-source";
import { usuarioService } from "../../service/usuarioService";
import { cnpjValido, qtdElevadoresParaInteiro, normalizarBusca } from "../../utils/freelancerConfirmacao";

jest.mock("../../data-source");
jest.mock("../../service/usuarioService", () => ({
  usuarioService: { getUserById: jest.fn() },
}));

const SEGREDO = "segredo-de-teste";
const ID_FREELANCER = 77;
const CNPJ_VALIDO = "11.222.333/0001-81";
const BASE = "/freelancer/confirmacao-dados";

const query = AppDataSourceSync.query as jest.Mock;
const transaction = AppDataSourceSync.transaction as jest.Mock;
const getUserById = usuarioService.getUserById as jest.Mock;

let app: express.Application;

const token = () => jwt.sign({ user: { ID_USUARIO: ID_FREELANCER, NOME: "Free", EMAIL: "f@x.com", SENHA: "x" } }, SEGREDO);
const auth = () => ({ Authorization: `Bearer ${token()}` });

const ehQueryDeRole = (sql: string) => sql.includes('"ROLE_USUARIO"');

/** query do data source: responde a role e delega o resto ao handler do teste. */
function mockQuery(handler: (sql: string, params: unknown[]) => unknown, comRole = true) {
  query.mockImplementation(async (sql: string, params: unknown[]) => {
    if (ehQueryDeRole(sql)) return comRole ? [{ "?column?": 1 }] : [];
    return handler(sql, params);
  });
}

beforeAll(() => {
  process.env.JWT_SECRET = SEGREDO;
  // JWT_SECRET é lido na carga do authMiddleware, por isso o require tardio.
  const router = require("../../routes/FreelancerConfirmacaoRoute").default;
  app = express();
  app.use(express.json());
  app.use(BASE, router);
});

beforeEach(() => {
  query.mockReset();
  transaction.mockReset();
  getUserById.mockReset();
  getUserById.mockResolvedValue({ ID_USUARIO: ID_FREELANCER });
  jest.spyOn(console, "info").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe("auth e role", () => {
  it("responde 401 sem token, antes de validar parâmetros", async () => {
    const res = await request(app).get(`${BASE}/oficinas/abc`);
    expect(res.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it("responde 403 para token inválido", async () => {
    const res = await request(app).get(`${BASE}/oficinas`).set("Authorization", "Bearer lixo");
    expect(res.status).toBe(403);
  });

  it("responde 403 quando o usuário não tem a role FREELANCER", async () => {
    mockQuery(() => [], false);
    const res = await request(app).get(`${BASE}/oficinas`).set(auth());
    expect(res.status).toBe(403);
    // só a consulta de role rodou: nenhum dado foi lido
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("consulta a role em ROLE_USUARIO + ROLE (FREELANCER, ID 4) do usuário do JWT", async () => {
    mockQuery(() => [{ total: 0, ID_OFICINA: null }]);
    await request(app).get(`${BASE}/oficinas`).set(auth());
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('"MAIN_REGISTER"."ROLE_USUARIO"');
    expect(sql).toContain('"MAIN_REGISTER"."ROLE"');
    expect(sql).toContain("'FREELANCER'");
    expect(params).toEqual([ID_FREELANCER, 4]);
  });

  it("não protege POST contra falta de role", async () => {
    mockQuery(() => [], false);
    const res = await request(app).post(`${BASE}/oficinas/1/confirmar`).set(auth()).send({});
    expect(res.status).toBe(403);
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe("GET /oficinas", () => {
  const linhaOficina = (n: number, total = 3) => ({
    total,
    ID_OFICINA: n,
    NOME_FANTASIA: `Oficina ${n}`,
    CNPJ: "11222333000181",
    CIDADE: "São Paulo",
    ESTADO: "SP",
  });

  it("devolve { data, total } no formato do contrato", async () => {
    mockQuery(() => [linhaOficina(1), linhaOficina(2)]);
    const res = await request(app).get(`${BASE}/oficinas`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: [
        { ID_OFICINA: 1, NOME_FANTASIA: "Oficina 1", CNPJ: "11222333000181", CIDADE: "São Paulo", ESTADO: "SP" },
        { ID_OFICINA: 2, NOME_FANTASIA: "Oficina 2", CNPJ: "11222333000181", CIDADE: "São Paulo", ESTADO: "SP" },
      ],
      total: 3,
    });
  });

  it("usa page=1 e limit=20 por padrão e faz uma única query de dados", async () => {
    mockQuery(() => [{ total: 0, ID_OFICINA: null }]);
    await request(app).get(`${BASE}/oficinas`).set(auth());
    const consultas = query.mock.calls.filter(([sql]) => !ehQueryDeRole(sql));
    expect(consultas).toHaveLength(1);
    expect(consultas[0][1]).toEqual([20, 0]);
  });

  it("calcula o offset por página", async () => {
    mockQuery(() => []);
    await request(app).get(`${BASE}/oficinas?page=3&limit=10`).set(auth());
    const [, params] = query.mock.calls.find(([sql]) => !ehQueryDeRole(sql))!;
    expect(params).toEqual([10, 20]);
  });

  it.each([["limit=51"], ["limit=0"], ["page=0"], ["page=-1"], ["limit=abc"]])("responde 400 para %s", async (qs) => {
    mockQuery(() => []);
    const res = await request(app).get(`${BASE}/oficinas?${qs}`).set(auth());
    expect(res.status).toBe(400);
  });

  it("aceita o limite máximo de 50", async () => {
    mockQuery(() => []);
    const res = await request(app).get(`${BASE}/oficinas?limit=50`).set(auth());
    expect(res.status).toBe(200);
  });

  it("página vazia devolve data vazio e total 0", async () => {
    mockQuery(() => []);
    const res = await request(app).get(`${BASE}/oficinas`).set(auth());
    expect(res.body).toEqual({ data: [], total: 0 });
  });

  it("a query exclui rotas finalizadas/canceladas/removidas e oficinas já confirmadas, ordenando por nome e id", async () => {
    mockQuery(() => []);
    await request(app).get(`${BASE}/oficinas`).set(auth());
    const [sql] = query.mock.calls.find(([s]) => !ehQueryDeRole(s))!;
    expect(sql).toContain('"CAMPANHAS_OB"."ROTA_PROMOTOR"');
    expect(sql).toContain('"CAMPANHAS_OB"."NOTIFICACAO_VISITA"');
    expect(sql).toContain('rp."DELETED_AT" IS NULL');
    expect(sql).toContain("NOT IN ('FINALIZADO', 'CANCELADO')");
    expect(sql).toContain(`nv."STATUS" <> 'CONFIRMADO'`);
    expect(sql).toContain('nv."ID_NOTIFICACAO_VISITA" IS NULL');
    expect(sql).toContain('ORDER BY "NOME_FANTASIA", "ID_OFICINA"');
    expect(sql).toContain("LIMIT $1 OFFSET $2");
    expect(sql).not.toMatch(/unaccent/i);
  });

  it("busca por nome sem acento com translate(lower()) e escapa curingas", async () => {
    mockQuery(() => []);
    await request(app).get(`${BASE}/oficinas`).query({ search: "Auto Peças 100%" }).set(auth());
    const [sql, params] = query.mock.calls.find(([s]) => !ehQueryDeRole(s))!;
    expect(sql).toContain('translate(lower(o."NOME_FANTASIA")');
    expect(sql).not.toMatch(/unaccent/i);
    expect(params[0]).toBe("%auto pecas 100\\%%");
    // texto com letras não aciona busca por CNPJ
    expect(sql).not.toContain("regexp_replace");
  });

  it("busca numérica também casa pelo CNPJ só com dígitos", async () => {
    mockQuery(() => []);
    await request(app).get(`${BASE}/oficinas`).query({ search: "11.222.333" }).set(auth());
    const [sql, params] = query.mock.calls.find(([s]) => !ehQueryDeRole(s))!;
    expect(sql).toContain("regexp_replace");
    expect(params).toEqual(["%11.222.333%", "%11222333%", 20, 0]);
  });
});

describe("GET /oficinas/:id", () => {
  const respostasDetalhe = (oficinas: unknown[]) => (sql: string) => {
    if (sql.includes('"MAIN_REGISTER"."LINHA_ATIVIDADE"')) return [{ LINHA_ATIVIDADE: "Leve" }, { LINHA_ATIVIDADE: "Moto" }];
    if (sql.includes('"MAIN_REGISTER"."USUARIO"')) return [{ ID_USUARIO: 5, NOME: "Ana", TELEFONE: "11999990000" }];
    return oficinas;
  };

  it("responde 404 quando a oficina não está pendente ou não existe", async () => {
    mockQuery(respostasDetalhe([]));
    const res = await request(app).get(`${BASE}/oficinas/9`).set(auth());
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("message");
  });

  it("devolve oficina, linhas, QTD_ELEVADORES inteiro e usuários", async () => {
    mockQuery(
      respostasDetalhe([
        {
          NOME_FANTASIA: "Oficina X",
          TELEFONE: "1133334444",
          CNPJ: "11222333000181",
          CEP: "01001000",
          ENDERECO: "Rua A",
          NUMERO: "10",
          COMPLEMENTO: null,
          BAIRRO: "Centro",
          CIDADE: "São Paulo",
          ESTADO: "SP",
          ID_RAMO_ATIVIDADE: 3,
          QUANTIDADE_ELEVADOR: "4",
        },
      ])
    );
    const res = await request(app).get(`${BASE}/oficinas/9`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.oficina).toMatchObject({
      NOME_FANTASIA: "Oficina X",
      ID_RAMO_ATIVIDADE: 3,
      LINHA_ATIVIDADE: ["Leve", "Moto"],
      QTD_ELEVADORES: 4,
    });
    expect(res.body.oficina).not.toHaveProperty("QUANTIDADE_ELEVADOR");
    expect(res.body.usuarios).toEqual([{ ID_USUARIO: 5, NOME: "Ana", TELEFONE: "11999990000" }]);
  });

  it("QUANTIDADE_ELEVADOR nulo ou vazio vira 0", async () => {
    mockQuery(respostasDetalhe([{ NOME_FANTASIA: "X", QUANTIDADE_ELEVADOR: null }]));
    const res = await request(app).get(`${BASE}/oficinas/9`).set(auth());
    expect(res.body.oficina.QTD_ELEVADORES).toBe(0);
  });

  it("usuários: só não excluídos, telefone = celular senão telefone", async () => {
    mockQuery(respostasDetalhe([{ NOME_FANTASIA: "X" }]));
    await request(app).get(`${BASE}/oficinas/9`).set(auth());
    const sql = query.mock.calls.map(([s]) => s as string).find((s) => s.includes('"MAIN_REGISTER"."USUARIO"'))!;
    expect(sql).toContain(`"EXCLUIDO", 'N') <> 'S'`);
    expect(sql).toContain('u."CELULAR"');
    expect(sql).toContain('u."TELEFONE"');
    expect(sql).toContain('u."ID_OFICINA" = $1');
  });

  it("id inválido responde 400", async () => {
    mockQuery(() => []);
    const res = await request(app).get(`${BASE}/oficinas/abc`).set(auth());
    expect(res.status).toBe(400);
  });
});

describe("GET /usuarios/:id", () => {
  it("responde 404 quando o usuário não é de oficina pendente", async () => {
    mockQuery(() => []);
    const res = await request(app).get(`${BASE}/usuarios/5`).set(auth());
    expect(res.status).toBe(404);
  });

  it("devolve { usuario } com ID_CARGO vindo de CARGO", async () => {
    const usuario = { ID_USUARIO: 5, NOME: "Ana", EMAIL: "a@x.com", TELEFONE: "11999990000", ID_CARGO: 2 };
    mockQuery(() => [usuario]);
    const res = await request(app).get(`${BASE}/usuarios/5`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ usuario });
    const sql = query.mock.calls.find(([s]) => !ehQueryDeRole(s))![0] as string;
    expect(sql).toContain('u."CARGO" AS "ID_CARGO"');
    expect(sql).toContain('"CAMPANHAS_OB"."ROTA_PROMOTOR"');
  });
});

describe("POST /oficinas/:id/confirmar", () => {
  const corpoValido = (extra: Record<string, unknown> = {}) => ({
    OFICINA: {
      CNPJ: CNPJ_VALIDO,
      CEP: "01001-000",
      ENDERECO: "Rua A",
      NUMERO: "10",
      COMPLEMENTO: "",
      BAIRRO: "Centro",
      CIDADE: "São Paulo",
      ESTADO: "SP",
      ID_RAMO_ATIVIDADE: 3,
      LINHA_ATIVIDADE: ["Leve", "Pesada"],
      QTD_ELEVADORES: 3,
      ...extra,
    },
  });

  const usuarioValido = {
    ID_USUARIO: 5,
    NOME: "Ana",
    EMAIL: "Ana@X.com",
    TELEFONE: "(11) 99999-0000",
    ID_CARGO: 2,
  };

  type Cenario = {
    oficinaExiste?: boolean;
    rotasPendentes?: number[];
    usuarioPertence?: boolean;
    emailEmUso?: boolean;
    cnpjEmUso?: boolean;
    linhasAtuais?: string[];
  };

  let sqls: { sql: string; params: unknown[] }[];

  function prepararTransacao(c: Cenario = {}) {
    const { oficinaExiste = true, rotasPendentes = [10, 11], usuarioPertence = true, emailEmUso = false, cnpjEmUso = false, linhasAtuais = ["Moto"] } = c;
    sqls = [];
    const manager = {
      query: jest.fn(async (sql: string, params: unknown[]) => {
        sqls.push({ sql, params });
        if (sql.includes('FOR UPDATE') && sql.includes('FROM "MAIN_REGISTER"."OFICINA" WHERE')) return oficinaExiste ? [{ ID_OFICINA: 1 }] : [];
        if (sql.includes('FOR UPDATE OF rp')) return rotasPendentes.map((id) => ({ ID_ROTA_PROMOTOR: id }));
        if (sql.includes('FOR UPDATE') && sql.includes('"MAIN_REGISTER"."USUARIO"')) return usuarioPertence ? [{}] : [];
        if (sql.includes('lower("EMAIL")')) return emailEmUso ? [{}] : [];
        if (sql.includes(`regexp_replace(COALESCE("CNPJ"`)) return cnpjEmUso ? [{}] : [];
        if (sql.includes('SELECT "LINHA_ATIVIDADE"')) return linhasAtuais.map((l) => ({ LINHA_ATIVIDADE: l }));
        return [];
      }),
    };
    transaction.mockImplementation(async (cb: (m: unknown) => unknown) => cb(manager));
    mockQuery(() => []);
    return manager;
  }

  const postar = (body: unknown, id = 1) => request(app).post(`${BASE}/oficinas/${id}/confirmar`).set(auth()).send(body as object);
  const achar = (trecho: string) => sqls.find((s) => s.sql.includes(trecho));

  it("confirma numa única transação: oficina, linhas e upsert por rota com FREELANCER", async () => {
    prepararTransacao();
    const res = await postar(corpoValido());

    expect(res.status).toBe(200);
    expect(transaction).toHaveBeenCalledTimes(1);

    // lock da oficina antes de qualquer escrita
    expect(sqls[0].sql).toContain('FROM "MAIN_REGISTER"."OFICINA" WHERE "ID_OFICINA" = $1 FOR UPDATE');
    expect(sqls[1].sql).toContain("FOR UPDATE OF rp");

    const update = achar('UPDATE "MAIN_REGISTER"."OFICINA"')!;
    expect(update.sql).toContain('"DATA_ATUALIZACAO_ENDERECO" = now()');
    expect(update.sql).toContain('"QUANTIDADE_ELEVADOR" = $11');
    expect(update.params).toEqual([1, "11222333000181", "01001000", "Rua A", "10", "", "Centro", "São Paulo", "SP", 3, "3"]);

    const upsert = achar('INSERT INTO "CAMPANHAS_OB"."NOTIFICACAO_VISITA"')!;
    expect(upsert.sql).toContain("'CONFIRMADO'");
    expect(upsert.sql).toContain("'FREELANCER'");
    expect(upsert.sql).toContain('ON CONFLICT ("ID_ROTA_PROMOTOR") DO UPDATE');
    expect(upsert.sql).toContain('"CONFIRMADO_POR"');
    expect(upsert.sql).toContain('"CONFIRMADO_EM"');
    expect(upsert.params).toEqual([[10, 11], ID_FREELANCER]);
  });

  it("não vaza PII no log", async () => {
    prepararTransacao();
    await postar({ ...corpoValido(), USUARIO: usuarioValido });
    const logado = JSON.stringify((console.info as jest.Mock).mock.calls);
    expect(logado).not.toContain("Ana");
    expect(logado).not.toContain("11222333000181");
  });

  it("troca as linhas (delete + insert) quando mudaram", async () => {
    prepararTransacao({ linhasAtuais: ["Moto"] });
    await postar(corpoValido());
    expect(achar('DELETE FROM "MAIN_REGISTER"."LINHA_ATIVIDADE"')).toBeDefined();
    expect(achar('INSERT INTO "MAIN_REGISTER"."LINHA_ATIVIDADE"')!.params).toEqual([1, ["Leve", "Pesada"]]);
  });

  it("não mexe nas linhas quando são as mesmas (ignora ordem e caixa)", async () => {
    prepararTransacao({ linhasAtuais: ["pesada", "LEVE"] });
    await postar(corpoValido());
    expect(achar('DELETE FROM "MAIN_REGISTER"."LINHA_ATIVIDADE"')).toBeUndefined();
    expect(achar('INSERT INTO "MAIN_REGISTER"."LINHA_ATIVIDADE"')).toBeUndefined();
  });

  it("atualiza o usuário (nome, e-mail em minúsculas, cargo, telefone) só dentro da oficina", async () => {
    prepararTransacao();
    const res = await postar({ ...corpoValido(), USUARIO: usuarioValido });
    expect(res.status).toBe(200);
    const upd = achar('UPDATE "MAIN_REGISTER"."USUARIO"')!;
    expect(upd.params).toEqual([5, "Ana", "ana@x.com", 2, "(11) 99999-0000", 1]);
    expect(upd.sql).toContain('"ID_OFICINA" = $6');
  });

  it("sem USUARIO não toca em USUARIO", async () => {
    prepararTransacao();
    await postar(corpoValido());
    expect(achar('UPDATE "MAIN_REGISTER"."USUARIO"')).toBeUndefined();
  });

  it("responde 409 quando não há rota pendente (já confirmada) e não escreve nada", async () => {
    prepararTransacao({ rotasPendentes: [] });
    const res = await postar(corpoValido());
    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty("message");
    expect(sqls.some((s) => /^\s*(UPDATE|INSERT|DELETE)/.test(s.sql))).toBe(false);
  });

  it("responde 404 quando a oficina não existe", async () => {
    prepararTransacao({ oficinaExiste: false });
    const res = await postar(corpoValido(), 999);
    expect(res.status).toBe(404);
  });

  it("responde 409 com mensagem clara quando o CNPJ é de outra oficina", async () => {
    prepararTransacao({ cnpjEmUso: true });
    const res = await postar(corpoValido());
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/CNPJ/);
    expect(achar('UPDATE "MAIN_REGISTER"."OFICINA"')).toBeUndefined();
    expect(achar("INSERT INTO \"CAMPANHAS_OB\".\"NOTIFICACAO_VISITA\"")).toBeUndefined();
  });

  it("responde 409 quando o CNPJ viola índice único (concorrência)", async () => {
    const manager = prepararTransacao();
    const original = manager.query.getMockImplementation()!;
    manager.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes('UPDATE "MAIN_REGISTER"."OFICINA"')) throw Object.assign(new Error("dup"), { code: "23505" });
      return original(sql, params);
    });
    const res = await postar(corpoValido());
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/CNPJ/);
  });

  it("rejeita usuário de outra oficina (422) sem escrever", async () => {
    prepararTransacao({ usuarioPertence: false });
    const res = await postar({ ...corpoValido(), USUARIO: usuarioValido });
    expect(res.status).toBe(422);
    expect(achar('UPDATE "MAIN_REGISTER"."OFICINA"')).toBeUndefined();
    expect(achar("INSERT INTO \"CAMPANHAS_OB\".\"NOTIFICACAO_VISITA\"")).toBeUndefined();
  });

  it("responde 409 quando o e-mail é de outro usuário", async () => {
    prepararTransacao({ emailEmUso: true });
    const res = await postar({ ...corpoValido(), USUARIO: usuarioValido });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/e-mail/i);
    expect(achar('UPDATE "MAIN_REGISTER"."USUARIO"')).toBeUndefined();
  });

  it("erro inesperado vira 500 sem stack nem detalhe interno", async () => {
    const manager = prepararTransacao();
    manager.query.mockImplementation(async () => {
      throw new Error("conexão com host db-interno caiu");
    });
    const res = await postar(corpoValido());
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: "Erro interno." });
  });

  describe("payload inválido responde 400 e nem abre transação", () => {
    const casos: [string, Record<string, unknown>][] = [
      ["CNPJ com dígito verificador errado", { CNPJ: "11.222.333/0001-82" }],
      ["CNPJ com todos os dígitos iguais", { CNPJ: "11111111111111" }],
      ["CEP com 7 dígitos", { CEP: "0100100" }],
      ["linha fora da lista", { LINHA_ATIVIDADE: ["Naval"] }],
      ["QTD_ELEVADORES acima de 999", { QTD_ELEVADORES: 1000 }],
      ["QTD_ELEVADORES negativo", { QTD_ELEVADORES: -1 }],
      ["QTD_ELEVADORES fracionado", { QTD_ELEVADORES: 1.5 }],
      ["ENDERECO vazio", { ENDERECO: "" }],
      ["ESTADO com 3 letras", { ESTADO: "SPP" }],
    ];

    it.each(casos)("%s", async (_nome, extra) => {
      prepararTransacao();
      const res = await postar(corpoValido(extra));
      expect(res.status).toBe(400);
      expect(transaction).not.toHaveBeenCalled();
    });

    it("corpo sem OFICINA", async () => {
      prepararTransacao();
      expect((await postar({})).status).toBe(400);
    });

    it("USUARIO com e-mail inválido", async () => {
      prepararTransacao();
      const res = await postar({ ...corpoValido(), USUARIO: { ...usuarioValido, EMAIL: "nao-e-email" } });
      expect(res.status).toBe(400);
    });

    it("id da rota inválido", async () => {
      prepararTransacao();
      expect((await postar(corpoValido(), 0)).status).toBe(400);
    });
  });

  it("aceita QTD_ELEVADORES 0 e 999 e linhas vazias", async () => {
    prepararTransacao();
    expect((await postar(corpoValido({ QTD_ELEVADORES: 0, LINHA_ATIVIDADE: [] }))).status).toBe(200);
    prepararTransacao();
    expect((await postar(corpoValido({ QTD_ELEVADORES: 999 }))).status).toBe(200);
  });
});

describe("helpers", () => {
  it("cnpjValido confere os dígitos verificadores", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11222333000181")).toBe(true);
    expect(cnpjValido("11222333000180")).toBe(false);
    expect(cnpjValido("123")).toBe(false);
    expect(cnpjValido(null)).toBe(false);
  });

  it("qtdElevadoresParaInteiro: nulo, vazio e lixo viram 0", () => {
    expect(qtdElevadoresParaInteiro(null)).toBe(0);
    expect(qtdElevadoresParaInteiro("")).toBe(0);
    expect(qtdElevadoresParaInteiro("abc")).toBe(0);
    expect(qtdElevadoresParaInteiro("12")).toBe(12);
  });

  it("normalizarBusca tira acento e caixa", () => {
    expect(normalizarBusca("  Oficina ÃÇÉ ")).toBe("oficina ace");
  });
});
