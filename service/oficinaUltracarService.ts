import { ligacaoCadastroEmpresa, cnpjIntDaOficina } from "../utils/sqlCadastroEmpresa";

/**
 * CNPJ ativo em `ultracar_process.enterprise__tb_company`, normalizado a
 * `bigint` com o mesmo critério de 14 dígitos de `cnpjIntDaOficina` — para
 * comparar com o CNPJ da OFICINA via `LEFT JOIN`, nunca `EXISTS`/`IN`
 * correlacionado (AD-010, `.specs/STATE.md`: a versão correlacionada estourou
 * o timeout de 10s; esta forma rodou em ~2s para a base Ultracar inteira).
 */
const CNPJ_ATIVO_ULTRACAR = `(
          SELECT DISTINCT (regexp_replace(cnpj, '[^0-9]', '', 'g'))::bigint AS cnpj_int
            FROM ultracar_process.enterprise__tb_company
           WHERE active = true
             AND length(regexp_replace(cnpj, '[^0-9]', '', 'g')) = 14
        )`;

/**
 * 3º ramo `UNION ALL` das consultas de comunidade: oficinas de
 * `MAIN_REGISTER.OFICINA` cujo CNPJ bate com uma linha ativa da Ultracar —
 * sem filtro de `EMPRESA_SLUG` (ver design.md). Mesma projeção/dado do ramo 1
 * (comunidade), via `ligacaoCadastroEmpresa`: a oficina com match usa o
 * endereço/telefone já cadastrados, nunca dado vindo de `ultracar_process`.
 *
 * `incluirDistancia` acrescenta uma coluna `distance` (sempre `NULL`) só para
 * casar o número de colunas com ramos que a calculam (`getComunityNearbyOficinas`).
 */
export function sqlOficinasComMatchUltracar(aliasOficina = "o", incluirDistancia = false): string {
  const colunaDistancia = incluirDistancia ? `,\n            NULL::double precision AS distance` : "";

  return `
    SELECT
      ${aliasOficina}."ID_OFICINA" AS "ID_OFICINA",
      ce."latitude" AS "LATITUDE",
      ce."longitude" AS "LONGITUDE",
      ce."razao_social"::text AS "NOME_FANTASIA",
      CONCAT(ce."logradouro", ' ', ce."rua")::text AS "ENDERECO",
      ce."bairro"::text AS "BAIRRO",
      ce."cidade"::text AS "CIDADE",
      ce."estado"::text AS "ESTADO",
      ce."numero"::text AS "NUMERO",
      ce."cep"::text AS "CEP",
      ce."cnpj"::text AS "CNPJ",
      ce."telefone"::text AS "TELEFONE"${colunaDistancia}
    FROM "MAIN_REGISTER"."OFICINA" ${aliasOficina}${ligacaoCadastroEmpresa(aliasOficina)}
    LEFT JOIN ${CNPJ_ATIVO_ULTRACAR} ultracar_match
      ON ultracar_match.cnpj_int = ${cnpjIntDaOficina(aliasOficina)}
    WHERE ultracar_match.cnpj_int IS NOT NULL
  `;
}
