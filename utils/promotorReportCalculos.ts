import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { StatusRota } from "../entities/RotaPromotor";

export interface PeriodoRelatorio {
  inicio: Date;
  fim: Date;
}

export const FUSO_RELATORIO = "America/Sao_Paulo";

/**
 * RELPROM-15. Janela fixa de 7 dias corridos terminando no dia anterior ao
 * disparo (dia completo): `agora` numa sexta-feira cobre de sexta anterior
 * 00:00:00 até a quinta imediatamente anterior 23:59:59.999, horário de
 * Brasília — sem depender do fuso do servidor.
 */
export function calcularPeriodoSemanal(agora: Date): PeriodoRelatorio {
  const diaAtual = formatInTimeZone(agora, FUSO_RELATORIO, "yyyy-MM-dd");
  const inicioDoDiaAtual = fromZonedTime(`${diaAtual}T00:00:00.000`, FUSO_RELATORIO);

  const fim = new Date(inicioDoDiaAtual.getTime() - 1);
  const inicio = new Date(inicioDoDiaAtual.getTime() - 7 * 24 * 60 * 60 * 1000);

  return { inicio, fim };
}

/**
 * Converte um `inicio`/`fim` de período vindo de query string (RELPROM-34).
 * Sempre ancora pelo dia civil de Brasília (America/Sao_Paulo) — só os 10
 * primeiros caracteres (`YYYY-MM-DD`) da string importam, qualquer
 * horário/fuso embutido é ignorado. Igual a `calcularPeriodoSemanal`.
 *
 * RELPROM-68 (correção pós-uso real): a versão anterior só ancorava uma data
 * "pura" (sem horário — `new Date("2026-10-09")` cai no dia anterior em
 * UTC-3) e deixava passar direto qualquer string com horário explícito,
 * mesmo em UTC (`Z`). Isso tinha o mesmo bug: `inicio=2026-10-23T00:00:00.000Z`
 * é 2026-10-22 21h em Brasília, então a capa exibia "22/10" em vez de "23/10"
 * pedido. Ignorar o horário/fuso da entrada e ancorar sempre no dia civil de
 * Brasília resolve os 2 casos com a mesma regra.
 */
export function parseDataPeriodoQuery(dataIso: string, ponta: "inicio" | "fim"): Date {
  const data = dataIso.slice(0, 10);
  const sufixo = ponta === "inicio" ? "T00:00:00.000" : "T23:59:59.999";
  return fromZonedTime(`${data}${sufixo}`, FUSO_RELATORIO);
}

/**
 * Subconjunto de ROTA_PROMOTOR usado pelos cálculos do relatório. `DONE_AT` é
 * a data de conclusão (FINALIZADO). `ROTA_PROMOTOR` não tem uma coluna
 * dedicada de "data de cancelamento" — `UPDATED_AT` é usado como proxy (a
 * última escrita na rota, que é a própria transição pra CANCELADO). Assunção
 * registrada aqui porque o schema real não pôde ser confirmado por SELECT ao
 * vivo nesta sessão (.env.readonly ausente — ver Risks & Concerns do
 * design.md); revisitar se a coluna real for outra.
 */
export interface RotaPromotorRow {
  STATUS: StatusRota;
  DONE_AT: Date | null;
  UPDATED_AT: Date;
  idPromotor: number;
  nomePromotor: string;
  nomeOficina: string;
  cidadeOficina: string;
  /** UF (sigla do estado) da oficina, cru — RELPROM-70, pra derivar a região do promotor. `null` quando a oficina não resolve (LEFT JOIN vazio). */
  estadoOficina: string | null;
  OBS: string | null;
}

export interface VisaoGeralCampanha {
  concluidas: number;
  canceladas: number;
  abertasNaRota: number;
}

export interface PontoVisitasPorDia {
  dia: string; // dd/MM, America/Sao_Paulo
  diaSemana: string; // abreviação pt-BR ("dom".."sáb"), mesmo índice de DIAS_SEMANA_ABREV
  concluidas: number;
  canceladas: number;
}

