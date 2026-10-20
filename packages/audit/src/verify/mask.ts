/**
 * Masking (R11, U7 step 3) — a thin wrapper over `@nagriksetu/documents`' masker.
 *
 * The shared masker already works pattern-first, so a value is masked by its
 * *shape* whatever key it was recorded under (KTD6). This module adds the three
 * things the audit needs on top:
 *
 * 1. `maskAuditResponse` — masks **every string** in the response: field values,
 *    labels, the document type, the issuer, flag details and notices. Masking
 *    runs last, so nothing can be added afterwards without being masked.
 * 2. `findUnmaskedPii` — the zero-PII assertion. It walks a payload and returns
 *    the JSON path of every string still holding an unmasked Aadhaar, account
 *    or PAN shape. Tests, the eval and the server's final guard all use it.
 * 3. `containsSensitiveNumber` — the R12 test for a page's text layer or OCR
 *    text: does this page carry an ID- or account-shaped number?
 */
import { maskText, maskValue, toAsciiDigits } from "@nagriksetu/documents";
import type { AuditFlag, AuditField, AuditResponse } from "./verify.js";

/**
 * Unmasked shapes, checked on the *raw* text rather than by re-masking, so a
 * properly masked value can never be reported as a leak. Each pattern matches
 * only the unmasked form:
 * - Aadhaar: 12 digits, optionally grouped 4-4-4 (`XXXX-XXXX-1234` has 4).
 * - Account: any run of 9-18 digits (a masked account keeps at most 4).
 * - PAN: `AAAAA9999A` (masked PANs keep only four trailing characters).
 */
export const UNMASKED_PATTERNS: ReadonlyArray<{ kind: string; re: RegExp }> = [
  {
    kind: "aadhaar",
    re: /(?<![0-9])([0-9]{4})[ -]?([0-9]{4})[ -]?([0-9]{4})(?![0-9])/g,
  },
  { kind: "account", re: /(?<![0-9])[0-9]{9,18}(?![0-9])/g },
  { kind: "pan", re: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g },
];

/** A masked value keeps at most four trailing digits. */
export function isMasked(value: string): boolean {
  const ascii = toAsciiDigits(value);
  if (UNMASKED_PATTERNS.some((pattern) => new RegExp(pattern.re.source).test(ascii))) {
    return false;
  }
  return true;
}

/** One place a value was still readable. */
export interface UnmaskedFinding {
  path: string;
  kind: string;
  /** The offending value, itself masked, so a report never leaks it either. */
  sample: string;
}

/** Paths of every string in `value` that still holds an unmasked shape. */
export function findUnmaskedPii(value: unknown, path = "$"): UnmaskedFinding[] {
  const findings: UnmaskedFinding[] = [];
  walk(value, path, findings);
  return findings;
}

function walk(value: unknown, path: string, findings: UnmaskedFinding[]): void {
  if (typeof value === "string") {
    const ascii = toAsciiDigits(value);
    for (const pattern of UNMASKED_PATTERNS) {
      const match = new RegExp(pattern.re.source).exec(ascii);
      if (match) {
        findings.push({
          path,
          kind: pattern.kind,
          sample: maskText(match[0]),
        });
        return;
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walk(entry, `${path}[${index}]`, findings));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      walk(entry, `${path}.${key}`, findings);
    }
  }
}

/** Mask one field, key-aware (the shared masker decides the amount). */
export function maskField(field: AuditField): AuditField {
  return {
    ...field,
    label: maskText(field.label),
    value: maskValue(field.key, field.value),
    normalized: maskValue(field.key, field.normalized),
  };
}

/** Mask one flag: the detail may quote a value, so it is masked too. */
export function maskFlag(flag: AuditFlag): AuditFlag {
  return { ...flag, detail: maskText(flag.detail) };
}

/**
 * Mask a whole response. Called once, immediately before the response leaves
 * the pipeline, so the value returned here is the only one ever serialized,
 * stored or logged.
 */
export function maskAuditResponse(response: AuditResponse): AuditResponse {
  return {
    ...response,
    document_type_guess: maskText(response.document_type_guess),
    language: maskText(response.language),
    issuer: maskText(response.issuer),
    model: response.model,
    fields: response.fields.map(maskField),
    flags: response.flags.map(maskFlag),
    notices: response.notices.map(maskText),
  };
}

/**
 * R12: does this text carry an ID- or account-shaped number? Evaluated against
 * a page's text layer **and** its OCR text, so a scanned Aadhaar — which has no
 * text layer at all — is still withheld rather than sent as an image.
 *
 * Deliberately the same shapes as the masker: what would be masked is what must
 * not be photographed into a model request.
 */
export function containsSensitiveNumber(text: string): boolean {
  if (!text.trim()) return false;
  const ascii = toAsciiDigits(text);
  for (const pattern of UNMASKED_PATTERNS) {
    if (new RegExp(pattern.re.source).test(ascii)) return true;
  }
  return false;
}
