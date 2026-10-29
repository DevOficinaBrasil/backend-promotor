import { StatusRota } from "../../entities/RotaPromotor";
import {
  calcularAssertividade,
  calcularVisaoGeral,
  PeriodoRelatorio,
  RotaPromotorRow,
} from "../../utils/promotorReportCalculos";

const PERIODO: PeriodoRelatorio = {
  inicio: new Date("2026-10-09T00:00:00-03:00"),
  fim: new Date("2026-10-22T23:59:59-03:00"),
};

function rota(partial: Partial<RotaPromotorRow>): RotaPromotorRow {
  return {
    STATUS: StatusRota.BACKLOG,
    DONE_AT: null,
    UPDATED_AT: new Date("2026-10-15T12:00:00-03:00"),
    ...partial,
  };
}

describe("calcularVisaoGeral", () => {
  it("conta concluidas (FINALIZADO) com DONE_AT dentro do periodo — RELPROM-02", () => {
    const rotas = [
      rota({ STATUS: StatusRota.FINALIZADO, DONE_AT: new Date("2026-10-15T10:00:00-03:00") }),
      rota({ STATUS: StatusRota.FINALIZADO, DONE_AT: new Date("2026-10-15T11:00:00-03:00") }),
      // fora do periodo, nao conta
      rota({ STATUS: StatusRota.FINALIZADO, DONE_AT: new Date("2026-09-01T10:00:00-03:00") }),
    ];

    expect(calcularVisaoGeral(rotas, PERIODO).concluidas).toBe(2);
  });

  it("conta canceladas (CANCELADO) com UPDATED_AT dentro do periodo — RELPROM-03", () => {
    const rotas = [
      rota({ STATUS: StatusRota.CANCELADO, UPDATED_AT: new Date("2026-10-15T10:00:00-03:00") }),
      // fora do periodo, nao conta
      rota({ STATUS: StatusRota.CANCELADO, UPDATED_AT: new Date("2026-09-01T10:00:00-03:00") }),
    ];

    expect(calcularVisaoGeral(rotas, PERIODO).canceladas).toBe(1);
  });

  it("conta abertas na rota (BACKLOG ou A_CAMINHO), independente do periodo — RELPROM-04", () => {
    const rotas = [
      rota({ STATUS: StatusRota.BACKLOG, UPDATED_AT: new Date("2020-01-01T00:00:00-03:00") }),
      rota({ STATUS: StatusRota.A_CAMINHO }),
      rota({ STATUS: StatusRota.EM_ANDAMENTO }),
      rota({ STATUS: StatusRota.FINALIZADO, DONE_AT: new Date("2026-10-15T10:00:00-03:00") }),
      rota({ STATUS: StatusRota.CANCELADO }),
    ];

    expect(calcularVisaoGeral(rotas, PERIODO).abertasNaRota).toBe(2);
  });

  it("exclui AGUARDANDO de abertas na rota", () => {
    const rotas = [rota({ STATUS: StatusRota.AGUARDANDO })];

    expect(calcularVisaoGeral(rotas, PERIODO).abertasNaRota).toBe(0);
  });

  it("inclui o limite superior do periodo (23:59:59) — RELPROM-25", () => {
    const rotas = [rota({ STATUS: StatusRota.FINALIZADO, DONE_AT: new Date(PERIODO.fim.getTime()) })];

    expect(calcularVisaoGeral(rotas, PERIODO).concluidas).toBe(1);
  });

  it("retorna tudo zerado para lista vazia — RELPROM-13", () => {
    expect(calcularVisaoGeral([], PERIODO)).toEqual({ concluidas: 0, canceladas: 0, abertasNaRota: 0 });
  });
});

describe("calcularAssertividade", () => {
  it("calcula o percentual arredondado — RELPROM-05", () => {
    expect(calcularAssertividade(71, 21)).toBe(77);
  });

  it("retorna N/A quando concluidas+canceladas = 0 — RELPROM-06", () => {
    expect(calcularAssertividade(0, 0)).toBe("N/A");
  });

  it("retorna 100 quando so ha concluidas", () => {
    expect(calcularAssertividade(5, 0)).toBe(100);
  });

  it("retorna 0 quando so ha canceladas", () => {
    expect(calcularAssertividade(0, 5)).toBe(0);
  });
});
