import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from "typeorm";
import RotaPromotor from "./RotaPromotor";
import Usuario from "./Usuario";

@Entity({ schema: "MAIN_REGISTER", name: "OFICINA" })
export default class Oficina {
  @PrimaryGeneratedColumn({ type: "int", name: "ID_OFICINA" })
  ID_OFICINA?: number;

  @Column({ type: "varchar", length: 255, nullable: true, name: "NOME" })
  NOME?: string;

  @Column({ type: "varchar", length: 255, nullable: true, name: "RAZAO_SOCIAL" })
  RAZAO_SOCIAL?: string;

  @Column({ type: "varchar", length: 20, nullable: true, name: "CNPJ" })
  CNPJ?: string;

  @Column({ type: "varchar", length: 255, nullable: true, name: "EMAIL" })
  EMAIL?: string;

  @Column({ type: "varchar", length: 20, nullable: true, name: "TELEFONE" })
  TELEFONE?: string;

  @Column({ type: "varchar", length: 255, nullable: true, name: "ENDERECO" })
  ENDERECO?: string;

  @Column({ type: "varchar", length: 100, nullable: true, name: "CIDADE" })
  CIDADE?: string;

  @Column({ type: "varchar", length: 2, nullable: true, name: "ESTADO" })
  ESTADO?: string;

  @Column({ type: "varchar", length: 10, nullable: true, name: "CEP" })
  CEP?: string;

  @Column({ type: "text", nullable: true, name: "LOCALIZACAO" })
  LOCALIZACAO?: string;

  @Column({ type: "varchar", length: 1, nullable: true, name: "ATIVO" })
  ATIVO?: string;

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

  @OneToMany(() => RotaPromotor, (rotaPromotor) => rotaPromotor.oficina)
  rotasPromotor: RotaPromotor[];

  @OneToMany(() => Usuario, (usuario) => usuario.oficina)
  usuarios: Usuario[];

  constructor(init?: Partial<Oficina>) {
    Object.assign(this, init);
  }
}
