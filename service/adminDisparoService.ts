import { AppDataSourceSync } from "../data-source";

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
