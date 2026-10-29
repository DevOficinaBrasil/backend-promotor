import { construirPdf } from "../templates/relatorioPromotor";
import { RelatorioPromotorData } from "../types/promotorRelatorio";

/**
 * Renderiza o relatório (capa + 1 bloco por campanha) em PDF via `pdf-lib`
 * (desenho direto, sem navegador — ver `templates/relatorioPromotor.ts` pro
 * motivo da troca a partir do Playwright).
 */
export default class PromotorReportPdfRenderer {
  static async renderizarPdf(dados: RelatorioPromotorData): Promise<Buffer> {
    const bytes = await construirPdf(dados);
    return Buffer.from(bytes);
  }
}
