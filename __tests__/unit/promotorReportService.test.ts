jest.mock("../../data-source");

import { AppDataSourceSync } from "../../data-source";
import PromotorReportService from "../../service/promotorReportService";
import { StatusRota } from "../../entities/RotaPromotor";
import { PeriodoRelatorio } from "../../utils/promotorReportCalculos";

const queryMock = AppDataSourceSync.query as jest.Mock;

const PERIODO: PeriodoRelatorio = {
  inicio: new Date("2026-10-09T00:00:00-03:00"),
  fim: new Date("2026-10-22T23:59:59-03:00"),
};
const AGORA = new Date("2026-10-23T08:45:00-03:00");
const CLIENTE = { idCliente: 10, nomeCliente: "SKF" };

beforeEach(() => jest.clearAllMocks());

describe("PromotorReportService.gerarRelatorioCliente", () => {
  it("retorna campanhas: [] quando o cliente nao tem campanha ativa — RELPROM-22", async () => {
    queryMock.mockResolvedValueOnce([]);

    const resultado = await PromotorReportService.gerarRelatorioCliente(CLIENTE, PERIODO, AGORA);

    expect(resultado).toEqual({ idCliente: 10, nomeCliente: "SKF", periodo: PERIODO, campanhas: [] });
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("cliente com exatamente 1 campanha ativa monta 1 unico bloco, identificado pelo nome dela — RELPROM-27", async () => {
    queryMock
      .mockResolvedValueOnce([{ ID_CAMPANHA: 1, NOME: "Campanha Unica" }])
      .mockResolvedValueOnce([]);

    const resultado = await PromotorReportService.gerarRelatorioCliente(CLIENTE, PERIODO, AGORA);

    expect(resultado.campanhas).toHaveLength(1);
    expect(resultado.campanhas[0].idCampanha).toBe(1);
    expect(resultado.campanhas[0].nomeCampanha).toBe("Campanha Unica");
  });

  it("monta 1 bloco por campanha ativa, com os dados calculados — RELPROM-01, RELPROM-26", async () => {
    queryMock
      .mockResolvedValueOnce([
        { ID_CAMPANHA: 1, NOME: "Campanha SKF" },
        { ID_CAMPANHA: 2, NOME: "Campanha Nova" },
      ])
      .mockResolvedValueOnce([
        {
          STATUS: StatusRota.FINALIZADO,
          DONE_AT: "2026-10-15T10:00:00-03:00",
          UPDATED_AT: "2026-10-15T10:00:00-03:00",
          OBS: null,
          idPromotor: 1,
          nomePromotor: "Willian",
          nomeOficina: "Oficina A",
          cidade: "São Paulo",
          estado: "SP",
        },
      ])
      .mockResolvedValueOnce([]);

    const resultado = await PromotorReportService.gerarRelatorioCliente(CLIENTE, PERIODO, AGORA);

    expect(resultado.campanhas).toHaveLength(2);
    expect(resultado.campanhas[0]).toMatchObject({
      idCampanha: 1,
      nomeCampanha: "Campanha SKF",
      visaoGeral: { concluidas: 1, canceladas: 0, abertasNaRota: 0 },
      assertividade: 100,
    });
    expect(resultado.campanhas[1]).toMatchObject({ idCampanha: 2, nomeCampanha: "Campanha Nova" });
    expect(resultado.campanhas[1].visaoGeral).toEqual({ concluidas: 0, canceladas: 0, abertasNaRota: 0 });
  });

  it("passa ID_CLIENT e a data de referencia pra query de campanhas ativas", async () => {
    queryMock.mockResolvedValueOnce([]);

    await PromotorReportService.gerarRelatorioCliente(CLIENTE, PERIODO, AGORA);

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('c."ID_CLIENT" = $1');
    expect(sql).toContain(`c."STATUS" = 'PUBLICADA'`);
    expect(params).toEqual([10, AGORA]);
  });

  it("exclui rota AGUARDANDO na query de rotas da campanha", async () => {
    queryMock.mockResolvedValueOnce([{ ID_CAMPANHA: 1, NOME: "Campanha SKF" }]).mockResolvedValueOnce([]);

    await PromotorReportService.gerarRelatorioCliente(CLIENTE, PERIODO, AGORA);

    const [sql] = queryMock.mock.calls[1];
    expect(sql).toContain(`rp."STATUS" IS DISTINCT FROM '${StatusRota.AGUARDANDO}'`);
  });

  it("usa 'Oficina sem nome' e '—' quando a oficina nao resolve (LEFT JOIN vazio)", async () => {
    queryMock
      .mockResolvedValueOnce([{ ID_CAMPANHA: 1, NOME: "Campanha SKF" }])
      .mockResolvedValueOnce([
        {
          STATUS: StatusRota.CANCELADO,
          DONE_AT: null,
          UPDATED_AT: "2026-10-15T10:00:00-03:00",
          OBS: "Loja nao existe",
          idPromotor: 1,
          nomePromotor: "Edson",
          nomeOficina: null,
          cidade: null,
          estado: null,
        },
      ]);

    const resultado = await PromotorReportService.gerarRelatorioCliente(CLIENTE, PERIODO, AGORA);

    const [cancelamento] = resultado.campanhas[0].cancelamentos;
    expect(cancelamento.nomeOficina).toBe("Oficina sem nome");
    expect(cancelamento.cidadeOficina).toBe("—");
  });
});
