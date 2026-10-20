/**
 * Verification (R9, R10, U7 step 1-2): turn the agent's raw extraction into the
 * response the HTTP contract promises, with each field marked by *how* it was
 * confirmed and each provable problem flagged.
 *
 * Grounding decides review (R9):
 *
 * | Field status                     | Result                                    |
 * | :------------------------------- | :---------------------------------------- |
 * | Value found in the PDF text layer | `grounding: text`                        |
 * | Value found in OCR text           | `grounding: ocr` (does not force review) |
 * | Seen only by the model            | `grounding: vision` -> `needs_review`    |
 * | Marked handwritten                | `needs_review`, whatever the grounding    |
 *
 * Masking is deliberately NOT applied here — it is the last step before the
 * response leaves (`verify/mask.ts`), so this module can be tested on real
 * values and the masker remains the single choke point.
 */
import { toAsciiDigits } from "@nagriksetu/documents";
import type { AuditPage } from "../pages.js";
import {
  BUNDLED_BANK_MERGERS,
  checkAadhaar,
  daysPast,
  findMergedBank,
  isAadhaarShaped,
  isIfscLike,
  isMalformedIfsc,
  isMalformedPan,
  isPastDate,
  isValidityKey,
  type BankMerger,
} from "./validators.js";

/** How a value was confirmed (R9). */
export type Grounding = "text" | "ocr" | "vision";

