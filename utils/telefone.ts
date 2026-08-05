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
