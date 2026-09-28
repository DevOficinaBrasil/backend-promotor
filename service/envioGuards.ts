// Pre-send guards: the "should we send at all?" policy, kept out of the send
// orchestrator so it is testable independently of the dispatch mechanics.

import { MoreThanOrEqual } from "typeorm";
import { AppDataSourceSync } from "../data-source";
import NotificacaoVisita, {
  OrigemAceite,
  StatusNotificacaoVisita,
} from "../entities/NotificacaoVisita";

const MESES_CONFIRMACAO_RECENTE = 3;

/** Calendar-month subtraction, so "3 months" tracks the calendar, not 90 fixed days. */
function mesesAtras(agora: Date, meses: number): Date {
  const limite = new Date(agora.getTime());
  limite.setMonth(limite.getMonth() - meses);
  return limite;
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
 * A ordem importa: primeiro grava `EXPIRADO` nas
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
