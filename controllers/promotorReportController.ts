import { Request, Response } from "express";
import PromotorReportService from "../service/promotorReportService";
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

      // Pós-Execute (AD-006): resolve direto por ID_CLIENTE, sem checar
      // module/cliente_module — o módulo nunca é criado no SQL Server
      // enquanto o congelamento pré-migração estiver em vigor, então checar
      // module aqui faria todo cliente (inclusive a SKF) voltar 404.
      const resolucao = await ObAdsIntegrationClient.resolverAdminsDoCliente(idCliente);
      if (!resolucao.sucesso) {
        if (resolucao.status === 404) {
          return res.status(404).json({ message: `Cliente ${idCliente} não encontrado.` });
        }
        return res.status(502).json({ message: "Não foi possível consultar o backend-ob-ads.", error: resolucao.motivo });
      }
      const cliente = resolucao.dados;

      // SPEC_DEVIATION: RELPROM-39 original também pedia 404 pra "sem campanha
      // vinculada". Mantido só cliente-inexistente como 404 — zero campanha
      // ativa já é tratado de forma uniforme como RELPROM-13/22 (gera com
      // zeros), tanto no cron quanto aqui; um 404 só aqui criaria 2
      // comportamentos diferentes pra mesma condição, dependendo de quem
      // chamou. Reason: consistência > fidelidade literal a uma AC que criaria
      // uma inconsistência de comportamento entre os 2 gatilhos da mesma
      // feature.

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
