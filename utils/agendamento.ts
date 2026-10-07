import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

/**
 * Quando uma notificação de visita fica elegível para envio.
 *
 * Existe porque o envio deixou de ser inline: uma importação de rotas às 23h40
 * não pode acordar oficina nenhuma. O horário é sempre horário comercial de São
 * Paulo, independente do fuso do servidor — servidor copiado pode ter fuso ou
 * relógio diferente, e o reparador não deve pagar por isso.
 *
 * A janela é o que evita o rebanho: com NOTIFICACAO_HORA_ENVIO_FIM, um lote de
 * 500 rotas é distribuído ao longo de horas em vez de vencer todo no mesmo
 * instante. Sem isso, o teto de envios por tique (lote x cópias) vira gargalo
 * justo no minuto em que a fila enche.
 */

const FUSO = "America/Sao_Paulo";
const HORA_PADRAO = 9;

function horaDeEnv(chave: string, padrao: number | null): number | null {
  const bruto = process.env[chave];
  if (bruto === undefined || bruto.trim() === "") {
    return padrao;
  }

  const hora = Number(bruto);
  if (!Number.isInteger(hora) || hora < 0 || hora > 23) {
    console.log(`[agendamento] ${chave} inválido (${bruto}), ignorado`);
    return padrao;
  }

  return hora;
}

/**
 * Janela de envio do dia, em horas locais.
 *
 * Sem `NOTIFICACAO_HORA_ENVIO_FIM`, ou com um fim que não é depois do início, a
 * janela colapsa num ponto e todo mundo sai na hora cheia — o comportamento
 * anterior, preservado.
 */
function janela(): { inicio: number; fim: number } {
  const inicio = horaDeEnv("NOTIFICACAO_HORA_ENVIO", HORA_PADRAO) ?? HORA_PADRAO;
  const fim = horaDeEnv("NOTIFICACAO_HORA_ENVIO_FIM", null);

  if (fim === null || fim <= inicio) {
    return { inicio, fim: inicio };
  }

  return { inicio, fim };
}

/**
 * Instante em que a notificação fica disponível para envio (AGND-02).
 *
 * Sempre na janela do **dia seguinte**: uma rota criada hoje sai amanhã, seja
 * qual for a hora da criação. Regra escolhida por ser previsível — nunca
 * "depende de que horas o ops importou".
 *
 * `posicao` e `total` distribuem o lote pela janela: a rota i de um lote de n
 * sai em `inicio + (fim - inicio) * i/n`. Distribuição por lote, não global:
 * duas importações grandes no mesmo dia se sobrepõem, o que é aceitável e muito
 * melhor que as duas vencerem no mesmo instante.
 *
 * `agora` é sempre injetado, nunca lido do relógio: é o que torna a regra
 * testável sem depender da hora em que a suíte roda.
 *
 * Com `OUTBOX_VISITA_ENVIO_IMEDIATO="1"` devolve `agora` sem alteração
 * (AGND-16) — a chave de teste local, que faz a notificação nascer vencida.
 */
/**
 * A janela vale também na hora de **despachar**, não só na de agendar.
 *
 * `AVAILABLE_AT` é decidido na criação da rota, e nada garante que a fila dê conta
 * do dia dentro da janela: lote limitado, tique espaçado, provider lento ou uma
 * importação grande deixam linhas vencidas para trás. Sem esta guarda, essas
 * linhas saem no primeiro tique seguinte — inclusive às 3h da manhã, que é o tipo
 * de mensagem que o destinatário bloqueia e denuncia, e é bloqueio e denúncia que
 * derruba a qualidade do número na Meta.
 *
 * Fora da janela o tique não reivindica nada: a linha fica intacta, sem queimar
 * tentativa, e sai no primeiro tique da janela seguinte.
 *
 * Sem `NOTIFICACAO_HORA_ENVIO_FIM` a janela de agendamento colapsa num ponto
 * (todos na hora cheia); para o despacho isso viraria uma janela de largura zero,
 * então o fim efetivo é uma hora depois do início.
 */
export function dentroDaJanelaDeEnvio(agora: Date): boolean {
  if (process.env.OUTBOX_VISITA_ENVIO_IMEDIATO === "1") {
    return true;
  }

  const { inicio, fim } = janela();
  const fimEfetivo = fim > inicio ? fim : inicio + 1;
  const hora = toZonedTime(agora, FUSO).getHours();

  return hora >= inicio && hora < fimEfetivo;
}

export function proximoHorarioEnvio(agora: Date, posicao = 0, total = 1): Date {
  return horarioNoDia(agora, 1, posicao, total);
}

