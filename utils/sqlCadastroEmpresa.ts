/**
 * Ligação entre `MAIN_REGISTER.OFICINA` e `dw.cadastro_empresa`.
 *
 * `id_oficina` **não** identifica uma linha nessa tabela — os índices únicos são
 * sobre `cnpj_int` e `(cnpj_int, id_oficina)`, 59 valores de `id_oficina` se
 * repetem cobrindo 128 linhas (até 5 CNPJs distintos sob o mesmo id) e 2.487
 * linhas têm `id_oficina` nulo. Ver o comentário em `entities/CadastroEmpresa.ts`.
 *
 * Por isso a ligação olha **duas** chaves, nesta ordem de preferência:
 *
 *   1. `cnpj_int` == dígitos do `OFICINA."CNPJ"` — a identificação confiável, e a
 *      única que alcança as linhas de `id_oficina` nulo;
 *   2. `id_oficina` == `OFICINA."ID_OFICINA"` — o vínculo legado, mantido porque
 *      17k oficinas não têm CNPJ cadastrado.
 *
 * Medido em PRD: das 19.217 oficinas de comunidade, 15.895 casam por
 * `id_oficina` e outras 2.235 passam a casar por CNPJ. Em 33 oficinas as duas
 * chaves apontam linhas diferentes — daí a preferência acima ser explícita, e
 * não "a primeira que o banco devolver".
 *
 * **Por que exatamente 14 dígitos** no lado da OFICINA: as duas tabelas guardam
 * CNPJ como texto livre, com lixo curto do tipo `04.26` ou `00.000.09.-09`.
 * Comparar esse lixo casaria empresas sem relação. O corte em 14 preserva 2.229
 * dos 2.235 ganhos e descarta o resto. A comparação é numérica (`bigint`), então
 * máscara e zero à esquerda não atrapalham — `00.000.000/0001-91` e `191`
 * chegam ao mesmo valor, e é assim que `cnpj_int` já guarda o dado.
 *
 * **Por que dois LEFT JOIN por igualdade e não um `OR` nem um `LATERAL`:** com
 * `OR` no `ON`, o planejador desiste do hash join e cai em nested loop com scan
 * de `dw.cadastro_empresa` por oficina; um `LATERAL ... LIMIT 1` faz o mesmo,
 * porque não existe índice em `id_oficina` (e o dw é externo, sem DDL neste
 * repo). Duas igualdades separadas cada uma vira um hash join — o lado do CNPJ
 * ainda usa o índice único. O `CROSS JOIN LATERAL` no fim não toca em tabela:
 * escolhe **uma** das duas linhas, a mesma para todas as colunas. A condição do
 * `CASE` é idêntica em cada coluna de propósito: um `COALESCE` por coluna
 * misturaria endereço de uma empresa com lat/long de outra.
 */

/** Colunas de `dw.cadastro_empresa` expostas no alias `ce`. */
const COLUNAS_CADASTRO_EMPRESA = [
  "id_oficina",
  "cnpj",
  "cnpj_int",
  "razao_social",
  "status_receita",
  "telefone",
  "logradouro",
  "rua",
  "bairro",
  "numero",
  "complemento",
  "cep",
  "cidade",
  "estado",
  "latitude",
  "longitude",
] as const;

/**
 * Dígitos do `OFICINA."CNPJ"` como `bigint`, comparável a `cadastro_empresa.cnpj_int`.
 * `NULL` quando não há exatamente 14 dígitos — ver o corte explicado acima.
 */
function cnpjIntDaOficina(aliasOficina: string): string {
  const digitos = `regexp_replace(COALESCE(${aliasOficina}."CNPJ", ''), '[^0-9]', '', 'g')`;
  return `(CASE WHEN length(${digitos}) = 14 THEN ${digitos}::bigint END)`;
}

/**
 * Linha única de `dw.cadastro_empresa` por `id_oficina`. Sem o `DISTINCT ON` o
 * join por igualdade multiplica a linha de fora por quantas linhas o dw tiver
 * sob aquele id — rota duplicada virava card repetido no carrossel do promotor e
 * contagem dobrada nos KPIs de confirmação.
 *
 * O desempate é o menor `cnpj_int`, só para a escolha ser estável entre
 * execuções: qual linha *representa* a oficina é decidido pela precedência do
 * CNPJ em `ligacaoCadastroEmpresa`, não aqui.
 *
 * Projeta as colunas usadas em vez de `*` porque o `DISTINCT ON` ordena a tabela
 * inteira: das 38 colunas, carregar as 16 necessárias pelo sort corta a largura
 * da linha para menos da metade. Não há índice em `id_oficina` para evitar esse
 * sort — e a coluna é `double precision` no dw, apesar do `int` na entity.
 */
