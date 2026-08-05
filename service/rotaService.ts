import { AppDataSourceSync } from "../data-source";
import RotaPromotor from "../entities/RotaPromotor";
import CampanhaPromotor, { EstrategiaOrdenacao } from "../entities/CampanhaPromotor";
import { In, IsNull } from "typeorm";
import { optimizeRoute, fetchOSRMRoute } from "../utils/routeOptimizer";
import { MigrationAwareRepository } from "../utils/migrationRepository";
import NotificacaoVisitaService from "./notificacaoVisitaService";
import { statusEfetivo } from "../utils/statusNotificacaoVisita";

export default class RotaService {
  private static getRotaRepo() {
    return new MigrationAwareRepository<RotaPromotor>(RotaPromotor, "ID_ROTA_PROMOTOR");
  }

  private static getCampanhaPromotorRepo() {
    return new MigrationAwareRepository<CampanhaPromotor>(CampanhaPromotor, "ID_CAMPANHA_PROMOTOR");
  }

  /**
   * Notifies the workshop for each newly created route, one notification per
   * route.
   *
   * Isolated per route: a notification failure never propagates, so route
   * creation always returns successfully (spec AC10). This catch is belt and
   * braces on top of notificarVisita's own internal handling.
   */
  private static async notificarRotasCriadas(rotas: RotaPromotor[]): Promise<void> {
    for (const rota of rotas) {
      try {
        await NotificacaoVisitaService.notificarVisita(rota);
      } catch (erro) {
        console.error("[rotaService] falha ao notificar visita", {
          ID_ROTA_PROMOTOR: rota?.ID_ROTA_PROMOTOR,
          erro: (erro as Error)?.message,
        });
      }
    }
  }

  /**
   * Creates one or multiple routes in the database (always on new DB)
   */
  static async createRotas(
    ID_CAMPANHA_PROMOTOR: number,
    ID_OFICINA: number | number[],
    CREATED_BY?: number
  ): Promise<RotaPromotor | RotaPromotor[]> {
    const repo = this.getRotaRepo();

    // If single ID_OFICINA, create one route
    if (typeof ID_OFICINA === "number") {
      const novaRota = repo.create({
        ID_CAMPANHA_PROMOTOR,
        ID_OFICINA,
        CREATED_BY,
      });
      const rotaSalva = await repo.save(novaRota);
      await this.notificarRotasCriadas([rotaSalva]);
      return rotaSalva;
    }

    // If array of ID_OFICINA, create multiple routes (batch creation)
    const novasRotas = ID_OFICINA.map((oficinaId) =>
      repo.create({
        ID_CAMPANHA_PROMOTOR,
        ID_OFICINA: oficinaId,
        CREATED_BY,
      })
    );
    const rotasSalvas = await repo.saveMany(novasRotas);
    await this.notificarRotasCriadas(rotasSalvas);
    return rotasSalvas;
  }

  /**
   * Creates a campaign promoter and its associated routes with workshops
   * @param ID_PROMOTOR - The promoter ID
   * @param ID_CAMPANHA - The campaign ID
   * @param ID_OFICINA - Array of workshop IDs
   * @param CREATED_BY - Optional user ID who created the route
   * @returns Object with created campaign promoter and routes
   */
  static async createRotaWithCampanhaPromotor(
    ID_PROMOTOR: number,
    ID_CAMPANHA: number,
    ID_OFICINA: number[],
    CREATED_BY?: number
  ): Promise<{
    campanhaPromotor: CampanhaPromotor;
    rotas: RotaPromotor[];
  }> {
    // Use transaction to ensure atomicity
    const resultado = await AppDataSourceSync.transaction(async (transactionalEntityManager) => {
      // Create the CampanhaPromotor
      const novaCampanhaPromotor = transactionalEntityManager.create(CampanhaPromotor, {
        ID_PROMOTOR,
        ID_CAMPANHA,
      });
      const campanhaPromotorSalva = await transactionalEntityManager.save(novaCampanhaPromotor);

      // Create routes for each workshop
      const novasRotas = ID_OFICINA.map((oficinaId) =>
        transactionalEntityManager.create(RotaPromotor, {
          ID_CAMPANHA_PROMOTOR: campanhaPromotorSalva.ID_CAMPANHA_PROMOTOR,
          ID_OFICINA: oficinaId,
          CREATED_BY,
        })
      );
      const rotasSalvas = await transactionalEntityManager.save(novasRotas);

      return {
        campanhaPromotor: campanhaPromotorSalva,
        rotas: rotasSalvas,
      };
    });

    // Notify after the transaction commits, so a rolled-back creation never
    // produces a notification for routes that do not exist.
    await this.notificarRotasCriadas(resultado.rotas);

    return resultado;
  }