const DIAS_SEMANA_ABREV = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const DIAS_SEMANA_EXTENSO = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export interface DestaqueDiaPico {
  dia: string; // mesmo formato de PontoVisitasPorDia.dia — pro renderer saber qual dia destacar
  texto: string;
}

export interface LinhaPromotor {
  idPromotor: number;
  nomePromotor: string;
  concluidasPeriodo: number;
  canceladasPeriodo: number;
  concluidasAcumulado: number;
  abertasNaRota: number;
  /** UF mais frequente entre as oficinas visitadas pelo promotor nessa campanha (RELPROM-70). `null` sem nenhuma oficina com estado resolvido. */
  uf: string | null;
}

export interface Cancelamento {
  idPromotor: number;
  nomePromotor: string;
  nomeOficina: string;
  cidadeOficina: string;
  obs: string | null;
}

export interface DestaqueCampo {
  status: "concluida" | "cancelada";
  idPromotor: number;
  nomePromotor: string;
  nomeOficina: string;
  cidadeOficina: string;
  obs: string;
}

export interface ProximosPassos {
  abertasNaRota: number;
  canceladasARedistribuir: number;
  promotoresSemRegistro: number;
}

const LIMITE_OBS = 500;

function truncarObs(obs: string): string {
  return obs.length > LIMITE_OBS ? `${obs.slice(0, LIMITE_OBS)}...` : obs;
}

function dentroDoPeriodo(data: Date | null | undefined, periodo: PeriodoRelatorio): boolean {
  if (!data) return false;
  return data.getTime() >= periodo.inicio.getTime() && data.getTime() <= periodo.fim.getTime();
}

/** RELPROM-02, RELPROM-03, RELPROM-04. */
export function calcularVisaoGeral(rotas: RotaPromotorRow[], periodo: PeriodoRelatorio): VisaoGeralCampanha {
  const concluidas = rotas.filter(
    (rota) => rota.STATUS === StatusRota.FINALIZADO && dentroDoPeriodo(rota.DONE_AT, periodo)
  ).length;

  const canceladas = rotas.filter(
    (rota) => rota.STATUS === StatusRota.CANCELADO && dentroDoPeriodo(rota.UPDATED_AT, periodo)
  ).length;

  const abertasNaRota = rotas.filter(
    (rota) => rota.STATUS === StatusRota.BACKLOG || rota.STATUS === StatusRota.A_CAMINHO
  ).length;

  return { concluidas, canceladas, abertasNaRota };
}

/**
 * Visitas por dia no período (gráfico comparativo da visão geral, igual ao
 * modelo do CON26-325). Só os dias com pelo menos 1 concluída ou cancelada
 * aparecem — dia sem nenhuma atividade não vira barra zerada, mesmo
 * comportamento do modelo (fins de semana etc. somem do gráfico).
 */
export function agruparVisitasPorDia(rotas: RotaPromotorRow[], periodo: PeriodoRelatorio): PontoVisitasPorDia[] {
  const porDia = new Map<string, { concluidas: number; canceladas: number }>();

  for (const rota of rotas) {
    const ehConcluida = rota.STATUS === StatusRota.FINALIZADO && dentroDoPeriodo(rota.DONE_AT, periodo);
    const ehCancelada = rota.STATUS === StatusRota.CANCELADO && dentroDoPeriodo(rota.UPDATED_AT, periodo);
    if (!ehConcluida && !ehCancelada) continue;

    const data = (ehConcluida ? rota.DONE_AT : rota.UPDATED_AT) as Date;
    const chave = formatInTimeZone(data, FUSO_RELATORIO, "yyyy-MM-dd");
    const ponto = porDia.get(chave) ?? { concluidas: 0, canceladas: 0 };
    if (ehConcluida) ponto.concluidas += 1;
    else ponto.canceladas += 1;
    porDia.set(chave, ponto);
  }

  return Array.from(porDia.entries())
    .sort(([chaveA], [chaveB]) => chaveA.localeCompare(chaveB))
    .map(([chave, valores]) => ({
      dia: `${chave.slice(8, 10)}/${chave.slice(5, 7)}`,
      diaSemana: DIAS_SEMANA_ABREV[new Date(`${chave}T12:00:00Z`).getUTCDay()],
      ...valores,
    }));
}

