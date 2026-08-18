import axios from "axios";
import { CanalNotificacao } from "../entities/NotificacaoVisita";
import { normalizarTelefone } from "../utils/telefone";
import { ChannelSender, ChannelSendParams, ChannelSendResult } from "./ChannelSender";

/** Variante de falha de ChannelSendResult — a única que o log de erro recebe. */
type FalhaEnvio = Extract<ChannelSendResult, { success: false }>;

// First outbound HTTP client in this codebase, so there is no timeout
// convention to follow. 10s is explicit and deliberate: the send runs inside
// the route-creation request cycle, and a hung provider must not stall it.
const TIMEOUT_MS = 10_000;

/**
 * Exportado para a fila dimensionar o lote: o pior caso de uma linha é este
 * timeout, e um lote que passe do lease do outbox é reivindicável por outro
 * worker no meio do envio — mensagem duplicada para a mesma oficina.
 */
export const TIMEOUT_ENVIO_MS = TIMEOUT_MS;

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
 * Fadiga do destinatário: a Meta recusou a entrega para *esta pessoa*, não para o
 * número nem para o template.
 *
 * `131049` é o código documentado ("This message was not delivered to maintain
 * healthy ecosystem engagement"): o destinatário bateu no limite de mensagens que
 * a Meta deixa chegar a ele. A orientação da Meta é esperar **24h** — retentar
 * antes disso pode estender a indisponibilidade para o mesmo usuário. Nossa
 * escada de retentativa é de 15s/60s/5min, ou seja, exatamente o contrário.
 *
 * Só o código numérico documentado entra aqui. O provider é um wrapper e pode
 * batizar isso de outra forma; código desconhecido continua caindo em
 * `provider error` e aparece no log de falha (`classificado ...`), que é de onde
 * sai o nome real para acrescentar nesta lista.
 */
const CODIGOS_FADIGA_DESTINATARIO = new Set(["131049"]);

/** Fadiga do destinatário — nem falha de configuração, nem culpa desta mensagem. */
export const LIMITE_DESTINATARIO = "recipient message limit";

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

  // Número conta: os códigos da Meta são inteiros (`131049`), e um provider que
  // repassa o corpo cru manda inteiro. Só string faria o código documentado cair
  // no caso genérico e ser retentado.
  const comoCodigo = (valor: unknown): string | null => {
    if (typeof valor === "string") {
      return valor;
    }
    if (typeof valor === "number" && Number.isFinite(valor)) {
      return String(valor);
    }
    return null;
  };

  const doErro = comoCodigo(corpo.error);
  if (doErro !== null) {
    return doErro;
  }
  if (corpo.error != null && typeof corpo.error === "object") {
    const codigo = comoCodigo((corpo.error as Record<string, unknown>).code);
    if (codigo !== null) {
      return codigo;
    }
  }

  return comoCodigo(corpo.code);
}

/** Corpo de resposta serializado para log, truncado — provider pode devolver HTML inteiro. */
const MAX_CORPO_LOG = 2_000;

function serializarCorpo(data: unknown): string {
  if (data == null) {
    return "(vazio)";
  }
  try {
    const texto = typeof data === "string" ? data : JSON.stringify(data);
    if (texto.length <= MAX_CORPO_LOG) {
      return texto;
    }
    return `${texto.slice(0, MAX_CORPO_LOG)}… (+${texto.length - MAX_CORPO_LOG} chars)`;
  } catch {
    return `(não serializável: ${Object.prototype.toString.call(data)})`;
  }
}

interface DiagnosticoFalha {
  url: string;
  status?: number;
  statusText?: string;
  corpo: unknown;
  erroAxios?: unknown;
  toPhone: string;
  accountId: string;
  templateName: string;
  overrideAtivo: boolean;
  duracaoMs: number;
  resultado: FalhaEnvio;
}

