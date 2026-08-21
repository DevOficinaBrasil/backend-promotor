import axios from "axios";
import { WhatsAppChannel } from "../../channels/whatsappChannel";

jest.mock("axios");

const postMock = axios.post as jest.Mock;

const ENV_KEYS = [
  "NODE_ENV",
  "WHATSAPP_SEND_ENABLED",
  "WHATSAPP_ACCOUNT_ID",
  "WHATSAPP_TEMPLATE_NAME_VISITA",
  "WHATSAPP_BASE_URL",
  "WHATSAPP_API_KEY",
  "WHATSAPP_TEST_PHONE_OVERRIDE",
] as const;

const TELEFONE_VALIDO = "5511999998888";
const VARIAVEIS = ["Auto Center Silva", "https://app.example.com/visita/confirmacao?token=abc"];

/**
 * Full, valid configuration with the test-env lock deliberately lifted. The
 * test-phone override is cleared: it redirects every dispatch, so an ambient
 * value leaking in from a developer's shell would silently rewrite the
 * toPhone every other assertion in this file depends on.
 */
function configurarEnvioReal() {
  delete process.env.WHATSAPP_TEST_PHONE_OVERRIDE;
  process.env.NODE_ENV = "production";
  process.env.WHATSAPP_SEND_ENABLED = "true";
  process.env.WHATSAPP_ACCOUNT_ID = "acc-123";
  process.env.WHATSAPP_TEMPLATE_NAME_VISITA = "visita_confirmacao";
  process.env.WHATSAPP_BASE_URL = "https://wpp.oficinabrasil.com.br";
  process.env.WHATSAPP_API_KEY = "chave-secreta";
}

