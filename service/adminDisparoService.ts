import { AppDataSourceSync } from "../data-source";
import SegmentacaoService from "./segmentacaoService";
import OficinaService, {
  OficinaSegmentada,
  RegiaoResolvida,
  sqlOficinaImportada,
  sqlRecusouNaCampanha,
  sqlUsuariosDaOficina,
  temWhatsappPelosCandidatos,
} from "./oficinaService";
import GeolocationService from "./geolocationService";
import RotaService, { escolherPromotorMaisProximo } from "./rotaService";
import RotaPromotor from "../entities/RotaPromotor";
import { ligacaoCadastroEmpresa } from "../utils/sqlCadastroEmpresa";

/** Tenant do CRM que é a base Oficina Brasil inteira (CONV-08, CONV-12). */
export const TENANT_OFICINA_BRASIL = 15;
/** Teto de contatos varridos no CRM por segmentação (CONV-10). */
export const MAX_CONTATOS_SEGMENTACAO = 5000;
/** Prazo de uma chamada ao CRM antes de virar 502 (CONV-11). */
export const PRAZO_CRM_MS = 60_000;

export const MSG_SEM_REGIAO = "Informe a região (UF e cidade, ou CEP e raio)";
export const MSG_SEM_CRITERIO = "Informe ao menos um critério de segmentação";
export const MSG_SEGMENTACAO_INDISPONIVEL = "Segmentação indisponível";
export const MSG_CEP_NAO_ENCONTRADO = "CEP não encontrado";

export type RegiaoEntrada = { uf: string; cidade: string } | { cep: string; raioKm: number };

export const MSG_JA_EM_ROTA = "Oficina já está em rota nesta campanha";
export const MSG_RECUSOU = "Oficina recusou a visita nesta campanha";
export const MSG_SEM_WHATSAPP = "Oficina sem WhatsApp cadastrado";
export const MSG_VINCULO_OUTRA_CAMPANHA = "Promotor não está vinculado a esta campanha";
export const MSG_ENTRADA_ROTAS = "Informe as atribuições ou as oficinas a distribuir";

export type EntradaCriarRotas =
  | { atribuicoes: { idCampanhaPromotor: number; idOficina: number }[] }
  | { distribuir: true; idOficinas: number[] };

export interface ConflitoRota {
  idOficina: number;
  status: 409 | 422;
  motivo: string;
  promotorAtual?: { ID_CAMPANHA_PROMOTOR: number; NOME: string | null };
}

export interface ResultadoCriarRotas {
  criadas: { ID_ROTA_PROMOTOR: number; ID_CAMPANHA_PROMOTOR: number; ID_OFICINA: number }[];
  conflitos: ConflitoRota[];
  foraDoAlcance: number[];
}

/**
 * Erro de domínio da tela de admin. A rota traduz `status` direto para o HTTP
 * (design, "Error Handling Strategy"); `extra` vai junto no corpo.
 */
export class AdminDisparoErro extends Error {
  constructor(
    public readonly status: 400 | 404 | 409 | 422 | 502,
    message: string,
    public readonly extra?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AdminDisparoErro";
  }
}

export interface CampanhaAdminResumo {
  ID_CAMPANHA: number;
  NOME: string;
  EMPRESA_SLUG: string | null;
  clienteNome: string | null;
  START_TIME: Date;
  END_TIME: Date | null;
  totalPromotores: number;
  totalRotas: number;
}

export interface PromotorVinculado {
  ID_CAMPANHA_PROMOTOR: number;
  ID_PROMOTOR: number;
  NOME: string;
  RAIO: number | null;
  LAT: number | null;
  LNG: number | null;
}

export interface PromotorDoCliente {
  ID_PROMOTOR: number;
  NOME: string;
  LAT: number | null;
  LNG: number | null;
}

interface CampanhaCarregada {
  ID_CAMPANHA: number;
  ID_CLIENT: number | null;
  EMPRESA_SLUG: string | null;
  END_TIME: Date | null;
}

const numeroOuNulo = (v: unknown): number | null => (v == null ? null : Number(v));

