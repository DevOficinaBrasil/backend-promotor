import { sqlOficinasComMatchUltracar } from '../../service/oficinaUltracarService';

describe('sqlOficinasComMatchUltracar', () => {
  it('should query MAIN_REGISTER.OFICINA and the Ultracar schema/table', () => {
    const sql = sqlOficinasComMatchUltracar();

    expect(sql).toContain('"MAIN_REGISTER"."OFICINA"');
    expect(sql).toContain('ultracar_process.enterprise__tb_company');
  });

  it('should use LEFT JOIN for the CNPJ match, never a correlated EXISTS/IN subquery', () => {
    const sql = sqlOficinasComMatchUltracar();

    expect(sql).toContain('LEFT JOIN');
    expect(sql).not.toMatch(/EXISTS\s*\(/);
    expect(sql).not.toMatch(/\bIN\s*\(\s*SELECT/);
  });

  it('should filter active = true on enterprise__tb_company', () => {
    const sql = sqlOficinasComMatchUltracar();

    expect(sql).toMatch(/WHERE\s+active\s*=\s*true/);
  });

  it('should not reference EMPRESA_SLUG (no community filter in this branch)', () => {
    const sql = sqlOficinasComMatchUltracar();

    expect(sql).not.toContain('EMPRESA_SLUG');
  });

  it('should project the same columns as the community branch', () => {
    const sql = sqlOficinasComMatchUltracar();

    for (const coluna of [
      '"ID_OFICINA"', '"LATITUDE"', '"LONGITUDE"', '"NOME_FANTASIA"',
      '"ENDERECO"', '"BAIRRO"', '"CIDADE"', '"ESTADO"', '"NUMERO"', '"CEP"', '"CNPJ"', '"TELEFONE"',
    ]) {
      expect(sql).toContain(coluna);
    }
  });

  it('should add a NULL distance column only when incluirDistancia is true', () => {
    const semDistancia = sqlOficinasComMatchUltracar('o', false);
    const comDistancia = sqlOficinasComMatchUltracar('o', true);

    expect(semDistancia).not.toContain('AS distance');
    expect(comDistancia).toContain('NULL::double precision AS distance');
  });

  it('should use the given oficina alias throughout the fragment', () => {
    const sql = sqlOficinasComMatchUltracar('o3');

    expect(sql).toContain('"MAIN_REGISTER"."OFICINA" o3');
    expect(sql).toContain('o3."ID_OFICINA"');
  });
});
