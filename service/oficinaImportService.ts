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
  bairro: string;
  estado: string;
  cidade: string;
}

const CABECALHO_ESPERADO = [
  "NOME OFICINA",
  "CNPJ",
  "CEP",
  "ENDERECO",
  "NUMERO",
  "BAIRRO",
  "ESTADO",
  "CIDADE",
];

const LIMITE_LINHAS_DE_DADOS = 5000;

/**
 * Quantas linhas processam em paralelo. O maior custo por linha é I/O de
 * rede/banco (geocoding, queries) — processar várias linhas ao mesmo tempo
 * sobrepõe essas esperas em vez de somá-las em série. O geocoding em si
 * continua limitado a 1 req/s pela fila global de `GeolocationService`
 * (política de uso do Nominatim); a concorrência aqui só garante que,
 * enquanto uma linha espera na fila de geocoding, outras linhas avançam
 * com banco de dados em paralelo. 8 fica dentro do pool de conexões padrão
 * do driver `pg` (10) com folga para outras requisições no mesmo processo.
 */
const CONCORRENCIA_IMPORTACAO = 8;

const MARCAS_DIACRITICAS = /[\u0300-\u036f]/g;

/** Assinatura ZIP ("PK") \u2014 todo .xlsx \u00e9 um arquivo ZIP; um .csv n\u00e3o \u00e9. */
const ASSINATURA_ZIP = Buffer.from([0x50, 0x4b]);
const BOM_UTF8 = Buffer.from([0xef, 0xbb, 0xbf]);

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
   * Decodifica um buffer de texto (.csv) para string. O parser de CSV do
   * SheetJS não assume UTF-8 por padrão — um CSV genuinamente UTF-8 (o caso
   * comum de upload via browser) chega com acentuação corrompida
   * ("ENDEREÇO" vira "ENDEREÃO"). Decodificamos nós mesmos e entregamos uma
   * string pronta (`type: "string"`), contornando esse parser por completo:
   *
   *  1. Remove o BOM UTF-8 se presente.
   *  2. Tenta UTF-8. `Buffer.toString("utf8")` não lança em bytes inválidos —
   *     substitui por U+FFFD — então a presença desse caractere é o sinal de
   *     que a fonte não era UTF-8.
   *  3. Cai para "latin1": a maioria dos CSVs exportados pelo Excel no Brasil
   *     usa Windows-1252/ANSI, e ISO-8859-1 (o que "latin1" decodifica)
   *     mapeia byte a byte para os mesmos code points nos acentos do
   *     português (á, é, í, ó, ú, ã, õ, ç, ...) — cobre o caso real sem
   *     precisar de uma tabela de codepage completa.
   */
  private static decodificarTexto(buffer: Buffer): string {
    const semBom = buffer.subarray(0, 3).equals(BOM_UTF8) ? buffer.subarray(3) : buffer;
    const comoUtf8 = semBom.toString("utf8");
    if (!comoUtf8.includes("�")) {
      return comoUtf8;
    }
    return semBom.toString("latin1");
  }

  /**
   * Lê o buffer do upload (.xlsx ou .csv) e retorna a matriz de linhas
   * (cada linha é um array de valores de célula como string).
   *
   * Detecta o formato pela assinatura ZIP do buffer ("PK"), não pela
   * extensão: todo .xlsx é um ZIP, então o que não é ZIP é tratado como
   * texto (.csv) e passa por `decodificarTexto` antes do parser — ver o
   * comentário ali sobre por que o buffer não pode ir direto para o SheetJS.
   * Um .xlsx (ZIP) não tem essa ambiguidade — o texto já vem em UTF-8/UTF-16
   * dentro do XML interno — e segue para `XLSX.read` sem decodificação prévia.
   */
  static parseArquivo(buffer: Buffer): string[][] {
    const ehZip = buffer.subarray(0, 2).equals(ASSINATURA_ZIP);
    const workbook = ehZip
      ? XLSX.read(buffer, { type: "buffer" })
      : XLSX.read(this.decodificarTexto(buffer), { type: "string" });
    const primeiraAba = workbook.SheetNames[0];
    const planilha = workbook.Sheets[primeiraAba];
    return XLSX.utils.sheet_to_json<string[]>(planilha, {
      header: 1,
      raw: false,
      defval: "",
    });
  }

  /**
   * Exige as 8 colunas do padrão, exatamente nessa ordem (comparação
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
      BAIRRO: linha.bairro,
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
   * Roda `tarefa` para cada item de `itens`, no máximo `concorrencia` por
   * vez. Sem dependência nova: um pool simples de workers avançando sobre
   * um índice compartilhado — seguro porque `proximoIndice++` é síncrono
   * (Node é single-thread; não há corrida real entre workers cooperativos).
   */
  static async executarComConcorrenciaLimitada<T>(
    itens: T[],
    concorrencia: number,
    tarefa: (item: T, indice: number) => Promise<void>
  ): Promise<void> {
    let proximoIndice = 0;
    const worker = async () => {
      while (proximoIndice < itens.length) {
        const indice = proximoIndice++;
        await tarefa(itens[indice], indice);
      }
    };
    const workers = Array.from({ length: Math.min(concorrencia, itens.length) }, () => worker());
    await Promise.all(workers);
  }

  /**
   * Processa uma linha de dados até o fim (dedup/criação, geocodificação,
   * vínculo, atribuição de rota) ou registra o erro correspondente em
   * `resultado.erros` — nunca lança, para não derrubar as outras linhas
   * rodando em paralelo. Usa `RotaService.atribuirComContexto` (não
   * `atribuirRota`) para reaproveitar o contexto pré-carregado da
   * importação inteira (campanhas ativas/candidatos/já-atribuídas), em vez
   * de reconsultar isso a cada linha — ver `prepararContextoAtribuicaoLote`.
   */
  private static async processarLinha(
    linha: string[],
    numeroLinha: number,
    cnpjNormalizado: string | null,
    duplicadaNoArquivo: boolean,
    empresaSlug: string,
    idCampanha: number,
    createdBy: number | undefined,
    contexto: Awaited<ReturnType<typeof RotaService.prepararContextoAtribuicaoLote>>,
    resultado: ImportResult
  ): Promise<void> {
    const [nomeOficina, cnpjBruto, cep, endereco, numero, bairro, estado, cidade] = linha;

    if (!cnpjNormalizado) {
      resultado.erros.push({ linha: numeroLinha, cnpj: cnpjBruto, motivo: "CNPJ_INVALIDO" });
      return;
    }

    if (duplicadaNoArquivo) {
      resultado.erros.push({
        linha: numeroLinha,
        cnpj: cnpjBruto,
        motivo: "CNPJ_DUPLICADO_NO_ARQUIVO",
      });
      return;
    }

    const cepLimpo = (cep ?? "").replace(/\D/g, "");
    if (!cepLimpo) {
      resultado.erros.push({ linha: numeroLinha, cnpj: cnpjBruto, motivo: "CEP_INVALIDO" });
      return;
    }

    const linhaOficina: LinhaOficinaImport = {
      nomeOficina,
      cnpj: cnpjBruto,
      cep,
      endereco,
      numero,
      bairro,
      estado,
      cidade,
    };

    try {
      const { ID_OFICINA, criada } = await this.buscarOuCriarOficina(linhaOficina, cnpjNormalizado);

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
        return;
      }

      const statusVinculo = await this.garantirVinculo(ID_OFICINA, empresaSlug, idCampanha, createdBy);
      const atribuicao = await RotaService.atribuirComContexto(
        ID_OFICINA,
        coords.lat,
        coords.lon,
        contexto
      );

      // Contadores só avançam depois que a linha inteira é processada com
      // sucesso — uma falha em garantirVinculo/atribuirComContexto
      // (capturada abaixo) nunca deve contar a mesma linha como sucesso E
      // como erro.
      if (criada) {
        resultado.oficinas_criadas++;
      } else {
        resultado.oficinas_vinculadas_existentes++;
      }
      if (statusVinculo === "ja_vinculada") {
        resultado.ja_na_comunidade++;
      }
      resultado.rotas_criadas += atribuicao.resumo.atribuidas;
    } catch (erro) {
      // Isola falha inesperada (DB, rede) na linha em vez de abortar o
      // arquivo inteiro — mesmo princípio de isolamento por linha já
      // aplicado aos erros de validação/geocodificação acima.
      console.error(`[oficinaImportService] falha ao processar linha ${numeroLinha}`, erro);
      resultado.erros.push({
        linha: numeroLinha,
        cnpj: cnpjBruto,
        motivo: "ERRO_PROCESSAMENTO",
      });
    }
  }

  /**
   * Orquestra o fluxo completo: resolve `EMPRESA_SLUG` a partir da campanha,
   * valida a planilha, e processa as linhas isolando erro de linha (não
   * aborta o arquivo). Lança "CAMPANHA_NAO_ENCONTRADA" ou
   * "CAMPANHA_SEM_EMPRESA_SLUG" antes de processar qualquer linha; erros
   * estruturais do arquivo (`HEADER_INVALIDO`, `LIMITE_LINHAS_EXCEDIDO`)
   * também propagam antes de qualquer escrita.
   *
   * As linhas rodam com concorrência limitada (`CONCORRENCIA_IMPORTACAO`) —
   * seguro porque cada linha opera sobre um `ID_OFICINA` próprio (CNPJs
   * duplicados no arquivo já foram descartados antes do loop) e o contexto
   * de atribuição de rota compartilhado (`RotaService.
   * prepararContextoAtribuicaoLote`) só é lido/estendido, nunca
   * sobrescrito, por linha.
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

    // Calculado uma vez para a importação inteira, não por linha — ver
    // Fix Round de performance em tasks.md. O mesmo `empresaSlug` vale para
    // todas as linhas do arquivo.
    const contexto = await RotaService.prepararContextoAtribuicaoLote(empresaSlug);

    await this.executarComConcorrenciaLimitada(
      linhasDeDados,
      CONCORRENCIA_IMPORTACAO,
      async (linha, indice) => {
        const numeroLinha = indice + 2; // linha 1 é o cabeçalho
        await this.processarLinha(
          linha,
          numeroLinha,
          cnpjsNormalizados[indice],
          indicesDuplicados.has(indice),
          empresaSlug,
          idCampanha,
          createdBy,
          contexto,
          resultado
        );
      }
    );

    // As linhas terminam fora de ordem sob concorrência — ordena por linha
    // para a resposta ficar previsível para quem lê `erros` (e para os
    // testes que comparam o array inteiro).
    resultado.erros.sort((a, b) => a.linha - b.linha);

    return resultado;
  }
}

export { CABECALHO_ESPERADO, LIMITE_LINHAS_DE_DADOS };