describe("WhatsAppChannel.send", () => {
  const canal = new WhatsAppChannel();
  let envOriginal: Record<string, string | undefined>;

  beforeEach(() => {
    envOriginal = {};
    for (const chave of ENV_KEYS) {
      envOriginal[chave] = process.env[chave];
    }
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    for (const chave of ENV_KEYS) {
      if (envOriginal[chave] === undefined) {
        delete process.env[chave];
      } else {
        process.env[chave] = envOriginal[chave];
      }
    }
    jest.restoreAllMocks();
  });

  // Spec AC13 + edge case: "IF a test run somehow has WHATSAPP_SEND_ENABLED=true
  // in its environment THEN the NODE_ENV=test lock SHALL still prevent a real call".
  describe("send locks", () => {
    it("takes the no-op path under NODE_ENV=test even with WHATSAPP_SEND_ENABLED=true and full config", async () => {
      configurarEnvioReal();
      process.env.NODE_ENV = "test";

      const resultado = await canal.send({ toPhone: TELEFONE_VALIDO, variables: VARIAVEIS });

      expect(postMock).not.toHaveBeenCalled();
      expect(resultado).toEqual({
        success: false,
        reason: "channel not configured",
        providerCode: null,
      });
    });

    // Spec AC12: the call happens only when the flag is exactly "true".
    it("takes the no-op path when WHATSAPP_SEND_ENABLED is unset", async () => {
      configurarEnvioReal();
      delete process.env.WHATSAPP_SEND_ENABLED;

      const resultado = await canal.send({ toPhone: TELEFONE_VALIDO, variables: VARIAVEIS });

      expect(postMock).not.toHaveBeenCalled();
      expect(resultado).toEqual({
        success: false,
        reason: "channel not configured",
        providerCode: null,
      });
    });

    it('takes the no-op path when WHATSAPP_SEND_ENABLED is "TRUE" rather than exactly "true"', async () => {
      configurarEnvioReal();
      process.env.WHATSAPP_SEND_ENABLED = "TRUE";

      const resultado = await canal.send({ toPhone: TELEFONE_VALIDO, variables: VARIAVEIS });

      expect(postMock).not.toHaveBeenCalled();
      expect(resultado.success).toBe(false);
    });
  });

  // Spec AC11: missing account/template config skips the HTTP call, logs the
  // intended payload and yields "channel not configured" without throwing.
  // AC6 needs the base URL and API key to build the call at all, so those fail
  // closed identically.
  describe.each([
    ["WHATSAPP_ACCOUNT_ID"],
    ["WHATSAPP_TEMPLATE_NAME_VISITA"],
    ["WHATSAPP_BASE_URL"],
    ["WHATSAPP_API_KEY"],
  ])("missing configuration: %s", (variavel) => {
    it("skips the HTTP call, logs the intended payload and returns channel not configured", async () => {
      configurarEnvioReal();
      delete process.env[variavel];

      const resultado = await canal.send({ toPhone: TELEFONE_VALIDO, variables: VARIAVEIS });

      expect(postMock).not.toHaveBeenCalled();
      expect(resultado).toEqual({
        success: false,
        reason: "channel not configured",
        providerCode: null,
      });
      expect(console.log).toHaveBeenCalledWith(
        "[whatsappChannel] no-op: configuração ausente",
        expect.objectContaining({ toPhone: TELEFONE_VALIDO, variables: VARIAVEIS })
      );
    });
  });

  // Diagnostics: ChannelSendResult keeps only reason + providerCode, so without
  // this log a provider 4xx becomes a FALHOU row with no URL, status or body.
  describe("failure diagnostics", () => {
    const logDeFalha = (): string => {
      const chamada = (console.error as jest.Mock).mock.calls.find((c) =>
        String(c[0]).includes("FALHA DE ENVIO")
      );
      expect(chamada).toBeDefined();
      return String(chamada![0]);
    };

    it("logs url, http status, provider code, classification and body on a provider error", async () => {
      configurarEnvioReal();
      postMock.mockRejectedValue({
        response: {
          status: 401,
          statusText: "Unauthorized",
          data: { error: { code: "TEMPLATE_NOT_FOUND" } },
        },
      });

      await canal.send({ toPhone: TELEFONE_VALIDO, variables: VARIAVEIS });

      const log = logDeFalha();
      expect(log).toContain("POST https://wpp.oficinabrasil.com.br/api/v1/messages/send-template");
      expect(log).toContain("401 Unauthorized");
      expect(log).toContain("TEMPLATE_NOT_FOUND");
      expect(log).toContain("channel not configured");
      expect(log).toContain("visita_confirmacao");
      expect(log).toContain(TELEFONE_VALIDO);
    });

    // A 2xx carrying success:false throws nothing — it would vanish unlogged.
    it("logs a 200 response that does not carry success: true", async () => {
      configurarEnvioReal();
      postMock.mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: { success: false, code: "VALIDATION_ERROR", detail: "variables mismatch" },
      });

      await canal.send({ toPhone: TELEFONE_VALIDO, variables: VARIAVEIS });

      const log = logDeFalha();
      expect(log).toContain("200 OK");
      expect(log).toContain("VALIDATION_ERROR");
      expect(log).toContain("variables mismatch");
    });

    it("logs the transport error code when the provider never responds", async () => {
      configurarEnvioReal();
      postMock.mockRejectedValue({ code: "ECONNREFUSED", message: "connect ECONNREFUSED" });

      await canal.send({ toPhone: TELEFONE_VALIDO, variables: VARIAVEIS });

      const log = logDeFalha();
      expect(log).toContain("(sem resposta)");
      expect(log).toContain("ECONNREFUSED");
      expect(log).toContain("network error");
    });

    it("never writes the API key into the diagnostics", async () => {
      configurarEnvioReal();
      postMock.mockRejectedValue({
        response: { status: 500, statusText: "Server Error", data: { error: "BOOM" } },
      });

      await canal.send({ toPhone: TELEFONE_VALIDO, variables: VARIAVEIS });

      expect(logDeFalha()).not.toContain("chave-secreta");
    });

    it("truncates an oversized response body instead of flooding the log", async () => {
      configurarEnvioReal();
      postMock.mockRejectedValue({
        response: { status: 502, statusText: "Bad Gateway", data: "x".repeat(5_000) },
      });

      await canal.send({ toPhone: TELEFONE_VALIDO, variables: VARIAVEIS });

      const log = logDeFalha();
      expect(log).toContain("chars)");
      expect(log.length).toBeLessThan(3_000);
    });

    it("stays silent on a successful send", async () => {
      configurarEnvioReal();
      postMock.mockResolvedValue({ status: 200, data: { success: true, messageId: "m1" } });

      await canal.send({ toPhone: TELEFONE_VALIDO, variables: VARIAVEIS });

      expect(console.error).not.toHaveBeenCalled();
    });
  });

  // WHATSAPP_TEST_PHONE_OVERRIDE: exercises the real provider without any
  // message reaching an oficina. Every dispatch goes to the single configured
  // number instead of the recipient's.
  describe("test phone override", () => {
    const MEU_NUMERO = "5511987654321";

    it("redirects the dispatch to the override instead of the real recipient", async () => {
      configurarEnvioReal();
      process.env.WHATSAPP_TEST_PHONE_OVERRIDE = MEU_NUMERO;
      postMock.mockResolvedValue({ data: { success: true, messageId: "m1" } });

      await canal.send({ toPhone: TELEFONE_VALIDO, variables: VARIAVEIS });

      expect(postMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ toPhone: MEU_NUMERO }),
        expect.any(Object)
      );
    });

    it("normalizes a loosely formatted override before dispatching", async () => {
      configurarEnvioReal();
      process.env.WHATSAPP_TEST_PHONE_OVERRIDE = "(11) 98765-4321";
      postMock.mockResolvedValue({ data: { success: true, messageId: "m1" } });

      await canal.send({ toPhone: TELEFONE_VALIDO, variables: VARIAVEIS });

      expect(postMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ toPhone: MEU_NUMERO }),
        expect.any(Object)
      );
    });

    // A half-applied redirect is the dangerous failure: it would send to the
    // real oficina while the developer believes traffic is captured.
    it("ignores an override that cannot be normalized and keeps the real recipient", async () => {
      configurarEnvioReal();
      process.env.WHATSAPP_TEST_PHONE_OVERRIDE = "nao-e-telefone";
      postMock.mockResolvedValue({ data: { success: true, messageId: "m1" } });

      await canal.send({ toPhone: TELEFONE_VALIDO, variables: VARIAVEIS });

      expect(postMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ toPhone: TELEFONE_VALIDO }),
        expect.any(Object)
      );
    });

    it("still refuses an invalid recipient rather than masking it behind the override", async () => {
      configurarEnvioReal();
      process.env.WHATSAPP_TEST_PHONE_OVERRIDE = MEU_NUMERO;

      const resultado = await canal.send({ toPhone: "(00) 1234", variables: VARIAVEIS });

      expect(postMock).not.toHaveBeenCalled();
      expect(resultado).toEqual({
        success: false,
        reason: "invalid phone",
        providerCode: null,
      });
    });

    it("lifts the NODE_ENV=development block, since no real recipient is reachable", async () => {
      configurarEnvioReal();
      process.env.NODE_ENV = "development";
      process.env.WHATSAPP_TEST_PHONE_OVERRIDE = MEU_NUMERO;
      postMock.mockResolvedValue({ data: { success: true, messageId: "m1" } });

      const resultado = await canal.send({ toPhone: TELEFONE_VALIDO, variables: VARIAVEIS });

      expect(resultado.success).toBe(true);
      expect(postMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ toPhone: MEU_NUMERO }),
        expect.any(Object)
      );
    });

    // The NODE_ENV=test lock outranks the override: no combination of env vars
    // may produce a real send during a test run.
    it("does not dispatch under NODE_ENV=test even with the override set", async () => {
      configurarEnvioReal();
      process.env.NODE_ENV = "test";
      process.env.WHATSAPP_TEST_PHONE_OVERRIDE = MEU_NUMERO;

      const resultado = await canal.send({ toPhone: TELEFONE_VALIDO, variables: VARIAVEIS });

      expect(postMock).not.toHaveBeenCalled();
      expect(resultado.success).toBe(false);
    });
  });

  // Spec AC4 + edge case "IF CELULAR contains non-numeric characters or an
  // invalid DDD THEN normalization SHALL fail closed (no dispatch)".
  it("refuses to dispatch a phone number that does not normalize", async () => {
    configurarEnvioReal();

    const resultado = await canal.send({ toPhone: "(00) 1234", variables: VARIAVEIS });

    expect(postMock).not.toHaveBeenCalled();
    expect(resultado).toEqual({
      success: false,
      reason: "invalid phone",
      providerCode: null,
    });
  });

  describe("dispatch", () => {
    // Spec AC6: exact URL, exact body, Bearer header. Plus the explicit 10s
    // timeout required so a hung provider cannot stall route creation.
    it("posts to send-template with the spec body, Bearer header and a 10s timeout", async () => {
      configurarEnvioReal();
      postMock.mockResolvedValue({ data: { success: true } });

      await canal.send({ toPhone: TELEFONE_VALIDO, variables: VARIAVEIS });

      expect(postMock).toHaveBeenCalledWith(
        "https://wpp.oficinabrasil.com.br/api/v1/messages/send-template",
        {
          accountId: "acc-123",
          toPhone: "5511999998888",
          templateName: "visita_confirmacao",
          templateLanguage: "pt_BR",
          variables: VARIAVEIS,
        },
        {
          headers: { Authorization: "Bearer chave-secreta" },
          timeout: 10000,
        }
      );
    });

    // Spec AC7: on success:true the provider's messageId and providerMessageId
    // are what get persisted.
    it("returns the provider messageId and providerMessageId on success", async () => {
      configurarEnvioReal();
      postMock.mockResolvedValue({
        data: { success: true, messageId: "msg-77", providerMessageId: "wamid.HBg" },
      });

      const resultado = await canal.send({ toPhone: TELEFONE_VALIDO, variables: VARIAVEIS });

      expect(resultado).toEqual({
        success: true,
        messageId: "msg-77",
        providerMessageId: "wamid.HBg",
      });
    });
  });

  // Spec AC8: config-level provider errors map to "channel not configured"
  // while still capturing the provider's code.
  describe.each([
    ["TOKEN_MISSING"],
    ["TOKEN_INVALID"],
    ["TOKEN_EXPIRED"],
    ["ACCOUNT_DENIED"],
    ["SCOPE_DENIED"],
    ["ACCOUNT_NOT_FOUND"],
    ["TEMPLATE_NOT_FOUND"],
  ])("provider error %s", (codigo) => {
    it("maps to channel not configured with the provider code captured", async () => {
      configurarEnvioReal();
      postMock.mockRejectedValue({ response: { status: 401, data: { error: codigo } } });

      const resultado = await canal.send({ toPhone: TELEFONE_VALIDO, variables: VARIAVEIS });

      expect(resultado).toEqual({
        success: false,
        reason: "channel not configured",
        providerCode: codigo,
      });
    });
  });

  // Spec AC9: rate/quota errors capture the code and are never retried.
  describe.each([["RATE_LIMITED"], ["QUOTA_EXCEEDED"]])("provider error %s", (codigo) => {
    it("captures the code without retrying the send", async () => {
      configurarEnvioReal();
      postMock.mockRejectedValue({ response: { status: 429, data: { error: codigo } } });

      const resultado = await canal.send({ toPhone: TELEFONE_VALIDO, variables: VARIAVEIS });

      expect(resultado).toEqual({
        success: false,
        reason: "provider rate/quota",
        providerCode: codigo,
      });
      expect(postMock).toHaveBeenCalledTimes(1);
    });
  });

  // 131049 é fadiga do DESTINATÁRIO, não do nosso número: a Meta recusou a entrega
  // porque a pessoa já recebeu mensagens demais. A orientação é esperar 24h, então
  // classificar como transitório (retentativa em minutos) é o pior desfecho.
  describe("limite do destinatário (131049)", () => {
    it("classifica o código como limite do destinatário, não como rate do provider", async () => {
      configurarEnvioReal();
      postMock.mockRejectedValue({ response: { status: 400, data: { error: "131049" } } });

      const resultado = await canal.send({ toPhone: TELEFONE_VALIDO, variables: VARIAVEIS });

      expect(resultado).toEqual({
        success: false,
        reason: "recipient message limit",
        providerCode: "131049",
      });
      expect(postMock).toHaveBeenCalledTimes(1);
    });

    // Os códigos da Meta são inteiros; provider que repassa o corpo cru manda
    // número, e só aceitar string faria o código cair no caso genérico.
    it("reconhece o código vindo como número em error.code", async () => {
      configurarEnvioReal();
      postMock.mockRejectedValue({
        response: { status: 400, data: { error: { code: 131049, message: "healthy ecosystem" } } },
      });

      const resultado = await canal.send({ toPhone: TELEFONE_VALIDO, variables: VARIAVEIS });

      expect(resultado).toMatchObject({
        reason: "recipient message limit",
        providerCode: "131049",
      });
    });

    it("reconhece o código numérico em code, no 200 sem success", async () => {
      configurarEnvioReal();
      postMock.mockResolvedValue({ status: 200, data: { success: false, code: 131049 } });

      const resultado = await canal.send({ toPhone: TELEFONE_VALIDO, variables: VARIAVEIS });

      expect(resultado).toMatchObject({
        reason: "recipient message limit",
        providerCode: "131049",
      });
    });
  });

  it("maps VALIDATION_ERROR to invalid payload", async () => {
    configurarEnvioReal();
    postMock.mockRejectedValue({ response: { status: 400, data: { error: "VALIDATION_ERROR" } } });

    const resultado = await canal.send({ toPhone: TELEFONE_VALIDO, variables: VARIAVEIS });

    expect(resultado).toEqual({
      success: false,
      reason: "invalid payload",
      providerCode: "VALIDATION_ERROR",
    });
  });

  it("maps an error code returned inside a 200 response body", async () => {
    configurarEnvioReal();
    postMock.mockResolvedValue({ data: { success: false, error: { code: "TEMPLATE_NOT_FOUND" } } });

    const resultado = await canal.send({ toPhone: TELEFONE_VALIDO, variables: VARIAVEIS });

    expect(resultado).toEqual({
      success: false,
      reason: "channel not configured",
      providerCode: "TEMPLATE_NOT_FOUND",
    });
  });

  // Spec edge case: "IF the WhatsApp API is unreachable (network error,
  // timeout, non-JSON response) THEN the system SHALL treat it the same as a
  // documented error response" — a failure result, never a thrown error.
  describe("transport failures resolve rather than throw", () => {
    it("returns a network error result when the request fails with no response", async () => {
      configurarEnvioReal();
      postMock.mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));

      const resultado = await canal.send({ toPhone: TELEFONE_VALIDO, variables: VARIAVEIS });

      expect(resultado).toEqual({
        success: false,
        reason: "network error",
        providerCode: null,
      });
    });

    it("returns a network error result when the request times out", async () => {
      configurarEnvioReal();
      postMock.mockRejectedValue(
        Object.assign(new Error("timeout of 10000ms exceeded"), { code: "ECONNABORTED" })
      );

      const resultado = await canal.send({ toPhone: TELEFONE_VALIDO, variables: VARIAVEIS });

      expect(resultado).toEqual({
        success: false,
        reason: "network error",
        providerCode: null,
      });
    });

    it("returns a failure result for a non-JSON response body", async () => {
      configurarEnvioReal();
      postMock.mockResolvedValue({ data: "<html>502 Bad Gateway</html>" });

      const resultado = await canal.send({ toPhone: TELEFONE_VALIDO, variables: VARIAVEIS });

      expect(resultado).toEqual({
        success: false,
        reason: "provider error",
        providerCode: null,
      });
    });
  });
});
