import {
  Cancelamento,
  DestaqueCampo,
  LinhaPromotor,
  PeriodoRelatorio,
  ProximosPassos,
  VisaoGeralCampanha,
} from "../utils/promotorReportCalculos";

export interface CampanhaBlocoRelatorio {
  idCampanha: number;
  nomeCampanha: string;
  visaoGeral: VisaoGeralCampanha;
  assertividade: number | "N/A";
  porPromotor: LinhaPromotor[];
  cancelamentos: Cancelamento[];
  destaquesDeCampo: DestaqueCampo[];
  proximosPassos: ProximosPassos;
}

export interface RelatorioPromotorData {
  idCliente: number;
  nomeCliente: string;
  periodo: PeriodoRelatorio;
  campanhas: CampanhaBlocoRelatorio[];
}
