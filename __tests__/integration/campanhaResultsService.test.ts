import "./setup";
import { AppDataSourceSync } from "../../data-source";
import CampanhaResultsService from "../../service/campanhaResultsService";
import CampanhaService from "../../service/campanhaService";
import PromotorService from "../../service/promotorService";
import CampanhaPromotorService from "../../service/campanhaPromotorService";
import RotaService from "../../service/rotaService";
import CampanhaPerguntasService from "../../service/campanhaPerguntasService";
import { TipoPergunta } from "../../entities/CampanhaPerguntas";

describe("CampanhaResultsService Integration", () => {
  let campanhaId: number;
  let rotaId: number;
  let perguntaId: number;
  let promotorId: number;
  let campanhaPromotorId: number;
  const createdResultIds: number[] = [];

  beforeAll(async () => {
    const campanha = await CampanhaService.createCampanha({ NOME: "__TEST_RESULTS_CAMPANHA__" });
    campanhaId = campanha.ID_CAMPANHA!;

    const { promotor } = await PromotorService.createPromotor({ NOME: "__TEST_RESULTS_PROMOTOR__" });
    promotorId = promotor.ID_PROMOTOR!;

    const links = await CampanhaPromotorService.linkCampanhaPromotor(campanhaId, promotorId);
    campanhaPromotorId = links[0].ID_CAMPANHA_PROMOTOR!;

    const rota = await RotaService.createRotas(campanhaPromotorId, 1) as any;
    rotaId = rota.ID_ROTA_PROMOTOR!;

    const pergunta = await CampanhaPerguntasService.createCampanhaPergunta({
      PERGUNTA: "__TEST_RESULT_PERGUNTA__", TIPO: TipoPergunta.String, ID_CAMPANHA: campanhaId,
    });
    perguntaId = pergunta.ID_PERGUNTAS!;
  });

  afterAll(async () => {
    if (createdResultIds.length > 0) {
      await AppDataSourceSync.query(
        `DELETE FROM "CAMPANHAS_OB"."CAMPANHA_RESULTS" WHERE "ID_CAMPANHA_RESULTS" = ANY($1)`,
        [createdResultIds]
      );
    }
    await AppDataSourceSync.query(
      `DELETE FROM "CAMPANHAS_OB"."CAMPANHA_PERGUNTAS" WHERE "ID_PERGUNTAS" = $1`, [perguntaId]
    );
    await AppDataSourceSync.query(
      `DELETE FROM "CAMPANHAS_OB"."ROTA_PROMOTOR" WHERE "ID_ROTA_PROMOTOR" = $1`, [rotaId]
    );
    await AppDataSourceSync.query(
      `DELETE FROM "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" WHERE "ID_CAMPANHA_PROMOTOR" = $1`, [campanhaPromotorId]
    );
    await AppDataSourceSync.query(
      `DELETE FROM "CAMPANHAS_OB"."PROMOTOR" WHERE "ID_PROMOTOR" = $1`, [promotorId]
    );
    await AppDataSourceSync.query(
      `DELETE FROM "CAMPANHAS_OB"."CAMPANHA" WHERE "ID_CAMPANHA" = $1`, [campanhaId]
    );
  });

  describe("saveOrUpdateResult", () => {
    it("should create a new result", async () => {
      const result = await CampanhaResultsService.saveOrUpdateResult({
        ID_ROTA: rotaId,
        ID_PERGUNTA: perguntaId,
        RESPOSTA: "Resposta teste",
      });

      expect(result.ID_CAMPANHA_RESULTS).toBeDefined();
      expect(result.RESPOSTA).toBe("Resposta teste");
      createdResultIds.push(result.ID_CAMPANHA_RESULTS!);
    });

    it("should update existing result for same rota+pergunta", async () => {
      const result = await CampanhaResultsService.saveOrUpdateResult({
        ID_ROTA: rotaId,
        ID_PERGUNTA: perguntaId,
        RESPOSTA: "Resposta atualizada",
      });

      expect(result.RESPOSTA).toBe("Resposta atualizada");
      // Should not create new ID
      expect(createdResultIds).toContain(result.ID_CAMPANHA_RESULTS);
    });

    it("should throw for non-existent rota", async () => {
      await expect(
        CampanhaResultsService.saveOrUpdateResult({
          ID_ROTA: 99999999, ID_PERGUNTA: perguntaId, RESPOSTA: "X",
        })
      ).rejects.toThrow("Rota não encontrada.");
    });

    it("should throw for non-existent pergunta", async () => {
      await expect(
        CampanhaResultsService.saveOrUpdateResult({
          ID_ROTA: rotaId, ID_PERGUNTA: 99999999, RESPOSTA: "X",
        })
      ).rejects.toThrow("Pergunta não encontrada.");
    });
  });

  describe("findResultById", () => {
    it("should find with relations", async () => {
      const id = createdResultIds[0];
      const found = await CampanhaResultsService.findResultById(id);

      expect(found).not.toBeNull();
      expect(found!.ID_CAMPANHA_RESULTS).toBe(id);
    });

    it("should return null for non-existent", async () => {
      const found = await CampanhaResultsService.findResultById(99999999);
      expect(found).toBeNull();
    });
  });

  describe("updateResult", () => {
    it("should update result resposta", async () => {
      const id = createdResultIds[0];
      const updated = await CampanhaResultsService.updateResult(id, {
        RESPOSTA: "Nova resposta",
      });

      expect(updated).not.toBeNull();
      expect(updated!.RESPOSTA).toBe("Nova resposta");
    });

    it("should return null for non-existent", async () => {
      const result = await CampanhaResultsService.updateResult(99999999, { RESPOSTA: "X" });
      expect(result).toBeNull();
    });
  });

  describe("getResultsByRotaId", () => {
    it("should return results for rota", async () => {
      const results = await CampanhaResultsService.getResultsByRotaId(rotaId);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("should return empty for non-existent rota", async () => {
      const results = await CampanhaResultsService.getResultsByRotaId(99999999);
      expect(results).toEqual([]);
    });
  });

  describe("getResultsByCampanhaId", () => {
    it("should return results for campanha", async () => {
      const results = await CampanhaResultsService.getResultsByCampanhaId(campanhaId);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("should return empty for non-existent campanha", async () => {
      const results = await CampanhaResultsService.getResultsByCampanhaId(99999999);
      expect(results).toEqual([]);
    });
  });
});
