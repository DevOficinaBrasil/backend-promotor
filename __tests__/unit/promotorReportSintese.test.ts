const mockCreate = jest.fn();

jest.mock("openai", () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  }));
});

import PromotorReportSintese from "../../service/promotorReportSintese";
import { CampanhaBlocoRelatorio } from "../../types/promotorRelatorio";

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
  it("retorna as 6 frases quando a resposta e valida — RELPROM-49", async () => {
    mockCreate.mockResolvedValue(
      respostaComConteudo(
        JSON.stringify({
          visaoGeral: "71 visitas concluidas no periodo",
          assertividade: "77% de assertividade",
          porPromotor: "Willian concluiu 15 visitas",
          cancelamentos: "1 oficina cancelada no periodo",
          destaques: "1 destaque concluido registrado",
          proximosPassos: "132 oficinas abertas na rota",
        })
      )
    );

    const resultado = await PromotorReportSintese.gerarSinteses(BLOCO);

    expect(Object.keys(resultado).sort()).toEqual(
      ["assertividade", "cancelamentos", "destaques", "porPromotor", "proximosPassos", "visaoGeral"].sort()
    );
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
