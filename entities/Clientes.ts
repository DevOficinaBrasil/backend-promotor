import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';


@Entity({ schema: 'MAIN_REGISTER', name: 'CLIENTES' })
export default class Clientes {
  @PrimaryGeneratedColumn()
  ID: number;

  @Column({ type: 'varchar', length: 255, nullable: false })
  NOME: string;

}
