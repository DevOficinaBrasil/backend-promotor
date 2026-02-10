import { AppDataSourceSync } from "../data-source";
import RotaPromotor from "../entities/RotaPromotor";
import { In, IsNull } from "typeorm";

export default class RotaService {
  /**
   * Creates one or multiple routes in the database
   * @param ID_CAMPANHA_PROMOTOR - The campaign promoter ID
   * @param ID_OFICINA - Single workshop ID or array of workshop IDs
   * @param CREATED_BY - Optional user ID who created the route
   * @returns The created route(s)
   */
  static async createRotas(
    ID_CAMPANHA_PROMOTOR: number,
    ID_OFICINA: number | number[],
    CREATED_BY?: number
  ): Promise<RotaPromotor | RotaPromotor[]> {
    const rotaRepository = AppDataSourceSync.getRepository(RotaPromotor);

    // If single ID_OFICINA, create one route
    if (typeof ID_OFICINA === "number") {
      const novaRota = rotaRepository.create({
        ID_CAMPANHA_PROMOTOR,
        ID_OFICINA,
        CREATED_BY,
      });
      return await rotaRepository.save(novaRota);
    }

    // If array of ID_OFICINA, create multiple routes (batch creation)
    const novasRotas = ID_OFICINA.map((oficinaId) =>
      rotaRepository.create({
        ID_CAMPANHA_PROMOTOR,
        ID_OFICINA: oficinaId,
        CREATED_BY,
      })
    );
    return await rotaRepository.save(novasRotas);
  }

  /**
   * Updates workshops for a route (campaign promoter)
   * Soft deletes old links and creates new ones
   * @param ID_CAMPANHA_PROMOTOR - The campaign promoter ID
   * @param ID_OFICINA - Array of workshop IDs
   * @returns Object with created routes and deleted route IDs
   */
  static async updateRotaWorkshops(
    ID_CAMPANHA_PROMOTOR: number,
    ID_OFICINA: number[]
  ): Promise<{
    created: RotaPromotor[];
    deleted: number[];
  }> {
    const rotaRepository = AppDataSourceSync.getRepository(RotaPromotor);

    // Find existing routes for this campaign promoter (not deleted)
    const existingRotas = await rotaRepository.find({
      where: {
        ID_CAMPANHA_PROMOTOR,
        DELETED_AT: IsNull(),
      },
    });

    // Get existing workshop IDs
    const existingOficinaIds = existingRotas
      .map((rota) => rota.ID_OFICINA)
      .filter((id): id is number => id !== undefined && id !== null);

    // Determine which workshops to add (new ones not in existing)
    const workshopsToAdd = ID_OFICINA.filter(
      (id) => !existingOficinaIds.includes(id)
    );

    // Determine which routes to soft delete (existing not in new list)
    const rotasToDelete = existingRotas.filter(
      (rota) => rota.ID_OFICINA && !ID_OFICINA.includes(rota.ID_OFICINA)
    );

    // Soft delete routes that are no longer needed
    const deletedIds: number[] = [];
    if (rotasToDelete.length > 0) {
      const idsToDelete = rotasToDelete
        .map((rota) => rota.ID_ROTA_PROMOTOR)
        .filter((id): id is number => id !== undefined && id !== null);

      if (idsToDelete.length > 0) {
        await rotaRepository.softDelete(idsToDelete);
        deletedIds.push(...idsToDelete);
      }
    }

    // Create new routes for new workshops
    const createdRotas: RotaPromotor[] = [];
    if (workshopsToAdd.length > 0) {
      const novasRotas = workshopsToAdd.map((oficinaId) =>
        rotaRepository.create({
          ID_CAMPANHA_PROMOTOR,
          ID_OFICINA: oficinaId,
        })
      );
      const savedRotas = await rotaRepository.save(novasRotas);
      createdRotas.push(...savedRotas);
    }

    return {
      created: createdRotas,
      deleted: deletedIds,
    };
  }

  /**
   * Updates a route's options (not the workshops)
   * @param ID_ROTA_PROMOTOR - The route ID
   * @param updateData - The data to update (all fields optional)
   * @returns The updated route or null if not found
   */
  static async updateRotaOptions(
    ID_ROTA_PROMOTOR: number,
    updateData: Partial<RotaPromotor>
  ): Promise<RotaPromotor | null> {
    const rotaRepository = AppDataSourceSync.getRepository(RotaPromotor);

    // Find the route by ID
    const rotaExistente = await rotaRepository.findOne({
      where: { ID_ROTA_PROMOTOR },
    });

    if (!rotaExistente) {
      return null;
    }

    // Update the route fields
    Object.assign(rotaExistente, updateData);

    const rotaAtualizada = await rotaRepository.save(rotaExistente);

    return rotaAtualizada;
  }

  /**
   * Finds a route by ID
   * @param id - The route ID to find
   * @returns The route or null if not found
   */
  static async findRotaById(id: number): Promise<RotaPromotor | null> {
    const rotaRepository = AppDataSourceSync.getRepository(RotaPromotor);

    const rota = await rotaRepository.findOne({
      where: { ID_ROTA_PROMOTOR: id },
    });

    return rota;
  }

  /**
   * Gets a route by ID with its relationships
   * @param id - The route ID
   * @returns The route with related campaign promoter and results, or null if not found
   */
  static async getRotaByIdWithRelations(id: number): Promise<RotaPromotor | null> {
    const rotaRepository = AppDataSourceSync.getRepository(RotaPromotor);

    const rota = await rotaRepository.findOne({
      where: { ID_ROTA_PROMOTOR: id },
      relations: ['campanhaPromotor', 'campanhaPromotor.campanha', 'campanhaPromotor.promotor', 'campanhaResults'],
    });

    return rota;
  }
}
