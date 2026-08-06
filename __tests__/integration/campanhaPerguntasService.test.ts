import "./setup";
import { AppDataSourceSync } from "../../data-source";
import CampanhaPerguntasService from "../../service/campanhaPerguntasService";
import CampanhaService from "../../service/campanhaService";
import { TipoPergunta } from "../../entities/CampanhaPerguntas";

describe("CampanhaPerguntasService Integration", () => {
  let campanhaId: number;
  const createdPerguntaIds: number[] = [];

  beforeAll(async () => {
    const campanha = await CampanhaService.createCampanha({ NOME: "__TEST_PERGUNTAS_CAMPANHA__" });
    campanhaId = campanha.ID_CAMPANHA!;
  });

  afterAll(async () => {
    if (createdPerguntaIds.length > 0) {
      await AppDataSourceSync.query(
        `DELETE FROM "CAMPANHAS_OB"."CAMPANHA_PERGUNTA_OPCOES" WHERE "ID_PERGUNTAS" = ANY($1)`,
        [createdPerguntaIds]
      );
      await AppDataSourceSync.query(
        `DELETE FROM "CAMPANHAS_OB"."CAMPANHA_PERGUNTAS" WHERE "ID_PERGUNTAS" = ANY($1)`,
        [createdPerguntaIds]
      );
    }
    await AppDataSourceSync.query(
      `DELETE FROM "CAMPANHAS_OB"."CAMPANHA" WHERE "ID_CAMPANHA" = $1`, [campanhaId]
    );
  });

  describe("createCampanhaPergunta", () => {
    it("should create a simple String pergunta", async () => {
      const result = await CampanhaPerguntasService.createCampanhaPergunta({
        PERGUNTA: "__TEST_PERGUNTA_STRING__",
        TIPO: TipoPergunta.String,
        ID_CAMPANHA: campanhaId,
      });

      expect(result.ID_PERGUNTAS).toBeDefined();
      expect(result.PERGUNTA).toBe("__TEST_PERGUNTA_STRING__");
      createdPerguntaIds.push(result.ID_PERGUNTAS!);
    });

    it("should create Multi pergunta with opcoes", async () => {
      const result = await CampanhaPerguntasService.createCampanhaPergunta(
        { PERGUNTA: "__TEST_MULTI__", TIPO: TipoPergunta.Multi, ID_CAMPANHA: campanhaId },
        [{ LABEL: "Opção A", ORDEM: 1 }, { LABEL: "Opção B", ORDEM: 2 }]
      );

      expect(result.opcoes).toHaveLength(2);
      expect(result.opcoes[0].LABEL).toBe("Opção A");
      createdPerguntaIds.push(result.ID_PERGUNTAS!);
    });

    it("should throw for non-existent campanha", async () => {
      await expect(
        CampanhaPerguntasService.createCampanhaPergunta({
          PERGUNTA: "X", ID_CAMPANHA: 99999999,
        })
      ).rejects.toThrow("Campanha não encontrada.");
    });
  });

  describe("findCampanhaPerguntaById", () => {
    it("should find with opcoes", async () => {
      const created = await CampanhaPerguntasService.createCampanhaPergunta(
        { PERGUNTA: "__TEST_FIND__", TIPO: TipoPergunta.Multi, ID_CAMPANHA: campanhaId },
        [{ LABEL: "X", ORDEM: 1 }]
      );
      createdPerguntaIds.push(created.ID_PERGUNTAS!);

      const found = await CampanhaPerguntasService.findCampanhaPerguntaById(created.ID_PERGUNTAS!);

      expect(found).not.toBeNull();
      expect(found!.opcoes).toHaveLength(1);
    });

    it("should return null for non-existent", async () => {
      const found = await CampanhaPerguntasService.findCampanhaPerguntaById(99999999);
      expect(found).toBeNull();
    });
  });

  describe("updateCampanhaPergunta", () => {
    it("should update pergunta text", async () => {
      const created = await CampanhaPerguntasService.createCampanhaPergunta({
        PERGUNTA: "__TEST_UPD_OLD__", ID_CAMPANHA: campanhaId,
      });
      createdPerguntaIds.push(created.ID_PERGUNTAS!);

      const updated = await CampanhaPerguntasService.updateCampanhaPergunta(
        created.ID_PERGUNTAS!, { PERGUNTA: "__TEST_UPD_NEW__" }
      );

      expect(updated!.PERGUNTA).toBe("__TEST_UPD_NEW__");
    });

    it("should replace opcoes on update", async () => {
      const created = await CampanhaPerguntasService.createCampanhaPergunta(
        { PERGUNTA: "__TEST_OPCOES_REPLACE__", TIPO: TipoPergunta.Multi, ID_CAMPANHA: campanhaId },
        [{ LABEL: "Old", ORDEM: 1 }]
      );
      createdPerguntaIds.push(created.ID_PERGUNTAS!);

      const updated = await CampanhaPerguntasService.updateCampanhaPergunta(
        created.ID_PERGUNTAS!, {},
        [{ LABEL: "New1", ORDEM: 1 }, { LABEL: "New2", ORDEM: 2 }]
      );

      expect(updated!.opcoes).toHaveLength(2);
      expect(updated!.opcoes[0].LABEL).toBe("New1");
    });

    it("should return null for non-existent", async () => {
      const result = await CampanhaPerguntasService.updateCampanhaPergunta(99999999, {});
      expect(result).toBeNull();
    });
  });

  describe("deleteCampanhaPergunta", () => {
    it("should soft-delete pergunta", async () => {
      const created = await CampanhaPerguntasService.createCampanhaPergunta({
        PERGUNTA: "__TEST_DELETE__", ID_CAMPANHA: campanhaId,
      });
      createdPerguntaIds.push(created.ID_PERGUNTAS!);

      const deleted = await CampanhaPerguntasService.deleteCampanhaPergunta(created.ID_PERGUNTAS!);
      expect(deleted).not.toBeNull();

      const found = await CampanhaPerguntasService.findCampanhaPerguntaById(created.ID_PERGUNTAS!);
      expect(found).toBeNull();
    });
  });

  describe("getPerguntasByCampanhaId", () => {
    it("should return perguntas for campanha", async () => {
      const result = await CampanhaPerguntasService.getPerguntasByCampanhaId(campanhaId);
      expect(Array.isArray(result)).toBe(true);
    });

    it("should return empty for non-existent campanha", async () => {
      const result = await CampanhaPerguntasService.getPerguntasByCampanhaId(99999999);
      expect(result).toEqual([]);
    });
  });
});
