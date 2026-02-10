import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  OneToOne,
  JoinColumn,
  OneToMany,
  ManyToOne,
} from "typeorm";
import Oficina from "./Oficina";

@Entity({ schema: "MAIN_REGISTER", name: "USUARIO" })
export default class Usuario {
  @PrimaryGeneratedColumn({ type: "int" })
  ID_USUARIO?: number;

  @Column({ type: "int", nullable: true })
  ID_FORUM?: number;

  @Column({ type: "int", nullable: true })
  ID_OFICINA?: number;

  @Column({ type: "varchar", length: 255, nullable: true })
  NOME: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  NICK_NAME: string;

  @Column({ type: "varchar", length: 255, nullable: false })
  EMAIL: string;

  @Column({ type: "varchar", length: 15, nullable: true })
  CPF: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  SEXO: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  NASCIMENTO: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  ESCOLARIDADE?: string;

  @Column({ type: "int", nullable: false })
  CARGO: number;

  @Column({ type: "varchar", length: 222, nullable: true })
  AREA_PROFISSIONAL?: string;

  @Column({ type: "int", default: 0, nullable: true })
  ADMIN: number;

  @Column({ type: "varchar", length: 45, nullable: true })
  CELULAR: string;

  @Column({ type: "varchar", nullable: false })
  FORUM: string;

  @Column({ type: "varchar", length: 45, nullable: true })
  TELEFONE?: string;

  @Column({ type: "varchar", length: 50, default: "", nullable: false })
  LOGIN?: string;

  @Column({ type: "int", default: 0, nullable: true })
  TERMOS?: number;

  @Column({ type: "char", length: 1, nullable: true })
  RECEBER_INFO?: string;

  @Column({ type: "char", length: 1, nullable: true })
  RECEBERINFO_PARCEIROS?: string;

  @Column({ type: "char", length: 1, nullable: false })
  EXCLUIDO?: string;

  @Column({ type: "char", length: 1, nullable: false })
  ATIVO: string;

  @Column({ type: "varchar", length: 50, nullable: true })
  PROFILE_PICTURE?: string;

  @Column({ type: "int", default: 0, nullable: false })
  APROVADO_ADMIN?: number;

  @Column({ type: "varchar", length: 100, nullable: false })
  PSW: string;

  @Column({ type: "varchar", length: 100, nullable: false })
  SENHA: string;

  @Column({ type: "varchar", length: 1, nullable: true })
  MALA_DIRETA?: string;

  @Column({ type: "varchar", length: 50, nullable: true })
  NOTIFICATION_TOKEN?: string;

  @Column({ type: "integer", nullable: true })
  ID_ENDERECO_RESIDENCIAL?: number;

  @Column({ type: "timestamp", nullable: true })
  DATA_ALTERACAO?: Date;

  @Column({ type: "boolean", nullable: true })
  ZF?: boolean | null;

  @Column({ type: "varchar", nullable: true })
  UTM_SOURCE?: string;

  @Column({ type: "varchar", nullable: true })
  UTM_MEDIUM?: string;

  @Column({ type: "varchar", nullable: true })
  UTM_CAMPAIGN?: string;

  @ManyToOne(() => Oficina, (oficina) => oficina.usuarios)
  @JoinColumn({ name: "ID_OFICINA" })
  oficina?: Oficina;

  constructor(init?: Partial<Usuario>) {
    Object.assign(this, init);
  }
}
