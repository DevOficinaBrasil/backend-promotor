import "./setup";
import { AppDataSourceSync } from "../../data-source";
import CampanhaPromotorService from "../../service/campanhaPromotorService";
import CampanhaService from "../../service/campanhaService";
import PromotorService from "../../service/promotorService";

describe("CampanhaPromotorService Integration", () => {
  let campanhaId: number;
  let campanha2Id: number;
  let promotorId: number;
  const cleanupCpIds: number[] = [];

  beforeAll(async () => {
    const campanha = await CampanhaService.createCampanha({ NOME: "__TEST_CP_CAMPANHA__" });
    campanhaId = campanha.ID_CAMPANHA!;

    const campanha2 = await CampanhaService.createCampanha({ NOME: "__TEST_CP_CAMPANHA_2__" });
    campanha2Id = campanha2.ID_CAMPANHA!;

    const { promotor } = await PromotorService.createPromotor({ NOME: "__TEST_CP_PROMOTOR__" });
    promotorId = promotor.ID_PROMOTOR!;
  });

  afterAll(async () => {
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
      `DELETE FROM "CAMPANHAS_OB"."CAMPANHA" WHERE "ID_CAMPANHA" = ANY($1)`, [[campanhaId, campanha2Id]]
    );
  });

  describe("linkCampanhaPromotor", () => {
    it("should link promotor to single campaign with default RAIO", async () => {
      const result = await CampanhaPromotorService.linkCampanhaPromotor(campanhaId, promotorId);

      expect(result).toHaveLength(1);
      expect(result[0].ID_CAMPANHA).toBe(campanhaId);
      expect(result[0].ID_PROMOTOR).toBe(promotorId);
      expect(result[0].RAIO).toBe(20);
      cleanupCpIds.push(result[0].ID_CAMPANHA_PROMOTOR!);
    });

    it("should link to multiple campaigns", async () => {
      const { promotor } = await PromotorService.createPromotor({ NOME: "__TEST_CP_MULTI__" });
      const result = await CampanhaPromotorService.linkCampanhaPromotor(
        [campanhaId, campanha2Id], promotor.ID_PROMOTOR!, 30
      );

      expect(result.length).toBeGreaterThanOrEqual(1);
      result.forEach(r => cleanupCpIds.push(r.ID_CAMPANHA_PROMOTOR!));

      // Cleanup extra promotor
      await AppDataSourceSync.query(
        `DELETE FROM "CAMPANHAS_OB"."PROMOTOR" WHERE "ID_PROMOTOR" = $1`, [promotor.ID_PROMOTOR]
      );
    });

    it("should not create duplicate links", async () => {
      // Already linked in first test
      const result = await CampanhaPromotorService.linkCampanhaPromotor(campanhaId, promotorId);
      expect(result).toEqual([]);
    });
  });

  describe("updateRaio", () => {
    it("should update RAIO", async () => {
      const cpId = cleanupCpIds[0];
      const updated = await CampanhaPromotorService.updateRaio(cpId, 50);

      expect(updated).not.toBeNull();
      expect(updated!.RAIO).toBe(50);
    });

    it("should return null for non-existent", async () => {
      const result = await CampanhaPromotorService.updateRaio(99999999, 10);
      expect(result).toBeNull();
    });
  });

  describe("getCampanhasByPromotor", () => {
    it("should return campaign IDs", async () => {
      const result = await CampanhaPromotorService.getCampanhasByPromotor(promotorId);
      expect(result).toContain(campanhaId);
    });

    it("should return empty for non-existent promotor", async () => {
      const result = await CampanhaPromotorService.getCampanhasByPromotor(99999999);
      expect(result).toEqual([]);
    });
  });

  describe("unlinkCampanhaPromotor", () => {
    it("should remove the link", async () => {
      // Create a link to unlink
      const { promotor } = await PromotorService.createPromotor({ NOME: "__TEST_CP_UNLINK__" });
      const links = await CampanhaPromotorService.linkCampanhaPromotor(campanhaId, promotor.ID_PROMOTOR!);
      const cpId = links[0].ID_CAMPANHA_PROMOTOR!;

      const removed = await CampanhaPromotorService.unlinkCampanhaPromotor(cpId);
      expect(removed).toHaveLength(1);

      // Verify it's gone
      const campaigns = await CampanhaPromotorService.getCampanhasByPromotor(promotor.ID_PROMOTOR!);
      expect(campaigns).not.toContain(campanhaId);

      await AppDataSourceSync.query(
        `DELETE FROM "CAMPANHAS_OB"."PROMOTOR" WHERE "ID_PROMOTOR" = $1`, [promotor.ID_PROMOTOR]
      );
    });

    it("should return empty for non-existent link", async () => {
      const result = await CampanhaPromotorService.unlinkCampanhaPromotor(99999999);
      expect(result).toEqual([]);
    });
  });
});
