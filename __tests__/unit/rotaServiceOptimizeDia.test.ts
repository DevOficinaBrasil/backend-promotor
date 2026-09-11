import RotaService from "../../service/rotaService";
import { AppDataSourceSync } from "../../data-source";
import { createMockRepo } from "../helpers/mockRepo";
import CampanhaPromotor, { EstrategiaOrdenacao } from "../../entities/CampanhaPromotor";
import { optimizeRoute, fetchOSRMRoute } from "../../utils/routeOptimizer";

jest.mock("../../data-source");
jest.mock("../../utils/routeOptimizer");

describe("RotaService.optimizeAndSaveRoute por dia", () => {
  const rotaRepo = createMockRepo();
  const cpRepo = createMockRepo();
  let manager: { update: jest.Mock };

  const rota = (id: number, dataVisita: string | null) => ({
    ID_ROTA_PROMOTOR: id,
    ID_OFICINA: 100 + id,
    DATA_VISITA: dataVisita,
    oficina: { NOME_FANTASIA: `Oficina ${id}`, LATITUDE: "-23.5", LONGITUDE: "-46.6" },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    manager = { update: jest.fn() };
    (AppDataSourceSync.transaction as jest.Mock).mockImplementation((cb: Function) => cb(manager));
    (AppDataSourceSync.getRepository as jest.Mock).mockImplementation((entity: unknown) =>
      entity === CampanhaPromotor ? cpRepo : rotaRepo
    );
    (optimizeRoute as jest.Mock).mockImplementation((pontos: any[]) => ({
      order: pontos.map((p, i) => ({ id: p.id, id_oficina: p.id_oficina, ordem: i + 1 })),
      totalDistanceKm: 12,
    }));
    (fetchOSRMRoute as jest.Mock).mockResolvedValue({ distanceKm: 15, geometry: { type: "LineString" } });
    rotaRepo.find.mockResolvedValue([rota(1, "2026-03-10"), rota(2, "2026-03-10")]);
  });

  /** Filtro `where` da consulta de rotas. */
  const filtroDaConsulta = () => rotaRepo.find.mock.calls[0][0].where;

  // OTIM-02
  it("restricts the query to the routes of the given day", async () => {
    await RotaService.optimizeAndSaveRoute(7, 101, 102, "2026-03-10");

    expect(filtroDaConsulta()).toMatchObject({
      ID_CAMPANHA_PROMOTOR: 7,
      DATA_VISITA: "2026-03-10",
    });
  });

  // OTIM-05
  it("does not filter by day when no day is given, keeping the old behaviour", async () => {
    await RotaService.optimizeAndSaveRoute(7, 101, 102);

    expect(filtroDaConsulta()).not.toHaveProperty("DATA_VISITA");
  });

  it("writes ORDEM only for the routes the query returned", async () => {
    await RotaService.optimizeAndSaveRoute(7, 101, 102, "2026-03-10");

    const alvos = manager.update.mock.calls.slice(1).map((c) => c[1].ID_ROTA_PROMOTOR);
    expect(alvos).toEqual([1, 2]);
  });

  it("clears the day's order before writing the new positions", async () => {
    await RotaService.optimizeAndSaveRoute(7, 101, 102, "2026-03-10");

    expect(manager.update.mock.calls[0][2]).toEqual({ ORDEM: null });
  });

  it("performs the whole write inside one transaction", async () => {
    await RotaService.optimizeAndSaveRoute(7, 101, 102, "2026-03-10");

    expect(AppDataSourceSync.transaction).toHaveBeenCalledTimes(1);
  });

  // OTIM-04
  it("marks the vinculo as optimally ordered", async () => {
    await RotaService.optimizeAndSaveRoute(7, 101, 102, "2026-03-10");

    expect(cpRepo.update).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ ESTRATEGIA_ORDENACAO: EstrategiaOrdenacao.ROTA_OTIMIZADA })
    );
  });

  // OTIM-08: com varios dias, um par unico de inicio e fim no vinculo nao faz
  // sentido — eles passam a ser derivados da ordem do proprio dia.
  it("leaves the vinculo's start and end untouched when a day is given", async () => {
    await RotaService.optimizeAndSaveRoute(7, 101, 102, "2026-03-10");

    const gravado = cpRepo.update.mock.calls[0][1];
    expect(gravado).not.toHaveProperty("ID_OFICINA_INICIO");
    expect(gravado).not.toHaveProperty("ID_OFICINA_FIM");
  });

  it("still writes the vinculo's start and end when no day is given", async () => {
    await RotaService.optimizeAndSaveRoute(7, 101, 102);

    expect(cpRepo.update.mock.calls[0][1]).toMatchObject({
      ID_OFICINA_INICIO: 101,
      ID_OFICINA_FIM: 102,
    });
  });

  it("echoes the day back in the result", async () => {
    const resultado = await RotaService.optimizeAndSaveRoute(7, 101, 102, "2026-03-10");

    expect(resultado.DATA_VISITA).toBe("2026-03-10");
  });

  // OTIM-07
  it("names the oficina without coordinates and changes no order", async () => {
    rotaRepo.find.mockResolvedValue([
      rota(1, "2026-03-10"),
      {
        ID_ROTA_PROMOTOR: 2,
        ID_OFICINA: 102,
        DATA_VISITA: "2026-03-10",
        oficina: { NOME_FANTASIA: "Auto Center Silva", LATITUDE: null, LONGITUDE: null },
      },
    ]);

    await expect(
      RotaService.optimizeAndSaveRoute(7, 101, 102, "2026-03-10")
    ).rejects.toThrow("Auto Center Silva");
    expect(manager.update).not.toHaveBeenCalled();
  });

  it("falls back to the oficina id when it has no trade name", async () => {
    rotaRepo.find.mockResolvedValue([
      { ID_ROTA_PROMOTOR: 2, ID_OFICINA: 102, DATA_VISITA: "2026-03-10", oficina: {} },
    ]);

    await expect(
      RotaService.optimizeAndSaveRoute(7, 101, 102, "2026-03-10")
    ).rejects.toThrow("Oficina 102");
  });

  it("reports the day when it holds no routes at all", async () => {
    rotaRepo.find.mockResolvedValue([]);

    await expect(
      RotaService.optimizeAndSaveRoute(7, 101, 102, "2026-03-10")
    ).rejects.toThrow("Nenhuma rota agendada para 2026-03-10 neste vínculo.");
  });

  // OTIM-06
  it("persists the order even when the street-geometry service is unavailable", async () => {
    (fetchOSRMRoute as jest.Mock).mockResolvedValue(null);

    const resultado = await RotaService.optimizeAndSaveRoute(7, 101, 102, "2026-03-10");

    expect(manager.update).toHaveBeenCalled();
    expect(resultado.route_geometry).toBeNull();
    expect(resultado.distancia_total_km).toBe(12);
  });
});
