import OficinaService, { normalizarCidade } from "../../service/oficinaService";
import { AppDataSourceSync } from "../../data-source";

jest.mock("../../data-source");

// T15: base Oficina Brasil (tenant 15) por região, com as flags do design
// (CONV-08, CONV-09, CONV-43, CONV-47).
describe("OficinaService.getOficinasBaseSegmentadas", () => {
  const ctx = { idCampanha: 77, empresaSlug: "zf" };
  const cidade = { uf: "sp", cidade: " São Paulo " };
  const raio = { lat: -22.9, lon: -47.06, raioKm: 30 };
  const normalizarSql = (sql: string) => sql.replace(/\s+/g, " ").trim();

  let queryMock: jest.Mock;

  const linha = (over: Record<string, unknown> = {}) => ({
    ID_OFICINA: 10,
    NOME: "Oficina A",
    CIDADE: "São Paulo",
    ESTADO: "SP",
    CEP: "01000-000",
    LATITUDE: -23.5,
    LONGITUDE: -46.6,
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

  beforeEach(() => {
    queryMock = AppDataSourceSync.query as jest.Mock;
    queryMock.mockReset();
    queryMock.mockResolvedValue([]);
  });

  it("não consulta nada sem usuários do CRM", async () => {
    const r = await OficinaService.getOficinasBaseSegmentadas([], cidade, ctx);

    expect(r).toEqual([]);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("UF + cidade: filtra ce.estado e a cidade sem acento dos dois lados", async () => {
    await OficinaService.getOficinasBaseSegmentadas([5, 6], cidade, ctx);

    const [sql, params] = queryMock.mock.calls[0];
    const s = normalizarSql(sql);
    expect(s).toContain("ce.estado = $3");
    expect(s).toContain(
      "translate(lower(trim(ce.cidade)), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') = $4"
    );
    expect(params).toEqual([77, "zf", "SP", "sao paulo", 5, 6]);
    expect(s).toContain('us."ID_USUARIO" IN ($5, $6)');
  });

  it("normaliza a cidade no TS igual ao SQL", () => {
    expect(normalizarCidade("  São João DEL-Rei ")).toBe("sao joao del-rei");
    expect(normalizarCidade("Paraúna")).toBe("parauna");
  });

  it("CEP + raio: haversine sobre ce.latitude/longitude limitado ao raio", async () => {
    await OficinaService.getOficinasBaseSegmentadas([5], raio, ctx);

    const [sql, params] = queryMock.mock.calls[0];
    const s = normalizarSql(sql);
    expect(s).toContain(
      "6371 * acos(LEAST(1.0, GREATEST(-1.0, cos(radians($3)) * cos(radians(ce.latitude)) * cos(radians(ce.longitude) - radians($4)) + sin(radians($3)) * sin(radians(ce.latitude)) ))) ) <= $5"
    );
    expect(s).not.toContain("ce.estado = $3");
    expect(params).toEqual([77, "zf", -22.9, -47.06, 30, 5]);
    expect(s).toContain('us."ID_USUARIO" IN ($6)');
  });

  it("consulta em lotes de 1000 ids", async () => {
    const ids = Array.from({ length: 2500 }, (_, i) => i + 1);

    await OficinaService.getOficinasBaseSegmentadas(ids, cidade, ctx);

    expect(queryMock).toHaveBeenCalledTimes(3);
    const lotes = queryMock.mock.calls.map(([, params]) => (params as unknown[]).slice(4));
    expect(lotes.map((l) => l.length)).toEqual([1000, 1000, 500]);
    expect(lotes[1][0]).toBe(1001);
    expect(lotes[2][499]).toBe(2500);
  });

  it("afirma joins, aliases e filtros da SQL (L-004)", async () => {
    await OficinaService.getOficinasBaseSegmentadas([5], cidade, ctx);

    const s = normalizarSql(queryMock.mock.calls[0][0]);
    // Base: USUARIO → OFICINA → dw.cadastro_empresa pela ligação canônica.
    expect(s).toContain('FROM "MAIN_REGISTER"."USUARIO" us LEFT JOIN "MAIN_REGISTER"."OFICINA" o ON o."ID_OFICINA" = us."ID_OFICINA"');
    expect(s).toContain('ce_por_id ON ce_por_id.id_oficina = us."ID_OFICINA"');
    expect(s).toContain("LEFT JOIN dw.cadastro_empresa ce_por_cnpj");
    expect(s).toContain("AND ce.cnpj_int IS NOT NULL AND ce.status_receita = 'ATIVA'");
    expect(s).toContain("ce.latitude IS NOT NULL AND ce.longitude IS NOT NULL");
    expect(s).toContain('SELECT DISTINCT ON (us."ID_OFICINA") us."ID_OFICINA" AS "ID_OFICINA"');
    expect(s).toContain('COALESCE(o."NOME_FANTASIA", ce.razao_social) AS "NOME"');
    // Candidatos de telefone: todos os usuários, na ordem do despacho.
    expect(s).toContain('o."TELEFONE" AS "OFICINA_TELEFONE"');
    expect(s).toContain('ce.telefone AS "CADASTRO_TELEFONE"');
    expect(s).toContain(
      'ORDER BY u_tel."DATA_ALTERACAO" DESC NULLS LAST, u_tel."ID_USUARIO" ASC), \'[]\'::json) FROM "MAIN_REGISTER"."USUARIO" u_tel WHERE u_tel."ID_OFICINA" = us."ID_OFICINA" ) AS "USUARIOS"'
    );
    // membroComunidade: USUARIO_COMMUNITY + COMMUNITIES do slug.
    expect(s).toContain('JOIN "MAIN_REGISTER"."USUARIO_COMMUNITY" uc ON uc."id_usuario" = u_cm."ID_USUARIO"');
    expect(s).toContain('JOIN "OFICINA_PORTAL"."COMMUNITIES" cm ON cm."CommunityID" = uc."id_community"');
    expect(s).toContain('WHERE u_cm."ID_OFICINA" = us."ID_OFICINA" AND cm."EmpresaSlug" = $2 ) AS "MEMBRO_COMUNIDADE"');
    // importada: OFICINA_IMPORTADA ativa para o slug.
    expect(s).toContain(
      'FROM "CAMPANHAS_OB"."OFICINA_IMPORTADA" oi WHERE oi."ID_OFICINA" = us."ID_OFICINA" AND oi."EMPRESA_SLUG" = $2 AND oi."DELETED_AT" IS NULL ) AS "IMPORTADA"'
    );
    // recusouNestaCampanha: notificação RECUSADO numa rota desta campanha.
    expect(s).toContain('ON nv_rec."ID_ROTA_PROMOTOR" = rp_rec."ID_ROTA_PROMOTOR"');
    expect(s).toContain(
      "AND cp_rec.\"ID_CAMPANHA\" = $1 AND nv_rec.\"STATUS\" = 'RECUSADO' ) AS \"RECUSOU_NESTA_CAMPANHA\""
    );
    // rotaAtual: rota ativa desta campanha, com promotor e notificação.
    expect(s).toContain('LEFT JOIN "CAMPANHAS_OB"."PROMOTOR" p ON p."ID_PROMOTOR" = cp."ID_PROMOTOR"');
    expect(s).toContain('LEFT JOIN "CAMPANHAS_OB"."NOTIFICACAO_VISITA" nv ON nv."ID_ROTA_PROMOTOR" = rp."ID_ROTA_PROMOTOR"');
    expect(s).toContain(
      'WHERE rp."ID_OFICINA" = us."ID_OFICINA" AND cp."ID_CAMPANHA" = $1 AND rp."DELETED_AT" IS NULL AND cp."DELETED_AT" IS NULL'
    );
    expect(s).toContain(') rota ON TRUE');
    expect(s).toContain('rota."PROMOTOR_NOME" AS "ROTA_PROMOTOR_NOME"');
    expect(s).toContain('rota."NV_STATUS" AS "ROTA_NV_STATUS"');
  });

  it("mapeia as flags e a rota atual com o estado do convite", async () => {
    queryMock.mockResolvedValue([
      linha({
        ID_OFICINA: 10,
        MEMBRO_COMUNIDADE: true,
        IMPORTADA: true,
        RECUSOU_NESTA_CAMPANHA: true,
        ROTA_ID_ROTA_PROMOTOR: 900,
        ROTA_ID_CAMPANHA_PROMOTOR: 31,
        ROTA_PROMOTOR_NOME: "Carlos",
        ROTA_NV_STATUS: "PENDENTE",
      }),
      linha({ ID_OFICINA: 11, ROTA_ID_ROTA_PROMOTOR: 901, ROTA_ID_CAMPANHA_PROMOTOR: 32, ROTA_PROMOTOR_NOME: "Ana" }),
      linha({ ID_OFICINA: 12 }),
    ]);

    const r = await OficinaService.getOficinasBaseSegmentadas([5], cidade, ctx);

    expect(r[0]).toEqual({
      ID_OFICINA: 10,
      NOME: "Oficina A",
      CIDADE: "São Paulo",
      ESTADO: "SP",
      CEP: "01000-000",
      LATITUDE: -23.5,
      LONGITUDE: -46.6,
      membroComunidade: true,
      importada: true,
      temWhatsapp: true,
      recusouNestaCampanha: true,
      rotaAtual: { ID_ROTA_PROMOTOR: 900, ID_CAMPANHA_PROMOTOR: 31, promotorNome: "Carlos", estado: "agendada" },
    });
    // Rota sem notificação: criada pelo admin e ainda não disparada.
    expect(r[1].rotaAtual).toEqual({
      ID_ROTA_PROMOTOR: 901,
      ID_CAMPANHA_PROMOTOR: 32,
      promotorNome: "Ana",
      estado: "nao_disparada",
    });
    expect(r[2]).toMatchObject({
      membroComunidade: false,
      importada: false,
      recusouNestaCampanha: false,
      rotaAtual: null,
    });
  });

  it("temWhatsapp segue resolverTelefone: fallback só para celular (CONV-43)", async () => {
    queryMock.mockResolvedValue([
      // Sem CELULAR, OFICINA.TELEFONE com formato de celular.
      linha({ ID_OFICINA: 1, USUARIOS: [{ ID_USUARIO: 1, CELULAR: null, TELEFONE: null }], OFICINA_TELEFONE: "(11) 98765-4321" }),
      // Só telefone fixo em todas as fontes.
      linha({
        ID_OFICINA: 2,
        USUARIOS: [{ ID_USUARIO: 2, CELULAR: "", TELEFONE: "1133334444" }],
        OFICINA_TELEFONE: "1133335555",
        CADASTRO_TELEFONE: "1133336666",
      }),
      // CELULAR preenchido mas inválido: não cai para o fallback.
      linha({ ID_OFICINA: 3, USUARIOS: [{ ID_USUARIO: 3, CELULAR: "123", TELEFONE: "11987654321" }] }),
      // Só dw.cadastro_empresa.telefone com celular.
      linha({ ID_OFICINA: 4, USUARIOS: [{ ID_USUARIO: 4, CELULAR: null, TELEFONE: null }], CADASTRO_TELEFONE: "11987650000" }),
    ]);

    const r = await OficinaService.getOficinasBaseSegmentadas([5], cidade, ctx);

    expect(r.map((o) => [o.ID_OFICINA, o.temWhatsapp])).toEqual([
      [1, true],
      [2, false],
      [3, false],
      [4, true],
    ]);
  });

  it("deduplica por ID_OFICINA entre lotes", async () => {
    const ids = Array.from({ length: 1001 }, (_, i) => i + 1);
    queryMock
      .mockResolvedValueOnce([linha({ ID_OFICINA: 10 }), linha({ ID_OFICINA: 11 })])
      .mockResolvedValueOnce([linha({ ID_OFICINA: 10, NOME: "repetida" }), linha({ ID_OFICINA: 12 })]);

    const r = await OficinaService.getOficinasBaseSegmentadas(ids, cidade, ctx);

    expect(r.map((o) => o.ID_OFICINA)).toEqual([10, 11, 12]);
    expect(r[0].NOME).toBe("Oficina A");
  });
});
