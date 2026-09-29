import { AppDataSourceSync } from "../data-source";
import OficinaService, {
  OficinaBuscada,
  sqlOficinaImportada,
  sqlRecusouNaCampanha,
  sqlUsuariosDaOficina,
  temWhatsappPelosCandidatos,
} from "./oficinaService";
import RotaService, { escolherPromotorMaisProximo } from "./rotaService";
import RotaPromotor, { StatusRota } from "../entities/RotaPromotor";
import { ligacaoCadastroEmpresa } from "../utils/sqlCadastroEmpresa";
import NotificacaoVisita, { CanalNotificacao, StatusNotificacaoVisita } from "../entities/NotificacaoVisita";
import { planejarDisparo, tetoMinimo, TETO_DIARIO_MAXIMO } from "../utils/agendamento";
import { estadoConvite, EstadoConvite } from "../utils/statusNotificacaoVisita";
import { AdminDisparoErro } from "../utils/adminDisparoErro";
import { MSG_UF_INVALIDA, validarFiltrosBusca } from "../utils/filtroBuscaOficina";

export { AdminDisparoErro };

/** Falha de consulta na busca de oficinas (CONV-11). */
export const MSG_BUSCA_INDISPONIVEL = "Não foi possível buscar as oficinas";

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

export const MSG_TETO_INVALIDO = "Teto diário deve ser um inteiro entre 1 e 1000";
export const MSG_ROTAS_DISPARO = "Informe as rotas a disparar";
export const MSG_PASSA_DO_FIM = "O último envio cairia depois do fim da campanha";

/** Prévia do disparo (CONV-19): nada é escrito. */
export interface PreviaDisparo {
  totalConvites: number;
  jaDisparadas: number;
  porDia: { data: string; quantidade: number }[];
  ultimoDia: string | null;
}

/** Resumo do disparo (CONV-23); `enfileiradas` são as linhas inseridas de fato. */
export interface ResumoDisparo {
  enfileiradas: number;
  jaDisparadas: number;
  porDia: { data: string; quantidade: number }[];
  ultimoDia: string | null;
}

/** Todos os estados do painel, na ordem em que a tela os mostra (CONV-41). */
export const ESTADOS_CONVITE: readonly EstadoConvite[] = [
  "nao_disparada",
  "agendada",
  "enviada",
  "aceita",
  "aceita_confirmacao_recente",
  "aceita_convite_vinculado",
  "aceita_importada",
  "recusada",
  "expirada",
  "falhou",
  "dispensada",
  "aguardando",
];
export const MSG_ESTADO_INVALIDO = "Estado de convite inválido";

export interface RotaComEstado {
  ID_ROTA_PROMOTOR: number;
  ID_CAMPANHA_PROMOTOR: number;
  ID_OFICINA: number;
  STATUS_ROTA: string | null;
  oficinaNome: string | null;
  promotorNome: string | null;
  estado: EstadoConvite;
  agendadaPara: Date | null;
  enviadoEm: Date | null;
  confirmadoEm: Date | null;
  recusadoEm: Date | null;
}

export interface ResultadoCriarRotas {
  criadas: { ID_ROTA_PROMOTOR: number; ID_CAMPANHA_PROMOTOR: number; ID_OFICINA: number }[];
  conflitos: ConflitoRota[];
  foraDoAlcance: number[];
  /** Na distribuição automática, oficinas sem coordenadas: ficam sem rota (CONV-48). */
  semCoordenadas: number[];
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

/** Coordenada numérica, ou `null` para ausente, vazia ou não numérica. */
const coordenadaOuNula = (v: unknown): number | null => {
  if (v == null || (typeof v === "string" && v.trim() === "")) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

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
                  AND rp."DELETED_AT" IS NULL
                  AND rp."STATUS" IS DISTINCT FROM '${StatusRota.CANCELADO}') AS "totalRotas"
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

  /** Linhas de atividade e UFs existentes na base (CONV-12). */
  static async listarFiltrosBusca(): Promise<{ linhas: string[]; ufs: string[] }> {
    return OficinaService.opcoesFiltroBusca();
  }

  /** Cidades da UF (CONV-12); UF ausente ou sem 2 letras é 400. */
  static async listarCidades(uf: unknown): Promise<{ cidades: string[] }> {
    const filtros = validarFiltrosBusca({ uf });
    if (!filtros.uf) {
      throw new AdminDisparoErro(400, MSG_UF_INVALIDA);
    }
    return { cidades: await OficinaService.cidadesPorUf(filtros.uf) };
  }

