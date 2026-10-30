import {
  extrairNumeros,
  validarSintese,
  numerosValidosDaSecao,
  construirResumoCancelamentos,
  construirInsightsCampo,
  contemTextoVerbatim,
} from "../../utils/promotorReportSinteseValidacao";
import { CampanhaBlocoRelatorio } from "../../types/promotorRelatorio";
import { Cancelamento, DestaqueCampo, VisaoGeralCampanha } from "../../utils/promotorReportCalculos";

const BLOCO: CampanhaBlocoRelatorio = {
  idCampanha: 1,
  nomeCampanha: "Campanha SKF",
  visaoGeral: { concluidas: 71, canceladas: 21, abertasNaRota: 132 },
  visitasPorDia: [],
  assertividade: 77,
  porPromotor: [
    { idPromotor: 1, nomePromotor: "Willian", concluidasPeriodo: 15, canceladasPeriodo: 0, concluidasAcumulado: 18, abertasNaRota: 11 },
    { idPromotor: 2, nomePromotor: "José", concluidasPeriodo: 0, canceladasPeriodo: 13, concluidasAcumulado: 6, abertasNaRota: 11 },
  ],
  cancelamentos: [
    { idPromotor: 2, nomePromotor: "José", nomeOficina: "Real Car", cidadeOficina: "Belo Horizonte/MG", obs: "Promotor de folga" },
  ],
  destaquesDeCampo: [
    { status: "concluida", idPromotor: 1, nomePromotor: "Willian", nomeOficina: "Oficina A", cidadeOficina: "São Paulo/SP", obs: "Tudo certo" },
    { status: "cancelada", idPromotor: 2, nomePromotor: "José", nomeOficina: "Real Car", cidadeOficina: "Belo Horizonte/MG", obs: "Folga" },
    { status: "cancelada", idPromotor: 2, nomePromotor: "José", nomeOficina: "Ricar", cidadeOficina: "Belo Horizonte/MG", obs: "Folga" },
  ],
  proximosPassos: { abertasNaRota: 132, canceladasARedistribuir: 21, promotoresSemRegistro: 1 },
};

describe("extrairNumeros", () => {
  it("extrai inteiros, decimais e percentuais", () => {
    expect(extrairNumeros("77% de 92 visitas, media 1.5 por dia")).toEqual([77, 92, 1.5]);
  });

  it("retorna lista vazia quando nao ha numero nenhum", () => {
    expect(extrairNumeros("Willian lidera o periodo")).toEqual([]);
  });
});

describe("validarSintese", () => {
  it("retorna true pra frase sem nenhum numero", () => {
    expect(validarSintese("Willian lidera o periodo", [71, 21])).toBe(true);
  });

  it("retorna true quando todo numero da frase esta no conjunto valido", () => {
    expect(validarSintese("71 concluidas e 21 canceladas no periodo", [71, 21, 132])).toBe(true);
  });

  it("retorna false quando 1 numero da frase nao esta no conjunto valido — RELPROM-50", () => {
    expect(validarSintese("71 concluidas e 99 canceladas no periodo", [71, 21, 132])).toBe(false);
  });
});

describe("numerosValidosDaSecao", () => {
  it("visaoGeral: concluidas, canceladas, abertasNaRota", () => {
    expect(numerosValidosDaSecao("visaoGeral", BLOCO).sort((a, b) => a - b)).toEqual([21, 71, 132]);
  });

  it("assertividade: concluidas, canceladas, soma e o percentual", () => {
    expect(numerosValidosDaSecao("assertividade", BLOCO).sort((a, b) => a - b)).toEqual([21, 71, 77, 92]);
  });

  it("assertividade: nao inclui numero quando assertividade e 'N/A'", () => {
    const bloco = { ...BLOCO, assertividade: "N/A" as const };
    expect(numerosValidosDaSecao("assertividade", bloco).sort((a, b) => a - b)).toEqual([21, 71, 92]);
  });

  it("porPromotor: os 4 contadores de cada linha + os totais", () => {
    const numeros = numerosValidosDaSecao("porPromotor", BLOCO);
    expect(numeros).toEqual(expect.arrayContaining([15, 0, 18, 11, 0, 13, 6, 11, 15, 13, 24, 22]));
  });

  it("cancelamentos: a contagem total", () => {
    expect(numerosValidosDaSecao("cancelamentos", BLOCO)).toEqual([1]);
  });

  it("destaques: concluidas com obs, canceladas com obs e o total", () => {
    expect(numerosValidosDaSecao("destaques", BLOCO)).toEqual([1, 2, 3]);
  });

  it("proximosPassos: abertasNaRota, canceladasARedistribuir, promotoresSemRegistro", () => {
    expect(numerosValidosDaSecao("proximosPassos", BLOCO)).toEqual([132, 21, 1]);
  });
});

