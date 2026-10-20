// Normalization + deterministic comparators for the application-form audit.
//
// The plan is explicit: "The language model must not invent missing values or
// decide that two values match without deterministic comparison." Everything in
// this file is pure and side-effect free, so the audit outcome is reproducible.

import type { ComparisonRule } from "./types";

/** Fold case, strip accents, drop punctuation, collapse whitespace. */
export function normalizeText(raw: string): string {
  return (raw ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Order-insensitive text key. Indian documents routinely reorder names
 * ("Patil Ramesh" vs "Ramesh Patil"), so equal word multisets count as equal —
 * but the words themselves must all be present.
 */
export function textKey(raw: string): string {
  return normalizeText(raw).split(" ").filter(Boolean).sort().join(" ");
}

/** Identifier key: letters+digits only, uppercased (PAN, IFSC, Aadhaar, account no). */
export function identifierKey(raw: string): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Parse the date formats that actually appear on Indian municipal paperwork.
 * Returns an ISO `YYYY-MM-DD` string, or null when unambiguous parsing fails —
 * a null must become MANUAL_CHECK, never a silent match.
 */
export function dateKey(raw: string): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;

  // YYYY-MM-DD / YYYY/MM/DD
  const iso = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) return assemble(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // DD-MM-YYYY / DD/MM/YYYY / DD.MM.YYYY
  const dmy = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmy) return assemble(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));

  // "12 Jan 1998" / "12 January 1998" / "Jan 12, 1998"
  const months = [
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec"
  ];
  const dMonY = value.match(/^(\d{1,2})[\s-]*([A-Za-z]{3,})[\s,-]*(\d{4})$/);
  if (dMonY) {
    const m = months.indexOf(dMonY[2].slice(0, 3).toLowerCase());
    if (m >= 0) return assemble(Number(dMonY[3]), m + 1, Number(dMonY[1]));
  }
  const monDY = value.match(/^([A-Za-z]{3,})[\s-]*(\d{1,2})[\s,-]*(\d{4})$/);
  if (monDY) {
    const m = months.indexOf(monDY[1].slice(0, 3).toLowerCase());
    if (m >= 0) return assemble(Number(monDY[3]), m + 1, Number(monDY[2]));
  }

  return null;
}

function assemble(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

export interface ComparisonOutcome {
  /** true = equal, false = different, null = cannot compare deterministically. */
  equal: boolean | null;
  /** Human-readable explanation, safe to show (no raw identifiers). */
  detail: string;
}

/**
 * Compare two values under a rule. Returns `equal: null` when the rule cannot
 * produce a trustworthy answer — the caller must turn that into MANUAL_CHECK.
 */
export function compareValues(
  rule: ComparisonRule,
  formValue: string | null | undefined,
  evidenceValue: string | null | undefined
): ComparisonOutcome {
  const form = (formValue ?? "").trim();
  const evidence = (evidenceValue ?? "").trim();

  if (!form) return { equal: null, detail: "The application form has no readable value for this field." };
  if (!evidence) return { equal: null, detail: "No value for this field was found in the supporting documents." };

  switch (rule) {
    case "EXACT": {
      const a = form.replace(/\s+/g, " ");
      const b = evidence.replace(/\s+/g, " ");
      return { equal: a === b, detail: "Compared exactly." };
    }

    case "NORMALIZED_TEXT": {
      const a = textKey(form);
      const b = textKey(evidence);
      if (!a || !b) return { equal: null, detail: "One of the values contains no comparable characters." };
      return {
        equal: a === b,
        detail:
          a === b
            ? "Matches after ignoring case, punctuation and word order."
            : "Differs after ignoring case, punctuation and word order."
      };
    }

    case "IDENTIFIER": {
      const a = identifierKey(form);
      const b = identifierKey(evidence);
      if (!a || !b) return { equal: null, detail: "One of the identifiers is unreadable." };
      return {
        equal: a === b,
        detail:
          a === b
            ? "Identifiers match after removing spaces and punctuation."
            : "Identifiers differ."
      };
    }

    case "DATE": {
      const a = dateKey(form);
      const b = dateKey(evidence);
      if (!a || !b) {
        return { equal: null, detail: "A date could not be read unambiguously on one of the documents." };
      }
      return {
        equal: a === b,
        detail: a === b ? "The dates are the same day." : "The dates are different days."
      };
    }

    default:
      return { equal: null, detail: "No comparison rule is configured for this field." };
  }
}

/** Mask an identifier for display: keep the last 4 characters. */
export function maskValue(raw: string): string {
  const value = (raw ?? "").trim();
  if (value.length <= 4) return value.replace(/./g, "X");
  return `${"X".repeat(Math.max(0, value.length - 4)).replace(/(.{4})/g, "$1 ").trim()} ${value.slice(-4)}`.trim();
}
