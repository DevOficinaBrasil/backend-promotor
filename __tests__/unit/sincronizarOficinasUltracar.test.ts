import {
  ehCandidataParaCorrecaoCep,
  corrigirCepsDivergentes,
  decidirValorPreenchido,
  camposParaAtualizar,
  enriquecerOficinasComUltracar,
} from '../../scripts/sincronizar-oficinas-ultracar';
import { AppDataSourceSync } from '../../data-source';

jest.mock('../../data-source');

const AGORA = new Date('2026-11-06T00:00:00Z');
const HA_13_MESES = new Date('2025-10-06T00:00:00Z');
const HA_1_MES = new Date('2026-10-06T00:00:00Z');

describe('ehCandidataParaCorrecaoCep (ULTRACAR-15 a ULTRACAR-20)', () => {
  it('is not a candidate when the CEP is the same (digits), regardless of punctuation', () => {
    expect(
      ehCandidataParaCorrecaoCep(
        { temMatchUltracar: true, cepOficina: '01000-000', cepUltracar: '01000000', dataAtualizacaoEndereco: null },
        AGORA
      )
    ).toBe(false);
  });

  it('is a candidate when CEP diverges and DATA_ATUALIZACAO_ENDERECO is more than 12 months old', () => {
    expect(
      ehCandidataParaCorrecaoCep(
        { temMatchUltracar: true, cepOficina: '01000-000', cepUltracar: '02000-000', dataAtualizacaoEndereco: HA_13_MESES },
        AGORA
      )
    ).toBe(true);
  });

  it('is not a candidate when CEP diverges but DATA_ATUALIZACAO_ENDERECO is recent (within 12 months)', () => {
    expect(
      ehCandidataParaCorrecaoCep(
        { temMatchUltracar: true, cepOficina: '01000-000', cepUltracar: '02000-000', dataAtualizacaoEndereco: HA_1_MES },
        AGORA
      )
    ).toBe(false);
  });

  it('is a candidate when CEP diverges and DATA_ATUALIZACAO_ENDERECO is null (never confirmed)', () => {
    expect(
      ehCandidataParaCorrecaoCep(
        { temMatchUltracar: true, cepOficina: '01000-000', cepUltracar: '02000-000', dataAtualizacaoEndereco: null },
        AGORA
      )
    ).toBe(true);
  });

  it('is not a candidate when there is no CNPJ match with the Ultracar base', () => {
    expect(
      ehCandidataParaCorrecaoCep(
        { temMatchUltracar: false, cepOficina: '01000-000', cepUltracar: '02000-000', dataAtualizacaoEndereco: null },
        AGORA
      )
    ).toBe(false);
  });

  it('is not a candidate when the Ultracar CEP is empty/unresolvable', () => {
    expect(
      ehCandidataParaCorrecaoCep(
        { temMatchUltracar: true, cepOficina: '01000-000', cepUltracar: null, dataAtualizacaoEndereco: null },
        AGORA
      )
    ).toBe(false);
  });
});