describe("construirResumoCancelamentos", () => {
  const CANCELAMENTOS: Cancelamento[] = [
    { idPromotor: 2, nomePromotor: "José", nomeOficina: "Real Car", cidadeOficina: "Belo Horizonte/MG", obs: "Folga" },
    { idPromotor: 2, nomePromotor: "José", nomeOficina: "Ricar", cidadeOficina: "Belo Horizonte/MG", obs: "Folga" },
    { idPromotor: 1, nomePromotor: "Willian", nomeOficina: "Oficina Center", cidadeOficina: "Contagem/MG", obs: "Fechada" },
  ];

  it("monta 1 linha por grupo, com promotor/oficinas/cidade dos dados reais — RELPROM-54", () => {
    const resultado = construirResumoCancelamentos(CANCELAMENTOS, [
      { indices: [0, 1], justificativa: "2 oficinas canceladas por folga do promotor" },
      { indices: [2], justificativa: "Oficina fechada no dia da visita" },
    ]);

    expect(resultado).toEqual([
      { promotor: "José", oficinas: ["Real Car", "Ricar"], cidade: "Belo Horizonte/MG", justificativa: "2 oficinas canceladas por folga do promotor" },
      { promotor: "Willian", oficinas: ["Oficina Center"], cidade: "Contagem/MG", justificativa: "Oficina fechada no dia da visita" },
    ]);
  });

  it("usa 'Varios'/'Varias' quando o grupo mistura promotor ou cidade diferentes", () => {
    const cancelamentos: Cancelamento[] = [
      { idPromotor: 1, nomePromotor: "Willian", nomeOficina: "A", cidadeOficina: "São Paulo/SP", obs: null },
      { idPromotor: 2, nomePromotor: "José", nomeOficina: "B", cidadeOficina: "Recife/PE", obs: null },
    ];

    const resultado = construirResumoCancelamentos(cancelamentos, [{ indices: [0, 1], justificativa: "Fora da area do promotor" }]);

    expect(resultado).toEqual([{ promotor: "Vários", oficinas: ["A", "B"], cidade: "Várias", justificativa: "Fora da area do promotor" }]);
  });

  it("retorna null quando falta cobrir 1 cancelamento — RELPROM-55", () => {
    const resultado = construirResumoCancelamentos(CANCELAMENTOS, [{ indices: [0, 1], justificativa: "Folga" }]);

    expect(resultado).toBeNull();
  });

  it("retorna null quando 1 indice se repete em 2 grupos — RELPROM-55", () => {
    const resultado = construirResumoCancelamentos(CANCELAMENTOS, [
      { indices: [0, 1], justificativa: "Folga" },
      { indices: [1, 2], justificativa: "Outro motivo" },
    ]);

    expect(resultado).toBeNull();
  });

  it("retorna null quando 1 indice esta fora do range — RELPROM-55", () => {
    const resultado = construirResumoCancelamentos(CANCELAMENTOS, [{ indices: [0, 1, 99], justificativa: "Folga" }]);

    expect(resultado).toBeNull();
  });

  it("retorna null quando a justificativa de 1 grupo cita numero que nao bate com o tamanho do grupo — RELPROM-56", () => {
    const resultado = construirResumoCancelamentos(CANCELAMENTOS, [
      { indices: [0, 1], justificativa: "2 oficinas canceladas" },
      { indices: [2], justificativa: "5 oficinas canceladas por esse motivo" }, // grupo tem 1, nao 5
    ]);

    expect(resultado).toBeNull();
  });

  it("retorna null quando nao ha grupo nenhum", () => {
    expect(construirResumoCancelamentos(CANCELAMENTOS, [])).toBeNull();
  });

  it("retorna null quando a justificativa cita o texto literal de uma obs original — RELPROM-66", () => {
    const cancelamentos: Cancelamento[] = [
      { idPromotor: 2, nomePromotor: "José", nomeOficina: "Real Car", cidadeOficina: "Belo Horizonte/MG", obs: "Liberada sem confirmacao na revisao da base" },
    ];

    const resultado = construirResumoCancelamentos(cancelamentos, [
      { indices: [0], justificativa: "Motivo: liberada sem confirmacao na revisao da base" },
    ]);

    expect(resultado).toBeNull();
  });
});

