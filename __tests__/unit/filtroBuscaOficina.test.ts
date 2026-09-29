import {
  MSG_CIDADE_SEM_UF,
  MSG_ELEVADORES_INVALIDO,
  MSG_FILTROS_INVALIDOS,
  MSG_UF_INVALIDA,
  normalizarTexto,
  sqlFiltrosBusca,
  sqlTextoNormalizado,
  validarFiltrosBusca,
} from "../../utils/filtroBuscaOficina";
import { AdminDisparoErro } from "../../utils/adminDisparoErro";

const erroDe = (fn: () => unknown): AdminDisparoErro => {
  try {
    fn();
  } catch (e) {
    return e as AdminDisparoErro;
  }
  throw new Error("não lançou");
};

// T37 (CONV-07, CONV-08)
describe("validarFiltrosBusca", () => {
  it("sem filtro nenhum devolve filtros vazios", () => {
    expect(validarFiltrosBusca(undefined)).toEqual({});
    expect(validarFiltrosBusca({})).toEqual({});
    expect(validarFiltrosBusca({ linhas: [], uf: "", cidade: " ", elevadoresMin: null })).toEqual({});
  });

  it("normaliza linhas (upper/trim, sem repetição) e UF", () => {
    expect(
      validarFiltrosBusca({ linhas: [" leve", "LEVE", "Pesada "], elevadoresMin: 2, uf: " sp ", cidade: "Campinas" })
    ).toEqual({ linhas: ["LEVE", "PESADA"], elevadoresMin: 2, uf: "SP", cidade: "Campinas" });
  });

  it("aceita 0 elevadores", () => {
    expect(validarFiltrosBusca({ elevadoresMin: 0 })).toEqual({ elevadoresMin: 0 });
  });

  it("cidade sem UF → 400 com a mensagem da spec", () => {
    const e = erroDe(() => validarFiltrosBusca({ cidade: "Campinas" }));
    expect(e).toBeInstanceOf(AdminDisparoErro);
    expect(e.status).toBe(400);
    expect(e.message).toBe("Informe a UF para filtrar por cidade");
    expect(MSG_CIDADE_SEM_UF).toBe("Informe a UF para filtrar por cidade");
  });

  it.each([["S"], ["SPA"], ["S1"], [12]])("UF %p → 400 UF inválida", (uf) => {
    const e = erroDe(() => validarFiltrosBusca({ uf }));
    expect(e.status).toBe(400);
    expect(e.message).toBe("UF inválida");
    expect(MSG_UF_INVALIDA).toBe("UF inválida");
  });

  it.each([[-1], [1.5], ["2"], [Number.NaN]])("elevadores %p → 400 com a mensagem da spec", (elevadoresMin) => {
    const e = erroDe(() => validarFiltrosBusca({ elevadoresMin }));
    expect(e.status).toBe(400);
    expect(e.message).toBe("Quantidade de elevadores deve ser um inteiro maior ou igual a 0");
    expect(MSG_ELEVADORES_INVALIDO).toBe(e.message);
  });

  it("linhas ou cidade com tipo errado → 400", () => {
    expect(erroDe(() => validarFiltrosBusca({ linhas: "Leve" })).message).toBe(MSG_FILTROS_INVALIDOS);
    expect(erroDe(() => validarFiltrosBusca({ linhas: [1] })).message).toBe(MSG_FILTROS_INVALIDOS);
    expect(erroDe(() => validarFiltrosBusca({ uf: "SP", cidade: 3 })).status).toBe(400);
  });
});

describe("sqlFiltrosBusca", () => {
  it("sem filtro → nenhuma condição e nenhum parâmetro", () => {
    expect(sqlFiltrosBusca("o", {}, 3)).toEqual({ sql: "", params: [] });
  });

  it("linhas: EXISTS em LINHA_ATIVIDADE comparando upper(trim()) por parâmetro", () => {
    const { sql, params } = sqlFiltrosBusca("o", { linhas: ["LEVE", "MOTO"] }, 3);
    expect(sql).toMatch(/^AND EXISTS \(/);
    expect(sql).toContain('FROM "MAIN_REGISTER"."LINHA_ATIVIDADE" la');
    expect(sql).toContain('la."ID_OFICINA" = o."ID_OFICINA"');
    expect(sql).toContain('upper(trim(la."LINHA_ATIVIDADE")) = ANY($3::text[])');
    expect(params).toEqual([["LEVE", "MOTO"]]);
  });

  it("elevadores: CASE numérico, não numérico vale 0, >= parâmetro", () => {
    const { sql, params } = sqlFiltrosBusca("o", { elevadoresMin: 2 }, 5);
    expect(sql).toBe(
      `AND (CASE WHEN trim(o."QUANTIDADE_ELEVADOR") ~ '^[0-9]{1,6}$' THEN trim(o."QUANTIDADE_ELEVADOR")::int ELSE 0 END) >= $5`
    );
    expect(params).toEqual([2]);
  });

  it("UF: upper(trim(ESTADO)) = parâmetro", () => {
    expect(sqlFiltrosBusca("o", { uf: "SP" }, 1)).toEqual({
      sql: `AND upper(trim(o."ESTADO")) = $1`,
      params: ["SP"],
    });
  });

  it("cidade: normalizada no SQL e no parâmetro", () => {
    const { sql, params } = sqlFiltrosBusca("o", { uf: "MG", cidade: "  São  João del-Rei " }, 1);
    expect(sql).toContain(`${sqlTextoNormalizado('o."CIDADE"')} = $2`);
    expect(params).toEqual(["MG", "SAO JOAO DEL-REI"]);
  });

  it("combinados: um AND por filtro, placeholders em sequência e nenhum valor no SQL", () => {
    const { sql, params } = sqlFiltrosBusca(
      "o",
      { linhas: ["LEVE"], elevadoresMin: 2, uf: "SP", cidade: "Campinas" },
      4
    );
    expect(sql.match(/(^|\n {10})AND /g)).toHaveLength(4);
    expect(sql).toContain("ANY($4::text[])");
    expect(sql).toContain(">= $5");
    expect(sql).toContain('upper(trim(o."ESTADO")) = $6');
    expect(sql).toContain("= $7");
    expect(params).toEqual([["LEVE"], 2, "SP", "CAMPINAS"]);
    expect(sql).not.toMatch(/LEVE|Campinas|CAMPINAS|'SP'/);
  });
});

describe("normalização da cidade: TS e SQL", () => {
  it("normalizarTexto tira acento, sobe a caixa e junta espaços", () => {
    expect(normalizarTexto("  São   Paulo ")).toBe("SAO PAULO");
    expect(normalizarTexto("Paraúna")).toBe("PARAUNA");
  });

  it("o translate do SQL mapeia cada acento para a mesma letra que o TS", () => {
    const sql = sqlTextoNormalizado("x");
    const [, de, para] = sql.match(/translate\(upper\(x\), '([^']+)', '([^']+)'\)/)!;
    expect(de.length).toBe(para.length);
    Array.from(de).forEach((c, i) => expect(normalizarTexto(c)).toBe(para[i]));
    expect(sql).toContain("regexp_replace(trim(");
  });
});
