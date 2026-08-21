import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

/**
 * Comunidade do portal — a empresa/marca por trás de uma campanha.
 *
 * O elo com `CAMPANHA` é o slug (`CAMPANHA.EMPRESA_SLUG` → `EmpresaSlug`), não
 * `CAMPANHA.ID_CLIENT`: aquele ID vem do SQL Server e não corresponde a
 * nenhuma tabela alcançável a partir daqui.
 *
 * Diferente do resto do código, as colunas desta tabela não são
 * SCREAMING_SNAKE — são PascalCase legado do portal, por isso todo `name:`
 * explícito.
 */
@Entity({ schema: "OFICINA_PORTAL", name: "COMMUNITIES" })
export default class Community {
  @PrimaryGeneratedColumn({ type: "int", name: "CommunityID" })
  CommunityID?: number;

  @Column({ type: "varchar", nullable: true, name: "Nome" })
  Nome?: string;

  @Column({ type: "varchar", nullable: true, name: "EmpresaSlug" })
  EmpresaSlug?: string;

  /**
   * Logo da marca — chave relativa do bucket (`community/authomix/logo.png`),
   * não URL. O portal e o app prefixam com a base do S3; aqui isso é feito por
   * `urlS3()` antes de sair na resposta.
   */
  @Column({ type: "varchar", nullable: true, name: "Icon" })
  Icon?: string;
}
