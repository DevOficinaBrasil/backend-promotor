import { escolherPromotorMaisProximo } from "../../service/rotaService";
import { haversineDistanceKm } from "../../utils/haversine";

jest.mock("../../data-source");

// CONV-18: "atribuir cada oficina ao promotor vinculado mais próximo cujo raio
// a alcança, pela regra que já existe (haversine, desempate por
// ID_CAMPANHA_PROMOTOR)", e deixar sem rota as que nenhum raio alcança.
describe("escolherPromotorMaisProximo", () => {
  // Campinas centro. 0,1 grau de latitude ≈ 11,1 km.
  const oficina = { lat: -22.9, lon: -47.06 };
  const promotor = (ID_CAMPANHA_PROMOTOR: number, deltaLat: number, RAIO: number | null) => ({
    ID_CAMPANHA_PROMOTOR,
    lat: oficina.lat + deltaLat,
    lon: oficina.lon,
    RAIO,
  });

  it("escolhe o mais próximo entre os que alcançam a oficina", () => {
    const melhor = escolherPromotorMaisProximo(oficina, [
      promotor(1, 0.1, 50),
      promotor(2, 0.05, 50),
      promotor(3, 0.2, 50),
    ]);

    expect(melhor?.ID_CAMPANHA_PROMOTOR).toBe(2);
    expect(melhor?.distancia).toBeCloseTo(
      haversineDistanceKm(oficina.lat + 0.05, oficina.lon, oficina.lat, oficina.lon),
      6
    );
  });

  it("ignora o mais próximo quando o raio dele não alcança", () => {
    const melhor = escolherPromotorMaisProximo(oficina, [
      promotor(1, 0.05, 3),
      promotor(2, 0.1, 15),
    ]);

    expect(melhor?.ID_CAMPANHA_PROMOTOR).toBe(2);
  });

  it("desempata a mesma distância pelo menor ID_CAMPANHA_PROMOTOR", () => {
    const melhor = escolherPromotorMaisProximo(oficina, [
      promotor(9, 0.1, 50),
      promotor(4, 0.1, 50),
      promotor(7, 0.1, 50),
    ]);

    expect(melhor?.ID_CAMPANHA_PROMOTOR).toBe(4);
  });

  it("devolve null quando nenhum raio alcança", () => {
    expect(escolherPromotorMaisProximo(oficina, [promotor(1, 0.5, 20)])).toBeNull();
  });

  it("devolve null sem candidatos", () => {
    expect(escolherPromotorMaisProximo(oficina, [])).toBeNull();
  });

  it("trata RAIO nulo como 20 km", () => {
    // ~16,7 km: dentro de 20; ~27,8 km: fora.
    expect(escolherPromotorMaisProximo(oficina, [promotor(1, 0.15, null)])?.ID_CAMPANHA_PROMOTOR).toBe(1);
    expect(escolherPromotorMaisProximo(oficina, [promotor(1, 0.25, null)])).toBeNull();
  });

  it("aceita a oficina exatamente na borda do raio", () => {
    const distancia = haversineDistanceKm(oficina.lat + 0.1, oficina.lon, oficina.lat, oficina.lon);

    expect(
      escolherPromotorMaisProximo(oficina, [promotor(1, 0.1, distancia)])?.ID_CAMPANHA_PROMOTOR
    ).toBe(1);
  });
});
