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
import CampanhaPerguntas from "./CampanhaPerguntas";

@Entity({ schema: "CAMPANHAS_OB", name: "CAMPANHA" })
export default class Campanha {
  @PrimaryGeneratedColumn({ type: "int", name: "ID_CAMPANHA" })
  ID_CAMPANHA?: number;

  @Column({ type: "varchar", length: 255, nullable: false, name: "NOME" })
  NOME: string;

  // Note: Field name matches database schema exactly (OBEJTIVO), not corrected to OBJETIVO
  @Column({ type: "varchar", length: 50, nullable: true, name: "OBEJTIVO" })
  OBEJTIVO?: string;

  @Column({ type: "text", nullable: true, name: "PONTO_INICIAL" })
  PONTO_INICIAL?: string;

  @Column({ type: "int", nullable: true, name: "ID_CLIENT" })
  ID_CLIENT?: number;

  @Column({ type: "timestamp", nullable: true, name: "START_TIME" })
  START_TIME?: Date;

  @Column({ type: "timestamp", nullable: true, name: "END_TIME" })
  END_TIME?: Date;

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

  @OneToMany(
    () => CampanhaPromotor,
    (campanhaPromotor) => campanhaPromotor.campanha
  )
  campanhaPromotores: CampanhaPromotor[];

  @OneToMany(
    () => CampanhaPerguntas,
    (campanhaPerguntas) => campanhaPerguntas.campanha
  )
  campanhaPerguntas: CampanhaPerguntas[];

  constructor(init?: Partial<Campanha>) {
    Object.assign(this, init);
  }
}
