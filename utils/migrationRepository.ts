import { Repository, FindManyOptions, FindOneOptions, ObjectLiteral, DeepPartial, DataSource } from "typeorm";
import { AppDataSourceSync, LegacyDataSource, isLegacyEnabled } from "../data-source";

type EntityTarget<T> = new () => T;

/**
 * Repository wrapper que gerencia dual-connection durante migração.
 * - Escrita: sempre no banco novo (PRD)
 * - Leitura: merge do banco novo + legado (DEV), com prioridade ao novo
 * 
 * Quando LEGACY_DB_ENABLED=false, comporta-se como repository normal.
 */
export class MigrationAwareRepository<T extends ObjectLiteral> {
  private newRepo: Repository<T>;
  private legacyRepo: Repository<T> | null;
  private pkField: string;

  constructor(entity: EntityTarget<T>, primaryKeyField: string) {
    this.newRepo = AppDataSourceSync.getRepository(entity);
    this.legacyRepo = this.getLegacyRepo(entity);
    this.pkField = primaryKeyField;
  }

  private getLegacyRepo(entity: EntityTarget<T>): Repository<T> | null {
    if (!isLegacyEnabled() || !LegacyDataSource.isInitialized) {
      return null;
    }
    return LegacyDataSource.getRepository(entity);
  }

  /**
   * Busca registros de ambos os bancos e faz merge por PK.
   * Registros do banco novo têm prioridade.
   */
  async find(options?: FindManyOptions<T>): Promise<T[]> {
    const newResults = await this.newRepo.find(options);

    if (!this.legacyRepo) {
      return newResults;
    }

    try {
      const legacyResults = await this.legacyRepo.find(options);
      return this.mergeResults(newResults, legacyResults);
    } catch (err) {
      console.warn("⚠️ Legacy query failed, returning only new DB results:", (err as Error).message);
      return newResults;
    }
  }

  /**
   * Busca um registro por condição. Prioriza banco novo, fallback para legado.
   */
  async findOne(options: FindOneOptions<T>): Promise<T | null> {
    const newResult = await this.newRepo.findOne(options);

    if (newResult) {
      return newResult;
    }

    if (!this.legacyRepo) {
      return null;
    }

    try {
      return await this.legacyRepo.findOne(options);
    } catch (err) {
      console.warn("⚠️ Legacy findOne failed:", (err as Error).message);
      return null;
    }
  }

  /**
   * Salva SEMPRE no banco novo.
   */
  async save(entity: DeepPartial<T>): Promise<T> {
    return await this.newRepo.save(entity as any);
  }

  /**
   * Salva array SEMPRE no banco novo.
   */
  async saveMany(entities: DeepPartial<T>[]): Promise<T[]> {
    return await this.newRepo.save(entities as any);
  }

  /**
   * Cria instância (sem salvar) - sempre usando repo novo.
   */
  create(entityData: DeepPartial<T>): T {
    return this.newRepo.create(entityData as any) as unknown as T;
  }

  /**
   * Soft delete SEMPRE no banco novo.
   */
  async softDelete(id: number | number[]): Promise<void> {
    await this.newRepo.softDelete(id as any);
  }

  /**
   * Remove SEMPRE no banco novo.
   */
  async remove(entities: T[]): Promise<T[]> {
    return await this.newRepo.remove(entities);
  }

  /**
   * Update SEMPRE no banco novo.
   */
  async update(id: number, data: Partial<T>): Promise<void> {
    await this.newRepo.update(id, data as any);
  }

  /**
   * QueryBuilder SEMPRE no banco novo.
   */
  createQueryBuilder(alias?: string) {
    return this.newRepo.createQueryBuilder(alias);
  }

  /**
   * Acesso direto ao repository do banco novo (para operações avançadas).
   */
  getNewRepo(): Repository<T> {
    return this.newRepo;
  }

  /**
   * Acesso direto ao repository legado (pode ser null).
   */
  getLegacyRepoInstance(): Repository<T> | null {
    return this.legacyRepo;
  }

  /**
   * Merge de resultados com deduplicação por PK.
   * Registros do banco novo (newResults) têm prioridade.
   */
  private mergeResults(newResults: T[], legacyResults: T[]): T[] {
    const seen = new Set<any>();

    // Primeiro adiciona do novo (prioridade)
    for (const item of newResults) {
      seen.add((item as any)[this.pkField]);
    }

    // Adiciona do legado apenas se não existe no novo
    const uniqueLegacy = legacyResults.filter(
      (item) => !seen.has((item as any)[this.pkField])
    );

    return [...newResults, ...uniqueLegacy];
  }
}

/**
 * Helper para executar raw SQL em ambos os bancos e mergear resultados.
 * @param sql - Query SQL
 * @param params - Parâmetros da query
 * @param pkField - Nome do campo PK para deduplicação
 * @param legacySql - SQL alternativo para o banco legado (sem JOINs cross-schema)
 * @param legacyParams - Parâmetros alternativos para o banco legado
 */
export async function queryBothAndMerge<T = any>(
  sql: string,
  params: any[],
  pkField: string,
  legacySql?: string,
  legacyParams?: any[]
): Promise<T[]> {
  const newResults: T[] = await AppDataSourceSync.query(sql, params);

  if (!isLegacyEnabled() || !LegacyDataSource.isInitialized) {
    return newResults;
  }

  try {
    const queryToUse = legacySql || sql;
    const paramsToUse = legacyParams || params;
    const legacyResults: T[] = await LegacyDataSource.query(queryToUse, paramsToUse);

    // Deduplica por PK
    const seen = new Set<any>();
    for (const item of newResults) {
      seen.add((item as any)[pkField]);
    }

    const uniqueLegacy = legacyResults.filter(
      (item) => !seen.has((item as any)[pkField])
    );

    return [...newResults, ...uniqueLegacy];
  } catch (err) {
    console.warn("⚠️ Legacy raw query failed, returning only new DB results:", (err as Error).message);
    return newResults;
  }
}

/**
 * Helper para buscar um registro por ID em ambos os bancos (novo primeiro, fallback legado).
 */
export async function findOneFromBoth<T = any>(
  sql: string,
  params: any[],
): Promise<T | null> {
  const newResults: T[] = await AppDataSourceSync.query(sql, params);

  if (newResults.length > 0) {
    return newResults[0];
  }

  if (!isLegacyEnabled() || !LegacyDataSource.isInitialized) {
    return null;
  }

  try {
    const legacyResults: T[] = await LegacyDataSource.query(sql, params);
    return legacyResults.length > 0 ? legacyResults[0] : null;
  } catch (err) {
    console.warn("⚠️ Legacy findOne query failed:", (err as Error).message);
    return null;
  }
}
