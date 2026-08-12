import "./setup";
import { AppDataSourceSync } from "../../data-source";
import PromotorService from "../../service/promotorService";

describe("PromotorService Integration", () => {
  const createdPromotorIds: number[] = [];
  const createdCpIds: number[] = [];

  afterAll(async () => {
    if (createdCpIds.length > 0) {
      await AppDataSourceSync.query(
        `DELETE FROM "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" WHERE "ID_CAMPANHA_PROMOTOR" = ANY($1)`,
        [createdCpIds]
      );
    }
    if (createdPromotorIds.length > 0) {
      await AppDataSourceSync.query(
        `DELETE FROM "CAMPANHAS_OB"."PROMOTOR" WHERE "ID_PROMOTOR" = ANY($1)`,
        [createdPromotorIds]
      );
    }
  });

  describe("createPromotor", () => {
    it("should create a promotor with encrypted password", async () => {
      const { promotor } = await PromotorService.createPromotor({
        NOME: "__TEST_PROMOTOR__",
        EMAIL: `__test_${Date.now()}@integration.test`,
        SENHA: "testpass123",
      });

      expect(promotor.ID_PROMOTOR).toBeDefined();
      expect(promotor.NOME).toBe("__TEST_PROMOTOR__");
      // Password should be encrypted (not plain text)
      expect(promotor.SENHA).not.toBe("testpass123");
      createdPromotorIds.push(promotor.ID_PROMOTOR!);
    });

    it("should create promotor without password", async () => {
      const { promotor } = await PromotorService.createPromotor({
        NOME: "__TEST_PROMOTOR_NO_PASS__",
      });

      expect(promotor.ID_PROMOTOR).toBeDefined();
      createdPromotorIds.push(promotor.ID_PROMOTOR!);
    });
  });

  describe("findPromotorById", () => {
    it("should find created promotor", async () => {
      const { promotor } = await PromotorService.createPromotor({
        NOME: "__TEST_FIND_PROMOTOR__",
      });
      createdPromotorIds.push(promotor.ID_PROMOTOR!);

      const found = await PromotorService.findPromotorById(promotor.ID_PROMOTOR!);

      expect(found).not.toBeNull();
      expect(found!.NOME).toBe("__TEST_FIND_PROMOTOR__");
    });

    it("should return null for non-existent ID", async () => {
      const found = await PromotorService.findPromotorById(99999999);
      expect(found).toBeNull();
    });
  });

  describe("updatePromotor", () => {
    it("should update promotor fields", async () => {
      const { promotor } = await PromotorService.createPromotor({
        NOME: "__TEST_UPDATE_OLD__",
      });
      createdPromotorIds.push(promotor.ID_PROMOTOR!);

      const updated = await PromotorService.updatePromotor(promotor.ID_PROMOTOR!, {
        NOME: "__TEST_UPDATE_NEW__",
      });

      expect(updated).not.toBeNull();
      expect(updated!.promotor.NOME).toBe("__TEST_UPDATE_NEW__");
    });

    it("should return null for non-existent promotor", async () => {
      const result = await PromotorService.updatePromotor(99999999, { NOME: "X" });
      expect(result).toBeNull();
    });
  });

  describe("deletePromotor", () => {
    it("should soft-delete promotor", async () => {
      const { promotor } = await PromotorService.createPromotor({
        NOME: "__TEST_DELETE_PROMOTOR__",
      });
      createdPromotorIds.push(promotor.ID_PROMOTOR!);

      const deleted = await PromotorService.deletePromotor(promotor.ID_PROMOTOR!);
      expect(deleted).not.toBeNull();

      const found = await PromotorService.findPromotorById(promotor.ID_PROMOTOR!);
      expect(found).toBeNull();
    });
  });

  describe("loginPromotor", () => {
    it("should authenticate with valid credentials", async () => {
      const email = `__test_login_${Date.now()}@integration.test`;
      const { promotor } = await PromotorService.createPromotor({
        NOME: "__TEST_LOGIN__",
        EMAIL: email,
        SENHA: "mypassword",
      });
      createdPromotorIds.push(promotor.ID_PROMOTOR!);

      const result = await PromotorService.loginPromotor(email, "mypassword");

      expect(result).not.toBeNull();
      expect(result!.ID_PROMOTOR).toBe(promotor.ID_PROMOTOR);
    });

    it("should return null for wrong password", async () => {
      const email = `__test_login_fail_${Date.now()}@integration.test`;
      const { promotor } = await PromotorService.createPromotor({
        NOME: "__TEST_LOGIN_FAIL__",
        EMAIL: email,
        SENHA: "correct",
      });
      createdPromotorIds.push(promotor.ID_PROMOTOR!);

      const result = await PromotorService.loginPromotor(email, "wrong");
      expect(result).toBeNull();
    });

    it("should return null for non-existent email", async () => {
      const result = await PromotorService.loginPromotor("nonexistent@x.com", "pass");
      expect(result).toBeNull();
    });
  });

  describe("getAllPromotores", () => {
    it("should return array", async () => {
      const result = await PromotorService.getAllPromotores();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
