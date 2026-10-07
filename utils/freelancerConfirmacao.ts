/** Helpers puros da aba "Confirmação de dados" do painel de freelancers. */

export const LINHAS_ATIVIDADE = ["Leve", "Pesada", "Moto", "Agricola"] as const;

export const LIMITE_MAXIMO_LISTAGEM = 50;

/** Só os dígitos de um valor. */
export function soDigitos(valor: unknown): string {
  return String(valor ?? "").replace(/\D/g, "");
}

/** CNPJ com 14 dígitos e os dois dígitos verificadores corretos. */
export function cnpjValido(valor: unknown): boolean {
  const cnpj = soDigitos(valor);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) {
    return false;
  }

  const digito = (base: string): number => {
    let peso = base.length - 7;
    let soma = 0;
    for (const char of base) {
      soma += Number(char) * peso--;
      if (peso < 2) peso = 9;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const d1 = digito(cnpj.slice(0, 12));
  const d2 = digito(cnpj.slice(0, 12) + d1);
  return cnpj.endsWith(`${d1}${d2}`);
}

/** minúsculas e sem acento, para casar com translate(lower()) do SQL. */
export function normalizarBusca(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Escapa curingas de LIKE (\, % e _). */
export function escaparLike(texto: string): string {
  return texto.replace(/[\%_]/g, (c) => "\\" + c);
}

/** QUANTIDADE_ELEVADOR (texto livre) para inteiro; nulo ou sem dígito vira 0. */
export function qtdElevadoresParaInteiro(valor: unknown): number {
  const digitos = soDigitos(valor).slice(0, 6);
  return digitos === "" ? 0 : Number(digitos);
}

/** Compara dois conjuntos de linhas ignorando caixa, espaços e ordem. */
export function mesmasLinhas(a: string[], b: string[]): boolean {
  const chave = (lista: string[]) =>
    Array.from(new Set(lista.map((l) => l.trim().toLowerCase()))).sort().join("|");
  return chave(a) === chave(b);
}
