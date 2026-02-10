import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from "typeorm";
import CampanhaPromotor from "./CampanhaPromotor";
import CampanhaResults from "./CampanhaResults";
import Oficina from "./Oficina";

export enum StatusRota {
  BACKLOG = "BACKLOG",
  A_CAMINHO = "A CAMINHO",
  EM_ANDAMENTO = "EM ANDAMENTO",
  FINALIZADO = "FINALIZADO",
  CANCELADO = "CANCELADO",
}

export enum RedirectRota {
  SAC = "SAC",
  VENDAS = "VENDAS",
  LOGISTICA = "LOGÍSTICA", // Note: Constant name without accent, value with accent to match database
}

@Entity({ schema: "CAMPANHAS_OB", name: "ROTA_PROMOTOR" })
export default class RotaPromotor {
  @PrimaryGeneratedColumn({ type: "int", name: "ID_ROTA_PROMOTOR" })
  ID_ROTA_PROMOTOR?: number;

  @Column({ type: "int", nullable: true, name: "ID_OFICINA" })
  ID_OFICINA?: number;

  @Column({ type: "int", nullable: true, name: "ID_CAMPANHA_PROMOTOR" })
  ID_CAMPANHA_PROMOTOR?: number;

  @Column({
    type: "enum",
    enum: StatusRota,
    default: StatusRota.BACKLOG,
    name: "STATUS",
  })
  STATUS?: StatusRota;

  @Column({ type: "boolean", nullable: true, name: "SUCCESS" })
  SUCCESS?: boolean;

  @Column({ type: "timestamp", nullable: true, name: "CHECKIN_TIME" })
  CHECKIN_TIME?: Date;

  @Column({ type: "timestamp", nullable: true, name: "DONE_AT" })
  DONE_AT?: Date;

  @Column({ type: "text", nullable: true, name: "OBS" })
  OBS?: string;

  @Column({
    type: "enum",
    enum: RedirectRota,
    nullable: true,
    name: "REDIRECT",
  })
  REDIRECT?: RedirectRota;

  @Column({ type: "int", nullable: true, name: "CREATED_BY" })
  CREATED_BY?: number;

  @UpdateDateColumn({
    type: "timestamp",
    default: () => "CURRENT_TIMESTAMP",
    name: "UPDATED_AT",
  })
  UPDATED_AT?: Date;

  @CreateDateColumn({
    type: "timestamp",
    default: () => "CURRENT_TIMESTAMP",
    name: "CREATED_AT",
  })
  CREATED_AT?: Date;

  @DeleteDateColumn({ type: "timestamp", nullable: true, name: "DELETED_AT" })
  DELETED_AT?: Date;

  @ManyToOne(
    () => CampanhaPromotor,
    (campanhaPromotor) => campanhaPromotor.rotasPromotor
  )
  @JoinColumn({ name: "ID_CAMPANHA_PROMOTOR" })
  campanhaPromotor: CampanhaPromotor;

  @ManyToOne(() => Oficina, (oficina) => oficina.rotasPromotor)
  @JoinColumn({ name: "ID_OFICINA" })
  oficina?: Oficina;

  @OneToMany(
    () => CampanhaResults,
    (campanhaResults) => campanhaResults.rota
  )
  campanhaResults: CampanhaResults[];

  constructor(init?: Partial<RotaPromotor>) {
    Object.assign(this, init);
  }
}
