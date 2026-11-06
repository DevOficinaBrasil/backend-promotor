// Sincroniza MAIN_REGISTER.OFICINA com a base de oficinas da Ultracar
// (ultracar_process), para oficinas já casadas por CNPJ.
//
//   npx ts-node scripts/sincronizar-oficinas-ultracar.ts [--teste[=N]]
//
// --teste (ou --teste=N) liga o modo de teste: só lista as candidatas de cada
// responsabilidade, limitado a N linhas por responsabilidade (padrão N=20),
// sem executar nenhum UPDATE/INSERT. Use para validar antes do disparo real.
//
// Responsabilidade 1: correção de CEP — oficina já casada por CNPJ, CEP
// divergente do CEP cadastral da Ultracar, e sem confirmação de endereço
// (DATA_ATUALIZACAO_ENDERECO) nos últimos 12 meses.
//
// Responsabilidade 2 (CON26-408): flag "ULTRACAR" + enriquecimento — toda
// oficina com CNPJ casado (independente de `active` na Ultracar) recebe
// "ULTRACAR" = true; campos de endereço vazios são completados com dado da
// Ultracar (enterprise__tb_company_address para ENDERECO/NUMERO/BAIRRO/CEP/
// LATITUDE/LONGITUDE; o registro mais recente de st_obads_im para CIDADE/
// ESTADO), nunca sobrescrevendo um campo já preenchido.
import "dotenv/config";
import { AppDataSourceSync } from "../data-source";
import { cnpjIntDaOficina } from "../utils/sqlCadastroEmpresa";

const LIMITE_TESTE_PADRAO = 20;
const MESES_JANELA_ATUALIZACAO_ENDERECO = 12;
// Medido em produção (só SELECT, AD-010/.specs/STATE.md): o timeout padrão de
// 10s nega até um COUNT(*) simples em st_obads_im; 600000ms (10min) já foi
// testado sem erro de permissão e cobre a base inteira.
const STATEMENT_TIMEOUT_MS_ST_OBADS_IM = 600000;

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

function valorVazio(v: string | null | undefined): boolean {
  return v == null || String(v).trim() === "";
}

/**
 * Decisão atômica de preenchimento (ULTRACAR-24): só preenche quando o valor
 * atual está vazio e o valor da Ultracar não está. Nunca sobrescreve.
 */
export function decidirValorPreenchido(
  atual: string | null | undefined,
  daUltracar: string | null | undefined
): string | undefined {
  if (!valorVazio(atual)) return undefined;
  if (valorVazio(daUltracar)) return undefined;
  return daUltracar as string;
}

export interface CamposEnderecoOficina {
  ENDERECO: string | null;
  NUMERO: string | null;
  BAIRRO: string | null;
  CEP: string | null;
  LATITUDE: string | null;
  LONGITUDE: string | null;
  CIDADE: string | null;
  ESTADO: string | null;
}

const CAMPOS_ENDERECO_EMPRESA_ADDRESS = ["ENDERECO", "NUMERO", "BAIRRO", "CEP", "LATITUDE", "LONGITUDE"] as const;
const CAMPOS_CIDADE_ESTADO = ["CIDADE", "ESTADO"] as const;

/**
 * Campo a campo (ULTRACAR-22 a ULTRACAR-25): decide quais dos 8 campos de
 * endereço devem ser preenchidos, combinando o dado de
 * `enterprise__tb_company_address` (6 campos) com o de `st_obads_im` (CIDADE/
 * ESTADO). Nunca inclui CNPJ/NOME_FANTASIA/RAZAO_SOCIAL/TELEFONE — nem são
 * parâmetros desta função.
 */
export function camposParaAtualizar(
  atual: CamposEnderecoOficina,
  enderecoUltracar: Pick<CamposEnderecoOficina, typeof CAMPOS_ENDERECO_EMPRESA_ADDRESS[number]> | null,
  cidadeEstadoUltracar: Pick<CamposEnderecoOficina, typeof CAMPOS_CIDADE_ESTADO[number]> | null
): Partial<CamposEnderecoOficina> {
  const atualizacoes: Partial<CamposEnderecoOficina> = {};

  if (enderecoUltracar) {
    for (const campo of CAMPOS_ENDERECO_EMPRESA_ADDRESS) {
      const novo = decidirValorPreenchido(atual[campo], enderecoUltracar[campo]);
      if (novo !== undefined) atualizacoes[campo] = novo;
    }
  }

  if (cidadeEstadoUltracar) {
    for (const campo of CAMPOS_CIDADE_ESTADO) {
      const novo = decidirValorPreenchido(atual[campo], cidadeEstadoUltracar[campo]);
      if (novo !== undefined) atualizacoes[campo] = novo;
    }
  }

  return atualizacoes;
}

