import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { StatusRota } from "../entities/RotaPromotor";

export interface PeriodoRelatorio {
  inicio: Date;
  fim: Date;
}

const FUSO_RELATORIO = "America/Sao_Paulo";

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
  OBS: string | null;
}

export interface VisaoGeralCampanha {
  concluidas: number;
  canceladas: number;
  abertasNaRota: number;
}

export interface LinhaPromotor {
  idPromotor: number;
  nomePromotor: string;
  concluidasPeriodo: number;
  canceladasPeriodo: number;
  concluidasAcumulado: number;
  abertasNaRota: number;
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

/** RELPROM-05, RELPROM-06. */
export function calcularAssertividade(concluidas: number, canceladas: number): number | "N/A" {
  const encerradas = concluidas + canceladas;
  if (encerradas === 0) return "N/A";
  return Math.round((concluidas / encerradas) * 100);
}

/**
 * RELPROM-07. Uma linha por promotor que aparece em `rotas` (pelo menos 1
 * registro na campanha) — inclui promotor com tudo zerado no período, não
 * omite linha (ver edge case do spec.md).
 */
export function agruparPorPromotor(rotas: RotaPromotorRow[], periodo: PeriodoRelatorio): LinhaPromotor[] {
  const porPromotor = new Map<number, { nomePromotor: string; rotas: RotaPromotorRow[] }>();
  for (const rota of rotas) {
    const grupo = porPromotor.get(rota.idPromotor) ?? { nomePromotor: rota.nomePromotor, rotas: [] };
    grupo.rotas.push(rota);
    porPromotor.set(rota.idPromotor, grupo);
  }

  return Array.from(porPromotor.entries()).map(([idPromotor, { nomePromotor, rotas: rotasDoPromotor }]) => {
    const visaoGeralPromotor = calcularVisaoGeral(rotasDoPromotor, periodo);
    const concluidasAcumulado = rotasDoPromotor.filter((rota) => rota.STATUS === StatusRota.FINALIZADO).length;

    return {
      idPromotor,
      nomePromotor,
      concluidasPeriodo: visaoGeralPromotor.concluidas,
      canceladasPeriodo: visaoGeralPromotor.canceladas,
      concluidasAcumulado,
      abertasNaRota: visaoGeralPromotor.abertasNaRota,
    };
  });
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