  /**
   * Oficinas da base Oficina Brasil pelos filtros opcionais (CONV-06 a
   * CONV-11). Os filtros são validados antes de qualquer consulta; não há CRM
   * nem geocodificação. Falha da consulta vira 500 com a mensagem da spec.
   */
  static async buscarOficinas(
    idCampanha: number,
    entrada: unknown
  ): Promise<{ oficinas: OficinaBuscada[]; truncado: boolean; total: number }> {
    const filtros = validarFiltrosBusca(entrada);
    const campanha = await this.carregarCampanha(idCampanha);

    try {
      const { oficinas, truncado } = await OficinaService.buscarOficinasBase(filtros, {
        idCampanha,
        empresaSlug: campanha.EMPRESA_SLUG,
      });
      return { oficinas, truncado, total: oficinas.length };
    } catch (erro) {
      console.error("[adminDisparo] busca de oficinas falhou", { erro: (erro as Error)?.message });
      throw new AdminDisparoErro(500, MSG_BUSCA_INDISPONIVEL);
    }
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
   *   quem nenhum raio alcança volta em `foraDoAlcance`, sem rota; quem não
   *   tem coordenadas volta em `semCoordenadas`, também sem rota (CONV-48). A
   *   atribuição manual não depende de coordenadas.
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
    const semCoordenadas: number[] = [];
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
        if (s?.lat == null || s?.lon == null) {
          semCoordenadas.push(par.idOficina);
          continue;
        }
        const escolhido = escolherPromotorMaisProximo({ lat: s.lat, lon: s.lon }, candidatos);
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

    return { criadas, conflitos, foraDoAlcance, semCoordenadas };
  }

  /**
   * Situação de cada oficina nesta campanha numa query só: rota ativa (sem
   * `DELETED_AT` e não `CANCELADO`) e seu promotor, recusa, importada para o slug, candidatos de telefone e
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
              AND rp."STATUS" IS DISTINCT FROM '${StatusRota.CANCELADO}'
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
          lat: coordenadaOuNula(l.LATITUDE),
          lon: coordenadaOuNula(l.LONGITUDE),
        },
      ])
    );
  }

  /** Prévia do disparo: valida, separa as já disparadas e planeja, sem escrever (CONV-19). */
  static async previaDisparo(
    idCampanha: number,
    rotaIds: unknown,
    teto: unknown,
    agora: Date = new Date()
  ): Promise<PreviaDisparo> {
    const plano = await this.planejar(idCampanha, rotaIds, teto, agora);
    return {
      totalConvites: plano.pendentes.length,
      jaDisparadas: plano.jaDisparadas,
      porDia: plano.porDia,
      ultimoDia: plano.ultimoDia,
    };
  }

  /**
   * Enfileira um convite por rota ainda não disparada, no máximo `teto` por dia
   * a partir da janela de amanhã (CONV-20 a CONV-24).
   *
   * O insert é o mesmo `ON CONFLICT DO NOTHING` de `agendarVisitasEmLote`
   * sobre `UNIQUE(ID_ROTA_PROMOTOR)`: um disparo concorrente só tira linhas de
   * um dia, nunca soma. As rotas que perderam a corrida contam como já
   * disparadas, e `porDia` sai das linhas que entraram.
   */
  static async disparar(
    idCampanha: number,
    rotaIds: unknown,
    teto: unknown,
    agora: Date = new Date()
  ): Promise<ResumoDisparo> {
    const plano = await this.planejar(idCampanha, rotaIds, teto, agora);

    const inseridas = new Set<number>();
    const LOTE = 1000;
    for (let i = 0; i < plano.pendentes.length; i += LOTE) {
      const linhas = plano.pendentes.slice(i, i + LOTE).map((idRota, j) => ({
        ID_ROTA_PROMOTOR: idRota,
        CANAL: CanalNotificacao.WHATSAPP,
        STATUS: StatusNotificacaoVisita.PENDENTE,
        AVAILABLE_AT: plano.slots[i + j],
        ATTEMPTS: 0,
      }));

      const resultado = await AppDataSourceSync.getRepository(NotificacaoVisita)
        .createQueryBuilder()
        .insert()
        .into(NotificacaoVisita)
        .values(linhas)
        .orIgnore()
        .returning(["ID_NOTIFICACAO_VISITA", "ID_ROTA_PROMOTOR"])
        .execute();

      for (const linha of (resultado.raw ?? []) as { ID_ROTA_PROMOTOR: number | string }[]) {
        inseridas.add(Number(linha.ID_ROTA_PROMOTOR));
      }
    }

    const porDia = new Map<string, number>();
    plano.pendentes.forEach((idRota, i) => {
      if (!inseridas.has(idRota)) return;
      const data = plano.porDia[Math.floor(i / plano.teto)].data;
      porDia.set(data, (porDia.get(data) ?? 0) + 1);
    });
    const dias = [...porDia].map(([data, quantidade]) => ({ data, quantidade }));

    console.log("[adminDisparo] disparo enfileirado", {
      ID_CAMPANHA: idCampanha,
      enfileiradas: inseridas.size,
      teto: plano.teto,
    });

    return {
      enfileiradas: inseridas.size,
      jaDisparadas: plano.jaDisparadas + (plano.pendentes.length - inseridas.size),
      porDia: dias,
      ultimoDia: dias.length > 0 ? dias[dias.length - 1].data : null,
    };
  }

