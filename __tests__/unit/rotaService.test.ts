import RotaService from '../../service/rotaService';
import { MigrationAwareRepository } from '../../utils/migrationRepository';
import { AppDataSourceSync } from '../../data-source';
import { createMockRepo } from '../helpers/mockMigrationRepo';
import RotaPromotor, { StatusRota } from '../../entities/RotaPromotor';
import CampanhaPromotor, { EstrategiaOrdenacao } from '../../entities/CampanhaPromotor';
import NotificacaoVisitaService, { criarCacheCampanha } from '../../service/notificacaoVisitaService';
import GeolocationService from '../../service/geolocationService';
import { fetchOSRMRoute } from '../../utils/routeOptimizer';

jest.mock('../../data-source');
jest.mock('../../utils/migrationRepository');
jest.mock('../../utils/routeOptimizer', () => ({
  optimizeRoute: jest.fn().mockReturnValue({
    order: [{ id: 1, ordem: 1, id_oficina: 100 }],
    totalDistanceKm: 10,
  }),
  fetchOSRMRoute: jest.fn().mockResolvedValue({ distanceKm: 10, geometry: null }),
}));
jest.mock('../../service/geolocationService', () => {
  return jest.fn().mockImplementation(() => ({
    getLatLongByCep: jest.fn().mockResolvedValue({ lat: -25.43, long: -49.27 }),
  }));
});
jest.mock('../../utils/haversine', () => ({
  haversineDistanceKm: jest.fn().mockReturnValue(350),
}));
// Every route-creation path now notifies the workshop, so this suite stubs the
// notifier out; the hook itself is proven in rotaServiceVisita.test.ts.
jest.mock('../../service/notificacaoVisitaService');

/**
 * reassignRotasByAddress só considera rotas de campanha vigente (commit 8dba5cb),
 * então a relation campanha precisa estar na fixture com datas cobrindo agora.
 */
const campanhaAtiva = () => ({
  START_TIME: new Date(Date.now() - 86_400_000),
  END_TIME: new Date(Date.now() + 86_400_000),
});

