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
import CampanhaResults from "./CampanhaResults";
import CampanhaPerguntaOpcao from "./CampanhaPerguntaOpcao";

export enum TipoPergunta {
  String = "String",
  Integer = "Integer",
  Boolean = "Boolean",
  Date = "Date",
  Float = "Float",
  Image = "Image",
  Multi = "Multi",
}

@Entity({ schema: "CAMPANHAS_OB", name: "CAMPANHA_PERGUNTAS" })
export default class CampanhaPerguntas {
  @PrimaryGeneratedColumn({ type: "int", name: "ID_PERGUNTAS" })
  ID_PERGUNTAS?: number;

  @Column({ type: "int", nullable: true, name: "ID_CAMPANHA" })
  ID_CAMPANHA?: number;

  @Column({ type: "varchar", length: 500, nullable: true, name: "PERGUNTA" })
  PERGUNTA?: string;

  @Column({
    type: "enum",
    enum: TipoPergunta,
    nullable: true,
    name: "TIPO",
  })
  TIPO?: TipoPergunta;

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

  @ManyToOne(() => Campanha, (campanha) => campanha.campanhaPerguntas)
  @JoinColumn({ name: "ID_CAMPANHA" })
  campanha: Campanha;

  @OneToMany(
    () => CampanhaResults,
    (campanhaResults) => campanhaResults.pergunta
  )
  campanhaResults: CampanhaResults[];

  @OneToMany(
    () => CampanhaPerguntaOpcao,
    (opcao) => opcao.pergunta
  )
  opcoes: CampanhaPerguntaOpcao[];

  constructor(init?: Partial<CampanhaPerguntas>) {
    Object.assign(this, init);
  }
}
