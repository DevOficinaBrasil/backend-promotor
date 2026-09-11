import { AppDataSourceSync } from "../data-source";
import RotaPromotor, { StatusRota } from "../entities/RotaPromotor";
import CampanhaPromotor, { EstrategiaOrdenacao } from "../entities/CampanhaPromotor";
import { In, IsNull } from "typeorm";
import { optimizeRoute, fetchOSRMRoute } from "../utils/routeOptimizer";
import NotificacaoVisitaService from "./notificacaoVisitaService";
import { statusEfetivo } from "../utils/statusNotificacaoVisita";
import { haversineDistanceKm } from "../utils/haversine";
import GeolocationService from "./geolocationService";
import { ligacaoCadastroEmpresa } from "../utils/sqlCadastroEmpresa";

interface ReatribuicaoResult {
  ID_CAMPANHA: number;
  promotor_anterior: { ID_PROMOTOR: number; NOME: string; distancia_km: number };
  promotor_novo: { ID_PROMOTOR: number; NOME: string; distancia_km: number } | null;
  rota_removida: number | null;
  rota_criada: number | null;
  status: "reatribuida" | "mantida_dentro_do_raio" | "sem_promotor_disponivel";
}

interface ReassignResult {
  oficina: {
    ID_OFICINA: number;
    novo_cep: string;
    nova_latitude: number;
    nova_longitude: number;
  };
  campanhas_processadas: number;
  reatribuicoes: ReatribuicaoResult[];
  resumo: { mantidas: number; reatribuidas: number; sem_promotor_disponivel: number };
}

export interface AgendaResultado {
  ID_CAMPANHA_PROMOTOR: number;
  DATA_VISITA: string | null;
  rotas: {
    ID_ROTA_PROMOTOR: number;
    ID_OFICINA: number | null;
    ORDEM: number | null;
    DATA_VISITA: string | null;
  }[];
}

export default class RotaService {
  private static getRotaRepo() {
    return AppDataSourceSync.getRepository(RotaPromotor);
  }

  private static getCampanhaPromotorRepo() {
    return AppDataSourceSync.getRepository(CampanhaPromotor);
  }

