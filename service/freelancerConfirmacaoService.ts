import { EntityManager } from "typeorm";
import { AppDataSourceSync } from "../data-source";
import { OrigemAceite, StatusNotificacaoVisita } from "../entities/NotificacaoVisita";
import type { ConfirmarOficinaInput } from "../schemas/freelancerConfirmacao";
import {
  escaparLike,
  mesmasLinhas,
  normalizarBusca,
  qtdElevadoresParaInteiro,
  soDigitos,
} from "../utils/freelancerConfirmacao";

/** Erro de domínio: o `status` vira o status HTTP e a `message` o corpo. */
export class FreelancerConfirmacaoErro extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "FreelancerConfirmacaoErro";
  }
}

const ACENTOS = "'áàâãäéèêëíìîïóòôõöúùûüçñ'";
const SEM_ACENTOS = "'aaaaaeeeeiiiiooooouuuucn'";

/**
 * Rota viva (sem DELETED_AT, fora de FINALIZADO/CANCELADO) cuja notificação não
 * existe ou não está CONFIRMADO. NOTIFICACAO_VISITA é UNIQUE por rota, então o
 * LEFT JOIN é 1:1. `rp` e `nv` são os aliases esperados pelo chamador.
 */
const ROTA_PENDENTE = `
  rp."DELETED_AT" IS NULL
  AND (rp."STATUS" IS NULL OR rp."STATUS"::text NOT IN ('FINALIZADO', 'CANCELADO'))
  AND (nv."ID_NOTIFICACAO_VISITA" IS NULL OR nv."STATUS" <> '${StatusNotificacaoVisita.CONFIRMADO}')`;

const JOIN_NOTIFICACAO = `LEFT JOIN "CAMPANHAS_OB"."NOTIFICACAO_VISITA" nv ON nv."ID_ROTA_PROMOTOR" = rp."ID_ROTA_PROMOTOR"`;

/** EXISTS de rota pendente para a oficina referenciada por `coluna`. */
const oficinaPendente = (coluna: string) => `EXISTS (
  SELECT 1 FROM "CAMPANHAS_OB"."ROTA_PROMOTOR" rp
  ${JOIN_NOTIFICACAO}
  WHERE rp."ID_OFICINA" = ${coluna} AND ${ROTA_PENDENTE})`;

const TELEFONE_USUARIO = `COALESCE(NULLIF(btrim(u."CELULAR"), ''), u."TELEFONE")`;

export default class FreelancerConfirmacaoService {
  static async listarOficinas(params: { page: number; limit: number; search?: string }) {
    const { page, limit } = params;
    const valores: unknown[] = [];
    const condicoes: string[] = [];
    const search = params.search?.trim() ?? "";

    if (search !== "") {
      const ou: string[] = [];
      valores.push(`%${escaparLike(normalizarBusca(search))}%`);
      ou.push(
        `translate(lower(o."NOME_FANTASIA"), ${ACENTOS}, ${SEM_ACENTOS}) LIKE $${valores.length} ESCAPE '\\'`
      );

      // Busca só de dígitos e pontuação de CNPJ também casa pelo CNPJ.
      const digitos = soDigitos(search);
      if (digitos !== "" && /^[\d.\-/\s]+$/.test(search)) {
        valores.push(`%${digitos}%`);
        ou.push(`regexp_replace(COALESCE(o."CNPJ", ''), '\\D', '', 'g') LIKE $${valores.length}`);
      }
      condicoes.push(`(${ou.join(" OR ")})`);
    }

    valores.push(limit, (page - 1) * limit);
    const pLimit = valores.length - 1;
    const pOffset = valores.length;

    const sql = `
      WITH filtrada AS (
        SELECT o."ID_OFICINA", o."NOME_FANTASIA", o."CNPJ", o."CIDADE", o."ESTADO"
          FROM "MAIN_REGISTER"."OFICINA" o
         WHERE ${oficinaPendente('o."ID_OFICINA"')}
           ${condicoes.length ? `AND ${condicoes.join(" AND ")}` : ""}
      ), total AS (
        SELECT count(*)::int AS total FROM filtrada
      )
      SELECT t.total, p."ID_OFICINA", p."NOME_FANTASIA", p."CNPJ", p."CIDADE", p."ESTADO"
        FROM total t
        LEFT JOIN (
          SELECT * FROM filtrada
           ORDER BY "NOME_FANTASIA", "ID_OFICINA"
           LIMIT $${pLimit} OFFSET $${pOffset}
        ) p ON TRUE
       ORDER BY p."NOME_FANTASIA", p."ID_OFICINA"`;

    const linhas: any[] = await AppDataSourceSync.query(sql, valores);
    const total = linhas.length > 0 ? Number(linhas[0].total) : 0;

    return {
      data: linhas
        .filter((l) => l.ID_OFICINA !== null && l.ID_OFICINA !== undefined)
        .map((l) => ({
          ID_OFICINA: l.ID_OFICINA,
          NOME_FANTASIA: l.NOME_FANTASIA,
          CNPJ: l.CNPJ,
          CIDADE: l.CIDADE,
          ESTADO: l.ESTADO,
        })),
      total,
    };
  }