/**
 * Log completo de uma falha de envio. Existe porque `ChannelSendResult` guarda
 * só `reason` + `providerCode`: sem isto, um 4xx do provider vira uma linha
 * FALHOU no banco sem URL, sem status e sem corpo — nada com que depurar.
 *
 * Nunca imprime WHATSAPP_API_KEY, e o header Authorization não entra aqui.
 */
function logarFalhaEnvio(d: DiagnosticoFalha): void {
  const axiosErro = d.erroAxios as { code?: string; message?: string } | undefined;

  console.error(
    [
      "",
      "══ [whatsappChannel] FALHA DE ENVIO ══════════════════════",
      `  quando ......... ${new Date().toISOString()}`,
      `  url ............ POST ${d.url}`,
      `  http ........... ${d.status ?? "(sem resposta)"} ${d.statusText ?? ""}`.trimEnd(),
      `  erro rede ...... ${axiosErro?.code ?? "-"} ${axiosErro?.message ?? ""}`.trimEnd(),
      `  duração ........ ${d.duracaoMs}ms (timeout ${TIMEOUT_MS}ms)`,
      `  destino ........ ${d.toPhone}${d.overrideAtivo ? " (OVERRIDE DE TESTE)" : ""}`,
      `  accountId ...... ${d.accountId}`,
      `  template ....... ${d.templateName} (${TEMPLATE_LANGUAGE})`,
      `  provider code .. ${d.resultado.providerCode ?? "(nenhum no corpo)"}`,
      `  classificado ... ${d.resultado.reason}`,
      `  corpo .......... ${serializarCorpo(d.corpo)}`,
      "══════════════════════════════════════════════════════════",
    ].join("\n")
  );
}

/** Maps a provider error code to the spec's ERRO_ENVIO wording (AC8, AC9). */
function mapearErro(codigo: string | null): FalhaEnvio {
  if (codigo !== null && CODIGOS_CONFIGURACAO.has(codigo)) {
    return { success: false, reason: CANAL_NAO_CONFIGURADO, providerCode: codigo };
  }
  if (codigo !== null && CODIGOS_FADIGA_DESTINATARIO.has(codigo)) {
    return { success: false, reason: LIMITE_DESTINATARIO, providerCode: codigo };
  }
  if (codigo !== null && CODIGOS_RATE.has(codigo)) {
    return { success: false, reason: "provider rate/quota", providerCode: codigo };
  }
  if (codigo === "VALIDATION_ERROR") {
    return { success: false, reason: "invalid payload", providerCode: codigo };
  }
  return { success: false, reason: "provider error", providerCode: codigo };
}

/**
 * Loopback base URL — o mock local de `scripts/whatsappMockServer.ts`. Só um
 * host desses pode escapar da trava de dev, porque ele não alcança provider
 * nenhum: no pior caso a mensagem morre no console do mock.
 */
