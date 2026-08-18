/**
 * IP do cliente atrás do load balancer.
 *
 * `req.ip` do Express só é o endereço do cliente quando o app declara
 * `trust proxy`, e este não declara — de propósito: o limitador de requisições da
 * visita é chaveado no token justamente porque `req.ip` resolve para o ALB
 * (`routes/VisitaRoute.ts`). O efeito colateral era `CONFIRMADO_IP` guardar
 * sempre o endereço do balanceador, o que zera o valor da coluna de auditoria.
 *
 * A leitura é feita aqui, e não com `app.set('trust proxy')`, para mudar apenas
 * quem grava auditoria — mexer no global mudaria `req.ip` para todas as rotas e
 * para o limitador de uma vez.
 *
 * `X-Forwarded-For` é uma lista `cliente, proxy1, proxy2, ...` em que **cada
 * proxy acrescenta ao fim** o endereço de quem falou com ele. Um cliente pode
 * mandar o header já preenchido com valor falso, então o único elemento
 * confiável é o que a borda acrescentou: contando do fim, o de índice
 * `TRUST_PROXY_HOPS - 1` (1 por padrão, o ALB). Com 2 camadas — CloudFront na
 * frente do ALB, por exemplo — `TRUST_PROXY_HOPS=2`.
 */
const HOPS_PADRAO = 1;

function hopsConfiaveis(): number {
  const bruto = process.env.TRUST_PROXY_HOPS;
  if (bruto === undefined || bruto.trim() === "") {
    return HOPS_PADRAO;
  }

  const valor = Number(bruto);
  return Number.isInteger(valor) && valor > 0 ? valor : HOPS_PADRAO;
}

interface RequisicaoComIp {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
}

export function ipDoCliente(req: RequisicaoComIp): string {
  const cabecalho = req.headers?.["x-forwarded-for"];
  const lista = Array.isArray(cabecalho) ? cabecalho.join(",") : (cabecalho ?? "");
  const enderecos = lista
    .split(",")
    .map((parte) => parte.trim())
    .filter((parte) => parte !== "");

  if (enderecos.length > 0) {
    // Sem header suficiente para os hops declarados, fica o primeiro que a borda
    // pode ter acrescentado — nunca um índice negativo.
    const indice = Math.max(0, enderecos.length - hopsConfiaveis());
    return enderecos[indice];
  }

  return req.ip ?? req.socket?.remoteAddress ?? "";
}
