import OficinaService, { MAX_OFICINAS_BUSCA } from "../../service/oficinaService";
import { AppDataSourceSync } from "../../data-source";
import { sqlTextoNormalizado } from "../../utils/filtroBuscaOficina";

jest.mock("../../data-source");

const normalizarSql = (sql: string) => sql.replace(/\s+/g, " ").trim();

const linha = (over: Record<string, unknown> = {}) => ({
  ID_OFICINA: 10,
  NOME: "Oficina A",
  CIDADE: "Campinas",
  ESTADO: "SP",
  CEP: "13000-000",
  LATITUDE: -22.9,
  LONGITUDE: -47.06,
  OFICINA_TELEFONE: null,
  CADASTRO_TELEFONE: null,
  USUARIOS: [{ ID_USUARIO: 1, CELULAR: "11987654321", TELEFONE: null }],
  MEMBRO_COMUNIDADE: false,
  IMPORTADA: false,
  RECUSOU_NESTA_CAMPANHA: false,
  ROTA_ID_ROTA_PROMOTOR: null,
  ROTA_ID_CAMPANHA_PROMOTOR: null,
  ROTA_PROMOTOR_NOME: null,
  ROTA_NV_STATUS: null,
  ROTA_NV_EXPIRA_EM: null,
  ROTA_NV_ORIGEM_ACEITE: null,
  ...over,
});

let queryMock: jest.Mock;

beforeEach(() => {
  queryMock = AppDataSourceSync.query as jest.Mock;
  queryMock.mockReset();
  queryMock.mockResolvedValue([]);
});

