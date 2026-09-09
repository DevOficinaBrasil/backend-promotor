import * as XLSX from "xlsx";
import OficinaImportService from "../../service/oficinaImportService";

const CABECALHO_VALIDO = [
  "NOME OFICINA",
  "CNPJ",
  "CEP",
  "ENDEREÇO",
  "NUMERO",
  "ESTADO",
  "CIDADE",
];

function bufferDeLinhas(linhas: (string | number)[][]): Buffer {
  const planilha = XLSX.utils.aoa_to_sheet(linhas);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, planilha, "Sheet1");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

describe("OficinaImportService", () => {
  describe("parseArquivo", () => {
    it("should parse a real xlsx buffer into rows of string cells", () => {
      const buffer = bufferDeLinhas([
        CABECALHO_VALIDO,
        ["Oficina Teste", "12345678000190", "01310100", "Rua Teste", "100", "SP", "Sao Paulo"],
      ]);

      const linhas = OficinaImportService.parseArquivo(buffer);

      expect(linhas).toHaveLength(2);
      expect(linhas[0]).toEqual(CABECALHO_VALIDO);
      expect(linhas[1][0]).toBe("Oficina Teste");
      expect(linhas[1][1]).toBe("12345678000190");
    });
  });

  describe("validarCabecalho", () => {
    it("should accept the exact expected header", () => {
      expect(() => OficinaImportService.validarCabecalho([CABECALHO_VALIDO])).not.toThrow();
    });

    it("should accept the header regardless of case and accents", () => {
      const cabecalhoVariante = [
        "nome oficina",
        "cnpj",
        "cep",
        "endereco",
        "numero",
        "estado",
        "cidade",
      ];
      expect(() => OficinaImportService.validarCabecalho([cabecalhoVariante])).not.toThrow();
    });

    it("should reject a header with columns out of order", () => {
      const foraDeOrdem = ["CNPJ", "NOME OFICINA", "CEP", "ENDEREÇO", "NUMERO", "ESTADO", "CIDADE"];
      expect(() => OficinaImportService.validarCabecalho([foraDeOrdem])).toThrow("HEADER_INVALIDO");
    });

    it("should reject a header missing a column", () => {
      const faltandoColuna = ["NOME OFICINA", "CNPJ", "CEP", "ENDEREÇO", "NUMERO", "ESTADO"];
      expect(() => OficinaImportService.validarCabecalho([faltandoColuna])).toThrow(
        "HEADER_INVALIDO"
      );
    });

    it("should reject a header with an extra column", () => {
      const comColunaExtra = [...CABECALHO_VALIDO, "TELEFONE"];
      expect(() => OficinaImportService.validarCabecalho([comColunaExtra])).toThrow(
        "HEADER_INVALIDO"
      );
    });

    it("should not throw for a valid header with zero data rows", () => {
      expect(() => OficinaImportService.validarCabecalho([CABECALHO_VALIDO])).not.toThrow();
    });
  });

  describe("validarLimiteLinhas", () => {
    it("should not throw when data rows are within the limit", () => {
      const linhas = [CABECALHO_VALIDO, ...Array(100).fill(["a", "b", "c", "d", "e", "f", "g"])];
      expect(() => OficinaImportService.validarLimiteLinhas(linhas)).not.toThrow();
    });

    it("should throw when data rows exceed 5000", () => {
      const linhas = [CABECALHO_VALIDO, ...Array(5001).fill(["a", "b", "c", "d", "e", "f", "g"])];
      expect(() => OficinaImportService.validarLimiteLinhas(linhas)).toThrow(
        "LIMITE_LINHAS_EXCEDIDO"
      );
    });

    it("should not throw for a header-only file (zero data rows)", () => {
      expect(() => OficinaImportService.validarLimiteLinhas([CABECALHO_VALIDO])).not.toThrow();
    });
  });

  describe("normalizarCnpj", () => {
    it("should normalize a masked CNPJ to its 14-digit form", () => {
      expect(OficinaImportService.normalizarCnpj("12.345.678/0001-90")).toBe("12345678000190");
    });

    it("should return null for a CNPJ with fewer than 14 digits", () => {
      expect(OficinaImportService.normalizarCnpj("123456")).toBeNull();
    });

    it("should return null for a CNPJ with more than 14 digits", () => {
      expect(OficinaImportService.normalizarCnpj("123456780001901234")).toBeNull();
    });

    it("should return null for an empty CNPJ", () => {
      expect(OficinaImportService.normalizarCnpj("")).toBeNull();
    });
  });

  describe("indicesComCnpjDuplicado", () => {
    it("should return an empty set when there are no duplicates", () => {
      const resultado = OficinaImportService.indicesComCnpjDuplicado([
        "12345678000190",
        "98765432000110",
      ]);
      expect(resultado.size).toBe(0);
    });

    it("should flag the second occurrence of a repeated CNPJ, not the first", () => {
      const resultado = OficinaImportService.indicesComCnpjDuplicado([
        "12345678000190",
        "98765432000110",
        "12345678000190",
      ]);
      expect(resultado.has(0)).toBe(false);
      expect(resultado.has(1)).toBe(false);
      expect(resultado.has(2)).toBe(true);
    });

    it("should never flag an invalid (null) CNPJ as a duplicate", () => {
      const resultado = OficinaImportService.indicesComCnpjDuplicado([null, null]);
      expect(resultado.size).toBe(0);
    });
  });
});
