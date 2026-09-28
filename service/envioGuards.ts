// Pre-send guards: the "should we send at all?" policy, kept out of the send
// orchestrator so it is testable independently of the dispatch mechanics.

import { LessThan, MoreThanOrEqual } from "typeorm";
import { AppDataSourceSync } from "../data-source";
import NotificacaoVisita, {
  OrigemAceite,
  StatusNotificacaoVisita,
} from "../entities/NotificacaoVisita";

const MESES_FRESCOR_ENDERECO = 3;
const MESES_CONFIRMACAO_RECENTE = 3;

export const MOTIVO_PENDENTE = "recipient has outstanding notification";
export const MOTIVO_CONFIRMADO_RECENTE = "recipient confirmed recently";

export interface GuardaResultado {
  bloqueado: boolean;
  motivo?: string;
}

/** Calendar-month subtraction, so "3 months" tracks the calendar, not 90 fixed days. */
function mesesAtras(agora: Date, meses: number): Date {
  const limite = new Date(agora.getTime());
  limite.setMonth(limite.getMonth() - meses);
  return limite;
}

/**
 * True when the workshop's record was updated within the last 3 months, in
 * which case the reparador is not asked to re-confirm the address (spec AC26).
 *
 * A NULL/absent DATA_ALTERACAO counts as stale, never fresh: the guard only
 * skips on a positive, recent timestamp (spec edge case). The parameter type
 * is structural rather than Pick<Oficina, "DATA_ALTERACAO"> because TypeORM
 * hands back null for the column while the entity declares it optional.
 *
 * @param agora - injectable clock so the 3-month boundary is testable
 */
export function enderecoRecente(
  oficina: { DATA_ALTERACAO?: Date | null },
  agora: Date = new Date()
): boolean {
  const alteradoEm = oficina.DATA_ALTERACAO;

  if (alteradoEm == null) {
    return false;
  }

  return alteradoEm.getTime() >= mesesAtras(agora, MESES_FRESCOR_ENDERECO).getTime();
}

/**
 * Decides whether this recipient may be messaged at all (spec AC27-AC29).
 *
 * Scoped to the person, not the workshop: a blocking row on ANY Oficina blocks
 * the send, because the guard protects the individual's phone from repeat
 * messages.
 *
 * Order is load-bearing. The opportunistic EXPIRADO persist runs FIRST (AC27),
 * so a row that has already lapsed is never counted as outstanding by the
 * check that follows. Reversing the two would let a just-expired row falsely
 * block a legitimate send.
 *
 * @param agora - injectable clock so the expiry and 3-month windows are testable
 */
export async function avaliarGuardas(
  idUsuario: number,
  agora: Date = new Date()
): Promise<GuardaResultado> {
  const repo = AppDataSourceSync.getRepository(NotificacaoVisita);

  // 1. Opportunistic cleanup (AC27) — MUST precede the outstanding check below.
  // Nothing sweeps expired rows, so this scan is the only thing that lets the
  // stored column self-heal for an active recipient.
  await repo.update(
    {
      ID_USUARIO: idUsuario,
      STATUS: StatusNotificacaoVisita.ENVIADO,
      EXPIRA_EM: LessThan(agora),
    },
    { STATUS: StatusNotificacaoVisita.EXPIRADO }
  );

  // 2 & 3. Outstanding request (AC28) and recent confirmation (AC29), asked as
  // one OR'd query rather than two round trips: both are keyed on ID_USUARIO
  // and covered by IDX_NOTIFICACAO_VISITA_USUARIO_STATUS, and this runs on
  // every route creation. Only STATUS is selected — the decision needs nothing
  // else, and precedence is applied below rather than by query order.
  //
  // The EXPIRA_EM filter is kept in addition to step 1 so a failed or partial
  // persist can never resurrect an expired row as outstanding.
  const bloqueios = await repo.find({
    where: [
      {
        ID_USUARIO: idUsuario,
        STATUS: StatusNotificacaoVisita.ENVIADO,
        EXPIRA_EM: MoreThanOrEqual(agora),
      },
      {
        ID_USUARIO: idUsuario,
        STATUS: StatusNotificacaoVisita.CONFIRMADO,
        CONFIRMADO_EM: MoreThanOrEqual(mesesAtras(agora, MESES_CONFIRMACAO_RECENTE)),
      },
    ],
    select: { ID_NOTIFICACAO_VISITA: true, STATUS: true },
  });

  // AC28 before AC29: an outstanding request is the more specific reason, and
  // reversing them would relabel a live notification as a recent confirmation.
  if (bloqueios.some((linha) => linha.STATUS === StatusNotificacaoVisita.ENVIADO)) {
    return { bloqueado: true, motivo: MOTIVO_PENDENTE };
  }

  if (bloqueios.some((linha) => linha.STATUS === StatusNotificacaoVisita.CONFIRMADO)) {
    return { bloqueado: true, motivo: MOTIVO_CONFIRMADO_RECENTE };
  }

  return { bloqueado: false };
}