interface CandidatoEnriquecimentoRow {
  ID_OFICINA: number;
  ENDERECO: string | null;
  NUMERO: string | null;
  BAIRRO: string | null;
  CEP: string | null;
  LATITUDE: string | null;
  LONGITUDE: string | null;
  CIDADE: string | null;
  ESTADO: string | null;
  CNPJ_ULTRACAR: string;
  ADDR_ENDERECO: string | null;
  ADDR_NUMERO: string | null;
  ADDR_BAIRRO: string | null;
  ADDR_CEP: string | null;
  ADDR_LATITUDE: string | null;
  ADDR_LONGITUDE: string | null;
}

/**
 * Toda oficina com CNPJ casado em `enterprise__tb_company`, independente de
 * `active` (ULTRACAR-21) — diferente de `buscarCandidatosCorrecaoCep`, que
 * restringe a `active = true` porque alimenta a regra de visibilidade.
 */
async function buscarCandidatosEnriquecimento(): Promise<CandidatoEnriquecimentoRow[]> {
  return AppDataSourceSync.query(`
    SELECT
      o."ID_OFICINA" AS "ID_OFICINA",
      o."ENDERECO" AS "ENDERECO",
      o."NUMERO" AS "NUMERO",
      o."BAIRRO" AS "BAIRRO",
      o."CEP" AS "CEP",
      o."LATITUDE" AS "LATITUDE",
      o."LONGITUDE" AS "LONGITUDE",
      o."CIDADE" AS "CIDADE",
      o."ESTADO" AS "ESTADO",
      (regexp_replace(c.cnpj, '[^0-9]', '', 'g')) AS "CNPJ_ULTRACAR",
      addr.street::text AS "ADDR_ENDERECO",
      addr."number"::text AS "ADDR_NUMERO",
      addr.district::text AS "ADDR_BAIRRO",
      addr.zip_code::text AS "ADDR_CEP",
      addr.latitude::text AS "ADDR_LATITUDE",
      addr.longitude::text AS "ADDR_LONGITUDE"
      FROM "MAIN_REGISTER"."OFICINA" o
      INNER JOIN ultracar_process.enterprise__tb_company c
        ON (regexp_replace(c.cnpj, '[^0-9]', '', 'g'))::bigint = ${cnpjIntDaOficina("o")}
       AND length(regexp_replace(c.cnpj, '[^0-9]', '', 'g')) = 14
      LEFT JOIN ultracar_process.enterprise__tb_company_address addr
        ON addr.id = c.address_id
  `);
}

/**
 * CIDADE/ESTADO do registro mais recente (`dt_fechado` DESC) por CNPJ em
 * `st_obads_im` (ULTRACAR-23). Eleva o `statement_timeout` da própria
 * conexão antes de tocar a tabela (AD-010/.specs/STATE.md): o timeout padrão
 * nega até um `COUNT(*)` simples nela.
 */
async function buscarCidadeEstadoMaisRecentePorCnpj(
  cnpjs: string[]
): Promise<Map<string, Pick<CamposEnderecoOficina, "CIDADE" | "ESTADO">>> {
  if (cnpjs.length === 0) return new Map();

  const queryRunner = AppDataSourceSync.createQueryRunner();
  await queryRunner.connect();
  try {
    await queryRunner.query(`SET statement_timeout = '${STATEMENT_TIMEOUT_MS_ST_OBADS_IM}'`);

    const rows: Array<{ cnpj: string; cidade: string | null; estado: string | null }> = await queryRunner.query(
      `SELECT DISTINCT ON (cnpj) cnpj, cidade, estado
         FROM ultracar_process.st_obads_im
        WHERE cnpj = ANY($1)
        ORDER BY cnpj, dt_fechado DESC NULLS LAST`,
      [cnpjs]
    );

    return new Map(rows.map((row) => [row.cnpj, { CIDADE: row.cidade, ESTADO: row.estado }]));
  } finally {
    await queryRunner.release();
  }
}

