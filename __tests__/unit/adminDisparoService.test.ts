import { AppDataSourceSync } from "../../data-source";
import AdminDisparoService, { AdminDisparoErro } from "../../service/adminDisparoService";

jest.mock("../../data-source");

const normalizarSql = (sql: string) => sql.replace(/\s+/g, " ").trim();

let queryMock: jest.Mock;

/** Responde cada SQL pela primeira regra cujo trecho aparece nela. */
function responder(regras: Array<[string, unknown]>) {
  queryMock.mockImplementation(async (sql: string) => {
    const s = normalizarSql(sql);
    const regra = regras.find(([trecho]) => s.includes(trecho));
    return regra ? regra[1] : [];
  });
}

const sqlsChamadas = () => queryMock.mock.calls.map(([sql]) => normalizarSql(sql));

beforeEach(() => {
  queryMock = AppDataSourceSync.query as jest.Mock;
  queryMock.mockReset();
  queryMock.mockResolvedValue([]);
});

// T16 (CONV-01, CONV-02)
describe("AdminDisparoService.listarCampanhasAtivas", () => {
  const agora = new Date("2026-09-28T12:00:00.000Z");

  it("filtra PUBLICADA, sem DELETED_AT, dentro do período e END_TIME nulo como sem fim", async () => {
    await AdminDisparoService.listarCampanhasAtivas(agora);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0];
    const s = normalizarSql(sql);
    expect(s).toContain(
      `WHERE c."STATUS" = 'PUBLICADA' AND c."DELETED_AT" IS NULL AND c."START_TIME" <= $1 AND (c."END_TIME" IS NULL OR c."END_TIME" >= $1)`
    );
    expect(params).toEqual([agora]);
  });

  it("resolve o cliente por COMMUNITIES.Nome do EMPRESA_SLUG num LEFT JOIN e conta vínculos e rotas na mesma query", async () => {
    await AdminDisparoService.listarCampanhasAtivas(agora);

    const s = normalizarSql(queryMock.mock.calls[0][0]);
    expect(s).toContain('FROM "CAMPANHAS_OB"."CAMPANHA" c LEFT JOIN LATERAL');
    expect(s).toContain(
      'SELECT com."Nome" FROM "OFICINA_PORTAL"."COMMUNITIES" com WHERE com."EmpresaSlug" = c."EMPRESA_SLUG" LIMIT 1 ) cm ON TRUE'
    );
    expect(s).toContain('cm."Nome" AS "clienteNome"');
    expect(s).toContain(
      'FROM "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" cp WHERE cp."ID_CAMPANHA" = c."ID_CAMPANHA" AND cp."DELETED_AT" IS NULL) AS "totalPromotores"'
    );
    expect(s).toContain(
      'JOIN "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" cp_r ON cp_r."ID_CAMPANHA_PROMOTOR" = rp."ID_CAMPANHA_PROMOTOR" WHERE cp_r."ID_CAMPANHA" = c."ID_CAMPANHA" AND cp_r."DELETED_AT" IS NULL AND rp."DELETED_AT" IS NULL) AS "totalRotas"'
    );
  });

  it("mantém campanha sem nome resolvível com clienteNome nulo", async () => {
    const inicio = new Date("2026-09-01T00:00:00.000Z");
    queryMock.mockResolvedValue([
      {
        ID_CAMPANHA: 1,
        NOME: "Campanha ZF",
        EMPRESA_SLUG: "zf",
        clienteNome: "ZF do Brasil",
        START_TIME: inicio,
        END_TIME: null,
        totalPromotores: 2,
        totalRotas: 30,
      },
      {
        ID_CAMPANHA: 2,
        NOME: "Sem slug",
        EMPRESA_SLUG: null,
        clienteNome: null,
        START_TIME: inicio,
        END_TIME: null,
        totalPromotores: 0,
        totalRotas: 0,
      },
    ]);

    const r = await AdminDisparoService.listarCampanhasAtivas(agora);

    expect(r).toEqual([
      {
        ID_CAMPANHA: 1,
        NOME: "Campanha ZF",
        EMPRESA_SLUG: "zf",
        clienteNome: "ZF do Brasil",
        START_TIME: inicio,
        END_TIME: null,
        totalPromotores: 2,
        totalRotas: 30,
      },
      {
        ID_CAMPANHA: 2,
        NOME: "Sem slug",
        EMPRESA_SLUG: null,
        clienteNome: null,
        START_TIME: inicio,
        END_TIME: null,
        totalPromotores: 0,
        totalRotas: 0,
      },
    ]);
  });
});

