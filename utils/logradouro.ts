// Tipos de logradouro aceitos no split. Lista fechada, derivada da distribuição
// real da coluna dw.cadastro_empresa.logradouro (~136k das 146k linhas).
// Valores não interpretados como "NP" e "M" ficam de fora de propósito.
export const TIPOS_LOGRADOURO = [
  "rua",
  "avenida",
  "rodovia",
  "estrada",
  "travessa",
  "alameda",
  "praça",
  "quadra",
] as const;

/**
 * Converte o CNPJ como cadastrado — pontuado ou não — no inteiro que
 * dw.cadastro_empresa.cnpj_int guarda, para poder identificar a linha certa
 * quando `id_oficina` se repete. Devolve null quando não sobra dígito nenhum.
 *
 * Zeros à esquerda somem no bigint da coluna, então somem aqui também:
 * "00.000.000/0000-01" e "1" resolvem para o mesmo "1".
 */
export function cnpjParaInteiro(cnpj: string | null): string | null {
  if (cnpj == null) return null;

  const digitos = cnpj.replace(/\D/g, "");
  if (digitos === "") return null;

  return BigInt(digitos).toString();
}

export interface LogradouroDividido {
  logradouro: string | null; // dw.cadastro_empresa.logradouro — o tipo
  rua: string | null; // dw.cadastro_empresa.rua — o nome
}

function normalizar(token: string): string {
  return token
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}


/**
 * Quebra o ENDERECO de linha única no par { logradouro, rua } esperado por
 * dw.cadastro_empresa, onde `logradouro` é o tipo e `rua` é o nome.
 *
 * Compara o primeiro token, sem acento e em minúsculas, contra TIPOS_LOGRADOURO.
 * Casou: o token (como digitado) vira `logradouro` e o restante, com trim, vira
 * `rua`. Não casou, string de uma palavra, vazia, só com espaços ou null: cai no
 * fallback `logradouro = null` e a string inteira, sem transformação, vai para
 * `rua` — o mesmo valor gravado em MAIN_REGISTER.OFICINA.ENDERECO.
 */
// Forma canônica de cada tipo, indexada pela versão normalizada. Grava-se esta,
// não o token como o reparador digitou: a coluna dw.cadastro_empresa.logradouro
// usa capitalização de título em 146k linhas ("Rua" 92.543, "Avenida" 34.625) e
// gravar "AVENIDA" criaria variante nova de caixa num campo que é agrupado.
const CANONICO = new Map(
  TIPOS_LOGRADOURO.map((tipo) => [normalizar(tipo), tipo.charAt(0).toUpperCase() + tipo.slice(1)])
);

export function dividirLogradouro(endereco: string | null): LogradouroDividido {
  if (endereco == null) {
    return { logradouro: null, rua: null };
  }

  const semBordas = endereco.trim();
  const separador = semBordas.search(/\s/);

  if (separador === -1) {
    return { logradouro: null, rua: endereco };
  }

  const primeiro = semBordas.slice(0, separador);
  const canonico = CANONICO.get(normalizar(primeiro));

  if (canonico === undefined) {
    return { logradouro: null, rua: endereco };
  }

  return { logradouro: canonico, rua: semBordas.slice(separador).trim() };
}
