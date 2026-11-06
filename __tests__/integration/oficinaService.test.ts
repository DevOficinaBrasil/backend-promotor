import "./setup";
import { AppDataSourceSync } from "../../data-source";
import OficinaService from "../../service/oficinaService";

describe("OficinaService Integration", () => {
  describe("findNearestOficinas", () => {
    it("should return oficinas sorted by distance", async () => {
      // São Paulo coordinates
      const result = await OficinaService.findNearestOficinas(-23.5505, -46.6333, 5);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeLessThanOrEqual(5);

      if (result.length > 1) {
        // Should be sorted by distance ASC
        expect(result[0].distance).toBeLessThanOrEqual(result[1].distance!);
      }
    });

    it("should include default flag fields", async () => {
      const result = await OficinaService.findNearestOficinas(-23.5505, -46.6333, 1);

      if (result.length > 0) {
        expect(result[0]).toHaveProperty("flag_engajamento");
        expect(result[0]).toHaveProperty("flag_sentimento");
        expect(result[0]).toHaveProperty("flag_treinamento");
        expect(result[0]).toHaveProperty("cor_icone");
      }
    });

    it("should respect limit parameter", async () => {
      const result = await OficinaService.findNearestOficinas(-23.5505, -46.6333, 3);
      expect(result.length).toBeLessThanOrEqual(3);
    });
  });

  describe("getComunityNearbyOficinas", () => {
    it("should return oficinas within radius for valid slug", async () => {
      // Use a known empresaSlug - may return empty if community has no oficinas nearby
      const result = await OficinaService.getComunityNearbyOficinas(
        -23.5505, -46.6333, 50, "mobil"
      );

      expect(Array.isArray(result)).toBe(true);
      // Ramos 1/2 (comunidade, importada) respeitam o raio; o ramo 3 (match
      // Ultracar) não tem filtro de distância, por design (ULTRACAR-01/02) —
      // suas linhas vêm com distance null e ficam fora desta checagem.
      result.forEach((oficina) => {
        if (oficina.distance != null) {
          expect(oficina.distance).toBeLessThanOrEqual(50);
        }
      });
    });

    it("should return only Ultracar-matched oficinas (distance null) for a non-existent slug", async () => {
      const result = await OficinaService.getComunityNearbyOficinas(
        -23.5505, -46.6333, 20, "__nonexistent_slug__"
      );
      // Ramos 1/2 exigem o slug/comunidade existir; só o ramo 3 (sem filtro de
      // EMPRESA_SLUG) pode devolver linha para um slug inexistente.
      result.forEach((oficina) => {
        expect(oficina.distance).toBeNull();
      });
    });

    it("should return only Ultracar-matched oficinas for a very small radius (ramo 3 não filtra por distância, por design)", async () => {
      const result = await OficinaService.getComunityNearbyOficinas(
        -23.5505, -46.6333, 0.001, "mobil"
      );
      // Ramos 1 e 2 (comunidade, importada) respeitam o raio e ficam vazios
      // com 0.001km; qualquer linha que sobrar vem só do ramo 3 (match
      // Ultracar), que não tem filtro de raio (ULTRACAR-01/02, design.md).
      result.forEach((oficina) => {
        expect(oficina.distance).toBeNull();
      });
    });

    // ULTRACAR-11/13/14: dedupe entre os 3 ramos (comunidade, importada, match
    // Ultracar) e respeito ao timeout de 10s do banco, com o 3o ramo em jogo.
    it("should not return a duplicated ID_OFICINA across the 3 branches", async () => {
      const result = await OficinaService.getComunityNearbyOficinas(
        -23.5505, -46.6333, 50, "mobil"
      );

      const ids = result.map((o) => o.ID_OFICINA);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("should complete within the 10s database timeout", async () => {
      const inicio = Date.now();
      await OficinaService.getComunityNearbyOficinas(-23.5505, -46.6333, 50, "mobil");
      expect(Date.now() - inicio).toBeLessThanOrEqual(10000);
    });
  });

  describe("getCommunityOficinas", () => {
    it("should not return a duplicated ID_OFICINA across the 3 branches", async () => {
      const result = await OficinaService.getCommunityOficinas("mobil");

      const ids = result.map((o) => o.ID_OFICINA);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("should complete within the 10s database timeout", async () => {
      const inicio = Date.now();
      await OficinaService.getCommunityOficinas("mobil");
      expect(Date.now() - inicio).toBeLessThanOrEqual(10000);
    });
  });

  describe("countCommunityOficinas", () => {
    it("should not count a duplicated ID_OFICINA across the 3 branches (count matches the deduped list length)", async () => {
      const [total, lista] = await Promise.all([
        OficinaService.countCommunityOficinas("mobil"),
        OficinaService.getCommunityOficinas("mobil"),
      ]);

      expect(total).toBe(lista.length);
    });
  });

  describe("getCommunityOficinasSegmentadas", () => {
    it("should not return a duplicated ID_OFICINA across the 2 branches", async () => {
      const result = await OficinaService.getCommunityOficinasSegmentadas("mobil", [1, 2, 3]);

      const ids = result.map((o) => o.ID_OFICINA);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});
