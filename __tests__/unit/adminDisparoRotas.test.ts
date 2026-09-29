import { AppDataSourceSync } from "../../data-source";
import AdminDisparoService, {
  MSG_ENTRADA_ROTAS,
  MSG_JA_EM_ROTA,
  MSG_RECUSOU,
  MSG_SEM_WHATSAPP,
  MSG_VINCULO_OUTRA_CAMPANHA,
} from "../../service/adminDisparoService";
import RotaService from "../../service/rotaService";

jest.mock("../../data-source");
jest.mock("../../service/rotaService", () => {
  const real = jest.requireActual("../../service/rotaService");
  return { __esModule: true, ...real, default: { createRotas: jest.fn() } };
});

const normalizarSql = (sql: string) => sql.replace(/\s+/g, " ").trim();

// T18 (CONV-14 a CONV-18, CONV-38, CONV-47)
describe("AdminDisparoService.criarRotas", () => {
  const campanha = { ID_CAMPANHA: 77, ID_CLIENT: 5, EMPRESA_SLUG: "zf", END_TIME: null };
  // A em São Paulo (raio 10 km), B em Campinas (raio 5 km).
  const vinculos = [
    { ID_CAMPANHA_PROMOTOR: 31, RAIO: 10, NOME: "Carlos", LAT: -23.55, LNG: -46.63 },
    { ID_CAMPANHA_PROMOTOR: 32, RAIO: 5, NOME: "Ana", LAT: -22.9, LNG: -47.06 },
  ];
  const celular = [{ ID_USUARIO: 1, CELULAR: "11987654321", TELEFONE: null }];
  const semTelefone = [{ ID_USUARIO: 2, CELULAR: null, TELEFONE: "1133334444" }];

  const situacao = (over: Record<string, unknown>) => ({
    ID_OFICINA: 10,
    ROTA_ID_CAMPANHA_PROMOTOR: null,
    ROTA_PROMOTOR_NOME: null,
    RECUSOU_NESTA_CAMPANHA: false,
    IMPORTADA: false,
    USUARIOS: celular,
    OFICINA_TELEFONE: null,
    CADASTRO_TELEFONE: null,
    LATITUDE: -23.56,
    LONGITUDE: -46.64,
    ...over,
  });

  const queryMock = AppDataSourceSync.query as jest.Mock;
  const createRotasMock = RotaService.createRotas as jest.Mock;
  let linhasSituacao: unknown[];

  beforeEach(() => {
    linhasSituacao = [];
    queryMock.mockReset();
    queryMock.mockImplementation(async (sql: string) => {
      const s = normalizarSql(sql);
      if (s.includes("unnest($3::int[])")) return linhasSituacao;
      if (s.includes('cp."RAIO", p."NOME"')) return vinculos;
      if (s.includes('FROM "CAMPANHAS_OB"."CAMPANHA" c WHERE c."ID_CAMPANHA" = $1')) return [campanha];
      return [];
    });
    createRotasMock.mockReset();
    createRotasMock.mockImplementation(async (idCP: number, ids: number[]) =>
      ids.map((idOficina, i) => ({ ID_ROTA_PROMOTOR: 1000 + idCP * 10 + i, ID_CAMPANHA_PROMOTOR: idCP, ID_OFICINA: idOficina }))
    );
  });

  const sqlSituacao = () =>
    normalizarSql(queryMock.mock.calls.map(([sql]) => sql).find((sql) => sql.includes("unnest($3::int[])")));

  it("aceita oficina de fora da comunidade e cria a rota sem agendar nada (CONV-14, CONV-15)", async () => {
    linhasSituacao = [situacao({ ID_OFICINA: 10 })];

    const r = await AdminDisparoService.criarRotas(
      77,
      { atribuicoes: [{ idCampanhaPromotor: 31, idOficina: 10 }] },
      900
    );

    expect(createRotasMock).toHaveBeenCalledTimes(1);
    expect(createRotasMock).toHaveBeenCalledWith(31, [10], 900, { agendar: false });
    expect(r).toEqual({
      criadas: [{ ID_ROTA_PROMOTOR: 1310, ID_CAMPANHA_PROMOTOR: 31, ID_OFICINA: 10 }],
      conflitos: [],
      foraDoAlcance: [],
      semCoordenadas: [],
    });
    // A situação não consulta a comunidade: pertencer a ela não é requisito.
    expect(sqlSituacao()).not.toContain("USUARIO_COMMUNITY");
  });

  it("oficina já em rota nesta campanha → 409 com o promotor atual (CONV-16)", async () => {
    linhasSituacao = [situacao({ ID_OFICINA: 10, ROTA_ID_CAMPANHA_PROMOTOR: 32, ROTA_PROMOTOR_NOME: "Ana" })];

    const r = await AdminDisparoService.criarRotas(77, { atribuicoes: [{ idCampanhaPromotor: 31, idOficina: 10 }] });

    expect(r.conflitos).toEqual([
      { idOficina: 10, status: 409, motivo: MSG_JA_EM_ROTA, promotorAtual: { ID_CAMPANHA_PROMOTOR: 32, NOME: "Ana" } },
    ]);
    expect(MSG_JA_EM_ROTA).toBe("Oficina já está em rota nesta campanha");
    expect(createRotasMock).not.toHaveBeenCalled();
  });

  it("oficina que recusou nesta campanha → 409 'Oficina recusou a visita nesta campanha' (CONV-16, CONV-38)", async () => {
    linhasSituacao = [situacao({ ID_OFICINA: 10, RECUSOU_NESTA_CAMPANHA: true })];

    const r = await AdminDisparoService.criarRotas(77, { atribuicoes: [{ idCampanhaPromotor: 31, idOficina: 10 }] });

    expect(r.conflitos).toEqual([{ idOficina: 10, status: 409, motivo: "Oficina recusou a visita nesta campanha" }]);
    expect(MSG_RECUSOU).toBe("Oficina recusou a visita nesta campanha");
    expect(createRotasMock).not.toHaveBeenCalled();
  });

  it("sem WhatsApp e não importada → 422 'Oficina sem WhatsApp cadastrado' (CONV-17)", async () => {
    linhasSituacao = [
      situacao({ ID_OFICINA: 10, USUARIOS: semTelefone, OFICINA_TELEFONE: "1133335555" }),
      situacao({ ID_OFICINA: 11, USUARIOS: [] }),
    ];

    const r = await AdminDisparoService.criarRotas(77, {
      atribuicoes: [
        { idCampanhaPromotor: 31, idOficina: 10 },
        { idCampanhaPromotor: 31, idOficina: 11 },
      ],
    });

    expect(r.conflitos).toEqual([
      { idOficina: 10, status: 422, motivo: "Oficina sem WhatsApp cadastrado" },
      { idOficina: 11, status: 422, motivo: "Oficina sem WhatsApp cadastrado" },
    ]);
    expect(MSG_SEM_WHATSAPP).toBe("Oficina sem WhatsApp cadastrado");
    expect(createRotasMock).not.toHaveBeenCalled();
  });

  it("oficina importada sem WhatsApp é aceita (CONV-47)", async () => {
    linhasSituacao = [situacao({ ID_OFICINA: 10, USUARIOS: [], IMPORTADA: true })];

    const r = await AdminDisparoService.criarRotas(77, { atribuicoes: [{ idCampanhaPromotor: 31, idOficina: 10 }] });

    expect(r.conflitos).toEqual([]);
    expect(r.criadas).toEqual([{ ID_ROTA_PROMOTOR: 1310, ID_CAMPANHA_PROMOTOR: 31, ID_OFICINA: 10 }]);
  });

  it("os conflitos não impedem as demais atribuições", async () => {
    linhasSituacao = [
      situacao({ ID_OFICINA: 10, RECUSOU_NESTA_CAMPANHA: true }),
      situacao({ ID_OFICINA: 11 }),
    ];

    const r = await AdminDisparoService.criarRotas(77, {
      atribuicoes: [
        { idCampanhaPromotor: 31, idOficina: 10 },
        { idCampanhaPromotor: 31, idOficina: 11 },
      ],
    });

    expect(createRotasMock).toHaveBeenCalledWith(31, [11], undefined, { agendar: false });
    expect(r.criadas.map((c) => c.ID_OFICINA)).toEqual([11]);
    expect(r.conflitos.map((c) => c.idOficina)).toEqual([10]);
  });

  it("a mesma oficina duas vezes no pedido: a segunda vira 409 com o promotor da primeira", async () => {
    linhasSituacao = [situacao({ ID_OFICINA: 10 })];

    const r = await AdminDisparoService.criarRotas(77, {
      atribuicoes: [
        { idCampanhaPromotor: 31, idOficina: 10 },
        { idCampanhaPromotor: 32, idOficina: 10 },
      ],
    });

    expect(createRotasMock).toHaveBeenCalledTimes(1);
    expect(createRotasMock).toHaveBeenCalledWith(31, [10], undefined, { agendar: false });
    expect(r.conflitos).toEqual([
      { idOficina: 10, status: 409, motivo: MSG_JA_EM_ROTA, promotorAtual: { ID_CAMPANHA_PROMOTOR: 31, NOME: "Carlos" } },
    ]);
  });

  it("vínculo de outra campanha → 400 sem criar nada", async () => {
    await expect(
      AdminDisparoService.criarRotas(77, { atribuicoes: [{ idCampanhaPromotor: 99, idOficina: 10 }] })
    ).rejects.toMatchObject({ status: 400, message: MSG_VINCULO_OUTRA_CAMPANHA, extra: { idCampanhaPromotor: 99 } });
    expect(createRotasMock).not.toHaveBeenCalled();
  });

  it("distribuir: promotor mais próximo cujo raio alcança; o resto volta em foraDoAlcance (CONV-18)", async () => {
    linhasSituacao = [
      situacao({ ID_OFICINA: 10, LATITUDE: -23.56, LONGITUDE: -46.64 }), // ~1,4 km de A
      situacao({ ID_OFICINA: 11, LATITUDE: -22.91, LONGITUDE: -47.07 }), // ~1,5 km de B
      situacao({ ID_OFICINA: 12, LATITUDE: -15.8, LONGITUDE: -47.9 }), // Brasília
      situacao({ ID_OFICINA: 13, LATITUDE: null, LONGITUDE: null }),
    ];

    const r = await AdminDisparoService.criarRotas(77, { distribuir: true, idOficinas: [10, 11, 12, 13] }, 900);

    expect(createRotasMock).toHaveBeenCalledWith(31, [10], 900, { agendar: false });
    expect(createRotasMock).toHaveBeenCalledWith(32, [11], 900, { agendar: false });
    expect(r.criadas).toEqual([
      { ID_ROTA_PROMOTOR: 1310, ID_CAMPANHA_PROMOTOR: 31, ID_OFICINA: 10 },
      { ID_ROTA_PROMOTOR: 1320, ID_CAMPANHA_PROMOTOR: 32, ID_OFICINA: 11 },
    ]);
    expect(r.foraDoAlcance).toEqual([12]);
    // CONV-48: sem coordenadas não é "fora do alcance".
    expect(r.semCoordenadas).toEqual([13]);
  });

  it("distribuir: oficina sem coordenadas vai para semCoordenadas, sem rota (CONV-48)", async () => {
    linhasSituacao = [
      situacao({ ID_OFICINA: 10, LATITUDE: -23.56, LONGITUDE: -46.64 }),
      situacao({ ID_OFICINA: 20, LATITUDE: null, LONGITUDE: -46.64 }),
      situacao({ ID_OFICINA: 21, LATITUDE: "", LONGITUDE: "" }),
      situacao({ ID_OFICINA: 22, LATITUDE: "abc", LONGITUDE: "-46.6" }),
    ];

    const r = await AdminDisparoService.criarRotas(77, { distribuir: true, idOficinas: [10, 20, 21, 22] }, 900);

    expect(r.semCoordenadas).toEqual([20, 21, 22]);
    expect(r.foraDoAlcance).toEqual([]);
    expect(r.criadas).toEqual([{ ID_ROTA_PROMOTOR: 1310, ID_CAMPANHA_PROMOTOR: 31, ID_OFICINA: 10 }]);
    expect(createRotasMock).toHaveBeenCalledTimes(1);
    expect(createRotasMock).toHaveBeenCalledWith(31, [10], 900, { agendar: false });
  });

  it("atribuição manual de oficina sem coordenadas cria a rota (CONV-48)", async () => {
    linhasSituacao = [situacao({ ID_OFICINA: 10, LATITUDE: null, LONGITUDE: null })];

    const r = await AdminDisparoService.criarRotas(77, { atribuicoes: [{ idCampanhaPromotor: 32, idOficina: 10 }] }, 900);

    expect(createRotasMock).toHaveBeenCalledWith(32, [10], 900, { agendar: false });
    expect(r).toEqual({
      criadas: [{ ID_ROTA_PROMOTOR: 1320, ID_CAMPANHA_PROMOTOR: 32, ID_OFICINA: 10 }],
      conflitos: [],
      foraDoAlcance: [],
      semCoordenadas: [],
    });
  });

  it("distribuir também aplica as validações por oficina", async () => {
    linhasSituacao = [situacao({ ID_OFICINA: 10, USUARIOS: [] })];

    const r = await AdminDisparoService.criarRotas(77, { distribuir: true, idOficinas: [10] });

    expect(r.conflitos).toEqual([{ idOficina: 10, status: 422, motivo: MSG_SEM_WHATSAPP }]);
    expect(r.foraDoAlcance).toEqual([]);
    expect(createRotasMock).not.toHaveBeenCalled();
  });

  it("afirma a SQL da situação das oficinas (L-004)", async () => {
    linhasSituacao = [];

    await AdminDisparoService.criarRotas(77, { distribuir: true, idOficinas: [10, 11] });

    const s = sqlSituacao();
    const chamada = queryMock.mock.calls.find(([sql]) => sql.includes("unnest($3::int[])"))!;
    expect(chamada[1]).toEqual([77, "zf", [10, 11]]);
    expect(s).toContain('FROM unnest($3::int[]) AS ids(id_oficina) LEFT JOIN "MAIN_REGISTER"."OFICINA" o ON o."ID_OFICINA" = ids.id_oficina');
    expect(s).toContain("ce_por_id ON ce_por_id.id_oficina = ids.id_oficina");
    expect(s).toContain(
      'WHERE rp."ID_OFICINA" = ids.id_oficina AND cp."ID_CAMPANHA" = $1 AND rp."DELETED_AT" IS NULL AND cp."DELETED_AT" IS NULL'
    );
    expect(s).toContain('rota."ID_CAMPANHA_PROMOTOR" AS "ROTA_ID_CAMPANHA_PROMOTOR"');
    expect(s).toContain(
      "WHERE rp_rec.\"ID_OFICINA\" = ids.id_oficina AND cp_rec.\"ID_CAMPANHA\" = $1 AND nv_rec.\"STATUS\" = 'RECUSADO' ) AS \"RECUSOU_NESTA_CAMPANHA\""
    );
    expect(s).toContain(
      'WHERE oi."ID_OFICINA" = ids.id_oficina AND oi."EMPRESA_SLUG" = $2 AND oi."DELETED_AT" IS NULL ) AS "IMPORTADA"'
    );
    expect(s).toContain('WHERE u_tel."ID_OFICINA" = ids.id_oficina ) AS "USUARIOS"');
    // dw.cadastro_empresa.latitude é double precision e OFICINA.LATITUDE é varchar:
    // COALESCE entre os dois tipos falha no Postgres, então o par sai de uma fonte só,
    // com o texto da OFICINA convertido sob guarda.
    expect(s).not.toContain('COALESCE(ce.latitude, o."LATITUDE")');
    expect(s).not.toContain('COALESCE(ce.longitude, o."LONGITUDE")');
    expect(s).toContain("CASE WHEN ce.latitude IS NOT NULL AND ce.longitude IS NOT NULL THEN ce.latitude::double precision");
    expect(s).toContain(`replace(trim(o."LATITUDE"), ',', '.')`);
    expect(s).toMatch(/END AS "LATITUDE"/);
    expect(s).toMatch(/END AS "LONGITUDE"/);

    const vinc = normalizarSql(queryMock.mock.calls.map(([sql]) => sql).find((sql) => sql.includes('cp."RAIO", p."NOME"')));
    expect(vinc).toContain('WHERE cp."ID_CAMPANHA" = $1 AND cp."DELETED_AT" IS NULL');
  });

  it.each([
    ["vazio", {}],
    ["atribuições vazias", { atribuicoes: [] }],
    ["id não inteiro", { atribuicoes: [{ idCampanhaPromotor: "31", idOficina: 10 }] }],
    ["distribuir sem oficinas", { distribuir: true, idOficinas: [] }],
  ])("entrada inválida (%s) → 400", async (_, entrada) => {
    await expect(AdminDisparoService.criarRotas(77, entrada)).rejects.toMatchObject({
      status: 400,
      message: MSG_ENTRADA_ROTAS,
    });
    expect(queryMock).not.toHaveBeenCalled();
  });

  // T36 (CONV-16, CONV-38): rota CANCELADO (DELETE /rota/:id) não conta como
  // "já em rota"; a recusa feita nela continua bloqueando.
  it("a rota ativa da situação ignora rota CANCELADO, além de DELETED_AT (L-004)", async () => {
    linhasSituacao = [];

    await AdminDisparoService.criarRotas(77, { atribuicoes: [{ idCampanhaPromotor: 31, idOficina: 10 }] });

    expect(sqlSituacao()).toContain(
      'WHERE rp."ID_OFICINA" = ids.id_oficina AND cp."ID_CAMPANHA" = $1 AND rp."DELETED_AT" IS NULL AND cp."DELETED_AT" IS NULL AND rp."STATUS" IS DISTINCT FROM \'CANCELADO\' ORDER BY rp."ID_ROTA_PROMOTOR" DESC LIMIT 1 ) rota ON TRUE'
    );
  });

  it("oficina cuja única rota na campanha está CANCELADO é aceita, sem 409 (CONV-16)", async () => {
    // Com a rota cancelada fora do LATERAL, a situação volta sem rota ativa.
    linhasSituacao = [situacao({ ID_OFICINA: 10, ROTA_ID_CAMPANHA_PROMOTOR: null, ROTA_PROMOTOR_NOME: null })];

    const r = await AdminDisparoService.criarRotas(77, { atribuicoes: [{ idCampanhaPromotor: 31, idOficina: 10 }] });

    expect(r.conflitos).toEqual([]);
    expect(r.criadas).toEqual([{ ID_ROTA_PROMOTOR: 1310, ID_CAMPANHA_PROMOTOR: 31, ID_OFICINA: 10 }]);
    expect(createRotasMock).toHaveBeenCalledWith(31, [10], undefined, { agendar: false });
  });

  it("recusa numa rota cancelada continua bloqueando: 409 de recusa (CONV-38)", async () => {
    linhasSituacao = [
      situacao({ ID_OFICINA: 10, ROTA_ID_CAMPANHA_PROMOTOR: null, RECUSOU_NESTA_CAMPANHA: true }),
    ];

    const r = await AdminDisparoService.criarRotas(77, { atribuicoes: [{ idCampanhaPromotor: 31, idOficina: 10 }] });

    expect(r.conflitos).toEqual([{ idOficina: 10, status: 409, motivo: MSG_RECUSOU }]);
    expect(createRotasMock).not.toHaveBeenCalled();
    // A checagem de recusa olha todas as rotas da oficina na campanha, sem
    // filtrar status nem exclusão da rota.
    const recusa = sqlSituacao().match(/EXISTS \( SELECT 1 FROM "CAMPANHAS_OB"."ROTA_PROMOTOR" rp_rec.*?\) AS "RECUSOU_NESTA_CAMPANHA"/)![0];
    expect(recusa).not.toContain('rp_rec."STATUS"');
    expect(recusa).not.toContain('rp_rec."DELETED_AT"');
  });

  it("campanha inexistente → 404", async () => {
    queryMock.mockResolvedValue([]);

    await expect(
      AdminDisparoService.criarRotas(999, { atribuicoes: [{ idCampanhaPromotor: 31, idOficina: 10 }] })
    ).rejects.toMatchObject({ status: 404 });
    expect(createRotasMock).not.toHaveBeenCalled();
  });
});