describe("construirInsightsCampo", () => {
  const VISAO_GERAL: VisaoGeralCampanha = { concluidas: 71, canceladas: 21, abertasNaRota: 132 };
  const DESTAQUES: DestaqueCampo[] = [
    { status: "concluida", idPromotor: 1, nomePromotor: "A", nomeOficina: "Oficina 1", cidadeOficina: "Rio de Janeiro/RJ", obs: "Fechada" },
    { status: "concluida", idPromotor: 1, nomePromotor: "A", nomeOficina: "Oficina 2", cidadeOficina: "Rio de Janeiro/RJ", obs: "Fechada" },
    { status: "cancelada", idPromotor: 2, nomePromotor: "B", nomeOficina: "Oficina 3", cidadeOficina: "Recife/PE", obs: "Fechada" },
  ];

  it("monta os insights validados quando indices e numeros batem — RELPROM-60", () => {
    const resultado = construirInsightsCampo(DESTAQUES, VISAO_GERAL, [
      { titulo: "Base com oficinas que não existem mais", indices: [0, 1, 2], descricao: "3 oficinas fechadas, 2 no Rio de Janeiro e 1 em Recife" },
    ]);

    expect(resultado).toEqual([
      { titulo: "Base com oficinas que não existem mais", descricao: "3 oficinas fechadas, 2 no Rio de Janeiro e 1 em Recife" },
    ]);
  });

  it("aceita numero da visao geral (contador macro, nao so do subconjunto do insight)", () => {
    const resultado = construirInsightsCampo(DESTAQUES, VISAO_GERAL, [
      { titulo: "Poucas observações", indices: [0], descricao: "Só 3 das 71 visitas concluídas têm observação" },
    ]);

    expect(resultado).not.toBeNull();
  });

  it("retorna null quando nao ha insight nenhum", () => {
    expect(construirInsightsCampo(DESTAQUES, VISAO_GERAL, [])).toBeNull();
  });

  it("retorna null quando ha mais de 4 insights — RELPROM-61", () => {
    const insight = { titulo: "T", indices: [0], descricao: "sem numero" };
    expect(construirInsightsCampo(DESTAQUES, VISAO_GERAL, [insight, insight, insight, insight, insight])).toBeNull();
  });

  it("retorna null quando 1 indice esta fora do range — RELPROM-61", () => {
    const resultado = construirInsightsCampo(DESTAQUES, VISAO_GERAL, [{ titulo: "T", indices: [99], descricao: "sem numero" }]);

    expect(resultado).toBeNull();
  });

  it("retorna null quando o mesmo destaque aparece em 2 insights — RELPROM-61", () => {
    const resultado = construirInsightsCampo(DESTAQUES, VISAO_GERAL, [
      { titulo: "T1", indices: [0], descricao: "sem numero" },
      { titulo: "T2", indices: [0], descricao: "sem numero" },
    ]);

    expect(resultado).toBeNull();
  });

  it("retorna null quando o titulo ou descricao cita numero que nao bate com nada real — RELPROM-62", () => {
    const resultado = construirInsightsCampo(DESTAQUES, VISAO_GERAL, [
      { titulo: "T", indices: [0], descricao: "999 oficinas com esse problema" },
    ]);

    expect(resultado).toBeNull();
  });

  it("nao exige cobrir todos os destaques — cobertura parcial e valida", () => {
    const resultado = construirInsightsCampo(DESTAQUES, VISAO_GERAL, [{ titulo: "T", indices: [0], descricao: "sem numero" }]);

    expect(resultado).toEqual([{ titulo: "T", descricao: "sem numero" }]);
  });

  it("retorna null quando a descricao cita o texto literal de uma observacao original — RELPROM-66", () => {
    const destaques: DestaqueCampo[] = [
      { status: "concluida", idPromotor: 1, nomePromotor: "A", nomeOficina: "Oficina 1", cidadeOficina: "Rio de Janeiro/RJ", obs: "Liberada sem confirmacao na revisao da base" },
    ];

    const resultado = construirInsightsCampo(destaques, VISAO_GERAL, [
      { titulo: "T", indices: [0], descricao: "Oficina com nota: liberada sem confirmacao na revisao da base" },
    ]);

    expect(resultado).toBeNull();
  });
});

describe("contemTextoVerbatim", () => {
  it("retorna true quando o texto gerado cita uma observacao de 15+ caracteres literalmente", () => {
    expect(contemTextoVerbatim("Resumo: promotor de folga essa semana toda", ["Promotor de folga essa semana toda"])).toBe(true);
  });

  it("e case-insensitive", () => {
    expect(contemTextoVerbatim("promotor DE FOLGA essa semana toda", ["Promotor de folga essa semana toda"])).toBe(true);
  });

  it("retorna false quando nenhuma observacao aparece no texto gerado", () => {
    expect(contemTextoVerbatim("Oficina fechada no periodo", ["Promotor de folga essa semana toda"])).toBe(false);
  });

  it("ignora observacoes curtas (abaixo do limiar) pra nao gerar falso positivo", () => {
    expect(contemTextoVerbatim("Fechada por motivo diverso", ["Fechada"])).toBe(false);
  });

  it("ignora observacoes nulas/undefined", () => {
    expect(contemTextoVerbatim("qualquer texto", [null, undefined])).toBe(false);
  });
});
