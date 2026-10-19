/**
 * Source-text normalisation for the grounding number check.
 *
 * Handles: Devanagari digits (०-९), Rs./₹/INR markers, Indian comma
 * grouping, lakh/lakhs (including Marathi लाख), and Marathi month names.
 */

const DEVANAGARI_DIGITS: Record<string, string> = {
  "०": "0",
  "१": "1",
  "२": "2",
  "३": "3",
  "४": "4",
  "५": "5",
  "६": "6",
  "७": "7",
  "८": "8",
  "९": "9",
};

const MARATHI_MONTHS: Array<[string, string]> = [
  ["जानेवारी", "january"],
  ["फेब्रुवारी", "february"],
  ["मार्च", "march"],
  ["एप्रिल", "april"],
  ["मे", "may"],
  ["जून", "june"],
  ["जुलै", "july"],
  ["ऑगस्ट", "august"],
  ["आगस्ट", "august"],
  ["सप्टेंबर", "september"],
  ["ऑक्टोबर", "october"],
  ["नोव्हेंबर", "november"],
  ["डिसेंबर", "december"],
];

/** Devanagari block U+0900–U+097F; \b does not work for these characters. */
const DEVANAGARI_CLASS = "\\u0900-\\u097F";

/**
 * Replace a Marathi word only when it stands alone (start/end or a
 * non-Devanagari boundary), so `मे` (May) does not eat the `मे` inside
 * `मेळावा` / `मेहनत`.
 */
function replaceStandalone(value: string, needle: string, replacement: string): string {
  const re = new RegExp(
    `(^|[^${DEVANAGARI_CLASS}])${needle}(?![${DEVANAGARI_CLASS}])`,
    "g",
  );
  return value.replace(re, `$1${replacement}`);
}

export function devanagariToLatin(value: string): string {
  return value.replace(/[०-९]/g, (d) => DEVANAGARI_DIGITS[d] ?? d);
}

/**
 * Normalise free text so format variants compare equal:
 * `₹10,000`, `Rs.10,000`, `10,000`, `रु. १०,०००` all become `10000`.
 * Lakh forms (`2 lakh`, `2 लाख`, `2.5 lakhs`) expand to `200000` / `250000`.
 */
export function normaliseText(value: string): string {
  let out = devanagariToLatin(value).toLowerCase();
  for (const [needle, en] of MARATHI_MONTHS) out = replaceStandalone(out, needle, en);
  // Lakh expansion: capture optional decimal, expand before stripping commas.
  out = out.replace(
    /(\d+(?:\.\d+)?)\s*(?:lakhs?|lakh|लाख)/g,
    (_m, n: string) => String(Math.round(Number(n) * 100_000)),
  );
  // Drop currency markers and thousand separators.
  out = out
    .replace(/₹/g, " ")
    .replace(/\brs\.?|\binr\b|\brupees?\b|\bरु\.?/g, " ");
  out = out.replace(/,/g, "");
  // Collapse whitespace; keep it simple for substring matching.
  return out.replace(/\s+/g, " ").trim();
}

/** Canonical numeric token used by the grounding check. */
export function normaliseNumber(value: number | string): string {
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? String(Math.round(n)) : "";
}

/**
 * True when the (normalised) number token appears in the source text as a
 * whole number — `1500` must NOT match `15000`.
 */
export function numberAppearsInSource(
  value: number | string,
  sourceText: string,
): boolean {
  const token = normaliseNumber(value);
  if (token === "") return false;
  const haystack = normaliseText(sourceText);
  return new RegExp(`(^|[^0-9])${token}([^0-9]|$)`).test(haystack);
}

/**
 * True when a date-ish string (ISO date, year, or month name) is grounded
 * in the source text. Normalises Marathi months + Devanagari digits first.
 */
export function dateAppearsInSource(
  value: string,
  sourceText: string,
): boolean {
  const haystack = normaliseText(sourceText);
  const needle = normaliseText(value);
  if (needle.length === 0) return false;
  if (haystack.includes(needle)) return true;
  // Fall back to a year token only when the value is year-only
  // (e.g. "2026"); month-specific dates must match in full.
  if (/^(19|20)\d{2}$/.test(needle)) return haystack.includes(needle);
  return false;
}
