import { AppDataSourceSync } from "../data-source";
import { StatusRota } from "../entities/RotaPromotor";
import PromotorRelatorioEnvio, {
  AmbienteRelatorioEnvio,
  OrigemRelatorioEnvio,
  StatusRelatorioEnvio,
} from "../entities/PromotorRelatorioEnvio";
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
import PromotorReportPdfRenderer from "./promotorReportPdfRenderer";
import ObAdsIntegrationClient from "./obAdsIntegrationClient";
import { resolverDestinatarios } from "../config/promotorReportRecipients";
import { CLIENTES_PRODUCAO_HABILITADOS } from "../config/promotorReportClientesProducao";

interface CampanhaAtivaDoCliente {
  ID_CAMPANHA: number;
  NOME: string;
}

export interface ClienteParaProcessar {
  idCliente: number;
  nomeCliente: string;
  admins: string[];
}

export interface ResultadoEnvioCliente {
  idCliente: number;
  pdf: Buffer;
  enviado: boolean;
  motivoFalha?: string;
}

export interface ResumoExecucao {
  elegiveis: number;
  enviados: number;
  falharam: number;
}

export const NOME_MODULO_PROMOTORES = "promotores";

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

  private static async registrarAuditoria(params: {
    idCliente: number;
    periodo: PeriodoRelatorio;
    origem: OrigemRelatorioEnvio;
    status: StatusRelatorioEnvio;
    motivoFalha?: string;
    destinatarios: string[];
  }): Promise<void> {
    const repo = AppDataSourceSync.getRepository(PromotorRelatorioEnvio);
    await repo.save(
      repo.create({
        ID_CLIENTE: params.idCliente,
        PERIODO_INICIO: params.periodo.inicio,
        PERIODO_FIM: params.periodo.fim,
        ORIGEM: params.origem,
        STATUS: params.status,
        MOTIVO_FALHA: params.motivoFalha,
        DESTINATARIOS: params.destinatarios,
        AMBIENTE:
          process.env.NODE_ENV === "production"
            ? AmbienteRelatorioEnvio.PRODUCTION
            : AmbienteRelatorioEnvio.NAO_PRODUCTION,
      })
    );
  }

  /**
   * Gera o relatório de 1 cliente, renderiza o PDF e (salvo `enviarEmail:
   * false`) envia por e-mail + grava auditoria. Nunca lança — toda falha
   * (geração, PDF, destinatário, envio) vira `{enviado: false, motivoFalha}`,
   * isolada desse cliente (RELPROM-17).
   */
  static async processarRelatorioCliente(
    cliente: ClienteParaProcessar,
    periodo: PeriodoRelatorio,
    origem: OrigemRelatorioEnvio,
    opcoes: { enviarEmail?: boolean } = {}
  ): Promise<ResultadoEnvioCliente> {
    const enviarEmail = opcoes.enviarEmail ?? true;

    let pdf: Buffer;
    try {
      const dados = await this.gerarRelatorioCliente(cliente, periodo);
      pdf = await PromotorReportPdfRenderer.renderizarPdf(dados);
    } catch (erro) {
      const motivoFalha = (erro as Error)?.message ?? "falha ao gerar o relatório";
      if (enviarEmail) {
        await this.registrarAuditoria({
          idCliente: cliente.idCliente,
          periodo,
          origem,
          status: StatusRelatorioEnvio.FALHA,
          motivoFalha,
          destinatarios: [],
        });
      }
      return { idCliente: cliente.idCliente, pdf: Buffer.alloc(0), enviado: false, motivoFalha };
    }

    if (!enviarEmail) {
      return { idCliente: cliente.idCliente, pdf, enviado: false };
    }

    const { destinatarios, adminsReaisParaLog } = resolverDestinatarios(cliente.admins);
    if (destinatarios.length === 0) {
      const motivoFalha =
        adminsReaisParaLog.length === 0
          ? "nenhum admin resolvido para o cliente"
          : "lista fixa de destinatários de teste está vazia";
      console.error("[promotorReportService] relatório não enviado", {
        idCliente: cliente.idCliente,
        motivoFalha,
        adminsReais: adminsReaisParaLog,
      });
      await this.registrarAuditoria({
        idCliente: cliente.idCliente,
        periodo,
        origem,
        status: StatusRelatorioEnvio.FALHA,
        motivoFalha,
        destinatarios: [],
      });
      return { idCliente: cliente.idCliente, pdf, enviado: false, motivoFalha };
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[promotorReportService] fora de produção: e-mail real iria para", {
        idCliente: cliente.idCliente,
        adminsReais: adminsReaisParaLog,
      });
    }

    const resultadoEnvio = await ObAdsIntegrationClient.enviarEmailComAnexo({
      to: destinatarios,
      subject: `Relatório semanal de promotores — ${cliente.nomeCliente}`,
      bodyHtml: "<p>Segue em anexo o relatório semanal de visitas de promotores.</p>",
      attachment: { filename: "relatorio-promotores.pdf", content: pdf, contentType: "application/pdf" },
    });

    await this.registrarAuditoria({
      idCliente: cliente.idCliente,
      periodo,
      origem,
      status: resultadoEnvio.sucesso ? StatusRelatorioEnvio.SUCESSO : StatusRelatorioEnvio.FALHA,
      motivoFalha: resultadoEnvio.sucesso ? undefined : resultadoEnvio.motivo,
      destinatarios,
    });

    return resultadoEnvio.sucesso
      ? { idCliente: cliente.idCliente, pdf, enviado: true }
      : { idCliente: cliente.idCliente, pdf, enviado: false, motivoFalha: resultadoEnvio.motivo };
  }

  /**
   * Processa os clientes elegíveis (RELPROM-14). **Pós-Execute, AD-006**:
   * em vez de listar pelo módulo "promotores" no SQL Server (dormente —
   * `ObAdsIntegrationClient.listarClientesHabilitados`, T03/T05, intocado
   * pra quando a migração pra Postgres acabar), itera a allowlist fixa
   * `CLIENTES_PRODUCAO_HABILITADOS` (RELPROM-40/41, hoje só SKF) e resolve
   * cada cliente direto por `ID_CLIENTE` (RELPROM-42). Falha ao resolver 1
   * cliente é isolada (RELPROM-17) — nunca aborta os demais, já que cada
   * resolução agora é independente (sem mais 1 chamada única de listagem
   * que pudesse falhar pra todos de uma vez).
   */
  static async processarClientesElegiveis(periodo: PeriodoRelatorio): Promise<ResumoExecucao> {
    const resumo: ResumoExecucao = {
      elegiveis: CLIENTES_PRODUCAO_HABILITADOS.length,
      enviados: 0,
      falharam: 0,
    };

    for (const idCliente of CLIENTES_PRODUCAO_HABILITADOS) {
      const resolucao = await ObAdsIntegrationClient.resolverAdminsDoCliente(idCliente);
      if (!resolucao.sucesso) {
        console.error("[promotorReportService] falha ao resolver admins do cliente, pulando", {
          idCliente,
          motivo: resolucao.motivo,
        });
        resumo.falharam += 1;
        continue;
      }

      const resultado = await this.processarRelatorioCliente(resolucao.dados, periodo, OrigemRelatorioEnvio.CRON);
      if (resultado.enviado) {
        resumo.enviados += 1;
      } else {
        resumo.falharam += 1;
      }
    }

    console.log("[promotorReportService] execução concluída", resumo);
    return resumo;
  }
}
