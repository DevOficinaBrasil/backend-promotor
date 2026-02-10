import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from "typeorm";
import RotaPromotor from "./RotaPromotor";
import CampanhaPerguntas from "./CampanhaPerguntas";

@Entity({ schema: "CAMPANHAS_OB", name: "CAMPANHA_RESULTS" })
export default class CampanhaResults {
  @PrimaryGeneratedColumn({ type: "int", name: "ID_CAMPANHA_RESULTS" })
  ID_CAMPANHA_RESULTS?: number;

  @Column({ type: "int", nullable: true, name: "ID_ROTA" })
  ID_ROTA?: number;

  @Column({ type: "int", nullable: true, name: "ID_PERGUNTA" })
  ID_PERGUNTA?: number;

  @Column({ type: "text", nullable: true, name: "RESPOSTA" })
  RESPOSTA?: string;

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

  @ManyToOne(() => RotaPromotor, (rotaPromotor) => rotaPromotor.campanhaResults)
  @JoinColumn({ name: "ID_ROTA" })
  rota: RotaPromotor;

  @ManyToOne(
    () => CampanhaPerguntas,
    (campanhaPerguntas) => campanhaPerguntas.campanhaResults
  )
  @JoinColumn({ name: "ID_PERGUNTA" })
  pergunta: CampanhaPerguntas;

  constructor(init?: Partial<CampanhaResults>) {
    Object.assign(this, init);
  }
}