  static async detalharOficina(idOficina: number) {
    const [oficinas, linhas, usuarios]: [any[], any[], any[]] = await Promise.all([
      AppDataSourceSync.query(
        `SELECT o."NOME_FANTASIA", o."TELEFONE", o."CNPJ", o."CEP", o."ENDERECO", o."NUMERO",
                o."COMPLEMENTO", o."BAIRRO", o."CIDADE", o."ESTADO",
                o."RAMO_ATIVIDADE" AS "ID_RAMO_ATIVIDADE", o."QUANTIDADE_ELEVADOR"
           FROM "MAIN_REGISTER"."OFICINA" o
          WHERE o."ID_OFICINA" = $1 AND ${oficinaPendente('o."ID_OFICINA"')}`,
        [idOficina]
      ),
      AppDataSourceSync.query(
        `SELECT la."LINHA_ATIVIDADE"
           FROM "MAIN_REGISTER"."LINHA_ATIVIDADE" la
          WHERE la."ID_OFICINA" = $1
          ORDER BY la."ID_LINHA_ATIVIDADE"`,
        [idOficina]
      ),
      AppDataSourceSync.query(
        `SELECT u."ID_USUARIO", u."NOME", ${TELEFONE_USUARIO} AS "TELEFONE"
           FROM "MAIN_REGISTER"."USUARIO" u
          WHERE u."ID_OFICINA" = $1 AND COALESCE(u."EXCLUIDO", 'N') <> 'S'
          ORDER BY u."NOME", u."ID_USUARIO"`,
        [idOficina]
      ),
    ]);

    if (oficinas.length === 0) {
      throw new FreelancerConfirmacaoErro(404, "Oficina não encontrada ou sem confirmação pendente.");
    }

    const { QUANTIDADE_ELEVADOR, ...oficina } = oficinas[0];

    return {
      oficina: {
        ...oficina,
        LINHA_ATIVIDADE: linhas.map((l) => l.LINHA_ATIVIDADE as string),
        QTD_ELEVADORES: qtdElevadoresParaInteiro(QUANTIDADE_ELEVADOR),
      },
      usuarios: usuarios.map((u) => ({ ID_USUARIO: u.ID_USUARIO, NOME: u.NOME, TELEFONE: u.TELEFONE })),
    };
  }

  static async obterUsuario(idUsuario: number) {
    const linhas: any[] = await AppDataSourceSync.query(
      `SELECT u."ID_USUARIO", u."NOME", u."EMAIL", ${TELEFONE_USUARIO} AS "TELEFONE", u."CARGO" AS "ID_CARGO"
         FROM "MAIN_REGISTER"."USUARIO" u
        WHERE u."ID_USUARIO" = $1
          AND COALESCE(u."EXCLUIDO", 'N') <> 'S'
          AND ${oficinaPendente('u."ID_OFICINA"')}`,
      [idUsuario]
    );

    if (linhas.length === 0) {
      throw new FreelancerConfirmacaoErro(404, "Usuário não encontrado ou sem confirmação pendente.");
    }

    return { usuario: linhas[0] };
  }