// T38 (CONV-06, CONV-09, CONV-10, CONV-48)
describe("OficinaService.buscarOficinasBase", () => {
  const ctx = { idCampanha: 77, empresaSlug: "zf" };

  it("parte de MAIN_REGISTER.OFICINA com CNPJ ativo e sem exigir coordenadas (L-004)", async () => {
    await OficinaService.buscarOficinasBase({}, ctx);

    const [sql, params] = queryMock.mock.calls[0];
    const s = normalizarSql(sql);
    expect(s).toContain('FROM "MAIN_REGISTER"."OFICINA" o LEFT JOIN');
    expect(s).toContain('ce_por_id ON ce_por_id.id_oficina = o."ID_OFICINA"');
    expect(s).toContain("LEFT JOIN dw.cadastro_empresa ce_por_cnpj");
    expect(s).toContain("WHERE ce.cnpj_int IS NOT NULL AND ce.status_receita = 'ATIVA' ORDER BY o.\"ID_OFICINA\" LIMIT $3");
    expect(s).not.toMatch(/latitude IS NOT NULL AND ce\.longitude IS NOT NULL AND/i);
    expect(s).not.toContain('"MAIN_REGISTER"."USUARIO" us');
    expect(params).toEqual([77, "zf", MAX_OFICINAS_BUSCA + 1]);
    expect(MAX_OFICINAS_BUSCA).toBe(5000);
  });

  it("afirma projeção, flags e rota atual pela OFICINA (L-004)", async () => {
    await OficinaService.buscarOficinasBase({}, ctx);

    const s = normalizarSql(queryMock.mock.calls[0][0]);
    expect(s).toContain('SELECT o."ID_OFICINA" AS "ID_OFICINA", COALESCE(o."NOME_FANTASIA", ce.razao_social) AS "NOME"');
    expect(s).toContain('COALESCE(o."CIDADE", ce.cidade) AS "CIDADE"');
    expect(s).toContain('COALESCE(o."ESTADO", ce.estado) AS "ESTADO"');
    // Coordenadas: o par do dw, senão o par da OFICINA com cast protegido.
    expect(s).toContain(
      "CASE WHEN ce.latitude IS NOT NULL AND ce.longitude IS NOT NULL THEN ce.latitude::double precision WHEN (CASE WHEN replace(trim(o.\"LATITUDE\"), ',', '.') ~ '^-?[0-9]{1,3}(\\.[0-9]+)?$' THEN replace(trim(o.\"LATITUDE\"), ',', '.')::double precision END) IS NOT NULL"
    );
    expect(s).toContain('ce.longitude::double precision WHEN');
    expect(s).toMatch(/replace\(trim\(o\."LONGITUDE"\), ',', '\.'\)::double precision END\) END AS "LONGITUDE"/);
    expect(s).toContain('o."TELEFONE" AS "OFICINA_TELEFONE"');
    expect(s).toContain('ce.telefone AS "CADASTRO_TELEFONE"');
    expect(s).toContain('WHERE u_tel."ID_OFICINA" = o."ID_OFICINA" ) AS "USUARIOS"');
    expect(s).toContain('WHERE u_cm."ID_OFICINA" = o."ID_OFICINA" AND cm."EmpresaSlug" = $2 ) AS "MEMBRO_COMUNIDADE"');
    expect(s).toContain(
      'WHERE oi."ID_OFICINA" = o."ID_OFICINA" AND oi."EMPRESA_SLUG" = $2 AND oi."DELETED_AT" IS NULL ) AS "IMPORTADA"'
    );
    expect(s).toContain(
      "WHERE rp_rec.\"ID_OFICINA\" = o.\"ID_OFICINA\" AND cp_rec.\"ID_CAMPANHA\" = $1 AND nv_rec.\"STATUS\" = 'RECUSADO' ) AS \"RECUSOU_NESTA_CAMPANHA\""
    );
    expect(s).toContain(
      'WHERE rp."ID_OFICINA" = o."ID_OFICINA" AND cp."ID_CAMPANHA" = $1 AND rp."DELETED_AT" IS NULL AND cp."DELETED_AT" IS NULL'
    );
    expect(s).toContain(') rota ON TRUE');
    expect(s).toContain('rota."NV_STATUS" AS "ROTA_NV_STATUS"');
  });

  it("aplica os filtros com parâmetros a partir de $4", async () => {
    await OficinaService.buscarOficinasBase(
      { linhas: ["LEVE"], elevadoresMin: 2, uf: "SP", cidade: "Campinas" },
      ctx
    );

    const [sql, params] = queryMock.mock.calls[0];
    const s = normalizarSql(sql);
    expect(s).toContain("AND ce.status_receita = 'ATIVA' AND EXISTS ( SELECT 1 FROM \"MAIN_REGISTER\".\"LINHA_ATIVIDADE\" la");
    expect(s).toContain("= ANY($4::text[])");
    expect(s).toContain(">= $5");
    expect(s).toContain('upper(trim(o."ESTADO")) = $6');
    expect(s).toContain(`${sqlTextoNormalizado('o."CIDADE"')} = $7`);
    expect(params).toEqual([77, "zf", 5001, ["LEVE"], 2, "SP", "CAMPINAS"]);
  });

  it("5001 linhas → 5000 devolvidas e truncado: true", async () => {
    queryMock.mockResolvedValue(Array.from({ length: 5001 }, (_, i) => linha({ ID_OFICINA: i + 1 })));

    const r = await OficinaService.buscarOficinasBase({}, ctx);

    expect(r.oficinas).toHaveLength(5000);
    expect(r.oficinas[4999].ID_OFICINA).toBe(5000);
    expect(r.truncado).toBe(true);
  });

  it("5000 linhas → truncado: false", async () => {
    queryMock.mockResolvedValue(Array.from({ length: 5000 }, (_, i) => linha({ ID_OFICINA: i + 1 })));

    const r = await OficinaService.buscarOficinasBase({}, ctx);

    expect(r.oficinas).toHaveLength(5000);
    expect(r.truncado).toBe(false);
  });

  it("mapeia as flags, a rota atual e as coordenadas", async () => {
    queryMock.mockResolvedValue([
      linha({
        MEMBRO_COMUNIDADE: true,
        IMPORTADA: true,
        RECUSOU_NESTA_CAMPANHA: true,
        ROTA_ID_ROTA_PROMOTOR: 900,
        ROTA_ID_CAMPANHA_PROMOTOR: 31,
        ROTA_PROMOTOR_NOME: "Carlos",
        ROTA_NV_STATUS: "PENDENTE",
      }),
      linha({ ID_OFICINA: 11, USUARIOS: [{ ID_USUARIO: 2, CELULAR: null, TELEFONE: "1133334444" }] }),
    ]);

    const r = await OficinaService.buscarOficinasBase({}, ctx);

    expect(r.oficinas[0]).toEqual({
      ID_OFICINA: 10,
      NOME: "Oficina A",
      CIDADE: "Campinas",
      ESTADO: "SP",
      CEP: "13000-000",
      LATITUDE: -22.9,
      LONGITUDE: -47.06,
      semCoordenadas: false,
      membroComunidade: true,
      importada: true,
      temWhatsapp: true,
      recusouNestaCampanha: true,
      rotaAtual: { ID_ROTA_PROMOTOR: 900, ID_CAMPANHA_PROMOTOR: 31, promotorNome: "Carlos", estado: "agendada" },
    });
    expect(r.oficinas[1]).toMatchObject({
      membroComunidade: false,
      importada: false,
      temWhatsapp: false,
      recusouNestaCampanha: false,
      rotaAtual: null,
    });
  });

  it("semCoordenadas quando falta lat ou long numérico", async () => {
    queryMock.mockResolvedValue([
      linha({ ID_OFICINA: 1, LATITUDE: null, LONGITUDE: null }),
      linha({ ID_OFICINA: 2, LATITUDE: -22.9, LONGITUDE: null }),
      linha({ ID_OFICINA: 3, LATITUDE: "abc", LONGITUDE: "-47" }),
      linha({ ID_OFICINA: 4, LATITUDE: "-22.9", LONGITUDE: "-47.06" }),
    ]);

    const r = await OficinaService.buscarOficinasBase({}, ctx);

    expect(r.oficinas.map((o) => [o.ID_OFICINA, o.semCoordenadas, o.LATITUDE, o.LONGITUDE])).toEqual([
      [1, true, null, null],
      [2, true, null, null],
      [3, true, null, null],
      [4, false, -22.9, -47.06],
    ]);
  });
});

