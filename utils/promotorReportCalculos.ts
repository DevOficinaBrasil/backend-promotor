import { StatusRota } from "../entities/RotaPromotor";

export interface PeriodoRelatorio {
  inicio: Date;
  fim: Date;
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
}

export interface VisaoGeralCampanha {
  concluidas: number;
  canceladas: number;
  abertasNaRota: number;
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
