import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn
} from "typeorm";
import RotaPromotor from "./RotaPromotor";
import Usuario from "./Usuario";

@Entity({ schema: "MAIN_REGISTER", name: "OFICINA" })
export default class Oficina {
  @PrimaryGeneratedColumn({ type: "int", name: "ID_OFICINA" })
  ID_OFICINA?: number;

  @Column({ type: "varchar", length: 200, nullable: true, name: "NOME_FANTASIA" })
  NOME_FANTASIA?: string;

  @Column({ type: "varchar", length: 200, nullable: true, name: "RAZAO_SOCIAL" })
  RAZAO_SOCIAL?: string;

  @Column({ type: "varchar", length: 50, nullable: true, name: "CNPJ" })
  CNPJ?: string;

  @Column({ type: "varchar", length: 200, nullable: true, name: "SITE" })
  SITE?: string;

  @Column({ type: "varchar", length: 85, nullable: true, name: "QUANTIDADE_FUNCIONARIOS" })
  QUANTIDADE_FUNCIONARIOS?: string;

  @Column({ type: "varchar", length: 50, nullable: true, name: "ESTOQUE_PECAS" })
  ESTOQUE_PECAS?: string;

  @Column({ type: "varchar", length: 50, nullable: true, name: "QUANTIDADE_VEICULOS" })
  QUANTIDADE_VEICULOS?: string;

  @Column({ type: "varchar", length: 20, nullable: true, name: "ATIVO" })
  ATIVO?: string;

  @Column({ type: "varchar", length: 30, nullable: true, name: "ELEVADOR" })
  ELEVADOR?: string;

  @Column({ type: "varchar", length: 50, nullable: true, name: "QUANTIDADE_ELEVADOR" })
  QUANTIDADE_ELEVADOR?: string;

  @Column({ type: "varchar", length: 20, nullable: true, name: "TELEFONE" })
  TELEFONE?: string;

  @Column({ type: "varchar", length: 150, nullable: true, name: "EMAIL_COMERCIAL" })
  EMAIL_COMERCIAL?: string;

  @Column({ type: "varchar", length: 80, nullable: true, name: "ORIGEM" })
  ORIGEM?: string;

  @Column({ type: "int", nullable: true, name: "RAMO_ATIVIDADE" })
  RAMO_ATIVIDADE?: number;

  @Column({ type: "varchar", length: 200, nullable: true, name: "ENDERECO" })
  ENDERECO?: string;

  @Column({ type: "varchar", length: 200, nullable: true, name: "BAIRRO" })
  BAIRRO?: string;

  @Column({ type: "varchar", length: 200, nullable: true, name: "NUMERO" })
  NUMERO?: string;

  @Column({ type: "varchar", length: 50, nullable: true, name: "ESTADO" })
  ESTADO?: string;

  @Column({ type: "varchar", length: 150, nullable: true, name: "CIDADE" })
  CIDADE?: string;

  @Column({ type: "varchar", length: 30, nullable: true, name: "CEP" })
  CEP?: string;

  @Column({ type: "varchar", length: 150, nullable: true, name: "COMPLEMENTO" })
  COMPLEMENTO?: string;

  @Column({ type: "varchar", length: 80, nullable: true, name: "STATUS" })
  STATUS?: string;

  @Column({ type: "varchar", length: 1, nullable: true, name: "ROTA" })
  ROTA?: string;

  @Column({ type: "varchar", length: 20, nullable: true, name: "LONGITUDE" })
  LONGITUDE?: string;

  @Column({ type: "varchar", length: 20, nullable: true, name: "LATITUDE" })
  LATITUDE?: string;

  @Column({ type: "timestamp with time zone", nullable: true, name: "DATA_FUNDACAO" })
  DATA_FUNDACAO?: Date;

  @CreateDateColumn({
    type: "timestamp with time zone",
    default: () => "CURRENT_TIMESTAMP",
    name: "DATA_CADASTRO",
  })
  DATA_CADASTRO?: Date;

  @UpdateDateColumn({
    type: "timestamp with time zone",
    default: () => "CURRENT_TIMESTAMP",
    name: "DATA_ALTERACAO",
  })
  DATA_ALTERACAO?: Date;

  @Column({ type: "int", nullable: true, name: "ID_VW" })
  ID_VW?: number;

  @OneToMany(() => RotaPromotor, (rotaPromotor) => rotaPromotor.oficina)
  rotasPromotor: RotaPromotor[];

  @OneToMany(() => Usuario, (usuario) => usuario.oficina)
  usuarios: Usuario[];

  constructor(init?: Partial<Oficina>) {
    Object.assign(this, init);
  }
}
