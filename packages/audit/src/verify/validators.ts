/**
 * Code-side validators (R10, U7 step 2). The agent reports what it sees; this
 * module decides what is *provably* wrong, with no model in the loop:
 *
 * - Aadhaar: 12 digits, first digit 2-9, Verhoeff checksum.
 * - PAN: `AAAAA9999A`.
 * - IFSC: `AAAA0XXXXXX`, plus a prefix that belongs to a bank that has merged.
 * - A validity date that has passed.
 * - A missing signature or seal.
 *
 * Everything here is pure: no network, no clock reads (the caller passes
 * `now`), which is what makes the flags testable.
 */
import { toAsciiDigits } from "@nagriksetu/documents";

/** Verhoeff multiplication table. */
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
] as const;

/** Verhoeff permutation table. */
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 8, 1, 2, 7, 0, 6],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 1, 8, 5, 6, 4, 0],
  [7, 0, 4, 6, 9, 2, 8, 5, 1, 3],
] as const;

/**
 * Verhoeff checksum over a digit string (ASCII or Devanagari), true when the
 * appended check digit is correct. Aadhaar uses this as its 12th digit.
 */
export function verhoeffValid(value: string): boolean {
  const digits = toAsciiDigits(value).replace(/[^0-9]/g, "");
  if (digits.length === 0) return false;
  let checksum = 0;
  const reversed = [...digits].reverse();
  for (let index = 0; index < reversed.length; index += 1) {
    const digit = Number(reversed[index]);
    const row = VERHOEFF_D[checksum];
    const perm = VERHOEFF_P[index % 8];
    if (row === undefined || perm === undefined) return false;
    const next = row[perm[digit] as number];
    if (next === undefined) return false;
    checksum = next;
  }
  return checksum === 0;
}

/** All digits of a value, separators and Devanagari digits normalised away. */
export function digitsOf(value: string): string {
  return toAsciiDigits(value).replace(/[^0-9]/g, "");
}

/** True for a value that is exactly 12 digits once separators are removed. */
export function isAadhaarShaped(value: string): boolean {
  // Numbers on Marathi and Hindi documents are printed in Devanagari digits, so
  // the separators check runs on the normalised form too (U7 step 1).
  const ascii = toAsciiDigits(value).trim();
  return /^[0-9]{12}$/.test(digitsOf(value)) && /^[0-9 -]*$/.test(ascii);
}

export interface AadhaarCheck {
  shaped: boolean;
  valid: boolean;
  /** Human-readable reason, printed into the flag detail. */
  reason: string;
}

/** R10: an Aadhaar-style number that fails its checksum. */
export function checkAadhaar(value: string): AadhaarCheck {
  const digits = digitsOf(value);
  if (!isAadhaarShaped(value)) {
    return { shaped: false, valid: false, reason: "not a 12-digit number" };
  }
  const first = digits[0] as string;
  if (first === "0" || first === "1") {
    return {
      shaped: true,
      valid: false,
      reason: `first digit is ${first}; a real Aadhaar starts with 2-9`,
    };
  }
  if (!verhoeffValid(digits)) {
    return { shaped: true, valid: false, reason: "Verhoeff checksum failed" };
  }
  return { shaped: true, valid: true, reason: "12 digits, 2-9, Verhoeff ok" };
}

/** Indian PAN: five letters, four digits, one letter. */
export const PAN_SHAPE_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
/** PAN-ish, including the common missing-final-letter mistake. */
export const PAN_LOOSE_RE = /^[A-Z]{5}[0-9]{4}[A-Z]?$/;

/** IFSC: four letters, a zero, then six alphanumerics. */
export const IFSC_SHAPE_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
/** IFSC-ish, including an old-style prefix whose branch part changed. */
export const IFSC_LOOSE_RE = /^[A-Z]{4}[0-9]{7}$/;

/** True when the value looks like a PAN attempt at all. */
export function isPanLike(value: string): boolean {
  return PAN_LOOSE_RE.test(value.trim().toUpperCase());
}

/** True for a malformed PAN: PAN-shaped but not a valid PAN. */
export function isMalformedPan(value: string): boolean {
  const upper = value.trim().toUpperCase();
  return PAN_LOOSE_RE.test(upper) && !PAN_SHAPE_RE.test(upper);
}

/** True when the value looks like an IFSC attempt at all. */
export function isIfscLike(value: string): boolean {
  const upper = value.trim().toUpperCase();
  return IFSC_LOOSE_RE.test(upper) || IFSC_SHAPE_RE.test(upper);
}

/** True for a malformed IFSC: IFSC-shaped but not `AAAA0XXXXXX`. */
export function isMalformedIfsc(value: string): boolean {
  const upper = value.trim().toUpperCase();
  return isIfscLike(upper) && !IFSC_SHAPE_RE.test(upper);
}