  /**
   * Enqueues one notification per newly created route (AGND-01).
   *
   * Since the outbox took over delivery this is a single insert per route: no
   * guards, no recipient lookup, no provider call inside the request. The
   * bounded worker pool that used to live here existed only to stop a few
   * hundred inline WhatsApp calls from holding the request open for minutes,
   * and has no purpose against an insert.
   *
   * Isolated per route all the same: a queueing failure never propagates, so
   * route creation always returns successfully (spec AC10). Belt and braces on
   * top of agendarVisita's own internal handling.
   */
  private static async notificarRotasCriadas(rotas: RotaPromotor[]): Promise<void> {
    try {
      await NotificacaoVisitaService.agendarVisitasEmLote(rotas);
    } catch (erro) {
      // agendarVisitasEmLote já promete não lançar e tem seu próprio fallback
      // rota a rota; este catch é cinto e suspensório para a promessa do AC10:
      // criação de rota nunca falha por causa de notificação.
      console.error("[rotaService] falha ao agendar notificações de visita", {
        quantidade: rotas.length,
        erro: (erro as Error)?.message,
      });
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
    const rotasSalvas = await repo.save(novasRotas);

    await this.notificarRotasCriadas(rotasSalvas);

    return rotasSalvas;
  }

  // Returns oficina IDs already assigned to any promotor in a given campaign
  static async getOficinasAssignedInCampanha(idCampanha: number): Promise<number[]> {
    const results = await AppDataSourceSync.query(
      `SELECT DISTINCT rp."ID_OFICINA"
       FROM "CAMPANHAS_OB"."ROTA_PROMOTOR" rp
       INNER JOIN "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" cp
         ON rp."ID_CAMPANHA_PROMOTOR" = cp."ID_CAMPANHA_PROMOTOR"
       WHERE cp."ID_CAMPANHA" = $1
         AND rp."DELETED_AT" IS NULL
         AND cp."DELETED_AT" IS NULL`,
      [idCampanha]
    );
    return results.map((r: any) => r.ID_OFICINA);
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
      const savedRotas = await repo.save(novasRotas);
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
   * Converte um `Date` para o dia no calendário UTC (`YYYY-MM-DD`).
   *
   * `START_TIME` e `END_TIME` são `timestamp` sem fuso, e o dia da agenda é uma
   * `date` pura. Comparar os dois exige escolher um calendário; escolhemos o
   * UTC porque é o único determinístico aqui — o fuso do processo Node não é
   * garantido. O efeito prático é que, numa campanha cujo fim caia à noite no
   * horário de Brasília, o último dia agendável pode ser um dia além do
   * esperado. Ser permissivo na borda é o modo de falhar certo: recusar um dia
   * legítimo atrapalharia o supervisor, aceitar um dia a mais não quebra nada.
   */
  private static diaDe(valor: Date): string {
    return new Date(valor).toISOString().slice(0, 10);
  }

  /**
   * Grava o dia planejado e a ordem de um conjunto de rotas do mesmo vínculo.
   *
   * `idsRota` é a ordem desejada dentro do dia: a posição no array vira `ORDEM`
   * 1..N. `idsDesagendar` são rotas que saem do dia e voltam a ficar sem data —
   * é o que torna atômico o caso de mover uma oficina de um dia para outro.
   *
   * Com `data` nula, as rotas de `idsRota` são desagendadas.
   *
   * A escrita acontece em duas fases dentro da transação: primeiro `ORDEM` de
   * todas as rotas envolvidas vai a nulo, só então os valores finais são
   * gravados. Sem isso, o índice único parcial de (vínculo, dia, ordem) colide
   * no meio do caminho, porque ele não pode ser adiado até o commit em Postgres
   * (índice parcial não vira constraint, e só constraint aceita ser adiada).
   */
  static async agendarVisitas(
    idCampanhaPromotor: number,
    data: string | null,
    idsRota: number[],
    idsDesagendar: number[] = []
  ): Promise<AgendaResultado> {
    const cpRepo = this.getCampanhaPromotorRepo();
    const vinculo = await cpRepo.findOne({
      where: { ID_CAMPANHA_PROMOTOR: idCampanhaPromotor, DELETED_AT: IsNull() },
      relations: ["campanha"],
    });

    if (!vinculo) {
      throw new Error("VINCULO_NAO_ENCONTRADO");
    }

    if (data !== null) {
      const campanha = vinculo.campanha;
      if (!campanha?.START_TIME || !campanha?.END_TIME) {
        throw new Error("CAMPANHA_SEM_PERIODO");
      }
      if (data < this.diaDe(campanha.START_TIME) || data > this.diaDe(campanha.END_TIME)) {
        throw new Error("DATA_FORA_DO_PERIODO");
      }
    }

    const idsAfetados = [...new Set([...idsRota, ...idsDesagendar])];
    if (idsAfetados.length === 0) {
      throw new Error("NENHUMA_ROTA_INFORMADA");
    }

    const repo = this.getRotaRepo();
    const rotas = await repo.find({
      where: {
        ID_ROTA_PROMOTOR: In(idsAfetados),
        ID_CAMPANHA_PROMOTOR: idCampanhaPromotor,
        DELETED_AT: IsNull(),
      },
    });

    // Uma rota que não voltou da consulta ou não é deste vínculo, ou está
    // apagada. Nos dois casos o lote inteiro para: agendar metade do dia
    // deixaria a agenda num estado que o supervisor não pediu.
    if (rotas.length !== idsAfetados.length) {
      throw new Error("ROTA_FORA_DO_VINCULO");
    }

    const concluida = rotas.find(
      (rota) => rota.STATUS === StatusRota.FINALIZADO || rota.STATUS === StatusRota.CANCELADO
    );
    if (concluida) {
      throw new Error("ROTA_JA_CONCLUIDA");
    }

    await AppDataSourceSync.transaction(async (manager) => {
      // Fase 1: libera as posições. Sem isto, gravar linha a linha esbarra no
      // índice único quando duas rotas trocam de posição entre si.
      await manager.update(RotaPromotor, { ID_ROTA_PROMOTOR: In(idsAfetados) }, { ORDEM: null });

      if (idsDesagendar.length > 0) {
        await manager.update(
          RotaPromotor,
          { ID_ROTA_PROMOTOR: In(idsDesagendar) },
          { DATA_VISITA: null }
        );
      }

      // Fase 2: grava dia e posição final, na sequência recebida.
      for (let indice = 0; indice < idsRota.length; indice += 1) {
        await manager.update(
          RotaPromotor,
          { ID_ROTA_PROMOTOR: idsRota[indice] },
          { DATA_VISITA: data, ORDEM: data === null ? null : indice + 1 }
        );
      }
    });

    // Agendar à mão é uma ordenação manual: o app de campo lê a estratégia para
    // saber se deve respeitar `ORDEM` ou reordenar por GPS.
    if (data !== null) {
      await cpRepo.update(idCampanhaPromotor, {
        ESTRATEGIA_ORDENACAO: EstrategiaOrdenacao.MANUAL,
      } as any);
    }

    const atualizadas = await repo.find({
      where: {
        ID_ROTA_PROMOTOR: In(idsAfetados),
        ID_CAMPANHA_PROMOTOR: idCampanhaPromotor,
        DELETED_AT: IsNull(),
      },
    });

    return {
      ID_CAMPANHA_PROMOTOR: idCampanhaPromotor,
      DATA_VISITA: data,
      rotas: atualizadas.map((rota) => ({
        ID_ROTA_PROMOTOR: rota.ID_ROTA_PROMOTOR!,
        ID_OFICINA: rota.ID_OFICINA ?? null,
        ORDEM: rota.ORDEM ?? null,
        DATA_VISITA: rota.DATA_VISITA ?? null,
      })),
    };
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

  public static async removeCampanhaPromotorRota(idCampanhaPromotor: number): Promise<void> 
  {
    // Delete notifications that reference rotas being removed (FK constraint)
    await AppDataSourceSync.query(
      `DELETE FROM "CAMPANHAS_OB"."NOTIFICACAO_VISITA" WHERE "ID_ROTA_PROMOTOR" IN (
        SELECT "ID_ROTA_PROMOTOR" FROM "CAMPANHAS_OB"."ROTA_PROMOTOR" WHERE "ID_CAMPANHA_PROMOTOR" = $1
      )`,
      [idCampanhaPromotor]
    );

    // Hard-delete all rotas including soft-deleted ones
    await AppDataSourceSync.query(
      `DELETE FROM "CAMPANHAS_OB"."ROTA_PROMOTOR" WHERE "ID_CAMPANHA_PROMOTOR" = $1`,
      [idCampanhaPromotor]
    );
  }

  /**
   * Reatribui rotas de uma oficina após mudança de endereço (CEP).
   */
  static async reassignRotasByAddress(
    cep: string,
    idOficina: number
  ): Promise<ReassignResult> {
    const geolocationService = new GeolocationService();
    const coords = await geolocationService.getLatLongByCep(cep);
    if (!coords) {
      throw new Error("Não foi possível geocodificar o CEP informado.");
    }

    const { lat: novaLat, long: novaLong } = coords;

    const repo = this.getRotaRepo();
    const rotasAtivas = await repo.find({
      where: {
        ID_OFICINA: idOficina,
        STATUS: StatusRota.BACKLOG,
        DELETED_AT: IsNull(),
      },
      relations: ["campanhaPromotor", "campanhaPromotor.promotor", "campanhaPromotor.campanha"],
    });

    if (rotasAtivas.length === 0) {
      throw new Error("NOT_FOUND");
    }

    // Agrupar rotas por campanha (somente campanhas ativas)
    const now = new Date();
    const rotasPorCampanha = new Map<number, RotaPromotor[]>();
    for (const rota of rotasAtivas) {
      const idCampanha = rota.campanhaPromotor?.ID_CAMPANHA;
      if (!idCampanha) continue;

      const campanha = rota.campanhaPromotor?.campanha;
      if (!campanha?.START_TIME || !campanha?.END_TIME) continue;
      if (now < new Date(campanha.START_TIME) || now > new Date(campanha.END_TIME)) continue;

      if (!rotasPorCampanha.has(idCampanha)) {
        rotasPorCampanha.set(idCampanha, []);
      }
      rotasPorCampanha.get(idCampanha)!.push(rota);
    }

    const campanhaIds = Array.from(rotasPorCampanha.keys());
    const candidatos = await this.getCandidatosPorCampanhas(campanhaIds);

    const reatribuicoes: ReatribuicaoResult[] = [];

    for (const [idCampanha, rotas] of rotasPorCampanha) {
      const rota = rotas[0];
      const promotorAtual = rota.campanhaPromotor?.promotor;
      const cpAtual = rota.campanhaPromotor;

      if (!promotorAtual?.LATITUDE || !promotorAtual?.LONGITUDE) {
        reatribuicoes.push({
          ID_CAMPANHA: idCampanha,
          promotor_anterior: {
            ID_PROMOTOR: promotorAtual?.ID_PROMOTOR ?? 0,
            NOME: promotorAtual?.NOME ?? "Desconhecido",
            distancia_km: 0,
          },
          promotor_novo: null,
          rota_removida: null,
          rota_criada: null,
          status: "sem_promotor_disponivel",
        });
        continue;
      }

      const distanciaAtual = haversineDistanceKm(
        promotorAtual.LATITUDE,
        promotorAtual.LONGITUDE,
        novaLat,
        novaLong
      );

      const raioAtual = cpAtual?.RAIO ?? 20;

      if (distanciaAtual <= raioAtual) {
        reatribuicoes.push({
          ID_CAMPANHA: idCampanha,
          promotor_anterior: {
            ID_PROMOTOR: promotorAtual.ID_PROMOTOR!,
            NOME: promotorAtual.NOME,
            distancia_km: Math.round(distanciaAtual * 10) / 10,
          },
          promotor_novo: null,
          rota_removida: null,
          rota_criada: null,
          status: "mantida_dentro_do_raio",
        });
        continue;
      }

      // Fora do raio — buscar candidato mais próximo
      const candidatosCampanha = (candidatos.get(idCampanha) ?? [])
        .filter(c => c.ID_PROMOTOR !== promotorAtual.ID_PROMOTOR);

      const candidatosElegiveis = candidatosCampanha
        .map(c => ({
          ...c,
          distancia: haversineDistanceKm(c.lat, c.lon, novaLat, novaLong),
        }))
        .filter(c => c.distancia <= (c.RAIO ?? 20))
        .sort((a, b) => a.distancia - b.distancia);

      if (candidatosElegiveis.length === 0) {
        reatribuicoes.push({
          ID_CAMPANHA: idCampanha,
          promotor_anterior: {
            ID_PROMOTOR: promotorAtual.ID_PROMOTOR!,
            NOME: promotorAtual.NOME,
            distancia_km: Math.round(distanciaAtual * 10) / 10,
          },
          promotor_novo: null,
          rota_removida: null,
          rota_criada: null,
          status: "sem_promotor_disponivel",
        });
        continue;
      }

      const melhorCandidato = candidatosElegiveis[0];

      const { rotaRemovida, rotaCriada, rotaCriadaEntidade } = await AppDataSourceSync.transaction(
        async (manager) => {
          const idsParaDeletar = rotas
            .map(r => r.ID_ROTA_PROMOTOR!)
            .filter(Boolean);

          await manager.softDelete(RotaPromotor, idsParaDeletar);

          const novaRota = manager.create(RotaPromotor, {
            ID_CAMPANHA_PROMOTOR: melhorCandidato.ID_CAMPANHA_PROMOTOR,
            ID_OFICINA: idOficina,
          });
          const rotaSalva = await manager.save(novaRota);

          return {
            rotaRemovida: idsParaDeletar[0],
            rotaCriada: rotaSalva.ID_ROTA_PROMOTOR!,
            rotaCriadaEntidade: rotaSalva,
          };
        }
      );

      // A reassignment creates a route like any other path, so it notifies too
      // (spec AC1: one notification row per created route). Deliberately runs
      // AFTER the transaction commits — notificarVisita persists through its own
      // repository, outside this manager, so notifying inside would write against
      // uncommitted state and let a notification failure roll back the reassignment.
      await this.notificarRotasCriadas([rotaCriadaEntidade]);

      reatribuicoes.push({
        ID_CAMPANHA: idCampanha,
        promotor_anterior: {
          ID_PROMOTOR: promotorAtual.ID_PROMOTOR!,
          NOME: promotorAtual.NOME,
          distancia_km: Math.round(distanciaAtual * 10) / 10,
        },
        promotor_novo: {
          ID_PROMOTOR: melhorCandidato.ID_PROMOTOR,
          NOME: melhorCandidato.NOME,
          distancia_km: Math.round(melhorCandidato.distancia * 10) / 10,
        },
        rota_removida: rotaRemovida,
        rota_criada: rotaCriada,
        status: "reatribuida",
      });
    }

    const resumo = {
      mantidas: reatribuicoes.filter(r => r.status === "mantida_dentro_do_raio").length,
      reatribuidas: reatribuicoes.filter(r => r.status === "reatribuida").length,
      sem_promotor_disponivel: reatribuicoes.filter(r => r.status === "sem_promotor_disponivel").length,
    };

    return {
      oficina: { ID_OFICINA: idOficina, novo_cep: cep, nova_latitude: novaLat, nova_longitude: novaLong },
      campanhas_processadas: campanhaIds.length,
      reatribuicoes,
      resumo,
    };
  }

  private static async getCandidatosPorCampanhas(
    campanhaIds: number[]
  ): Promise<Map<number, Array<{
    ID_CAMPANHA_PROMOTOR: number;
    ID_CAMPANHA: number;
    ID_PROMOTOR: number;
    NOME: string;
    RAIO: number | null;
    lat: number;
    lon: number;
  }>>> {
    if (campanhaIds.length === 0) return new Map();

    const results = await AppDataSourceSync.query(
      `SELECT 
        cp."ID_CAMPANHA_PROMOTOR",
        cp."ID_CAMPANHA",
        cp."ID_PROMOTOR",
        cp."RAIO",
        p."NOME",
        p."LATITUDE",
        p."LONGITUDE"
      FROM "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" cp
      INNER JOIN "CAMPANHAS_OB"."PROMOTOR" p
        ON cp."ID_PROMOTOR" = p."ID_PROMOTOR"
      WHERE cp."ID_CAMPANHA" = ANY($1)
        AND cp."DELETED_AT" IS NULL
        AND p."DELETED_AT" IS NULL
        AND p."LATITUDE" IS NOT NULL
        AND p."LONGITUDE" IS NOT NULL`,
      [campanhaIds]
    );

    const mapa = new Map<number, Array<any>>();
    for (const row of results) {
      const idCampanha = row.ID_CAMPANHA;
      if (!mapa.has(idCampanha)) mapa.set(idCampanha, []);
      mapa.get(idCampanha)!.push({
        ID_CAMPANHA_PROMOTOR: row.ID_CAMPANHA_PROMOTOR,
        ID_CAMPANHA: row.ID_CAMPANHA,
        ID_PROMOTOR: row.ID_PROMOTOR,
        NOME: row.NOME,
        RAIO: row.RAIO,
        lat: row.LATITUDE,
        lon: row.LONGITUDE,
      });
    }
    return mapa;
  }

  private static async getOficinaCoordinates(
    idOficina: number
  ): Promise<{ lat: number; lon: number; cep: string | null }> {
    // A oficina é ligada ao dw por CNPJ ou por id_oficina — ver
    // utils/sqlCadastroEmpresa.ts. A âncora `alvo` mantém o comportamento de
    // antes para oficina ausente de MAIN_REGISTER.OFICINA: sem CNPJ para
    // comparar, a ligação cai no id_oficina, como fazia o join direto no dw.
    const ceResult = await AppDataSourceSync.query(
      `SELECT ce."latitude", ce."longitude", ce."cep"
       FROM (SELECT $1::int AS "ID_OFICINA") alvo
       LEFT JOIN "MAIN_REGISTER"."OFICINA" o
         ON o."ID_OFICINA" = alvo."ID_OFICINA"${ligacaoCadastroEmpresa("o", 'alvo."ID_OFICINA"')}
       WHERE ce.cnpj_int IS NOT NULL
       LIMIT 1`,
      [idOficina]
    );

    if (ceResult.length > 0 && ceResult[0].latitude && ceResult[0].longitude) {
      return {
        lat: parseFloat(ceResult[0].latitude),
        lon: parseFloat(ceResult[0].longitude),
        cep: ceResult[0].cep ?? null,
      };
    }

    const oficinaResult = await AppDataSourceSync.query(
      `SELECT o."CEP", o."LATITUDE", o."LONGITUDE"
       FROM "MAIN_REGISTER"."OFICINA" o
       WHERE o."ID_OFICINA" = $1`,
      [idOficina]
    );

    if (oficinaResult.length === 0) {
      throw new Error("NOT_FOUND");
    }

    const oficina = oficinaResult[0];

    if (oficina.LATITUDE && oficina.LONGITUDE) {
      return {
        lat: parseFloat(oficina.LATITUDE),
        lon: parseFloat(oficina.LONGITUDE),
        cep: oficina.CEP ?? null,
      };
    }

    if (!oficina.CEP) {
      throw new Error("UNPROCESSABLE");
    }

    const geolocationService = new GeolocationService();
    const coords = await geolocationService.getLatLongByCep(oficina.CEP);

    if (!coords) {
      throw new Error("UNPROCESSABLE");
    }

    return { lat: coords.lat, lon: coords.long, cep: oficina.CEP };
  }

  private static async getActiveCampanhasBySlug(
    empresaSlug: string
  ): Promise<Array<{ ID_CAMPANHA: number; NOME: string }>> {
    const results = await AppDataSourceSync.query(
      `SELECT c."ID_CAMPANHA", c."NOME"
       FROM "CAMPANHAS_OB"."CAMPANHA" c
       WHERE c."EMPRESA_SLUG" = $1
         AND c."DELETED_AT" IS NULL
         AND c."START_TIME" <= NOW()
         AND c."END_TIME" >= NOW()`,
      [empresaSlug]
    );

    return results.map((r: any) => ({
      ID_CAMPANHA: r.ID_CAMPANHA,
      NOME: r.NOME,
    }));
  }

  static async assignOficinaFromCommunitySignup(
    idOficina: number,
    empresaSlug: string
  ): Promise<{
    oficina: { ID_OFICINA: number; CEP: string | null; latitude: number; longitude: number };
    campanhas_processadas: number;
    atribuicoes: Array<{
      ID_CAMPANHA: number;
      NOME_CAMPANHA: string;
      status: "atribuida" | "sem_promotor_disponivel" | "ja_atribuida";
      promotor: { ID_PROMOTOR: number; NOME: string; distancia_km: number } | null;
      ID_ROTA_PROMOTOR: number | null;
    }>;
    resumo: { atribuidas: number; sem_promotor_disponivel: number; ja_atribuida: number };
  }> {
    const { lat, lon, cep } = await this.getOficinaCoordinates(idOficina);

    const campanhasAtivas = await this.getActiveCampanhasBySlug(empresaSlug);

    if (campanhasAtivas.length === 0) {
      return {
        oficina: { ID_OFICINA: idOficina, CEP: cep, latitude: lat, longitude: lon },
        campanhas_processadas: 0,
        atribuicoes: [],
        resumo: { atribuidas: 0, sem_promotor_disponivel: 0, ja_atribuida: 0 },
      };
    }

    const campanhaIds = campanhasAtivas.map(c => c.ID_CAMPANHA);
    const candidatos = await this.getCandidatosPorCampanhas(campanhaIds);

    const atribuicoes: Array<{
      ID_CAMPANHA: number;
      NOME_CAMPANHA: string;
      status: "atribuida" | "sem_promotor_disponivel" | "ja_atribuida";
      promotor: { ID_PROMOTOR: number; NOME: string; distancia_km: number } | null;
      ID_ROTA_PROMOTOR: number | null;
    }> = [];

    for (const campanha of campanhasAtivas) {
      const assignedOficinas = await this.getOficinasAssignedInCampanha(campanha.ID_CAMPANHA);
      if (assignedOficinas.includes(idOficina)) {
        atribuicoes.push({
          ID_CAMPANHA: campanha.ID_CAMPANHA,
          NOME_CAMPANHA: campanha.NOME,
          status: "ja_atribuida",
          promotor: null,
          ID_ROTA_PROMOTOR: null,
        });
        continue;
      }

      const candidatosCampanha = candidatos.get(campanha.ID_CAMPANHA) ?? [];

      const candidatosElegiveis = candidatosCampanha
        .map(c => ({
          ...c,
          distancia: haversineDistanceKm(c.lat, c.lon, lat, lon),
        }))
        .filter(c => c.distancia <= (c.RAIO ?? 20))
        .sort((a, b) => a.distancia - b.distancia || a.ID_CAMPANHA_PROMOTOR - b.ID_CAMPANHA_PROMOTOR);

      if (candidatosElegiveis.length === 0) {
        atribuicoes.push({
          ID_CAMPANHA: campanha.ID_CAMPANHA,
          NOME_CAMPANHA: campanha.NOME,
          status: "sem_promotor_disponivel",
          promotor: null,
          ID_ROTA_PROMOTOR: null,
        });
        continue;
      }

      const melhor = candidatosElegiveis[0];
      const rota = await this.createRotas(melhor.ID_CAMPANHA_PROMOTOR, idOficina);
      const rotaCriada = Array.isArray(rota) ? rota[0] : rota;

      atribuicoes.push({
        ID_CAMPANHA: campanha.ID_CAMPANHA,
        NOME_CAMPANHA: campanha.NOME,
        status: "atribuida",
        promotor: {
          ID_PROMOTOR: melhor.ID_PROMOTOR,
          NOME: melhor.NOME,
          distancia_km: Math.round(melhor.distancia * 10) / 10,
        },
        ID_ROTA_PROMOTOR: rotaCriada.ID_ROTA_PROMOTOR!,
      });
    }

    const resumo = {
      atribuidas: atribuicoes.filter(a => a.status === "atribuida").length,
      sem_promotor_disponivel: atribuicoes.filter(a => a.status === "sem_promotor_disponivel").length,
      ja_atribuida: atribuicoes.filter(a => a.status === "ja_atribuida").length,
    };

    return {
      oficina: { ID_OFICINA: idOficina, CEP: cep, latitude: lat, longitude: lon },
      campanhas_processadas: campanhasAtivas.length,
      atribuicoes,
      resumo,
    };
  }

  /**
   * Contexto pré-carregado para atribuir várias oficinas de um mesmo cliente
   * em lote (ex: importação de planilha) sem repetir, a cada oficina, as
   * consultas que dependem só do `empresaSlug` — que não muda dentro do
   * lote. `atribuidosPorCampanha` é mutado em memória por
   * `atribuirComContexto` conforme rotas são criadas, mantendo a
   * idempotência dentro do próprio lote sem reconsultar o banco a cada
   * oficina.
   */
  static async prepararContextoAtribuicaoLote(empresaSlug: string): Promise<{
    campanhasAtivas: Array<{ ID_CAMPANHA: number; NOME: string }>;
    candidatosPorCampanha: Map<number, Array<{
      ID_CAMPANHA_PROMOTOR: number;
      ID_CAMPANHA: number;
      ID_PROMOTOR: number;
      NOME: string;
      RAIO: number | null;
      lat: number;
      lon: number;
    }>>;
    atribuidosPorCampanha: Map<number, Set<number>>;
  }> {
    const campanhasAtivas = await this.getActiveCampanhasBySlug(empresaSlug);

    if (campanhasAtivas.length === 0) {
      return { campanhasAtivas: [], candidatosPorCampanha: new Map(), atribuidosPorCampanha: new Map() };
    }

    const campanhaIds = campanhasAtivas.map((c) => c.ID_CAMPANHA);
    const candidatosPorCampanha = await this.getCandidatosPorCampanhas(campanhaIds);

    const atribuidosPorCampanha = new Map<number, Set<number>>();
    for (const idCampanha of campanhaIds) {
      const assignedOficinas = await this.getOficinasAssignedInCampanha(idCampanha);
      atribuidosPorCampanha.set(idCampanha, new Set(assignedOficinas));
    }

    return { campanhasAtivas, candidatosPorCampanha, atribuidosPorCampanha };
  }

  /**
   * Mesma lógica de atribuição de `assignOficinaFromCommunitySignup`
   * (raio, desempate por menor distância, idempotência), mas operando sobre
   * um contexto pré-carregado por `prepararContextoAtribuicaoLote` — sem
   * refazer, por oficina, as consultas de campanhas ativas / candidatos /
   * oficinas já atribuídas. Recebe lat/lon já resolvidos pelo chamador (a
   * importação já os tem de `garantirLatLong`), evitando também a consulta
   * de coordenadas que `assignOficinaFromCommunitySignup` faria de novo.
   *
   * Duplica (não reaproveita) o pequeno trecho de match por raio/distância
   * de `assignOficinaFromCommunitySignup` deliberadamente — mantém aquele
   * método 100% intocado, já testado e usado pelo fluxo de inscrição em
   * comunidade.
   */
  static async atribuirComContexto(
    idOficina: number,
    lat: number,
    lon: number,
    contexto: Awaited<ReturnType<typeof RotaService.prepararContextoAtribuicaoLote>>
  ): Promise<{
    campanhas_processadas: number;
    resumo: { atribuidas: number; sem_promotor_disponivel: number; ja_atribuida: number };
  }> {
    let atribuidas = 0;
    let semPromotorDisponivel = 0;
    let jaAtribuida = 0;

    for (const campanha of contexto.campanhasAtivas) {
      const atribuidosNaCampanha = contexto.atribuidosPorCampanha.get(campanha.ID_CAMPANHA)!;

      if (atribuidosNaCampanha.has(idOficina)) {
        jaAtribuida++;
        continue;
      }

      const candidatosCampanha = contexto.candidatosPorCampanha.get(campanha.ID_CAMPANHA) ?? [];

      const candidatosElegiveis = candidatosCampanha
        .map((c) => ({
          ...c,
          distancia: haversineDistanceKm(c.lat, c.lon, lat, lon),
        }))
        .filter((c) => c.distancia <= (c.RAIO ?? 20))
        .sort((a, b) => a.distancia - b.distancia || a.ID_CAMPANHA_PROMOTOR - b.ID_CAMPANHA_PROMOTOR);

      if (candidatosElegiveis.length === 0) {
        semPromotorDisponivel++;
        continue;
      }

      const melhor = candidatosElegiveis[0];
      await this.createRotas(melhor.ID_CAMPANHA_PROMOTOR, idOficina);
      atribuidosNaCampanha.add(idOficina);
      atribuidas++;
    }

    return {
      campanhas_processadas: contexto.campanhasAtivas.length,
      resumo: {
        atribuidas,
        sem_promotor_disponivel: semPromotorDisponivel,
        ja_atribuida: jaAtribuida,
      },
    };
  }
}
