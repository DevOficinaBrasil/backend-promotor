import { chromium } from "playwright";
import { renderizarHtml } from "../templates/relatorioPromotor";
import { RelatorioPromotorData } from "../types/promotorRelatorio";

/**
 * Renderiza o relatório (capa + 1 bloco por campanha) em PDF via Playwright.
 * Precisa do Chromium instalado no ambiente de execução — ver T01
 * (.specs/features/relatorio-semanal-promotores/design.md, Risks & Concerns)
 * pros pacotes `dnf` necessários na EC2 de produção.
 */
export default class PromotorReportPdfRenderer {
  static async renderizarPdf(dados: RelatorioPromotorData): Promise<Buffer> {
    const html = renderizarHtml(dados);
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle" });
      return await page.pdf({ format: "A4", printBackground: true });
    } finally {
      await browser.close();
    }
  }
}
