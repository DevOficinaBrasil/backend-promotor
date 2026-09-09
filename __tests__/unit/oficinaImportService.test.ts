import * as XLSX from "xlsx";
import OficinaImportService from "../../service/oficinaImportService";
import { AppDataSourceSync } from "../../data-source";
import { createMockRepo } from "../helpers/mockRepo";
import Oficina from "../../entities/Oficina";
import OficinaImportada from "../../entities/OficinaImportada";
import GeolocationService from "../../service/geolocationService";
import RotaService from "../../service/rotaService";

jest.mock("../../data-source");
jest.mock("../../service/geolocationService");
jest.mock("../../service/rotaService");

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

  describe("buscarOuCriarOficina", () => {
    const linha = {
      nomeOficina: "Oficina Teste",
      cnpj: "12.345.678/0001-90",
      cep: "01310100",
      endereco: "Rua Teste",
      numero: "100",
      estado: "SP",
      cidade: "Sao Paulo",
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("should reuse the existing ID_OFICINA and not write any field when the CNPJ already exists", async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([{ ID_OFICINA: 42 }]);
      const repo = createMockRepo();
      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(repo);

      const resultado = await OficinaImportService.buscarOuCriarOficina(linha, "12345678000190");

      expect(resultado).toEqual({ ID_OFICINA: 42, criada: false });
      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it("should create a new oficina with ORIGEM = IMPORTACAO_PLANILHA when the CNPJ does not exist", async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([]);
      const repo = createMockRepo();
      (repo.save as jest.Mock).mockResolvedValue({ ID_OFICINA: 99 });
      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(repo);

      const resultado = await OficinaImportService.buscarOuCriarOficina(linha, "12345678000190");

      expect(resultado).toEqual({ ID_OFICINA: 99, criada: true });
      expect(AppDataSourceSync.getRepository).toHaveBeenCalledWith(Oficina);
      expect(repo.create).toHaveBeenCalledWith({
        NOME_FANTASIA: "Oficina Teste",
        CNPJ: "12.345.678/0001-90",
        CEP: "01310100",
        ENDERECO: "Rua Teste",
        NUMERO: "100",
        ESTADO: "SP",
        CIDADE: "Sao Paulo",
        ORIGEM: "IMPORTACAO_PLANILHA",
      });
    });
  });

  describe("garantirLatLong", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("should not call the geocoder when the oficina already has lat/long", async () => {
      const repo = createMockRepo();
      (repo.findOne as jest.Mock).mockResolvedValue({ LATITUDE: "-23.55", LONGITUDE: "-46.63" });
      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(repo);
      const getLatLongByCep = jest.fn();
      (GeolocationService as unknown as jest.Mock).mockImplementation(() => ({
        getLatLongByCep,
      }));

      const resultado = await OficinaImportService.garantirLatLong(1, "01310100");

      expect(resultado).toEqual({ lat: -23.55, lon: -46.63 });
      expect(getLatLongByCep).not.toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
    });

    it("should geocode and persist lat/long when the oficina has none", async () => {
      const repo = createMockRepo();
      (repo.findOne as jest.Mock).mockResolvedValue({ LATITUDE: null, LONGITUDE: null });
      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(repo);
      const getLatLongByCep = jest.fn().mockResolvedValue({ lat: -23.55, long: -46.63 });
      (GeolocationService as unknown as jest.Mock).mockImplementation(() => ({
        getLatLongByCep,
      }));

      const resultado = await OficinaImportService.garantirLatLong(1, "01310100");

      expect(resultado).toEqual({ lat: -23.55, lon: -46.63 });
      expect(getLatLongByCep).toHaveBeenCalledWith("01310100");
      expect(repo.update).toHaveBeenCalledWith(1, { LATITUDE: "-23.55", LONGITUDE: "-46.63" });
    });

    it("should return null and write nothing when geocoding fails", async () => {
      const repo = createMockRepo();
      (repo.findOne as jest.Mock).mockResolvedValue({ LATITUDE: null, LONGITUDE: null });
      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(repo);
      const getLatLongByCep = jest.fn().mockResolvedValue(null);
      (GeolocationService as unknown as jest.Mock).mockImplementation(() => ({
        getLatLongByCep,
      }));

      const resultado = await OficinaImportService.garantirLatLong(1, "00000000");

      expect(resultado).toBeNull();
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe("garantirVinculo", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("should return ja_vinculada and create nothing when the oficina already belongs to the community via a real user", async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([{ "?column?": 1 }]);
      const repo = createMockRepo();
      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(repo);

      const resultado = await OficinaImportService.garantirVinculo(1, "empresa-x", 10);

      expect(resultado).toBe("ja_vinculada");
      expect(repo.findOne).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it("should return ja_vinculada and create nothing when an OFICINA_IMPORTADA link already exists", async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([]);
      const repo = createMockRepo();
      (repo.findOne as jest.Mock).mockResolvedValue({ ID_OFICINA_IMPORTADA: 5 });
      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(repo);

      const resultado = await OficinaImportService.garantirVinculo(1, "empresa-x", 10);

      expect(resultado).toBe("ja_vinculada");
      expect(repo.save).not.toHaveBeenCalled();
    });

    it("should create a new OFICINA_IMPORTADA link when the oficina is not yet in the community", async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([]);
      const repo = createMockRepo();
      (repo.findOne as jest.Mock).mockResolvedValue(null);
      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(repo);

      const resultado = await OficinaImportService.garantirVinculo(1, "empresa-x", 10, 7);

      expect(resultado).toBe("criado");
      expect(AppDataSourceSync.getRepository).toHaveBeenCalledWith(OficinaImportada);
      expect(repo.create).toHaveBeenCalledWith({
        ID_OFICINA: 1,
        EMPRESA_SLUG: "empresa-x",
        ID_CAMPANHA: 10,
        CREATED_BY: 7,
      });
      expect(repo.save).toHaveBeenCalled();
    });

    it("should not create a duplicate link when re-importing the same oficina for the same empresaSlug", async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([]);
      const repo = createMockRepo();
      (repo.findOne as jest.Mock).mockResolvedValue({ ID_OFICINA_IMPORTADA: 5 });
      (AppDataSourceSync.getRepository as jest.Mock).mockReturnValue(repo);

      await OficinaImportService.garantirVinculo(1, "empresa-x", 10);
      const resultado = await OficinaImportService.garantirVinculo(1, "empresa-x", 10);

      expect(resultado).toBe("ja_vinculada");
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe("atribuirRota", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("should forward idOficina and empresaSlug to RotaService.assignOficinaFromCommunitySignup", async () => {
      (RotaService.assignOficinaFromCommunitySignup as jest.Mock).mockResolvedValue({
        oficina: { ID_OFICINA: 1, CEP: "01310100", latitude: -23.55, longitude: -46.63 },
        campanhas_processadas: 1,
        atribuicoes: [],
        resumo: { atribuidas: 0, sem_promotor_disponivel: 0, ja_atribuida: 0 },
      });

      await OficinaImportService.atribuirRota(1, "empresa-x");

      expect(RotaService.assignOficinaFromCommunitySignup).toHaveBeenCalledWith(1, "empresa-x");
    });

    it("should pass through a result with a route created (atribuida)", async () => {
      const resultadoEsperado = {
        oficina: { ID_OFICINA: 1, CEP: "01310100", latitude: -23.55, longitude: -46.63 },
        campanhas_processadas: 1,
        atribuicoes: [
          {
            ID_CAMPANHA: 10,
            NOME_CAMPANHA: "Campanha X",
            status: "atribuida" as const,
            promotor: { ID_PROMOTOR: 5, NOME: "Promotor X", distancia_km: 3.2 },
            ID_ROTA_PROMOTOR: 900,
          },
        ],
        resumo: { atribuidas: 1, sem_promotor_disponivel: 0, ja_atribuida: 0 },
      };
      (RotaService.assignOficinaFromCommunitySignup as jest.Mock).mockResolvedValue(
        resultadoEsperado
      );

      const resultado = await OficinaImportService.atribuirRota(1, "empresa-x");

      expect(resultado).toBe(resultadoEsperado);
      expect(resultado.resumo.atribuidas).toBe(1);
    });

    it("should pass through a result with no promoter in range (sem_promotor_disponivel), without treating it as an error", async () => {
      const resultadoEsperado = {
        oficina: { ID_OFICINA: 1, CEP: "01310100", latitude: -23.55, longitude: -46.63 },
        campanhas_processadas: 1,
        atribuicoes: [
          {
            ID_CAMPANHA: 10,
            NOME_CAMPANHA: "Campanha X",
            status: "sem_promotor_disponivel" as const,
            promotor: null,
            ID_ROTA_PROMOTOR: null,
          },
        ],
        resumo: { atribuidas: 0, sem_promotor_disponivel: 1, ja_atribuida: 0 },
      };
      (RotaService.assignOficinaFromCommunitySignup as jest.Mock).mockResolvedValue(
        resultadoEsperado
      );

      const resultado = await OficinaImportService.atribuirRota(1, "empresa-x");

      expect(resultado).toBe(resultadoEsperado);
      expect(resultado.resumo.sem_promotor_disponivel).toBe(1);
    });
  });
});
