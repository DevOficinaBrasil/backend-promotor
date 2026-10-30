import {
  Cancelamento,
  DestaqueCampo,
  LinhaPromotor,
  PeriodoRelatorio,
  PontoVisitasPorDia,
  ProximosPassos,
  VisaoGeralCampanha,
} from "../utils/promotorReportCalculos";

export type SecaoRelatorio =
  | "visaoGeral"
  | "assertividade"
  | "porPromotor"
  | "cancelamentos"
  | "destaques"
  | "proximosPassos";

/** RELPROM-49/50/51: só as seções com frase validada aparecem aqui. */
export type SintesesPorSecao = Partial<Record<SecaoRelatorio, string>>;

export interface CampanhaBlocoRelatorio {
  idCampanha: number;
  nomeCampanha: string;
  visaoGeral: VisaoGeralCampanha;
  visitasPorDia: PontoVisitasPorDia[];
  assertividade: number | "N/A";
  porPromotor: LinhaPromotor[];
  cancelamentos: Cancelamento[];
  destaquesDeCampo: DestaqueCampo[];
  proximosPassos: ProximosPassos;
  sintesesPorSecao?: SintesesPorSecao;
}

export interface RelatorioPromotorData {
  idCliente: number;
  nomeCliente: string;
  periodo: PeriodoRelatorio;
  campanhas: CampanhaBlocoRelatorio[];
}
