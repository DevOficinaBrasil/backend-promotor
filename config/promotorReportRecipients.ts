/**
 * Lista fixa de destinatários de teste do relatório semanal de promotores
 * (CON26-325). Pedido explícito do usuário: definida em código, não em env
 * var — só recebe fora de produção.
 */
export const DEV_REPORT_RECIPIENTS: string[] = ["andre.pereira@oficinabrasil.com.br"];

/**
 * RELPROM-74, AD-009 (.specs/STATE.md): lista fixa de destinatários em
 * produção, por `idCliente` — pedido explícito do usuário, enquanto só a
 * SKF (126) usa o módulo de promotores. Sobrepõe os usuários reais
 * resolvidos dinamicamente (RELPROM-11) só pros clientes aqui listados;
 * qualquer outro cliente futuro (fora dessa lista) continua indo pros
 * usuários reais, comportamento padrão de RELPROM-31. Remover esse
 * cliente daqui quando a lista de destinatários reais puder ser confiada
 * de novo (mais clientes usando o módulo, ou pedido do usuário).
 */
export const DESTINATARIOS_FIXOS_PRODUCAO_POR_CLIENTE: Record<number, string[]> = {
  126: [
    "gabriel.cavalcante@skfvertevo.com", 
    "mauricio.valdivno@skfvertevo.com", 
    "oclesio.peternela@skfvertevo.com",
    "andre.pereira@oficinabrasil.com.br",
    "fabiano.cesar@oficinabrasil.com.br",
    "julia.pimentel@oficinabrasil.com.br",
  ],
};

export interface ResolucaoDestinatarios {
  destinatarios: string[];
  adminsReaisParaLog: string[];
}

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * RELPROM-28 a RELPROM-31, RELPROM-74. Lê `NODE_ENV` a cada chamada (não
 * cacheado em const de módulo), mesmo cuidado de
 * `CommunityReportEmailService.ts` no backend-ob-ads: `dotenv.config()`
 * pode rodar depois do import deste arquivo. `adminsReaisParaLog` sempre
 * reflete a resolução dinâmica real, mesmo quando não é ela quem recebe o
 * e-mail (RELPROM-74) — permite auditar divergência enquanto o override
 * fixo estiver ativo.
 */
export function resolverDestinatarios(idCliente: number, adminsReais: string[]): ResolucaoDestinatarios {
  const emProducao = process.env.NODE_ENV === "production";

  if (emProducao) {
    const fixosDoCliente = DESTINATARIOS_FIXOS_PRODUCAO_POR_CLIENTE[idCliente];
    const destinatarios = fixosDoCliente ? fixosDoCliente.filter((email) => REGEX_EMAIL.test(email)) : adminsReais;
    return { destinatarios, adminsReaisParaLog: adminsReais };
  }

  const destinatarios = DEV_REPORT_RECIPIENTS.filter((email) => REGEX_EMAIL.test(email));
  return { destinatarios, adminsReaisParaLog: adminsReais };
}
