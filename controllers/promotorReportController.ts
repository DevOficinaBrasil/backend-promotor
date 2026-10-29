import { Request, Response } from "express";
import PromotorReportService, { NOME_MODULO_PROMOTORES } from "../service/promotorReportService";
import ObAdsIntegrationClient from "../service/obAdsIntegrationClient";
import { OrigemRelatorioEnvio } from "../entities/PromotorRelatorioEnvio";
import { calcularPeriodoSemanal, PeriodoRelatorio } from "../utils/promotorReportCalculos";

interface GerarQueryValidada {
  inicio?: string;
  fim?: string;
  enviarEmail?: "true" | "false";
}

/**
 * Disparo manual do relatório de promotores (CON26-325, RELPROM-32 a
 * RELPROM-39) — mesma lógica usada pelo cron (`PromotorReportService`), sob
 * demanda, pra testar sem esperar sexta-feira ou pra uma futura tela
 * administrativa pedir o relatório.
 */
export class PromotorReportController {
  static async gerar(req: Request, res: Response) {
    try {
      const idCliente = req.params.idCliente as unknown as number;
      const query = ((req as any).validatedQuery ?? {}) as GerarQueryValidada;
      const enviarEmail = query.enviarEmail !== "false";

      let periodo: PeriodoRelatorio;
      if (query.inicio || query.fim) {
        const inicio = query.inicio ? new Date(query.inicio) : undefined;
        const fim = query.fim ? new Date(query.fim) : undefined;
        if (!inicio || !fim || Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime()) || inicio > fim) {
          return res.status(400).json({ message: "Período inválido: informe inicio e fim (ISO date) juntos, com inicio <= fim." });
        }
        periodo = { inicio, fim };
      } else {
        periodo = calcularPeriodoSemanal(new Date());
      }

      const listagem = await ObAdsIntegrationClient.listarClientesHabilitados(NOME_MODULO_PROMOTORES, idCliente);
      if (!listagem.sucesso) {
        return res.status(502).json({ message: "Não foi possível consultar o backend-ob-ads.", error: listagem.motivo });
      }

      const [cliente] = listagem.dados;
      if (!cliente) {
        return res
          .status(404)
          .json({ message: `Cliente ${idCliente} não encontrado ou sem o módulo "${NOME_MODULO_PROMOTORES}" habilitado.` });
      }

      // SPEC_DEVIATION: RELPROM-39 original também pedia 404 pra "sem campanha
      // vinculada". Mantido só módulo/cliente como 404 — zero campanha ativa já
      // é tratado de forma uniforme como RELPROM-13/22 (gera com zeros), tanto
      // no cron quanto aqui; um 404 só aqui criaria 2 comportamentos
      // diferentes pra mesma condição, dependendo de quem chamou.
      // Reason: consistência > fidelidade literal a uma AC que criaria uma
      // inconsistência de comportamento entre os 2 gatilhos da mesma feature.

      const resultado = await PromotorReportService.processarRelatorioCliente(cliente, periodo, OrigemRelatorioEnvio.MANUAL, {
        enviarEmail,
      });

      if (resultado.pdf.length === 0) {
        return res.status(500).json({ message: "Erro ao gerar o relatório.", error: resultado.motivoFalha });
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="relatorio-promotores-${idCliente}.pdf"`);
      return res.status(200).send(resultado.pdf);
    } catch (erro) {
      console.error("[promotorReportController] erro inesperado", { erro: (erro as Error)?.message });
      return res.status(500).json({ message: "Erro interno." });
    }
  }
}
