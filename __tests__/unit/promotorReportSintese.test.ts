const mockCreate = jest.fn();

jest.mock("openai", () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  }));
});

import PromotorReportSintese from "../../service/promotorReportSintese";
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
  ],
  cancelamentos: [
    { idPromotor: 2, nomePromotor: "José", nomeOficina: "Real Car", cidadeOficina: "Belo Horizonte/MG", obs: "Promotor de folga" },
  ],
  destaquesDeCampo: [
    { status: "concluida", idPromotor: 1, nomePromotor: "Willian", nomeOficina: "Oficina A", cidadeOficina: "São Paulo/SP", obs: "Tudo certo" },
  ],
  proximosPassos: { abertasNaRota: 132, canceladasARedistribuir: 21, promotoresSemRegistro: 1 },
};

function respostaComConteudo(conteudo: string | null) {
  return { choices: [{ message: { content: conteudo } }] };
}

beforeEach(() => {
  process.env.OPENAI_API_KEY = "chave-teste";
  mockCreate.mockReset();
});

describe("PromotorReportSintese.gerarSinteses", () => {
  it("retorna as 5 frases quando a resposta e valida — RELPROM-49", async () => {
    mockCreate.mockResolvedValue(
      respostaComConteudo(
        JSON.stringify({
          visaoGeral: "71 visitas concluidas no periodo",
          assertividade: "77% de assertividade",
          cancelamentos: "1 oficina cancelada no periodo",
          destaques: "1 destaque concluido registrado",
          proximosPassos: "132 oficinas abertas na rota",
        })
      )
    );

    const resultado = await PromotorReportSintese.gerarSinteses(BLOCO);

    expect(Object.keys(resultado).sort()).toEqual(
      ["assertividade", "cancelamentos", "destaques", "proximosPassos", "visaoGeral"].sort()
    );
  });

  it("ignora 'porPromotor' mesmo se a ia devolver essa chave — RELPROM-64, essa secao e deterministica", async () => {
    mockCreate.mockResolvedValue(
      respostaComConteudo(JSON.stringify({ visaoGeral: "71 visitas concluidas no periodo", porPromotor: "Willian concluiu 15 visitas" }))
    );

    const resultado = await PromotorReportSintese.gerarSinteses(BLOCO);

    expect(resultado.porPromotor).toBeUndefined();
  });

  it("faz 1 unica chamada por bloco, com model e response_format corretos", async () => {
    mockCreate.mockResolvedValue(respostaComConteudo(JSON.stringify({ visaoGeral: "71 concluidas" })));

    await PromotorReportSintese.gerarSinteses(BLOCO);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [params] = mockCreate.mock.calls[0];
    expect(params.model).toBe("gpt-4o-mini");
    expect(params.response_format).toEqual({ type: "json_object" });
  });

  it("descarta so a frase com numero fora dos dados, mantem as demais — RELPROM-50", async () => {
    mockCreate.mockResolvedValue(
      respostaComConteudo(
        JSON.stringify({
          visaoGeral: "71 concluidas e 999 canceladas", // 999 nao existe nos dados
          proximosPassos: "132 oficinas abertas na rota", // valido
        })
      )
    );

    const resultado = await PromotorReportSintese.gerarSinteses(BLOCO);

    expect(resultado.visaoGeral).toBeUndefined();
    expect(resultado.proximosPassos).toBe("132 oficinas abertas na rota");
  });

  it("retorna {} quando a resposta vem sem conteudo — RELPROM-51", async () => {
    mockCreate.mockResolvedValue(respostaComConteudo(null));

    const resultado = await PromotorReportSintese.gerarSinteses(BLOCO);

    expect(resultado).toEqual({});
  });

  it("retorna {} quando o conteudo nao e JSON valido — RELPROM-51", async () => {
    mockCreate.mockResolvedValue(respostaComConteudo("isso nao e json"));

    const resultado = await PromotorReportSintese.gerarSinteses(BLOCO);

    expect(resultado).toEqual({});
  });

  it("retorna {} sem lancar quando a chamada rejeita (timeout/erro de rede) — RELPROM-51", async () => {
    mockCreate.mockRejectedValue(new Error("timeout"));

    const resultado = await PromotorReportSintese.gerarSinteses(BLOCO);

    expect(resultado).toEqual({});
  });
});

