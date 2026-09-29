import { AppDataSourceSync } from "../../data-source";
import AdminDisparoService, { ESTADOS_CONVITE } from "../../service/adminDisparoService";

jest.mock("../../data-source");

const normalizarSql = (sql: string) => sql.replace(/\s+/g, " ").trim();

// T20 (CONV-41, CONV-42)
describe("AdminDisparoService.listarRotasComEstado", () => {
  const agora = new Date("2026-09-28T12:00:00.000Z");
  const futuro = new Date("2026-10-05T12:00:00.000Z");
  const passado = new Date("2026-09-20T12:00:00.000Z");
  const agendadaPara = new Date("2026-09-29T12:00:00.000Z");
  const queryMock = AppDataSourceSync.query as jest.Mock;

  let n = 0;
  const rota = (nv: Record<string, unknown> | null) => {
    n += 1;
    return {
      ID_ROTA_PROMOTOR: n,
      ID_CAMPANHA_PROMOTOR: 31,
      ID_OFICINA: 100 + n,
      STATUS_ROTA: "BACKLOG",
      oficinaNome: `Oficina ${n}`,
      promotorNome: "Carlos",
      NV_STATUS: nv?.STATUS ?? null,
      NV_EXPIRA_EM: nv?.EXPIRA_EM ?? null,
      NV_ORIGEM_ACEITE: nv?.ORIGEM_ACEITE ?? null,
      NV_AVAILABLE_AT: nv?.AVAILABLE_AT ?? null,
      NV_ENVIADO_EM: nv?.ENVIADO_EM ?? null,
      NV_CONFIRMADO_EM: nv?.CONFIRMADO_EM ?? null,
      NV_RECUSADO_EM: nv?.RECUSADO_EM ?? null,
    };
  };

  let linhas: unknown[];

  beforeEach(() => {
    n = 0;
    linhas = [
      rota(null), // nao_disparada
      rota({ STATUS: "PENDENTE", AVAILABLE_AT: agendadaPara }), // agendada
      rota({ STATUS: "ENVIADO", EXPIRA_EM: futuro, ENVIADO_EM: passado }), // enviada
      rota({ STATUS: "CONFIRMADO", ORIGEM_ACEITE: "REPARADOR", CONFIRMADO_EM: passado }), // aceita
      rota({ STATUS: "CONFIRMADO", ORIGEM_ACEITE: "CONFIRMACAO_RECENTE" }),
      rota({ STATUS: "CONFIRMADO", ORIGEM_ACEITE: "CONVITE_VINCULADO" }),
      rota({ STATUS: "CONFIRMADO", ORIGEM_ACEITE: "IMPORTADA" }),
      rota({ STATUS: "RECUSADO", RECUSADO_EM: passado }), // recusada
      rota({ STATUS: "ENVIADO", EXPIRA_EM: passado }), // expirada (derivada)
      rota({ STATUS: "FALHOU" }),
      rota({ STATUS: "DISPENSADO" }),
      rota({ STATUS: "AGUARDANDO" }),
      rota(null), // segunda não disparada
    ];
    queryMock.mockReset();
    queryMock.mockImplementation(async (sql: string) => {
      const s = normalizarSql(sql);
      if (s.includes('FROM "CAMPANHAS_OB"."CAMPANHA" c WHERE c."ID_CAMPANHA" = $1')) {
        return [{ ID_CAMPANHA: 77, ID_CLIENT: 5, EMPRESA_SLUG: "zf", END_TIME: null }];
      }
      if (s.includes('FROM "CAMPANHAS_OB"."ROTA_PROMOTOR" rp')) return linhas;
      return [];
    });
  });

  it("devolve cada rota com o estado do design, inclusive o expirado derivado", async () => {
    const r = await AdminDisparoService.listarRotasComEstado(77, undefined, agora);

    expect(r.rotas.map((x) => x.estado)).toEqual([
      "nao_disparada",
      "agendada",
      "enviada",
      "aceita",
      "aceita_confirmacao_recente",
      "aceita_convite_vinculado",
      "aceita_importada",
      "recusada",
      "expirada",
      "falhou",
      "dispensada",
      "aguardando",
      "nao_disparada",
    ]);
  });

  it("agendada traz a data de envio; os demais estados não", async () => {
    const r = await AdminDisparoService.listarRotasComEstado(77, undefined, agora);

    expect(r.rotas[1]).toEqual({
      ID_ROTA_PROMOTOR: 2,
      ID_CAMPANHA_PROMOTOR: 31,
      ID_OFICINA: 102,
      STATUS_ROTA: "BACKLOG",
      oficinaNome: "Oficina 2",
      promotorNome: "Carlos",
      estado: "agendada",
      agendadaPara,
      enviadoEm: null,
      confirmadoEm: null,
      recusadoEm: null,
    });
    expect(r.rotas.filter((x) => x.estado !== "agendada").every((x) => x.agendadaPara === null)).toBe(true);
    expect(r.rotas[2].enviadoEm).toEqual(passado);
    expect(r.rotas[7].recusadoEm).toEqual(passado);
  });

  it("totais sempre de todos os estados, com zero para os ausentes", async () => {
    linhas = linhas.slice(0, 2);

    const r = await AdminDisparoService.listarRotasComEstado(77, undefined, agora);

    expect(Object.keys(r.totaisPorEstado).sort()).toEqual([...ESTADOS_CONVITE].sort());
    expect(r.totaisPorEstado).toEqual({
      nao_disparada: 1,
      agendada: 1,
      enviada: 0,
      aceita: 0,
      aceita_confirmacao_recente: 0,
      aceita_convite_vinculado: 0,
      aceita_importada: 0,
      recusada: 0,
      expirada: 0,
      falhou: 0,
      dispensada: 0,
      aguardando: 0,
    });
  });

  it("filtro por estado devolve só aquele estado, mas os totais continuam de todos (CONV-42)", async () => {
    const r = await AdminDisparoService.listarRotasComEstado(77, "nao_disparada", agora);

    expect(r.rotas.map((x) => x.ID_ROTA_PROMOTOR)).toEqual([1, 13]);
    expect(r.totaisPorEstado.nao_disparada).toBe(2);
    expect(r.totaisPorEstado.recusada).toBe(1);
    expect(r.totaisPorEstado.aceita_importada).toBe(1);
    expect(Object.values(r.totaisPorEstado).reduce((a, b) => a + b, 0)).toBe(13);
  });

  it("estado desconhecido → 400", async () => {
    await expect(AdminDisparoService.listarRotasComEstado(77, "qualquer", agora)).rejects.toMatchObject({
      status: 400,
    });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("campanha inexistente → 404", async () => {
    queryMock.mockResolvedValue([]);

    await expect(AdminDisparoService.listarRotasComEstado(999, undefined, agora)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("afirma a SQL das rotas da campanha (L-004)", async () => {
    await AdminDisparoService.listarRotasComEstado(77, undefined, agora);

    const chamada = queryMock.mock.calls.find(([sql]) => sql.includes('"CAMPANHAS_OB"."ROTA_PROMOTOR" rp'))!;
    const s = normalizarSql(chamada[0]);
    expect(chamada[1]).toEqual([77]);
    expect(s).toContain('JOIN "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" cp ON cp."ID_CAMPANHA_PROMOTOR" = rp."ID_CAMPANHA_PROMOTOR"');
    expect(s).toContain('LEFT JOIN "CAMPANHAS_OB"."PROMOTOR" p ON p."ID_PROMOTOR" = cp."ID_PROMOTOR"');
    expect(s).toContain('LEFT JOIN "MAIN_REGISTER"."OFICINA" o ON o."ID_OFICINA" = rp."ID_OFICINA"');
    expect(s).toContain('LEFT JOIN "CAMPANHAS_OB"."NOTIFICACAO_VISITA" nv ON nv."ID_ROTA_PROMOTOR" = rp."ID_ROTA_PROMOTOR"');
    expect(s).toContain('WHERE cp."ID_CAMPANHA" = $1 AND rp."DELETED_AT" IS NULL AND cp."DELETED_AT" IS NULL');
    expect(s).toContain('nv."AVAILABLE_AT" AS "NV_AVAILABLE_AT"');
    expect(s).toContain('nv."ORIGEM_ACEITE" AS "NV_ORIGEM_ACEITE"');
    expect(s).toContain('nv."EXPIRA_EM" AS "NV_EXPIRA_EM"');
  });

  // T36 (CONV-42): rota CANCELADO não aparece nem entra nos totais.
  it("exclui rotas CANCELADO da lista e dos totais pela SQL (L-004)", async () => {
    await AdminDisparoService.listarRotasComEstado(77, undefined, agora);

    const chamada = queryMock.mock.calls.find(([sql]) => sql.includes('"CAMPANHAS_OB"."ROTA_PROMOTOR" rp'))!;
    expect(normalizarSql(chamada[0])).toContain(
      'WHERE cp."ID_CAMPANHA" = $1 AND rp."DELETED_AT" IS NULL AND cp."DELETED_AT" IS NULL AND rp."STATUS" IS DISTINCT FROM \'CANCELADO\' ORDER BY rp."ID_ROTA_PROMOTOR"'
    );
  });
});