// T38 (CONV-12)
describe("OficinaService.opcoesFiltroBusca", () => {
  it("linhas distintas por upper(trim()) e UFs de 2 letras", async () => {
    queryMock
      .mockResolvedValueOnce([{ ROTULO: "Agricola" }, { ROTULO: "Leve" }])
      .mockResolvedValueOnce([{ UF: "MG" }, { UF: "SP" }]);

    const r = await OficinaService.opcoesFiltroBusca();

    expect(r).toEqual({ linhas: ["Agricola", "Leve"], ufs: ["MG", "SP"] });
    const linhasSql = normalizarSql(queryMock.mock.calls[0][0]);
    expect(linhasSql).toContain('SELECT DISTINCT ON (x.chave) x.rotulo AS "ROTULO"');
    expect(linhasSql).toContain('SELECT upper(trim(la."LINHA_ATIVIDADE")) AS chave');
    expect(linhasSql).toContain('FROM "MAIN_REGISTER"."LINHA_ATIVIDADE" la');
    expect(linhasSql).toContain("ORDER BY x.chave, x.n DESC, x.rotulo");
    const ufsSql = normalizarSql(queryMock.mock.calls[1][0]);
    expect(ufsSql).toContain('SELECT DISTINCT upper(trim(o."ESTADO")) AS "UF" FROM "MAIN_REGISTER"."OFICINA" o');
    expect(ufsSql).toContain("WHERE upper(trim(o.\"ESTADO\")) ~ '^[A-Z]{2}$'");
  });
});

describe("OficinaService.cidadesPorUf", () => {
  it("só cidades da UF pedida, distintas pela normalização do filtro", async () => {
    queryMock.mockResolvedValue([{ ROTULO: "Campinas" }, { ROTULO: "São Paulo" }]);

    const r = await OficinaService.cidadesPorUf("SP");

    expect(r).toEqual(["Campinas", "São Paulo"]);
    const [sql, params] = queryMock.mock.calls[0];
    const s = normalizarSql(sql);
    expect(s).toContain(`SELECT ${sqlTextoNormalizado('o."CIDADE"')} AS chave`);
    expect(s).toContain('FROM "MAIN_REGISTER"."OFICINA" o WHERE upper(trim(o."ESTADO")) = $1');
    expect(s).toContain("ORDER BY x.chave, x.n DESC, x.rotulo");
    expect(params).toEqual(["SP"]);
  });
});
