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

/**
 * Linha pronta pra desenhar na tabela resumo de cancelamentos (RELPROM-53 a
 * 56) — promotor/oficinas/cidade sempre vêm dos dados reais, só
 * `justificativa` vem (validada) da IA.
 */
export interface ResumoCancelamentoGrupo {
  promotor: string;
  oficinas: string[];
  cidade: string;
  justificativa: string;
}

/** Insight pronto pra desenhar na seção de destaques do campo (RELPROM-58 a 62). */
export interface InsightCampo {
  titulo: string;
  descricao: string;
}

export interface CampanhaBlocoRelatorio {
  idCampanha: number;
  nomeCampanha: string;
  visaoGeral: VisaoGeralCampanha;
  visitasPorDia: PontoVisitasPorDia[];
  assertividade: number | "N/A";
  /** Assertividade desde o início da campanha, sem filtro de período (RELPROM-71). */
  assertividadeAcumulada: number | "N/A";
  porPromotor: LinhaPromotor[];
  cancelamentos: Cancelamento[];
  destaquesDeCampo: DestaqueCampo[];
  proximosPassos: ProximosPassos;
  sintesesPorSecao?: SintesesPorSecao;
  resumoCancelamentos?: ResumoCancelamentoGrupo[];
  insightsCampo?: InsightCampo[];
}

export interface RelatorioPromotorData {
  idCliente: number;
  nomeCliente: string;
  periodo: PeriodoRelatorio;
  campanhas: CampanhaBlocoRelatorio[];
}
