import "./setup";
import express from "express";
import request from "supertest";
import { EntityManager } from "typeorm";
import { AppDataSourceSync } from "../../data-source";
import Empresa from "../../entities/CadastroEmpresa";
import visitaRoutes from "../../routes/VisitaRoute";
import VisitaConfirmacaoService from "../../service/visitaConfirmacaoService";
import { emitirJwt, VISITA_SCOPE } from "../../utils/visitaToken";

jest.mock("../../service/visitaConfirmacaoService");

const atualizarEnderecoMock =
  VisitaConfirmacaoService.atualizarEndereco as jest.MockedFunction<
    typeof VisitaConfirmacaoService.atualizarEndereco
  >;

const SEGREDO = "segredo-de-teste";
const ID_NOTIFICACAO = 55;
const ID_ROTA = 42;
const ID_USUARIO = 7;
const CONFIRMADO_EM = new Date("2026-08-09T14:32:00.000Z");

const app = express();
app.use(express.json());
app.use("/visita", visitaRoutes);

const enderecoCorrigido = {
  ENDERECO: "Avenida Nova",
  NUMERO: "500",
  COMPLEMENTO: null,
  BAIRRO: "Centro",
  CIDADE: "Campinas",
  ESTADO: "SP",
  CEP: "13010-000",
};

const jwtValido = () =>
  emitirJwt({
    sub: ID_USUARIO,
    ID_NOTIFICACAO_VISITA: ID_NOTIFICACAO,
    ID_ROTA_PROMOTOR: ID_ROTA,
  });

// The limiter's buckets live on the router module for the whole file, so the
// rate-limit tests below use their own visit ids and never spend the budget of
// the visit the other tests exercise.
const jwtDaVisita = (idNotificacao: number) =>
  emitirJwt({
    sub: ID_USUARIO,
    ID_NOTIFICACAO_VISITA: idNotificacao,
    ID_ROTA_PROMOTOR: ID_ROTA,
  });

