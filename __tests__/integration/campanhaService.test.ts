import "./setup";
import { AppDataSourceSync } from "../../data-source";
import CampanhaService from "../../service/campanhaService";
import Campanha from "../../entities/Campanha";

describe("CampanhaService Integration", () => {
  const createdIds: number[] = [];

  afterAll(async () => {
    // Hard-delete test records
    if (createdIds.length > 0) {
      await AppDataSourceSync.query(
        `DELETE FROM "CAMPANHAS_OB"."CAMPANHA" WHERE "ID_CAMPANHA" = ANY($1)`,
        [createdIds]
      );
    }
  });

  describe("createCampanha", () => {
    it("should create a campaign and return with ID", async () => {
      const result = await CampanhaService.createCampanha({
        NOME: "__TEST_INTEGRATION_CAMPANHA__",
        OBJETIVO: "Teste",
        ID_CLIENT: 1,
      });

      expect(result.ID_CAMPANHA).toBeDefined();
      expect(result.NOME).toBe("__TEST_INTEGRATION_CAMPANHA__");
      createdIds.push(result.ID_CAMPANHA!);
    });
  });

  describe("findCampanhaById", () => {
    it("should find created campaign", async () => {
      const campanha = await CampanhaService.createCampanha({
        NOME: "__TEST_FIND_CAMPANHA__",
      });
      createdIds.push(campanha.ID_CAMPANHA!);

      const found = await CampanhaService.findCampanhaById(campanha.ID_CAMPANHA!);

      expect(found).not.toBeNull();
      expect(found!.NOME).toBe("__TEST_FIND_CAMPANHA__");
    });

    it("should return null for non-existent ID", async () => {
      const found = await CampanhaService.findCampanhaById(99999999);
      expect(found).toBeNull();
    });
  });

  describe("updateCampanha", () => {
    it("should update campaign name", async () => {
      const campanha = await CampanhaService.createCampanha({
        NOME: "__TEST_UPDATE_OLD__",
      });
      createdIds.push(campanha.ID_CAMPANHA!);

      const updated = await CampanhaService.updateCampanha(campanha.ID_CAMPANHA!, {
        NOME: "__TEST_UPDATE_NEW__",
      });

      expect(updated).not.toBeNull();
      expect(updated!.NOME).toBe("__TEST_UPDATE_NEW__");
    });

    it("should return null for non-existent campaign", async () => {
      const result = await CampanhaService.updateCampanha(99999999, { NOME: "X" });
      expect(result).toBeNull();
    });
  });

  describe("deleteCampanha", () => {
    it("should soft-delete campaign", async () => {
      const campanha = await CampanhaService.createCampanha({
        NOME: "__TEST_DELETE_CAMPANHA__",
      });
      createdIds.push(campanha.ID_CAMPANHA!);

      const deleted = await CampanhaService.deleteCampanha(campanha.ID_CAMPANHA!);
      expect(deleted).not.toBeNull();

      // Should not be findable after soft delete
      const found = await CampanhaService.findCampanhaById(campanha.ID_CAMPANHA!);
      expect(found).toBeNull();
    });

    it("should return null for non-existent campaign", async () => {
      const result = await CampanhaService.deleteCampanha(99999999);
      expect(result).toBeNull();
    });
  });

  describe("getAllCampanhas", () => {
    it("should return array of campaigns", async () => {
      const result = await CampanhaService.getAllCampanhas();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
