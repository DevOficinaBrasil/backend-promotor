import RotaService from "../../service/rotaService";
import { AppDataSourceSync } from "../../data-source";
import { createMockRepo } from "../helpers/mockRepo";
import RotaPromotor, { StatusRota } from "../../entities/RotaPromotor";
import CampanhaPromotor, { EstrategiaOrdenacao } from "../../entities/CampanhaPromotor";

jest.mock("../../data-source");

describe("RotaService.agendarVisitas", () => {
  const rotaRepo = createMockRepo();
  const cpRepo = createMockRepo();
  /** Manager da transação, para inspecionar a ordem das escritas. */
  let manager: { update: jest.Mock };

  const campanha = {
    ID_CAMPANHA: 1,
    START_TIME: new Date("2026-03-01T00:00:00.000Z"),
    END_TIME: new Date("2026-03-31T00:00:00.000Z"),
  };

  const vinculo = {
    ID_CAMPANHA_PROMOTOR: 7,
    ID_CAMPANHA: 1,
    DELETED_AT: null,
    campanha,
  };

  const rota = (id: number, extra: Partial<RotaPromotor> = {}) => ({
    ID_ROTA_PROMOTOR: id,
    ID_CAMPANHA_PROMOTOR: 7,
    ID_OFICINA: 100 + id,
    STATUS: StatusRota.BACKLOG,
    DELETED_AT: null,
    ORDEM: null,
    DATA_VISITA: null,
    ...extra,
  });

  /** Campos gravados em cada chamada de update, na ordem em que aconteceram. */
  const escritas = () => manager.update.mock.calls.map((chamada) => chamada[2]);

  /**
   * Faz o repositorio se comportar como o real: devolve so as rotas cujos ids
   * foram pedidos. Sem isso o mock devolveria tudo, e a checagem de "rota fora
   * do vinculo" — que compara a quantidade pedida com a devolvida — nunca seria
   * exercitada de verdade.
   */
  const comRotasNoBanco = (rotasNoBanco: ReturnType<typeof rota>[]) => {
    rotaRepo.find.mockImplementation(async (opcoes: any) => {
      const pedidos: number[] = opcoes?.where?.ID_ROTA_PROMOTOR?._value ?? [];
      return rotasNoBanco.filter((r) => pedidos.includes(r.ID_ROTA_PROMOTOR));
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    manager = { update: jest.fn() };
    (AppDataSourceSync.transaction as jest.Mock).mockImplementation((cb: Function) => cb(manager));
    (AppDataSourceSync.getRepository as jest.Mock).mockImplementation((entity: unknown) =>
      entity === CampanhaPromotor ? cpRepo : rotaRepo
    );
    cpRepo.findOne.mockResolvedValue(vinculo);
    comRotasNoBanco([rota(1), rota(2), rota(3), rota(9)]);
  });

  // AGENDA-03
  it("writes the day and a 1..N order following the sequence it was given", async () => {
    await RotaService.agendarVisitas(7, "2026-03-10", [3, 1, 2]);

    const gravacoesFinais = escritas().slice(1);
    expect(gravacoesFinais).toEqual([
      { DATA_VISITA: "2026-03-10", ORDEM: 1 },
      { DATA_VISITA: "2026-03-10", ORDEM: 2 },
      { DATA_VISITA: "2026-03-10", ORDEM: 3 },
    ]);
  });

  it("targets the routes in the order they were listed", async () => {
    await RotaService.agendarVisitas(7, "2026-03-10", [3, 1, 2]);

    const alvosFinais = manager.update.mock.calls.slice(1).map((c) => c[1].ID_ROTA_PROMOTOR);
    expect(alvosFinais).toEqual([3, 1, 2]);
  });

  // AGENDA-06: a fase de limpeza é o que evita colidir com o índice único.
  it("clears ORDEM for every affected route before writing the new positions", async () => {
    await RotaService.agendarVisitas(7, "2026-03-10", [1, 2, 3]);

    expect(manager.update.mock.calls[0][2]).toEqual({ ORDEM: null });
  });

  it("clears ORDEM with null rather than undefined, which TypeORM would ignore", async () => {
    await RotaService.agendarVisitas(7, "2026-03-10", [1, 2, 3]);

    expect(manager.update.mock.calls[0][2].ORDEM).toBeNull();
  });

  // AGENDA-09
  it("clears the day and the order when the date is null", async () => {
    await RotaService.agendarVisitas(7, null, [1, 2]);

    const gravacoesFinais = escritas().slice(1);
    expect(gravacoesFinais).toEqual([
      { DATA_VISITA: null, ORDEM: null },
      { DATA_VISITA: null, ORDEM: null },
    ]);
  });

  it("unschedules the routes listed as leaving the day, inside the same transaction", async () => {
    await RotaService.agendarVisitas(7, "2026-03-10", [1, 2], [9]);

    const limpezaDeDia = manager.update.mock.calls.find(
      (c) => c[2].DATA_VISITA === null && c[2].ORDEM === undefined
    );
    expect(limpezaDeDia).toBeDefined();
    expect(limpezaDeDia![1].ID_ROTA_PROMOTOR).toBeDefined();
  });

  // AGENDA-04
  it("refuses a date before the campaign starts, without writing anything", async () => {
    await expect(RotaService.agendarVisitas(7, "2026-02-28", [1])).rejects.toThrow(
      "DATA_FORA_DO_PERIODO"
    );
    expect(manager.update).not.toHaveBeenCalled();
  });

  it("refuses a date after the campaign ends, without writing anything", async () => {
    await expect(RotaService.agendarVisitas(7, "2026-04-01", [1])).rejects.toThrow(
      "DATA_FORA_DO_PERIODO"
    );
    expect(manager.update).not.toHaveBeenCalled();
  });

  it("accepts the campaign's first and last day", async () => {
    await expect(RotaService.agendarVisitas(7, "2026-03-01", [1])).resolves.toBeDefined();
    await expect(RotaService.agendarVisitas(7, "2026-03-31", [1])).resolves.toBeDefined();
  });

  it("accepts a weekend day inside the campaign window", async () => {
    // 2026-03-07 é um sábado; a agenda não restringe dia da semana.
    await expect(RotaService.agendarVisitas(7, "2026-03-07", [1])).resolves.toBeDefined();
  });

  it("refuses to schedule when the campaign has no window", async () => {
    cpRepo.findOne.mockResolvedValue({ ...vinculo, campanha: { ID_CAMPANHA: 1 } });

    await expect(RotaService.agendarVisitas(7, "2026-03-10", [1])).rejects.toThrow(
      "CAMPANHA_SEM_PERIODO"
    );
    expect(manager.update).not.toHaveBeenCalled();
  });

  it("still allows unscheduling when the campaign has no window", async () => {
    cpRepo.findOne.mockResolvedValue({ ...vinculo, campanha: { ID_CAMPANHA: 1 } });

    await expect(RotaService.agendarVisitas(7, null, [1])).resolves.toBeDefined();
  });

  // AGENDA-05
  it("refuses the whole batch when one route is already finished", async () => {
    comRotasNoBanco([rota(1), rota(2, { STATUS: StatusRota.FINALIZADO })]);

    await expect(RotaService.agendarVisitas(7, "2026-03-10", [1, 2])).rejects.toThrow(
      "ROTA_JA_CONCLUIDA"
    );
    expect(manager.update).not.toHaveBeenCalled();
  });

  it("refuses the whole batch when one route is cancelled", async () => {
    comRotasNoBanco([rota(1), rota(2, { STATUS: StatusRota.CANCELADO })]);

    await expect(RotaService.agendarVisitas(7, "2026-03-10", [1, 2])).rejects.toThrow(
      "ROTA_JA_CONCLUIDA"
    );
  });

  it("accepts a route already under way", async () => {
    comRotasNoBanco([rota(1, { STATUS: StatusRota.EM_ANDAMENTO })]);

    await expect(RotaService.agendarVisitas(7, "2026-03-10", [1])).resolves.toBeDefined();
  });

  it("refuses the batch when a route does not belong to this vinculo", async () => {
    comRotasNoBanco([rota(1)]);

    await expect(RotaService.agendarVisitas(7, "2026-03-10", [1, 99])).rejects.toThrow(
      "ROTA_FORA_DO_VINCULO"
    );
    expect(manager.update).not.toHaveBeenCalled();
  });

  it("refuses an unknown vinculo", async () => {
    cpRepo.findOne.mockResolvedValue(null);

    await expect(RotaService.agendarVisitas(7, "2026-03-10", [1])).rejects.toThrow(
      "VINCULO_NAO_ENCONTRADO"
    );
  });

  it("refuses an empty batch", async () => {
    await expect(RotaService.agendarVisitas(7, "2026-03-10", [])).rejects.toThrow(
      "NENHUMA_ROTA_INFORMADA"
    );
  });

  // AGENDA-07
  it("produces the same writes when the same agenda is sent twice", async () => {
    await RotaService.agendarVisitas(7, "2026-03-10", [1, 2, 3]);
    const primeira = escritas();

    manager.update.mockClear();
    await RotaService.agendarVisitas(7, "2026-03-10", [1, 2, 3]);

    expect(escritas()).toEqual(primeira);
  });

  // AGENDA-08: a transação é o que garante o tudo-ou-nada.
  it("performs every write inside a single transaction", async () => {
    await RotaService.agendarVisitas(7, "2026-03-10", [1, 2, 3]);

    expect(AppDataSourceSync.transaction).toHaveBeenCalledTimes(1);
  });

  it("lets a failure inside the transaction propagate instead of half-writing", async () => {
    manager.update.mockRejectedValueOnce(new Error("deadlock"));

    await expect(RotaService.agendarVisitas(7, "2026-03-10", [1, 2, 3])).rejects.toThrow(
      "deadlock"
    );
  });

  it("marks the vinculo as manually ordered when a day is scheduled", async () => {
    await RotaService.agendarVisitas(7, "2026-03-10", [1, 2]);

    expect(cpRepo.update).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ ESTRATEGIA_ORDENACAO: EstrategiaOrdenacao.MANUAL })
    );
  });

  it("does not touch the ordering strategy when only unscheduling", async () => {
    await RotaService.agendarVisitas(7, null, [1, 2]);

    expect(cpRepo.update).not.toHaveBeenCalled();
  });

  it("returns the resulting day and routes", async () => {
    let leituras = 0;
    rotaRepo.find.mockImplementation(async () => {
      leituras += 1;
      // A primeira leitura valida o lote; a segunda devolve o estado ja gravado.
      return leituras === 1
        ? [rota(1), rota(2)]
        : [
            rota(1, { DATA_VISITA: "2026-03-10", ORDEM: 1 }),
            rota(2, { DATA_VISITA: "2026-03-10", ORDEM: 2 }),
          ];
    });

    const resultado = await RotaService.agendarVisitas(7, "2026-03-10", [1, 2]);

    expect(resultado).toEqual({
      ID_CAMPANHA_PROMOTOR: 7,
      DATA_VISITA: "2026-03-10",
      rotas: [
        { ID_ROTA_PROMOTOR: 1, ID_OFICINA: 101, ORDEM: 1, DATA_VISITA: "2026-03-10" },
        { ID_ROTA_PROMOTOR: 2, ID_OFICINA: 102, ORDEM: 2, DATA_VISITA: "2026-03-10" },
      ],
    });
  });
});
