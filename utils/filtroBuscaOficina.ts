import { AdminDisparoErro } from "./adminDisparoErro";

/**
 * Filtros opcionais da busca de oficinas do admin (CONV-07, CONV-08). Todos
 * podem faltar; sem nenhum, a busca varre a base até o teto.
 */
export interface FiltrosBusca {
  /** Linhas de atividade em maiúsculas e sem espaço nas pontas, sem repetição. */
  linhas?: string[];
  elevadoresMin?: number;
  /** UF em maiúsculas, 2 letras. */
  uf?: string;
  /** Cidade como o usuário escreveu; a normalização é feita no SQL e no parâmetro. */
  cidade?: string;
}

export const MSG_CIDADE_SEM_UF = "Informe a UF para filtrar por cidade";
export const MSG_UF_INVALIDA = "UF inválida";
export const MSG_ELEVADORES_INVALIDO = "Quantidade de elevadores deve ser um inteiro maior ou igual a 0";
/** Tipo errado em `linhas` ou `cidade`; a spec não define a mensagem. */
export const MSG_FILTROS_INVALIDOS = "Filtros de busca inválidos";

const vazio = (v: unknown) => v == null || (typeof v === "string" && v.trim() === "");

/**
 * Valida e normaliza os filtros, sem consultar nada (CONV-08). Campo ausente,
 * nulo ou texto vazio não aplica o filtro.
 */
export function validarFiltrosBusca(entrada: unknown): FiltrosBusca {
  if (entrada != null && (typeof entrada !== "object" || Array.isArray(entrada))) {
    throw new AdminDisparoErro(400, MSG_FILTROS_INVALIDOS);
  }
  const e = (entrada ?? {}) as Record<string, unknown>;
  const filtros: FiltrosBusca = {};

  if (!vazio(e.linhas)) {
    if (!Array.isArray(e.linhas) || !e.linhas.every((l) => typeof l === "string")) {
      throw new AdminDisparoErro(400, MSG_FILTROS_INVALIDOS);
    }
    const linhas = [...new Set((e.linhas as string[]).map((l) => l.trim().toUpperCase()).filter(Boolean))];
    if (linhas.length > 0) filtros.linhas = linhas;
  }

  if (!vazio(e.elevadoresMin)) {
    if (!Number.isInteger(e.elevadoresMin) || (e.elevadoresMin as number) < 0) {
      throw new AdminDisparoErro(400, MSG_ELEVADORES_INVALIDO);
    }
    filtros.elevadoresMin = e.elevadoresMin as number;
  }

  if (!vazio(e.cidade)) {
    if (typeof e.cidade !== "string") {
      throw new AdminDisparoErro(400, MSG_FILTROS_INVALIDOS);
    }
    if (vazio(e.uf)) {
      throw new AdminDisparoErro(400, MSG_CIDADE_SEM_UF);
    }
    filtros.cidade = e.cidade;
  }

  if (!vazio(e.uf)) {
    const uf = typeof e.uf === "string" ? e.uf.trim().toUpperCase() : "";
    if (!/^[A-Z]{2}$/.test(uf)) {
      throw new AdminDisparoErro(400, MSG_UF_INVALIDA);
    }
    filtros.uf = uf;
  }

  return filtros;
}

// SPEC_DEVIATION: o design pede reusar `sqlTextoNormalizado`/`normalizarTexto` de
// `utils/geocodificacaoRegiao.ts`.
// Reason: esse arquivo ainda não está versionado (é trabalho em andamento do
// script de lat/long), e importar dele quebraria a branch num checkout limpo.
// Os dois gêmeos abaixo seguem a mesma regra; unificar quando aquele entrar.

const COM_ACENTO = "áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ";
const SEM_ACENTO = "AAAAAEEEEIIIIOOOOOUUUUCAAAAAEEEEIIIIOOOOOUUUUC";

/** Maiúsculas, sem acento e com espaços simples: o lado TS de `sqlTextoNormalizado`. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Gêmeo SQL de `normalizarTexto`. O banco não tem a extensão `unaccent`; o
 * `translate` cobre as minúsculas acentuadas também.
 */
export function sqlTextoNormalizado(expr: string): string {
  return `regexp_replace(trim(translate(upper(${expr}), '${COM_ACENTO}', '${SEM_ACENTO}')), '\\s+', ' ', 'g')`;
}

/**
 * Condições `AND` dos filtros sobre a OFICINA de alias `alias` (CONV-07). Os
 * valores vão só em `params`, a partir do placeholder `$primeiroParam`. Sem
 * filtro, `sql` é vazio.
 *
 * - Linhas: a oficina tem ao menos uma delas em `LINHA_ATIVIDADE` (N por oficina).
 * - Elevadores: `QUANTIDADE_ELEVADOR` é texto livre; só número conta, o resto
 *   vale 0. O `CASE` protege o cast, porque o Postgres não garante a ordem do `AND`.
 * - UF e cidade: sem diferença de caixa; a cidade também sem acento.
 */
export function sqlFiltrosBusca(
  alias: string,
  filtros: FiltrosBusca,
  primeiroParam: number
): { sql: string; params: unknown[] } {
  const condicoes: string[] = [];
  const params: unknown[] = [];
  const proximo = (valor: unknown) => {
    params.push(valor);
    return `$${primeiroParam + params.length - 1}`;
  };

  if (filtros.linhas && filtros.linhas.length > 0) {
    condicoes.push(`EXISTS (
            SELECT 1
              FROM "MAIN_REGISTER"."LINHA_ATIVIDADE" la
             WHERE la."ID_OFICINA" = ${alias}."ID_OFICINA"
               AND upper(trim(la."LINHA_ATIVIDADE")) = ANY(${proximo(filtros.linhas)}::text[])
          )`);
  }

  if (filtros.elevadoresMin != null) {
    const qtd = `trim(${alias}."QUANTIDADE_ELEVADOR")`;
    condicoes.push(
      `(CASE WHEN ${qtd} ~ '^[0-9]{1,6}$' THEN ${qtd}::int ELSE 0 END) >= ${proximo(filtros.elevadoresMin)}`
    );
  }

  if (filtros.uf) {
    condicoes.push(`upper(trim(${alias}."ESTADO")) = ${proximo(filtros.uf)}`);
  }

  if (filtros.cidade) {
    condicoes.push(`${sqlTextoNormalizado(`${alias}."CIDADE"`)} = ${proximo(normalizarTexto(filtros.cidade))}`);
  }

  return { sql: condicoes.map((c) => `AND ${c}`).join("\n          "), params };
}
