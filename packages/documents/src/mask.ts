/**
 * PII masking (R11 / KTD6) — **pattern-first, value-second**.
 *
 * A value is masked because of its *shape*, whatever key it was recorded under,
 * and then again because of its key: an Aadhaar-shaped number under an
 * unexpected key is still masked, and an identity-looking field is masked even
 * when its value does not match the canonical shape. Masking happens before
 * anything leaves the service, is stored, or is logged.
 *
 * Shapes and results:
 * - Aadhaar      12 digits, optionally grouped 4-4-4 with spaces/hyphens, in
 *                ASCII or Devanagari digits -> `XXXX-XXXX-1234`
 * - PAN          `ABCDE1234F`                  -> last 4 kept, rest `X`
 * - Account      9-18 consecutive digits       -> last 4 kept, rest `X`
 *
 * Values that merely *contain* digits are left alone: `1,80,000` (an amount)
 * and `HDFC0001234` (an IFSC, 7 digits) are not mangled.
 *
 * Masking is best-effort pattern matching, not authentication: it will not
 * detect a number split across lines, and it deliberately errs toward masking
 * (a bare 10-digit number is treated as an account-shaped value).
 */

/** ASCII and Devanagari (`०१२३४५६७८९`) digits. */
const D = "[0-9\\u0966-\\u096F]";

/** 12 digits in Aadhaar grouping, bounded so it never eats a longer run. */
const AADHAAR_RE = new RegExp(
  `(?<!${D})(${D}{4})[ -]?(${D}{4})[ -]?(${D}{4})(?!${D})`,
  "g",
);

/** Indian PAN: five letters, four digits, one letter. */
const PAN_RE = /\b([A-Z]{5}[0-9]{4}[A-Z])\b/g;

/** Account-shaped run: 9-18 digits, bounded. */
const ACCOUNT_RE = new RegExp(`(?<!${D})(${D}{9,18})(?!${D})`, "g");

/** A shorter digit run (>= 5) used only by the per-key rules. */
const SHORT_RUN_RE = new RegExp(`(?<!${D})(${D}{5,})(?!${D})`, "g");

/** A malformed PAN (missing the trailing letter) used only by the PAN key rule. */
const PAN_LOOSE_RE = /\b([A-Z]{5}[0-9]{4}[A-Z]?)\b/g;

const DEVANAGARI_DIGITS = /[\u0966-\u096F]/g;

/** Devanagari digits -> ASCII, so the masked form is always machine-readable. */
export function toAsciiDigits(value: string): string {
  return value.replace(
    DEVANAGARI_DIGITS,
    (digit) => String(digit.charCodeAt(0) - 0x0966),
  );
}

/** `X` * (length - 4) followed by the last 4 digits. */
function maskKeepLast4(run: string): string {
  return "X".repeat(run.length - 4) + toAsciiDigits(run).slice(-4);
}

/** Mask every Aadhaar-shaped number to `XXXX-XXXX-NNNN`. */
export function maskAadhaar(value: string): string {
  return value.replace(
    AADHAAR_RE,
    (_match, _g1: string, _g2: string, g3: string) => `XXXX-XXXX-${toAsciiDigits(g3)}`,
  );
}

/** Mask every PAN to its last 4 characters. */
export function maskPan(value: string): string {
  return value.replace(PAN_RE, (pan: string) => maskKeepLast4(pan));
}

/** Mask every account-shaped run (9-18 digits) to its last 4 digits. */
export function maskAccount(value: string): string {
  return value.replace(ACCOUNT_RE, (run: string) => maskKeepLast4(run));
}

/** Mask every remaining digit run of 5+ characters, keeping the last 4. */
function maskShortRuns(value: string): string {
  return value.replace(SHORT_RUN_RE, (run: string) => maskKeepLast4(run));
}

/**
 * Mask free text: Aadhaar first (it is the most specific shape), then PAN, then
 * account-shaped runs. Safe to call repeatedly — already-masked values have no
 * digit run left to match.
 */
export function maskText(text: string): string {
  if (!text) return "";
  return maskAccount(maskPan(maskAadhaar(text)));
}

/** Field names that carry identity data even when the value looks harmless. */
const AADHAAR_KEY_RE = /(aadhaar|aadhar|adhaar|uidai|uid_?no|uid_?number|uid$)/i;
const PAN_KEY_RE = /(^|_)pan($|_|no|_?number)/i;
const ACCOUNT_KEY_RE = /(account|acct|khata|passbook)/i;
/**
 * An IFSC is *validated*, never masked (R10): mangling it would break both the
 * format check and the merged-bank-prefix check, and an IFSC carries at most
 * six digits so it can never be account-shaped anyway.
 */
const IFSC_KEY_RE = /ifsc/i;

/** The per-key pass: relaxed thresholds, applied *after* the pattern pass. */
function maskerForKey(key: string): ((value: string) => string) | undefined {
  if (IFSC_KEY_RE.test(key)) return undefined;
  if (PAN_KEY_RE.test(key)) {
    return (value: string) =>
      maskShortRuns(value.replace(PAN_LOOSE_RE, (pan: string) => maskKeepLast4(pan)));
  }
  if (AADHAAR_KEY_RE.test(key) || ACCOUNT_KEY_RE.test(key)) {
    return maskShortRuns;
  }
  return undefined;
}

/**
 * Mask one field value. The pattern pass runs first (KTD6), so the key never
 * decides *whether* a value is masked — only how much more to mask.
 */
export function maskValue(key: string, value: string): string {
  const patternMasked = maskText(value);
  const keyMasker = maskerForKey(key);
  return keyMasker ? keyMasker(patternMasked) : patternMasked;
}

/** Mask a whole record of string fields, key by key. */
export function maskFields(
  fields: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = maskValue(key, value);
  }
  return out;
}
