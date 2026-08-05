import { normalizarTelefone } from '../../utils/telefone';

// Spec: AC4 — normalize CELULAR to digits-only 55DDDNNNNNNNNN before dispatch;
// if the value doesn't fit a valid 10-11 digit Brazilian local pattern after
// the 55 prefix, treat as invalid and don't dispatch (return null, fail closed).
// Edge case: non-numeric characters or an invalid DDD must fail closed too.
describe('normalizarTelefone', () => {
  it('normalizes a 10-digit landline-style local number (DDD + 8 digits)', () => {
    expect(normalizarTelefone('1133334444')).toBe('551133334444');
  });

  it('normalizes an 11-digit mobile-style local number (DDD + 9 digits)', () => {
    expect(normalizarTelefone('11999998888')).toBe('5511999998888');
  });

  it('leaves an already-55-prefixed 13-digit mobile number unprefixed twice', () => {
    expect(normalizarTelefone('5511999998888')).toBe('5511999998888');
  });

  it('leaves an already-55-prefixed 12-digit landline number unprefixed twice', () => {
    expect(normalizarTelefone('551133334444')).toBe('551133334444');
  });

  it('strips a masked format with parentheses, spaces, and a hyphen', () => {
    expect(normalizarTelefone('(11) 99999-8888')).toBe('5511999998888');
  });

  it('strips a masked format carrying a leading "+"', () => {
    expect(normalizarTelefone('+55 (11) 99999-8888')).toBe('5511999998888');
  });

  it('returns null for an empty string', () => {
    expect(normalizarTelefone('')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(normalizarTelefone(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(normalizarTelefone(undefined)).toBeNull();
  });

  it('returns null for non-numeric junk', () => {
    expect(normalizarTelefone('abc-def-ghij')).toBeNull();
  });

  it('returns null for an invalid DDD (not an assigned Brazilian area code)', () => {
    expect(normalizarTelefone('(20) 99999-8888')).toBeNull();
  });

  it('returns null for an invalid DDD even with the 55 country code present', () => {
    expect(normalizarTelefone('5520999998888')).toBeNull();
  });

  it('returns null for a number with too few digits', () => {
    expect(normalizarTelefone('123456789')).toBeNull();
  });

  it('returns null for a number with too many digits', () => {
    expect(normalizarTelefone('551199999888899')).toBeNull();
  });

  it('returns null for a 12/13-digit number missing the 55 country code', () => {
    expect(normalizarTelefone('1211999998888')).toBeNull();
  });
});