const textoPreenchido = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/** Região obrigatória: UF + cidade, ou CEP + raio maior que 0 (CONV-06). */
function validarRegiao(regiao: unknown): RegiaoEntrada {
  const r = (regiao ?? {}) as Record<string, unknown>;
  if (textoPreenchido(r.uf) && textoPreenchido(r.cidade)) {
    return { uf: r.uf, cidade: r.cidade };
  }
  if (
    textoPreenchido(r.cep) &&
    typeof r.raioKm === "number" &&
    Number.isFinite(r.raioKm) &&
    r.raioKm > 0
  ) {
    return { cep: r.cep, raioKm: r.raioKm };
  }
  throw new AdminDisparoErro(400, MSG_SEM_REGIAO);
}

/** Ao menos um critério (CONV-07); DSL presente mas malformada também é 400. */
function validarCriterio(dsl: unknown): Record<string, unknown> {
  if (dsl == null || typeof dsl !== "object" || Array.isArray(dsl) || Object.keys(dsl).length === 0) {
    throw new AdminDisparoErro(400, MSG_SEM_CRITERIO);
  }
  const validacao = SegmentacaoService.validateDsl(dsl as Record<string, unknown>);
  if (!validacao.valid) {
    throw new AdminDisparoErro(400, "Filtro de segmentação inválido.", { details: validacao.errors });
  }
  return dsl as Record<string, unknown>;
}

const idValido = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;

/** Atribuição manual ou distribuição automática, com ids inteiros positivos. */
function validarEntradaRotas(entrada: unknown): EntradaCriarRotas {
  const e = (entrada ?? {}) as Record<string, unknown>;
  if (
    Array.isArray(e.atribuicoes) &&
    e.atribuicoes.length > 0 &&
    e.atribuicoes.every(
      (a) => idValido((a as any)?.idCampanhaPromotor) && idValido((a as any)?.idOficina)
    )
  ) {
    return { atribuicoes: e.atribuicoes as { idCampanhaPromotor: number; idOficina: number }[] };
  }
  if (
    e.distribuir === true &&
    Array.isArray(e.idOficinas) &&
    e.idOficinas.length > 0 &&
    e.idOficinas.every(idValido)
  ) {
    return { distribuir: true, idOficinas: e.idOficinas as number[] };
  }
  throw new AdminDisparoErro(400, MSG_ENTRADA_ROTAS);
}

/** Chamada ao CRM com prazo; falha ou demora viram 502 (CONV-11). */
async function chamarCrm<T>(chamada: () => Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const prazo = new Promise<never>((_, rejeitar) => {
    timer = setTimeout(() => rejeitar(new Error("CRM timeout")), PRAZO_CRM_MS);
  });
  try {
    return await Promise.race([chamada(), prazo]);
  } catch (erro) {
    console.error("[adminDisparo] CRM indisponível", { erro: (erro as Error)?.message });
    throw new AdminDisparoErro(502, MSG_SEGMENTACAO_INDISPONIVEL);
  } finally {
    clearTimeout(timer);
  }
}

