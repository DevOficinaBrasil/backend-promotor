import "./setup";
import { AppDataSourceSync } from "../../data-source";
import RotaService from "../../service/rotaService";
import CampanhaService from "../../service/campanhaService";
import PromotorService from "../../service/promotorService";
import CampanhaPromotorService from "../../service/campanhaPromotorService";
import { StatusRota } from "../../entities/RotaPromotor";
import { EstrategiaOrdenacao } from "../../entities/CampanhaPromotor";

describe("RotaService Integration", () => {
  let campanhaId: number;
  let promotorId: number;
  let campanhaPromotorId: number;
  const cleanupRotaIds: number[] = [];
  const cleanupCpIds: number[] = [];

  beforeAll(async () => {
    // Create test campaign + promotor + link
    const campanha = await CampanhaService.createCampanha({ NOME: "__TEST_ROTA_CAMPANHA__" });
    campanhaId = campanha.ID_CAMPANHA!;

    const { promotor } = await PromotorService.createPromotor({ NOME: "__TEST_ROTA_PROMOTOR__" });
    promotorId = promotor.ID_PROMOTOR!;

    const links = await CampanhaPromotorService.linkCampanhaPromotor(campanhaId, promotorId);
    campanhaPromotorId = links[0].ID_CAMPANHA_PROMOTOR!;
    cleanupCpIds.push(campanhaPromotorId);
  });

  afterAll(async () => {
    if (cleanupRotaIds.length > 0) {
      await AppDataSourceSync.query(
        `DELETE FROM "CAMPANHAS_OB"."ROTA_PROMOTOR" WHERE "ID_ROTA_PROMOTOR" = ANY($1)`,
        [cleanupRotaIds]
      );
    }
    if (cleanupCpIds.length > 0) {
      await AppDataSourceSync.query(
        `DELETE FROM "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" WHERE "ID_CAMPANHA_PROMOTOR" = ANY($1)`,
        [cleanupCpIds]
      );
    }
    await AppDataSourceSync.query(
      `DELETE FROM "CAMPANHAS_OB"."PROMOTOR" WHERE "ID_PROMOTOR" = $1`, [promotorId]
    );
    await AppDataSourceSync.query(
      `DELETE FROM "CAMPANHAS_OB"."CAMPANHA" WHERE "ID_CAMPANHA" = $1`, [campanhaId]
    );
  });

  describe("createRotas", () => {
    it("should create a single route", async () => {
      const rota = await RotaService.createRotas(campanhaPromotorId, 1) as any;

      expect(rota.ID_ROTA_PROMOTOR).toBeDefined();
      expect(rota.ID_CAMPANHA_PROMOTOR).toBe(campanhaPromotorId);
      expect(rota.STATUS).toBe(StatusRota.BACKLOG);
      cleanupRotaIds.push(rota.ID_ROTA_PROMOTOR);
    });

    it("should create batch routes", async () => {
      const rotas = await RotaService.createRotas(campanhaPromotorId, [2, 3]) as any[];

      expect(rotas).toHaveLength(2);
      rotas.forEach((r: any) => cleanupRotaIds.push(r.ID_ROTA_PROMOTOR));
    });
  });

  describe("findRotaById", () => {
    it("should find created route", async () => {
      const rota = await RotaService.createRotas(campanhaPromotorId, 4) as any;
      cleanupRotaIds.push(rota.ID_ROTA_PROMOTOR);

      const found = await RotaService.findRotaById(rota.ID_ROTA_PROMOTOR);

      expect(found).not.toBeNull();
      expect(found!.ID_OFICINA).toBe(4);
    });

    it("should return null for non-existent ID", async () => {
      const found = await RotaService.findRotaById(99999999);
      expect(found).toBeNull();
    });
  });

  describe("updateRotaOptions", () => {
    it("should update route status", async () => {
      const rota = await RotaService.createRotas(campanhaPromotorId, 5) as any;
      cleanupRotaIds.push(rota.ID_ROTA_PROMOTOR);

      const updated = await RotaService.updateRotaOptions(rota.ID_ROTA_PROMOTOR, {
        STATUS: StatusRota.FINALIZADO,
        OBS: "Test observation",
      });

      expect(updated).not.toBeNull();
      expect(updated!.STATUS).toBe(StatusRota.FINALIZADO);
      expect(updated!.OBS).toBe("Test observation");
    });

    it("should return null for non-existent route", async () => {
      const result = await RotaService.updateRotaOptions(99999999, { OBS: "X" });
      expect(result).toBeNull();
    });
  });

  describe("updateRotaWorkshops", () => {
    it("should add and remove workshops", async () => {
      // Create initial routes
      await RotaService.createRotas(campanhaPromotorId, [10, 11]) as any[];

      // Update: keep 10, remove 11, add 12
      const result = await RotaService.updateRotaWorkshops(campanhaPromotorId, [10, 12]);

      expect(result.created.length).toBeGreaterThanOrEqual(1);
      expect(result.deleted.length).toBeGreaterThanOrEqual(1);

      result.created.forEach((r: any) => cleanupRotaIds.push(r.ID_ROTA_PROMOTOR));
    });
  });

  describe("createRotaWithCampanhaPromotor", () => {
    it("should create campaign-promotor link and routes atomically", async () => {
      const result = await RotaService.createRotaWithCampanhaPromotor(
        promotorId, campanhaId, [20, 21]
      );

      expect(result.campanhaPromotor.ID_CAMPANHA_PROMOTOR).toBeDefined();
      expect(result.rotas).toHaveLength(2);

      cleanupCpIds.push(result.campanhaPromotor.ID_CAMPANHA_PROMOTOR!);
      result.rotas.forEach((r: any) => cleanupRotaIds.push(r.ID_ROTA_PROMOTOR));
    });
  });

  describe("reorderRotas", () => {
    it("should reorder routes manually", async () => {
      const rotas = await RotaService.createRotas(campanhaPromotorId, [30, 31]) as any[];
      rotas.forEach((r: any) => cleanupRotaIds.push(r.ID_ROTA_PROMOTOR));

      const result = await RotaService.reorderRotas(
        campanhaPromotorId,
        EstrategiaOrdenacao.MANUAL,
        rotas.map((r: any, i: number) => ({ ID_ROTA_PROMOTOR: r.ID_ROTA_PROMOTOR, ORDEM: i + 1 }))
      );

      expect(result.ESTRATEGIA_ORDENACAO).toBe(EstrategiaOrdenacao.MANUAL);
      expect(result.rotas.length).toBeGreaterThanOrEqual(2);
    });

    it("should throw for manual without array", async () => {
      await expect(
        RotaService.reorderRotas(campanhaPromotorId, EstrategiaOrdenacao.MANUAL)
      ).rejects.toThrow();
    });
  });

  describe("getOficinasAssignedInCampanha", () => {
    it("should return assigned oficina IDs", async () => {
      const result = await RotaService.getOficinasAssignedInCampanha(campanhaId);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("removeCampanhaPromotorRota", () => {
    it("should hard-delete all routes for a campaign-promotor", async () => {
      const links = await CampanhaPromotorService.linkCampanhaPromotor(campanhaId, promotorId);
      const cpId = links[0]?.ID_CAMPANHA_PROMOTOR;
      if (!cpId) return;
      cleanupCpIds.push(cpId);

      await RotaService.createRotas(cpId, [40, 41]);

      await RotaService.removeCampanhaPromotorRota(cpId);

      // Verify routes are gone
      const remaining = await AppDataSourceSync.query(
        `SELECT * FROM "CAMPANHAS_OB"."ROTA_PROMOTOR" WHERE "ID_CAMPANHA_PROMOTOR" = $1`,
        [cpId]
      );
      expect(remaining).toHaveLength(0);
    });
  });
});
