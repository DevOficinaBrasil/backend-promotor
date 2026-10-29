import ObAdsIntegrationClient from "../../service/obAdsIntegrationClient";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.OBADS_BASE_URL = "https://ob-ads.exemplo.com";
  process.env.INTERNAL_API_KEY = "chave-interna";
  global.fetch = jest.fn();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  jest.restoreAllMocks();
});

describe("ObAdsIntegrationClient.listarClientesHabilitados", () => {
  it("retorna sucesso:true com os dados quando a resposta e 200", async () => {
    const dados = [{ idCliente: 10, nomeCliente: "SKF", admins: ["admin@skf.com"] }];
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, json: async () => dados });

    const resultado = await ObAdsIntegrationClient.listarClientesHabilitados("promotores");

    expect(resultado).toEqual({ sucesso: true, dados });
  });

  it("monta a URL com o nome do modulo e, quando informado, ?idCliente=", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, json: async () => [] });

    await ObAdsIntegrationClient.listarClientesHabilitados("promotores", 10);

    const [urlChamada, opcoes] = (global.fetch as jest.Mock).mock.calls[0];
    expect(String(urlChamada)).toBe("https://ob-ads.exemplo.com/internal/modulos/promotores/clientes-habilitados?idCliente=10");
    expect(opcoes.headers["x-api-key"]).toBe("chave-interna");
  });

  it("retorna sucesso:false quando a resposta HTTP nao e ok", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });

    const resultado = await ObAdsIntegrationClient.listarClientesHabilitados("promotores");

    expect(resultado).toEqual({ sucesso: false, motivo: "ob-ads respondeu 401" });
  });

  it("retorna sucesso:false (nunca lanca) quando o fetch rejeita (erro de rede/timeout)", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("timeout"));

    const resultado = await ObAdsIntegrationClient.listarClientesHabilitados("promotores");

    expect(resultado).toEqual({ sucesso: false, motivo: "timeout" });
  });

  it("le INTERNAL_API_KEY a cada chamada, nao em const de modulo", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, json: async () => [] });

    delete process.env.INTERNAL_API_KEY;
    await ObAdsIntegrationClient.listarClientesHabilitados("promotores");
    expect((global.fetch as jest.Mock).mock.calls[0][1].headers["x-api-key"]).toBe("");

    process.env.INTERNAL_API_KEY = "definida-depois";
    await ObAdsIntegrationClient.listarClientesHabilitados("promotores");
    expect((global.fetch as jest.Mock).mock.calls[1][1].headers["x-api-key"]).toBe("definida-depois");
  });
});