describe("PromotorReportSintese.gerarResumoCancelamentos", () => {
  const CANCELAMENTOS: Cancelamento[] = [
    { idPromotor: 2, nomePromotor: "José", nomeOficina: "Real Car", cidadeOficina: "Belo Horizonte/MG", obs: "Folga" },
    { idPromotor: 2, nomePromotor: "José", nomeOficina: "Ricar", cidadeOficina: "Belo Horizonte/MG", obs: "Folga" },
  ];

  it("retorna os grupos validados quando a resposta cobre todos os indices — RELPROM-53", async () => {
    mockCreate.mockResolvedValue(
      respostaComConteudo(JSON.stringify({ grupos: [{ indices: [0, 1], justificativa: "2 oficinas canceladas por folga do promotor" }] }))
    );

    const resultado = await PromotorReportSintese.gerarResumoCancelamentos(CANCELAMENTOS);

    expect(resultado).toEqual([
      { promotor: "José", oficinas: ["Real Car", "Ricar"], cidade: "Belo Horizonte/MG", justificativa: "2 oficinas canceladas por folga do promotor" },
    ]);
  });

  it("faz 1 unica chamada, com model e response_format corretos", async () => {
    mockCreate.mockResolvedValue(respostaComConteudo(JSON.stringify({ grupos: [{ indices: [0, 1], justificativa: "Folga" }] })));

    await PromotorReportSintese.gerarResumoCancelamentos(CANCELAMENTOS);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [params] = mockCreate.mock.calls[0];
    expect(params.model).toBe("gpt-4o-mini");
    expect(params.response_format).toEqual({ type: "json_object" });
  });

  it("retorna null quando o agrupamento nao cobre todos os indices — RELPROM-55", async () => {
    mockCreate.mockResolvedValue(respostaComConteudo(JSON.stringify({ grupos: [{ indices: [0], justificativa: "Folga" }] })));

    const resultado = await PromotorReportSintese.gerarResumoCancelamentos(CANCELAMENTOS);

    expect(resultado).toBeNull();
  });

  it("retorna null quando a resposta vem sem campo grupos", async () => {
    mockCreate.mockResolvedValue(respostaComConteudo(JSON.stringify({ outraCoisa: true })));

    const resultado = await PromotorReportSintese.gerarResumoCancelamentos(CANCELAMENTOS);

    expect(resultado).toBeNull();
  });

  it("retorna null quando a resposta vem sem conteudo — RELPROM-57", async () => {
    mockCreate.mockResolvedValue(respostaComConteudo(null));

    const resultado = await PromotorReportSintese.gerarResumoCancelamentos(CANCELAMENTOS);

    expect(resultado).toBeNull();
  });

  it("retorna null sem lancar quando a chamada rejeita — RELPROM-57", async () => {
    mockCreate.mockRejectedValue(new Error("timeout"));

    const resultado = await PromotorReportSintese.gerarResumoCancelamentos(CANCELAMENTOS);

    expect(resultado).toBeNull();
  });
});

describe("PromotorReportSintese.gerarInsightsCampo", () => {
  const VISAO_GERAL: VisaoGeralCampanha = { concluidas: 71, canceladas: 21, abertasNaRota: 132 };
  const DESTAQUES: DestaqueCampo[] = [
    { status: "concluida", idPromotor: 1, nomePromotor: "A", nomeOficina: "Oficina 1", cidadeOficina: "Rio de Janeiro/RJ", obs: "Fechada" },
    { status: "cancelada", idPromotor: 2, nomePromotor: "B", nomeOficina: "Oficina 2", cidadeOficina: "Recife/PE", obs: "Fora de área" },
  ];

  it("retorna os insights validados quando a resposta e valida — RELPROM-58", async () => {
    mockCreate.mockResolvedValue(
      respostaComConteudo(
        JSON.stringify({
          insights: [{ titulo: "Base com oficinas que não existem mais", indices: [0], descricao: "1 oficina fechada no Rio de Janeiro" }],
        })
      )
    );

    const resultado = await PromotorReportSintese.gerarInsightsCampo(DESTAQUES, VISAO_GERAL);

    expect(resultado).toEqual([{ titulo: "Base com oficinas que não existem mais", descricao: "1 oficina fechada no Rio de Janeiro" }]);
  });

  it("faz 1 unica chamada, com model e response_format corretos", async () => {
    mockCreate.mockResolvedValue(respostaComConteudo(JSON.stringify({ insights: [{ titulo: "T", indices: [0], descricao: "sem numero" }] })));

    await PromotorReportSintese.gerarInsightsCampo(DESTAQUES, VISAO_GERAL);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [params] = mockCreate.mock.calls[0];
    expect(params.model).toBe("gpt-4o-mini");
    expect(params.response_format).toEqual({ type: "json_object" });
  });

  it("retorna null quando ha mais de 4 insights — RELPROM-61", async () => {
    const insight = { titulo: "T", indices: [0], descricao: "sem numero" };
    mockCreate.mockResolvedValue(respostaComConteudo(JSON.stringify({ insights: [insight, insight, insight, insight, insight] })));

    const resultado = await PromotorReportSintese.gerarInsightsCampo(DESTAQUES, VISAO_GERAL);

    expect(resultado).toBeNull();
  });

  it("retorna null quando a resposta vem sem campo insights", async () => {
    mockCreate.mockResolvedValue(respostaComConteudo(JSON.stringify({ outraCoisa: true })));

    const resultado = await PromotorReportSintese.gerarInsightsCampo(DESTAQUES, VISAO_GERAL);

    expect(resultado).toBeNull();
  });

  it("retorna null quando a resposta vem sem conteudo — RELPROM-63", async () => {
    mockCreate.mockResolvedValue(respostaComConteudo(null));

    const resultado = await PromotorReportSintese.gerarInsightsCampo(DESTAQUES, VISAO_GERAL);

    expect(resultado).toBeNull();
  });

  it("retorna null sem lancar quando a chamada rejeita — RELPROM-63", async () => {
    mockCreate.mockRejectedValue(new Error("timeout"));

    const resultado = await PromotorReportSintese.gerarInsightsCampo(DESTAQUES, VISAO_GERAL);

    expect(resultado).toBeNull();
  });
});