/**
 * `proximoHorarioEnvio` generalizado para qualquer dia à frente (CONV-21).
 * `horarioNoDia(a, 1, p, t)` é exatamente `proximoHorarioEnvio(a, p, t)`.
 */
export function horarioNoDia(agora: Date, diasAFrente: number, posicao = 0, total = 1): Date {
  if (process.env.OUTBOX_VISITA_ENVIO_IMEDIATO === "1") {
    return agora;
  }

  const { inicio, fim } = janela();

  // Converte para a parede de São Paulo, avança os dias e ancora no início da
  // janela. O ida-e-volta pelo fuso é o que impede o resultado de depender do
  // TZ do processo.
  const local = toZonedTime(agora, FUSO);
  const inicioLocal = new Date(local);
  inicioLocal.setDate(inicioLocal.getDate() + diasAFrente);
  inicioLocal.setHours(inicio, 0, 0, 0);
  const inicioAbs = fromZonedTime(inicioLocal, FUSO);

  if (fim === inicio || total <= 1) {
    return inicioAbs;
  }

  const fimLocal = new Date(inicioLocal);
  fimLocal.setHours(fim, 0, 0, 0);
  const fimAbs = fromZonedTime(fimLocal, FUSO);

  // i/n, e não i/(n-1): o último da fila cai antes do fim da janela, nunca em
  // cima dele. Uma notificação marcada exatamente às 10:00 numa janela que
  // termina às 10:00 é uma notificação fora da janela.
  const posicaoSegura = Math.min(Math.max(posicao, 0), total - 1);
  const passo = (fimAbs.getTime() - inicioAbs.getTime()) / total;

  return new Date(inicioAbs.getTime() + passo * posicaoSegura);
}

export interface PlanoDisparo {
  slots: Date[];
  // data em YYYY-MM-DD, America/Sao_Paulo, em ordem cronológica
  porDia: { data: string; quantidade: number }[];
  // null só quando não há nada a agendar
  ultimoDia: string | null;
}

// Dia de envio (0 = amanhã) e posição do item i dentro dele.
function posicaoNoPlano(i: number, n: number, teto: number) {
  const dia = Math.floor(i / teto);
  return { dia, posicao: i % teto, totalNoDia: Math.min(teto, n - dia * teto) };
}

/**
 * Plano de um disparo com teto diário (CONV-21). O item `i` vai para o dia
 * `1 + floor(i / teto)`, na posição `i % teto` entre os itens daquele dia,
 * espaçado pela janela. Nenhum dia recebe mais que `teto`.
 *
 * `porDia` sai do plano, não dos horários: com OUTBOX_VISITA_ENVIO_IMEDIATO os
 * horários colapsam em `agora`, e a prévia continua mostrando o teto por dia.
 */
export function planejarDisparo(agora: Date, n: number, teto: number): PlanoDisparo {
  const slots: Date[] = [];
  const porDia: { data: string; quantidade: number }[] = [];

  for (let i = 0; i < n; i++) {
    const { dia, posicao, totalNoDia } = posicaoNoPlano(i, n, teto);
    slots.push(horarioNoDia(agora, 1 + dia, posicao, totalNoDia));
    if (posicao === 0) {
      porDia.push({ data: dataEnvio(agora, 1 + dia), quantidade: totalNoDia });
    }
  }

  return { slots, porDia, ultimoDia: porDia.length > 0 ? porDia[porDia.length - 1].data : null };
}

// Data local (São Paulo) do dia de envio `diasAFrente`, ancorada no início da janela.
function dataEnvio(agora: Date, diasAFrente: number): string {
  const { inicio } = janela();
  const local = toZonedTime(agora, FUSO);
  local.setDate(local.getDate() + diasAFrente);
  local.setHours(inicio, 0, 0, 0);
  return formatInTimeZone(fromZonedTime(local, FUSO), FUSO, "yyyy-MM-dd");
}

export const TETO_DIARIO_MAXIMO = 1000;

/**
 * Menor teto cujo último envio cai até `fimCampanha` (inclusive). `null` quando
 * nem o teto máximo cabe. O último horário só recua quando o teto sobe, então a
 * primeira solução encontrada é a menor.
 */
export function tetoMinimo(agora: Date, n: number, fimCampanha: Date): number | null {
  if (n <= 0) {
    return 1;
  }

  for (let teto = 1; teto <= TETO_DIARIO_MAXIMO; teto++) {
    const { dia, posicao, totalNoDia } = posicaoNoPlano(n - 1, n, teto);
    if (horarioNoDia(agora, 1 + dia, posicao, totalNoDia).getTime() <= fimCampanha.getTime()) {
      return teto;
    }
  }

  return null;
}
