import { StatusRota } from "../../entities/RotaPromotor";
import {
  agruparPorPromotor,
  agruparVisitasPorDia,
  descreverDiaPico,
  calcularAssertividade,
  calcularPeriodoSemanal,
  calcularProximosPassos,
  calcularVisaoGeral,
  listarCancelamentos,
  listarDestaquesDeCampo,
  parseDataPeriodoQuery,
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
    idPromotor: 1,
    nomePromotor: "Willian Ferreira",
    nomeOficina: "Oficina Teste",
    cidadeOficina: "São Paulo/SP",
    OBS: null,
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

describe("agruparPorPromotor", () => {
  it("agrupa concluidas/canceladas do periodo e acumulado por promotor — RELPROM-07", () => {
    const rotas = [
      rota({ idPromotor: 1, nomePromotor: "Willian", STATUS: StatusRota.FINALIZADO, DONE_AT: new Date("2026-10-15T10:00:00-03:00") }),
      rota({ idPromotor: 1, nomePromotor: "Willian", STATUS: StatusRota.FINALIZADO, DONE_AT: new Date("2026-09-01T10:00:00-03:00") }), // acumulado, fora do periodo
      rota({ idPromotor: 1, nomePromotor: "Willian", STATUS: StatusRota.BACKLOG }),
      rota({ idPromotor: 2, nomePromotor: "Djoni", STATUS: StatusRota.CANCELADO, UPDATED_AT: new Date("2026-10-16T10:00:00-03:00") }),
    ];

    const resultado = agruparPorPromotor(rotas, PERIODO);

    expect(resultado).toEqual([
      { idPromotor: 1, nomePromotor: "Willian", concluidasPeriodo: 1, canceladasPeriodo: 0, concluidasAcumulado: 2, abertasNaRota: 1 },
      { idPromotor: 2, nomePromotor: "Djoni", concluidasPeriodo: 0, canceladasPeriodo: 1, concluidasAcumulado: 0, abertasNaRota: 0 },
    ]);
  });

  it("inclui promotor com tudo zerado, sem omitir a linha", () => {
    const rotas = [rota({ idPromotor: 3, nomePromotor: "Vanessa", STATUS: StatusRota.BACKLOG, UPDATED_AT: new Date("2020-01-01T00:00:00-03:00") })];

    const resultado = agruparPorPromotor(rotas, PERIODO);

    expect(resultado).toEqual([
      { idPromotor: 3, nomePromotor: "Vanessa", concluidasPeriodo: 0, canceladasPeriodo: 0, concluidasAcumulado: 0, abertasNaRota: 1 },
    ]);
  });
});

describe("listarCancelamentos", () => {
  it("lista cancelamentos do periodo com promotor, oficina, cidade e obs — RELPROM-08", () => {
    const rotas = [
      rota({
        STATUS: StatusRota.CANCELADO,
        UPDATED_AT: new Date("2026-10-15T10:00:00-03:00"),
        nomeOficina: "Real Car",
        cidadeOficina: "Belo Horizonte/MG",
        OBS: "Promotor de folga",
      }),
    ];

    expect(listarCancelamentos(rotas, PERIODO)).toEqual([
      { idPromotor: 1, nomePromotor: "Willian Ferreira", nomeOficina: "Real Car", cidadeOficina: "Belo Horizonte/MG", obs: "Promotor de folga" },
    ]);
  });

  it("inclui cancelamento mesmo sem OBS (obs: null)", () => {
    const rotas = [rota({ STATUS: StatusRota.CANCELADO, UPDATED_AT: new Date("2026-10-15T10:00:00-03:00"), OBS: null })];

    expect(listarCancelamentos(rotas, PERIODO)[0].obs).toBeNull();
  });

  it("nao lista cancelamento fora do periodo", () => {
    const rotas = [rota({ STATUS: StatusRota.CANCELADO, UPDATED_AT: new Date("2026-09-01T10:00:00-03:00") })];

    expect(listarCancelamentos(rotas, PERIODO)).toEqual([]);
  });
});

describe("listarDestaquesDeCampo", () => {
  it("lista concluida e cancelada do periodo com OBS, agrupadas por status — RELPROM-09", () => {
    const rotas = [
      rota({ STATUS: StatusRota.FINALIZADO, DONE_AT: new Date("2026-10-15T10:00:00-03:00"), OBS: "Oficina fechada" }),
      rota({ STATUS: StatusRota.CANCELADO, UPDATED_AT: new Date("2026-10-16T10:00:00-03:00"), OBS: "Fora da area" }),
    ];

    const destaques = listarDestaquesDeCampo(rotas, PERIODO);

    expect(destaques).toEqual([
      expect.objectContaining({ status: "concluida", obs: "Oficina fechada" }),
      expect.objectContaining({ status: "cancelada", obs: "Fora da area" }),
    ]);
  });

  it("agrupa por status mesmo com entrada intercalada, nao so a ordem natural — RELPROM-09", () => {
    const rotas = [
      rota({ idPromotor: 1, STATUS: StatusRota.CANCELADO, UPDATED_AT: new Date("2026-10-14T10:00:00-03:00"), OBS: "Cancelada 1" }),
      rota({ idPromotor: 2, STATUS: StatusRota.FINALIZADO, DONE_AT: new Date("2026-10-15T10:00:00-03:00"), OBS: "Concluida 1" }),
      rota({ idPromotor: 3, STATUS: StatusRota.CANCELADO, UPDATED_AT: new Date("2026-10-16T10:00:00-03:00"), OBS: "Cancelada 2" }),
      rota({ idPromotor: 4, STATUS: StatusRota.FINALIZADO, DONE_AT: new Date("2026-10-17T10:00:00-03:00"), OBS: "Concluida 2" }),
    ];

    const destaques = listarDestaquesDeCampo(rotas, PERIODO);

    expect(destaques.map((d) => d.status)).toEqual(["concluida", "concluida", "cancelada", "cancelada"]);
    expect(destaques.map((d) => d.obs)).toEqual(["Concluida 1", "Concluida 2", "Cancelada 1", "Cancelada 2"]);
  });

  it("ignora visita sem OBS preenchido", () => {
    const rotas = [rota({ STATUS: StatusRota.FINALIZADO, DONE_AT: new Date("2026-10-15T10:00:00-03:00"), OBS: null })];

    expect(listarDestaquesDeCampo(rotas, PERIODO)).toEqual([]);
  });

  it("ignora status que nao e concluida nem cancelada, mesmo com OBS", () => {
    const rotas = [rota({ STATUS: StatusRota.BACKLOG, OBS: "Nota qualquer" })];

    expect(listarDestaquesDeCampo(rotas, PERIODO)).toEqual([]);
  });

  it("trunca OBS maior que 500 caracteres com reticencias — RELPROM-24", () => {
    const obsLongo = "a".repeat(600);
    const rotas = [rota({ STATUS: StatusRota.FINALIZADO, DONE_AT: new Date("2026-10-15T10:00:00-03:00"), OBS: obsLongo })];

    const [destaque] = listarDestaquesDeCampo(rotas, PERIODO);

    expect(destaque.obs).toBe(`${"a".repeat(500)}...`);
    expect(destaque.obs.length).toBe(503);
  });

  it("nao trunca OBS com exatamente 500 caracteres", () => {
    const obsNoLimite = "a".repeat(500);
    const rotas = [rota({ STATUS: StatusRota.FINALIZADO, DONE_AT: new Date("2026-10-15T10:00:00-03:00"), OBS: obsNoLimite })];

    expect(listarDestaquesDeCampo(rotas, PERIODO)[0].obs).toBe(obsNoLimite);
  });
});

describe("agruparVisitasPorDia", () => {
  it("agrupa concluidas e canceladas por dia, ordenado cronologicamente", () => {
    const rotas = [
      rota({ STATUS: StatusRota.FINALIZADO, DONE_AT: new Date("2026-10-15T10:00:00-03:00") }),
      rota({ STATUS: StatusRota.FINALIZADO, DONE_AT: new Date("2026-10-15T11:00:00-03:00") }),
      rota({ STATUS: StatusRota.CANCELADO, UPDATED_AT: new Date("2026-10-14T09:00:00-03:00") }),
      rota({ STATUS: StatusRota.FINALIZADO, DONE_AT: new Date("2026-10-16T09:00:00-03:00") }),
    ];

    expect(agruparVisitasPorDia(rotas, PERIODO)).toEqual([
      { dia: "14/10", diaSemana: "qua", concluidas: 0, canceladas: 1 },
      { dia: "15/10", diaSemana: "qui", concluidas: 2, canceladas: 0 },
      { dia: "16/10", diaSemana: "sex", concluidas: 1, canceladas: 0 },
    ]);
  });

  it("nao inclui dia sem nenhuma atividade (sem barra zerada)", () => {
    const rotas = [rota({ STATUS: StatusRota.FINALIZADO, DONE_AT: new Date("2026-10-15T10:00:00-03:00") })];

    const pontos = agruparVisitasPorDia(rotas, PERIODO);

    expect(pontos).toHaveLength(1);
    expect(pontos[0].dia).toBe("15/10");
  });

  it("ignora status que nao e concluida nem cancelada", () => {
    const rotas = [rota({ STATUS: StatusRota.BACKLOG })];

    expect(agruparVisitasPorDia(rotas, PERIODO)).toEqual([]);
  });

  it("ignora visita fora do periodo", () => {
    const rotas = [rota({ STATUS: StatusRota.FINALIZADO, DONE_AT: new Date("2026-09-01T10:00:00-03:00") })];

    expect(agruparVisitasPorDia(rotas, PERIODO)).toEqual([]);
  });
});

describe("descreverDiaPico", () => {
  const PONTOS = [
    { dia: "13/10", diaSemana: "ter", concluidas: 2, canceladas: 0 },
    { dia: "14/10", diaSemana: "qua", concluidas: 4, canceladas: 0 },
    { dia: "15/10", diaSemana: "qui", concluidas: 52, canceladas: 16 },
  ];

  it("escolhe o dia com mais concluidas e formata a frase — igual ao modelo do CON26-325", () => {
    expect(descreverDiaPico(PONTOS, 71)).toEqual({
      dia: "15/10",
      texto: "A quinta-feira 15/10 concentrou 52 das 71 visitas do período.",
    });
  });

  it("usa artigo 'O' pra domingo/sabado", () => {
    const pontos = [{ dia: "18/10", diaSemana: "sáb", concluidas: 5, canceladas: 0 }];

    expect(descreverDiaPico(pontos, 5)?.texto).toBe("O sábado 18/10 concentrou 5 das 5 visitas do período.");
  });

  it("retorna null quando nao ha nenhuma visita concluida no periodo", () => {
    expect(descreverDiaPico([], 0)).toBeNull();
    expect(descreverDiaPico([{ dia: "13/10", diaSemana: "ter", concluidas: 0, canceladas: 3 }], 0)).toBeNull();
  });
});

describe("calcularPeriodoSemanal", () => {
  it("sexta-feira cobre de sexta anterior 00:00 ate quinta imediatamente anterior 23:59:59.999 (America/Sao_Paulo) — RELPROM-15", () => {
    // 2026-10-30 e sexta-feira, 07:00 horario de Brasilia (UTC-3) = 10:00 UTC.
    const agora = new Date("2026-10-30T10:00:00.000Z");

    const periodo = calcularPeriodoSemanal(agora);

    expect(periodo.inicio.toISOString()).toBe("2026-10-23T03:00:00.000Z"); // sexta anterior 00:00 -03:00
    expect(periodo.fim.toISOString()).toBe("2026-10-30T02:59:59.999Z"); // quinta 23:59:59.999 -03:00
  });

  it("a janela tem exatamente 7 dias corridos", () => {
    const periodo = calcularPeriodoSemanal(new Date("2026-10-30T10:00:00.000Z"));

    const seteDiasMenos1ms = 7 * 24 * 60 * 60 * 1000 - 1;
    expect(periodo.fim.getTime() - periodo.inicio.getTime()).toBe(seteDiasMenos1ms);
  });
});

describe("parseDataPeriodoQuery", () => {
  it("data pura 'inicio' vira meia-noite em America/Sao_Paulo, nao meia-noite UTC", () => {
    expect(parseDataPeriodoQuery("2026-10-09", "inicio").toISOString()).toBe("2026-10-09T03:00:00.000Z");
  });

  it("data pura 'fim' vira fim do dia em America/Sao_Paulo", () => {
    expect(parseDataPeriodoQuery("2026-10-22", "fim").toISOString()).toBe("2026-10-23T02:59:59.999Z");
  });

  it("string com horario explicito passa direto, sem reancorar fuso", () => {
    expect(parseDataPeriodoQuery("2026-10-09T00:00:00.000Z", "inicio").toISOString()).toBe("2026-10-09T00:00:00.000Z");
  });
});

describe("calcularProximosPassos", () => {
  it("reaproveita visaoGeral (abertas/canceladas) e conta promotores sem registro — RELPROM-10", () => {
    const visaoGeral = { concluidas: 10, canceladas: 3, abertasNaRota: 7 };
    const porPromotor = [
      { idPromotor: 1, nomePromotor: "A", concluidasPeriodo: 2, canceladasPeriodo: 0, concluidasAcumulado: 2, abertasNaRota: 1 },
      { idPromotor: 2, nomePromotor: "B", concluidasPeriodo: 0, canceladasPeriodo: 1, concluidasAcumulado: 0, abertasNaRota: 2 },
    ];

    expect(calcularProximosPassos(visaoGeral, porPromotor)).toEqual({
      abertasNaRota: 7,
      canceladasARedistribuir: 3,
      promotoresSemRegistro: 1,
    });
  });
});
