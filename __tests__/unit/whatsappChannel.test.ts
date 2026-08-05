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
] as const;

const TELEFONE_VALIDO = "5511999998888";
const VARIAVEIS = ["Auto Center Silva", "https://app.example.com/visita/confirmacao?token=abc"];

/** Full, valid configuration with the test-env lock deliberately lifted. */
function configurarEnvioReal() {
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
