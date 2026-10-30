import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

export enum OrigemRelatorioEnvio {
  CRON = "CRON",
  MANUAL = "MANUAL",
}

export enum StatusRelatorioEnvio {
  SUCESSO = "SUCESSO",
  FALHA = "FALHA",
}

export enum AmbienteRelatorioEnvio {
  PRODUCTION = "production",
  NAO_PRODUCTION = "nao-production",
}

/**
 * Controle de idempotência/auditoria do relatório semanal de promotores
 * (CON26-325). ORIGEM='CRON' + STATUS='SUCESSO' é o que impede reenvio do
 * mesmo período pro mesmo cliente (RELPROM-18); ORIGEM='MANUAL' nunca entra
 * nessa restrição, pra não bloquear o endpoint de teste (T21).
 */
@Entity({ schema: "CAMPANHAS_OB", name: "PROMOTOR_RELATORIO_ENVIO" })
export default class PromotorRelatorioEnvio {
  @PrimaryGeneratedColumn({ type: "int", name: "ID" })
  ID?: number;

  @Column({ type: "int", name: "ID_CLIENTE" })
  ID_CLIENTE?: number;

  @Column({ type: "timestamptz", name: "PERIODO_INICIO" })
  PERIODO_INICIO?: Date;

  @Column({ type: "timestamptz", name: "PERIODO_FIM" })
  PERIODO_FIM?: Date;

  // A coluna é restrita por CHK_PROMOTOR_RELATORIO_ENVIO_ORIGEM, que precisa
  // listar os mesmos valores deste enum (ver scripts/migration-promotor-relatorio-envio.sql).
  @Column({ type: "text", name: "ORIGEM" })
  ORIGEM?: OrigemRelatorioEnvio;

  // Idem, restrita por CHK_PROMOTOR_RELATORIO_ENVIO_STATUS.
  @Column({ type: "text", name: "STATUS" })
  STATUS?: StatusRelatorioEnvio;

  @Column({ type: "text", nullable: true, name: "MOTIVO_FALHA" })
  MOTIVO_FALHA?: string;

  @Column({ type: "jsonb", nullable: true, name: "DESTINATARIOS" })
  DESTINATARIOS?: string[];

  // Idem, restrita por CHK_PROMOTOR_RELATORIO_ENVIO_AMBIENTE.
  @Column({ type: "text", name: "AMBIENTE" })
  AMBIENTE?: AmbienteRelatorioEnvio;

  // URL pública do PDF arquivado no S3 (RELPROM-45). Nulo quando enviarEmail
  // for false (preview, RELPROM-48) ou quando o upload falhar (RELPROM-46).
  @Column({ type: "text", nullable: true, name: "LINK_PDF" })
  LINK_PDF?: string | null;

  @CreateDateColumn({
    type: "timestamptz",
    default: () => "CURRENT_TIMESTAMP",
    name: "CRIADO_EM",
  })
  CRIADO_EM?: Date;

  constructor(init?: Partial<PromotorRelatorioEnvio>) {
    Object.assign(this, init);
  }
}
