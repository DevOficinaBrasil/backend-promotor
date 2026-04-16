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
import Oficina from "./Oficina";

export enum EstrategiaOrdenacao {
  ROTA_OTIMIZADA = "ROTA_OTIMIZADA",
  MANUAL = "MANUAL",
  PROXIMIDADE_PROMOTOR = "PROXIMIDADE_PROMOTOR",
}

@Entity({ schema: "CAMPANHAS_OB", name: "CAMPANHA_PROMOTOR" })
export default class CampanhaPromotor {
  @PrimaryGeneratedColumn({ type: "int", name: "ID_CAMPANHA_PROMOTOR" })
  ID_CAMPANHA_PROMOTOR?: number;

  @Column({ type: "int", nullable: true, name: "ID_CAMPANHA" })
  ID_CAMPANHA?: number;

  @Column({ type: "int", nullable: true, name: "ID_PROMOTOR" })
  ID_PROMOTOR?: number;

  @Column({
    type: "varchar",
    length: 30,
    default: EstrategiaOrdenacao.PROXIMIDADE_PROMOTOR,
    nullable: true,
    name: "ESTRATEGIA_ORDENACAO",
  })
  ESTRATEGIA_ORDENACAO?: EstrategiaOrdenacao;

  @Column({ type: "int", nullable: true, name: "ID_OFICINA_INICIO" })
  ID_OFICINA_INICIO?: number;

  @Column({ type: "int", nullable: true, name: "ID_OFICINA_FIM" })
  ID_OFICINA_FIM?: number;

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

  @ManyToOne(() => Oficina)
  @JoinColumn({ name: "ID_OFICINA_INICIO" })
  oficinaInicio?: Oficina;

  @ManyToOne(() => Oficina)
  @JoinColumn({ name: "ID_OFICINA_FIM" })
  oficinaFim?: Oficina;

  constructor(init?: Partial<CampanhaPromotor>) {
    Object.assign(this, init);
  }
}
