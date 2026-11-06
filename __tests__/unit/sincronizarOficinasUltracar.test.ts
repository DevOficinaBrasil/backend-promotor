import {
  ehCandidataParaCorrecaoCep,
  corrigirCepsDivergentes,
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
