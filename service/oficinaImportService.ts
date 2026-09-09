import * as XLSX from "xlsx";
import { AppDataSourceSync } from "../data-source";
import Oficina from "../entities/Oficina";
import OficinaImportada from "../entities/OficinaImportada";
import GeolocationService from "./geolocationService";
import RotaService from "./rotaService";
import CampanhaService from "./campanhaService";
import { cnpjIntParaLigacao, cnpjIntDaOficina } from "../utils/sqlCadastroEmpresa";

export interface LinhaOficinaImport {
  nomeOficina: string;
  cnpj: string;
  cep: string;
  endereco: string;
  numero: string;
  estado: string;
  cidade: string;
}

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

export interface ErroLinhaImport {
  linha: number;
  cnpj?: string;
  motivo: string;
}

export interface ImportResult {
  total_linhas: number;
  oficinas_criadas: number;
  oficinas_vinculadas_existentes: number;
  ja_na_comunidade: number;
  rotas_criadas: number;
  erros: ErroLinhaImport[];
}

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

  /**
   * Busca `MAIN_REGISTER.OFICINA` pelo CNPJ normalizado. Se existir, reusa
   * o `ID_OFICINA` sem alterar nenhum campo da oficina. Se não existir,
   * cria uma oficina nova com os dados da linha e
   * `ORIGEM = "IMPORTACAO_PLANILHA"`.
   */
  static async buscarOuCriarOficina(
    linha: LinhaOficinaImport,
    cnpjNormalizado: string
  ): Promise<{ ID_OFICINA: number; criada: boolean }> {
    const existente = await AppDataSourceSync.query(
      `SELECT o."ID_OFICINA" FROM "MAIN_REGISTER"."OFICINA" o
       WHERE ${cnpjIntDaOficina("o")} = $1::bigint
       LIMIT 1`,
      [cnpjNormalizado]
    );

    if (existente.length > 0) {
      return { ID_OFICINA: existente[0].ID_OFICINA, criada: false };
    }

    const repo = AppDataSourceSync.getRepository(Oficina);
    const novaOficina = repo.create({
      NOME_FANTASIA: linha.nomeOficina,
      CNPJ: linha.cnpj,
      CEP: linha.cep,
      ENDERECO: linha.endereco,
      NUMERO: linha.numero,
      ESTADO: linha.estado,
      CIDADE: linha.cidade,
      ORIGEM: "IMPORTACAO_PLANILHA",
    });
    const oficinaSalva = await repo.save(novaOficina);

    return { ID_OFICINA: oficinaSalva.ID_OFICINA!, criada: true };
  }

  /**
   * Garante que a oficina tem lat/long. Se já tiver, retorna sem chamar o
   * geocoder. Se não tiver, geocodifica o CEP e faz `UPDATE` só de
   * `LATITUDE`/`LONGITUDE`. Retorna `null` quando a geocodificação falha —
   * o chamador trata isso como rejeição da linha, sem escrever nada.
   */
  static async garantirLatLong(
    idOficina: number,
    cep: string
  ): Promise<{ lat: number; lon: number } | null> {
    const repo = AppDataSourceSync.getRepository(Oficina);
    const oficinaAtual = await repo.findOne({ where: { ID_OFICINA: idOficina } });

    if (oficinaAtual?.LATITUDE && oficinaAtual?.LONGITUDE) {
      return {
        lat: parseFloat(oficinaAtual.LATITUDE),
        lon: parseFloat(oficinaAtual.LONGITUDE),
      };
    }

    const geolocationService = new GeolocationService();
    const coords = await geolocationService.getLatLongByCep(cep);

    if (!coords) {
      return null;
    }

    await repo.update(idOficina, {
      LATITUDE: String(coords.lat),
      LONGITUDE: String(coords.long),
    });

    return { lat: coords.lat, lon: coords.long };
  }

  /**
   * Vincula a oficina ao cliente (`empresaSlug`) sem depender de usuário.
   * Se a oficina já pertence à comunidade — via `USUARIO_COMMUNITY` (usuário
   * real) ou via um vínculo `OFICINA_IMPORTADA` anterior — não cria um novo
   * vínculo (idempotente). Caso contrário, insere o vínculo.
   */
  static async garantirVinculo(
    idOficina: number,
    empresaSlug: string,
    idCampanha: number,
    createdBy?: number
  ): Promise<"criado" | "ja_vinculada"> {
    const viaUsuario = await AppDataSourceSync.query(
      `SELECT 1
       FROM "OFICINA_PORTAL"."COMMUNITIES" cm
       INNER JOIN "MAIN_REGISTER"."USUARIO_COMMUNITY" uc ON cm."CommunityID" = uc."id_community"
       INNER JOIN "MAIN_REGISTER"."USUARIO" us ON us."ID_USUARIO" = uc."id_usuario"
       WHERE cm."EmpresaSlug" = $1 AND us."ID_OFICINA" = $2
       LIMIT 1`,
      [empresaSlug, idOficina]
    );

    if (viaUsuario.length > 0) {
      return "ja_vinculada";
    }

    const repo = AppDataSourceSync.getRepository(OficinaImportada);
    const viaImportacao = await repo.findOne({
      where: { ID_OFICINA: idOficina, EMPRESA_SLUG: empresaSlug },
    });

    if (viaImportacao) {
      return "ja_vinculada";
    }

    const novoVinculo = repo.create({
      ID_OFICINA: idOficina,
      EMPRESA_SLUG: empresaSlug,
      ID_CAMPANHA: idCampanha,
      CREATED_BY: createdBy,
    });
    await repo.save(novoVinculo);

    return "criado";
  }

  /**
   * Tenta atribuir a oficina vinculada a um promotor, reaproveitando
   * `RotaService.assignOficinaFromCommunitySignup` sem nenhuma alteração —
   * o mesmo método já usado no fluxo de inscrição em comunidade já cobre
   * raio, desempate por distância e idempotência para todas as campanhas
   * ativas do cliente.
   */
  static async atribuirRota(
    idOficina: number,
    empresaSlug: string
  ): ReturnType<typeof RotaService.assignOficinaFromCommunitySignup> {
    return RotaService.assignOficinaFromCommunitySignup(idOficina, empresaSlug);
  }

  /**
   * Orquestra o fluxo completo: resolve `EMPRESA_SLUG` a partir da campanha,
   * valida a planilha, e processa linha a linha isolando erro de linha (não
   * aborta o arquivo). Lança "CAMPANHA_NAO_ENCONTRADA" ou
   * "CAMPANHA_SEM_EMPRESA_SLUG" antes de processar qualquer linha; erros
   * estruturais do arquivo (`HEADER_INVALIDO`, `LIMITE_LINHAS_EXCEDIDO`)
   * também propagam antes de qualquer escrita.
   *
   * Quando a oficina acabou de ser criada nesta importação e a
   * geocodificação falha, a oficina recém-criada é removida — a linha não
   * pode deixar rastro de uma oficina sem lat/long (spec: "SHALL NOT criar
   * ... a oficina").
   */
  static async importarPlanilha(
    buffer: Buffer,
    idCampanha: number,
    createdBy?: number
  ): Promise<ImportResult> {
    const campanha = await CampanhaService.findCampanhaById(idCampanha);
    if (!campanha) {
      throw new Error("CAMPANHA_NAO_ENCONTRADA");
    }
    if (!campanha.EMPRESA_SLUG) {
      throw new Error("CAMPANHA_SEM_EMPRESA_SLUG");
    }
    const empresaSlug = campanha.EMPRESA_SLUG;

    const linhas = this.parseArquivo(buffer);
    this.validarCabecalho(linhas);
    this.validarLimiteLinhas(linhas);

    const linhasDeDados = linhas.slice(1);
    const cnpjsNormalizados = linhasDeDados.map((linha) => this.normalizarCnpj(linha[1]));
    const indicesDuplicados = this.indicesComCnpjDuplicado(cnpjsNormalizados);

    const resultado: ImportResult = {
      total_linhas: linhasDeDados.length,
      oficinas_criadas: 0,
      oficinas_vinculadas_existentes: 0,
      ja_na_comunidade: 0,
      rotas_criadas: 0,
      erros: [],
    };

    for (let indice = 0; indice < linhasDeDados.length; indice++) {
      const numeroLinha = indice + 2; // linha 1 é o cabeçalho
      const [nomeOficina, cnpjBruto, cep, endereco, numero, estado, cidade] = linhasDeDados[indice];
      const cnpjNormalizado = cnpjsNormalizados[indice];

      if (!cnpjNormalizado) {
        resultado.erros.push({ linha: numeroLinha, cnpj: cnpjBruto, motivo: "CNPJ_INVALIDO" });
        continue;
      }

      if (indicesDuplicados.has(indice)) {
        resultado.erros.push({
          linha: numeroLinha,
          cnpj: cnpjBruto,
          motivo: "CNPJ_DUPLICADO_NO_ARQUIVO",
        });
        continue;
      }

      const cepLimpo = (cep ?? "").replace(/\D/g, "");
      if (!cepLimpo) {
        resultado.erros.push({ linha: numeroLinha, cnpj: cnpjBruto, motivo: "CEP_INVALIDO" });
        continue;
      }

      const linhaOficina: LinhaOficinaImport = {
        nomeOficina,
        cnpj: cnpjBruto,
        cep,
        endereco,
        numero,
        estado,
        cidade,
      };

      try {
        const { ID_OFICINA, criada } = await this.buscarOuCriarOficina(
          linhaOficina,
          cnpjNormalizado
        );

        const coords = await this.garantirLatLong(ID_OFICINA, cep);
        if (!coords) {
          if (criada) {
            // SPEC_DEVIATION: design.md's flow diagram creates the oficina before
            // geocoding and only marks the row as rejected on geocode failure.
            // spec.md's IMPORT-12 requires the system SHALL NOT create the
            // oficina when geocoding fails. Reconciled here: roll back the
            // just-created row so no oficina without lat/long persists.
            await AppDataSourceSync.getRepository(Oficina).delete(ID_OFICINA);
          }
          resultado.erros.push({
            linha: numeroLinha,
            cnpj: cnpjBruto,
            motivo: "GEOCODIFICACAO_FALHOU",
          });
          continue;
        }

        if (criada) {
          resultado.oficinas_criadas++;
        } else {
          resultado.oficinas_vinculadas_existentes++;
        }

        const statusVinculo = await this.garantirVinculo(
          ID_OFICINA,
          empresaSlug,
          idCampanha,
          createdBy
        );
        if (statusVinculo === "ja_vinculada") {
          resultado.ja_na_comunidade++;
        }

        const atribuicao = await this.atribuirRota(ID_OFICINA, empresaSlug);
        resultado.rotas_criadas += atribuicao.resumo.atribuidas;
      } catch {
        // Isola falha inesperada (DB, rede) na linha em vez de abortar o
        // arquivo inteiro — mesmo princípio de isolamento por linha já
        // aplicado aos erros de validação/geocodificação acima.
        resultado.erros.push({
          linha: numeroLinha,
          cnpj: cnpjBruto,
          motivo: "ERRO_PROCESSAMENTO",
        });
      }
    }

    return resultado;
  }
}

export { CABECALHO_ESPERADO, LIMITE_LINHAS_DE_DADOS };
