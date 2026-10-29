/**
 * Lista fixa de destinatários de teste do relatório semanal de promotores
 * (CON26-325). Pedido explícito do usuário: definida em código, não em env
 * var — só recebe fora de produção.
 */
export const DEV_REPORT_RECIPIENTS: string[] = [];

export interface ResolucaoDestinatarios {
  destinatarios: string[];
  adminsReaisParaLog: string[];
}

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * RELPROM-28 a RELPROM-31. Lê `NODE_ENV` a cada chamada (não cacheado em
 * const de módulo), mesmo cuidado de `CommunityReportEmailService.ts` no
 * backend-ob-ads: `dotenv.config()` pode rodar depois do import deste
 * arquivo.
 */
export function resolverDestinatarios(adminsReais: string[]): ResolucaoDestinatarios {
  const emProducao = process.env.NODE_ENV === "production";

  if (emProducao) {
    return { destinatarios: adminsReais, adminsReaisParaLog: adminsReais };
  }

  const destinatarios = DEV_REPORT_RECIPIENTS.filter((email) => REGEX_EMAIL.test(email));
  return { destinatarios, adminsReaisParaLog: adminsReais };
}