export default class AdminDisparoService {
  /**
   * Campanhas ativas de todos os clientes, com o nome do cliente (CONV-01,
   * CONV-02). Ativa = `PUBLICADA`, sem `DELETED_AT` e `agora` dentro do período,
   * com `END_TIME` nulo valendo sem fim. O nome vem de `COMMUNITIES.Nome` pelo
   * `EMPRESA_SLUG`, num LEFT JOIN: sem slug ou sem comunidade fica `null`, e a
   * campanha continua na lista. Uma query só, com os totais em subselects.
   */
  static async listarCampanhasAtivas(agora: Date = new Date()): Promise<CampanhaAdminResumo[]> {
    const linhas: any[] = await AppDataSourceSync.query(
      `SELECT c."ID_CAMPANHA",
              c."NOME",
              c."EMPRESA_SLUG",
              cm."Nome" AS "clienteNome",
              c."START_TIME",
              c."END_TIME",
              (SELECT COUNT(*)::int
                 FROM "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" cp
                WHERE cp."ID_CAMPANHA" = c."ID_CAMPANHA"
                  AND cp."DELETED_AT" IS NULL) AS "totalPromotores",
              (SELECT COUNT(*)::int
                 FROM "CAMPANHAS_OB"."ROTA_PROMOTOR" rp
                 JOIN "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" cp_r
                   ON cp_r."ID_CAMPANHA_PROMOTOR" = rp."ID_CAMPANHA_PROMOTOR"
                WHERE cp_r."ID_CAMPANHA" = c."ID_CAMPANHA"
                  AND cp_r."DELETED_AT" IS NULL
                  AND rp."DELETED_AT" IS NULL) AS "totalRotas"
         FROM "CAMPANHAS_OB"."CAMPANHA" c
         LEFT JOIN LATERAL (
           SELECT com."Nome"
             FROM "OFICINA_PORTAL"."COMMUNITIES" com
            WHERE com."EmpresaSlug" = c."EMPRESA_SLUG"
            LIMIT 1
         ) cm ON TRUE
        WHERE c."STATUS" = 'PUBLICADA'
          AND c."DELETED_AT" IS NULL
          AND c."START_TIME" <= $1
          AND (c."END_TIME" IS NULL OR c."END_TIME" >= $1)
        ORDER BY c."START_TIME" DESC, c."ID_CAMPANHA" DESC`,
      [agora]
    );

    return linhas.map((l) => ({
      ID_CAMPANHA: Number(l.ID_CAMPANHA),
      NOME: l.NOME,
      EMPRESA_SLUG: l.EMPRESA_SLUG ?? null,
      clienteNome: l.clienteNome ?? null,
      START_TIME: l.START_TIME,
      END_TIME: l.END_TIME ?? null,
      totalPromotores: Number(l.totalPromotores ?? 0),
      totalRotas: Number(l.totalRotas ?? 0),
    }));
  }

  /**
   * Promotores vinculados à campanha (com raio e base) e, separados, os do
   * cliente (`PROMOTOR.ID_CLIENT = CAMPANHA.ID_CLIENT`) sem vínculo ativo nela
   * (CONV-13).
   */
  static async listarPromotores(
    idCampanha: number
  ): Promise<{ vinculados: PromotorVinculado[]; doCliente: PromotorDoCliente[] }> {
    await this.carregarCampanha(idCampanha);

    const [vinculados, doCliente]: [any[], any[]] = await Promise.all([
      AppDataSourceSync.query(
        `SELECT cp."ID_CAMPANHA_PROMOTOR", cp."ID_PROMOTOR", p."NOME", cp."RAIO",
                p."LATITUDE" AS "LAT", p."LONGITUDE" AS "LNG"
           FROM "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" cp
           JOIN "CAMPANHAS_OB"."PROMOTOR" p ON p."ID_PROMOTOR" = cp."ID_PROMOTOR"
          WHERE cp."ID_CAMPANHA" = $1
            AND cp."DELETED_AT" IS NULL
            AND p."DELETED_AT" IS NULL
          ORDER BY p."NOME", cp."ID_CAMPANHA_PROMOTOR"`,
        [idCampanha]
      ),
      AppDataSourceSync.query(
        `SELECT p."ID_PROMOTOR", p."NOME", p."LATITUDE" AS "LAT", p."LONGITUDE" AS "LNG"
           FROM "CAMPANHAS_OB"."CAMPANHA" c
           JOIN "CAMPANHAS_OB"."PROMOTOR" p ON p."ID_CLIENT" = c."ID_CLIENT"
          WHERE c."ID_CAMPANHA" = $1
            AND p."DELETED_AT" IS NULL
            AND NOT EXISTS (
              SELECT 1
                FROM "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" cp
               WHERE cp."ID_PROMOTOR" = p."ID_PROMOTOR"
                 AND cp."ID_CAMPANHA" = c."ID_CAMPANHA"
                 AND cp."DELETED_AT" IS NULL
            )
          ORDER BY p."NOME", p."ID_PROMOTOR"`,
        [idCampanha]
      ),
    ]);

    return {
      vinculados: vinculados.map((l) => ({
        ID_CAMPANHA_PROMOTOR: Number(l.ID_CAMPANHA_PROMOTOR),
        ID_PROMOTOR: Number(l.ID_PROMOTOR),
        NOME: l.NOME,
        RAIO: numeroOuNulo(l.RAIO),
        LAT: numeroOuNulo(l.LAT),
        LNG: numeroOuNulo(l.LNG),
      })),
      doCliente: doCliente.map((l) => ({
        ID_PROMOTOR: Number(l.ID_PROMOTOR),
        NOME: l.NOME,
        LAT: numeroOuNulo(l.LAT),
        LNG: numeroOuNulo(l.LNG),
      })),
    };
  }

