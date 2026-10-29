import { RelatorioPromotorData, CampanhaBlocoRelatorio } from "../types/promotorRelatorio";

function formatarData(data: Date): string {
  return data.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderizarCapa(dados: RelatorioPromotorData): string {
  return `
    <section class="capa">
      <p class="eyebrow">RELATÓRIO SEMANAL DE PROMOTORES</p>
      <h1>${escapar(dados.nomeCliente)}</h1>
      <p class="periodo">Período: ${formatarData(dados.periodo.inicio)} a ${formatarData(dados.periodo.fim)}</p>
    </section>
  `;
}

function renderizarVisaoGeral(bloco: CampanhaBlocoRelatorio): string {
  const { visaoGeral } = bloco;
  return `
    <section>
      <h2>Visão geral</h2>
      <div class="cards">
        <div class="card"><span class="numero">${visaoGeral.concluidas}</span><span class="rotulo">Concluídas</span></div>
        <div class="card"><span class="numero">${visaoGeral.canceladas}</span><span class="rotulo">Canceladas</span></div>
        <div class="card"><span class="numero">${visaoGeral.abertasNaRota}</span><span class="rotulo">Abertas na rota</span></div>
      </div>
    </section>
  `;
}

function renderizarAssertividade(bloco: CampanhaBlocoRelatorio): string {
  return `
    <section>
      <h2>Assertividade</h2>
      <p class="assertividade">${bloco.assertividade === "N/A" ? "N/A" : `${bloco.assertividade}%`}</p>
    </section>
  `;
}

function renderizarPorPromotor(bloco: CampanhaBlocoRelatorio): string {
  const linhas = bloco.porPromotor
    .map(
      (promotor) => `
        <tr>
          <td>${escapar(promotor.nomePromotor)}</td>
          <td>${promotor.concluidasPeriodo}</td>
          <td>${promotor.canceladasPeriodo}</td>
          <td>${promotor.concluidasAcumulado}</td>
          <td>${promotor.abertasNaRota}</td>
        </tr>
      `
    )
    .join("");

  return `
    <section>
      <h2>Performance por promotor</h2>
      <table>
        <thead>
          <tr><th>Promotor</th><th>Concluídas (período)</th><th>Canceladas (período)</th><th>Concluídas (acumulado)</th><th>Abertas na rota</th></tr>
        </thead>
        <tbody>${linhas || `<tr><td colspan="5">Sem promotores nesta campanha.</td></tr>`}</tbody>
      </table>
    </section>
  `;
}

function renderizarCancelamentos(bloco: CampanhaBlocoRelatorio): string {
  const linhas = bloco.cancelamentos
    .map(
      (cancelamento) => `
        <tr>
          <td>${escapar(cancelamento.nomePromotor)}</td>
          <td>${escapar(cancelamento.nomeOficina)}</td>
          <td>${escapar(cancelamento.cidadeOficina)}</td>
          <td>${cancelamento.obs ? escapar(cancelamento.obs) : "—"}</td>
        </tr>
      `
    )
    .join("");

  return `
    <section>
      <h2>Cancelamentos</h2>
      <table>
        <thead><tr><th>Promotor</th><th>Oficina</th><th>Cidade</th><th>Justificativa</th></tr></thead>
        <tbody>${linhas || `<tr><td colspan="4">Nenhum cancelamento no período.</td></tr>`}</tbody>
      </table>
    </section>
  `;
}

function renderizarItemDestaque(destaque: CampanhaBlocoRelatorio["destaquesDeCampo"][number]): string {
  return `
    <li>
      ${escapar(destaque.nomePromotor)}, ${escapar(destaque.nomeOficina)} (${escapar(destaque.cidadeOficina)}):
      ${escapar(destaque.obs)}
    </li>
  `;
}

/** RELPROM-09: 2 sub-seções, concluídas e canceladas, nunca uma lista única intercalada. */
function renderizarDestaques(bloco: CampanhaBlocoRelatorio): string {
  const concluidas = bloco.destaquesDeCampo.filter((destaque) => destaque.status === "concluida");
  const canceladas = bloco.destaquesDeCampo.filter((destaque) => destaque.status === "cancelada");

  return `
    <section>
      <h2>Destaques do campo</h2>
      <h3>Concluídas com observação</h3>
      <ul class="destaques">${concluidas.map(renderizarItemDestaque).join("") || "<li>Nenhuma.</li>"}</ul>
      <h3>Canceladas com justificativa</h3>
      <ul class="destaques">${canceladas.map(renderizarItemDestaque).join("") || "<li>Nenhuma.</li>"}</ul>
    </section>
  `;
}

function renderizarProximosPassos(bloco: CampanhaBlocoRelatorio): string {
  const { proximosPassos } = bloco;
  return `
    <section>
      <h2>Próximos passos</h2>
      <div class="cards">
        <div class="card"><span class="numero">${proximosPassos.abertasNaRota}</span><span class="rotulo">Oficinas abertas na rota</span></div>
        <div class="card"><span class="numero">${proximosPassos.canceladasARedistribuir}</span><span class="rotulo">Canceladas a redistribuir</span></div>
        <div class="card"><span class="numero">${proximosPassos.promotoresSemRegistro}</span><span class="rotulo">Promotores sem registro</span></div>
      </div>
    </section>
  `;
}

function renderizarBlocoCampanha(bloco: CampanhaBlocoRelatorio): string {
  return `
    <section class="bloco-campanha">
      <h1 class="nome-campanha">${escapar(bloco.nomeCampanha)}</h1>
      ${renderizarVisaoGeral(bloco)}
      ${renderizarAssertividade(bloco)}
      ${renderizarPorPromotor(bloco)}
      ${renderizarCancelamentos(bloco)}
      ${renderizarDestaques(bloco)}
      ${renderizarProximosPassos(bloco)}
    </section>
  `;
}

const ESTILO = `
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a2e; margin: 0; padding: 32px; }
  .capa { background: #0b1f4d; color: #fff; padding: 48px 32px; margin: -32px -32px 32px; }
  .capa .eyebrow { letter-spacing: 1px; font-size: 12px; opacity: 0.8; }
  .capa h1 { font-size: 32px; margin: 8px 0; }
  .bloco-campanha { page-break-before: always; }
  .nome-campanha { font-size: 22px; border-bottom: 2px solid #0b1f4d; padding-bottom: 8px; }
  h2 { font-size: 16px; color: #0b1f4d; margin-top: 24px; }
  h3 { font-size: 13px; color: #0b1f4d; margin: 12px 0 4px; }
  .cards { display: flex; gap: 16px; }
  .card { flex: 1; background: #f0f3fa; border-radius: 8px; padding: 16px; text-align: center; }
  .card .numero { display: block; font-size: 28px; font-weight: bold; color: #0b1f4d; }
  .card .rotulo { font-size: 12px; color: #555; }
  .assertividade { font-size: 40px; font-weight: bold; color: #2e7d32; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
  th { background: #f0f3fa; }
  ul.destaques { font-size: 12px; padding-left: 18px; }
`;

/** Gera o HTML completo do relatório: 1 capa + 1 bloco por campanha (RELPROM-01, RELPROM-26, RELPROM-27). */
export function renderizarHtml(dados: RelatorioPromotorData): string {
  const blocos = dados.campanhas.map(renderizarBlocoCampanha).join("");

  return `<!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <style>${ESTILO}</style>
      </head>
      <body>
        ${renderizarCapa(dados)}
        ${blocos}
      </body>
    </html>`;
}