describe('RotaService', () => {
  const rotaRepo = createMockRepo();
  const cpRepo = createMockRepo();

  beforeEach(() => {
    jest.clearAllMocks();
    (MigrationAwareRepository as jest.Mock).mockImplementation((entity: any) => {
      if (entity === RotaPromotor) return rotaRepo;
      if (entity === CampanhaPromotor) return cpRepo;
      return createMockRepo();
    });
  });

  describe('createRotas', () => {
    it('should create single route', async () => {
      rotaRepo.save.mockResolvedValue({ ID_ROTA_PROMOTOR: 1, ID_CAMPANHA_PROMOTOR: 5, ID_OFICINA: 100 });

      const result = await RotaService.createRotas(5, 100);

      expect(rotaRepo.create).toHaveBeenCalledWith({ ID_CAMPANHA_PROMOTOR: 5, ID_OFICINA: 100, CREATED_BY: undefined });
      expect(result).toHaveProperty('ID_ROTA_PROMOTOR', 1);
    });

    it('should create batch routes', async () => {
      rotaRepo.saveMany.mockResolvedValue([
        { ID_ROTA_PROMOTOR: 1, ID_OFICINA: 100 },
        { ID_ROTA_PROMOTOR: 2, ID_OFICINA: 200 },
      ]);

      const result = await RotaService.createRotas(5, [100, 200]);

      expect(rotaRepo.create).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });

    // AGND-01/AGND-21: route creation enqueues and never dispatches. The
    // inline-send regression this feature removes would show up here as
    // notificarVisita being called instead of agendarVisita.
    it('enqueues one notification per created route', async () => {
      rotaRepo.saveMany.mockResolvedValue([
        { ID_ROTA_PROMOTOR: 1, ID_OFICINA: 100 },
        { ID_ROTA_PROMOTOR: 2, ID_OFICINA: 200 },
      ]);

      await RotaService.createRotas(5, [100, 200]);

      // Uma ida ao banco para o lote (AGND-01); a posição de cada rota na janela
      // de envio (AGND-02) é decidida dentro do lote.
      expect(NotificacaoVisitaService.agendarVisitasEmLote).toHaveBeenCalledTimes(1);
      expect(NotificacaoVisitaService.agendarVisitasEmLote).toHaveBeenCalledWith([
        expect.objectContaining({ ID_ROTA_PROMOTOR: 1 }),
        expect.objectContaining({ ID_ROTA_PROMOTOR: 2 }),
      ]);
    });

    it('never dispatches inline during route creation', async () => {
      rotaRepo.save.mockResolvedValue({ ID_ROTA_PROMOTOR: 1, ID_OFICINA: 100 });

      await RotaService.createRotas(5, 100);

      expect(NotificacaoVisitaService.notificarVisita).not.toHaveBeenCalled();
    });

    it('still returns the created routes when queueing throws', async () => {
      rotaRepo.save.mockResolvedValue({ ID_ROTA_PROMOTOR: 1, ID_OFICINA: 100 });
      (NotificacaoVisitaService.agendarVisitasEmLote as jest.Mock).mockRejectedValueOnce(
        new Error('fila indisponível')
      );

      const result = await RotaService.createRotas(5, 100);

      expect(result).toHaveProperty('ID_ROTA_PROMOTOR', 1);
    });
  });

  describe('createRotaWithCampanhaPromotor', () => {
    it('should use transaction', async () => {
      const mockManager = {
        create: jest.fn().mockReturnValue({ ID_CAMPANHA_PROMOTOR: 1 }),
        save: jest.fn()
          .mockResolvedValueOnce({ ID_CAMPANHA_PROMOTOR: 1 })
          .mockResolvedValueOnce([{ ID_ROTA_PROMOTOR: 1 }]),
      };
      (AppDataSourceSync.transaction as jest.Mock).mockImplementation((cb: Function) => cb(mockManager));

      const result = await RotaService.createRotaWithCampanhaPromotor(10, 20, [100]);

      expect(AppDataSourceSync.transaction).toHaveBeenCalled();
      expect(result.campanhaPromotor).toBeTruthy();
      expect(result.rotas).toBeTruthy();
    });
  });

  describe('updateRotaWorkshops', () => {
    it('should add new and remove old workshops', async () => {
      rotaRepo.find.mockResolvedValue([
        { ID_ROTA_PROMOTOR: 1, ID_OFICINA: 100, DELETED_AT: null },
        { ID_ROTA_PROMOTOR: 2, ID_OFICINA: 200, DELETED_AT: null },
      ]);
      rotaRepo.saveMany.mockResolvedValue([{ ID_ROTA_PROMOTOR: 3, ID_OFICINA: 300 }]);

      const result = await RotaService.updateRotaWorkshops(1, [100, 300]);

      // 200 should be deleted, 300 should be created
      expect(rotaRepo.softDelete).toHaveBeenCalled();
      expect(result.created).toHaveLength(1);
      expect(result.deleted).toHaveLength(1);
    });

    it('should handle no changes needed', async () => {
      rotaRepo.find.mockResolvedValue([
        { ID_ROTA_PROMOTOR: 1, ID_OFICINA: 100, DELETED_AT: null },
      ]);

      const result = await RotaService.updateRotaWorkshops(1, [100]);

      expect(result.created).toEqual([]);
      expect(result.deleted).toEqual([]);
    });
  });

  describe('updateRotaOptions', () => {
    it('should update options', async () => {
      rotaRepo.findOne.mockResolvedValue({ ID_ROTA_PROMOTOR: 1, STATUS: 'BACKLOG' });
      rotaRepo.save.mockResolvedValue({ ID_ROTA_PROMOTOR: 1, STATUS: 'FINALIZADO' });

      const result = await RotaService.updateRotaOptions(1, { STATUS: StatusRota.FINALIZADO });

      expect(result!.STATUS).toBe('FINALIZADO');
    });

    it('should return null when not found', async () => {
      rotaRepo.findOne.mockResolvedValue(null);
      expect(await RotaService.updateRotaOptions(999, {})).toBeNull();
    });
  });

  describe('findRotaById', () => {
    it('should find by ID', async () => {
      rotaRepo.findOne.mockResolvedValue({ ID_ROTA_PROMOTOR: 1 });
      expect(await RotaService.findRotaById(1)).toEqual({ ID_ROTA_PROMOTOR: 1 });
    });

    it('should return null when not found', async () => {
      rotaRepo.findOne.mockResolvedValue(null);
      expect(await RotaService.findRotaById(999)).toBeNull();
    });
  });

  describe('getOficinasAssignedInCampanha', () => {
    it('should return oficina IDs', async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([
        { ID_OFICINA: 100 }, { ID_OFICINA: 200 },
      ]);

      const result = await RotaService.getOficinasAssignedInCampanha(1);

      expect(result).toEqual([100, 200]);
    });

    it('should return empty array', async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([]);
      expect(await RotaService.getOficinasAssignedInCampanha(999)).toEqual([]);
    });
  });

  describe('reorderRotas', () => {
    it('should reorder manually', async () => {
      rotaRepo.find.mockResolvedValue([{ ID_ROTA_PROMOTOR: 1 }]);
      cpRepo.update.mockResolvedValue(undefined);
      rotaRepo.update.mockResolvedValue(undefined);
      // After reorder, return updated
      rotaRepo.find.mockResolvedValueOnce([{ ID_ROTA_PROMOTOR: 1 }])
        .mockResolvedValueOnce([{ ID_ROTA_PROMOTOR: 1, ORDEM: 1, ID_OFICINA: 100 }]);

      const result = await RotaService.reorderRotas(1, EstrategiaOrdenacao.MANUAL, [
        { ID_ROTA_PROMOTOR: 1, ORDEM: 1 },
      ]);

      expect(result.ESTRATEGIA_ORDENACAO).toBe(EstrategiaOrdenacao.MANUAL);
    });

    it('should throw when manual without array', async () => {
      rotaRepo.find.mockResolvedValue([{ ID_ROTA_PROMOTOR: 1 }]);

      await expect(RotaService.reorderRotas(1, EstrategiaOrdenacao.MANUAL))
        .rejects.toThrow('Estratégia MANUAL exige array de rotas com ORDEM.');
    });

    it('should clear ORDEM for PROXIMIDADE_PROMOTOR', async () => {
      rotaRepo.find.mockResolvedValue([{ ID_ROTA_PROMOTOR: 1, ORDEM: 5 }]);
      cpRepo.update.mockResolvedValue(undefined);
      rotaRepo.update.mockResolvedValue(undefined);
      rotaRepo.find.mockResolvedValueOnce([{ ID_ROTA_PROMOTOR: 1, ORDEM: 5 }])
        .mockResolvedValueOnce([{ ID_ROTA_PROMOTOR: 1, ORDEM: null, ID_OFICINA: 100 }]);

      const result = await RotaService.reorderRotas(1, EstrategiaOrdenacao.PROXIMIDADE_PROMOTOR);

      expect(rotaRepo.update).toHaveBeenCalledWith(1, { ORDEM: undefined });
      expect(result.ESTRATEGIA_ORDENACAO).toBe(EstrategiaOrdenacao.PROXIMIDADE_PROMOTOR);
    });
  });

  describe('removeCampanhaPromotorRota', () => {
    it('should hard delete all rotas', async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue(undefined);

      await RotaService.removeCampanhaPromotorRota(1);

      expect(AppDataSourceSync.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM'),
        [1]
      );
    });
  });

  describe('reassignRotasByAddress', () => {
    const { haversineDistanceKm } = require('../../utils/haversine');

    it('should throw NOT_FOUND when no active routes', async () => {
      rotaRepo.find.mockResolvedValue([]);

      await expect(RotaService.reassignRotasByAddress('80010-000', 123))
        .rejects.toThrow('NOT_FOUND');
    });

    it('should keep route when within radius', async () => {
      haversineDistanceKm.mockReturnValue(10); // within default 20km

      rotaRepo.find.mockResolvedValue([{
        ID_ROTA_PROMOTOR: 1,
        ID_OFICINA: 123,
        STATUS: StatusRota.BACKLOG,
        campanhaPromotor: {
          ID_CAMPANHA: 1,
          ID_CAMPANHA_PROMOTOR: 10,
          RAIO: 20,
          campanha: campanhaAtiva(),
          promotor: { ID_PROMOTOR: 5, NOME: 'João', LATITUDE: '-23.55', LONGITUDE: '-46.63' },
        },
      }]);
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([]);

      const result = await RotaService.reassignRotasByAddress('80010-000', 123);

      expect(result.reatribuicoes[0].status).toBe('mantida_dentro_do_raio');
    });

    it('should reassign when out of radius with available candidate', async () => {
      haversineDistanceKm
        .mockReturnValueOnce(350)  // current promotor distance (out of range)
        .mockReturnValueOnce(15);  // candidate distance (in range)

      rotaRepo.find.mockResolvedValue([{
        ID_ROTA_PROMOTOR: 1,
        ID_OFICINA: 123,
        STATUS: StatusRota.BACKLOG,
        campanhaPromotor: {
          ID_CAMPANHA: 1,
          ID_CAMPANHA_PROMOTOR: 10,
          RAIO: 20,
          campanha: campanhaAtiva(),
          promotor: { ID_PROMOTOR: 5, NOME: 'João', LATITUDE: '-23.55', LONGITUDE: '-46.63' },
        },
      }]);
      // getCandidatosPorCampanhas
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([
        { ID_CAMPANHA_PROMOTOR: 20, ID_CAMPANHA: 1, ID_PROMOTOR: 8, NOME: 'Maria', RAIO: 20, LATITUDE: '-25.43', LONGITUDE: '-49.27' },
      ]);
      // transaction
      const mockManager = {
        softDelete: jest.fn(),
        create: jest.fn().mockReturnValue({ ID_CAMPANHA_PROMOTOR: 20, ID_OFICINA: 123 }),
        save: jest.fn().mockResolvedValue({ ID_ROTA_PROMOTOR: 99 }),
      };
      (AppDataSourceSync.transaction as jest.Mock).mockImplementation((cb: Function) => cb(mockManager));

      const result = await RotaService.reassignRotasByAddress('80010-000', 123);

      expect(result.reatribuicoes[0].status).toBe('reatribuida');
      expect(result.reatribuicoes[0].promotor_novo!.ID_PROMOTOR).toBe(8);
      expect(result.resumo.reatribuidas).toBe(1);
    });

    it('should report sem_promotor_disponivel when no candidate in range', async () => {
      haversineDistanceKm.mockReturnValue(350); // all out of range

      rotaRepo.find.mockResolvedValue([{
        ID_ROTA_PROMOTOR: 1,
        ID_OFICINA: 123,
        STATUS: StatusRota.BACKLOG,
        campanhaPromotor: {
          ID_CAMPANHA: 1,
          ID_CAMPANHA_PROMOTOR: 10,
          RAIO: 20,
          campanha: campanhaAtiva(),
          promotor: { ID_PROMOTOR: 5, NOME: 'João', LATITUDE: '-23.55', LONGITUDE: '-46.63' },
        },
      }]);
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([]);

      const result = await RotaService.reassignRotasByAddress('80010-000', 123);

      expect(result.reatribuicoes[0].status).toBe('sem_promotor_disponivel');
    });

    // Spec AC1 + AGND-01: a reassignment creates a RotaPromotor like any other
    // path, so it gets exactly one NotificacaoVisita too — queued, not sent.
    it('queues the route created by a reassignment, after the transaction commits', async () => {
      const agendarVisita = NotificacaoVisitaService.agendarVisitasEmLote as jest.Mock;
      agendarVisita.mockResolvedValue(undefined as never);
      (criarCacheCampanha as jest.Mock).mockReturnValue({
        dados: new Map(),
        nomeEmpresa: new Map(),
      });

      haversineDistanceKm
        .mockReturnValueOnce(350)
        .mockReturnValueOnce(15);

      rotaRepo.find.mockResolvedValue([{
        ID_ROTA_PROMOTOR: 1,
        ID_OFICINA: 123,
        STATUS: StatusRota.BACKLOG,
        campanhaPromotor: {
          ID_CAMPANHA: 1,
          ID_CAMPANHA_PROMOTOR: 10,
          RAIO: 20,
          campanha: campanhaAtiva(),
          promotor: { ID_PROMOTOR: 5, NOME: 'João', LATITUDE: '-23.55', LONGITUDE: '-46.63' },
        },
      }]);
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([
        { ID_CAMPANHA_PROMOTOR: 20, ID_CAMPANHA: 1, ID_PROMOTOR: 8, NOME: 'Maria', RAIO: 20, LATITUDE: '-25.43', LONGITUDE: '-49.27' },
      ]);

      const rotaCriada = { ID_ROTA_PROMOTOR: 99, ID_CAMPANHA_PROMOTOR: 20, ID_OFICINA: 123 };
      let transacaoConcluida = false;
      const mockManager = {
        softDelete: jest.fn(),
        create: jest.fn().mockReturnValue({ ID_CAMPANHA_PROMOTOR: 20, ID_OFICINA: 123 }),
        save: jest.fn().mockResolvedValue(rotaCriada),
      };
      (AppDataSourceSync.transaction as jest.Mock).mockImplementation(async (cb: Function) => {
        const saida = await cb(mockManager);
        transacaoConcluida = true;
        return saida;
      });
      agendarVisita.mockImplementation(async () => {
        // The notification must not be queued against uncommitted transaction state.
        expect(transacaoConcluida).toBe(true);
        return {} as never;
      });

      await RotaService.reassignRotasByAddress('80010-000', 123);

      expect(agendarVisita).toHaveBeenCalledTimes(1);
      expect(agendarVisita).toHaveBeenCalledWith([rotaCriada]);
    });

    it('still completes the reassignment when the notification rejects', async () => {
      const agendarVisita = NotificacaoVisitaService.agendarVisitasEmLote as jest.Mock;
      agendarVisita.mockRejectedValue(new Error('fila indisponível'));
      jest.spyOn(console, 'error').mockImplementation(() => {});

      haversineDistanceKm
        .mockReturnValueOnce(350)
        .mockReturnValueOnce(15);

      rotaRepo.find.mockResolvedValue([{
        ID_ROTA_PROMOTOR: 1,
        ID_OFICINA: 123,
        STATUS: StatusRota.BACKLOG,
        campanhaPromotor: {
          ID_CAMPANHA: 1,
          ID_CAMPANHA_PROMOTOR: 10,
          RAIO: 20,
          campanha: campanhaAtiva(),
          promotor: { ID_PROMOTOR: 5, NOME: 'João', LATITUDE: '-23.55', LONGITUDE: '-46.63' },
        },
      }]);
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([
        { ID_CAMPANHA_PROMOTOR: 20, ID_CAMPANHA: 1, ID_PROMOTOR: 8, NOME: 'Maria', RAIO: 20, LATITUDE: '-25.43', LONGITUDE: '-49.27' },
      ]);
      (AppDataSourceSync.transaction as jest.Mock).mockImplementation((cb: Function) => cb({
        softDelete: jest.fn(),
        create: jest.fn().mockReturnValue({ ID_CAMPANHA_PROMOTOR: 20, ID_OFICINA: 123 }),
        save: jest.fn().mockResolvedValue({ ID_ROTA_PROMOTOR: 99 }),
      }));

      const result = await RotaService.reassignRotasByAddress('80010-000', 123);

      expect(result.reatribuicoes[0].status).toBe('reatribuida');
      expect(result.reatribuicoes[0].rota_criada).toBe(99);
    });

    it('throws when the new CEP cannot be geocoded', async () => {
      (GeolocationService as unknown as jest.Mock).mockImplementationOnce(() => ({
        getLatLongByCep: jest.fn().mockResolvedValue(null),
      }));

      await expect(RotaService.reassignRotasByAddress('00000-000', 123))
        .rejects.toThrow('Não foi possível geocodificar o CEP informado.');
    });

    it('marks sem_promotor_disponivel when the current promotor has no coordinates', async () => {
      rotaRepo.find.mockResolvedValue([{
        ID_ROTA_PROMOTOR: 1,
        ID_OFICINA: 123,
        STATUS: StatusRota.BACKLOG,
        campanhaPromotor: {
          ID_CAMPANHA: 1,
          ID_CAMPANHA_PROMOTOR: 10,
          RAIO: 20,
          campanha: campanhaAtiva(),
          promotor: { ID_PROMOTOR: 5, NOME: 'João', LATITUDE: null, LONGITUDE: null },
        },
      }]);

      const result = await RotaService.reassignRotasByAddress('80010-000', 123);

      expect(result.reatribuicoes[0]).toEqual({
        ID_CAMPANHA: 1,
        promotor_anterior: { ID_PROMOTOR: 5, NOME: 'João', distancia_km: 0 },
        promotor_novo: null,
        rota_removida: null,
        rota_criada: null,
        status: 'sem_promotor_disponivel',
      });
      expect(result.resumo.sem_promotor_disponivel).toBe(1);
    });

    it('picks the closest candidate when more than one is eligible', async () => {
      haversineDistanceKm
        .mockReturnValueOnce(350) // promotor atual, fora do raio
        .mockReturnValueOnce(10)  // candidato Maria
        .mockReturnValueOnce(5);  // candidato Carlos, mais próximo

      rotaRepo.find.mockResolvedValue([{
        ID_ROTA_PROMOTOR: 1,
        ID_OFICINA: 123,
        STATUS: StatusRota.BACKLOG,
        campanhaPromotor: {
          ID_CAMPANHA: 1,
          ID_CAMPANHA_PROMOTOR: 10,
          RAIO: 20,
          campanha: campanhaAtiva(),
          promotor: { ID_PROMOTOR: 5, NOME: 'João', LATITUDE: '-23.55', LONGITUDE: '-46.63' },
        },
      }]);
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([
        { ID_CAMPANHA_PROMOTOR: 20, ID_CAMPANHA: 1, ID_PROMOTOR: 8, NOME: 'Maria', RAIO: 20, LATITUDE: '-25.43', LONGITUDE: '-49.27' },
        { ID_CAMPANHA_PROMOTOR: 21, ID_CAMPANHA: 1, ID_PROMOTOR: 9, NOME: 'Carlos', RAIO: 20, LATITUDE: '-24.0', LONGITUDE: '-48.0' },
      ]);
      (AppDataSourceSync.transaction as jest.Mock).mockImplementation((cb: Function) => cb({
        softDelete: jest.fn(),
        create: jest.fn().mockReturnValue({ ID_CAMPANHA_PROMOTOR: 21, ID_OFICINA: 123 }),
        save: jest.fn().mockResolvedValue({ ID_ROTA_PROMOTOR: 99 }),
      }));

      const result = await RotaService.reassignRotasByAddress('80010-000', 123);

      expect(result.reatribuicoes[0].promotor_novo!.ID_PROMOTOR).toBe(9);
      expect(result.reatribuicoes[0].promotor_novo!.distancia_km).toBe(5);
    });
  });

  describe('getGeolocationDataByCep', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterAll(() => {
      global.fetch = originalFetch;
    });

    it('strips non-numeric characters from a masked CEP before geocoding', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          results: [{ geometry: { location: { lat: -25.43, lng: -49.27 } } }],
        }),
      });

      const result = await RotaService.getGeolocationDataByCep('80010-000');

      expect(result).toEqual({ lat: -25.43, lng: -49.27 });
      expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('80010000');
    });

    it('keeps a purely numeric CEP unchanged', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          results: [{ geometry: { location: { lat: -25.43, lng: -49.27 } } }],
        }),
      });

      await RotaService.getGeolocationDataByCep('80010000');

      expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('80010000');
    });

    it('returns null when the geocoding response is not ok', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

      const result = await RotaService.getGeolocationDataByCep('80010000');

      expect(result).toBeNull();
    });

    it('returns null when the response has no results', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      });

      const result = await RotaService.getGeolocationDataByCep('80010000');

      expect(result).toBeNull();
    });

    it('wraps a fetch failure in an Error', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('network down'));
      jest.spyOn(console, 'log').mockImplementation(() => {});

      await expect(RotaService.getGeolocationDataByCep('80010000'))
        .rejects.toThrow('network down');
    });
  });

  describe('optimizeAndSaveRoute', () => {
    it('optimizes, calls OSRM and persists ORDEM', async () => {
      rotaRepo.find.mockResolvedValue([
        { ID_ROTA_PROMOTOR: 1, ID_OFICINA: 100, oficina: { LATITUDE: '-23.5', LONGITUDE: '-46.6' } },
      ]);
      rotaRepo.update.mockResolvedValue(undefined);
      cpRepo.update.mockResolvedValue(undefined);

      const result = await RotaService.optimizeAndSaveRoute(5, 100, 100);

      expect(rotaRepo.update).toHaveBeenCalledWith(1, { ORDEM: 1 });
      expect(cpRepo.update).toHaveBeenCalledWith(5, expect.objectContaining({
        ESTRATEGIA_ORDENACAO: EstrategiaOrdenacao.ROTA_OTIMIZADA,
      }));
      expect(result.distancia_total_km).toBe(10);
      expect(result.rotas).toEqual([{ ID_ROTA_PROMOTOR: 1, ORDEM: 1, ID_OFICINA: 100 }]);
    });

    it('falls back to the estimated distance when OSRM returns nothing', async () => {
      rotaRepo.find.mockResolvedValue([
        { ID_ROTA_PROMOTOR: 1, ID_OFICINA: 100, oficina: { LATITUDE: '-23.5', LONGITUDE: '-46.6' } },
      ]);
      (fetchOSRMRoute as jest.Mock).mockResolvedValueOnce(null);

      const result = await RotaService.optimizeAndSaveRoute(5, 100, 100);

      expect(result.distancia_total_km).toBe(10); // totalDistanceKm do mock de optimizeRoute
      expect(result.route_geometry).toBeNull();
    });

    it('throws when no routes are found for the campaign promoter', async () => {
      rotaRepo.find.mockResolvedValue([]);

      await expect(RotaService.optimizeAndSaveRoute(5, 100, 100))
        .rejects.toThrow('Nenhuma rota encontrada para este vínculo.');
    });

    it('throws when some workshop is missing coordinates', async () => {
      rotaRepo.find.mockResolvedValue([
        { ID_ROTA_PROMOTOR: 1, ID_OFICINA: 100, oficina: { LATITUDE: null, LONGITUDE: null } },
      ]);

      await expect(RotaService.optimizeAndSaveRoute(5, 100, 100))
        .rejects.toThrow('Algumas oficinas não possuem coordenadas (LATITUDE/LONGITUDE).');
    });
  });

  describe('assignOficinaFromCommunitySignup', () => {
    const { haversineDistanceKm } = require('../../utils/haversine');

    function mockQueries(overrides: {
      cadastroEmpresa?: any[];
      oficina?: any[];
      campanhasAtivas?: any[];
      candidatos?: any[];
      assigned?: any[];
    } = {}) {
      (AppDataSourceSync.query as jest.Mock).mockImplementation((sql: string) => {
        if (sql.includes('cadastro_empresa')) return Promise.resolve(overrides.cadastroEmpresa ?? []);
        if (sql.includes('MAIN_REGISTER"."OFICINA"')) return Promise.resolve(overrides.oficina ?? []);
        if (sql.includes('ROTA_PROMOTOR" rp')) return Promise.resolve(overrides.assigned ?? []);
        if (sql.includes('PROMOTOR" p')) return Promise.resolve(overrides.candidatos ?? []);
        if (sql.includes('"CAMPANHA" c')) return Promise.resolve(overrides.campanhasAtivas ?? []);
        return Promise.resolve([]);
      });
    }

    it('returns early when there is no active campaign for the slug', async () => {
      mockQueries({
        cadastroEmpresa: [{ latitude: '-23.5', longitude: '-46.6', cep: '01001000' }],
        campanhasAtivas: [],
      });

      const result = await RotaService.assignOficinaFromCommunitySignup(123, 'empresa-x');

      expect(result.campanhas_processadas).toBe(0);
      expect(result.atribuicoes).toEqual([]);
      expect(result.resumo).toEqual({ atribuidas: 0, sem_promotor_disponivel: 0, ja_atribuida: 0 });
    });

    it('marks ja_atribuida when the workshop is already assigned in the campaign', async () => {
      mockQueries({
        cadastroEmpresa: [{ latitude: '-23.5', longitude: '-46.6', cep: '01001000' }],
        campanhasAtivas: [{ ID_CAMPANHA: 1, NOME: 'Campanha X' }],
        assigned: [{ ID_OFICINA: 123 }],
      });

      const result = await RotaService.assignOficinaFromCommunitySignup(123, 'empresa-x');

      expect(result.atribuicoes[0].status).toBe('ja_atribuida');
      expect(result.resumo.ja_atribuida).toBe(1);
    });

    it('marks sem_promotor_disponivel when no candidate is within range', async () => {
      mockQueries({
        cadastroEmpresa: [{ latitude: '-23.5', longitude: '-46.6', cep: '01001000' }],
        campanhasAtivas: [{ ID_CAMPANHA: 1, NOME: 'Campanha X' }],
        assigned: [],
        candidatos: [],
      });

      const result = await RotaService.assignOficinaFromCommunitySignup(123, 'empresa-x');

      expect(result.atribuicoes[0].status).toBe('sem_promotor_disponivel');
      expect(result.resumo.sem_promotor_disponivel).toBe(1);
    });

    it('assigns the closest available candidate and creates a route', async () => {
      haversineDistanceKm.mockReturnValue(5);
      mockQueries({
        cadastroEmpresa: [{ latitude: '-23.5', longitude: '-46.6', cep: '01001000' }],
        campanhasAtivas: [{ ID_CAMPANHA: 1, NOME: 'Campanha X' }],
        assigned: [],
        candidatos: [
          { ID_CAMPANHA_PROMOTOR: 20, ID_CAMPANHA: 1, ID_PROMOTOR: 8, NOME: 'Maria', RAIO: 20, LATITUDE: '-25.43', LONGITUDE: '-49.27' },
        ],
      });
      rotaRepo.save.mockResolvedValue({ ID_ROTA_PROMOTOR: 77, ID_OFICINA: 123 });

      const result = await RotaService.assignOficinaFromCommunitySignup(123, 'empresa-x');

      expect(result.atribuicoes[0].status).toBe('atribuida');
      expect(result.atribuicoes[0].promotor!.ID_PROMOTOR).toBe(8);
      expect(result.atribuicoes[0].ID_ROTA_PROMOTOR).toBe(77);
      expect(result.resumo.atribuidas).toBe(1);
    });

    it('picks the nearest of multiple eligible candidates', async () => {
      haversineDistanceKm
        .mockReturnValueOnce(10)
        .mockReturnValueOnce(4);
      mockQueries({
        cadastroEmpresa: [{ latitude: '-23.5', longitude: '-46.6', cep: '01001000' }],
        campanhasAtivas: [{ ID_CAMPANHA: 1, NOME: 'Campanha X' }],
        assigned: [],
        candidatos: [
          { ID_CAMPANHA_PROMOTOR: 20, ID_CAMPANHA: 1, ID_PROMOTOR: 8, NOME: 'Maria', RAIO: 20, LATITUDE: '-25.43', LONGITUDE: '-49.27' },
          { ID_CAMPANHA_PROMOTOR: 21, ID_CAMPANHA: 1, ID_PROMOTOR: 9, NOME: 'Carlos', RAIO: 20, LATITUDE: '-24.0', LONGITUDE: '-48.0' },
        ],
      });
      rotaRepo.save.mockResolvedValue({ ID_ROTA_PROMOTOR: 78, ID_OFICINA: 123 });

      const result = await RotaService.assignOficinaFromCommunitySignup(123, 'empresa-x');

      expect(result.atribuicoes[0].promotor!.ID_PROMOTOR).toBe(9);
    });

    it('resolves workshop coordinates from OFICINA when cadastro_empresa has none', async () => {
      mockQueries({
        cadastroEmpresa: [],
        oficina: [{ CEP: '01001-000', LATITUDE: '-23.5', LONGITUDE: '-46.6' }],
        campanhasAtivas: [],
      });

      const result = await RotaService.assignOficinaFromCommunitySignup(123, 'empresa-x');

      expect(result.oficina.latitude).toBe(-23.5);
      expect(result.oficina.longitude).toBe(-46.6);
    });

    it('geocodes the workshop CEP when OFICINA has no coordinates', async () => {
      mockQueries({
        cadastroEmpresa: [],
        oficina: [{ CEP: '01001-000', LATITUDE: null, LONGITUDE: null }],
        campanhasAtivas: [],
      });

      const result = await RotaService.assignOficinaFromCommunitySignup(123, 'empresa-x');

      // default GeolocationService mock resolve { lat: -25.43, long: -49.27 }
      expect(result.oficina.latitude).toBe(-25.43);
      expect(result.oficina.longitude).toBe(-49.27);
    });

    it('throws NOT_FOUND when the workshop does not exist in either source', async () => {
      mockQueries({ cadastroEmpresa: [], oficina: [] });

      await expect(RotaService.assignOficinaFromCommunitySignup(999, 'empresa-x'))
        .rejects.toThrow('NOT_FOUND');
    });

    it('throws UNPROCESSABLE when the workshop has no coordinates and no CEP', async () => {
      mockQueries({ cadastroEmpresa: [], oficina: [{ CEP: null, LATITUDE: null, LONGITUDE: null }] });

      await expect(RotaService.assignOficinaFromCommunitySignup(123, 'empresa-x'))
        .rejects.toThrow('UNPROCESSABLE');
    });

    it('throws UNPROCESSABLE when the workshop CEP cannot be geocoded', async () => {
      (GeolocationService as unknown as jest.Mock).mockImplementationOnce(() => ({
        getLatLongByCep: jest.fn().mockResolvedValue(null),
      }));
      mockQueries({ cadastroEmpresa: [], oficina: [{ CEP: '01001-000', LATITUDE: null, LONGITUDE: null }] });

      await expect(RotaService.assignOficinaFromCommunitySignup(123, 'empresa-x'))
        .rejects.toThrow('UNPROCESSABLE');
    });
  });
});
