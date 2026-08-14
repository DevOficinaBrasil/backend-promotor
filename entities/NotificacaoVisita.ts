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
    type: "text",
    enum: CanalNotificacao,
    default: CanalNotificacao.WHATSAPP,
    name: "CANAL",
  })
  CANAL?: CanalNotificacao;

  // The column is constrained by CHK_NOTIFICACAO_VISITA_STATUS, which must list
  // every member of StatusNotificacaoVisita — DISPENSADO and EXPIRADO included.
  @Column({
    type: "text",
    enum: StatusNotificacaoVisita,
    default: StatusNotificacaoVisita.PENDENTE,
    name: "STATUS",
  })
  STATUS?: StatusNotificacaoVisita;

  // Digits-only 55DDDNNNNNNNNN, not E.164 — see utils/telefone.ts.
  @Column({ type: "text", nullable: true, name: "TELEFONE_NORMALIZADO" })
  TELEFONE_NORMALIZADO?: string | null;

  // SHA-256 hex of the link token; NULL until a token is issued. Raw token never persisted.
  @Column({ type: "text", nullable: true, name: "TOKEN_HASH" })
  TOKEN_HASH?: string | null;

  // Token issuance time + 168h; NULL until a token is issued. timestamptz is
  // load-bearing: an expiry without a zone would depend on the writing session's
  // timezone. Always written in the same UPDATE as TOKEN_HASH.
  @Column({ type: "timestamptz", nullable: true, name: "EXPIRA_EM" })
  EXPIRA_EM?: Date | null;

  @Column({ type: "text", nullable: true, name: "ERRO_ENVIO" })
  ERRO_ENVIO?: string | null;

  // Colunas de fila do outbox (scripts/migration-outbox-notificacao-visita.sql).
  // Espelham CRM.integration_outbox do backend-communities — available_at,
  // locked_at, locked_by, attempts — para que a migração futura ao sistema de
  // entrega compartilhado seja mapeamento coluna a coluna.

  // NULL carrega significado: linha criada antes do outbox, já despachada pelo
  // fluxo inline antigo. A query de claim exige NOT NULL para que o primeiro
  // deploy do worker não reenvie o histórico.
  @Column({ type: "timestamptz", nullable: true, name: "AVAILABLE_AT" })
  AVAILABLE_AT?: Date | null;

  // Início do lease. O vencimento é comparado na query de claim contra
  // OUTBOX_VISITA_LOCK_LEASE_MINUTES, não gravado aqui — worker morto libera a
  // linha sozinho quando o lease vence.
  @Column({ type: "timestamptz", nullable: true, name: "LOCKED_AT" })
  LOCKED_AT?: Date | null;

  // outbox-visita-<pid> (cron) ou outbox-visita-cli-<pid> (console). Responde
  // "qual cópia do servidor pegou esta linha".
  @Column({ type: "text", nullable: true, name: "LOCKED_BY" })
  LOCKED_BY?: string | null;

  // Incrementado no mesmo statement do claim, não no fim do despacho: processo
  // morto no meio ainda queima tentativa, então linha que derruba o worker se
  // aposenta no teto em vez de repetir para sempre.
  @Column({ type: "int", default: 0, name: "ATTEMPTS" })
  ATTEMPTS?: number;

  @Column({ type: "text", nullable: true, name: "MESSAGE_ID" })
  MESSAGE_ID?: string | null;

  @Column({ type: "text", nullable: true, name: "PROVIDER_MESSAGE_ID" })
  PROVIDER_MESSAGE_ID?: string | null;

  @Column({ type: "timestamptz", nullable: true, name: "ENVIADO_EM" })
  ENVIADO_EM?: Date | null;

  @Column({ type: "timestamptz", nullable: true, name: "CONFIRMADO_EM" })
  CONFIRMADO_EM?: Date | null;

  // = ID_USUARIO at confirm time (JWT subject, not re-authenticated)
  @Column({ type: "int", nullable: true, name: "CONFIRMADO_POR" })
  CONFIRMADO_POR?: number | null;

  @Column({ type: "text", nullable: true, name: "CONFIRMADO_IP" })
  CONFIRMADO_IP?: string | null;

  @Column({ type: "boolean", default: false, name: "ENDERECO_ATUALIZADO" })
  ENDERECO_ATUALIZADO?: boolean;

  @CreateDateColumn({
    type: "timestamptz",
    default: () => "CURRENT_TIMESTAMP",
    name: "CREATED_AT",
  })
  CREATED_AT?: Date;

  @UpdateDateColumn({
    type: "timestamptz",
    default: () => "CURRENT_TIMESTAMP",
    name: "UPDATED_AT",
  })
  UPDATED_AT?: Date;

  // ORM-level join only — the house convention is implicit relationships, so
  // NOTIFICACAO_VISITA carries no database FK to ROTA_PROMOTOR. Referential
  // integrity is the application's responsibility; the one-notification-per-route
  // rule is what the DB enforces, via UNIQUE(ID_ROTA_PROMOTOR). Safe because the
  // data source runs with synchronize: false and never emits DDL from this.
  @ManyToOne(() => RotaPromotor)
  @JoinColumn({ name: "ID_ROTA_PROMOTOR" })
  rotaPromotor?: RotaPromotor;

  constructor(init?: Partial<NotificacaoVisita>) {
    Object.assign(this, init);
  }
}