  /** Campos e operadores de segmentação do tenant 15, não do tenant da campanha (CONV-12). */
  static async listarCamposSegmentacao(): Promise<Record<string, unknown>> {
    return chamarCrm(() => SegmentacaoService.listFilterOptions(TENANT_OFICINA_BRASIL));
  }

  /** Valores de um campo de critério no tenant 15 (CONV-12). */
  static async listarValoresCampo(path: string): Promise<Array<{ valor: string; contatos: number }>> {
    return SegmentacaoService.valoresDeCampo(TENANT_OFICINA_BRASIL, path);
  }

  /**
   * Oficinas da base Oficina Brasil que atendem aos critérios e estão na região
   * (CONV-06 a CONV-11). Região e critério são validados antes de qualquer
   * chamada ao CRM; o CEP é convertido em coordenadas antes também, para um CEP
   * ruim não gastar a varredura. O CRM roda sempre no tenant 15.
   */
  static async segmentarOficinas(
    idCampanha: number,
    regiao: unknown,
    dsl: unknown
  ): Promise<{ oficinas: OficinaSegmentada[]; truncado: boolean; total: number }> {
    const entrada = validarRegiao(regiao);
    const filtro = validarCriterio(dsl);
    const campanha = await this.carregarCampanha(idCampanha);

    let resolvida: RegiaoResolvida;
    if ("cep" in entrada) {
      const coords = await new GeolocationService().getLatLongByCep(entrada.cep);
      if (!coords) {
        throw new AdminDisparoErro(400, MSG_CEP_NAO_ENCONTRADO);
      }
      resolvida = { lat: coords.lat, lon: coords.long, raioKm: entrada.raioKm };
    } else {
      resolvida = entrada;
    }

    const contatos = await chamarCrm(() =>
      SegmentacaoService.previewContactsAll(filtro, TENANT_OFICINA_BRASIL, MAX_CONTATOS_SEGMENTACAO)
    );

    const oficinas = await OficinaService.getOficinasBaseSegmentadas(contatos.externalUserIds, resolvida, {
      idCampanha,
      empresaSlug: campanha.EMPRESA_SLUG,
    });

    return { oficinas, truncado: contatos.truncado, total: oficinas.length };
  }

