import { TelefoneOrigem } from "../entities/NotificacaoVisita";

// Set of valid Brazilian DDD (area code) values, per ANATEL's allocation.
// Codes like 20, 23, 25, 26, 29, 36, 39, 40, 50, 52, 56-60, 70, 72, 76, 78, 80, 90
// are not assigned and must be rejected.
const VALID_DDDS = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24",
  "27", "28",
  "31", "32", "33", "34", "35", "37", "38",
  "41", "42", "43", "44", "45", "46",
  "47", "48", "49",
  "51", "53", "54", "55",
  "61",
  "62", "64",
  "63",
  "65", "66",
  "67",
  "68",
  "69",
  "71", "73", "74", "75", "77",
  "79",
  "81", "87",
  "82",
  "83",
  "84",
  "85", "88",
  "86", "89",
  "91", "93", "94",
  "92", "97",
  "95",
  "96",
  "98", "99",
]);

/**
 * Normalizes a Brazilian phone number to the digits-only 55DDDNNNNNNNNN
 * format (country code + DDD + subscriber number, no "+" or separators).
 *
 * Fails closed: returns null for non-numeric junk, an invalid DDD, or a
 * digit count that doesn't fit a valid 10-11 digit Brazilian local number
 * (with or without an already-present "55" country code prefix) — never
 * emits a malformed number.
 */
export function normalizarTelefone(celular: string | null | undefined): string | null {
  if (celular == null) {
    return null;
  }

  const digitsOnly = celular.replace(/\D/g, "");

  if (!digitsOnly) {
    return null;
  }

  let local: string;

  if (digitsOnly.length === 12 || digitsOnly.length === 13) {
    // Already carries a country code — must be "55", never double-prefixed.
    if (!digitsOnly.startsWith("55")) {
      return null;
    }
    local = digitsOnly.slice(2);
  } else if (digitsOnly.length === 10 || digitsOnly.length === 11) {
    local = digitsOnly;
  } else {
    return null;
  }

  if (local.length !== 10 && local.length !== 11) {
    return null;
  }

  const ddd = local.slice(0, 2);
  if (!VALID_DDDS.has(ddd)) {
    return null;
  }

  return `55${local}`;
}

/**
 * True for a normalized mobile number: 55 + DDD + 9 + 8 digits. Landlines
 * (DDD + 8 digits) do not receive regular WhatsApp, so the phone fallback only
 * accepts numbers in this shape (CONV-43). Expects normalizarTelefone output.
 */
export function ehCelular(normalizado: string): boolean {
  return /^55\d{2}9\d{8}$/.test(normalizado);
}

export interface CandidatoUsuarioTelefone {
  ID_USUARIO: number;
  CELULAR: string | null | undefined;
  TELEFONE: string | null | undefined;
}

export interface CandidatosTelefone {
  // Same order recipient resolution uses today: DATA_ALTERACAO DESC NULLS LAST, ID_USUARIO ASC.
  usuarios: CandidatoUsuarioTelefone[];
  oficinaTelefone: string | null | undefined;
  cadastroTelefone: string | null | undefined;
}

export interface TelefoneResolvido {
  // null only when the chosen CELULAR is filled but does not normalize: the
  // caller keeps today's MOTIVO_TELEFONE_INVALIDO and does not fall back.
  telefone: string | null;
  origem: TelefoneOrigem;
  idUsuario: number;
}

const preenchido = (valor: string | null | undefined): boolean => (valor ?? "").trim() !== "";

/**
 * Picks the number an invitation goes to (CONV-43, CONV-44).
 *
 * 1. First user with a filled CELULAR, in any format normalizarTelefone accepts
 *    (today's behavior). An invalid CELULAR does not fall back.
 * 2. No CELULAR at all: first candidate that normalizes AND is a mobile, in the
 *    order USUARIO.TELEFONE (same user order), OFICINA.TELEFONE,
 *    dw.cadastro_empresa.telefone. Workshop-level sources use the first user,
 *    because the link token needs a subject.
 *
 * Returns null without users or without any usable number.
 */
export function resolverTelefone(candidatos: CandidatosTelefone): TelefoneResolvido | null {
  const { usuarios } = candidatos;
  if (usuarios.length === 0) {
    return null;
  }

  const comCelular = usuarios.find((usuario) => preenchido(usuario.CELULAR));
  if (comCelular !== undefined) {
    return {
      telefone: normalizarTelefone(comCelular.CELULAR),
      origem: TelefoneOrigem.USUARIO_CELULAR,
      idUsuario: comCelular.ID_USUARIO,
    };
  }

  const celularValido = (valor: string | null | undefined): string | null => {
    const normalizado = normalizarTelefone(valor);
    return normalizado !== null && ehCelular(normalizado) ? normalizado : null;
  };

  for (const usuario of usuarios) {
    const telefone = celularValido(usuario.TELEFONE);
    if (telefone !== null) {
      return { telefone, origem: TelefoneOrigem.USUARIO_TELEFONE, idUsuario: usuario.ID_USUARIO };
    }
  }

  const primeiroUsuario = usuarios[0].ID_USUARIO;
  const fontesDaOficina: [string | null | undefined, TelefoneOrigem][] = [
    [candidatos.oficinaTelefone, TelefoneOrigem.OFICINA_TELEFONE],
    [candidatos.cadastroTelefone, TelefoneOrigem.CADASTRO_EMPRESA_TELEFONE],
  ];
  for (const [valor, origem] of fontesDaOficina) {
    const telefone = celularValido(valor);
    if (telefone !== null) {
      return { telefone, origem, idUsuario: primeiroUsuario };
    }
  }

  return null;
}
