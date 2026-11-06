// Sincroniza MAIN_REGISTER.OFICINA com a base de oficinas da Ultracar
// (ultracar_process), para oficinas já casadas por CNPJ.
//
//   npx ts-node scripts/sincronizar-oficinas-ultracar.ts [--teste[=N]]
//
// --teste (ou --teste=N) liga o modo de teste: só lista as candidatas (CEP
// atual vs. CEP da Ultracar), limitado a N linhas (padrão N=20), sem
// executar nenhum UPDATE/INSERT. Use para validar antes do disparo real.
//
// Responsabilidade 1 (esta task): correção de CEP — oficina já casada por
// CNPJ, CEP divergente do CEP cadastral da Ultracar, e sem confirmação de
// endereço (DATA_ATUALIZACAO_ENDERECO) nos últimos 12 meses.
import "dotenv/config";
import { AppDataSourceSync } from "../data-source";
import { cnpjIntDaOficina } from "../utils/sqlCadastroEmpresa";

const LIMITE_TESTE_PADRAO = 20;
const MESES_JANELA_ATUALIZACAO_ENDERECO = 12;

function parseLimiteTeste(args: string[]): number | null {
  const flag = args.find((a) => a.startsWith("--teste"));
  if (!flag) return null;

  const [, valor] = flag.split("=");
  const limite = valor ? Number(valor) : LIMITE_TESTE_PADRAO;

  if (!Number.isInteger(limite) || limite <= 0) {
    throw new Error(`limite de teste inválido em "${flag}" (esperado um inteiro positivo)`);
  }

  return limite;
}

function cepDigitos(cep: string | null | undefined): string {
  return (cep ?? "").replace(/\D/g, "");
}

export interface CandidatoCorrecaoCep {
  temMatchUltracar: boolean;
  cepOficina: string | null;
  cepUltracar: string | null;
  dataAtualizacaoEndereco: Date | null;
}

/**
 * Candidata à correção de CEP (ULTRACAR-15 a ULTRACAR-20): só oficina casada
 * por CNPJ, com CEP divergente do CEP cadastral da Ultracar, e sem
 * confirmação de endereço recente. Pura/exportada — testável sem banco.
 */
export function ehCandidataParaCorrecaoCep(
  candidato: CandidatoCorrecaoCep,
  agora: Date = new Date()
): boolean {
  if (!candidato.temMatchUltracar) return false;

  const cepUltracar = cepDigitos(candidato.cepUltracar);
  if (!cepUltracar) return false;

  const cepOficina = cepDigitos(candidato.cepOficina);
  if (cepOficina === cepUltracar) return false;

  if (candidato.dataAtualizacaoEndereco === null) return true;

  const limite = new Date(agora);
  limite.setMonth(limite.getMonth() - MESES_JANELA_ATUALIZACAO_ENDERECO);
  return candidato.dataAtualizacaoEndereco < limite;
}

interface CandidatoCepRow {
  ID_OFICINA: number;
  CEP_OFICINA: string | null;
  CEP_ULTRACAR: string | null;
  DATA_ATUALIZACAO_ENDERECO: Date | null;
}

/**
 * Oficinas com CNPJ casado numa linha ativa da Ultracar, com o CEP cadastral
 * dela (via `address_id`). O INNER JOIN já restringe a "tem match" — por
 * isso `temMatchUltracar` é sempre `true` nas linhas daqui; o campo existe
 * em `ehCandidataParaCorrecaoCep` para a função continuar testável para o
 * caso "sem match" sem precisar do banco.
 */
async function buscarCandidatosCorrecaoCep(): Promise<CandidatoCepRow[]> {
  return AppDataSourceSync.query(`
    SELECT
      o."ID_OFICINA" AS "ID_OFICINA",
      o."CEP" AS "CEP_OFICINA",
      addr.zip_code AS "CEP_ULTRACAR",
      o."DATA_ATUALIZACAO_ENDERECO" AS "DATA_ATUALIZACAO_ENDERECO"
      FROM "MAIN_REGISTER"."OFICINA" o
      INNER JOIN ultracar_process.enterprise__tb_company c
        ON (regexp_replace(c.cnpj, '[^0-9]', '', 'g'))::bigint = ${cnpjIntDaOficina("o")}
       AND c.active = true
       AND length(regexp_replace(c.cnpj, '[^0-9]', '', 'g')) = 14
      LEFT JOIN ultracar_process.enterprise__tb_company_address addr
        ON addr.id = c.address_id
  `);
}

export interface RelatorioCorrecaoCep {
  candidatos: Array<{ ID_OFICINA: number; CEP_ATUAL: string | null; CEP_ULTRACAR: string | null }>;
  atualizadas: number;
}

/**
 * Responsabilidade 1: lista (modo teste) ou corrige (modo real) o CEP das
 * oficinas candidatas. Modo teste nunca executa `UPDATE` (ULTRACAR-15/16).
 */
export async function corrigirCepsDivergentes(
  modoTeste: boolean,
  limiteTeste: number,
  agora: Date = new Date()
): Promise<RelatorioCorrecaoCep> {
  const rows = await buscarCandidatosCorrecaoCep();

  const candidatos = rows.filter((row) =>
    ehCandidataParaCorrecaoCep(
      {
        temMatchUltracar: true,
        cepOficina: row.CEP_OFICINA,
        cepUltracar: row.CEP_ULTRACAR,
        dataAtualizacaoEndereco: row.DATA_ATUALIZACAO_ENDERECO,
      },
      agora
    )
  );

  const relatorio: RelatorioCorrecaoCep = {
    candidatos: candidatos.map((c) => ({
      ID_OFICINA: c.ID_OFICINA,
      CEP_ATUAL: c.CEP_OFICINA,
      CEP_ULTRACAR: c.CEP_ULTRACAR,
    })),
    atualizadas: 0,
  };

  if (modoTeste) {
    relatorio.candidatos = relatorio.candidatos.slice(0, limiteTeste);
    return relatorio;
  }

  for (const candidato of candidatos) {
    await AppDataSourceSync.query(
      `UPDATE "MAIN_REGISTER"."OFICINA" SET "CEP" = $1 WHERE "ID_OFICINA" = $2`,
      [candidato.CEP_ULTRACAR, candidato.ID_OFICINA]
    );
    relatorio.atualizadas++;
  }

  return relatorio;
}

async function main(): Promise<void> {
  const limiteTeste = parseLimiteTeste(process.argv.slice(2));
  const modoTeste = limiteTeste !== null;

  if (modoTeste) {
    console.log(
      `>>> MODO DE TESTE ATIVO: no máximo ${limiteTeste} candidata(s) de CEP serão listadas, nenhum UPDATE será executado.`
    );
  }

  await AppDataSourceSync.initialize();
  try {
    const relatorioCep = await corrigirCepsDivergentes(modoTeste, limiteTeste ?? LIMITE_TESTE_PADRAO);

    console.log("\n=== Relatório de sincronização Ultracar — correção de CEP ===");
    console.log(`Candidatas encontradas: ${relatorioCep.candidatos.length}`);
    for (const c of relatorioCep.candidatos) {
      console.log(`  Oficina ${c.ID_OFICINA}: CEP atual ${c.CEP_ATUAL} -> Ultracar ${c.CEP_ULTRACAR}`);
    }
    if (!modoTeste) {
      console.log(`CEPs atualizados: ${relatorioCep.atualizadas}`);
    }
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
