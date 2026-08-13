import { fromZonedTime, toZonedTime } from "date-fns-tz";

/**
 * Quando uma notificação de visita fica elegível para envio.
 *
 * Existe porque o envio deixou de ser inline: uma importação de rotas às 23h40
 * não pode acordar oficina nenhuma. O horário é sempre um horário comercial de
 * São Paulo, independente do fuso do servidor — servidor copiado pode ter fuso
 * ou relógio diferente, e o reparador não deve pagar por isso.
 */

const FUSO = "America/Sao_Paulo";
const HORA_PADRAO = 9;

/** Hora do dia configurada, com fallback para 9 em qualquer valor inutilizável. */
function horaConfigurada(): number {
  const bruto = process.env.NOTIFICACAO_HORA_ENVIO;
  if (bruto === undefined || bruto.trim() === "") {
    return HORA_PADRAO;
  }

  const hora = Number(bruto);
  if (!Number.isInteger(hora) || hora < 0 || hora > 23) {
    console.log(
      `[agendamento] NOTIFICACAO_HORA_ENVIO inválido (${bruto}), usando ${HORA_PADRAO}`
    );
    return HORA_PADRAO;
  }

  return hora;
}

/**
 * Próxima ocorrência da hora de envio em `America/Sao_Paulo`, estritamente
 * depois de `agora` (AGND-02).
 *
 * `agora` é sempre injetado, nunca lido do relógio: é o que torna a regra
 * testável sem depender da hora em que a suíte roda.
 *
 * Com `OUTBOX_VISITA_ENVIO_IMEDIATO="1"` devolve `agora` sem alteração
 * (AGND-16) — a chave de teste local, que faz a notificação nascer vencida.
 * A checagem mora aqui, e não no call site, para existir um único lugar onde
 * esse desvio pode acontecer.
 */
export function proximoHorarioEnvio(agora: Date): Date {
  if (process.env.OUTBOX_VISITA_ENVIO_IMEDIATO === "1") {
    return agora;
  }

  const hora = horaConfigurada();

  // Converte para a parede de São Paulo, zera na hora alvo do mesmo dia, e
  // volta para instante absoluto. O ida-e-volta pelo fuso é o que impede o
  // resultado de depender do TZ do processo.
  const local = toZonedTime(agora, FUSO);
  const alvoLocal = new Date(local);
  alvoLocal.setHours(hora, 0, 0, 0);

  let alvo = fromZonedTime(alvoLocal, FUSO);

  // "Estritamente depois": exatamente na hora cheia, vai para o dia seguinte.
  if (alvo.getTime() <= agora.getTime()) {
    alvoLocal.setDate(alvoLocal.getDate() + 1);
    alvo = fromZonedTime(alvoLocal, FUSO);
  }

  return alvo;
}