/**
 * Frase de destaque do dia com mais visitas concluídas no período, igual ao
 * modelo do CON26-325 ("A quinta-feira 15/10 concentrou 52 das 71 visitas do
 * período."). Deterministico — não usa IA, só escolhe o dia de maior
 * `concluidas` e formata. `null` quando não há nenhuma visita concluída no
 * período (nada a destacar).
 */
export function descreverDiaPico(pontos: PontoVisitasPorDia[], totalConcluidasPeriodo: number): DestaqueDiaPico | null {
  if (totalConcluidasPeriodo <= 0 || pontos.length === 0) return null;

  const pico = pontos.reduce((maior, atual) => (atual.concluidas > maior.concluidas ? atual : maior), pontos[0]);
  if (pico.concluidas <= 0) return null;

  const indice = DIAS_SEMANA_ABREV.indexOf(pico.diaSemana);
  const extenso = DIAS_SEMANA_EXTENSO[indice];
  const artigo = indice === 0 || indice === 6 ? "O" : "A";

  return {
    dia: pico.dia,
    texto: `${artigo} ${extenso} ${pico.dia} concentrou ${pico.concluidas} das ${totalConcluidasPeriodo} visitas do período.`,
  };
}

/**
 * Frase de síntese da seção "Performance por promotor" (RELPROM-64) —
 * determinística, nunca via IA: elimina o risco de atribuir um número real a
 * um promotor errado (achado na revisão do PO — a validação de alucinação só
 * confere se o número existe nos dados, não se está atribuído à pessoa
 * certa). `null` quando ninguém concluiu nada no período (nada a destacar).
 */
export function descreverLiderPeriodo(porPromotor: LinhaPromotor[]): string | null {
  if (porPromotor.length === 0) return null;

  const lider = porPromotor.reduce((maior, atual) => (atual.concluidasPeriodo > maior.concluidasPeriodo ? atual : maior), porPromotor[0]);
  if (lider.concluidasPeriodo <= 0) return null;

  return `${lider.nomePromotor} lidera o período com ${lider.concluidasPeriodo} visitas concluídas.`;
}

/** RELPROM-05, RELPROM-06. */
export function calcularAssertividade(concluidas: number, canceladas: number): number | "N/A" {
  const encerradas = concluidas + canceladas;
  if (encerradas === 0) return "N/A";
  return Math.round((concluidas / encerradas) * 100);
}

/**
 * Assertividade acumulada da campanha inteira (RELPROM-71) — mesmo cálculo
 * de `calcularAssertividade`, mas sobre todo o histórico de `rotas`, sem
 * filtro de período (igual à lógica de "acumulado" já usada por promotor em
 * `concluidasAcumulado`, aqui em nível de campanha).
 */
export function calcularAssertividadeAcumulada(rotas: RotaPromotorRow[]): number | "N/A" {
  const concluidas = rotas.filter((rota) => rota.STATUS === StatusRota.FINALIZADO).length;
  const canceladas = rotas.filter((rota) => rota.STATUS === StatusRota.CANCELADO).length;
  return calcularAssertividade(concluidas, canceladas);
}

/** UF mais frequente entre `rotas` (RELPROM-70) — ignora rota sem estado resolvido; empate decide pela 1ª UF encontrada. `null` sem nenhum estado. */
function ufMaisFrequente(rotas: RotaPromotorRow[]): string | null {
  const contagemPorUf = new Map<string, number>();
  for (const rota of rotas) {
    if (!rota.estadoOficina) continue;
    contagemPorUf.set(rota.estadoOficina, (contagemPorUf.get(rota.estadoOficina) ?? 0) + 1);
  }

  let melhorUf: string | null = null;
  let maiorContagem = 0;
  for (const [uf, contagem] of contagemPorUf) {
    if (contagem > maiorContagem) {
      melhorUf = uf;
      maiorContagem = contagem;
    }
  }
  return melhorUf;
}

/**
 * RELPROM-07. Uma linha por promotor que aparece em `rotas` (pelo menos 1
 * registro na campanha) — inclui promotor com tudo zerado no período, não
 * omite linha (ver edge case do spec.md). Ordenado por `concluidasPeriodo`
 * decrescente (RELPROM-69) — quem concluiu mais no período aparece no topo.
 */
