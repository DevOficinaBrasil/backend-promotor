import RotaService from '../../service/rotaService';
import { AppDataSourceSync } from '../../data-source';
import { createMockRepo } from '../helpers/mockRepo';
import RotaPromotor, { StatusRota } from '../../entities/RotaPromotor';
import CampanhaPromotor from '../../entities/CampanhaPromotor';
import { StatusNotificacaoVisita } from '../../entities/NotificacaoVisita';
import { rotaListavelParaPromotor } from '../../utils/statusNotificacaoVisita';
import { rotaEstacionada, sqlRotaNaoEstacionada } from '../../utils/rotaAguardando';
import { sqlColunasOficinaRota } from '../../utils/sqlEnderecoOficina';

jest.mock('../../data-source');
jest.mock('../../service/notificacaoVisitaService');

// Rota AGUARDANDO: pertence ao promotor, mas o sistema a ignora.
describe('rota estacionada (AGUARDANDO)', () => {
  const rotaRepo = createMockRepo();

  beforeEach(() => {
    jest.clearAllMocks();
    (AppDataSourceSync.getRepository as jest.Mock).mockImplementation((entity: any) => {
      if (entity === RotaPromotor) return rotaRepo;
      if (entity === CampanhaPromotor) return createMockRepo();
      return createMockRepo();
    });
  });

  it('identifica só o status AGUARDANDO', () => {
    expect(rotaEstacionada(StatusRota.AGUARDANDO)).toBe(true);
    expect(rotaEstacionada(StatusRota.BACKLOG)).toBe(false);
    expect(rotaEstacionada(null)).toBe(false);
    expect(sqlRotaNaoEstacionada('rp')).toBe(`rp."STATUS"::text IS DISTINCT FROM 'AGUARDANDO'`);
  });

  it('não aparece no app do promotor, nem com convite CONFIRMADO', () => {
    expect(
      rotaListavelParaPromotor({
        STATUS: StatusRota.AGUARDANDO,
        notificacao: { STATUS: StatusNotificacaoVisita.CONFIRMADO, EXPIRA_EM: null },
      })
    ).toBe(false);
    // As demais regras seguem iguais.
    expect(rotaListavelParaPromotor({ STATUS: StatusRota.A_CAMINHO })).toBe(true);
  });

  it('PUT /rota/workshops não apaga rota estacionada ausente da lista', async () => {
    rotaRepo.find.mockResolvedValue([
      { ID_ROTA_PROMOTOR: 1, ID_OFICINA: 100, STATUS: StatusRota.BACKLOG },
      { ID_ROTA_PROMOTOR: 2, ID_OFICINA: 200, STATUS: StatusRota.AGUARDANDO },
      { ID_ROTA_PROMOTOR: 3, ID_OFICINA: 300, STATUS: StatusRota.BACKLOG },
    ]);

    const result = await RotaService.updateRotaWorkshops(9, [100]);

    expect(result.deleted).toEqual([3]);
    expect(rotaRepo.softDelete).toHaveBeenCalledWith([3]);
  });

  it('PUT /rota/workshops não duplica a oficina de uma rota estacionada', async () => {
    rotaRepo.find.mockResolvedValue([
      { ID_ROTA_PROMOTOR: 2, ID_OFICINA: 200, STATUS: StatusRota.AGUARDANDO },
    ]);

    const result = await RotaService.updateRotaWorkshops(9, [200]);

    expect(result.created).toEqual([]);
    expect(result.deleted).toEqual([]);
    expect(rotaRepo.save).not.toHaveBeenCalled();
  });

  it('opções e detalhe tratam a rota estacionada como inexistente', async () => {
    rotaRepo.findOne.mockResolvedValue({ ID_ROTA_PROMOTOR: 2, STATUS: StatusRota.AGUARDANDO });

    expect(await RotaService.findRotaById(2)).toBeNull();
    expect(await RotaService.updateRotaOptions(2, { STATUS: StatusRota.A_CAMINHO })).toBeNull();
    expect(await RotaService.getRotaByIdWithRelations(2)).toBeNull();
    expect(rotaRepo.save).not.toHaveBeenCalled();
  });

  it('redistribuição por CEP preserva estacionadas; desvínculo apaga tudo', async () => {
    const query = AppDataSourceSync.query as jest.Mock;
    query.mockResolvedValue([]);

    await RotaService.removeCampanhaPromotorRota(7, { preservarEstacionadas: true });
    for (const [sql] of query.mock.calls) {
      expect(sql).toContain(`NOT ("STATUS"::text = 'AGUARDANDO' AND "DELETED_AT" IS NULL)`);
    }

    query.mockClear();
    await RotaService.removeCampanhaPromotorRota(7);
    for (const [sql] of query.mock.calls) {
      expect(sql).not.toContain('AGUARDANDO');
    }
  });
});

// Endereço das telas de rota: MAIN_REGISTER.OFICINA primeiro, dw de fallback.
describe('sqlColunasOficinaRota', () => {
  const sql = sqlColunasOficinaRota('oficina_');

  it('projeta as mesmas colunas de antes, com o prefixo', () => {
    for (const coluna of ['LATITUDE', 'LONGITUDE', 'NOME_FANTASIA', 'ENDERECO', 'BAIRRO', 'CIDADE', 'ESTADO', 'NUMERO', 'CEP', 'CNPJ', 'TELEFONE']) {
      expect(sql).toContain(`as "oficina_${coluna}"`);
    }
  });

  it('escolhe o endereço inteiro de uma fonte só, a OFICINA quando ela tem rua', () => {
    expect(sql).toContain(`CASE WHEN NULLIF(TRIM(o."ENDERECO"), '') IS NOT NULL THEN o."CEP" ELSE ce.cep END`);
    expect(sql).toContain(`CASE WHEN NULLIF(TRIM(o."ENDERECO"), '') IS NOT NULL THEN o."CIDADE" ELSE ce.cidade END`);
  });

  it('usa as coordenadas da OFICINA antes das do dw', () => {
    const lat = sql.slice(0, sql.indexOf('as "oficina_LATITUDE"'));
    expect(lat.indexOf('o."LATITUDE"')).toBeLessThan(lat.indexOf('ce.latitude'));
  });
});