describe('corrigirCepsDivergentes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not execute any UPDATE in test mode, even with candidates found', async () => {
    (AppDataSourceSync.query as jest.Mock).mockResolvedValueOnce([
      { ID_OFICINA: 1, CEP_OFICINA: '01000-000', CEP_ULTRACAR: '02000-000', DATA_ATUALIZACAO_ENDERECO: null },
    ]);

    const relatorio = await corrigirCepsDivergentes(true, 20, AGORA);

    expect(relatorio.candidatos).toHaveLength(1);
    expect(relatorio.atualizadas).toBe(0);
    expect(AppDataSourceSync.query).toHaveBeenCalledTimes(1); // só o SELECT
  });

  it('should cap the test-mode report to the configured limit', async () => {
    (AppDataSourceSync.query as jest.Mock).mockResolvedValueOnce([
      { ID_OFICINA: 1, CEP_OFICINA: '01000-000', CEP_ULTRACAR: '02000-000', DATA_ATUALIZACAO_ENDERECO: null },
      { ID_OFICINA: 2, CEP_OFICINA: '03000-000', CEP_ULTRACAR: '04000-000', DATA_ATUALIZACAO_ENDERECO: null },
    ]);

    const relatorio = await corrigirCepsDivergentes(true, 1, AGORA);

    expect(relatorio.candidatos).toHaveLength(1);
  });

  it('should update only the CEP column, one row per candidate, in real mode', async () => {
    (AppDataSourceSync.query as jest.Mock)
      .mockResolvedValueOnce([
        { ID_OFICINA: 1, CEP_OFICINA: '01000-000', CEP_ULTRACAR: '02000-000', DATA_ATUALIZACAO_ENDERECO: null },
        { ID_OFICINA: 2, CEP_OFICINA: '03000-000', CEP_ULTRACAR: '04000-000', DATA_ATUALIZACAO_ENDERECO: null },
      ])
      .mockResolvedValue([]);

    const relatorio = await corrigirCepsDivergentes(false, 20, AGORA);

    expect(relatorio.atualizadas).toBe(2);
    expect(AppDataSourceSync.query).toHaveBeenCalledTimes(3); // 1 SELECT + 2 UPDATE
    expect(AppDataSourceSync.query).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/UPDATE "MAIN_REGISTER"\."OFICINA" SET "CEP" = \$1/),
      ['02000-000', 1]
    );
    expect(AppDataSourceSync.query).toHaveBeenNthCalledWith(
      3,
      expect.stringMatching(/UPDATE "MAIN_REGISTER"\."OFICINA" SET "CEP" = \$1/),
      ['04000-000', 2]
    );
  });

  it('should not update a non-candidate row (same CEP) in real mode', async () => {
    (AppDataSourceSync.query as jest.Mock).mockResolvedValueOnce([
      { ID_OFICINA: 1, CEP_OFICINA: '01000-000', CEP_ULTRACAR: '01000-000', DATA_ATUALIZACAO_ENDERECO: null },
    ]);

    const relatorio = await corrigirCepsDivergentes(false, 20, AGORA);

    expect(relatorio.atualizadas).toBe(0);
    expect(AppDataSourceSync.query).toHaveBeenCalledTimes(1); // só o SELECT
  });

  it('should query ultracar_process.enterprise__tb_company_address for the Ultracar CEP', async () => {
    (AppDataSourceSync.query as jest.Mock).mockResolvedValueOnce([]);

    await corrigirCepsDivergentes(true, 20, AGORA);

    const query = (AppDataSourceSync.query as jest.Mock).mock.calls[0][0] as string;
    expect(query).toContain('ultracar_process.enterprise__tb_company_address');
    expect(query).toContain('ultracar_process.enterprise__tb_company');
  });
});

describe('decidirValorPreenchido (ULTRACAR-24)', () => {
  it('fills an empty value with the Ultracar value', () => {
    expect(decidirValorPreenchido(null, 'Rua Nova')).toBe('Rua Nova');
    expect(decidirValorPreenchido('', 'Rua Nova')).toBe('Rua Nova');
    expect(decidirValorPreenchido('  ', 'Rua Nova')).toBe('Rua Nova');
  });

  it('never overwrites a value that is already filled', () => {
    expect(decidirValorPreenchido('Rua Antiga', 'Rua Nova')).toBeUndefined();
  });

  it('does not fill when the Ultracar value is also empty', () => {
    expect(decidirValorPreenchido(null, null)).toBeUndefined();
    expect(decidirValorPreenchido(null, '')).toBeUndefined();
  });
});

describe('camposParaAtualizar (ULTRACAR-22/23/24/25)', () => {
  const vazio = { ENDERECO: null, NUMERO: null, BAIRRO: null, CEP: null, LATITUDE: null, LONGITUDE: null, CIDADE: null, ESTADO: null };
  const enderecoUltracar = { ENDERECO: 'Rua X', NUMERO: '10', BAIRRO: 'Centro', CEP: '01000-000', LATITUDE: '-23.5', LONGITUDE: '-46.6' };
  const cidadeEstadoUltracar = { CIDADE: 'São Paulo', ESTADO: 'SP' };

  it.each(['ENDERECO', 'NUMERO', 'BAIRRO', 'CEP', 'LATITUDE', 'LONGITUDE'] as const)(
    'fills %s from enterprise__tb_company_address when empty',
    (campo) => {
      const resultado = camposParaAtualizar(vazio, enderecoUltracar, null);
      expect(resultado[campo]).toBe(enderecoUltracar[campo]);
    }
  );

  it.each(['CIDADE', 'ESTADO'] as const)(
    'fills %s from the most recent st_obads_im record when empty',
    (campo) => {
      const resultado = camposParaAtualizar(vazio, null, cidadeEstadoUltracar);
      expect(resultado[campo]).toBe(cidadeEstadoUltracar[campo]);
    }
  );

  it('does not overwrite BAIRRO when already filled, but still fills ENDERECO (independent teardown: ENDERECO x BAIRRO)', () => {
    const atual = { ...vazio, BAIRRO: 'Bairro Já Cadastrado' };

    const resultado = camposParaAtualizar(atual, enderecoUltracar, null);

    expect(resultado.BAIRRO).toBeUndefined();
    expect(resultado.ENDERECO).toBe('Rua X');
  });

  it('returns no updates when there is nothing to fill from either source', () => {
    expect(camposParaAtualizar(vazio, null, null)).toEqual({});
  });
});