  /**
   * Coloca oficinas em rota pela tela de admin (CONV-14 a CONV-18, CONV-47).
   *
   * - Não exige que a oficina seja membro da comunidade da campanha.
   * - Por oficina: já em rota nesta campanha → 409 com o promotor atual;
   *   recusou convite aqui → 409; sem WhatsApp e não importada → 422. As
   *   demais seguem; os conflitos voltam em `conflitos`.
   * - Vínculo de outra campanha recusa a requisição inteira (400).
   * - `distribuir` usa a regra do auto-assign (`escolherPromotorMaisProximo`);
   *   quem nenhum raio alcança volta em `foraDoAlcance`, sem rota.
   * - Cria com `agendar: false`: nada é enfileirado até o disparo (CONV-15).
   */
  static async criarRotas(
    idCampanha: number,
    entrada: unknown,
    idAdmin?: number
  ): Promise<ResultadoCriarRotas> {
    const pedido = validarEntradaRotas(entrada);
    const campanha = await this.carregarCampanha(idCampanha);

    const vinculos: any[] = await AppDataSourceSync.query(
      `SELECT cp."ID_CAMPANHA_PROMOTOR", cp."RAIO", p."NOME",
              p."LATITUDE" AS "LAT", p."LONGITUDE" AS "LNG"
         FROM "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" cp
         JOIN "CAMPANHAS_OB"."PROMOTOR" p ON p."ID_PROMOTOR" = cp."ID_PROMOTOR"
        WHERE cp."ID_CAMPANHA" = $1
          AND cp."DELETED_AT" IS NULL`,
      [idCampanha]
    );
    const nomePorVinculo = new Map<number, string | null>(
      vinculos.map((v) => [Number(v.ID_CAMPANHA_PROMOTOR), v.NOME ?? null])
    );

    const pares: { idOficina: number; idCampanhaPromotor: number | null }[] =
      "atribuicoes" in pedido
        ? pedido.atribuicoes.map((a) => ({ idOficina: a.idOficina, idCampanhaPromotor: a.idCampanhaPromotor }))
        : pedido.idOficinas.map((idOficina) => ({ idOficina, idCampanhaPromotor: null }));

    for (const par of pares) {
      if (par.idCampanhaPromotor != null && !nomePorVinculo.has(par.idCampanhaPromotor)) {
        throw new AdminDisparoErro(400, MSG_VINCULO_OUTRA_CAMPANHA, {
          idCampanhaPromotor: par.idCampanhaPromotor,
        });
      }
    }

    const situacao = await this.situacaoDasOficinas(
      [...new Set(pares.map((p) => p.idOficina))],
      idCampanha,
      campanha.EMPRESA_SLUG
    );

    const conflitos: ConflitoRota[] = [];
    const foraDoAlcance: number[] = [];
    const porVinculo = new Map<number, number[]>();
    const atribuidaNestePedido = new Map<number, number>();

    const candidatos = vinculos
      .filter((v) => v.LAT != null && v.LNG != null)
      .map((v) => ({
        ID_CAMPANHA_PROMOTOR: Number(v.ID_CAMPANHA_PROMOTOR),
        RAIO: v.RAIO == null ? null : Number(v.RAIO),
        lat: Number(v.LAT),
        lon: Number(v.LNG),
      }));

    for (const par of pares) {
      const s = situacao.get(par.idOficina);
      const repetida = atribuidaNestePedido.get(par.idOficina);
      const idVinculoAtual = s?.idCampanhaPromotorAtual ?? repetida ?? null;

      if (idVinculoAtual != null) {
        conflitos.push({
          idOficina: par.idOficina,
          status: 409,
          motivo: MSG_JA_EM_ROTA,
          promotorAtual: {
            ID_CAMPANHA_PROMOTOR: idVinculoAtual,
            NOME: s?.promotorAtualNome ?? nomePorVinculo.get(idVinculoAtual) ?? null,
          },
        });
        continue;
      }
      if (s?.recusou) {
        conflitos.push({ idOficina: par.idOficina, status: 409, motivo: MSG_RECUSOU });
        continue;
      }
      if (!s?.importada && !s?.temWhatsapp) {
        conflitos.push({ idOficina: par.idOficina, status: 422, motivo: MSG_SEM_WHATSAPP });
        continue;
      }

      let idVinculo = par.idCampanhaPromotor;
      if (idVinculo == null) {
        const escolhido =
          s?.lat != null && s?.lon != null
            ? escolherPromotorMaisProximo({ lat: s.lat, lon: s.lon }, candidatos)
            : null;
        if (!escolhido) {
          foraDoAlcance.push(par.idOficina);
          continue;
        }
        idVinculo = escolhido.ID_CAMPANHA_PROMOTOR;
      }

      atribuidaNestePedido.set(par.idOficina, idVinculo);
      porVinculo.set(idVinculo, [...(porVinculo.get(idVinculo) ?? []), par.idOficina]);
    }

    const criadas: ResultadoCriarRotas["criadas"] = [];
    for (const [idVinculo, idsOficina] of porVinculo) {
      const rotas = (await RotaService.createRotas(idVinculo, idsOficina, idAdmin, {
        agendar: false,
      })) as RotaPromotor[];
      for (const rota of rotas) {
        criadas.push({
          ID_ROTA_PROMOTOR: Number(rota.ID_ROTA_PROMOTOR),
          ID_CAMPANHA_PROMOTOR: idVinculo,
          ID_OFICINA: Number(rota.ID_OFICINA),
        });
      }
    }

    return { criadas, conflitos, foraDoAlcance };
  }

