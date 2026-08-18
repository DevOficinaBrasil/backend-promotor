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
      // FILT-02 / AC2 + AC8: rota BACKLOG aguardando resposta sai da lista, e a
      // decisao usa o status efetivo — ENVIADO vencido conta como EXPIRADO, nao
      // como enviado-vivo. Substitui a asserção anterior, que afirmava o
      // contrato antigo (as duas rotas voltavam com seu status). A cobertura de
      // status efetivo por rota vive agora nas consultas do dashboard.
      it('omits a BACKLOG route awaiting a reply, expired or still live', async () => {
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

        expect(resultado!.rotas).toEqual([]);
      });

      // FILT-01 / AC1: os tres estados resolvidos entram na lista.
      it('lists BACKLOG routes whose confirmation is settled', async () => {
        montarRotaList([
          linhaRota(1, {
            NOTIFICACAO_STATUS: StatusNotificacaoVisita.CONFIRMADO,
            NOTIFICACAO_EXPIRA_EM: EXPIRA_FUTURO,
            NOTIFICACAO_CONFIRMADO_EM: CONFIRMADO_EM,
          }),
          linhaRota(2, {
            NOTIFICACAO_STATUS: StatusNotificacaoVisita.DISPENSADO,
            NOTIFICACAO_EXPIRA_EM: EXPIRA_FUTURO,
            NOTIFICACAO_CONFIRMADO_EM: null,
          }),
          linhaRota(3, {
            NOTIFICACAO_STATUS: StatusNotificacaoVisita.FALHOU,
            NOTIFICACAO_EXPIRA_EM: EXPIRA_FUTURO,
            NOTIFICACAO_CONFIRMADO_EM: null,
          }),
        ]);

        const resultado = await CampanhaService.getActiveCampanhaByPromotor(10, AGORA);

        expect(resultado!.rotas.map((r: any) => r.ID_ROTA_PROMOTOR)).toEqual([1, 2, 3]);
        expect(resultado!.rotas.map((r: any) => r.notificacaoVisita.STATUS)).toEqual([
          StatusNotificacaoVisita.CONFIRMADO,
          StatusNotificacaoVisita.DISPENSADO,
          StatusNotificacaoVisita.FALHOU,
        ]);
      });

      // FILT-03 / AC3: REAGENDADO e valor fora do enum ficam fora.
      it('omits a BACKLOG route with REAGENDADO or an unknown status', async () => {
        montarRotaList([
          linhaRota(1, {
            NOTIFICACAO_STATUS: StatusNotificacaoVisita.REAGENDADO,
            NOTIFICACAO_EXPIRA_EM: EXPIRA_FUTURO,
            NOTIFICACAO_CONFIRMADO_EM: null,
          }),
          linhaRota(2, {
            NOTIFICACAO_STATUS: 'INVENTADO',
            NOTIFICACAO_EXPIRA_EM: EXPIRA_FUTURO,
            NOTIFICACAO_CONFIRMADO_EM: null,
          }),
        ]);

        const resultado = await CampanhaService.getActiveCampanhaByPromotor(10, AGORA);

        expect(resultado!.rotas).toEqual([]);
      });

      // FILT-04 / AC4: rota ja trabalhada aparece com qualquer status de notificacao.
      it('keeps a route already worked on, whatever the notification status', async () => {
        montarRotaList([
          { ...linhaRota(1, {
            NOTIFICACAO_STATUS: StatusNotificacaoVisita.ENVIADO,
            NOTIFICACAO_EXPIRA_EM: EXPIRA_FUTURO,
            NOTIFICACAO_CONFIRMADO_EM: null,
          }), STATUS: 'EM ANDAMENTO' },
          { ...linhaRota(2, {
            NOTIFICACAO_STATUS: StatusNotificacaoVisita.PENDENTE,
            NOTIFICACAO_EXPIRA_EM: null,
            NOTIFICACAO_CONFIRMADO_EM: null,
          }), STATUS: 'FINALIZADO' },
          { ...linhaRota(3, {
            NOTIFICACAO_STATUS: StatusNotificacaoVisita.ENVIADO,
            NOTIFICACAO_EXPIRA_EM: EXPIRA_PASSADO,
            NOTIFICACAO_CONFIRMADO_EM: null,
          }), STATUS: 'CANCELADO' },
        ]);

        const resultado = await CampanhaService.getActiveCampanhaByPromotor(10, AGORA);

        expect(resultado!.rotas.map((r: any) => r.ID_ROTA_PROMOTOR)).toEqual([1, 2, 3]);
      });

      // FILT-06 / AC7: tudo filtrado devolve a campanha com rotas vazias, nao null.
      it('returns the active campanha with an empty route list when everything is filtered out', async () => {
        montarRotaList([
          linhaRota(1, {
            NOTIFICACAO_STATUS: StatusNotificacaoVisita.PENDENTE,
            NOTIFICACAO_EXPIRA_EM: null,
            NOTIFICACAO_CONFIRMADO_EM: null,
          }),
        ]);

        const resultado = await CampanhaService.getActiveCampanhaByPromotor(10, AGORA);

        expect(resultado).not.toBeNull();
        expect(resultado!.ID_CAMPANHA).toBe(1);
        expect(resultado!.rotas).toEqual([]);
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

      // FILT-05 / AC5 (rota sem notificacao aparece, sem o campo) + FILT-02 / AC2
      // (a PENDENTE ao lado dela sai). A asserção anterior afirmava o contrato
      // antigo, em que a PENDENTE voltava com seu status.
      it('lists a route with no notification row and drops the PENDENTE next to it', async () => {
        montarRotaList([linhaRota(1), linhaRota(2, {
          NOTIFICACAO_STATUS: StatusNotificacaoVisita.PENDENTE,
          NOTIFICACAO_EXPIRA_EM: null,
          NOTIFICACAO_CONFIRMADO_EM: null,
        })]);

        const resultado = await CampanhaService.getActiveCampanhaByPromotor(10, AGORA);

        expect(resultado!.rotas.map((r: any) => r.ID_ROTA_PROMOTOR)).toEqual([1]);
        expect((resultado!.rotas[0] as any).notificacaoVisita).toBeUndefined();
      });

      // FILT-07 / AC9: uma consulta para a lista inteira, sem consulta por rota.
      // O fixture usa os estados listaveis porque ENVIADO nao chega mais ao app.
      it('loads every route status in the list query, without a per-route query', async () => {
        montarRotaList([
          linhaRota(1, {
            NOTIFICACAO_STATUS: StatusNotificacaoVisita.CONFIRMADO,
            NOTIFICACAO_EXPIRA_EM: EXPIRA_FUTURO,
            NOTIFICACAO_CONFIRMADO_EM: CONFIRMADO_EM,
          }),
          linhaRota(2, {
            NOTIFICACAO_STATUS: StatusNotificacaoVisita.DISPENSADO,
            NOTIFICACAO_EXPIRA_EM: EXPIRA_FUTURO,
            NOTIFICACAO_CONFIRMADO_EM: null,
          }),
          linhaRota(3, {
            NOTIFICACAO_STATUS: StatusNotificacaoVisita.FALHOU,
            NOTIFICACAO_EXPIRA_EM: EXPIRA_FUTURO,
            NOTIFICACAO_CONFIRMADO_EM: null,
          }),
        ]);

        const resultado = await CampanhaService.getActiveCampanhaByPromotor(10, AGORA);

        expect(
          resultado!.rotas.map((r: any) => r.notificacaoVisita.STATUS)
        ).toEqual([
          StatusNotificacaoVisita.CONFIRMADO,
          StatusNotificacaoVisita.DISPENSADO,
          StatusNotificacaoVisita.FALHOU,
        ]);
        expect(AppDataSourceSync.query as jest.Mock).toHaveBeenCalledTimes(1);
      });

      // VISIB-05 / P1 promotor AC4: "SHALL continuar devolvendo, em cada rota de
      // GET /campanha/ativa, o objeto oficina com LATITUDE e LONGITUDE, para que
      // o app navegue até a oficina." Regressão do TRIM no endereço montado: a
      // consulta que monta o ENDERECO é a mesma que traz as coordenadas.
      it('keeps LATITUDE and LONGITUDE on the oficina of every route', async () => {
        montarRotaList([
          linhaRota(1, {
            LATITUDE: '-22.9099',
            LONGITUDE: '-47.0626',
            ENDERECO: 'Chacara do Ze',
          }),
        ]);

        const resultado = await CampanhaService.getActiveCampanhaByPromotor(10, AGORA);

        expect((resultado!.rotas[0] as any).oficina).toMatchObject({
          LATITUDE: '-22.9099',
          LONGITUDE: '-47.0626',
          ENDERECO: 'Chacara do Ze',
        });
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

    // VISIB-01/02/06/09 — P2 "Visão gerencial reflete o status".
    // AC1: "SHALL incluir, em cada rota que possua linha em NOTIFICACAO_VISITA,
    // o objeto notificacaoVisita com STATUS e CONFIRMADO_EM."
    // AC2: "por um único LEFT JOIN ... sem emitir nenhuma consulta adicional por rota."
    // AC3: "SHALL devolver em notificacaoVisita.STATUS o status efetivo."
    describe('getCampanhasByClientId (visão gerencial)', () => {
      const linhaRotaCliente = (id: number, extra: Record<string, unknown> = {}) => ({
        ID_ROTA_PROMOTOR: id,
        ID_CAMPANHA_PROMOTOR: 1,
        ID_OFICINA: 395444,
        STATUS: 'BACKLOG',
        oficina_NOME_FANTASIA: 'Oficina A',
        oficina_ENDERECO: 'Avenida Nova 500',
        oficina_LATITUDE: '-22.9099',
        oficina_LONGITUDE: '-47.0626',
        ...extra,
      });

      const montarConsultaPorCliente = (linhas: any[]) => {
        (AppDataSourceSync.query as jest.Mock).mockImplementation(async (sql: string) => {
          if (sql.includes('"CAMPANHAS_OB"."CAMPANHA" c')) {
            return [{ ID_CAMPANHA: 1, NOME: 'Campanha Ativa', ID_CLIENT: 77 }];
          }
          if (sql.includes('"CAMPANHAS_OB"."CAMPANHA_PROMOTOR" cp')) {
            return [{ ID_CAMPANHA_PROMOTOR: 1, ID_CAMPANHA: 1, ID_PROMOTOR: 10 }];
          }
          if (sql.includes('"CAMPANHAS_OB"."ROTA_PROMOTOR" rp')) {
            return linhas;
          }
          return [];
        });
      };

      const rotasDe = (campanhas: any[]) => campanhas[0].campanhaPromotores[0].rotasPromotor;

      it('devolve o status efetivo por rota: confirmada, pendente e expirada', async () => {
        montarConsultaPorCliente([
          linhaRotaCliente(1, {
            NOTIFICACAO_STATUS: StatusNotificacaoVisita.CONFIRMADO,
            NOTIFICACAO_EXPIRA_EM: EXPIRA_FUTURO,
            NOTIFICACAO_CONFIRMADO_EM: CONFIRMADO_EM,
          }),
          linhaRotaCliente(2, {
            NOTIFICACAO_STATUS: StatusNotificacaoVisita.PENDENTE,
            NOTIFICACAO_EXPIRA_EM: null,
            NOTIFICACAO_CONFIRMADO_EM: null,
          }),
          linhaRotaCliente(3, {
            NOTIFICACAO_STATUS: StatusNotificacaoVisita.ENVIADO,
            NOTIFICACAO_EXPIRA_EM: EXPIRA_PASSADO,
            NOTIFICACAO_CONFIRMADO_EM: null,
          }),
        ]);

        const rotas = rotasDe(await CampanhaService.getCampanhasByClientId(77));

        expect(rotas[0].notificacaoVisita).toEqual({
          STATUS: StatusNotificacaoVisita.CONFIRMADO,
          CONFIRMADO_EM,
        });
        expect(rotas[1].notificacaoVisita.STATUS).toBe(StatusNotificacaoVisita.PENDENTE);
        // Status efetivo, não o bruto: o link venceu sem ser aberto.
        expect(rotas[2].notificacaoVisita.STATUS).toBe(StatusNotificacaoVisita.EXPIRADO);
      });

      // Edge case: "IF uma rota vem do banco legado (sem NOTIFICACAO_VISITA)
      // THEN o sistema SHALL omitir o campo em vez de devolvê-lo nulo."
      it('omite o campo na rota sem notificação e na rota legada', async () => {
        montarConsultaPorCliente([
          linhaRotaCliente(1, {
            NOTIFICACAO_STATUS: null,
            NOTIFICACAO_EXPIRA_EM: null,
            NOTIFICACAO_CONFIRMADO_EM: null,
          }),
          // Rota legada: a query legada é join-free, então as colunas nem vêm.
          { ID_ROTA_PROMOTOR: 2, ID_CAMPANHA_PROMOTOR: 1, ID_OFICINA: null, STATUS: 'BACKLOG' },
        ]);

        const rotas = rotasDe(await CampanhaService.getCampanhasByClientId(77));

        expect(rotas[0]).not.toHaveProperty('notificacaoVisita');
        expect(rotas[1]).not.toHaveProperty('notificacaoVisita');
      });

      // O objeto da rota é montado campo a campo: sem a entrada no literal, a
      // coluna vem do banco e é descartada em silêncio.
      it('preserva os campos existentes da rota ao anexar o status', async () => {
        montarConsultaPorCliente([
          linhaRotaCliente(1, {
            NOTIFICACAO_STATUS: StatusNotificacaoVisita.CONFIRMADO,
            NOTIFICACAO_EXPIRA_EM: EXPIRA_FUTURO,
            NOTIFICACAO_CONFIRMADO_EM: CONFIRMADO_EM,
          }),
        ]);

        const rota = rotasDe(await CampanhaService.getCampanhasByClientId(77))[0];

        // STATUS da rota, não o da notificação — nomes colidem de propósito.
        expect(rota.STATUS).toBe('BACKLOG');
        expect(rota.oficina).toMatchObject({
          ENDERECO: 'Avenida Nova 500',
          LATITUDE: '-22.9099',
          LONGITUDE: '-47.0626',
        });
      });

      // AC2: um único LEFT JOIN na consulta de rotas já existente.
      it('traz o status no mesmo SELECT das rotas, sem consulta por rota', async () => {
        montarConsultaPorCliente([
          linhaRotaCliente(1, {
            NOTIFICACAO_STATUS: StatusNotificacaoVisita.CONFIRMADO,
            NOTIFICACAO_EXPIRA_EM: EXPIRA_FUTURO,
            NOTIFICACAO_CONFIRMADO_EM: CONFIRMADO_EM,
          }),
          linhaRotaCliente(2, {
            NOTIFICACAO_STATUS: StatusNotificacaoVisita.ENVIADO,
            NOTIFICACAO_EXPIRA_EM: EXPIRA_FUTURO,
            NOTIFICACAO_CONFIRMADO_EM: null,
          }),
        ]);

        await CampanhaService.getCampanhasByClientId(77);

        const consultasDeRota = (AppDataSourceSync.query as jest.Mock).mock.calls.filter(
          ([sql]: [string]) => sql.includes('"CAMPANHAS_OB"."ROTA_PROMOTOR" rp')
        );

        expect(consultasDeRota).toHaveLength(1);
        expect(consultasDeRota[0][0]).toContain(
          'LEFT JOIN "CAMPANHAS_OB"."NOTIFICACAO_VISITA" nv'
        );
      });
    });
  });

  // `id_oficina` não é chave em dw.cadastro_empresa (59 ids repetidos cobrindo
  // 128 linhas em PRD — ver entities/CadastroEmpresa.ts). O join por igualdade
  // multiplicava a rota por quantas linhas o dw tivesse, e nada deduplicava
  // depois: queryBothAndMerge só remove repetição vinda do banco legado. Rota
  // duplicada aparecia como card repetido no carrossel e contagem dobrada nos
  // KPIs de confirmação.
  //
  // Estes testes olham o SQL emitido, não o resultado: o fan-out é do banco, e
  // só um teste de integração contra o dw exercitaria as linhas repetidas de
  // verdade. O que se protege aqui é a forma da query contra uma volta ao join
  // por igualdade.
  describe('junção com dw.cadastro_empresa (uma linha por rota)', () => {
    const sqlEmitido = () =>
      (AppDataSourceSync.query as jest.Mock).mock.calls.map(([sql]: [string]) => sql);

    const sqlDeRotas = () =>
      sqlEmitido().filter((sql) => sql.includes('"CAMPANHAS_OB"."ROTA_PROMOTOR" rp'));

    const esperarUmaLinhaPorRota = (sql: string) => {
      // A subquery entrega no máximo uma linha por oficina, então o join externo
      // por igualdade não multiplica mais a rota.
      expect(sql).toContain('DISTINCT ON (ce_dedup.id_oficina)');
      expect(sql).toContain('FROM dw.cadastro_empresa ce_dedup');
      // O que multiplicava a rota era juntar direto na tabela.
      expect(sql).not.toMatch(/JOIN dw\.cadastro_empresa ce\b/);
    };

    it('estreita para uma linha na lista de rotas do app do promotor', async () => {
      (AppDataSourceSync.getRepository as jest.Mock).mockImplementation((entity) => {
        if (entity === CampanhaPromotor) {
          return {
            find: jest.fn().mockResolvedValue([
              {
                ID_CAMPANHA_PROMOTOR: 1,
                ID_PROMOTOR: 10,
                ID_CAMPANHA: 1,
                DELETED_AT: null,
                campanha: {
                  ID_CAMPANHA: 1,
                  START_TIME: new Date('2026-01-01'),
                  END_TIME: new Date('2026-12-31'),
                },
              },
            ]),
          };
        }
        return { find: jest.fn(), findOne: jest.fn() };
      });
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([
        { ID_ROTA_PROMOTOR: 1, ID_CAMPANHA_PROMOTOR: 1, ID_OFICINA: 395444, NOME_FANTASIA: 'A' },
      ]);

      await CampanhaService.getActiveCampanhaByPromotor(10, new Date('2026-08-05T12:00:00.000Z'));

      const consultas = sqlDeRotas();
      expect(consultas).toHaveLength(1);
      esperarUmaLinhaPorRota(consultas[0]);
    });

    it('estreita para uma linha na consulta de campanhas por cliente', async () => {
      (AppDataSourceSync.getRepository as jest.Mock).mockImplementation(() => ({
        find: jest.fn(),
        findOne: jest.fn(),
      }));
      (AppDataSourceSync.query as jest.Mock).mockImplementation(async (sql: string) => {
        if (sql.includes('"CAMPANHAS_OB"."CAMPANHA" c')) {
          return [{ ID_CAMPANHA: 1, ID_CLIENT: 77 }];
        }
        if (sql.includes('"CAMPANHAS_OB"."CAMPANHA_PROMOTOR" cp')) {
          return [{ ID_CAMPANHA_PROMOTOR: 1, ID_CAMPANHA: 1, ID_PROMOTOR: 10 }];
        }
        if (sql.includes('"CAMPANHAS_OB"."ROTA_PROMOTOR" rp')) {
          return [
            {
              ID_ROTA_PROMOTOR: 1,
              ID_CAMPANHA_PROMOTOR: 1,
              ID_OFICINA: 395444,
              oficina_NOME_FANTASIA: 'A',
            },
          ];
        }
        return [];
      });

      await CampanhaService.getCampanhasByClientId(77);

      const consultas = sqlDeRotas();
      expect(consultas).toHaveLength(1);
      esperarUmaLinhaPorRota(consultas[0]);
    });

    // A consulta de enriquecimento lê o dw direto por lista de ids e joga o
    // resultado num Map: sem DISTINCT ON, a linha que sobrevive é a última que
    // o Map recebe — arbitrária, e podendo discordar da que o LATERAL escolheu.
    it('deduplica a consulta de enriquecimento das rotas legadas', async () => {
      (AppDataSourceSync.getRepository as jest.Mock).mockImplementation((entity) => {
        if (entity === CampanhaPromotor) {
          return {
            find: jest.fn().mockResolvedValue([
              {
                ID_CAMPANHA_PROMOTOR: 1,
                ID_PROMOTOR: 10,
                ID_CAMPANHA: 1,
                DELETED_AT: null,
                campanha: {
                  ID_CAMPANHA: 1,
                  START_TIME: new Date('2026-01-01'),
                  END_TIME: new Date('2026-12-31'),
                },
              },
            ]),
          };
        }
        return { find: jest.fn(), findOne: jest.fn() };
      });
      (AppDataSourceSync.query as jest.Mock).mockImplementation(async (sql: string) => {
        // Rota sem NOME_FANTASIA: é o que dispara o enriquecimento.
        if (sql.includes('"CAMPANHAS_OB"."ROTA_PROMOTOR" rp')) {
          return [{ ID_ROTA_PROMOTOR: 1, ID_CAMPANHA_PROMOTOR: 1, ID_OFICINA: 395444 }];
        }
        return [];
      });

      await CampanhaService.getActiveCampanhaByPromotor(10, new Date('2026-08-05T12:00:00.000Z'));

      const enriquecimento = sqlEmitido().filter(
        (sql) =>
          sql.includes('FROM dw.cadastro_empresa ce') &&
          !sql.includes('"CAMPANHAS_OB"."ROTA_PROMOTOR" rp')
      );

      expect(enriquecimento).toHaveLength(1);
      expect(enriquecimento[0]).toContain('DISTINCT ON (ce.id_oficina)');
      expect(enriquecimento[0]).toContain('ORDER BY ce.id_oficina');
    });
  });
});