export interface RelatorioEnriquecimento {
  oficinasComMatch: number;
  oficinasMarcadas: number;
  oficinasComCampoPreenchido: number;
  planejado: Array<{ ID_OFICINA: number; campos: Partial<CamposEnderecoOficina> }>;
}

/**
 * Responsabilidade 2: marca `ULTRACAR = true` em toda oficina casada e
 * preenche campos de endereço vazios. Modo teste nunca executa `UPDATE`
 * (mesma garantia da responsabilidade 1), mas ainda lê `enterprise__tb_
 * company_address`/`st_obads_im` para montar o relatório.
 */
export async function enriquecerOficinasComUltracar(
  modoTeste: boolean,
  limiteTeste: number
): Promise<RelatorioEnriquecimento> {
  const candidatos = await buscarCandidatosEnriquecimento();
  const cnpjs = [...new Set(candidatos.map((c) => c.CNPJ_ULTRACAR))];
  const cidadeEstadoPorCnpj = await buscarCidadeEstadoMaisRecentePorCnpj(cnpjs);

  const planejado: RelatorioEnriquecimento["planejado"] = [];

  for (const candidato of candidatos) {
    const atualizacoes = camposParaAtualizar(
      {
        ENDERECO: candidato.ENDERECO,
        NUMERO: candidato.NUMERO,
        BAIRRO: candidato.BAIRRO,
        CEP: candidato.CEP,
        LATITUDE: candidato.LATITUDE,
        LONGITUDE: candidato.LONGITUDE,
        CIDADE: candidato.CIDADE,
        ESTADO: candidato.ESTADO,
      },
      {
        ENDERECO: candidato.ADDR_ENDERECO,
        NUMERO: candidato.ADDR_NUMERO,
        BAIRRO: candidato.ADDR_BAIRRO,
        CEP: candidato.ADDR_CEP,
        LATITUDE: candidato.ADDR_LATITUDE,
        LONGITUDE: candidato.ADDR_LONGITUDE,
      },
      cidadeEstadoPorCnpj.get(candidato.CNPJ_ULTRACAR) ?? null
    );

    if (Object.keys(atualizacoes).length > 0) {
      planejado.push({ ID_OFICINA: candidato.ID_OFICINA, campos: atualizacoes });
    }
  }

  const relatorio: RelatorioEnriquecimento = {
    oficinasComMatch: candidatos.length,
    oficinasMarcadas: 0,
    oficinasComCampoPreenchido: planejado.length,
    planejado: modoTeste ? planejado.slice(0, limiteTeste) : planejado,
  };

  if (modoTeste) return relatorio;

  const atualizacoesPorOficina = new Map(planejado.map((p) => [p.ID_OFICINA, p.campos]));

  for (const candidato of candidatos) {
    const campos = atualizacoesPorOficina.get(candidato.ID_OFICINA) ?? {};
    const colunas = Object.keys(campos) as Array<keyof CamposEnderecoOficina>;
    const setClauses = ['"ULTRACAR" = true', ...colunas.map((col, i) => `"${col}" = $${i + 2}`)];
    const valores = colunas.map((col) => campos[col]);

    await AppDataSourceSync.query(
      `UPDATE "MAIN_REGISTER"."OFICINA" SET ${setClauses.join(", ")} WHERE "ID_OFICINA" = $1`,
      [candidato.ID_OFICINA, ...valores]
    );
    relatorio.oficinasMarcadas++;
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

    const relatorioEnriquecimento = await enriquecerOficinasComUltracar(
      modoTeste,
      limiteTeste ?? LIMITE_TESTE_PADRAO
    );

    console.log("\n=== Relatório de sincronização Ultracar — flag + enriquecimento ===");
    console.log(`Oficinas com match (receberão/receberam ULTRACAR = true): ${relatorioEnriquecimento.oficinasComMatch}`);
    console.log(`Oficinas com algum campo de endereço a preencher: ${relatorioEnriquecimento.oficinasComCampoPreenchido}`);
    for (const p of relatorioEnriquecimento.planejado) {
      console.log(`  Oficina ${p.ID_OFICINA}: campos`, p.campos);
    }
    if (!modoTeste) {
      console.log(`Oficinas marcadas/atualizadas: ${relatorioEnriquecimento.oficinasMarcadas}`);
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