  /**
   * Situação de cada oficina nesta campanha numa query só: rota ativa e seu
   * promotor, recusa, importada para o slug, candidatos de telefone e
   * coordenadas (dw.cadastro_empresa, ou a OFICINA para importada sem dw).
   */
  private static async situacaoDasOficinas(
    idsOficina: number[],
    idCampanha: number,
    empresaSlug: string | null
  ): Promise<
    Map<
      number,
      {
        idCampanhaPromotorAtual: number | null;
        promotorAtualNome: string | null;
        recusou: boolean;
        importada: boolean;
        temWhatsapp: boolean;
        lat: number | null;
        lon: number | null;
      }
    >
  > {
    const linhas: any[] = await AppDataSourceSync.query(
      `SELECT ids.id_oficina AS "ID_OFICINA",
              rota."ID_CAMPANHA_PROMOTOR" AS "ROTA_ID_CAMPANHA_PROMOTOR",
              rota."PROMOTOR_NOME" AS "ROTA_PROMOTOR_NOME",
              ${sqlRecusouNaCampanha("ids.id_oficina", "$1")} AS "RECUSOU_NESTA_CAMPANHA",
              ${sqlOficinaImportada("ids.id_oficina", "$2")} AS "IMPORTADA",
              ${sqlUsuariosDaOficina("ids.id_oficina")} AS "USUARIOS",
              o."TELEFONE" AS "OFICINA_TELEFONE",
              ce.telefone AS "CADASTRO_TELEFONE",
              COALESCE(ce.latitude, o."LATITUDE") AS "LATITUDE",
              COALESCE(ce.longitude, o."LONGITUDE") AS "LONGITUDE"
         FROM unnest($3::int[]) AS ids(id_oficina)
         LEFT JOIN "MAIN_REGISTER"."OFICINA" o
           ON o."ID_OFICINA" = ids.id_oficina${ligacaoCadastroEmpresa("o", "ids.id_oficina")}
         LEFT JOIN LATERAL (
           SELECT rp."ID_CAMPANHA_PROMOTOR", p."NOME" AS "PROMOTOR_NOME"
             FROM "CAMPANHAS_OB"."ROTA_PROMOTOR" rp
             JOIN "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" cp
               ON cp."ID_CAMPANHA_PROMOTOR" = rp."ID_CAMPANHA_PROMOTOR"
             LEFT JOIN "CAMPANHAS_OB"."PROMOTOR" p ON p."ID_PROMOTOR" = cp."ID_PROMOTOR"
            WHERE rp."ID_OFICINA" = ids.id_oficina
              AND cp."ID_CAMPANHA" = $1
              AND rp."DELETED_AT" IS NULL
              AND cp."DELETED_AT" IS NULL
            ORDER BY rp."ID_ROTA_PROMOTOR" DESC
            LIMIT 1
         ) rota ON TRUE`,
      [idCampanha, empresaSlug, idsOficina]
    );

    return new Map(
      linhas.map((l) => [
        Number(l.ID_OFICINA),
        {
          idCampanhaPromotorAtual: numeroOuNulo(l.ROTA_ID_CAMPANHA_PROMOTOR),
          promotorAtualNome: l.ROTA_PROMOTOR_NOME ?? null,
          recusou: l.RECUSOU_NESTA_CAMPANHA === true,
          importada: l.IMPORTADA === true,
          temWhatsapp: temWhatsappPelosCandidatos(l),
          lat: numeroOuNulo(l.LATITUDE),
          lon: numeroOuNulo(l.LONGITUDE),
        },
      ])
    );
  }

  /** Campanha não excluída, ou 404. */
  protected static async carregarCampanha(idCampanha: number): Promise<CampanhaCarregada> {
    const linhas: any[] = await AppDataSourceSync.query(
      `SELECT c."ID_CAMPANHA", c."ID_CLIENT", c."EMPRESA_SLUG", c."END_TIME"
         FROM "CAMPANHAS_OB"."CAMPANHA" c
        WHERE c."ID_CAMPANHA" = $1
          AND c."DELETED_AT" IS NULL
        LIMIT 1`,
      [idCampanha]
    );
    const c = linhas?.[0];
    if (!c) {
      throw new AdminDisparoErro(404, "Campanha não encontrada");
    }
    return {
      ID_CAMPANHA: Number(c.ID_CAMPANHA),
      ID_CLIENT: numeroOuNulo(c.ID_CLIENT),
      EMPRESA_SLUG: c.EMPRESA_SLUG ?? null,
      END_TIME: c.END_TIME ?? null,
    };
  }
}