describe('enriquecerOficinasComUltracar (ULTRACAR-21 a ULTRACAR-26)', () => {
  function mockQueryRunner(rows: any[]) {
    const query = jest.fn().mockResolvedValue(rows);
    const queryRunner = { connect: jest.fn(), query, release: jest.fn() };
    (AppDataSourceSync.createQueryRunner as jest.Mock).mockReturnValue(queryRunner);
    return queryRunner;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should match regardless of active (no "active" filter in the SQL, unlike the CEP-correction branch)', async () => {
    (AppDataSourceSync.query as jest.Mock).mockResolvedValueOnce([]);
    mockQueryRunner([]);

    await enriquecerOficinasComUltracar(true, 20);

    const query = (AppDataSourceSync.query as jest.Mock).mock.calls[0][0] as string;
    expect(query).toContain('ultracar_process.enterprise__tb_company');
    expect(query).not.toMatch(/c\.active/);
  });

  it('should run the st_obads_im query only after elevating statement_timeout on the same connection', async () => {
    (AppDataSourceSync.query as jest.Mock).mockResolvedValueOnce([
      { ID_OFICINA: 1, ENDERECO: null, NUMERO: null, BAIRRO: null, CEP: null, LATITUDE: null, LONGITUDE: null, CIDADE: null, ESTADO: null, CNPJ_ULTRACAR: '12345678000199', ADDR_ENDERECO: null, ADDR_NUMERO: null, ADDR_BAIRRO: null, ADDR_CEP: null, ADDR_LATITUDE: null, ADDR_LONGITUDE: null },
    ]);
    const queryRunner = mockQueryRunner([{ cnpj: '12345678000199', cidade: 'São Paulo', estado: 'SP' }]);

    await enriquecerOficinasComUltracar(true, 20);

    expect(queryRunner.query.mock.calls[0][0]).toMatch(/SET statement_timeout/);
    expect(queryRunner.query.mock.calls[1][0]).toContain('ultracar_process.st_obads_im');
  });

  it('should order st_obads_im by dt_fechado DESC to pick the most recent record per CNPJ', async () => {
    (AppDataSourceSync.query as jest.Mock).mockResolvedValueOnce([
      { ID_OFICINA: 1, ENDERECO: null, NUMERO: null, BAIRRO: null, CEP: null, LATITUDE: null, LONGITUDE: null, CIDADE: null, ESTADO: null, CNPJ_ULTRACAR: '12345678000199', ADDR_ENDERECO: null, ADDR_NUMERO: null, ADDR_BAIRRO: null, ADDR_CEP: null, ADDR_LATITUDE: null, ADDR_LONGITUDE: null },
    ]);
    const queryRunner = mockQueryRunner([{ cnpj: '12345678000199', cidade: 'São Paulo', estado: 'SP' }]);

    await enriquecerOficinasComUltracar(true, 20);

    expect(queryRunner.query.mock.calls[1][0]).toMatch(/ORDER BY cnpj, dt_fechado DESC/);
  });

  it('should not execute any UPDATE in test mode, even with fields to fill', async () => {
    (AppDataSourceSync.query as jest.Mock).mockResolvedValueOnce([
      { ID_OFICINA: 1, ENDERECO: null, NUMERO: null, BAIRRO: null, CEP: null, LATITUDE: null, LONGITUDE: null, CIDADE: null, ESTADO: null, CNPJ_ULTRACAR: '12345678000199', ADDR_ENDERECO: 'Rua X', ADDR_NUMERO: '10', ADDR_BAIRRO: 'Centro', ADDR_CEP: '01000-000', ADDR_LATITUDE: '-23.5', ADDR_LONGITUDE: '-46.6' },
    ]);
    mockQueryRunner([]);

    const relatorio = await enriquecerOficinasComUltracar(true, 20);

    expect(relatorio.oficinasComMatch).toBe(1);
    expect(relatorio.oficinasComCampoPreenchido).toBe(1);
    expect(relatorio.oficinasMarcadas).toBe(0);
    expect(AppDataSourceSync.query).toHaveBeenCalledTimes(1); // só o SELECT de candidatos
  });

  it('should set ULTRACAR = true for every matched oficina in real mode, even one already fully filled', async () => {
    (AppDataSourceSync.query as jest.Mock)
      .mockResolvedValueOnce([
        { ID_OFICINA: 1, ENDERECO: 'Rua Já Cadastrada', NUMERO: '1', BAIRRO: 'Bairro', CEP: '01000-000', LATITUDE: '-23', LONGITUDE: '-46', CIDADE: 'São Paulo', ESTADO: 'SP', CNPJ_ULTRACAR: '12345678000199', ADDR_ENDERECO: null, ADDR_NUMERO: null, ADDR_BAIRRO: null, ADDR_CEP: null, ADDR_LATITUDE: null, ADDR_LONGITUDE: null },
      ])
      .mockResolvedValue([]);
    mockQueryRunner([]);

    const relatorio = await enriquecerOficinasComUltracar(false, 20);

    expect(relatorio.oficinasMarcadas).toBe(1);
    expect(AppDataSourceSync.query).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/UPDATE "MAIN_REGISTER"\."OFICINA" SET "ULTRACAR" = true WHERE "ID_OFICINA" = \$1/),
      [1]
    );
  });

  it('should fill empty fields and set ULTRACAR = true in the same UPDATE, in real mode', async () => {
    (AppDataSourceSync.query as jest.Mock)
      .mockResolvedValueOnce([
        { ID_OFICINA: 1, ENDERECO: null, NUMERO: null, BAIRRO: 'Já preenchido', CEP: null, LATITUDE: null, LONGITUDE: null, CIDADE: null, ESTADO: null, CNPJ_ULTRACAR: '12345678000199', ADDR_ENDERECO: 'Rua X', ADDR_NUMERO: '10', ADDR_BAIRRO: 'Outro Bairro', ADDR_CEP: '01000-000', ADDR_LATITUDE: '-23.5', ADDR_LONGITUDE: '-46.6' },
      ])
      .mockResolvedValue([]);
    mockQueryRunner([]);

    await enriquecerOficinasComUltracar(false, 20);

    const [query, params] = (AppDataSourceSync.query as jest.Mock).mock.calls[1];
    expect(query).toContain('"ULTRACAR" = true');
    expect(query).toContain('"ENDERECO" = $');
    expect(query).not.toContain('"BAIRRO" = $'); // já preenchido, não sobrescreve
    expect(params).toContain('Rua X');
  });

  it('should never touch CNPJ, NOME_FANTASIA, RAZAO_SOCIAL or TELEFONE (ULTRACAR-25)', async () => {
    (AppDataSourceSync.query as jest.Mock)
      .mockResolvedValueOnce([
        { ID_OFICINA: 1, ENDERECO: null, NUMERO: null, BAIRRO: null, CEP: null, LATITUDE: null, LONGITUDE: null, CIDADE: null, ESTADO: null, CNPJ_ULTRACAR: '12345678000199', ADDR_ENDERECO: 'Rua X', ADDR_NUMERO: '10', ADDR_BAIRRO: 'Centro', ADDR_CEP: '01000-000', ADDR_LATITUDE: '-23.5', ADDR_LONGITUDE: '-46.6' },
      ])
      .mockResolvedValue([]);
    mockQueryRunner([]);

    await enriquecerOficinasComUltracar(false, 20);

    const updateQuery = (AppDataSourceSync.query as jest.Mock).mock.calls[1][0] as string;
    expect(updateQuery).not.toContain('"CNPJ"');
    expect(updateQuery).not.toContain('"NOME_FANTASIA"');
    expect(updateQuery).not.toContain('"RAZAO_SOCIAL"');
    expect(updateQuery).not.toContain('"TELEFONE"');
  });

  it('should cap the test-mode report to the configured limit', async () => {
    (AppDataSourceSync.query as jest.Mock).mockResolvedValueOnce([
      { ID_OFICINA: 1, ENDERECO: null, NUMERO: null, BAIRRO: null, CEP: null, LATITUDE: null, LONGITUDE: null, CIDADE: null, ESTADO: null, CNPJ_ULTRACAR: '111', ADDR_ENDERECO: 'Rua X', ADDR_NUMERO: null, ADDR_BAIRRO: null, ADDR_CEP: null, ADDR_LATITUDE: null, ADDR_LONGITUDE: null },
      { ID_OFICINA: 2, ENDERECO: null, NUMERO: null, BAIRRO: null, CEP: null, LATITUDE: null, LONGITUDE: null, CIDADE: null, ESTADO: null, CNPJ_ULTRACAR: '222', ADDR_ENDERECO: 'Rua Y', ADDR_NUMERO: null, ADDR_BAIRRO: null, ADDR_CEP: null, ADDR_LATITUDE: null, ADDR_LONGITUDE: null },
    ]);
    mockQueryRunner([]);

    const relatorio = await enriquecerOficinasComUltracar(true, 1);

    expect(relatorio.planejado).toHaveLength(1);
    expect(relatorio.oficinasComCampoPreenchido).toBe(2); // contagem real, não limitada
  });
});
