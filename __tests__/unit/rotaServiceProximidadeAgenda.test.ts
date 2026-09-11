import RotaService from "../../service/rotaService";
import { AppDataSourceSync } from "../../data-source";
import { createMockRepo } from "../helpers/mockRepo";
import CampanhaPromotor, { EstrategiaOrdenacao } from "../../entities/CampanhaPromotor";

jest.mock("../../data-source");

describe("RotaService.reorderRotas com agenda por dia", () => {
  const rotaRepo = createMockRepo();
  const cpRepo = createMockRepo();

  const rota = (id: number, dataVisita: string | null) => ({
    ID_ROTA_PROMOTOR: id,
    ID_CAMPANHA_PROMOTOR: 7,
    ID_OFICINA: 100 + id,
    ORDEM: id,
    DATA_VISITA: dataVisita,
    DELETED_AT: null,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (AppDataSourceSync.getRepository as jest.Mock).mockImplementation((entity: unknown) =>
      entity === CampanhaPromotor ? cpRepo : rotaRepo
    );
  });

  // AGENDA-11
  it("refuses GPS ordering when any route of the vinculo has a scheduled day", async () => {
    rotaRepo.find.mockResolvedValue([rota(1, null), rota(2, "2026-03-10")]);

    await expect(
      RotaService.reorderRotas(7, EstrategiaOrdenacao.PROXIMIDADE_PROMOTOR)
    ).rejects.toThrow("AGENDA_ATIVA_IMPEDE_PROXIMIDADE");
  });

  it("clears no order at all when it refuses", async () => {
    rotaRepo.find.mockResolvedValue([rota(1, "2026-03-10")]);

    await expect(
      RotaService.reorderRotas(7, EstrategiaOrdenacao.PROXIMIDADE_PROMOTOR)
    ).rejects.toThrow();
    expect(rotaRepo.update).not.toHaveBeenCalled();
  });

  it("does not change the vinculo's strategy when it refuses", async () => {
    rotaRepo.find.mockResolvedValue([rota(1, "2026-03-10")]);

    await expect(
      RotaService.reorderRotas(7, EstrategiaOrdenacao.PROXIMIDADE_PROMOTOR)
    ).rejects.toThrow();
    expect(cpRepo.update).not.toHaveBeenCalled();
  });

  it("still accepts GPS ordering while no route has a day", async () => {
    rotaRepo.find.mockResolvedValue([rota(1, null), rota(2, null)]);

    await expect(
      RotaService.reorderRotas(7, EstrategiaOrdenacao.PROXIMIDADE_PROMOTOR)
    ).resolves.toMatchObject({ ESTRATEGIA_ORDENACAO: EstrategiaOrdenacao.PROXIMIDADE_PROMOTOR });
  });

  it("accepts manual ordering even with a day agenda in place", async () => {
    rotaRepo.find.mockResolvedValue([rota(1, "2026-03-10"), rota(2, "2026-03-10")]);

    await expect(
      RotaService.reorderRotas(7, EstrategiaOrdenacao.MANUAL, [
        { ID_ROTA_PROMOTOR: 1, ORDEM: 2 },
        { ID_ROTA_PROMOTOR: 2, ORDEM: 1 },
      ])
    ).resolves.toMatchObject({ ESTRATEGIA_ORDENACAO: EstrategiaOrdenacao.MANUAL });
  });
});
