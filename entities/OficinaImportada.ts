import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from "typeorm";

/**
 * Vínculo direto oficina↔cliente, independente de usuário/comunidade.
 *
 * `ID_OFICINA` aponta para `MAIN_REGISTER.OFICINA` sem FK física entre schemas
 * (mesmo padrão já usado por `RotaPromotor.ID_OFICINA`). Sem coluna `ORIGEM`:
 * `MAIN_REGISTER.OFICINA.ORIGEM` já guarda a origem do cadastro da oficina —
 * obtida via join quando necessário, nunca duplicada aqui.
 */
@Entity({ schema: "CAMPANHAS_OB", name: "OFICINA_IMPORTADA" })
export default class OficinaImportada {
  @PrimaryGeneratedColumn({ type: "int", name: "ID_OFICINA_IMPORTADA" })
  ID_OFICINA_IMPORTADA?: number;

  @Column({ type: "int", nullable: true, name: "ID_OFICINA" })
  ID_OFICINA?: number;

  @Column({ type: "varchar", length: 100, nullable: true, name: "EMPRESA_SLUG" })
  EMPRESA_SLUG?: string;

  @Column({ type: "int", nullable: true, name: "ID_CAMPANHA" })
  ID_CAMPANHA?: number;

  @Column({ type: "int", nullable: true, name: "CREATED_BY" })
  CREATED_BY?: number;

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

  constructor(init?: Partial<OficinaImportada>) {
    Object.assign(this, init);
  }
}
