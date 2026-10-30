import { extrairNumeros, validarSintese, numerosValidosDaSecao } from "../../utils/promotorReportSinteseValidacao";
import { CampanhaBlocoRelatorio } from "../../types/promotorRelatorio";

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