  /**
   * Passos comuns à prévia e ao disparo: teto de 1 a 1000 (400), rotas desta
   * campanha em `BACKLOG`, separação das que já têm notificação e o plano. Se
   * o último envio passar do `END_TIME`, 422 com o teto mínimo que cabe.
   */
  private static async planejar(idCampanha: number, rotaIds: unknown, teto: unknown, agora: Date) {
    if (!Number.isInteger(teto) || (teto as number) < 1 || (teto as number) > TETO_DIARIO_MAXIMO) {
      throw new AdminDisparoErro(400, MSG_TETO_INVALIDO);
    }
    if (!Array.isArray(rotaIds) || rotaIds.length === 0 || !rotaIds.every(idValido)) {
      throw new AdminDisparoErro(400, MSG_ROTAS_DISPARO);
    }
    const tetoDiario = teto as number;
    const campanha = await this.carregarCampanha(idCampanha);

    const rotas: { ID_ROTA_PROMOTOR: number | string; ID_NOTIFICACAO_VISITA: number | string | null }[] =
      await AppDataSourceSync.query(
        `SELECT rp."ID_ROTA_PROMOTOR", nv."ID_NOTIFICACAO_VISITA"
           FROM "CAMPANHAS_OB"."ROTA_PROMOTOR" rp
           JOIN "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" cp
             ON cp."ID_CAMPANHA_PROMOTOR" = rp."ID_CAMPANHA_PROMOTOR"
           LEFT JOIN "CAMPANHAS_OB"."NOTIFICACAO_VISITA" nv
             ON nv."ID_ROTA_PROMOTOR" = rp."ID_ROTA_PROMOTOR"
          WHERE rp."ID_ROTA_PROMOTOR" = ANY($2::int[])
            AND cp."ID_CAMPANHA" = $1
            AND rp."DELETED_AT" IS NULL
            AND cp."DELETED_AT" IS NULL
            AND COALESCE(rp."STATUS", 'BACKLOG') = 'BACKLOG'
          ORDER BY rp."ID_ROTA_PROMOTOR"`,
        [idCampanha, [...new Set(rotaIds as number[])]]
      );

    const pendentes = rotas
      .filter((r) => r.ID_NOTIFICACAO_VISITA == null)
      .map((r) => Number(r.ID_ROTA_PROMOTOR));
    const jaDisparadas = rotas.length - pendentes.length;

    const plano = planejarDisparo(agora, pendentes.length, tetoDiario);
    const ultimoSlot = plano.slots[plano.slots.length - 1];
    if (campanha.END_TIME && ultimoSlot && ultimoSlot.getTime() > new Date(campanha.END_TIME).getTime()) {
      throw new AdminDisparoErro(422, MSG_PASSA_DO_FIM, {
        tetoMinimo: tetoMinimo(agora, pendentes.length, new Date(campanha.END_TIME)),
      });
    }

    return { ...plano, pendentes, jaDisparadas, teto: tetoDiario };
  }

