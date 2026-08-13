/**
 * Console manual da fila de notificações de visita (AGND-17 a AGND-19).
 *
 * Existe para conseguir exercitar a feature de ponta a ponta sem esperar as
 * 09:00 nem editar linha na mão:
 *
 *   npm run outbox:status
 *   npm run outbox:tick
 *   npm run outbox:agendar -- --rota 123
 *   npm run outbox:agendar -- --notificacao 456
 *
 * Roda o mesmo caminho de produção — `OutboxNotificacaoService.tick()` — e não
 * uma implementação paralela, senão o que se testa aqui não é o que roda lá.
 *
 * É script, não rota HTTP, de propósito: um endpoint "roda a fila agora" seria
 * mais uma superfície privilegiada num serviço que já expõe os endpoints
 * públicos de confirmação, e iria para produção só para servir teste local.
 *
 * As travas do canal continuam valendo: com NODE_ENV=test o envio é no-op, e
 * WHATSAPP_SEND_ENABLED precisa ser "true" para sair mensagem de verdade. Com
 * WHATSAPP_TEST_PHONE_OVERRIDE setado, tudo vai para um número só.
 */
import * as dotenv from "dotenv";
import { AppDataSourceSync } from "../data-source";
import OutboxNotificacaoService, {
  idDoWorker,
  tamanhoLote,
} from "../service/outboxNotificacaoService";
import { StatusNotificacaoVisita } from "../entities/NotificacaoVisita";

dotenv.config();

type Comando = "status" | "tick" | "agendar";

interface Argumentos {
  comando: Comando;
  vezes: number;
  idRota: number | null;
  idNotificacao: number | null;
}

const USO = `
Uso:
  npm run outbox:status
  npm run outbox:tick [-- --vezes N]
  npm run outbox:agendar -- --rota <ID_ROTA_PROMOTOR>
  npm run outbox:agendar -- --notificacao <ID_NOTIFICACAO_VISITA>
`.trim();

export function parseArgs(argv: string[]): Argumentos {
  const comando = argv[0] as Comando;

  if (comando !== "status" && comando !== "tick" && comando !== "agendar") {
    throw new Error(`comando desconhecido: ${comando ?? "(nenhum)"}\n\n${USO}`);
  }

  const valorDe = (flag: string): number | null => {
    const i = argv.indexOf(flag);
    if (i === -1) return null;
    const valor = Number(argv[i + 1]);
    if (!Number.isInteger(valor) || valor <= 0) {
      throw new Error(`${flag} exige um id inteiro positivo`);
    }
    return valor;
  };

  const idRota = valorDe("--rota");
  const idNotificacao = valorDe("--notificacao");

  if (comando === "agendar" && idRota === null && idNotificacao === null) {
    throw new Error(`agendar exige --rota ou --notificacao\n\n${USO}`);
  }

  return {
    comando,
    vezes: valorDe("--vezes") ?? 1,
    idRota,
    idNotificacao,
  };
}

/** AGND-18: o que está na fila, para quem, para quando, e por que falhou. */
async function status(): Promise<void> {
  const contagens = await AppDataSourceSync.query(
    `SELECT "STATUS", count(*)::int AS total
       FROM "CAMPANHAS_OB"."NOTIFICACAO_VISITA"
      GROUP BY "STATUS"
      ORDER BY total DESC`
  );

  const [{ vencidas, agendadas, sem_fila: semFila }] = await AppDataSourceSync.query(
    `SELECT
       count(*) FILTER (WHERE "STATUS" = 'PENDENTE' AND "AVAILABLE_AT" IS NOT NULL AND "AVAILABLE_AT" <= now())::int AS vencidas,
       count(*) FILTER (WHERE "STATUS" = 'PENDENTE' AND "AVAILABLE_AT" IS NOT NULL AND "AVAILABLE_AT" > now())::int AS agendadas,
       count(*) FILTER (WHERE "STATUS" = 'PENDENTE' AND "AVAILABLE_AT" IS NULL)::int AS sem_fila
     FROM "CAMPANHAS_OB"."NOTIFICACAO_VISITA"`
  );

  const proximas = await AppDataSourceSync.query(
    `SELECT "ID_NOTIFICACAO_VISITA", "ID_ROTA_PROMOTOR", "AVAILABLE_AT",
            "ATTEMPTS", "LOCKED_BY", "LOCKED_AT", "ERRO_ENVIO"
       FROM "CAMPANHAS_OB"."NOTIFICACAO_VISITA"
      WHERE "STATUS" = 'PENDENTE' AND "AVAILABLE_AT" IS NOT NULL
      ORDER BY "AVAILABLE_AT" ASC
      LIMIT 10`
  );

  console.log("\n── fila de notificações ──────────────────────────────");
  console.table(contagens);
  console.log({
    vencidas_agora: vencidas,
    agendadas_para_depois: agendadas,
    pendentes_sem_AVAILABLE_AT: semFila,
    lote_por_tique: tamanhoLote(),
  });

  if (semFila > 0) {
    console.log(
      `\nnota: ${semFila} linha(s) PENDENTE sem AVAILABLE_AT são anteriores ao outbox ` +
        "e nunca serão reivindicadas (AGND-13)."
    );
  }

  console.log("\n── próximas a sair ───────────────────────────────────");
  console.table(proximas);
}