// T16 (CONV-13)
describe("AdminDisparoService.listarPromotores", () => {
  const campanha = { ID_CAMPANHA: 77, ID_CLIENT: 5, EMPRESA_SLUG: "zf", END_TIME: null };

  it("devolve vinculados com raio e coordenadas, e os do cliente sem vínculo ativo", async () => {
    responder([
      ['FROM "CAMPANHAS_OB"."CAMPANHA" c WHERE c."ID_CAMPANHA" = $1', [campanha]],
      [
        'FROM "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" cp JOIN "CAMPANHAS_OB"."PROMOTOR" p',
        [{ ID_CAMPANHA_PROMOTOR: 31, ID_PROMOTOR: 3, NOME: "Carlos", RAIO: 25, LAT: -23.5, LNG: -46.6 }],
      ],
      [
        'JOIN "CAMPANHAS_OB"."PROMOTOR" p ON p."ID_CLIENT" = c."ID_CLIENT"',
        [{ ID_PROMOTOR: 4, NOME: "Ana", LAT: null, LNG: null }],
      ],
    ]);

    const r = await AdminDisparoService.listarPromotores(77);

    expect(r).toEqual({
      vinculados: [{ ID_CAMPANHA_PROMOTOR: 31, ID_PROMOTOR: 3, NOME: "Carlos", RAIO: 25, LAT: -23.5, LNG: -46.6 }],
      doCliente: [{ ID_PROMOTOR: 4, NOME: "Ana", LAT: null, LNG: null }],
    });
  });

  it("afirma a SQL dos vinculados e dos promotores do cliente", async () => {
    responder([['FROM "CAMPANHAS_OB"."CAMPANHA" c WHERE c."ID_CAMPANHA" = $1', [campanha]]]);

    await AdminDisparoService.listarPromotores(77);

    const sqls = sqlsChamadas();
    expect(queryMock).toHaveBeenCalledTimes(3);
    const vinc = sqls.find((s) => s.includes('cp."RAIO"'))!;
    expect(vinc).toContain('p."LATITUDE" AS "LAT", p."LONGITUDE" AS "LNG"');
    expect(vinc).toContain(
      'JOIN "CAMPANHAS_OB"."PROMOTOR" p ON p."ID_PROMOTOR" = cp."ID_PROMOTOR" WHERE cp."ID_CAMPANHA" = $1 AND cp."DELETED_AT" IS NULL AND p."DELETED_AT" IS NULL'
    );
    const cliente = sqls.find((s) => s.includes('p."ID_CLIENT" = c."ID_CLIENT"'))!;
    expect(cliente).toContain(
      'NOT EXISTS ( SELECT 1 FROM "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" cp WHERE cp."ID_PROMOTOR" = p."ID_PROMOTOR" AND cp."ID_CAMPANHA" = c."ID_CAMPANHA" AND cp."DELETED_AT" IS NULL )'
    );
    expect(queryMock.mock.calls.every(([, params]) => params[0] === 77)).toBe(true);
  });

  it("campanha inexistente dá 404", async () => {
    await expect(AdminDisparoService.listarPromotores(999)).rejects.toMatchObject({
      status: 404,
      message: "Campanha não encontrada",
    });
    await expect(AdminDisparoService.listarPromotores(999)).rejects.toBeInstanceOf(AdminDisparoErro);
  });
});