  /**
   * Rotas da campanha com o estado do convite (CONV-41), sem as `CANCELADO`, filtradas por
   * `estado` quando informado (CONV-42). `totaisPorEstado` conta sempre todas
   * as rotas, com todos os estados presentes (zero incluso), para a tela
   * mostrar os totais com qualquer filtro.
   */
  static async listarRotasComEstado(
    idCampanha: number,
    estado?: string,
    agora: Date = new Date()
  ): Promise<{ rotas: RotaComEstado[]; totaisPorEstado: Record<EstadoConvite, number> }> {
    if (estado !== undefined && !(ESTADOS_CONVITE as readonly string[]).includes(estado)) {
      throw new AdminDisparoErro(400, MSG_ESTADO_INVALIDO, { estados: ESTADOS_CONVITE });
    }
    await this.carregarCampanha(idCampanha);

    const linhas: any[] = await AppDataSourceSync.query(
      `SELECT rp."ID_ROTA_PROMOTOR", rp."ID_CAMPANHA_PROMOTOR", rp."ID_OFICINA",
              rp."STATUS" AS "STATUS_ROTA",
              o."NOME_FANTASIA" AS "oficinaNome",
              p."NOME" AS "promotorNome",
              nv."STATUS" AS "NV_STATUS",
              nv."EXPIRA_EM" AS "NV_EXPIRA_EM",
              nv."ORIGEM_ACEITE" AS "NV_ORIGEM_ACEITE",
              nv."AVAILABLE_AT" AS "NV_AVAILABLE_AT",
              nv."ENVIADO_EM" AS "NV_ENVIADO_EM",
              nv."CONFIRMADO_EM" AS "NV_CONFIRMADO_EM",
              nv."RECUSADO_EM" AS "NV_RECUSADO_EM"
         FROM "CAMPANHAS_OB"."ROTA_PROMOTOR" rp
         JOIN "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" cp
           ON cp."ID_CAMPANHA_PROMOTOR" = rp."ID_CAMPANHA_PROMOTOR"
         LEFT JOIN "CAMPANHAS_OB"."PROMOTOR" p ON p."ID_PROMOTOR" = cp."ID_PROMOTOR"
         LEFT JOIN "MAIN_REGISTER"."OFICINA" o ON o."ID_OFICINA" = rp."ID_OFICINA"
         LEFT JOIN "CAMPANHAS_OB"."NOTIFICACAO_VISITA" nv
           ON nv."ID_ROTA_PROMOTOR" = rp."ID_ROTA_PROMOTOR"
        WHERE cp."ID_CAMPANHA" = $1
          AND rp."DELETED_AT" IS NULL
          AND cp."DELETED_AT" IS NULL
          AND rp."STATUS" IS DISTINCT FROM '${StatusRota.CANCELADO}'
        ORDER BY rp."ID_ROTA_PROMOTOR"`,
      [idCampanha]
    );

    const totaisPorEstado = Object.fromEntries(ESTADOS_CONVITE.map((e) => [e, 0])) as Record<
      EstadoConvite,
      number
    >;

    const todas: RotaComEstado[] = linhas.map((l) => {
      const estadoRota = estadoConvite(
        l.NV_STATUS == null
          ? null
          : {
              STATUS: l.NV_STATUS,
              EXPIRA_EM: l.NV_EXPIRA_EM == null ? null : new Date(l.NV_EXPIRA_EM),
              ORIGEM_ACEITE: l.NV_ORIGEM_ACEITE ?? null,
            },
        agora
      );
      totaisPorEstado[estadoRota] += 1;
      return {
        ID_ROTA_PROMOTOR: Number(l.ID_ROTA_PROMOTOR),
        ID_CAMPANHA_PROMOTOR: Number(l.ID_CAMPANHA_PROMOTOR),
        ID_OFICINA: Number(l.ID_OFICINA),
        STATUS_ROTA: l.STATUS_ROTA ?? null,
        oficinaNome: l.oficinaNome ?? null,
        promotorNome: l.promotorNome ?? null,
        estado: estadoRota,
        agendadaPara: estadoRota === "agendada" ? l.NV_AVAILABLE_AT ?? null : null,
        enviadoEm: l.NV_ENVIADO_EM ?? null,
        confirmadoEm: l.NV_CONFIRMADO_EM ?? null,
        recusadoEm: l.NV_RECUSADO_EM ?? null,
      };
    });

    return {
      rotas: estado === undefined ? todas : todas.filter((r) => r.estado === estado),
      totaisPorEstado,
    };
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
