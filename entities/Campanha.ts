import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from "typeorm";
import CampanhaPromotor from "./CampanhaPromotor";
import CampanhaPerguntas from "./CampanhaPerguntas";

/**
 * A campanha nasce RASCUNHO e só fica visível para o promotor
 * (GET /campanha/ativa) depois de publicada pelo wizard do ob-ads.
 */
export type CampanhaStatus = "RASCUNHO" | "PUBLICADA";

@Entity({ schema: "CAMPANHAS_OB", name: "CAMPANHA" })
export default class Campanha {
  @PrimaryGeneratedColumn({ type: "int", name: "ID_CAMPANHA" })
  ID_CAMPANHA?: number;

  @Column({
    type: "varchar",
    length: 20,
    nullable: false,
    default: "RASCUNHO",
    name: "STATUS",
  })
  STATUS?: CampanhaStatus;

  @Column({ type: "varchar", length: 255, nullable: false, name: "NOME" })
  NOME: string;

  // Note: Field name matches database schema exactly (OBJETIVO), not corrected to OBJETIVO
  @Column({ type: "varchar", length: 50, nullable: true, name: "OBJETIVO" })
  OBJETIVO?: string;

  // OBS: esse ID é o ID do sql server, não use-o para associar com comunidades, use EMPRESA_SLUG para tal
  @Column({ type: "int", nullable: true, name: "ID_CLIENT" })
  ID_CLIENT?: number;

  @Column({ type: "varchar", length: 100, nullable: true, name: "EMPRESA_SLUG" })
  EMPRESA_SLUG?: string;

  /**
   * Segmentação definida uma vez para a campanha (DSL @obcrm/segmentation).
   * Recorta as oficinas elegíveis da comunidade e é herdada pelos vínculos
   * criados depois; filtro próprio do vínculo prevalece. NULL = sem filtro.
   */
  @Column({ type: "jsonb", nullable: true, name: "FILTRO_SEGMENTACAO" })
  FILTRO_SEGMENTACAO?: Record<string, unknown> | null;

  @Column({ type: "timestamp", nullable: true, name: "START_TIME" })
  START_TIME?: Date;

  @Column({ type: "timestamp", nullable: true, name: "END_TIME" })
  END_TIME?: Date;

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

  @OneToMany(
    () => CampanhaPromotor,
    (campanhaPromotor) => campanhaPromotor.campanha
  )
  campanhaPromotores: CampanhaPromotor[];

  @OneToMany(
    () => CampanhaPerguntas,
    (campanhaPerguntas) => campanhaPerguntas.campanha
  )
  campanhaPerguntas: CampanhaPerguntas[];

  constructor(init?: Partial<Campanha>) {
    Object.assign(this, init);
  }
}
