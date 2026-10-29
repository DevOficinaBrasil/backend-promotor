import { AppDataSourceSync } from "../data-source";
import { StatusRota } from "../entities/RotaPromotor";
import {
  agruparPorPromotor,
  calcularAssertividade,
  calcularProximosPassos,
  calcularVisaoGeral,
  listarCancelamentos,
  listarDestaquesDeCampo,
  PeriodoRelatorio,
  RotaPromotorRow,
} from "../utils/promotorReportCalculos";
import { CampanhaBlocoRelatorio, RelatorioPromotorData } from "../types/promotorRelatorio";

interface CampanhaAtivaDoCliente {
  ID_CAMPANHA: number;
  NOME: string;
}

export default class PromotorReportService {
  /**
   * Campanhas ativas de 1 cliente — mesmo critério de
   * `AdminDisparoService.listarCampanhasAtivas` (`service/adminDisparoService.ts:178-208`),
   * restrito a `ID_CLIENT` (espaço de id do SQL Server, mesmo de
   * `Campanha.ID_CLIENT`).
   */
  private static async listarCampanhasAtivasDoCliente(
    idCliente: number,
    agora: Date
  ): Promise<CampanhaAtivaDoCliente[]> {
    const linhas: any[] = await AppDataSourceSync.query(
      `SELECT c."ID_CAMPANHA", c."NOME"
         FROM "CAMPANHAS_OB"."CAMPANHA" c
        WHERE c."STATUS" = 'PUBLICADA'
          AND c."DELETED_AT" IS NULL
          AND c."ID_CLIENT" = $1
          AND c."START_TIME" <= $2
          AND (c."END_TIME" IS NULL OR c."END_TIME" >= $2)
        ORDER BY c."START_TIME" DESC, c."ID_CAMPANHA" DESC`,
      [idCliente, agora]
    );

    return linhas.map((linha) => ({ ID_CAMPANHA: Number(linha.ID_CAMPANHA), NOME: linha.NOME }));
  }

  /** Linhas de ROTA_PROMOTOR da campanha, já com promotor e oficina resolvidos. */
  private static async listarRotasDaCampanha(idCampanha: number): Promise<RotaPromotorRow[]> {
    const linhas: any[] = await AppDataSourceSync.query(
      `SELECT rp."STATUS", rp."DONE_AT", rp."UPDATED_AT", rp."OBS",
              pr."ID_PROMOTOR" AS "idPromotor", p."NOME" AS "nomePromotor",
              o."NOME_FANTASIA" AS "nomeOficina", o."CIDADE" AS "cidade", o."ESTADO" AS "estado"
         FROM "CAMPANHAS_OB"."ROTA_PROMOTOR" rp
         JOIN "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" pr ON pr."ID_CAMPANHA_PROMOTOR" = rp."ID_CAMPANHA_PROMOTOR"
         JOIN "CAMPANHAS_OB"."PROMOTOR" p ON p."ID_PROMOTOR" = pr."ID_PROMOTOR"
         LEFT JOIN "MAIN_REGISTER"."OFICINA" o ON o."ID_OFICINA" = rp."ID_OFICINA"
        WHERE pr."ID_CAMPANHA" = $1
          AND rp."DELETED_AT" IS NULL
          AND rp."STATUS" IS DISTINCT FROM '${StatusRota.AGUARDANDO}'`,
      [idCampanha]
    );

    return linhas.map((linha) => ({
      STATUS: linha.STATUS,
      DONE_AT: linha.DONE_AT ? new Date(linha.DONE_AT) : null,
      UPDATED_AT: new Date(linha.UPDATED_AT),
      idPromotor: Number(linha.idPromotor),
      nomePromotor: linha.nomePromotor,
      nomeOficina: linha.nomeOficina ?? "Oficina sem nome",
      cidadeOficina: linha.cidade && linha.estado ? `${linha.cidade}/${linha.estado}` : linha.cidade ?? "—",
      OBS: linha.OBS ?? null,
    }));
  }

  private static montarBlocoCampanha(campanha: CampanhaAtivaDoCliente, rotas: RotaPromotorRow[], periodo: PeriodoRelatorio): CampanhaBlocoRelatorio {
    const visaoGeral = calcularVisaoGeral(rotas, periodo);
    const porPromotor = agruparPorPromotor(rotas, periodo);

    return {
      idCampanha: campanha.ID_CAMPANHA,
      nomeCampanha: campanha.NOME,
      visaoGeral,
      assertividade: calcularAssertividade(visaoGeral.concluidas, visaoGeral.canceladas),
      porPromotor,
      cancelamentos: listarCancelamentos(rotas, periodo),
      destaquesDeCampo: listarDestaquesDeCampo(rotas, periodo),
      proximosPassos: calcularProximosPassos(visaoGeral, porPromotor),
    };
  }

  /**
   * Monta o relatório de 1 cliente: 1 bloco por campanha ativa (RELPROM-26,
   * RELPROM-27). Cliente sem campanha ativa retorna `campanhas: []`
   * (RELPROM-22), não é erro. Ainda não envia e-mail nem persiste auditoria
   * (ver T17).
   */
  static async gerarRelatorioCliente(
    cliente: { idCliente: number; nomeCliente: string },
    periodo: PeriodoRelatorio,
    agora: Date = new Date()
  ): Promise<RelatorioPromotorData> {
    const campanhasAtivas = await this.listarCampanhasAtivasDoCliente(cliente.idCliente, agora);

    const campanhas = await Promise.all(
      campanhasAtivas.map(async (campanha) => {
        const rotas = await this.listarRotasDaCampanha(campanha.ID_CAMPANHA);
        return this.montarBlocoCampanha(campanha, rotas, periodo);
      })
    );

    return {
      idCliente: cliente.idCliente,
      nomeCliente: cliente.nomeCliente,
      periodo,
      campanhas,
    };
  }
}
