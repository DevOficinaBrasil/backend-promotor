import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from "typeorm";
import CampanhaPromotor from "./CampanhaPromotor";

@Entity({ schema: "CAMPANHAS_OB", name: "PROMOTOR" })
export default class Promotor {
  @PrimaryGeneratedColumn({ type: "int", name: "ID_PROMOTOR" })
  ID_PROMOTOR?: number;

  @Column({ type: "varchar", length: 255, nullable: false, name: "NOME" })
  NOME: string;

  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    unique: true,
    name: "EMAIL",
  })
  EMAIL?: string;

  @Column({
    type: "varchar",
    length: 14,
    nullable: true,
    unique: true,
    name: "CPF",
  })
  CPF?: string;

  @Column({ type: "varchar", length: 255, nullable: true, name: "SENHA" })
  SENHA?: string;

  @Column({ type: "int", nullable: true, name: "ID_CLIENT" })
  ID_CLIENT?: number;

  @Column({ type: "int", nullable: true, name: "CREATED_BY" })
  CREATED_BY?: number;

  @Column({ type: "varchar", length: 30, nullable: true, name: "CEP" })
  CEP?: string;

  @Column({ type: "float8", nullable: true, name: "LONGITUDE" })
  LONGITUDE?: number | null;

  @Column({ type: "float8", nullable: true, name: "LATITUDE" })
  LATITUDE?: number | null;

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

  @OneToMany(
    () => CampanhaPromotor,
    (campanhaPromotor) => campanhaPromotor.promotor
  )
  campanhaPromotores: CampanhaPromotor[];

  constructor(init?: Partial<Promotor>) {
    Object.assign(this, init);
  }
}
