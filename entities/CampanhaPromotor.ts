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
import Campanha from "./Campanha";
import Promotor from "./Promotor";
import RotaPromotor from "./RotaPromotor";

@Entity({ schema: "CAMPANHAS_OB", name: "CAMPANHA_PROMOTOR" })
export default class CampanhaPromotor {
  @PrimaryGeneratedColumn({ type: "int", name: "ID_CAMPANHA_PROMOTOR" })
  ID_CAMPANHA_PROMOTOR?: number;

  @Column({ type: "int", nullable: true, name: "ID_CAMPANHA" })
  ID_CAMPANHA?: number;

  @Column({ type: "int", nullable: true, name: "ID_PROMOTOR" })
  ID_PROMOTOR?: number;

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

  @ManyToOne(() => Campanha, (campanha) => campanha.campanhaPromotores)
  @JoinColumn({ name: "ID_CAMPANHA" })
  campanha: Campanha;

  @ManyToOne(() => Promotor, (promotor) => promotor.campanhaPromotores)
  @JoinColumn({ name: "ID_PROMOTOR" })
  promotor: Promotor;

  @OneToMany(() => RotaPromotor, (rotaPromotor) => rotaPromotor.campanhaPromotor)
  rotasPromotor: RotaPromotor[];

  constructor(init?: Partial<CampanhaPromotor>) {
    Object.assign(this, init);
  }
}