/** The kinds of value a document can carry. Free-form keys, fixed types. */
export const FIELD_TYPES = [
  "text",
  "number",
  "amount",
  "date",
  "boolean",
  "id_number",
  "account_number",
  "ifsc",
  "pan",
  "address",
  "other",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/** Flag kinds this module raises itself; agents may raise their own. */
export const FLAG_KINDS = {
  aadhaarChecksum: "aadhaar_checksum",
  panFormat: "pan_format",
  ifscFormat: "ifsc_format",
  ifscMergedBank: "ifsc_merged_bank",
  validityExpired: "validity_expired",
  missingSignature: "missing_signature",
  missingSeal: "missing_seal",
  agentFlagged: "agent_flagged",
  ocrDegraded: "ocr_degraded",
} as const;

export interface AuditField {
  key: string;
  /** The label as printed on the document. */
  label: string;
  /** The value as printed on the document. */
  value: string;
  /** The value normalised for comparison (dates, amounts, numbers). */
  normalized: string;
  type: FieldType;
  /** 1-based page the value was seen on. */
  page: number;
  handwritten: boolean;
  grounding: Grounding;
}

export interface AuditFlag {
  /** One of `FLAG_KINDS`, or whatever an agent raised. */
  kind: string;
  detail: string;
  field_key?: string;
}

/** The response shape in the plan's HTTP Contract, plus `notices`. */
export interface AuditResponse {
  document_type_guess: string;
  language: string;
  issuer: string;
  has_signature: boolean | null;
  has_seal: boolean | null;
  pages_read: number;
  pages_total: number;
  needs_review: boolean;
  model: string;
  fields: AuditField[];
  flags: AuditFlag[];
  /** OCR degradation and similar operational notes (loud, never silent). */
  notices: string[];
}

/* -------------------------------------------------------------------------- */
/* Flags                                                                      */
/* -------------------------------------------------------------------------- */

/** Account/IFSC keys, where a 12-digit value is an account, not an Aadhaar. */
export const ACCOUNT_KEY_RE = /(account|acct|passbook|khata|ifsc)/i;

/** One field's flags, from the code-side validators only (R10). */
export function fieldFlags(
  field: AuditField,
  options: { now: Date; bankMergers: readonly BankMerger[] },
): AuditFlag[] {
  const flags: AuditFlag[] = [];
  const candidates = [field.value, field.normalized].filter(
    (candidate) => candidate.trim().length > 0,
  );

  // Aadhaar: 12 digits, first digit 2-9, Verhoeff. Skipped for keys that name an
  // account or an IFSC, where a 12-digit run is an account number, not an ID.
  if (!ACCOUNT_KEY_RE.test(field.key)) {
    const aadhaarValue = candidates.find((candidate) => isAadhaarShaped(candidate));
    if (aadhaarValue !== undefined) {
      const check = checkAadhaar(aadhaarValue);
      if (check.shaped && !check.valid) {
        flags.push({
          kind: FLAG_KINDS.aadhaarChecksum,
          detail: `Aadhaar-style number on page ${field.page} is invalid: ${check.reason}`,
          field_key: field.key,
        });
      }
    }
  }

  // PAN: only when the value is PAN-shaped at all.
  if (candidates.some((candidate) => isMalformedPan(candidate))) {
    flags.push({
      kind: FLAG_KINDS.panFormat,
      detail: `PAN on page ${field.page} is not in the AAAAA9999A format`,
      field_key: field.key,
    });
  }

  // IFSC: format, then the merged-bank prefix (prefix-level mapping only).
  const ifsc = candidates.find((candidate) => isIfscLike(candidate));
  if (ifsc !== undefined) {
    if (isMalformedIfsc(ifsc)) {
      flags.push({
        kind: FLAG_KINDS.ifscFormat,
        detail: `IFSC ${ifsc.toUpperCase()} is not in the AAAA0XXXXXX format`,
        field_key: field.key,
      });
    } else {
      const merged = findMergedBank(ifsc, options.bankMergers);
      if (merged) {
        flags.push({
          kind: FLAG_KINDS.ifscMergedBank,
          detail: [
            `IFSC ${ifsc.toUpperCase()} belongs to ${merged.old_bank_name}`,
            `(prefix ${merged.old_bank_code}), which merged into ${merged.new_bank_name}`,
            `(${merged.new_bank_code}) on ${merged.merged_on}.`,
            "Branch-level codes may also have changed; confirm at the branch.",
          ].join(" "),
          field_key: field.key,
        });
      }
    }
  }

  // Validity date in the past.
  if (isValidityKey(field.key)) {
    const value = candidates.find(
      (candidate) => isPastDate(candidate, options.now) === true,
    );
    if (value !== undefined) {
      const days = daysPast(value, options.now) ?? 0;
      flags.push({
        kind: FLAG_KINDS.validityExpired,
        detail: `Validity date ${value} passed ${days} day(s) ago`,
        field_key: field.key,
      });
    }
  }

  return flags;
}

/* -------------------------------------------------------------------------- */
/* Whole-token grounding                                                      */
/* -------------------------------------------------------------------------- */

/** Devanagari digits and case folded away, whitespace collapsed. */
function foldForMatch(value: string): string {
  return toAsciiDigits(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function matchTokens(value: string): string[] {
  return foldForMatch(value)
    .split(/[^a-z0-9\u0900-\u097f]+/)
    .filter((token) => token.length > 0);
}

/**
 * Numeric runs of a source text: digit groups joined by `, . - /` (so
 * `1,80,000` reads as `180000`) plus the Aadhaar 4-4-4 space grouping (so
 * `0123 4567 8901` reads as `012345678901`). Whitespace alone never joins two
 * numbers, which is what keeps `1500` from matching a source holding `15000`.
 */
export function numericRuns(source: string): string[] {
  const text = toAsciiDigits(source);
  const runs: string[] = [];
  for (const match of text.matchAll(/[0-9]+(?:[,.\-/][0-9]+)*/g)) {
    runs.push(match[0].replace(/[^0-9]/g, ""));
  }
  for (const match of text.matchAll(/\b[0-9]{4}(?: [0-9]{4}){2}\b/g)) {
    runs.push(match[0].replace(/[^0-9]/g, ""));
  }
  return runs;
}

/**
 * Does `value` appear in `source`? Whole-token matching:
 * - every token of the value appears as a whole token of the source (names,
 *   addresses, "11/06/2027" → `11`, `06`, `2027`), or
 * - the value's digits equal one of the source's numeric runs exactly, so
 *   `1500` does NOT match a source containing only `15000`.
 */
export function matchesSource(value: string, source: string): boolean {
  if (!value.trim() || !source.trim()) return false;
  const valueTokens = matchTokens(value);
  if (valueTokens.length === 0) return false;
  const sourceTokens = matchTokens(source);
  const sourceTokenSet = new Set(sourceTokens);
  const everyToken = valueTokens.every((token) => sourceTokenSet.has(token));

  const digits = foldForMatch(value).replace(/[^0-9]/g, "");
  const isNumeric = digits.length >= 3 && /^[0-9 -/.,]+$/.test(foldForMatch(value));
  const numericHit = isNumeric && numericRuns(source).includes(digits);

  return everyToken || numericHit;
}

/** Best grounding for a value across the text layer, then OCR (R9). */
export function groundValue(
  candidates: readonly string[],
  sources: { textLayer: string; ocr: string },
): Grounding {
  for (const candidate of candidates) {
    if (matchesSource(candidate, sources.textLayer)) return "text";
  }
  for (const candidate of candidates) {
    if (matchesSource(candidate, sources.ocr)) return "ocr";
  }
  return "vision";
}

/* -------------------------------------------------------------------------- */
/* Verification entry point                                                   */
/* -------------------------------------------------------------------------- */

/** One field exactly as the agent recorded it, before grounding. */
export interface RawField {
  key: string;
  label: string;
  value: string;
  normalized: string;
  type: FieldType;
  page: number;
  handwritten: boolean;
}

/** Document-level facts the agent reported (R8). */
export interface DocumentFacts {
  document_type_guess: string;
  language: string;
  issuer: string;
  has_signature: boolean | null;
  has_seal: boolean | null;
}

export interface VerifyInput {
  fields: readonly RawField[];
  /** Flags the agent raised itself (kept, alongside the code-side ones). */
  agentFlags?: readonly AuditFlag[] | undefined;
  facts: DocumentFacts;
  /** Pages read, in order; supplies the text layers. */
  pages: readonly AuditPage[];
  /** OCR text per page number (from `ocrPages`). */
  ocrText: ReadonlyMap<number, string>;
  pagesRead: number;
  pagesTotal: number;
  model: string;
  /** True when no page image was attached at all (text-only mode). */
  textOnly?: boolean | undefined;
  /** Pages withheld from the model as images, because of an ID number (R12). */
  withheldPages: readonly number[];
  notices?: readonly string[] | undefined;
  now?: Date | undefined;
  bankMergers?: readonly BankMerger[] | undefined;
}

/**
 * Build the response: ground every field, run every validator, decide review.
 * Returned values are still unmasked; `maskAuditResponse` is applied next.
 */
export function verifyExtraction(input: VerifyInput): AuditResponse {
  const now = input.now ?? new Date();
  const bankMergers = input.bankMergers ?? BUNDLED_BANK_MERGERS;
  const ocrTextFor = (page: number): string => input.ocrText.get(page) ?? "";
  const textLayerFor = (page: number): string =>
    input.pages.find((candidate) => candidate.page === page)?.text ?? "";

  const fields: AuditField[] = input.fields.map((field) => ({
    ...field,
    grounding: groundValue([field.value, field.normalized], {
      textLayer: textLayerFor(field.page),
      ocr: ocrTextFor(field.page),
    }),
  }));

  const flags: AuditFlag[] = [
    ...(input.agentFlags ?? []),
    ...fields.flatMap((field) => fieldFlags(field, { now, bankMergers })),
  ];

  if (fields.length === 0) {
    flags.push({
      kind: FLAG_KINDS.agentFlagged,
      detail: "No fields were recorded for this document",
    });
  }

  const visionOnly = fields.some((field) => field.grounding === "vision");
  const handwritten = fields.some((field) => field.handwritten);
  // A problem the model itself reported (a torn page, a crossed-out entry, a
  // blank signature space) is exactly what a human should look at, so an
  // agent-raised flag forces review. Code-side defect flags below (an expired
  // date, a merged-bank IFSC) describe a document that was read confidently and
  // are therefore not, by themselves, grounds for review (R9).
  const agentFlagged = (input.agentFlags ?? []).length > 0;
  if (input.facts.has_signature === false) {
    flags.push({
      kind: FLAG_KINDS.missingSignature,
      detail: "No signature is visible on this document",
    });
  }
  if (input.facts.has_seal === false) {
    flags.push({
      kind: FLAG_KINDS.missingSeal,
      detail: "No seal or stamp is visible on this document",
    });
  }

  const notices = [...(input.notices ?? [])];
  // R12: pages whose text carries an ID/account number were sent as text only,
  // so the document cannot be called confirmed.
  if (input.withheldPages.length > 0) {
    notices.push(
      `Page image(s) ${input.withheldPages.join(", ")} were withheld from the model because the page text carries an ID- or account-shaped number (R12); those pages were read from text only.`,
    );
  }
  if (input.textOnly) {
    notices.push(
      "Text-only mode: no page images were attached to the model request.",
    );
  }

  const needs_review =
    visionOnly ||
    handwritten ||
    agentFlagged ||
    input.withheldPages.length > 0 ||
    flags.some((flag) => flag.kind === FLAG_KINDS.agentFlagged);

  return {
    document_type_guess: input.facts.document_type_guess,
    language: input.facts.language,
    issuer: input.facts.issuer,
    has_signature: input.facts.has_signature,
    has_seal: input.facts.has_seal,
    pages_read: input.pagesRead,
    pages_total: input.pagesTotal,
    needs_review,
    model: input.model,
    fields,
    flags,
    notices,
  };
}

/** Fields resting on the model alone (exposed for the eval and the README). */
export function visionOnlyFields(response: AuditResponse): AuditField[] {
  return response.fields.filter((field) => field.grounding === "vision");
}

/** Flag kinds present in a response, for scoring and reporting. */
export function flagKinds(response: AuditResponse): Set<string> {
  return new Set(response.flags.map((flag) => flag.kind));
}