describe("PUT /visita/endereco", () => {
  beforeEach(() => {
    process.env.VISITA_TOKEN_SECRET = SEGREDO;
    atualizarEnderecoMock.mockResolvedValue({
      state: "CONFIRMED",
      confirmadoEm: CONFIRMADO_EM,
      enderecoAtualizado: true,
    });
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // AC31: the correction applies the same confirmation transition and sets
  // ENDERECO_ATUALIZADO.
  it("returns 200 CONFIRMED with enderecoAtualizado for a valid correction", async () => {
    const resposta = await request(app)
      .put("/visita/endereco")
      .set("Authorization", `Bearer ${jwtValido()}`)
      .send(enderecoCorrigido);

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({
      message: "Endereço atualizado e visita confirmada.",
      data: {
        state: "CONFIRMED",
        confirmadoEm: CONFIRMADO_EM.toISOString(),
        enderecoAtualizado: true,
      },
    });
  });

  // AC31: "SHALL update only the address columns of the linked
  // MAIN_REGISTER.OFICINA row." Only the seven allowlisted columns may reach
  // the write. (The repository-level assertion lives in
  // __tests__/unit/visitaConfirmacaoService.test.ts, "writes only the seven
  // address columns to the Oficina row".)
  it("forwards exactly the seven address columns and nothing else", async () => {
    await request(app)
      .put("/visita/endereco")
      .set("Authorization", `Bearer ${jwtValido()}`)
      .send(enderecoCorrigido);

    const enviado = atualizarEnderecoMock.mock.calls[0][1];
    expect(enviado).toEqual(enderecoCorrigido);
    expect(Object.keys(enviado).sort()).toEqual([
      "BAIRRO",
      "CEP",
      "CIDADE",
      "COMPLEMENTO",
      "ENDERECO",
      "ESTADO",
      "NUMERO",
    ]);
  });

  // AC32: "IF a PUT /visita/endereco request carries any field outside the
  // address column allowlist THEN the system SHALL reject the request with a
  // validation error and SHALL NOT write to Oficina."
  it("returns 400 and writes nothing when a non-allowlisted field is sent", async () => {
    const resposta = await request(app)
      .put("/visita/endereco")
      .set("Authorization", `Bearer ${jwtValido()}`)
      .send({ ...enderecoCorrigido, CNPJ: "99999999000199", TELEFONE: "11999998888" });

    expect(resposta.status).toBe(400);
    expect(atualizarEnderecoMock).not.toHaveBeenCalled();
  });

  it("returns 401 and writes nothing when the JWT is missing", async () => {
    const resposta = await request(app).put("/visita/endereco").send(enderecoCorrigido);

    expect(resposta.status).toBe(401);
    expect(atualizarEnderecoMock).not.toHaveBeenCalled();
  });

  // AC31 inherits AC20's rejection rules through the shared transition.
  it("returns 409 when the visit was already confirmed", async () => {
    atualizarEnderecoMock.mockResolvedValue({
      state: "ALREADY_CONFIRMED",
      confirmadoEm: CONFIRMADO_EM,
    });

    const resposta = await request(app)
      .put("/visita/endereco")
      .set("Authorization", `Bearer ${jwtValido()}`)
      .send(enderecoCorrigido);

    expect(resposta.status).toBe(409);
    expect(resposta.body).toEqual({
      message: "Visita já confirmada.",
      error: "ALREADY_CONFIRMED",
    });
  });

  // AC33: "IF the Oficina address update fails at the database level
  // (including a missing UPDATE grant on MAIN_REGISTER) THEN ... SHALL NOT
  // report the confirmation as successful, and SHALL surface a distinct error
  // state to the caller."
  it("returns a distinct error and no confirmation when the Oficina write fails", async () => {
    atualizarEnderecoMock.mockResolvedValue({ state: "ADDRESS_UPDATE_FAILED" });

    const resposta = await request(app)
      .put("/visita/endereco")
      .set("Authorization", `Bearer ${jwtValido()}`)
      .send(enderecoCorrigido);

    expect(resposta.status).toBe(500);
    expect(resposta.body).toEqual({
      message: "Não foi possível atualizar o endereço.",
      error: "ADDRESS_UPDATE_FAILED",
    });
    expect(JSON.stringify(resposta.body)).not.toContain("CONFIRMED");
  });

  // AC25: the same per-visit limit guards the authenticated PUT, keyed on the
  // JWT's ID_NOTIFICACAO_VISITA claim.
  it("returns 429 after 20 corrections for the same visit within a minute", async () => {
    const token = jwtDaVisita(911);

    const respostas = [];
    for (let i = 0; i < 21; i += 1) {
      respostas.push(
        await request(app)
          .put("/visita/endereco")
          .set("Authorization", `Bearer ${token}`)
          .send(enderecoCorrigido)
      );
    }

    expect(respostas.slice(0, 20).every((r) => r.status !== 429)).toBe(true);
    expect(respostas[20].status).toBe(429);
    expect(respostas[20].body).toEqual({
      message: "Muitas tentativas. Aguarde um minuto.",
      error: "RATE_LIMITED",
    });
  });

  // AC25 keys the limit per visit, so exhausting one visit must leave another
  // visit's budget untouched - the assertion a constant keyGenerator fails.
  it("keeps a separate limit bucket per ID_NOTIFICACAO_VISITA", async () => {
    const tokenBarulhento = jwtDaVisita(912);

    for (let i = 0; i < 21; i += 1) {
      await request(app)
        .put("/visita/endereco")
        .set("Authorization", `Bearer ${tokenBarulhento}`)
        .send(enderecoCorrigido);
    }

    const outraVisita = await request(app)
      .put("/visita/endereco")
      .set("Authorization", `Bearer ${jwtDaVisita(913)}`)
      .send(enderecoCorrigido);

    expect(outraVisita.status).toBe(200);
    expect(outraVisita.body.data.state).toBe("CONFIRMED");
  });
});

/**
 * VISIB-07, VISIB-08, VISIB-11 e VISIB-13 — escrita real nas duas tabelas.
 *
 * Integração de propósito: a atomicidade entre `MAIN_REGISTER.OFICINA` e
 * `dw.cadastro_empresa` é garantia do Postgres, não do código. Contra mocks o
 * teste afirmaria que uma transação foi chamada, o que não prova que a primeira
 * escrita volta atrás quando a segunda falha.
 *
 * O bloco acima roda com o service mockado (nível HTTP); aqui o service real é
 * recuperado com `requireActual` e exercido contra o banco de dev.
 *
 * Cada caso se pendura numa rota real sem notificação, e o endereço original das
 * duas tabelas é restaurado no afterAll. O `CEP` enviado é o já cadastrado de
 * propósito: um CEP diferente dispararia `reassignRotasByAddress`, que remaneja
 * rotas de verdade.
 */
describe("VisitaConfirmacaoService.atualizarEndereco (banco real)", () => {
  const ServiceReal = jest.requireActual("../../service/visitaConfirmacaoService")
    .default as typeof VisitaConfirmacaoService;

  const IP = "203.0.113.9";
  const AGORA = new Date();
  const TEMPO_LIMITE = 60_000;

  interface Fixture {
    idRota: number;
    idOficina: number;
    idNotificacao: number;
    oficinaOriginal: Record<string, unknown>;
    empresaOriginal: Record<string, unknown>;
  }

  const fixtures: Fixture[] = [];

  const lerOficina = async (idOficina: number) => {
    const [linha] = await AppDataSourceSync.query(
      `SELECT "ENDERECO", "NUMERO", "COMPLEMENTO", "BAIRRO", "CIDADE", "ESTADO", "CEP"
         FROM "MAIN_REGISTER"."OFICINA" WHERE "ID_OFICINA" = $1`,
      [idOficina]
    );
    return linha as Record<string, unknown>;
  };

  const lerEmpresa = async (idOficina: number) => {
    const [linha] = await AppDataSourceSync.query(
      `SELECT logradouro, rua, numero, complemento, bairro, cidade, estado, cep,
              latitude, longitude
         FROM dw.cadastro_empresa WHERE id_oficina = $1`,
      [idOficina]
    );
    return linha as Record<string, unknown>;
  };

  const enderecoDoTeste = (endereco: string, fixture: Fixture) => ({
    ENDERECO: endereco,
    NUMERO: "1500",
    COMPLEMENTO: "Fundos",
    BAIRRO: "Bairro Teste VISIB",
    CIDADE: "Campinas",
    ESTADO: "SP",
    CEP: (fixture.oficinaOriginal.CEP as string | null) ?? null,
  });

  const payloadDe = (fixture: Fixture) => ({
    sub: 1,
    ID_NOTIFICACAO_VISITA: fixture.idNotificacao,
    ID_ROTA_PROMOTOR: fixture.idRota,
    scope: VISITA_SCOPE,
  });

  const statusDaNotificacao = async (idNotificacao: number) => {
    const [linha] = await AppDataSourceSync.query(
      `SELECT "STATUS" FROM "CAMPANHAS_OB"."NOTIFICACAO_VISITA"
        WHERE "ID_NOTIFICACAO_VISITA" = $1`,
      [idNotificacao]
    );
    return linha?.STATUS as string | undefined;
  };

  beforeAll(async () => {
    const candidatas = await AppDataSourceSync.query(
      `SELECT rp."ID_ROTA_PROMOTOR", rp."ID_OFICINA"
         FROM "CAMPANHAS_OB"."ROTA_PROMOTOR" rp
         JOIN "MAIN_REGISTER"."OFICINA" o ON o."ID_OFICINA" = rp."ID_OFICINA"
         JOIN dw.cadastro_empresa ce ON ce.id_oficina = rp."ID_OFICINA"
         LEFT JOIN "CAMPANHAS_OB"."NOTIFICACAO_VISITA" nv
           ON nv."ID_ROTA_PROMOTOR" = rp."ID_ROTA_PROMOTOR"
        WHERE nv."ID_NOTIFICACAO_VISITA" IS NULL
        ORDER BY rp."ID_ROTA_PROMOTOR" DESC
        LIMIT 2`
    );

    if (candidatas.length < 2) {
      throw new Error("dev não tem rotas sem notificação com oficina nas duas tabelas");
    }

    for (const candidata of candidatas) {
      const idOficina = Number(candidata.ID_OFICINA);
      const [linha] = await AppDataSourceSync.query(
        `INSERT INTO "CAMPANHAS_OB"."NOTIFICACAO_VISITA"
           ("ID_ROTA_PROMOTOR", "STATUS", "EXPIRA_EM")
         VALUES ($1, 'ENVIADO', now() + interval '2 days')
         RETURNING "ID_NOTIFICACAO_VISITA"`,
        [Number(candidata.ID_ROTA_PROMOTOR)]
      );

      fixtures.push({
        idRota: Number(candidata.ID_ROTA_PROMOTOR),
        idOficina,
        idNotificacao: Number(linha.ID_NOTIFICACAO_VISITA),
        oficinaOriginal: await lerOficina(idOficina),
        empresaOriginal: await lerEmpresa(idOficina),
      });
    }
  }, TEMPO_LIMITE);

  afterAll(async () => {
    for (const fixture of fixtures) {
      await AppDataSourceSync.query(
        `UPDATE "MAIN_REGISTER"."OFICINA"
            SET "ENDERECO" = $2, "NUMERO" = $3, "COMPLEMENTO" = $4, "BAIRRO" = $5,
                "CIDADE" = $6, "ESTADO" = $7, "CEP" = $8
          WHERE "ID_OFICINA" = $1`,
        [
          fixture.idOficina,
          fixture.oficinaOriginal.ENDERECO,
          fixture.oficinaOriginal.NUMERO,
          fixture.oficinaOriginal.COMPLEMENTO,
          fixture.oficinaOriginal.BAIRRO,
          fixture.oficinaOriginal.CIDADE,
          fixture.oficinaOriginal.ESTADO,
          fixture.oficinaOriginal.CEP,
        ]
      );

      await AppDataSourceSync.query(
        `UPDATE dw.cadastro_empresa
            SET logradouro = $2, rua = $3, numero = $4, complemento = $5,
                bairro = $6, cidade = $7, estado = $8, cep = $9
          WHERE id_oficina = $1`,
        [
          fixture.idOficina,
          fixture.empresaOriginal.logradouro,
          fixture.empresaOriginal.rua,
          fixture.empresaOriginal.numero,
          fixture.empresaOriginal.complemento,
          fixture.empresaOriginal.bairro,
          fixture.empresaOriginal.cidade,
          fixture.empresaOriginal.estado,
          fixture.empresaOriginal.cep,
        ]
      );

      await AppDataSourceSync.query(
        `DELETE FROM "CAMPANHAS_OB"."NOTIFICACAO_VISITA"
          WHERE "ID_NOTIFICACAO_VISITA" = $1`,
        [fixture.idNotificacao]
      );
    }
  }, TEMPO_LIMITE);

  // P1 endereço AC1, AC3, AC5 e AC7: as duas tabelas recebem a correção na mesma
  // transação, com o ENDERECO dividido em tipo e nome no dw e as coordenadas
  // intocadas.
  it(
    "grava a correção nas duas tabelas e confirma a visita",
    async () => {
      const fixture = fixtures[0];

      const resultado = await ServiceReal.atualizarEndereco(
        payloadDe(fixture),
        enderecoDoTeste("Avenida Teste VISIB Sete", fixture),
        IP,
        AGORA
      );

      expect(resultado).toMatchObject({ state: "CONFIRMED", enderecoAtualizado: true });

      const oficina = await lerOficina(fixture.idOficina);
      expect(oficina.ENDERECO).toBe("Avenida Teste VISIB Sete");
      expect(oficina.BAIRRO).toBe("Bairro Teste VISIB");

      const empresa = await lerEmpresa(fixture.idOficina);
      expect(empresa.logradouro).toBe("Avenida");
      expect(empresa.rua).toBe("Teste VISIB Sete");
      expect(empresa.numero).toBe("1500");
      expect(empresa.complemento).toBe("Fundos");
      expect(empresa.bairro).toBe("Bairro Teste VISIB");
      expect(empresa.cidade).toBe("Campinas");
      expect(empresa.estado).toBe("SP");
      expect(empresa.cep).toBe(fixture.oficinaOriginal.CEP);
      expect(empresa.latitude).toBe(fixture.empresaOriginal.latitude);
      expect(empresa.longitude).toBe(fixture.empresaOriginal.longitude);

      expect(await statusDaNotificacao(fixture.idNotificacao)).toBe("CONFIRMADO");
    },
    TEMPO_LIMITE
  );

  // VISIB-13 / AC2: falha na segunda escrita reverte a primeira. O rollback é do
  // Postgres, então a comprovação precisa ser uma leitura no banco.
  it(
    "reverte a escrita em OFICINA quando a escrita no dw falha",
    async () => {
      const fixture = fixtures[1];
      const antesOficina = await lerOficina(fixture.idOficina);
      const antesEmpresa = await lerEmpresa(fixture.idOficina);

      const updateOriginal = EntityManager.prototype.update;
      const espia = jest
        .spyOn(EntityManager.prototype, "update")
        .mockImplementation(async function (
          this: EntityManager,
          alvo: unknown,
          criterio: unknown,
          valores: unknown
        ) {
          if (alvo === Empresa) {
            throw new Error("falha simulada na escrita do dw");
          }
          return await (updateOriginal as Function).call(this, alvo, criterio, valores);
        } as never);

      try {
        const resultado = await ServiceReal.atualizarEndereco(
          payloadDe(fixture),
          enderecoDoTeste("Rua Que Nao Deve Persistir", fixture),
          IP,
          AGORA
        );

        expect(resultado).toEqual({ state: "ADDRESS_UPDATE_FAILED" });
      } finally {
        espia.mockRestore();
      }

      expect(await lerOficina(fixture.idOficina)).toEqual(antesOficina);
      expect(await lerEmpresa(fixture.idOficina)).toEqual(antesEmpresa);
      expect(await statusDaNotificacao(fixture.idNotificacao)).toBe("ENVIADO");
    },
    TEMPO_LIMITE
  );
});
