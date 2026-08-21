/**
 * Read-only DB console.
 *
 * Usage:
 *   npx ts-node scripts/db-query.ts "SELECT * FROM \"CAMPANHAS_OB\".\"PROMOTOR\" LIMIT 5"
 *   npx ts-node scripts/db-query.ts --file query.sql
 *   npx ts-node scripts/db-query.ts --json "SELECT 1"
 *
 * Credentials come from .env.readonly (gitignored), user `ob_leitura`.
 * Every statement runs inside a READ ONLY transaction that is always rolled
 * back, so a write cannot reach the database even if one is submitted.
 */
import { Client } from "pg";
import * as dotenv from "dotenv";
import { readFileSync } from "fs";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env.readonly") });

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const fileIdx = args.indexOf("--file");

const sql =
  fileIdx !== -1
    ? readFileSync(args[fileIdx + 1], "utf8")
    : args.filter((a) => !a.startsWith("--"))[0];

if (!sql) {
  console.error('Usage: npx ts-node scripts/db-query.ts "SELECT ..." [--json]');
  process.exit(1);
}

async function main() {
  const client = new Client({
    host: process.env.RO_DB_HOST,
    port: parseInt(process.env.RO_DB_PORT || "5432"),
    user: process.env.RO_DB_USERNAME,
    password: process.env.RO_DB_PASSWORD,
    database: process.env.RO_DB_DATABASE,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 30_000,
  });

  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const result = await client.query(sql);
    const rows = Array.isArray(result) ? result[result.length - 1].rows : result.rows;

    if (asJson) {
      console.log(JSON.stringify(rows, null, 2));
    } else if (!rows || rows.length === 0) {
      console.log("(0 rows)");
    } else {
      console.table(rows);
      console.log(`(${rows.length} rows)`);
    }
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
}

main().catch((err) => {
  console.error("Query failed:", err.message);
  process.exit(1);
});
