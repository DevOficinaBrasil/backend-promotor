// Mints a live confirmation link for an existing NOTIFICACAO_VISITA row,
// bypassing the WhatsApp send path entirely. Development/testing only.
//
//   npx ts-node scripts/mint-visita-link.ts <ID_NOTIFICACAO_VISITA>
//
// The raw link token is never stored - only its SHA-256 hash is - so a token
// read out of the database cannot be replayed. This forces the row to ENVIADO
// with a freshly issued token and prints the URL the reparador would have
// received.
import "dotenv/config";
import { AppDataSourceSync } from "../data-source";
import { gerarLinkToken } from "../utils/visitaToken";

const HORAS_VALIDADE_TOKEN = 168;

async function main(): Promise<void> {
  const id = Number(process.argv[2]);
  if (!Number.isInteger(id)) {
    throw new Error("informe o ID: npx ts-node scripts/mint-visita-link.ts 123");
  }

  await AppDataSourceSync.initialize();

  const { raw, hash } = gerarLinkToken();
  const expiraEm = new Date(Date.now() + HORAS_VALIDADE_TOKEN * 60 * 60 * 1000);

  const linhas = await AppDataSourceSync.query(
    `UPDATE "CAMPANHAS_OB"."NOTIFICACAO_VISITA"
        SET "TOKEN_HASH" = $1,
            "EXPIRA_EM"  = $2,
            "STATUS"     = 'ENVIADO',
            "ERRO_ENVIO" = NULL,
            "ENVIADO_EM" = NOW()
      WHERE "ID_NOTIFICACAO_VISITA" = $3
      RETURNING "ID_ROTA_PROMOTOR"`,
    [hash, expiraEm, id]
  );

  if (linhas.length === 0) {
    throw new Error(`nenhuma notificação com ID_NOTIFICACAO_VISITA = ${id}`);
  }

  const base = (process.env.VISITA_CONFIRMACAO_BASE_URL ?? "").replace(/\/+$/, "");
  const porta = process.env.PORT ?? "3008";

  console.log("\nID_ROTA_PROMOTOR :", linhas[0].ID_ROTA_PROMOTOR);
  console.log("expira em        :", expiraEm.toISOString());
  console.log("\nfrontend :", `${base}/visita/confirmacao?token=${encodeURIComponent(raw)}`);
  console.log("api      :", `http://localhost:${porta}/visita/${encodeURIComponent(raw)}\n`);

  await AppDataSourceSync.destroy();
}

main().catch((erro: Error) => {
  console.error(erro.message);
  process.exit(1);
});
