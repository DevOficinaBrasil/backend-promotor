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

describe("ObAdsIntegrationClient.resolverAdminsDoCliente (pos-Execute, AD-006)", () => {
  it("retorna sucesso:true com o cliente quando a resposta e 200", async () => {
    const dados = { idCliente: 126, nomeCliente: "SKF", admins: ["admin@skf.com"] };
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, json: async () => dados });

    const resultado = await ObAdsIntegrationClient.resolverAdminsDoCliente(126);

    expect(resultado).toEqual({ sucesso: true, dados });
  });

  it("monta a URL com o idCliente no path, sem passar por modulo", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    await ObAdsIntegrationClient.resolverAdminsDoCliente(126);

    const [urlChamada] = (global.fetch as jest.Mock).mock.calls[0];
    expect(String(urlChamada)).toBe("https://ob-ads.exemplo.com/internal/clientes/126/admins");
  });

  it("retorna sucesso:false com status quando a resposta HTTP nao e ok (ex: 404 cliente inexistente)", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });

    const resultado = await ObAdsIntegrationClient.resolverAdminsDoCliente(999);

    expect(resultado).toEqual({ sucesso: false, motivo: "ob-ads respondeu 404", status: 404 });
  });

  it("retorna sucesso:false (nunca lanca) quando o fetch rejeita", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("timeout"));

    const resultado = await ObAdsIntegrationClient.resolverAdminsDoCliente(126);

    expect(resultado).toEqual({ sucesso: false, motivo: "timeout" });
  });
});

describe("ObAdsIntegrationClient.enviarEmailComAnexo", () => {
  const requisicao = {
    to: ["admin@skf.com"],
    subject: "Relatorio semanal",
    bodyHtml: "<p>oi</p>",
    attachment: { filename: "relatorio.pdf", content: Buffer.from("%PDF-1.4"), contentType: "application/pdf" },
  };

  it("retorna sucesso:true quando o ob-ads responde success:true", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) });

    const resultado = await ObAdsIntegrationClient.enviarEmailComAnexo(requisicao);

    expect(resultado).toEqual({ sucesso: true });
  });

  it("converte o Buffer do anexo pra base64 so na borda HTTP", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) });

    await ObAdsIntegrationClient.enviarEmailComAnexo(requisicao);

    const [, opcoes] = (global.fetch as jest.Mock).mock.calls[0];
    const corpo = JSON.parse(opcoes.body);
    expect(corpo.attachment.contentBase64).toBe(Buffer.from("%PDF-1.4").toString("base64"));
    expect(corpo.attachment.filename).toBe("relatorio.pdf");
  });

  it("retorna sucesso:false quando o ob-ads responde success:false (nunca lanca)", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: false, error: "SES fora do ar" }),
    });

    const resultado = await ObAdsIntegrationClient.enviarEmailComAnexo(requisicao);

    expect(resultado).toEqual({ sucesso: false, motivo: "SES fora do ar" });
  });

  it("retorna sucesso:false quando a resposta HTTP nao e ok", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });

    const resultado = await ObAdsIntegrationClient.enviarEmailComAnexo(requisicao);

    expect(resultado).toEqual({ sucesso: false, motivo: "ob-ads respondeu 502" });
  });

  it("retorna sucesso:false quando o fetch rejeita", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("timeout"));

    const resultado = await ObAdsIntegrationClient.enviarEmailComAnexo(requisicao);

    expect(resultado).toEqual({ sucesso: false, motivo: "timeout" });
  });
});
