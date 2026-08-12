import axios from "axios";
import { CanalNotificacao } from "../entities/NotificacaoVisita";
import { normalizarTelefone } from "../utils/telefone";
import { ChannelSender, ChannelSendParams, ChannelSendResult } from "./ChannelSender";

// First outbound HTTP client in this codebase, so there is no timeout
// convention to follow. 10s is explicit and deliberate: the send runs inside
// the route-creation request cycle, and a hung provider must not stall it.
const TIMEOUT_MS = 10_000;

const CANAL_NAO_CONFIGURADO = "channel not configured";
const TEMPLATE_LANGUAGE = "pt_BR";

// Config-level provider failures (spec AC8): the account, token or template is
// wrong, so no recipient would ever succeed. Recorded as a configuration
// problem, not a per-recipient one.
const CODIGOS_CONFIGURACAO = new Set([
  "TOKEN_MISSING",
  "TOKEN_INVALID",
  "TOKEN_EXPIRED",
  "ACCOUNT_DENIED",
  "SCOPE_DENIED",
  "ACCOUNT_NOT_FOUND",
  "TEMPLATE_NOT_FOUND",
]);

// Spec AC9: captured, never retried — no queue or scheduler exists to retry against.
const CODIGOS_RATE = new Set(["RATE_LIMITED", "QUOTA_EXCEEDED"]);

/**
 * Pulls the provider's error code out of a response body. The provider's error
 * envelope is not pinned down in the spec, so the three plausible shapes are
 * all accepted; anything else yields null and maps to a generic failure.
 */
function extrairCodigo(data: unknown): string | null {
  if (data == null || typeof data !== "object") {
    return null;
  }

  const corpo = data as Record<string, unknown>;

  if (typeof corpo.error === "string") {
    return corpo.error;
  }
  if (corpo.error != null && typeof corpo.error === "object") {
    const codigo = (corpo.error as Record<string, unknown>).code;
    if (typeof codigo === "string") {
      return codigo;
    }
  }
  if (typeof corpo.code === "string") {
    return corpo.code;
  }

  return null;
}

/** Maps a provider error code to the spec's ERRO_ENVIO wording (AC8, AC9). */
function mapearErro(codigo: string | null): ChannelSendResult {
  if (codigo !== null && CODIGOS_CONFIGURACAO.has(codigo)) {
    return { success: false, reason: CANAL_NAO_CONFIGURADO, providerCode: codigo };
  }
  if (codigo !== null && CODIGOS_RATE.has(codigo)) {
    return { success: false, reason: "provider rate/quota", providerCode: codigo };
  }
  if (codigo === "VALIDATION_ERROR") {
    return { success: false, reason: "invalid payload", providerCode: codigo };
  }
  return { success: false, reason: "provider error", providerCode: codigo };
}

export class WhatsAppChannel implements ChannelSender {
  readonly canal = CanalNotificacao.WHATSAPP;

  async send(params: ChannelSendParams): Promise<ChannelSendResult> {
    if(process.env.NODE_ENV === "development") {
      console.log("[whatsappChannel] Em dev - channel nao sera acionado", params);
      return { success: false, reason: CANAL_NAO_CONFIGURADO, providerCode: null };
    }

    const accountId = process.env.WHATSAPP_ACCOUNT_ID;
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME_VISITA;
    const baseUrl = process.env.WHATSAPP_BASE_URL;
    const apiKey = process.env.WHATSAPP_API_KEY;

    // Last gate before the wire: never hand the provider a malformed number,
    // even if an upstream caller skipped normalization (spec AC4).
    const toPhone = normalizarTelefone(params.toPhone);
    if (toPhone === null) {
      console.warn("[whatsappChannel] envio recusado: telefone inválido");
      return { success: false, reason: "invalid phone", providerCode: null };
    }

    const payload = {
      accountId,
      toPhone,
      templateName,
      templateLanguage: TEMPLATE_LANGUAGE,
      variables: params.variables,
    };

    // Lock 2 (spec AC13) — checked FIRST and unconditionally, so no combination
    // of WHATSAPP_SEND_ENABLED / account / template can produce a real send
    // during a test run.
    if (process.env.NODE_ENV === "test") {
      console.log("[whatsappChannel] no-op: NODE_ENV=test", payload);
      return { success: false, reason: CANAL_NAO_CONFIGURADO, providerCode: null };
    }

    // Lock 1 (spec AC12) — default-off in every environment; must be exactly "true".
    if (process.env.WHATSAPP_SEND_ENABLED !== "true") {
      console.log("[whatsappChannel] no-op: WHATSAPP_SEND_ENABLED não é \"true\"", payload);
      return { success: false, reason: CANAL_NAO_CONFIGURADO, providerCode: null };
    }

    // Spec AC11 names accountId and templateName; baseUrl and apiKey are the
    // same class of unprovisioned config (AC6 needs both to build the call), so
    // they fail closed the same way rather than posting to "undefined/...".
    if (!accountId || !templateName || !baseUrl || !apiKey) {
      console.log("[whatsappChannel] no-op: configuração ausente", payload);
      return { success: false, reason: CANAL_NAO_CONFIGURADO, providerCode: null };
    }

    try {
      const resposta = await axios.post(`${baseUrl}/api/v1/messages/send-template`, payload, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: TIMEOUT_MS,
      });

      const data: unknown = resposta.data;
      if (data != null && typeof data === "object" && (data as Record<string, unknown>).success === true) {
        const corpo = data as Record<string, unknown>;
        return {
          success: true,
          messageId: typeof corpo.messageId === "string" ? corpo.messageId : null,
          providerMessageId:
            typeof corpo.providerMessageId === "string" ? corpo.providerMessageId : null,
        };
      }

      return mapearErro(extrairCodigo(data));
    } catch (erro) {
      // Network error, timeout and non-2xx all land here; none may escape —
      // route creation must never fail because of a notification (spec AC10).
      const resposta = (erro as { response?: { data?: unknown } })?.response;
      if (resposta !== undefined) {
        return mapearErro(extrairCodigo(resposta.data));
      }
      console.error("[whatsappChannel] falha de rede no envio", (erro as Error)?.message);
      return { success: false, reason: "network error", providerCode: null };
    }
  }
}

export const whatsAppChannel = new WhatsAppChannel();
