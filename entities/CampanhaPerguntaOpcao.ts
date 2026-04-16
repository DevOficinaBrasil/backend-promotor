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
import CampanhaPerguntas from "./CampanhaPerguntas";

@Entity({ schema: "CAMPANHAS_OB", name: "CAMPANHA_PERGUNTA_OPCOES" })
export default class CampanhaPerguntaOpcao {
  @PrimaryGeneratedColumn({ type: "int", name: "ID_OPCAO" })
  ID_OPCAO?: number;

  @Column({ type: "int", name: "ID_PERGUNTAS" })
  ID_PERGUNTAS: number;

  @Column({ type: "varchar", length: 500, name: "LABEL" })
  LABEL: string;

  @Column({ type: "int", default: 0, name: "ORDEM" })
  ORDEM: number;

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

  @DeleteDateColumn({ type: "timestamp", nullable: true, name: "DELETED_AT" })
  DELETED_AT?: Date;

  @ManyToOne(
    () => CampanhaPerguntas,
    (pergunta) => pergunta.opcoes
  )
  @JoinColumn({ name: "ID_PERGUNTAS" })
  pergunta: CampanhaPerguntas;

  constructor(init?: Partial<CampanhaPerguntaOpcao>) {
    Object.assign(this, init);
  }
}
