/**
 * Endereço, coordenadas e contato de uma oficina para as telas de rota (app do
 * promotor e dashboard do cliente).
 *
 * `MAIN_REGISTER.OFICINA` é a fonte primária: é ela que o reparador atualiza ao
 * confirmar o endereço pelo link (`visitaConfirmacaoService`), que o freelancer
 * corrige por telefone e que a importação de planilha preenche. O
 * `dw.cadastro_empresa` vem da Receita e só entra como fallback quando a OFICINA
 * não tem o dado.
 *
 * A escolha é por **bloco**, nunca coluna a coluna: o endereço inteiro sai da
 * OFICINA quando ela tem `ENDERECO` preenchido, senão sai inteiro do dw; o par de
 * coordenadas sai inteiro da fonte que tem o par válido. Um `COALESCE` por coluna
 * misturaria a rua de um cadastro com o CEP ou a latitude de outro.
 *
 * Os aliases precisam estar no FROM: `aliasOficina` (pode vir de `LEFT JOIN`) e
 * `aliasCe`, o alias exposto por `ligacaoCadastroEmpresa`.
 */

/** Texto de coordenada da OFICINA (varchar) como número, ou NULL; aceita vírgula decimal. */
export function sqlCoordenadaTexto(expr: string): string {
  const t = `replace(trim(${expr}), ',', '.')`;
  return `(CASE WHEN ${t} ~ '^-?[0-9]{1,3}(\\.[0-9]+)?$' THEN ${t}::double precision END)`;
}

/** Texto não vazio, ou NULL. */
function sqlTextoOuNulo(expr: string): string {
  return `NULLIF(TRIM(${expr}), '')`;
}

/**
 * Par de coordenadas com a OFICINA primeiro e o dw como fallback. Espelho de
 * `sqlParCoordenadas` (oficinaService), que dá preferência ao dw para a busca do
 * admin.
 */
export function sqlParCoordenadasOficinaPrimeiro(
  aliasOficina = "o",
  aliasCe = "ce"
): { lat: string; lon: string } {
  const latO = sqlCoordenadaTexto(`${aliasOficina}."LATITUDE"`);
  const lonO = sqlCoordenadaTexto(`${aliasOficina}."LONGITUDE"`);
  const oTemPar = `${latO} IS NOT NULL AND ${lonO} IS NOT NULL`;
  const dwTemPar = `${aliasCe}.latitude IS NOT NULL AND ${aliasCe}.longitude IS NOT NULL`;
  return {
    lat: `CASE WHEN ${oTemPar} THEN ${latO}
               WHEN ${dwTemPar} THEN ${aliasCe}.latitude::double precision END`,
    lon: `CASE WHEN ${oTemPar} THEN ${lonO}
               WHEN ${dwTemPar} THEN ${aliasCe}.longitude::double precision END`,
  };
}

/**
 * Colunas de oficina das telas de rota, com `prefixo` no nome de cada coluna
 * (`""` no app do promotor, `"oficina_"` no dashboard). Devolve a lista de
 * projeções separadas por vírgula, sem vírgula final.
 */
export function sqlColunasOficinaRota(
  prefixo = "",
  aliasOficina = "o",
  aliasCe = "ce"
): string {
  const o = aliasOficina;
  const ce = aliasCe;
  const oTemEndereco = `${sqlTextoOuNulo(`${o}."ENDERECO"`)} IS NOT NULL`;
  const endereco = (colOficina: string, exprDw: string) =>
    `CASE WHEN ${oTemEndereco} THEN ${colOficina} ELSE ${exprDw} END`;
  const coord = sqlParCoordenadasOficinaPrimeiro(o, ce);

  const colunas: Array<[string, string]> = [
    ["LATITUDE", coord.lat],
    ["LONGITUDE", coord.lon],
    ["NOME_FANTASIA", `COALESCE(${o}."NOME_FANTASIA", ${ce}.razao_social)`],
    [
      "ENDERECO",
      endereco(
        `TRIM(${o}."ENDERECO")`,
        `TRIM(CONCAT(COALESCE(${ce}.logradouro,''), ' ', COALESCE(${ce}.rua,'')))`
      ),
    ],
    ["BAIRRO", endereco(`${o}."BAIRRO"`, `${ce}.bairro`)],
    ["CIDADE", endereco(`${o}."CIDADE"`, `${ce}.cidade`)],
    ["ESTADO", endereco(`${o}."ESTADO"`, `${ce}.estado`)],
    ["NUMERO", endereco(`${o}."NUMERO"`, `${ce}.numero`)],
    ["CEP", endereco(`${o}."CEP"`, `${ce}.cep`)],
    ["CNPJ", `COALESCE(${sqlTextoOuNulo(`${o}."CNPJ"`)}, ${ce}.cnpj)`],
    ["TELEFONE", `COALESCE(${sqlTextoOuNulo(`${o}."TELEFONE"`)}, ${ce}.telefone)`],
  ];

  return colunas.map(([nome, expr]) => `${expr} as "${prefixo}${nome}"`).join(",\n          ");
}
