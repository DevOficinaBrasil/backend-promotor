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

@Entity({ schema: "dw", name: "cadastro_empresa" })
export default class Empresa {
  @PrimaryGeneratedColumn({ type: "int", name: "id_oficina" })
  ID_OFICINA?: number;

  @Column({ type: "varchar", length: 200, nullable: true, name: "razao_social" })
  NOME_FANTASIA?: string;

  @Column({ type: "varchar", length: 50, nullable: true, name: "cnpj" })
  CNPJ?: string;


  @Column({ type: "varchar", length: 20, nullable: true, name: "status_receita" })
  ATIVO?: string;


  @Column({ type: "varchar", length: 20, nullable: true, name: "telefone" })
  TELEFONE?: string;

 @Column({ type: "varchar", length: 200, nullable: true, name: "logradouro" })
  LOGRADOURO?: string;

  @Column({ type: "varchar", length: 200, nullable: true, name: "rua" })
  ENDERECO?: string;

  @Column({ type: "varchar", length: 200, nullable: true, name: "bairro" })
  BAIRRO?: string;

  @Column({ type: "varchar", length: 200, nullable: true, name: "numero" })
  NUMERO?: string;

  @Column({ type: "varchar", length: 50, nullable: true, name: "estado" })
  ESTADO?: string;

  @Column({ type: "varchar", length: 150, nullable: true, name: "cidade" })
  CIDADE?: string;

  @Column({ type: "varchar", length: 30, nullable: true, name: "cep" })
  CEP?: string;

  @Column({ type: "varchar", length: 150, nullable: true, name: "complemento" })
  COMPLEMENTO?: string;

  // A identidade real da linha. `id_oficina` NÃO é chave aqui: os índices únicos
  // da tabela são sobre `cnpj_int` e sobre `(cnpj_int, id_oficina)`, e em PRD há
  // 59 valores de `id_oficina` repetidos cobrindo 128 linhas — até 5 CNPJs
  // distintos sob o mesmo id. Escrita que filtre só por `id_oficina` atinge
  // cadastro de outra empresa. bigint chega como string no TypeORM.
  @Column({ type: "bigint", nullable: true, name: "cnpj_int" })
  CNPJ_INT?: string;


  @Column({ type: "varchar", length: 20, nullable: true, name: "longitude" })
  LONGITUDE?: string;

  @Column({ type: "varchar", length: 20, nullable: true, name: "latitude" })
  LATITUDE?: string;

  @OneToMany(() => RotaPromotor, (rotaPromotor) => rotaPromotor.oficina)
  rotasPromotor: RotaPromotor[];

  @OneToMany(() => Usuario, (usuario) => usuario.oficina)
  usuarios: Usuario[];

  constructor(init?: Partial<Empresa>) {
    Object.assign(this, init);
  }
}
