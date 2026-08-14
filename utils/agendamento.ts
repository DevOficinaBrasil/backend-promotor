import { fromZonedTime, toZonedTime } from "date-fns-tz";

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
export function proximoHorarioEnvio(agora: Date, posicao = 0, total = 1): Date {
  if (process.env.OUTBOX_VISITA_ENVIO_IMEDIATO === "1") {
    return agora;
  }

  const { inicio, fim } = janela();

  // Converte para a parede de São Paulo, avança um dia e ancora no início da
  // janela. O ida-e-volta pelo fuso é o que impede o resultado de depender do
  // TZ do processo.
  const local = toZonedTime(agora, FUSO);
  const inicioLocal = new Date(local);
  inicioLocal.setDate(inicioLocal.getDate() + 1);
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
