import CampanhaService from '../../service/campanhaService';
import { AppDataSourceSync } from '../../data-source';
import Campanha from '../../entities/Campanha';
import CampanhaPromotor from '../../entities/CampanhaPromotor';
import RotaPromotor from '../../entities/RotaPromotor';
import { StatusNotificacaoVisita } from '../../entities/NotificacaoVisita';

// Deliberately does NOT mock utils/migrationRepository: these tests drive the
// real repository against a mocked AppDataSourceSync so the route-list query
// and its statusEfetivo() mapping are exercised for real (P2 AC1/AC2).
jest.mock('../../data-source');
jest.mock('../../utils/duckdbClient');

describe('CampanhaService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