  /**
   * Confirma os dados da oficina e todas as suas rotas pendentes numa
   * transação. O lock da linha da oficina serializa confirmações simultâneas:
   * a segunda espera, relê as rotas já CONFIRMADO e recebe 409.
   */
  static async confirmar(idOficina: number, input: ConfirmarOficinaInput, idFreelancer: number) {
    const { OFICINA, USUARIO } = input;

    const rotasConfirmadas = await AppDataSourceSync.transaction(async (manager: EntityManager) => {
      const oficinas: any[] = await manager.query(
        `SELECT "ID_OFICINA" FROM "MAIN_REGISTER"."OFICINA" WHERE "ID_OFICINA" = $1 FOR UPDATE`,
        [idOficina]
      );
      if (oficinas.length === 0) {
        throw new FreelancerConfirmacaoErro(404, "Oficina não encontrada.");
      }

      const pendentes: any[] = await manager.query(
        `SELECT rp."ID_ROTA_PROMOTOR"
           FROM "CAMPANHAS_OB"."ROTA_PROMOTOR" rp
           ${JOIN_NOTIFICACAO}
          WHERE rp."ID_OFICINA" = $1 AND ${ROTA_PENDENTE}
          ORDER BY rp."ID_ROTA_PROMOTOR"
            FOR UPDATE OF rp`,
        [idOficina]
      );
      if (pendentes.length === 0) {
        throw new FreelancerConfirmacaoErro(409, "Esta oficina já foi confirmada ou não tem rota pendente.");
      }

      if (USUARIO) {
        const pertence: any[] = await manager.query(
          `SELECT 1 FROM "MAIN_REGISTER"."USUARIO"
            WHERE "ID_USUARIO" = $1 AND "ID_OFICINA" = $2 AND COALESCE("EXCLUIDO", 'N') <> 'S'
              FOR UPDATE`,
          [USUARIO.ID_USUARIO, idOficina]
        );
        if (pertence.length === 0) {
          throw new FreelancerConfirmacaoErro(422, "O usuário informado não pertence a esta oficina.");
        }

        const emailEmUso: any[] = await manager.query(
          `SELECT 1 FROM "MAIN_REGISTER"."USUARIO"
            WHERE lower("EMAIL") = lower($1) AND "ID_USUARIO" <> $2 AND COALESCE("EXCLUIDO", 'N') <> 'S'
            LIMIT 1`,
          [USUARIO.EMAIL, USUARIO.ID_USUARIO]
        );
        if (emailEmUso.length > 0) {
          throw new FreelancerConfirmacaoErro(409, "Este e-mail já está em uso por outro usuário.");
        }
      }

      const cnpjEmUso: any[] = await manager.query(
        `SELECT 1 FROM "MAIN_REGISTER"."OFICINA"
          WHERE regexp_replace(COALESCE("CNPJ", ''), '\\D', '', 'g') = $1 AND "ID_OFICINA" <> $2
          LIMIT 1`,
        [OFICINA.CNPJ, idOficina]
      );
      if (cnpjEmUso.length > 0) {
        throw new FreelancerConfirmacaoErro(409, "Este CNPJ já pertence a outra oficina.");
      }

      try {
        await manager.query(
          `UPDATE "MAIN_REGISTER"."OFICINA"
              SET "CNPJ" = $2, "CEP" = $3, "ENDERECO" = $4, "NUMERO" = $5, "COMPLEMENTO" = $6,
                  "BAIRRO" = $7, "CIDADE" = $8, "ESTADO" = $9, "RAMO_ATIVIDADE" = $10,
                  "QUANTIDADE_ELEVADOR" = $11, "DATA_ATUALIZACAO_ENDERECO" = now(), "DATA_ALTERACAO" = now()
            WHERE "ID_OFICINA" = $1`,
          [
            idOficina,
            OFICINA.CNPJ,
            OFICINA.CEP,
            OFICINA.ENDERECO,
            OFICINA.NUMERO,
            OFICINA.COMPLEMENTO,
            OFICINA.BAIRRO,
            OFICINA.CIDADE,
            OFICINA.ESTADO,
            OFICINA.ID_RAMO_ATIVIDADE,
            String(OFICINA.QTD_ELEVADORES),
          ]
        );
      } catch (erro) {
        if ((erro as { code?: string })?.code === "23505") {
          throw new FreelancerConfirmacaoErro(409, "Este CNPJ já pertence a outra oficina.");
        }
        throw erro;
      }

      const atuais: any[] = await manager.query(
        `SELECT "LINHA_ATIVIDADE" FROM "MAIN_REGISTER"."LINHA_ATIVIDADE" WHERE "ID_OFICINA" = $1`,
        [idOficina]
      );
      if (!mesmasLinhas(atuais.map((l) => l.LINHA_ATIVIDADE as string), OFICINA.LINHA_ATIVIDADE)) {
        await manager.query(`DELETE FROM "MAIN_REGISTER"."LINHA_ATIVIDADE" WHERE "ID_OFICINA" = $1`, [idOficina]);
        const novas = Array.from(new Set(OFICINA.LINHA_ATIVIDADE));
        if (novas.length > 0) {
          await manager.query(
            `INSERT INTO "MAIN_REGISTER"."LINHA_ATIVIDADE" ("ID_OFICINA", "LINHA_ATIVIDADE")
             SELECT $1, unnest($2::text[])`,
            [idOficina, novas]
          );
        }
      }

      if (USUARIO) {
        try {
          // O telefone vai para a coluna que a leitura mostra: CELULAR se
          // preenchido, senão TELEFONE.
          await manager.query(
            `UPDATE "MAIN_REGISTER"."USUARIO"
                SET "NOME" = $2, "EMAIL" = $3, "CARGO" = $4,
                    "CELULAR" = CASE WHEN NULLIF(btrim("CELULAR"), '') IS NOT NULL THEN $5 ELSE "CELULAR" END,
                    "TELEFONE" = CASE WHEN NULLIF(btrim("CELULAR"), '') IS NULL THEN $5 ELSE "TELEFONE" END,
                    "DATA_ALTERACAO" = now()
              WHERE "ID_USUARIO" = $1 AND "ID_OFICINA" = $6`,
            [USUARIO.ID_USUARIO, USUARIO.NOME, USUARIO.EMAIL, USUARIO.ID_CARGO, USUARIO.TELEFONE, idOficina]
          );
        } catch (erro) {
          if ((erro as { code?: string })?.code === "23505") {
            throw new FreelancerConfirmacaoErro(409, "Este e-mail já está em uso por outro usuário.");
          }
          throw erro;
        }
      }

      await manager.query(
        `INSERT INTO "CAMPANHAS_OB"."NOTIFICACAO_VISITA" AS nv
           ("ID_ROTA_PROMOTOR", "CANAL", "STATUS", "ORIGEM_ACEITE", "CONFIRMADO_EM", "CONFIRMADO_POR", "UPDATED_AT")
         SELECT unnest($1::int[]), 'WHATSAPP', '${StatusNotificacaoVisita.CONFIRMADO}',
                '${OrigemAceite.FREELANCER}', now(), $2::int, now()
         ON CONFLICT ("ID_ROTA_PROMOTOR") DO UPDATE
            SET "STATUS" = '${StatusNotificacaoVisita.CONFIRMADO}',
                "ORIGEM_ACEITE" = '${OrigemAceite.FREELANCER}',
                "CONFIRMADO_EM" = now(),
                "CONFIRMADO_POR" = EXCLUDED."CONFIRMADO_POR",
                "AVAILABLE_AT" = NULL,
                "LOCKED_AT" = NULL,
                "LOCKED_BY" = NULL,
                "UPDATED_AT" = now()
          WHERE nv."STATUS" <> '${StatusNotificacaoVisita.CONFIRMADO}'`,
        [pendentes.map((p) => p.ID_ROTA_PROMOTOR), idFreelancer]
      );

      return pendentes.length;
    });

    console.info("[freelancerConfirmacao] oficina confirmada", {
      idOficina,
      idFreelancer,
      rotasConfirmadas,
    });

    return { confirmado: true, rotasConfirmadas };
  }
}
