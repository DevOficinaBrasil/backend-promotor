import { Request, Response } from "express";
import VisitaController from "../../controllers/visitaController";
import VisitaConfirmacaoService from "../../service/visitaConfirmacaoService";
import { VISITA_SCOPE, VisitaJwtPayload } from "../../utils/visitaToken";

jest.mock("../../service/visitaConfirmacaoService");

const confirmar = VisitaConfirmacaoService.confirmar as jest.Mock;
const atualizarEndereco = VisitaConfirmacaoService.atualizarEndereco as jest.Mock;
const trocarToken = VisitaConfirmacaoService.trocarToken as jest.Mock;

const payload: VisitaJwtPayload = {
  sub: 7,
  ID_NOTIFICACAO_VISITA: 55,
  ID_ROTA_PROMOTOR: 42,
  scope: VISITA_SCOPE,
};

function montarResposta() {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  } as unknown as Response & { status: jest.Mock; json: jest.Mock };
  return res;
}

function montarRequisicao(extra: Partial<Request> = {}): Request {
  return {
    params: { token: "tok" },
    headers: {},
    body: {},
    ip: "10.0.0.5", // o ALB, quando não há trust proxy
    socket: { remoteAddress: "10.0.0.5" },
    visitaJwt: payload,
    ...extra,
  } as unknown as Request;
}

describe("VisitaController", () => {
  let envOriginal: string | undefined;

  beforeEach(() => {
    envOriginal = process.env.TRUST_PROXY_HOPS;
    delete process.env.TRUST_PROXY_HOPS;
    jest.clearAllMocks();
    confirmar.mockResolvedValue({
      state: "CONFIRMED",
      confirmadoEm: new Date("2026-08-05T12:00:00.000Z"),
      enderecoAtualizado: false,
    });
    atualizarEndereco.mockResolvedValue({
      state: "CONFIRMED",
      confirmadoEm: new Date("2026-08-05T12:00:00.000Z"),
      enderecoAtualizado: true,
    });
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (envOriginal === undefined) delete process.env.TRUST_PROXY_HOPS;
    else process.env.TRUST_PROXY_HOPS = envOriginal;
    jest.restoreAllMocks();
  });

  // O app não declara `trust proxy` (o limitador da visita depende disso), então
  // `req.ip` é sempre o balanceador e CONFIRMADO_IP guardava o endereço dele.
  describe("IP gravado na auditoria da confirmação", () => {
    it("usa o endereço que a borda acrescentou ao X-Forwarded-For", async () => {
      const req = montarRequisicao({
        headers: { "x-forwarded-for": "203.0.113.7" },
      } as Partial<Request>);

      await VisitaController.confirmar(req, montarResposta());

      expect(confirmar).toHaveBeenCalledWith(payload, "203.0.113.7");
    });

    // Cliente pode mandar o header já preenchido; o valor confiável é o que o
    // proxy da borda acrescentou ao fim, não o que veio na frente.
    it("ignora endereço forjado pelo cliente na frente da lista", async () => {
      const req = montarRequisicao({
        headers: { "x-forwarded-for": "1.2.3.4, 203.0.113.7" },
      } as Partial<Request>);

      await VisitaController.confirmar(req, montarResposta());

      expect(confirmar).toHaveBeenCalledWith(payload, "203.0.113.7");
    });

    it("respeita TRUST_PROXY_HOPS quando há duas camadas de proxy", async () => {
      process.env.TRUST_PROXY_HOPS = "2";
      const req = montarRequisicao({
        headers: { "x-forwarded-for": "203.0.113.7, 198.51.100.9" },
      } as Partial<Request>);

      await VisitaController.confirmar(req, montarResposta());

      expect(confirmar).toHaveBeenCalledWith(payload, "203.0.113.7");
    });

    it("cai para req.ip quando não há X-Forwarded-For", async () => {
      await VisitaController.confirmar(montarRequisicao(), montarResposta());

      expect(confirmar).toHaveBeenCalledWith(payload, "10.0.0.5");
    });

    it("também vale para a correção de endereço", async () => {
      const req = montarRequisicao({
        headers: { "x-forwarded-for": "203.0.113.7" },
        body: { CEP: "13010-000" },
      } as Partial<Request>);

      await VisitaController.atualizarEndereco(req, montarResposta());

      expect(atualizarEndereco).toHaveBeenCalledWith(
        payload,
        { CEP: "13010-000" },
        "203.0.113.7"
      );
    });
  });

  // A página de confirmação é pública: quem tem o link vê a resposta de erro.
  // Texto de erro de banco carrega nome de coluna, schema e constraint.
  describe("erro interno não vaza detalhe do erro", () => {
    const detalhe = 'permission denied for table "cadastro_empresa"';

    it("responde 500 genérico no exchange", async () => {
      trocarToken.mockRejectedValue(new Error(detalhe));
      const res = montarResposta();

      await VisitaController.exchange(montarRequisicao(), res);

      expect(res.status).toHaveBeenCalledWith(500);
      const corpo = JSON.stringify(res.json.mock.calls[0][0]);
      expect(corpo).not.toContain("cadastro_empresa");
      expect(corpo).toContain("INTERNAL_ERROR");
    });

    it("responde 500 genérico ao confirmar", async () => {
      confirmar.mockRejectedValue(new Error(detalhe));
      const res = montarResposta();

      await VisitaController.confirmar(montarRequisicao(), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain("cadastro_empresa");
    });

    it("responde 500 genérico ao corrigir endereço", async () => {
      atualizarEndereco.mockRejectedValue(new Error(detalhe));
      const res = montarResposta();

      await VisitaController.atualizarEndereco(montarRequisicao(), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain("cadastro_empresa");
    });

    it("registra o detalhe no log, que é onde ele serve", async () => {
      confirmar.mockRejectedValue(new Error(detalhe));

      await VisitaController.confirmar(montarRequisicao(), montarResposta());

      expect(console.error).toHaveBeenCalledWith(
        "Erro ao confirmar visita:",
        expect.objectContaining({ message: detalhe })
      );
    });
  });
});
