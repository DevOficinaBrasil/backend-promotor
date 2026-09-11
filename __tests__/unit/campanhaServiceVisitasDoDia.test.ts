import CampanhaService from "../../service/campanhaService";
import { AppDataSourceSync } from "../../data-source";
import { createMockRepo } from "../helpers/mockRepo";

jest.mock("../../data-source");

describe("CampanhaService.getActiveCampanhaByPromotor — recorte por dia", () => {
  const cpRepo = createMockRepo();

  /** 2026-03-10, meio-dia em Brasília (15:00 UTC). */
  const AGORA = new Date("2026-03-10T15:00:00.000Z");

  const campanhaAtiva = {
    ID_CAMPANHA: 1,
    NOME: "Campanha",
    STATUS: "PUBLICADA",
    START_TIME: new Date("2026-01-01"),
    END_TIME: new Date("2026-12-31"),
  };

  const rotaBruta = (extra: Record<string, unknown> = {}) => ({
    ID_ROTA_PROMOTOR: 1,
    ID_OFICINA: 100,
    ID_CAMPANHA_PROMOTOR: 1,
    STATUS: "BACKLOG",
    ORDEM: 1,
    DATA_VISITA: null,
    NOME_FANTASIA: "Oficina A",
    ...extra,
  });

  /** SQL da consulta de rotas do app do promotor. */
  const sqlDeRotas = () =>
    (AppDataSourceSync.query as jest.Mock).mock.calls
      .map((chamada) => chamada[0] as string)
      .find((sql) => sql.includes('"CAMPANHAS_OB"."ROTA_PROMOTOR" rp'))!;

  /** Parâmetros da mesma consulta. */
  const parametrosDeRotas = () =>
    (AppDataSourceSync.query as jest.Mock).mock.calls.find((c) =>
      (c[0] as string).includes('"CAMPANHAS_OB"."ROTA_PROMOTOR" rp')
    )![1];

  beforeEach(() => {
    jest.clearAllMocks();
    (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(cpRepo);
    cpRepo.find.mockResolvedValue([
      {
        ID_CAMPANHA_PROMOTOR: 1,
        ID_PROMOTOR: 10,
        DELETED_AT: null,
        ESTRATEGIA_ORDENACAO: "MANUAL",
        campanha: campanhaAtiva,
      },
    ]);
    (AppDataSourceSync.query as jest.Mock).mockResolvedValue([rotaBruta()]);
  });

  describe("data de referência", () => {
    it("resolves today in the São Paulo calendar, not in UTC", () => {
      // 2026-03-11T02:00Z ainda é dia 10 em Brasília (UTC-3).
      expect(CampanhaService.diaDeReferencia(new Date("2026-03-11T02:00:00.000Z"))).toBe(
        "2026-03-10"
      );
    });

    it("rolls over to the next day once São Paulo passes midnight", () => {
      expect(CampanhaService.diaDeReferencia(new Date("2026-03-11T03:30:00.000Z"))).toBe(
        "2026-03-11"
      );
    });

    // APP-06
    it("returns the reference day in the envelope", async () => {
      const resultado = await CampanhaService.getActiveCampanhaByPromotor(10, AGORA);

      expect(resultado!.DATA_REFERENCIA).toBe("2026-03-10");
    });

    it("passes the very same day to the query, so filter and envelope cannot drift", async () => {
      const resultado = await CampanhaService.getActiveCampanhaByPromotor(10, AGORA);

      expect(parametrosDeRotas()[1]).toBe(resultado!.DATA_REFERENCIA);
    });
  });

  // L-004: a query é o que faz o recorte, então é o texto dela que precisa ser
  // afirmado. Linhas alimentadas à mão ao mock provariam só o mapeador.
  describe("texto da consulta", () => {
    it("keeps unfinished routes whose day is today or earlier, or that have no day", async () => {
      await CampanhaService.getActiveCampanhaByPromotor(10, AGORA);

      const sql = sqlDeRotas();
      expect(sql).toContain(`rp."STATUS" NOT IN ('FINALIZADO', 'CANCELADO')`);
      expect(sql).toMatch(/rp\."DATA_VISITA" IS NULL OR rp\."DATA_VISITA" <= \$2::date/);
    });

    it("keeps finished routes only when they were closed on the reference day", async () => {
      await CampanhaService.getActiveCampanhaByPromotor(10, AGORA);

      const sql = sqlDeRotas();
      expect(sql).toContain(`rp."STATUS" IN ('FINALIZADO', 'CANCELADO')`);
      expect(sql).toMatch(/rp\."DONE_AT"[\s\S]*::date = \$2::date/);
    });

    it("converts DONE_AT from UTC before taking its day", async () => {
      await CampanhaService.getActiveCampanhaByPromotor(10, AGORA);

      // O app de campo grava DONE_AT com toISOString, ou seja UTC, numa coluna
      // sem fuso. Interpretar o valor como hora local cortaria o histórico na
      // hora errada.
      expect(sqlDeRotas()).toContain(
        `rp."DONE_AT" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'`
      );
    });

    it("orders by day first, then by the order inside the day", async () => {
      await CampanhaService.getActiveCampanhaByPromotor(10, AGORA);

      expect(sqlDeRotas()).toContain(
        `ORDER BY rp."DATA_VISITA" ASC NULLS LAST, rp."ORDEM" ASC NULLS LAST`
      );
    });

    it("still selects every route column, so DATA_VISITA comes back", async () => {
      await CampanhaService.getActiveCampanhaByPromotor(10, AGORA);

      expect(sqlDeRotas()).toContain("rp.*");
    });

    it("keeps the visit-confirmation join that was already there", async () => {
      await CampanhaService.getActiveCampanhaByPromotor(10, AGORA);

      expect(sqlDeRotas()).toContain(`"CAMPANHAS_OB"."NOTIFICACAO_VISITA" nv`);
    });
  });

  describe("mapeamento da rota", () => {
    // APP-06
    it("carries DATA_VISITA through to the app payload", async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([
        rotaBruta({ DATA_VISITA: "2026-03-09" }),
      ]);

      const resultado = await CampanhaService.getActiveCampanhaByPromotor(10, AGORA);

      expect((resultado!.rotas[0] as any).DATA_VISITA).toBe("2026-03-09");
    });

    it("turns a missing day into null rather than dropping the field", async () => {
      const resultado = await CampanhaService.getActiveCampanhaByPromotor(10, AGORA);

      expect((resultado!.rotas[0] as any).DATA_VISITA).toBeNull();
    });

    it("preserves the order the query returned", async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([
        rotaBruta({ ID_ROTA_PROMOTOR: 5, DATA_VISITA: "2026-03-08" }),
        rotaBruta({ ID_ROTA_PROMOTOR: 6, DATA_VISITA: "2026-03-10" }),
        rotaBruta({ ID_ROTA_PROMOTOR: 7, DATA_VISITA: null }),
      ]);

      const resultado = await CampanhaService.getActiveCampanhaByPromotor(10, AGORA);

      expect(resultado!.rotas.map((r: any) => r.ID_ROTA_PROMOTOR)).toEqual([5, 6, 7]);
    });
  });
});
