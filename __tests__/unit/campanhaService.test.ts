import CampanhaService from '../../service/campanhaService';
import { AppDataSourceSync } from '../../data-source';
import { DuckDBClient } from '../../utils/duckdbClient';
import CampanhaPromotor from '../../entities/CampanhaPromotor';
import RotaPromotor from '../../entities/RotaPromotor';
import Campanha from '../../entities/Campanha';
import { StatusNotificacaoVisita } from '../../entities/NotificacaoVisita';

jest.mock('../../data-source');
jest.mock('../../utils/duckdbClient');

describe('CampanhaService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getActiveCampanhaByPromotor', () => {
    it('should return active campaign with DuckDB data merged into oficinas', async () => {
      const mockCampanha = {
        ID_CAMPANHA: 1,
        NOME: 'Test Campaign',
        START_TIME: new Date('2026-01-01'),
        END_TIME: new Date('2026-12-31'),
      };

      const mockCampanhaPromotor = {
        ID_CAMPANHA_PROMOTOR: 1,
        ID_PROMOTOR: 10,
        ID_CAMPANHA: 1,
        campanha: mockCampanha,
        DELETED_AT: null,
      };

      const mockRotas = [
        {
          ID_ROTA_PROMOTOR: 1,
          ID_CAMPANHA_PROMOTOR: 1,
          ID_OFICINA: 395444,
          oficina: {
            ID_OFICINA: 395444,
            NOME_FANTASIA: 'Oficina A',
            LATITUDE: '-23.675817',
            LONGITUDE: '-46.6800146',
          },
        },
        {
          ID_ROTA_PROMOTOR: 2,
          ID_CAMPANHA_PROMOTOR: 1,
          ID_OFICINA: 393991,
          oficina: {
            ID_OFICINA: 393991,
            NOME_FANTASIA: 'Oficina B',
            LATITUDE: '-23.5',
            LONGITUDE: '-46.6',
          },
        },
      ];

      const mockDuckDBData = new Map([
        [
          395444,
          {
            id_oficina: 395444,
            flag_engajamento: 'alto',
            flag_sentimento: 'positivo',
            flag_treinamento: 'alto',
            cor_icone: 'azul',
          },
        ],
        [
          393991,
          {
            id_oficina: 393991,
            flag_engajamento: 'baixo',
            flag_sentimento: 'neutro',
            flag_treinamento: 'baixo',
            cor_icone: 'cinza',
          },
        ],
      ]);

      const mockCampanhaPromotorRepository = {
        find: jest.fn().mockResolvedValue([mockCampanhaPromotor]),
      };

      const mockRotaPromotorRepository = {
        find: jest.fn().mockResolvedValue(mockRotas),
      };

      const mockCampanhaRepository = {
        find: jest.fn(),
        findOne: jest.fn(),
      };

      (AppDataSourceSync.getRepository as jest.Mock).mockImplementation((entity) => {
        if (entity === CampanhaPromotor) return mockCampanhaPromotorRepository;
        if (entity === RotaPromotor) return mockRotaPromotorRepository;
        if (entity === Campanha) return mockCampanhaRepository;
        return {};
      });

      (DuckDBClient.getOficinaDataByIds as jest.Mock).mockResolvedValue(mockDuckDBData);

      const result = await CampanhaService.getActiveCampanhaByPromotor(10, new Date('2026-06-01'));

      expect(result).not.toBeNull();
      expect(result?.rotas).toHaveLength(2);

      // Check first rota has DuckDB data merged
      expect(result?.rotas[0].oficina).toMatchObject({
        ID_OFICINA: 395444,
        NOME_FANTASIA: 'Oficina A',
        flag_engajamento: 'alto',
        flag_sentimento: 'positivo',
        flag_treinamento: 'alto',
        cor_icone: 'azul',
      });

      // Check second rota has DuckDB data merged
      expect(result?.rotas[1].oficina).toMatchObject({
        ID_OFICINA: 393991,
        NOME_FANTASIA: 'Oficina B',
        flag_engajamento: 'baixo',
        flag_sentimento: 'neutro',
        flag_treinamento: 'baixo',
        cor_icone: 'cinza',
      });

      // Verify DuckDBClient was called with correct IDs
      expect(DuckDBClient.getOficinaDataByIds).toHaveBeenCalledWith([395444, 393991]);
    });

    it('should use default values when DuckDB data is not available', async () => {
      const mockCampanha = {
        ID_CAMPANHA: 1,
        NOME: 'Test Campaign',
        START_TIME: new Date('2026-01-01'),
        END_TIME: new Date('2026-12-31'),
      };

      const mockCampanhaPromotor = {
        ID_CAMPANHA_PROMOTOR: 1,
        ID_PROMOTOR: 10,
        ID_CAMPANHA: 1,
        campanha: mockCampanha,
        DELETED_AT: null,
      };

      const mockRotas = [
        {
          ID_ROTA_PROMOTOR: 1,
          ID_CAMPANHA_PROMOTOR: 1,
          ID_OFICINA: 999999,
          oficina: {
            ID_OFICINA: 999999,
            NOME_FANTASIA: 'Oficina Unknown',
          },
        },
      ];

      const mockCampanhaPromotorRepository = {
        find: jest.fn().mockResolvedValue([mockCampanhaPromotor]),
      };

      const mockRotaPromotorRepository = {
        find: jest.fn().mockResolvedValue(mockRotas),
      };

      const mockCampanhaRepository = {
        find: jest.fn(),
        findOne: jest.fn(),
      };

      (AppDataSourceSync.getRepository as jest.Mock).mockImplementation((entity) => {
        if (entity === CampanhaPromotor) return mockCampanhaPromotorRepository;
        if (entity === RotaPromotor) return mockRotaPromotorRepository;
        if (entity === Campanha) return mockCampanhaRepository;
        return {};
      });

      // DuckDB returns empty map (no data for this oficina)
      (DuckDBClient.getOficinaDataByIds as jest.Mock).mockResolvedValue(new Map());

      const result = await CampanhaService.getActiveCampanhaByPromotor(10, new Date('2026-06-01'));

      expect(result).not.toBeNull();
      expect(result?.rotas).toHaveLength(1);

      // Check that default values are used
      expect(result?.rotas[0].oficina).toMatchObject({
        ID_OFICINA: 999999,
        NOME_FANTASIA: 'Oficina Unknown',
        flag_engajamento: 'baixo',
        flag_sentimento: 'neutro',
        flag_treinamento: 'baixo',
        cor_icone: 'cinza',
      });
    });

    it('should return null when no active campaign is found', async () => {
      const mockCampanhaPromotorRepository = {
        find: jest.fn().mockResolvedValue([]),
      };

      const mockCampanhaRepository = {
        find: jest.fn(),
        findOne: jest.fn(),
      };

      (AppDataSourceSync.getRepository as jest.Mock).mockImplementation((entity) => {
        if (entity === CampanhaPromotor) return mockCampanhaPromotorRepository;
        if (entity === Campanha) return mockCampanhaRepository;
        return {};
      });

      const result = await CampanhaService.getActiveCampanhaByPromotor(10, new Date('2026-06-01'));

      expect(result).toBeNull();
    });

    it('should handle rotas without oficina correctly', async () => {
      const mockCampanha = {
        ID_CAMPANHA: 1,
        NOME: 'Test Campaign',
        START_TIME: new Date('2026-01-01'),
        END_TIME: new Date('2026-12-31'),
      };

      const mockCampanhaPromotor = {
        ID_CAMPANHA_PROMOTOR: 1,
        ID_PROMOTOR: 10,
        ID_CAMPANHA: 1,
        campanha: mockCampanha,
        DELETED_AT: null,
      };

      const mockRotas = [
        {
          ID_ROTA_PROMOTOR: 1,
          ID_CAMPANHA_PROMOTOR: 1,
          ID_OFICINA: null,
          oficina: null, // No oficina linked
        },
      ];

      const mockCampanhaPromotorRepository = {
        find: jest.fn().mockResolvedValue([mockCampanhaPromotor]),
      };

      const mockRotaPromotorRepository = {
        find: jest.fn().mockResolvedValue(mockRotas),
      };

      const mockCampanhaRepository = {
        find: jest.fn(),
        findOne: jest.fn(),
      };

      (AppDataSourceSync.getRepository as jest.Mock).mockImplementation((entity) => {
        if (entity === CampanhaPromotor) return mockCampanhaPromotorRepository;
        if (entity === RotaPromotor) return mockRotaPromotorRepository;
        if (entity === Campanha) return mockCampanhaRepository;
        return {};
      });

      (DuckDBClient.getOficinaDataByIds as jest.Mock).mockResolvedValue(new Map());

      const result = await CampanhaService.getActiveCampanhaByPromotor(10, new Date('2026-06-01'));

      expect(result).not.toBeNull();
      expect(result?.rotas).toHaveLength(1);
      expect(result?.rotas[0].oficina).toBeNull();

      // Verify DuckDBClient was called with empty array
      expect(DuckDBClient.getOficinaDataByIds).toHaveBeenCalledWith([]);
    });
  });

  describe('createCampanha with promotores', () => {
    it('should create campaign and link promotores with oficinas', async () => {
      const mockCampanha = {
        ID_CAMPANHA: 1,
        NOME: 'Test Campaign',
      };

      const mockCampanhaPromotor = {
        ID_CAMPANHA_PROMOTOR: 10,
        ID_CAMPANHA: 1,
        ID_PROMOTOR: 5,
      };

      const mockCampanhaRepository = {
        create: jest.fn().mockReturnValue(mockCampanha),
        save: jest.fn().mockResolvedValue(mockCampanha),
      };

      const mockCampanhaPromotorRepository = {
        create: jest.fn().mockReturnValue(mockCampanhaPromotor),
        save: jest.fn().mockResolvedValue(mockCampanhaPromotor),
        find: jest.fn(),
      };

      const mockRotaPromotorRepository = {
        create: jest.fn().mockImplementation((data) => data),
        save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
        find: jest.fn(),
      };

      (AppDataSourceSync.getRepository as jest.Mock).mockImplementation((entity) => {
        if (entity === Campanha) return mockCampanhaRepository;
        if (entity === CampanhaPromotor) return mockCampanhaPromotorRepository;
        if (entity === RotaPromotor) return mockRotaPromotorRepository;
        return {};
      });

      const promotores = [
        {
          ID_PROMOTOR: 5,
          ID_OFICINAS: [100, 200, 300],
        },
      ];

      const result = await CampanhaService.createCampanha(
        { NOME: 'Test Campaign' },
        promotores
      );

      expect(result).toEqual(mockCampanha);
      expect(mockCampanhaRepository.save).toHaveBeenCalledTimes(1);
      expect(mockCampanhaPromotorRepository.save).toHaveBeenCalledTimes(1);
      expect(mockRotaPromotorRepository.save).toHaveBeenCalledTimes(3);
    });

    it('should create campaign without promotores when not provided', async () => {
      const mockCampanha = {
        ID_CAMPANHA: 1,
        NOME: 'Test Campaign',
      };

      const mockCampanhaRepository = {
        create: jest.fn().mockReturnValue(mockCampanha),
        save: jest.fn().mockResolvedValue(mockCampanha),
      };

      const mockCampanhaPromotorRepository = {
        save: jest.fn(),
      };

      (AppDataSourceSync.getRepository as jest.Mock).mockImplementation((entity) => {
        if (entity === Campanha) return mockCampanhaRepository;
        if (entity === CampanhaPromotor) return mockCampanhaPromotorRepository;
        return {};
      });

      const result = await CampanhaService.createCampanha({ NOME: 'Test Campaign' });

      expect(result).toEqual(mockCampanha);
      expect(mockCampanhaRepository.save).toHaveBeenCalledTimes(1);
      expect(mockCampanhaPromotorRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('updateCampanha with promotores', () => {
    it('should update campaign and replace promotor links', async () => {
      const mockExistingCampanha = {
        ID_CAMPANHA: 1,
        NOME: 'Old Campaign Name',
      };

      const mockUpdatedCampanha = {
        ID_CAMPANHA: 1,
        NOME: 'Updated Campaign Name',
      };

      const mockCampanhaPromotor = {
        ID_CAMPANHA_PROMOTOR: 10,
        ID_CAMPANHA: 1,
        ID_PROMOTOR: 5,
      };

      const mockExistingCampanhaPromotores = [
        {
          ID_CAMPANHA_PROMOTOR: 5,
          ID_CAMPANHA: 1,
          ID_PROMOTOR: 3,
        },
      ];

      const mockExistingRotas = [
        {
          ID_ROTA_PROMOTOR: 1,
          ID_CAMPANHA_PROMOTOR: 5,
        },
      ];

      const mockCampanhaRepository = {
        findOne: jest.fn().mockResolvedValue(mockExistingCampanha),
        save: jest.fn().mockResolvedValue(mockUpdatedCampanha),
      };

      const mockCampanhaPromotorRepository = {
        find: jest.fn().mockResolvedValue(mockExistingCampanhaPromotores),
        create: jest.fn().mockReturnValue(mockCampanhaPromotor),
        save: jest.fn().mockResolvedValue(mockCampanhaPromotor),
        softDelete: jest.fn(),
      };

      const mockRotaPromotorRepository = {
        find: jest.fn().mockResolvedValue(mockExistingRotas),
        create: jest.fn().mockImplementation((data) => data),
        save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
        softDelete: jest.fn(),
      };

      (AppDataSourceSync.getRepository as jest.Mock).mockImplementation((entity) => {
        if (entity === Campanha) return mockCampanhaRepository;
        if (entity === CampanhaPromotor) return mockCampanhaPromotorRepository;
        if (entity === RotaPromotor) return mockRotaPromotorRepository;
        return {};
      });

      const promotores = [
        {
          ID_PROMOTOR: 5,
          ID_OFICINAS: [100, 200],
        },
      ];

      const result = await CampanhaService.updateCampanha(
        1,
        { NOME: 'Updated Campaign Name' },
        promotores
      );

      expect(result).toEqual(mockUpdatedCampanha);
      expect(mockCampanhaRepository.save).toHaveBeenCalledTimes(1);
      
      // Verify existing links were soft deleted
      expect(mockRotaPromotorRepository.softDelete).toHaveBeenCalledTimes(1);
      expect(mockCampanhaPromotorRepository.softDelete).toHaveBeenCalledTimes(1);
      
      // Verify new links were created
      expect(mockCampanhaPromotorRepository.save).toHaveBeenCalledTimes(1);
      expect(mockRotaPromotorRepository.save).toHaveBeenCalledTimes(2);
    });

    it('should update campaign without affecting promotores when not provided', async () => {
      const mockExistingCampanha = {
        ID_CAMPANHA: 1,
        NOME: 'Old Campaign Name',
      };

      const mockUpdatedCampanha = {
        ID_CAMPANHA: 1,
        NOME: 'Updated Campaign Name',
      };

      const mockCampanhaRepository = {
        findOne: jest.fn().mockResolvedValue(mockExistingCampanha),
        save: jest.fn().mockResolvedValue(mockUpdatedCampanha),
      };

      const mockCampanhaPromotorRepository = {
        find: jest.fn(),
        softDelete: jest.fn(),
      };

      const mockRotaPromotorRepository = {
        find: jest.fn(),
        softDelete: jest.fn(),
      };

      (AppDataSourceSync.getRepository as jest.Mock).mockImplementation((entity) => {
        if (entity === Campanha) return mockCampanhaRepository;
        if (entity === CampanhaPromotor) return mockCampanhaPromotorRepository;
        if (entity === RotaPromotor) return mockRotaPromotorRepository;
        return {};
      });

      const result = await CampanhaService.updateCampanha(
        1,
        { NOME: 'Updated Campaign Name' }
      );

      expect(result).toEqual(mockUpdatedCampanha);
      expect(mockCampanhaRepository.save).toHaveBeenCalledTimes(1);
      
      // Verify existing links were NOT deleted
      expect(mockCampanhaPromotorRepository.find).not.toHaveBeenCalled();
      expect(mockRotaPromotorRepository.softDelete).not.toHaveBeenCalled();
    });
  });

  // NOTIF-19 / spec P2 AC2: "WHEN the promoter app requests a promoter's route
  // list THEN the system SHALL include each route's visit-confirmation STATUS".
  // design.md:157 requires the same relation the single-route read loads, and
  // the status must be the *effective* one (spec AC22) - a stored ENVIADO whose
  // EXPIRA_EM has silently passed reads EXPIRADO, never ENVIADO.
  describe('visit confirmation status on route-list reads', () => {
    const AGORA = new Date('2026-08-05T12:00:00.000Z');
    const EXPIRA_PASSADO = new Date('2026-08-01T12:00:00.000Z');
    const EXPIRA_FUTURO = new Date('2026-08-12T12:00:00.000Z');
    const CONFIRMADO_EM = new Date('2026-08-04T09:30:00.000Z');

    const campanhaAtiva = {
      ID_CAMPANHA: 1,
      NOME: 'Campanha Ativa',
      START_TIME: new Date('2026-01-01'),
      END_TIME: new Date('2026-12-31'),
    };

    const campanhaPromotorAtivo = {
      ID_CAMPANHA_PROMOTOR: 1,
      ID_PROMOTOR: 10,
      ID_CAMPANHA: 1,
      campanha: campanhaAtiva,
      DELETED_AT: null,
    };

    // A raw row as the route-list query returns it: rp.* plus the joined
    // oficina columns plus the joined NOTIFICACAO_VISITA columns.
    const linhaRota = (id: number, notificacao: Record<string, unknown> = {}) => ({
      ID_ROTA_PROMOTOR: id,
      ID_CAMPANHA_PROMOTOR: 1,
      ID_OFICINA: 395444,
      NOME_FANTASIA: 'Oficina A',
      ...notificacao,
    });

    const montarRotaList = (linhas: any[]) => {
      (AppDataSourceSync.getRepository as jest.Mock).mockImplementation((entity) => {
        if (entity === CampanhaPromotor) {
          return { find: jest.fn().mockResolvedValue([campanhaPromotorAtivo]) };
        }
        return { find: jest.fn(), findOne: jest.fn() };
      });
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue(linhas);
    };

    const montarCampanhaComRelacoes = (rotasPromotor: any[]) => {
      const findOne = jest.fn().mockResolvedValue({
        ID_CAMPANHA: 1,
        NOME: 'Campanha Ativa',
        campanhaPromotores: [{ ID_CAMPANHA_PROMOTOR: 1, rotasPromotor }],
      });

      (AppDataSourceSync.getRepository as jest.Mock).mockImplementation((entity) => {
        if (entity === Campanha) return { findOne };
        return { find: jest.fn(), findOne: jest.fn() };
      });

      return findOne;
    };

    beforeEach(() => {
      jest.useFakeTimers({ now: AGORA });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    describe('getActiveCampanhaByPromotor (promoter app route list)', () => {
      it('reports an unopened expired notification as EXPIRADO and a live one as ENVIADO', async () => {
        montarRotaList([
          linhaRota(1, {
            NOTIFICACAO_STATUS: StatusNotificacaoVisita.ENVIADO,
            NOTIFICACAO_EXPIRA_EM: EXPIRA_PASSADO,
            NOTIFICACAO_CONFIRMADO_EM: null,
          }),
          linhaRota(2, {
            NOTIFICACAO_STATUS: StatusNotificacaoVisita.ENVIADO,
            NOTIFICACAO_EXPIRA_EM: EXPIRA_FUTURO,
            NOTIFICACAO_CONFIRMADO_EM: null,
          }),
        ]);

        const resultado = await CampanhaService.getActiveCampanhaByPromotor(10, AGORA);

        expect((resultado!.rotas[0] as any).notificacaoVisita.STATUS).toBe(
          StatusNotificacaoVisita.EXPIRADO
        );
        expect((resultado!.rotas[1] as any).notificacaoVisita.STATUS).toBe(
          StatusNotificacaoVisita.ENVIADO
        );
      });

      it('includes CONFIRMADO_EM for a confirmed route', async () => {
        montarRotaList([
          linhaRota(1, {
            NOTIFICACAO_STATUS: StatusNotificacaoVisita.CONFIRMADO,
            NOTIFICACAO_EXPIRA_EM: EXPIRA_FUTURO,
            NOTIFICACAO_CONFIRMADO_EM: CONFIRMADO_EM,
          }),
        ]);

        const resultado = await CampanhaService.getActiveCampanhaByPromotor(10, AGORA);

        expect((resultado!.rotas[0] as any).notificacaoVisita).toEqual({
          STATUS: StatusNotificacaoVisita.CONFIRMADO,
          CONFIRMADO_EM,
        });
      });

      it('degrades gracefully for a route with no notification row', async () => {
        montarRotaList([linhaRota(1), linhaRota(2, {
          NOTIFICACAO_STATUS: StatusNotificacaoVisita.PENDENTE,
          NOTIFICACAO_EXPIRA_EM: null,
          NOTIFICACAO_CONFIRMADO_EM: null,
        })]);

        const resultado = await CampanhaService.getActiveCampanhaByPromotor(10, AGORA);

        expect((resultado!.rotas[0] as any).notificacaoVisita).toBeUndefined();
        expect((resultado!.rotas[1] as any).notificacaoVisita.STATUS).toBe(
          StatusNotificacaoVisita.PENDENTE
        );
      });

      it('loads every route status in the list query, without a per-route query', async () => {
        montarRotaList([1, 2, 3].map((id) =>
          linhaRota(id, {
            NOTIFICACAO_STATUS: StatusNotificacaoVisita.ENVIADO,
            NOTIFICACAO_EXPIRA_EM: EXPIRA_FUTURO,
            NOTIFICACAO_CONFIRMADO_EM: null,
          })
        ));

        const resultado = await CampanhaService.getActiveCampanhaByPromotor(10, AGORA);

        expect(
          resultado!.rotas.map((r: any) => r.notificacaoVisita.STATUS)
        ).toEqual([
          StatusNotificacaoVisita.ENVIADO,
          StatusNotificacaoVisita.ENVIADO,
          StatusNotificacaoVisita.ENVIADO,
        ]);
        expect(AppDataSourceSync.query as jest.Mock).toHaveBeenCalledTimes(1);
      });
    });

    describe('getCampanhaByIdWithRelations (dashboard route list)', () => {
      it("loads the notificacaoVisita relation for every route", async () => {
        const findOne = montarCampanhaComRelacoes([]);

        await CampanhaService.getCampanhaByIdWithRelations(1);

        expect(findOne).toHaveBeenCalledWith(
          expect.objectContaining({
            relations: expect.arrayContaining([
              'campanhaPromotores.rotasPromotor.notificacaoVisita',
            ]),
          })
        );
      });

      it('reports an unopened expired notification as EXPIRADO and a live one as ENVIADO', async () => {
        montarCampanhaComRelacoes([
          {
            ID_ROTA_PROMOTOR: 1,
            notificacaoVisita: {
              STATUS: StatusNotificacaoVisita.ENVIADO,
              EXPIRA_EM: EXPIRA_PASSADO,
            },
          },
          {
            ID_ROTA_PROMOTOR: 2,
            notificacaoVisita: {
              STATUS: StatusNotificacaoVisita.ENVIADO,
              EXPIRA_EM: EXPIRA_FUTURO,
            },
          },
        ]);

        const campanha = await CampanhaService.getCampanhaByIdWithRelations(1);
        const rotas = (campanha as any).campanhaPromotores[0].rotasPromotor;

        expect(rotas[0].notificacaoVisita.STATUS).toBe(StatusNotificacaoVisita.EXPIRADO);
        expect(rotas[1].notificacaoVisita.STATUS).toBe(StatusNotificacaoVisita.ENVIADO);
      });

      it('includes CONFIRMADO_EM for a confirmed route', async () => {
        montarCampanhaComRelacoes([
          {
            ID_ROTA_PROMOTOR: 1,
            notificacaoVisita: {
              STATUS: StatusNotificacaoVisita.CONFIRMADO,
              EXPIRA_EM: EXPIRA_FUTURO,
              CONFIRMADO_EM,
            },
          },
        ]);

        const campanha = await CampanhaService.getCampanhaByIdWithRelations(1);
        const rota = (campanha as any).campanhaPromotores[0].rotasPromotor[0];

        expect(rota.notificacaoVisita.STATUS).toBe(StatusNotificacaoVisita.CONFIRMADO);
        expect(rota.notificacaoVisita.CONFIRMADO_EM).toBe(CONFIRMADO_EM);
      });

      it('degrades gracefully for a route with no notification row', async () => {
        montarCampanhaComRelacoes([{ ID_ROTA_PROMOTOR: 1, notificacaoVisita: null }]);

        const campanha = await CampanhaService.getCampanhaByIdWithRelations(1);
        const rota = (campanha as any).campanhaPromotores[0].rotasPromotor[0];

        expect(rota.notificacaoVisita).toBeNull();
      });
    });
  });
});
