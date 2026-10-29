export interface ClienteModuloHabilitado {
  idCliente: number;
  nomeCliente: string;
  admins: string[];
}

export type ResultadoListagem =
  | { sucesso: true; dados: ClienteModuloHabilitado[] }
  | { sucesso: false; motivo: string };

export type ResultadoResolucaoCliente =
  | { sucesso: true; dados: ClienteModuloHabilitado }
  | { sucesso: false; motivo: string };

export interface EnviarEmailComAnexoRequest {
  to: string[];
  subject: string;
  bodyHtml: string;
  attachment: { filename: string; content: Buffer; contentType: string };
}

export type ResultadoEnvio = { sucesso: true } | { sucesso: false; motivo: string };

const TIMEOUT_MS = 10_000;

function headersInternos(): Record<string, string> {
  // Lido a cada chamada (não cacheado em const de módulo): dotenv.config()
  // pode rodar depois do import deste arquivo, mesmo cuidado de
  // CommunityReportEmailService.ts no backend-ob-ads.
  return { "x-api-key": process.env.INTERNAL_API_KEY ?? "" };
}

function baseUrl(): string {
  return process.env.OBADS_BASE_URL ?? "";
}

/**
 * Cliente HTTP fino pros 2 endpoints internos genéricos do backend-ob-ads
 * (AD-005, .specs/STATE.md). Nunca lança — todo erro de rede/timeout/HTTP
 * vira `{sucesso: false, motivo}`, mesmo espírito de
 * `rotaService.notificarRotasCriadas` (falha de integração nunca derruba o
 * chamador).
 */
export default class ObAdsIntegrationClient {
  static async listarClientesHabilitados(nomeModulo: string, idCliente?: number): Promise<ResultadoListagem> {
    const url = new URL(`${baseUrl()}/internal/modulos/${encodeURIComponent(nomeModulo)}/clientes-habilitados`);
    if (idCliente !== undefined) {
      url.searchParams.set("idCliente", String(idCliente));
    }

    try {
      const resposta = await fetch(url, {
        method: "GET",
        headers: headersInternos(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!resposta.ok) {
        return { sucesso: false, motivo: `ob-ads respondeu ${resposta.status}` };
      }

      const dados = (await resposta.json()) as ClienteModuloHabilitado[];
      return { sucesso: true, dados };
    } catch (erro) {
      return { sucesso: false, motivo: (erro as Error)?.message ?? "erro desconhecido na chamada ao ob-ads" };
    }
  }

  /**
   * Pós-Execute (AD-006): resolve admins de 1 cliente direto por ID_CLIENTE,
   * sem passar por module/cliente_module — caminho ativo em produção
   * enquanto o SQL Server estiver em congelamento pré-migração.
   */
  static async resolverAdminsDoCliente(idCliente: number): Promise<ResultadoResolucaoCliente> {
    try {
      const resposta = await fetch(`${baseUrl()}/internal/clientes/${encodeURIComponent(String(idCliente))}/admins`, {
        method: "GET",
        headers: headersInternos(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!resposta.ok) {
        return { sucesso: false, motivo: `ob-ads respondeu ${resposta.status}` };
      }

      const dados = (await resposta.json()) as ClienteModuloHabilitado;
      return { sucesso: true, dados };
    } catch (erro) {
      return { sucesso: false, motivo: (erro as Error)?.message ?? "erro desconhecido na chamada ao ob-ads" };
    }
  }

  static async enviarEmailComAnexo(req: EnviarEmailComAnexoRequest): Promise<ResultadoEnvio> {
    try {
      const resposta = await fetch(`${baseUrl()}/internal/email/enviar-com-anexo`, {
        method: "POST",
        headers: { ...headersInternos(), "Content-Type": "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        body: JSON.stringify({
          to: req.to,
          subject: req.subject,
          bodyHtml: req.bodyHtml,
          attachment: {
            filename: req.attachment.filename,
            contentBase64: req.attachment.content.toString("base64"),
            contentType: req.attachment.contentType,
          },
        }),
      });

      const corpo = (await resposta.json().catch(() => ({}))) as { success?: boolean; error?: string };

      if (!resposta.ok || corpo.success !== true) {
        return { sucesso: false, motivo: corpo.error ?? `ob-ads respondeu ${resposta.status}` };
      }

      return { sucesso: true };
    } catch (erro) {
      return { sucesso: false, motivo: (erro as Error)?.message ?? "erro desconhecido na chamada ao ob-ads" };
    }
  }
}
