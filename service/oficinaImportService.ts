import * as XLSX from "xlsx";
import { cnpjIntParaLigacao } from "../utils/sqlCadastroEmpresa";

const CABECALHO_ESPERADO = [
  "NOME OFICINA",
  "CNPJ",
  "CEP",
  "ENDERECO",
  "NUMERO",
  "ESTADO",
  "CIDADE",
];

const LIMITE_LINHAS_DE_DADOS = 5000;

const MARCAS_DIACRITICAS = /[\u0300-\u036f]/g;

export default class OficinaImportService {
  /** Remove acentuação e normaliza para maiúsculas, para comparação de cabeçalho tolerante a variação trivial. */
  private static normalizarCabecalho(valor: string): string {
    return (valor ?? "")
      .normalize("NFD")
      .replace(MARCAS_DIACRITICAS, "")
      .trim()
      .toUpperCase();
  }

  /**
   * Lê o buffer do upload (.xlsx ou .csv) e retorna a matriz de linhas
   * (cada linha é um array de valores de célula como string). O SheetJS
   * detecta o formato pelo conteúdo do buffer, não pela extensão.
   */
  static parseArquivo(buffer: Buffer): string[][] {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const primeiraAba = workbook.SheetNames[0];
    const planilha = workbook.Sheets[primeiraAba];
    return XLSX.utils.sheet_to_json<string[]>(planilha, {
      header: 1,
      raw: false,
      defval: "",
    });
  }

  /**
   * Exige as 7 colunas do padrão, exatamente nessa ordem (comparação
   * case/acento-insensível). Lança "HEADER_INVALIDO" se não bater.
   */
  static validarCabecalho(linhas: string[][]): void {
    const cabecalho = linhas[0] ?? [];
    const cabecalhoNormalizado = cabecalho.map((valor) =>
      this.normalizarCabecalho(String(valor ?? ""))
    );

    const bate =
      cabecalhoNormalizado.length === CABECALHO_ESPERADO.length &&
      CABECALHO_ESPERADO.every((esperado, indice) => cabecalhoNormalizado[indice] === esperado);

    if (!bate) {
      throw new Error("HEADER_INVALIDO");
    }
  }

  /**
   * Rejeita o arquivo inteiro se as linhas de dados (excluindo o cabeçalho)
   * excederem o teto. Lança "LIMITE_LINHAS_EXCEDIDO".
   */
  static validarLimiteLinhas(linhas: string[][]): void {
    const linhasDeDados = Math.max(linhas.length - 1, 0);
    if (linhasDeDados > LIMITE_LINHAS_DE_DADOS) {
      throw new Error("LIMITE_LINHAS_EXCEDIDO");
    }
  }

  /**
   * Normaliza o CNPJ de uma linha para a mesma regra usada em todo o
   * sistema (exatamente 14 dígitos, comparável a `cnpj_int`). Retorna
   * `null` quando o valor não normaliza para 14 dígitos.
   */
  static normalizarCnpj(valor: string): string | null {
    return cnpjIntParaLigacao(valor);
  }

  /**
   * Recebe os CNPJs já normalizados (na ordem das linhas do arquivo,
   * `null` para os inválidos) e retorna os índices que são a segunda (ou
   * posterior) ocorrência do mesmo CNPJ. Índices com CNPJ inválido
   * (`null`) nunca entram no resultado — inválido é um erro à parte, não
   * uma duplicata.
   */
  static indicesComCnpjDuplicado(cnpjsNormalizados: Array<string | null>): Set<number> {
    const vistos = new Set<string>();
    const duplicados = new Set<number>();

    cnpjsNormalizados.forEach((cnpj, indice) => {
      if (!cnpj) return;
      if (vistos.has(cnpj)) {
        duplicados.add(indice);
      } else {
        vistos.add(cnpj);
      }
    });

    return duplicados;
  }
}

export { CABECALHO_ESPERADO, LIMITE_LINHAS_DE_DADOS };
