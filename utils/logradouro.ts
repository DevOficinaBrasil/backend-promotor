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

const TIPOS_NORMALIZADOS = new Set(TIPOS_LOGRADOURO.map(normalizar));

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

  if (!TIPOS_NORMALIZADOS.has(normalizar(primeiro))) {
    return { logradouro: null, rua: endereco };
  }

  return { logradouro: primeiro, rua: semBordas.slice(separador).trim() };
}
