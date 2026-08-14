import "./setup";
import { readFileSync } from "fs";
import { join } from "path";
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

/**
 * VISIB-12 / P1 endereço AC6: "SHALL montar ENDERECO nas duas consultas em SQL
 * cru com TRIM sobre a concatenação de logradouro e rua, de modo que um
 * logradouro nulo não produza espaço à esquerda."
 *
 * Integração de propósito: o resultado de `CONCAT(NULL, ' ', x)` é semântica do
 * Postgres. A mesma expressão que as quatro consultas usam é executada aqui
 * contra o banco, com valores controlados.
 */
describe("montagem do ENDERECO nas consultas em SQL cru (VISIB-12)", () => {
  const EXPRESSAO = `TRIM(CONCAT(COALESCE(ce.logradouro,''), ' ', COALESCE(ce.rua,'')))`;
  const arquivo = readFileSync(
    join(__dirname, "..", "..", "service", "campanhaService.ts"),
    "utf-8"
  );

  const montar = async (logradouro: string | null, rua: string | null) => {
    const [linha] = await AppDataSourceSync.query(
      `SELECT ${EXPRESSAO} as "ENDERECO"
         FROM (SELECT $1::text as logradouro, $2::text as rua) ce`,
      [logradouro, rua]
    );
    return linha.ENDERECO as string;
  };

  it("monta tipo e nome separados por um único espaço", async () => {
    expect(await montar("Rua", "das Flores")).toBe("Rua das Flores");
  });

  it("não deixa espaço à esquerda quando o logradouro é nulo", async () => {
    expect(await montar(null, "Chacara do Ze")).toBe("Chacara do Ze");
  });

  it("não deixa espaço à direita quando a rua é nula", async () => {
    expect(await montar("Rua", null)).toBe("Rua");
  });

  it("devolve string vazia quando as duas colunas são nulas", async () => {
    expect(await montar(null, null)).toBe("");
  });

  // As quatro ocorrências incluem os dois caminhos de enriquecimento das rotas
  // legadas. Deixar uma de fora produz endereço com espaço à esquerda só para
  // rota legada — divergência que nenhum teste de payload pega.
  it("aplica a expressão nas quatro montagens de endereço do service", () => {
    expect(arquivo.split(EXPRESSAO).length - 1).toBe(4);
    expect(arquivo).not.toContain("CONCAT(ce.logradouro, ' ', ce.rua)");
  });
});
