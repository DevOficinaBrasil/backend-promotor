/**
 * Junções com `dw.cadastro_empresa` usadas pelas queries de rota.
 *
 * `id_oficina` **não** identifica uma linha nessa tabela: a chave única é
 * `cnpj_int`, e em PRD 59 valores de `id_oficina` se repetem cobrindo 128 linhas
 * (até 5 CNPJs distintos sob o mesmo id) — ver o comentário em
 * `entities/CadastroEmpresa.ts`. Um `LEFT JOIN` por igualdade de `id_oficina`
 * multiplica a rota por quantas linhas o dw tiver, e nada deduplica depois:
 * `queryBothAndMerge` só remove repetição vinda do banco legado. Rota duplicada
 * aparecia como card repetido no carrossel do promotor e contagem dobrada nos
 * KPIs de confirmação.
 *
 * A ordenação abaixo decide *qual* linha do dw representa a oficina: primeiro a
 * linha cujo CNPJ é o mesmo de `MAIN_REGISTER.OFICINA` (comparado como inteiro,
 * então máscara e zero à esquerda não atrapalham), depois o menor `cnpj_int`
 * como desempate estável — sem ele a linha escolhida variaria entre execuções.
 *
 * `left(..., 18)` existe porque a coluna `CNPJ` de OFICINA é texto livre: 19
 * dígitos ou mais estouram o `bigint` e derrubariam a query inteira.
 *
 * **Por que tabela derivada e não `LATERAL ... LIMIT 1`:** o lateral seria mais
 * barato *se* houvesse índice em `dw.cadastro_empresa(id_oficina)`, mas os
 * índices conhecidos são sobre `cnpj_int` e `(cnpj_int, id_oficina)` — nenhum
 * serve para lookup só por `id_oficina`, e o dw é externo, sem DDL neste repo.
 * Sem índice, o lateral roda um scan da tabela por rota da campanha; a derivada
 * roda um scan e um sort para a query inteira, que é a ordem de grandeza que o
 * join por igualdade já pagava. Se algum dia existir esse índice, trocar por
 * lateral vale a medição.
 */
const ORDEM_PREFERINDO_CNPJ = `ORDER BY ce_dedup.id_oficina,
                (
                  ce_dedup.cnpj_int
                  = NULLIF(left(regexp_replace(COALESCE(o_dedup."CNPJ", ''), '\\D', '', 'g'), 18), '')::bigint
                ) DESC NULLS LAST,
                ce_dedup.cnpj_int ASC NULLS LAST`;

/**
 * Uma linha do dw por oficina, exposta no alias `ce`. Substitui o join direto em
 * `dw.cadastro_empresa`; requer `rp` (ROTA_PROMOTOR) no FROM.
 */
export const JOIN_CADASTRO_EMPRESA_POR_ROTA = `
      LEFT JOIN (
        SELECT DISTINCT ON (ce_dedup.id_oficina) ce_dedup.*
          FROM dw.cadastro_empresa ce_dedup
          LEFT JOIN "MAIN_REGISTER"."OFICINA" o_dedup
            ON o_dedup."ID_OFICINA" = ce_dedup.id_oficina
         ${ORDEM_PREFERINDO_CNPJ}
      ) ce ON ce.id_oficina = rp."ID_OFICINA"`;

/**
 * Para as queries que leem o dw direto por lista de ids (enriquecimento das
 * rotas que vieram do banco legado). Sem o `DISTINCT ON` a linha que sobrevive é
 * a última que o `Map` recebe — arbitrária, e podendo discordar da que
 * `JOIN_CADASTRO_EMPRESA_POR_ROTA` escolheu para a mesma oficina.
 *
 * Aqui o alias já é `ce` e a OFICINA já está no FROM como `o`, então a ordenação
 * é escrita de novo com esses nomes em vez de reaproveitar a de cima.
 */
export const DISTINCT_CADASTRO_EMPRESA_POR_OFICINA = `DISTINCT ON (ce.id_oficina)`;

export const ORDEM_CADASTRO_EMPRESA_POR_OFICINA = `ORDER BY ce.id_oficina,
            (
              ce.cnpj_int
              = NULLIF(left(regexp_replace(COALESCE(o."CNPJ", ''), '\\D', '', 'g'), 18), '')::bigint
            ) DESC NULLS LAST,
            ce.cnpj_int ASC NULLS LAST`;