/** AGND-17: um ciclo em primeiro plano, rode ou não o cron. */
async function tick(vezes: number): Promise<void> {
  for (let i = 1; i <= vezes; i += 1) {
    console.log(`\n── tique ${i}/${vezes} (worker ${idDoWorker("-cli")}) ──`);
    await OutboxNotificacaoService.tick("-cli");
  }
}

/**
 * AGND-19: quais status podem ser rearmados.
 *
 * CONFIRMADO é o único não: repetir um teste nunca pode destruir a confirmação
 * real de um reparador. Função pura de propósito — é a única guarda deste script
 * cuja falha apaga dado de verdade, então precisa de teste próprio.
 */
export function podeRearmar(status: string): boolean {
  return status !== StatusNotificacaoVisita.CONFIRMADO;
}

/** AGND-19: rearma uma linha para sair agora. */
async function agendar(idRota: number | null, idNotificacao: number | null): Promise<void> {
  const [linha] = idNotificacao
    ? await AppDataSourceSync.query(
        `SELECT "ID_NOTIFICACAO_VISITA", "ID_ROTA_PROMOTOR", "STATUS"
           FROM "CAMPANHAS_OB"."NOTIFICACAO_VISITA" WHERE "ID_NOTIFICACAO_VISITA" = $1`,
        [idNotificacao]
      )
    : await AppDataSourceSync.query(
        `SELECT "ID_NOTIFICACAO_VISITA", "ID_ROTA_PROMOTOR", "STATUS"
           FROM "CAMPANHAS_OB"."NOTIFICACAO_VISITA" WHERE "ID_ROTA_PROMOTOR" = $1`,
        [idRota]
      );

  if (linha === undefined) {
    console.error(
      idNotificacao
        ? `nenhuma notificação com ID_NOTIFICACAO_VISITA = ${idNotificacao}`
        : `nenhuma notificação para a rota ${idRota}`
    );
    process.exitCode = 1;
    return;
  }

  if (!podeRearmar(linha.STATUS)) {
    console.error(
      `recusado: a notificação ${linha.ID_NOTIFICACAO_VISITA} está CONFIRMADO. ` +
        "Rearmar apagaria a confirmação real do reparador."
    );
    process.exitCode = 1;
    return;
  }

  await AppDataSourceSync.query(
    `UPDATE "CAMPANHAS_OB"."NOTIFICACAO_VISITA"
        SET "STATUS" = 'PENDENTE',
            "AVAILABLE_AT" = now(),
            "ATTEMPTS" = 0,
            "LOCKED_AT" = NULL,
            "LOCKED_BY" = NULL,
            "ERRO_ENVIO" = NULL,
            "UPDATED_AT" = now()
      WHERE "ID_NOTIFICACAO_VISITA" = $1`,
    [linha.ID_NOTIFICACAO_VISITA]
  );

  console.log("notificação rearmada para sair agora", {
    ID_NOTIFICACAO_VISITA: linha.ID_NOTIFICACAO_VISITA,
    ID_ROTA_PROMOTOR: linha.ID_ROTA_PROMOTOR,
    status_anterior: linha.STATUS,
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  await AppDataSourceSync.initialize();
  try {
    if (args.comando === "status") await status();
    if (args.comando === "tick") await tick(args.vezes);
    if (args.comando === "agendar") await agendar(args.idRota, args.idNotificacao);
  } finally {
    await AppDataSourceSync.destroy();
  }
}

if (require.main === module) {
  main().catch((erro) => {
    console.error((erro as Error).message);
    process.exit(1);
  });
}