/**
 * Convite em aberto da mesma oficina (CONV-26): devolve o id de uma
 * notificação `ENVIADO` ainda não expirada, em qualquer outra rota da oficina,
 * ou `null`. A notificação que está sendo despachada (`idNotificacao`) nunca
 * conta como referência dela mesma.
 *
 * A chave é a oficina, não o usuário: "aceitou lá, vale aqui" só faz sentido
 * para a mesma oficina. `NOTIFICACAO_VISITA` não tem `ID_OFICINA`, então a
 * oficina vem do join com `ROTA_PROMOTOR`.
 *
 * A ordem importa como em `avaliarGuardas`: primeiro grava `EXPIRADO` nas
 * `ENVIADO` vencidas da oficina, depois procura a aberta. O filtro de
 * `EXPIRA_EM` na busca continua, para que uma gravação que falhou não
 * ressuscite uma linha vencida.
 *
 * @param agora - relógio injetável, para testar a fronteira de expiração
 */
export async function convitePendenteDaOficina(
  idOficina: number,
  idNotificacao: number,
  agora: Date = new Date()
): Promise<number | null> {
  await AppDataSourceSync.query(
    `UPDATE "CAMPANHAS_OB"."NOTIFICACAO_VISITA" nv
        SET "STATUS" = 'EXPIRADO',
            "UPDATED_AT" = now()
       FROM "CAMPANHAS_OB"."ROTA_PROMOTOR" rp
      WHERE rp."ID_ROTA_PROMOTOR" = nv."ID_ROTA_PROMOTOR"
        AND rp."ID_OFICINA" = $1
        AND nv."STATUS" = 'ENVIADO'
        AND nv."EXPIRA_EM" < $2`,
    [idOficina, agora]
  );

  const linhas: { ID_NOTIFICACAO_VISITA: number | string }[] = await AppDataSourceSync.query(
    `SELECT nv."ID_NOTIFICACAO_VISITA"
       FROM "CAMPANHAS_OB"."NOTIFICACAO_VISITA" nv
       JOIN "CAMPANHAS_OB"."ROTA_PROMOTOR" rp
         ON rp."ID_ROTA_PROMOTOR" = nv."ID_ROTA_PROMOTOR"
      WHERE rp."ID_OFICINA" = $1
        AND nv."ID_NOTIFICACAO_VISITA" <> $2
        AND nv."STATUS" = 'ENVIADO'
        AND nv."EXPIRA_EM" >= $3
      ORDER BY nv."ID_NOTIFICACAO_VISITA" ASC
      LIMIT 1`,
    [idOficina, idNotificacao, agora]
  );

  const id = linhas?.[0]?.ID_NOTIFICACAO_VISITA;
  return id == null ? null : Number(id);
}

/**
 * Confirmação recente do destinatário (CONV-30): devolve o id da confirmação
 * mais recente feita pelo próprio reparador (`ORIGEM_ACEITE = 'REPARADOR'`)
 * nos últimos 3 meses, ou `null`.
 *
 * Só `REPARADOR` conta. Um aceite automático (`CONFIRMACAO_RECENTE`,
 * `CONVITE_VINCULADO`, `IMPORTADA`) contando aqui renovaria a janela para
 * sempre sem ninguém ter confirmado nada.
 *
 * Continua por `ID_USUARIO`, como a guarda antiga.
 *
 * @param agora - relógio injetável, para testar a janela de 3 meses
 */
export async function confirmacaoRecente(
  idUsuario: number,
  agora: Date = new Date()
): Promise<number | null> {
  const linha = await AppDataSourceSync.getRepository(NotificacaoVisita).findOne({
    where: {
      ID_USUARIO: idUsuario,
      STATUS: StatusNotificacaoVisita.CONFIRMADO,
      ORIGEM_ACEITE: OrigemAceite.REPARADOR,
      CONFIRMADO_EM: MoreThanOrEqual(mesesAtras(agora, MESES_CONFIRMACAO_RECENTE)),
    },
    select: { ID_NOTIFICACAO_VISITA: true },
    order: { CONFIRMADO_EM: "DESC" },
  });

  return linha?.ID_NOTIFICACAO_VISITA ?? null;
}
