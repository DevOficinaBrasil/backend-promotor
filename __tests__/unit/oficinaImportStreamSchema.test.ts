import {
  IMPORT_STREAM_MAX_LINHAS,
  ImportOficinasStreamBodySchema,
  ImportStreamEventoSchema,
  LinhaOficinaImportSchema,
} from "../../schemas/oficina";

const linhaValida = { cnpj: "12345678000190", cep: "01310100" };

const loteDe = (quantidade: number) =>
  Array.from({ length: quantidade }, () => ({ ...linhaValida }));

describe("LinhaOficinaImportSchema", () => {
  it("accepts a row carrying only CNPJ and CEP", () => {
    expect(LinhaOficinaImportSchema.safeParse(linhaValida).success).toBe(true);
  });

  it("accepts a row carrying every optional field", () => {
    const resultado = LinhaOficinaImportSchema.safeParse({
      ...linhaValida,
      linha: 7,
      nomeOficina: "Oficina A",
      endereco: "Rua X",
      numero: "10",
      bairro: "Centro",
      estado: "SP",
      cidade: "Sao Paulo",
    });

    expect(resultado.success).toBe(true);
  });

  it("rejects a row without CNPJ", () => {
    expect(LinhaOficinaImportSchema.safeParse({ cep: "01310100" }).success).toBe(false);
  });

  it("rejects a row without CEP", () => {
    expect(LinhaOficinaImportSchema.safeParse({ cnpj: "12345678000190" }).success).toBe(false);
  });

  it("rejects a CNPJ that is only whitespace", () => {
    expect(LinhaOficinaImportSchema.safeParse({ ...linhaValida, cnpj: "   " }).success).toBe(false);
  });

  it("rejects a CEP that is only whitespace", () => {
    expect(LinhaOficinaImportSchema.safeParse({ ...linhaValida, cep: "  " }).success).toBe(false);
  });

  it("rejects a line number that is not a positive integer", () => {
    expect(LinhaOficinaImportSchema.safeParse({ ...linhaValida, linha: 0 }).success).toBe(false);
    expect(LinhaOficinaImportSchema.safeParse({ ...linhaValida, linha: -3 }).success).toBe(false);
  });
});

describe("ImportOficinasStreamBodySchema", () => {
  it("accepts a well-formed body", () => {
    const resultado = ImportOficinasStreamBodySchema.safeParse({
      ID_CAMPANHA: 10,
      oficinas: [linhaValida],
    });

    expect(resultado.success).toBe(true);
  });

  it("coerces a numeric ID_CAMPANHA sent as a string", () => {
    const resultado = ImportOficinasStreamBodySchema.safeParse({
      ID_CAMPANHA: "10",
      oficinas: [linhaValida],
    });

    expect(resultado.success).toBe(true);
    expect(resultado.success && resultado.data.ID_CAMPANHA).toBe(10);
  });

  it("rejects a body without ID_CAMPANHA", () => {
    expect(ImportOficinasStreamBodySchema.safeParse({ oficinas: [linhaValida] }).success).toBe(
      false
    );
  });

  it("rejects an ID_CAMPANHA that is zero or negative", () => {
    expect(
      ImportOficinasStreamBodySchema.safeParse({ ID_CAMPANHA: 0, oficinas: [linhaValida] }).success
    ).toBe(false);
  });

  it("rejects a body without the oficinas array", () => {
    expect(ImportOficinasStreamBodySchema.safeParse({ ID_CAMPANHA: 10 }).success).toBe(false);
  });

  it("rejects an empty oficinas array", () => {
    expect(
      ImportOficinasStreamBodySchema.safeParse({ ID_CAMPANHA: 10, oficinas: [] }).success
    ).toBe(false);
  });

  it("rejects the body when one row is missing CEP", () => {
    const resultado = ImportOficinasStreamBodySchema.safeParse({
      ID_CAMPANHA: 10,
      oficinas: [linhaValida, { cnpj: "98765432000188" }],
    });

    expect(resultado.success).toBe(false);
  });

  it("accepts a batch exactly at the row cap", () => {
    const resultado = ImportOficinasStreamBodySchema.safeParse({
      ID_CAMPANHA: 10,
      oficinas: loteDe(IMPORT_STREAM_MAX_LINHAS),
    });

    expect(resultado.success).toBe(true);
  });

  it("rejects a batch one row over the cap", () => {
    const resultado = ImportOficinasStreamBodySchema.safeParse({
      ID_CAMPANHA: 10,
      oficinas: loteDe(IMPORT_STREAM_MAX_LINHAS + 1),
    });

    expect(resultado.success).toBe(false);
  });

  it("keeps the cap in step with the service's row limit", () => {
    // O serviço tem o mesmo teto; divergir faria o schema aceitar um lote que o
    // serviço recusaria depois, já com o stream aberto.
    const { LIMITE_LINHAS_DE_DADOS } = require("../../service/oficinaImportService");
    expect(IMPORT_STREAM_MAX_LINHAS).toBe(LIMITE_LINHAS_DE_DADOS);
  });
});

describe("ImportStreamEventoSchema", () => {
  it("accepts each of the four event shapes", () => {
    expect(ImportStreamEventoSchema.safeParse({ tipo: "inicio", total: 3 }).success).toBe(true);
    expect(
      ImportStreamEventoSchema.safeParse({
        tipo: "progresso",
        progresso: {
          processadas: 1,
          total: 3,
          oficinas_criadas: 1,
          oficinas_vinculadas_existentes: 0,
          ja_na_comunidade: 0,
          erros: 0,
        },
      }).success
    ).toBe(true);
    expect(
      ImportStreamEventoSchema.safeParse({
        tipo: "fim",
        resultado: {
          total_linhas: 1,
          oficinas_criadas: 1,
          oficinas_vinculadas_existentes: 0,
          ja_na_comunidade: 0,
          rotas_criadas: 0,
          rotas_sem_promotor_disponivel: 0,
          campanhas_ativas_consideradas: 0,
          erros: [],
        },
      }).success
    ).toBe(true);
    expect(ImportStreamEventoSchema.safeParse({ tipo: "erro", mensagem: "falhou" }).success).toBe(
      true
    );
  });

  it("rejects an unknown event type", () => {
    expect(ImportStreamEventoSchema.safeParse({ tipo: "outro" }).success).toBe(false);
  });
});
