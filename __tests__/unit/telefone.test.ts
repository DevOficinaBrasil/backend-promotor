import { normalizarTelefone, ehCelular, resolverTelefone } from '../../utils/telefone';
import { TelefoneOrigem } from '../../entities/NotificacaoVisita';

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

// CONV-43 / CONV-44 (disparo-convite-visita-admin): fallback de telefone.
// ehCelular: 55 + DDD + 9 + 8 dígitos. Fixo (DDD + 8 dígitos) não recebe WhatsApp comum.
describe('ehCelular', () => {
  it('aceita número normalizado de celular (55 + DDD + 9 + 8 dígitos)', () => {
    expect(ehCelular('5511999998888')).toBe(true);
  });

  it('recusa fixo normalizado (55 + DDD + 8 dígitos)', () => {
    expect(ehCelular('551133334444')).toBe(false);
  });

  it('recusa 11 dígitos locais que não começam com 9 depois do DDD', () => {
    expect(ehCelular('5511899998888')).toBe(false);
  });

  it('recusa número sem o prefixo 55 (não normalizado)', () => {
    expect(ehCelular('11999998888')).toBe(false);
  });
});

describe('resolverTelefone', () => {
  const usuario = (ID_USUARIO: number, CELULAR: string | null, TELEFONE: string | null = null) => ({
    ID_USUARIO,
    CELULAR,
    TELEFONE,
  });

  // Done when 1: CELULAR preenchido é usado em qualquer formato válido, como hoje.
  it('usa o CELULAR do primeiro usuário que tem CELULAR, com origem USUARIO_CELULAR', () => {
    expect(
      resolverTelefone({
        usuarios: [usuario(1, null, '(11) 98888-7777'), usuario(2, '(21) 97777-6666')],
        oficinaTelefone: '11977776666',
        cadastroTelefone: '11966665555',
      }),
    ).toEqual({ telefone: '5521977776666', origem: TelefoneOrigem.USUARIO_CELULAR, idUsuario: 2 });
  });

  it('aceita CELULAR em formato de fixo, como hoje (qualquer formato que normalize)', () => {
    expect(
      resolverTelefone({ usuarios: [usuario(7, '1133334444')], oficinaTelefone: null, cadastroTelefone: null }),
    ).toEqual({ telefone: '551133334444', origem: TelefoneOrigem.USUARIO_CELULAR, idUsuario: 7 });
  });

  it('CELULAR só com espaços conta como vazio e segue para o fallback', () => {
    expect(
      resolverTelefone({ usuarios: [usuario(3, '   ')], oficinaTelefone: '11977776666', cadastroTelefone: null }),
    ).toEqual({ telefone: '5511977776666', origem: TelefoneOrigem.OFICINA_TELEFONE, idUsuario: 3 });
  });

  // Done when 1: CELULAR inválido não cai para o fallback (design: mantém MOTIVO_TELEFONE_INVALIDO).
  it('CELULAR preenchido e inválido devolve telefone nulo com a origem USUARIO_CELULAR, sem fallback', () => {
    expect(
      resolverTelefone({
        usuarios: [usuario(4, 'abc', '11988887777')],
        oficinaTelefone: '11977776666',
        cadastroTelefone: '11966665555',
      }),
    ).toEqual({ telefone: null, origem: TelefoneOrigem.USUARIO_CELULAR, idUsuario: 4 });
  });

  // Done when 2: sem CELULAR, ordem USUARIO.TELEFONE → OFICINA.TELEFONE → ce.telefone.
  it('sem CELULAR, usa USUARIO.TELEFONE em formato de celular, na ordem dos usuários', () => {
    expect(
      resolverTelefone({
        usuarios: [usuario(5, null, null), usuario(6, '', '(31) 99999-1111'), usuario(8, null, '11988887777')],
        oficinaTelefone: '11977776666',
        cadastroTelefone: '11966665555',
      }),
    ).toEqual({ telefone: '5531999991111', origem: TelefoneOrigem.USUARIO_TELEFONE, idUsuario: 6 });
  });

  it('sem CELULAR e com USUARIO.TELEFONE fixo, descarta o fixo e usa OFICINA.TELEFONE com o primeiro usuário', () => {
    expect(
      resolverTelefone({
        usuarios: [usuario(10, null, '1133334444'), usuario(11, null, null)],
        oficinaTelefone: '(11) 97777-6666',
        cadastroTelefone: '11966665555',
      }),
    ).toEqual({ telefone: '5511977776666', origem: TelefoneOrigem.OFICINA_TELEFONE, idUsuario: 10 });
  });

  it('sem CELULAR e com OFICINA.TELEFONE fixo, usa dw.cadastro_empresa.telefone com o primeiro usuário', () => {
    expect(
      resolverTelefone({
        usuarios: [usuario(12, null, null), usuario(13, null, null)],
        oficinaTelefone: '1133334444',
        cadastroTelefone: '5521966665555',
      }),
    ).toEqual({ telefone: '5521966665555', origem: TelefoneOrigem.CADASTRO_EMPRESA_TELEFONE, idUsuario: 12 });
  });

  it('descarta candidato de fallback que não normaliza (DDD inválido) e segue a ordem', () => {
    expect(
      resolverTelefone({
        usuarios: [usuario(14, null, '(20) 99999-8888')],
        oficinaTelefone: null,
        cadastroTelefone: '11966665555',
      }),
    ).toEqual({ telefone: '5511966665555', origem: TelefoneOrigem.CADASTRO_EMPRESA_TELEFONE, idUsuario: 14 });
  });

  it('sem nenhuma fonte com formato de celular (só fixos) devolve null', () => {
    expect(
      resolverTelefone({
        usuarios: [usuario(15, null, '1133334444')],
        oficinaTelefone: '1144445555',
        cadastroTelefone: '551155556666',
      }),
    ).toBeNull();
  });

  it('sem nenhuma fonte preenchida devolve null', () => {
    expect(
      resolverTelefone({ usuarios: [usuario(16, null, null)], oficinaTelefone: null, cadastroTelefone: null }),
    ).toBeNull();
  });

  // Done when 3: sem usuário → null (o token precisa de sub), mesmo com telefone de oficina.
  it('sem usuário devolve null mesmo com telefone de oficina em formato de celular', () => {
    expect(
      resolverTelefone({ usuarios: [], oficinaTelefone: '11977776666', cadastroTelefone: '11966665555' }),
    ).toBeNull();
  });
});
