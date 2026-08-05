import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import RotaPromotor from "./RotaPromotor";

export enum CanalNotificacao {
  WHATSAPP = "WHATSAPP",
}

export enum StatusNotificacaoVisita {
  PENDENTE = "PENDENTE",
  ENVIADO = "ENVIADO",
  FALHOU = "FALHOU", // something went wrong
  DISPENSADO = "DISPENSADO", // deliberately not sent (anti-spam / fresh address) — NOT a failure
  CONFIRMADO = "CONFIRMADO",
  EXPIRADO = "EXPIRADO",
  REAGENDADO = "REAGENDADO", // reserved — NOTIF-26, no code path sets/reads this yet
}

@Entity({ schema: "CAMPANHAS_OB", name: "NOTIFICACAO_VISITA" })
export default class NotificacaoVisita {
  @PrimaryGeneratedColumn({ type: "int", name: "ID_NOTIFICACAO_VISITA" })
  ID_NOTIFICACAO_VISITA?: number;

  @Column({ type: "int", name: "ID_ROTA_PROMOTOR" })
  ID_ROTA_PROMOTOR?: number;

  // Resolved recipient; NULL until a recipient is resolved, stays NULL on the
  // "no recipient with phone" path. Usuario lives in MAIN_REGISTER (read-only),
  // same cross-schema pattern RotaPromotor already uses for Oficina, so this is
  // stored as a plain FK-shaped column rather than a @ManyToOne.
  @Column({ type: "int", nullable: true, name: "ID_USUARIO" })
  ID_USUARIO?: number | null;

  @Column({
    type: "varchar",
    length: 20,
    enum: CanalNotificacao,
    default: CanalNotificacao.WHATSAPP,
    name: "CANAL",
  })
  CANAL?: CanalNotificacao;

  @Column({
    type: "varchar",
    length: 20,
    enum: StatusNotificacaoVisita,
    default: StatusNotificacaoVisita.PENDENTE,
    name: "STATUS",
  })
  STATUS?: StatusNotificacaoVisita;

  @Column({ type: "varchar", length: 20, nullable: true, name: "TELEFONE_NORMALIZADO" })
  TELEFONE_NORMALIZADO?: string | null;

  // SHA-256 hex of the link token; NULL until a token is issued. Raw token never persisted.
  @Column({ type: "varchar", length: 64, nullable: true, name: "TOKEN_HASH" })
  TOKEN_HASH?: string | null;

  // Token issuance time + 48h; NULL until a token is issued.
  @Column({ type: "timestamp", nullable: true, name: "EXPIRA_EM" })
  EXPIRA_EM?: Date | null;

  @Column({ type: "text", nullable: true, name: "ERRO_ENVIO" })
  ERRO_ENVIO?: string | null;

  @Column({ type: "varchar", length: 100, nullable: true, name: "MESSAGE_ID" })
  MESSAGE_ID?: string | null;

  @Column({ type: "varchar", length: 100, nullable: true, name: "PROVIDER_MESSAGE_ID" })
  PROVIDER_MESSAGE_ID?: string | null;

  @Column({ type: "timestamp", nullable: true, name: "ENVIADO_EM" })
  ENVIADO_EM?: Date | null;

  @Column({ type: "timestamp", nullable: true, name: "CONFIRMADO_EM" })
  CONFIRMADO_EM?: Date | null;

  // = ID_USUARIO at confirm time (JWT subject, not re-authenticated)
  @Column({ type: "int", nullable: true, name: "CONFIRMADO_POR" })
  CONFIRMADO_POR?: number | null;

  @Column({ type: "varchar", length: 45, nullable: true, name: "CONFIRMADO_IP" })
  CONFIRMADO_IP?: string | null;

  @Column({ type: "boolean", default: false, name: "ENDERECO_ATUALIZADO" })
  ENDERECO_ATUALIZADO?: boolean;

  @CreateDateColumn({
    type: "timestamp",
    default: () => "CURRENT_TIMESTAMP",
    name: "CREATED_AT",
  })
  CREATED_AT?: Date;

  @UpdateDateColumn({
    type: "timestamp",
    default: () => "CURRENT_TIMESTAMP",
    name: "UPDATED_AT",
  })
  UPDATED_AT?: Date;

  @ManyToOne(() => RotaPromotor)
  @JoinColumn({ name: "ID_ROTA_PROMOTOR" })
  rotaPromotor?: RotaPromotor;

  constructor(init?: Partial<NotificacaoVisita>) {
    Object.assign(this, init);
  }
}