  /**
   * Updates workshops for a route (campaign promoter)
   * Soft deletes old links and creates new ones
   */
  static async updateRotaWorkshops(
    ID_CAMPANHA_PROMOTOR: number,
    ID_OFICINA: number[]
  ): Promise<{
    created: RotaPromotor[];
    deleted: number[];
  }> {
    const repo = this.getRotaRepo();

    // Find existing routes for this campaign promoter (not deleted) - from both DBs
    const existingRotas = await repo.find({
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

    // Soft delete routes that are no longer needed (on new DB)
    const deletedIds: number[] = [];
    if (rotasToDelete.length > 0) {
      const idsToDelete = rotasToDelete
        .map((rota) => rota.ID_ROTA_PROMOTOR)
        .filter((id): id is number => id !== undefined && id !== null);

      if (idsToDelete.length > 0) {
        await repo.softDelete(idsToDelete as any);
        deletedIds.push(...idsToDelete);
      }
    }

    // Create new routes for new workshops (on new DB)
    const createdRotas: RotaPromotor[] = [];
    if (workshopsToAdd.length > 0) {
      const novasRotas = workshopsToAdd.map((oficinaId) =>
        repo.create({
          ID_CAMPANHA_PROMOTOR,
          ID_OFICINA: oficinaId,
        })
      );
      const savedRotas = await repo.saveMany(novasRotas);
      createdRotas.push(...savedRotas);
      await this.notificarRotasCriadas(savedRotas);
    }

    return {
      created: createdRotas,
      deleted: deletedIds,
    };
  }

  /**
   * Updates a route's options (not the workshops)
   */
  static async updateRotaOptions(
    ID_ROTA_PROMOTOR: number,
    updateData: Partial<RotaPromotor>
  ): Promise<RotaPromotor | null> {
    const repo = this.getRotaRepo();

    // Find the route by ID (searches both DBs)
    const rotaExistente = await repo.findOne({
      where: { ID_ROTA_PROMOTOR },
    });

    if (!rotaExistente) {
      return null;
    }

    // Update the route fields (saves to new DB)
    Object.assign(rotaExistente, updateData);

    const rotaAtualizada = await repo.save(rotaExistente);

    return rotaAtualizada;
  }

  /**
   * Finds a route by ID
   */
  static async findRotaById(id: number): Promise<RotaPromotor | null> {
    const repo = this.getRotaRepo();

    const rota = await repo.findOne({
      where: { ID_ROTA_PROMOTOR: id },
    });

    return rota;
  }

  /**
   * Gets a route by ID with its relationships
   */
  static async getRotaByIdWithRelations(id: number): Promise<RotaPromotor | null> {
    const repo = this.getRotaRepo();

    const rota = await repo.findOne({
      where: { ID_ROTA_PROMOTOR: id },
      relations: ['campanhaPromotor', 'campanhaPromotor.campanha', 'campanhaPromotor.promotor', 'campanhaResults', 'notificacaoVisita'],
    });

    // Report the *effective* status (NOTIF-19) — a stored ENVIADO whose
    // EXPIRA_EM has silently passed must read EXPIRADO here too, or an
    // unopened expired link would look live on the dashboard forever
    // (spec AC22). Routes with no notification row are left untouched.
    if (rota?.notificacaoVisita) {
      rota.notificacaoVisita.STATUS = statusEfetivo(rota.notificacaoVisita);
    }

    return rota;
  }

  static async getGeolocationDataByCep(
    cep: string
  ): Promise<{ lat: number; lng: number } | null> {
    // se por alguma razao for gravado cep com mask, esse trecho remove
    console.log(Number.isNaN(Number(cep)), cep);
    if (Number.isNaN(Number(cep))) {
      cep = cep.replace(/[^0-9]/g, "");
    }

    try {
      const result = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${cep}&key=AIzaSyCbuATYcvKcRjZ8maC3bsPk_zL5GMk_qaQ`
      );

      if (result.ok) {
        const response = await result.json();

        const results = (response as any)?.results[0] || null;

        if (results) {
          const location = results?.geometry?.location || null;

          return location;
        }

        return null;
      }
    } catch (e) {
      console.log("Error getGeolocationDataByCep()");
      throw new Error((e as Error).message);
    }


    return null;
  }

  /**
   * Calcula rota otimizada (Nearest Neighbor + 2-opt) e persiste ORDEM.
   */
  static async optimizeAndSaveRoute(
    idCampanhaPromotor: number,
    idOficinaInicio: number,
    idOficinaFim: number
  ) {
    const repo = this.getRotaRepo();
    const cpRepo = this.getCampanhaPromotorRepo();

    const rotas = await repo.find({
      where: { ID_CAMPANHA_PROMOTOR: idCampanhaPromotor, DELETED_AT: IsNull() },
      relations: ["oficina"],
    });

    if (rotas.length === 0) {
      throw new Error("Nenhuma rota encontrada para este vínculo.");
    }

    const pontos = rotas
      .filter((r) => r.oficina?.LATITUDE && r.oficina?.LONGITUDE)
      .map((r) => ({
        id: r.ID_ROTA_PROMOTOR!,
        id_oficina: r.ID_OFICINA!,
        lat: parseFloat(r?.oficina?.LATITUDE!),
        lon: parseFloat(r?.oficina?.LONGITUDE!),
      }));

    if (pontos.length < rotas.length) {
      throw new Error("Algumas oficinas não possuem coordenadas (LATITUDE/LONGITUDE).");
    }

    const result = optimizeRoute(pontos, idOficinaInicio, idOficinaFim);

    // Obter pontos na ordem otimizada para enviar ao OSRM
    const orderedPontos = result.order.map((o) => {
      const p = pontos.find((pt) => pt.id === o.id)!;
      return { id: p.id, id_oficina: p.id_oficina, lat: p.lat, lon: p.lon };
    });

    // Chamar OSRM para rota real por ruas
    const osrmResult = await fetchOSRMRoute(orderedPontos);

    // Salvar ORDEM em cada rota (always on new DB)
    for (const item of result.order) {
      await repo.update(item.id, { ORDEM: item.ordem });
    }

    // Salvar estratégia no CampanhaPromotor (always on new DB)
    await cpRepo.update(idCampanhaPromotor, {
      ESTRATEGIA_ORDENACAO: EstrategiaOrdenacao.ROTA_OTIMIZADA,
      ID_OFICINA_INICIO: idOficinaInicio,
      ID_OFICINA_FIM: idOficinaFim,
    } as any);

    return {
      ESTRATEGIA_ORDENACAO: EstrategiaOrdenacao.ROTA_OTIMIZADA,
      ID_OFICINA_INICIO: idOficinaInicio,
      ID_OFICINA_FIM: idOficinaFim,
      distancia_total_km: osrmResult?.distanceKm ?? result.totalDistanceKm,
      route_geometry: osrmResult?.geometry ?? null,
      rotas: result.order.map((o) => ({
        ID_ROTA_PROMOTOR: o.id,
        ORDEM: o.ordem,
        ID_OFICINA: o.id_oficina,
      })),
    };
  }

  /**
   * Reordena rotas (MANUAL ou PROXIMIDADE_PROMOTOR).
   */
  static async reorderRotas(
    idCampanhaPromotor: number,
    estrategia: EstrategiaOrdenacao,
    rotasOrdem?: { ID_ROTA_PROMOTOR: number; ORDEM: number }[]
  ) {
    const repo = this.getRotaRepo();
    const cpRepo = this.getCampanhaPromotorRepo();

    const rotas = await repo.find({
      where: { ID_CAMPANHA_PROMOTOR: idCampanhaPromotor, DELETED_AT: IsNull() },
    });

    if (estrategia === EstrategiaOrdenacao.MANUAL) {
      if (!rotasOrdem || rotasOrdem.length === 0) {
        throw new Error("Estratégia MANUAL exige array de rotas com ORDEM.");
      }
      for (const item of rotasOrdem) {
        await repo.update(item.ID_ROTA_PROMOTOR, { ORDEM: item.ORDEM });
      }
    } else if (estrategia === EstrategiaOrdenacao.PROXIMIDADE_PROMOTOR) {
      // Limpar ORDEM de todas as rotas
      for (const rota of rotas) {
        await repo.update(rota.ID_ROTA_PROMOTOR!, { ORDEM: undefined });
      }
    }

    await cpRepo.update(idCampanhaPromotor, {
      ESTRATEGIA_ORDENACAO: estrategia,
      ID_OFICINA_INICIO: undefined,
      ID_OFICINA_FIM: undefined,
    } as any);

    const updatedRotas = await repo.find({
      where: { ID_CAMPANHA_PROMOTOR: idCampanhaPromotor, DELETED_AT: IsNull() },
    });

    return {
      ESTRATEGIA_ORDENACAO: estrategia,
      rotas: updatedRotas.map((r) => ({
        ID_ROTA_PROMOTOR: r.ID_ROTA_PROMOTOR!,
        ORDEM: r.ORDEM ?? null,
        ID_OFICINA: r.ID_OFICINA!,
      })),
    };
  }
}
