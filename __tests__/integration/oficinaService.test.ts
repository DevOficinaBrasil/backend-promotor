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
      // All results should be within the specified radius
      result.forEach((oficina) => {
        expect(oficina.distance).toBeLessThanOrEqual(50);
      });
    });

    it("should return empty for non-existent slug", async () => {
      const result = await OficinaService.getComunityNearbyOficinas(
        -23.5505, -46.6333, 20, "__nonexistent_slug__"
      );
      expect(result).toEqual([]);
    });

    it("should return empty for very small radius", async () => {
      const result = await OficinaService.getComunityNearbyOficinas(
        -23.5505, -46.6333, 0.001, "mobil"
      );
      expect(result).toEqual([]);
    });
  });
});