/** One row of `public.bank_merger_map` (prefix-level mapping only). */
export interface BankMerger {
  old_bank_code: string;
  new_bank_code: string;
  old_bank_name: string;
  new_bank_name: string;
  merged_on: string;
}

/**
 * Bundled copy of the `bank_merger_map` rows seeded by
 * `docs/migrations/002_schema_v2.sql`, so the merged-bank flag works with no
 * Supabase configured (U7 step 2). The table is the source of truth when it is
 * reachable; this is the offline path.
 */
export const BUNDLED_BANK_MERGERS: readonly BankMerger[] = [
  {
    old_bank_code: "SYNB",
    new_bank_code: "CNRB",
    old_bank_name: "Syndicate Bank",
    new_bank_name: "Canara Bank",
    merged_on: "2020-04-01",
  },
  {
    old_bank_code: "ALLA",
    new_bank_code: "IDIB",
    old_bank_name: "Allahabad Bank",
    new_bank_name: "Indian Bank",
    merged_on: "2020-04-01",
  },
  {
    old_bank_code: "ANDB",
    new_bank_code: "UBIN",
    old_bank_name: "Andhra Bank",
    new_bank_name: "Union Bank of India",
    merged_on: "2020-04-01",
  },
  {
    old_bank_code: "CORP",
    new_bank_code: "UBIN",
    old_bank_name: "Corporation Bank",
    new_bank_name: "Union Bank of India",
    merged_on: "2020-04-01",
  },
  {
    old_bank_code: "ORBC",
    new_bank_code: "PUNB",
    old_bank_name: "Oriental Bank of Commerce",
    new_bank_name: "Punjab National Bank",
    merged_on: "2020-04-01",
  },
  {
    old_bank_code: "UTBI",
    new_bank_code: "PUNB",
    old_bank_name: "United Bank of India",
    new_bank_name: "Punjab National Bank",
    merged_on: "2020-04-01",
  },
  {
    old_bank_code: "VIJB",
    new_bank_code: "BARB",
    old_bank_name: "Vijaya Bank",
    new_bank_name: "Bank of Baroda",
    merged_on: "2019-04-01",
  },
  {
    old_bank_code: "BKDN",
    new_bank_code: "BARB",
    old_bank_name: "Dena Bank",
    new_bank_name: "Bank of Baroda",
    merged_on: "2019-04-01",
  },
];

/** The first four characters of an IFSC are the bank code. */
export function bankPrefixOf(ifsc: string): string {
  return ifsc.trim().toUpperCase().slice(0, 4);
}

/** The merger row for an IFSC's bank prefix, or `undefined` when never merged. */
export function findMergedBank(
  ifsc: string,
  mergers: readonly BankMerger[] = BUNDLED_BANK_MERGERS,
): BankMerger | undefined {
  const prefix = bankPrefixOf(ifsc);
  return mergers.find((row) => row.old_bank_code === prefix);
}

/** Field keys that carry a validity/expiry date. */
export const VALIDITY_KEY_RE =
  /(valid|expiry|expires|expiration|validity|renew|last_date|due_date)/i;

/** True when a field key names a validity date. */
export function isValidityKey(key: string): boolean {
  return VALIDITY_KEY_RE.test(key);
}

/**
 * Parse the date formats these documents actually print: `2027-06-11`,
 * `11/06/2027`, `11-06-2027`, `2027/06/11`, Devanagari digits included.
 * Returns `undefined` when the value is not a real calendar date.
 */
export function parseDateValue(value: string): Date | undefined {
  const text = toAsciiDigits(value).trim();
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  if (iso) return utcDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dmy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);
  if (dmy) return utcDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  const monthName = /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/.exec(text);
  if (monthName) {
    const month = MONTHS[monthName[2]?.slice(0, 3).toLowerCase() ?? ""];
    if (month !== undefined) {
      return utcDate(Number(monthName[3]), month, Number(monthName[1]));
    }
  }
  return undefined;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function utcDate(year: number, month: number, day: number): Date | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return undefined; // e.g. 31/02/2027
  }
  return date;
}

/**
 * True when a validity date is already in the past. `undefined` when the value
 * is not a date this module can read — an unreadable date is not evidence of
 * expiry, so it raises no flag.
 */
export function isPastDate(value: string, now: Date): boolean | undefined {
  const date = parseDateValue(value);
  if (!date) return undefined;
  return date.getTime() < startOfUtcDay(now).getTime();
}

function startOfUtcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/** Days a document is past its validity date (0 when still valid). */
export function daysPast(value: string, now: Date): number | undefined {
  const date = parseDateValue(value);
  if (!date) return undefined;
  const ms = startOfUtcDay(now).getTime() - date.getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}
