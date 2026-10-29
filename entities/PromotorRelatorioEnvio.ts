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

  @Column({ type: "timestamp", name: "PERIODO_INICIO" })
  PERIODO_INICIO?: Date;

  @Column({ type: "timestamp", name: "PERIODO_FIM" })
  PERIODO_FIM?: Date;

  @Column({
    type: "enum",
    enum: OrigemRelatorioEnvio,
    name: "ORIGEM",
  })
  ORIGEM?: OrigemRelatorioEnvio;

  @Column({
    type: "enum",
    enum: StatusRelatorioEnvio,
    name: "STATUS",
  })
  STATUS?: StatusRelatorioEnvio;

  @Column({ type: "text", nullable: true, name: "MOTIVO_FALHA" })
  MOTIVO_FALHA?: string;

  @Column({ type: "jsonb", nullable: true, name: "DESTINATARIOS" })
  DESTINATARIOS?: string[];

  @Column({
    type: "enum",
    enum: AmbienteRelatorioEnvio,
    name: "AMBIENTE",
  })
  AMBIENTE?: AmbienteRelatorioEnvio;

  @CreateDateColumn({
    type: "timestamp",
    default: () => "CURRENT_TIMESTAMP",
    name: "CRIADO_EM",
  })
  CRIADO_EM?: Date;

  constructor(init?: Partial<PromotorRelatorioEnvio>) {
    Object.assign(this, init);
  }
}