const CADASTRO_EMPRESA_POR_ID_OFICINA = `(
        SELECT DISTINCT ON (ce_dedup.id_oficina) ${COLUNAS_CADASTRO_EMPRESA.map(
          (coluna) => `ce_dedup.${coluna}`
        ).join(", ")}
          FROM dw.cadastro_empresa ce_dedup
         WHERE ce_dedup.id_oficina IS NOT NULL
         ORDER BY ce_dedup.id_oficina, ce_dedup.cnpj_int ASC
      )`;

/**
 * Bloco de joins que expõe, no alias `ce`, a linha de `dw.cadastro_empresa` que
 * representa a oficina — casada por CNPJ ou por `id_oficina`, nessa ordem.
 *
 * O alias da OFICINA precisa estar no FROM (pode ser `LEFT JOIN`: sem OFICINA a
 * ligação simplesmente cai no lado do `id_oficina`). `idOficinaExpr` existe para
 * quem tem o id fora da OFICINA — a lista de rotas casa por `rp."ID_OFICINA"`,
 * que pode apontar para oficina ausente de `MAIN_REGISTER.OFICINA`.
 *
 * `ce.cnpj_int IS NOT NULL` é o teste de "achou cadastro no dw" — `cnpj_int`
 * nunca é nulo na tabela. Use no `WHERE` onde antes havia `INNER JOIN`.
 *
 * **Atenção ao identificar a oficina no resultado:** `ce.id_oficina` deixou de
 * ser o id da oficina consultada (pode ser nulo, ou o id de outra oficina que
 * compartilha o CNPJ — 6.949 CNPJs se repetem em `MAIN_REGISTER.OFICINA`).
 * Projete e deduplique por `idOficinaExpr`.
 */
export function ligacaoCadastroEmpresa(
  aliasOficina: string,
  idOficinaExpr: string = `${aliasOficina}."ID_OFICINA"`
): string {
  const escolha = COLUNAS_CADASTRO_EMPRESA.map(
    (coluna) =>
      `CASE WHEN ce_por_cnpj.cnpj_int IS NOT NULL
                    THEN ce_por_cnpj.${coluna} ELSE ce_por_id.${coluna} END AS ${coluna}`
  ).join(",\n            ");

  return `
      LEFT JOIN ${CADASTRO_EMPRESA_POR_ID_OFICINA} ce_por_id
        ON ce_por_id.id_oficina = ${idOficinaExpr}
      LEFT JOIN dw.cadastro_empresa ce_por_cnpj
        ON ce_por_cnpj.cnpj_int = ${cnpjIntDaOficina(aliasOficina)}
      CROSS JOIN LATERAL (
        SELECT ${escolha}
      ) ce`;
}

/**
 * Ligação para as queries que já têm `rp` (ROTA_PROMOTOR) e `o` (OFICINA) no
 * FROM. A rota é a fonte do id porque o `LEFT JOIN` com OFICINA pode não casar.
 */
export const JOIN_CADASTRO_EMPRESA_POR_ROTA = ligacaoCadastroEmpresa("o", 'rp."ID_OFICINA"');

/**
 * Gêmeo em TypeScript de `cnpjIntDaOficina`, para quem faz a ligação em código
 * em vez de SQL (os scripts). Devolve o `cnpj_int` a comparar, ou `null` quando
 * o CNPJ cadastrado não tem exatamente 14 dígitos — mesmo critério do SQL, para
 * os dois não divergirem.
 *
 * Zero à esquerda desaparece, como já desaparece no `bigint` da coluna:
 * "00.000.000/0001-91" e "191" resolvem para o mesmo "191".
 */
export function cnpjIntParaLigacao(cnpj: string | null | undefined): string | null {
  const digitos = (cnpj ?? "").replace(/\D/g, "");
  if (digitos.length !== 14) return null;

  return BigInt(digitos).toString();
}
