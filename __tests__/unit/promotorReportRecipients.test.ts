import * as recipients from "../../config/promotorReportRecipients";

const { resolverDestinatarios } = recipients;
const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("resolverDestinatarios", () => {
  it("em producao, usa os admins reais, nunca a lista de teste — RELPROM-31", () => {
    process.env.NODE_ENV = "production";
    const resultado = resolverDestinatarios(["admin@skf.com"]);

    expect(resultado.destinatarios).toEqual(["admin@skf.com"]);
  });

  it("fora de producao, usa a lista fixa de teste, nunca os admins reais — RELPROM-28", () => {
    process.env.NODE_ENV = "development";
    jest.replaceProperty(recipients, "DEV_REPORT_RECIPIENTS", ["dev@teste.com"]);

    const resultado = resolverDestinatarios(["admin@skf.com"]);

    expect(resultado.destinatarios).toEqual(["dev@teste.com"]);
  });

  it("fora de producao, sempre retorna os admins reais pra log (RELPROM-29), mesmo sem envia-los", () => {
    process.env.NODE_ENV = "development";
    jest.replaceProperty(recipients, "DEV_REPORT_RECIPIENTS", ["dev@teste.com"]);

    const resultado = resolverDestinatarios(["admin1@skf.com", "admin2@skf.com"]);

    expect(resultado.adminsReaisParaLog).toEqual(["admin1@skf.com", "admin2@skf.com"]);
  });

  it("NODE_ENV indefinido conta como nao-producao (modo seguro)", () => {
    delete process.env.NODE_ENV;
    jest.replaceProperty(recipients, "DEV_REPORT_RECIPIENTS", ["dev@teste.com"]);

    const resultado = resolverDestinatarios(["admin@skf.com"]);

    expect(resultado.destinatarios).toEqual(["dev@teste.com"]);
  });

  it("lista de teste vazia fora de producao retorna destinatarios vazio — RELPROM-30", () => {
    process.env.NODE_ENV = "development";
    jest.replaceProperty(recipients, "DEV_REPORT_RECIPIENTS", []);

    const resultado = resolverDestinatarios(["admin@skf.com"]);

    expect(resultado.destinatarios).toEqual([]);
  });

  it("filtra e-mail invalido da lista de teste, sem derrubar os demais", () => {
    process.env.NODE_ENV = "development";
    jest.replaceProperty(recipients, "DEV_REPORT_RECIPIENTS", ["valido@teste.com", "invalido-sem-arroba"]);

    const resultado = resolverDestinatarios(["admin@skf.com"]);

    expect(resultado.destinatarios).toEqual(["valido@teste.com"]);
  });
});
