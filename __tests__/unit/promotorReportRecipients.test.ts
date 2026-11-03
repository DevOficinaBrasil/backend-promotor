import * as recipients from "../../config/promotorReportRecipients";

const { resolverDestinatarios } = recipients;
const ORIGINAL_ENV = { ...process.env };
const ID_CLIENTE_SEM_OVERRIDE = 999; // nao esta em DESTINATARIOS_FIXOS_PRODUCAO_POR_CLIENTE
const ID_CLIENTE_SKF = 126;

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("resolverDestinatarios", () => {
  it("em producao, sem override fixo pro cliente, usa os admins reais, nunca a lista de teste — RELPROM-31", () => {
    process.env.NODE_ENV = "production";
    const resultado = resolverDestinatarios(ID_CLIENTE_SEM_OVERRIDE, ["admin@skf.com"]);

    expect(resultado.destinatarios).toEqual(["admin@skf.com"]);
  });

  it("em producao, com override fixo pro cliente (SKF), usa a lista fixa em vez dos admins reais — RELPROM-74", () => {
    process.env.NODE_ENV = "production";
    jest.replaceProperty(recipients, "DESTINATARIOS_FIXOS_PRODUCAO_POR_CLIENTE", { [ID_CLIENTE_SKF]: ["fixo1@skfvertevo.com", "fixo2@skfvertevo.com"] });

    const resultado = resolverDestinatarios(ID_CLIENTE_SKF, ["admin@skf.com"]);

    expect(resultado.destinatarios).toEqual(["fixo1@skfvertevo.com", "fixo2@skfvertevo.com"]);
  });

  it("em producao, com override fixo, ainda registra os admins reais pra log/auditoria — RELPROM-74", () => {
    process.env.NODE_ENV = "production";
    jest.replaceProperty(recipients, "DESTINATARIOS_FIXOS_PRODUCAO_POR_CLIENTE", { [ID_CLIENTE_SKF]: ["fixo@skfvertevo.com"] });

    const resultado = resolverDestinatarios(ID_CLIENTE_SKF, ["admin1@skf.com", "admin2@skf.com"]);

    expect(resultado.adminsReaisParaLog).toEqual(["admin1@skf.com", "admin2@skf.com"]);
  });

  it("filtra e-mail invalido da lista fixa de producao, sem derrubar os demais — RELPROM-74", () => {
    process.env.NODE_ENV = "production";
    jest.replaceProperty(recipients, "DESTINATARIOS_FIXOS_PRODUCAO_POR_CLIENTE", { [ID_CLIENTE_SKF]: ["valido@skfvertevo.com", "invalido-sem-arroba"] });

    const resultado = resolverDestinatarios(ID_CLIENTE_SKF, ["admin@skf.com"]);

    expect(resultado.destinatarios).toEqual(["valido@skfvertevo.com"]);
  });

  it("fora de producao, usa a lista fixa de teste, nunca os admins reais — RELPROM-28", () => {
    process.env.NODE_ENV = "development";
    jest.replaceProperty(recipients, "DEV_REPORT_RECIPIENTS", ["dev@teste.com"]);

    const resultado = resolverDestinatarios(ID_CLIENTE_SEM_OVERRIDE, ["admin@skf.com"]);

    expect(resultado.destinatarios).toEqual(["dev@teste.com"]);
  });

  it("fora de producao, sempre retorna os admins reais pra log (RELPROM-29), mesmo sem envia-los", () => {
    process.env.NODE_ENV = "development";
    jest.replaceProperty(recipients, "DEV_REPORT_RECIPIENTS", ["dev@teste.com"]);

    const resultado = resolverDestinatarios(ID_CLIENTE_SEM_OVERRIDE, ["admin1@skf.com", "admin2@skf.com"]);

    expect(resultado.adminsReaisParaLog).toEqual(["admin1@skf.com", "admin2@skf.com"]);
  });

  it("NODE_ENV indefinido conta como nao-producao (modo seguro)", () => {
    delete process.env.NODE_ENV;
    jest.replaceProperty(recipients, "DEV_REPORT_RECIPIENTS", ["dev@teste.com"]);

    const resultado = resolverDestinatarios(ID_CLIENTE_SEM_OVERRIDE, ["admin@skf.com"]);

    expect(resultado.destinatarios).toEqual(["dev@teste.com"]);
  });

  it("lista de teste vazia fora de producao retorna destinatarios vazio — RELPROM-30", () => {
    process.env.NODE_ENV = "development";
    jest.replaceProperty(recipients, "DEV_REPORT_RECIPIENTS", []);

    const resultado = resolverDestinatarios(ID_CLIENTE_SEM_OVERRIDE, ["admin@skf.com"]);

    expect(resultado.destinatarios).toEqual([]);
  });

  it("filtra e-mail invalido da lista de teste, sem derrubar os demais", () => {
    process.env.NODE_ENV = "development";
    jest.replaceProperty(recipients, "DEV_REPORT_RECIPIENTS", ["valido@teste.com", "invalido-sem-arroba"]);

    const resultado = resolverDestinatarios(ID_CLIENTE_SEM_OVERRIDE, ["admin@skf.com"]);

    expect(resultado.destinatarios).toEqual(["valido@teste.com"]);
  });
});
