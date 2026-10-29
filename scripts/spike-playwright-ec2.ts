/**
 * Spike (task T01, feature relatorio-semanal-promotores): valida se o Playwright
 * consegue renderizar PDF no mesmo tipo de ambiente da EC2 real de producao
 * (Amazon Linux 2023, sem Docker). Nao e codigo de producao - descartavel apos
 * a validacao. Rodar dentro de um container `amazonlinux:2023` com Node 20 +
 * `npx playwright install --with-deps chromium` ja instalados.
 */
import { chromium } from "playwright";
import { writeFileSync } from "fs";

async function main() {
  const html = `<!doctype html>
    <html><body style="font-family: sans-serif;">
      <h1>Spike Playwright - Amazon Linux 2023</h1>
      <p>Se este PDF existe, o chromium.launch() funcionou neste SO.</p>
    </body></html>`;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });
  const pdfBuffer = await page.pdf({ format: "A4" });
  await browser.close();

  if (!pdfBuffer.subarray(0, 5).toString("ascii").startsWith("%PDF-")) {
    throw new Error("PDF gerado nao comeca com %PDF- - saida invalida");
  }

  writeFileSync("/tmp/spike-playwright.pdf", pdfBuffer);
  console.log(`OK: PDF gerado com ${pdfBuffer.length} bytes em /tmp/spike-playwright.pdf`);
}

main().catch((err) => {
  console.error("FALHOU:", err);
  process.exit(1);
});