export function agruparPorPromotor(rotas: RotaPromotorRow[], periodo: PeriodoRelatorio): LinhaPromotor[] {
  const porPromotor = new Map<number, { nomePromotor: string; rotas: RotaPromotorRow[] }>();
  for (const rota of rotas) {
    const grupo = porPromotor.get(rota.idPromotor) ?? { nomePromotor: rota.nomePromotor, rotas: [] };
    grupo.rotas.push(rota);
    porPromotor.set(rota.idPromotor, grupo);
  }

  const linhas = Array.from(porPromotor.entries()).map(([idPromotor, { nomePromotor, rotas: rotasDoPromotor }]) => {
    const visaoGeralPromotor = calcularVisaoGeral(rotasDoPromotor, periodo);
    const concluidasAcumulado = rotasDoPromotor.filter((rota) => rota.STATUS === StatusRota.FINALIZADO).length;

    return {
      idPromotor,
      nomePromotor,
      concluidasPeriodo: visaoGeralPromotor.concluidas,
      canceladasPeriodo: visaoGeralPromotor.canceladas,
      concluidasAcumulado,
      abertasNaRota: visaoGeralPromotor.abertasNaRota,
      uf: ufMaisFrequente(rotasDoPromotor),
    };
  });

  return linhas.sort((a, b) => b.concluidasPeriodo - a.concluidasPeriodo);
}

/** RELPROM-08. Todo cancelamento do período, com ou sem OBS preenchido. */
export function listarCancelamentos(rotas: RotaPromotorRow[], periodo: PeriodoRelatorio): Cancelamento[] {
  return rotas
    .filter((rota) => rota.STATUS === StatusRota.CANCELADO && dentroDoPeriodo(rota.UPDATED_AT, periodo))
    .map((rota) => ({
      idPromotor: rota.idPromotor,
      nomePromotor: rota.nomePromotor,
      nomeOficina: rota.nomeOficina,
      cidadeOficina: rota.cidadeOficina,
      obs: rota.OBS ? truncarObs(rota.OBS) : null,
    }));
}

/**
 * RELPROM-09, RELPROM-24. Só visitas concluídas/canceladas no período com OBS
 * preenchido — sem interpretação além do texto do próprio campo.
 */
export function listarDestaquesDeCampo(rotas: RotaPromotorRow[], periodo: PeriodoRelatorio): DestaqueCampo[] {
  const concluidas: DestaqueCampo[] = [];
  const canceladas: DestaqueCampo[] = [];

  for (const rota of rotas) {
    if (!rota.OBS) continue;

    const status =
      rota.STATUS === StatusRota.FINALIZADO && dentroDoPeriodo(rota.DONE_AT, periodo)
        ? "concluida"
        : rota.STATUS === StatusRota.CANCELADO && dentroDoPeriodo(rota.UPDATED_AT, periodo)
          ? "cancelada"
          : null;
    if (!status) continue;

    const destaque: DestaqueCampo = {
      status,
      idPromotor: rota.idPromotor,
      nomePromotor: rota.nomePromotor,
      nomeOficina: rota.nomeOficina,
      cidadeOficina: rota.cidadeOficina,
      obs: truncarObs(rota.OBS),
    };

    (status === "concluida" ? concluidas : canceladas).push(destaque);
  }

  // RELPROM-09: agrupada por status — todas as concluídas antes de todas as
  // canceladas, independente da ordem de entrada em `rotas`.
  return [...concluidas, ...canceladas];
}

/** RELPROM-10. Reaproveita a visão geral e a lista por promotor, sem recalcular. */
export function calcularProximosPassos(
  visaoGeral: VisaoGeralCampanha,
  porPromotor: LinhaPromotor[]
): ProximosPassos {
  return {
    abertasNaRota: visaoGeral.abertasNaRota,
    canceladasARedistribuir: visaoGeral.canceladas,
    promotoresSemRegistro: porPromotor.filter((promotor) => promotor.concluidasPeriodo === 0).length,
  };
}