function ehMockLocal(baseUrl: string | undefined): boolean {
  if (!baseUrl) {
    return false;
  }
  try {
    const { hostname } = new URL(baseUrl);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

/**
 * Número único que recebe TODOS os envios quando `WHATSAPP_TEST_PHONE_OVERRIDE`
 * está setado — o jeito de testar contra o provider real sem que nenhuma
 * mensagem chegue a uma oficina de verdade.
 *
 * Passa pela mesma normalização do destinatário real: um override malformado
 * vira null e o envio segue para o destinatário original, então a variável
 * nunca redireciona "pela metade". NUNCA deve existir em produção — todo envio
 * legítimo pararia neste número.
 */
function obterOverrideTeste(): string | null {
  const bruto = process.env.WHATSAPP_TEST_PHONE_OVERRIDE;
  if (!bruto) {
    return null;
  }
  const normalizado = normalizarTelefone(bruto);
  if (normalizado === null) {
    console.warn(
      "[whatsappChannel] WHATSAPP_TEST_PHONE_OVERRIDE inválido, ignorado:",
      bruto
    );
  }
  return normalizado;
}

export class WhatsAppChannel implements ChannelSender {
  readonly canal = CanalNotificacao.WHATSAPP;

  async send(params: ChannelSendParams): Promise<ChannelSendResult> {
    const overrideTeste = obterOverrideTeste();

    // Trava de dev (c035a4d): a base de dev tem telefones reais, então nenhum
    // envio sai daqui — com duas exceções que, por construção, não alcançam
    // usuário nenhum: o mock em loopback, e o override de teste, que manda tudo
    // para um único número conhecido.
    if (
      process.env.NODE_ENV === "development" &&
      !ehMockLocal(process.env.WHATSAPP_BASE_URL) &&
      overrideTeste === null
    ) {
      console.log("[whatsappChannel] Em dev - channel nao sera acionado", params);
      return { success: false, reason: CANAL_NAO_CONFIGURADO, providerCode: null };
    }

    const accountId = process.env.WHATSAPP_ACCOUNT_ID;
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME_VISITA;
    const baseUrl = process.env.WHATSAPP_BASE_URL;
    const apiKey = process.env.WHATSAPP_API_KEY;

    // Last gate before the wire: never hand the provider a malformed number,
    // even if an upstream caller skipped normalization (spec AC4).
    const destinatarioReal = normalizarTelefone(params.toPhone);
    if (destinatarioReal === null) {
      console.warn("[whatsappChannel] envio recusado: telefone inválido");
      return { success: false, reason: "invalid phone", providerCode: null };
    }

    // O destinatário real é validado ANTES do desvio, de propósito: com o
    // override ligado o canal continua rejeitando oficina de telefone inválido
    // exatamente como em produção, em vez de mascarar o caso mandando tudo para
    // o número de teste.
    const toPhone = overrideTeste ?? destinatarioReal;
    if (overrideTeste !== null) {
      console.warn(
        `[whatsappChannel] OVERRIDE DE TESTE ATIVO — destinatário real ${destinatarioReal} substituído por ${overrideTeste}`
      );
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

    const url = `${baseUrl}/api/v1/messages/send-template`;
    const iniciadoEm = Date.now();

    /** Contexto comum a todo log de falha; só o que varia por caminho é passado. */
    const diagnosticar = (
      parcial: Pick<DiagnosticoFalha, "corpo" | "resultado"> & Partial<DiagnosticoFalha>
    ) =>
      logarFalhaEnvio({
        url,
        toPhone,
        accountId,
        templateName,
        overrideAtivo: overrideTeste !== null,
        duracaoMs: Date.now() - iniciadoEm,
        ...parcial,
      });

    try {
      const resposta = await axios.post(url, payload, {
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

      // 2xx sem `success: true` — o caminho mais traiçoeiro, porque não lança
      // exceção nenhuma e some sem log se não for tratado aqui.
      const resultado = mapearErro(extrairCodigo(data));
      diagnosticar({
        corpo: data,
        resultado,
        status: resposta.status,
        statusText: (resposta as { statusText?: string }).statusText,
      });
      return resultado;
    } catch (erro) {
      // Network error, timeout and non-2xx all land here; none may escape —
      // route creation must never fail because of a notification (spec AC10).
      const resposta = (erro as {
        response?: { data?: unknown; status?: number; statusText?: string };
      })?.response;

      if (resposta !== undefined) {
        const resultado = mapearErro(extrairCodigo(resposta.data));
        diagnosticar({
          corpo: resposta.data,
          resultado,
          status: resposta.status,
          statusText: resposta.statusText,
          erroAxios: erro,
        });
        return resultado;
      }

      const resultado: FalhaEnvio = {
        success: false,
        reason: "network error",
        providerCode: null,
      };
      diagnosticar({ corpo: null, resultado, erroAxios: erro });
      return resultado;
    }
  }
}

export const whatsAppChannel = new WhatsAppChannel();
