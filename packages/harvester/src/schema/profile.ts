import { z } from "zod";

/**
 * Harvested scheme profile — Zod-first contract mirroring
 * docs/SCHEME_DATA_SPEC.md §1 (harvester-filled columns + documents).
 *
 * Rules:
 * - `eligibility_text`: all conditions, one per line, as written in the
 *   official source. The literal string "unknown" is accepted as the
 *   unknown-marker (single line).
 * - "unknown allowed, no defaults": no `.default()` anywhere in this file.
 *   Optional facts are `null` / `undefined` (never guessed); the agent may
 *   also write the literal "unknown" for text fields.
 * - The apply stream (sibling task_0005) imports these types and fills the
 *   computed X columns via `src/apply/coverage.ts`.
 */

export const SCHEME_CATEGORIES = [
  "education",
  "healthcare",
  "livelihood",
] as const;

export const SchemeCategory = z.enum(SCHEME_CATEGORIES);
export type SchemeCategory = z.infer<typeof SchemeCategory>;

/** One condition per line; blank lines (except a single trailing newline) rejected. */
function isOneConditionPerLine(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  if (trimmed === "unknown") return true;
  const lines = value.split("\n");
  // Drop one trailing empty line (common when text ends with \n).
  const body =
    lines.length > 0 && (lines[lines.length - 1] as string).trim() === ""
      ? lines.slice(0, -1)
      : lines;
  if (body.length === 0) return false;
  return body.every((line) => line.trim().length > 0);
}

export const EligibilityText = z
  .string()
  .trim()
  .min(1, "eligibility_text must not be empty")
  .refine(isOneConditionPerLine, {
    message:
      "eligibility_text must hold one condition per line (no blank lines)",
  });
export type EligibilityText = z.infer<typeof EligibilityText>;

/** Numeric fact: a real value, or the unknown-marker (null/undefined/"unknown"). */
export const UnknownNumber = z.union([
  z.number().finite().nonnegative(),
  z.null(),
  z.literal("unknown"),
]);
export type UnknownNumber = z.infer<typeof UnknownNumber>;

/** Optional text fact: a real value, or unknown (null/undefined/"unknown"). */
export const UnknownText = z.union([
  z.string().trim().min(1),
  z.null(),
  z.literal("unknown"),
]);
export type UnknownText = z.infer<typeof UnknownText>;

const DocKey = z
  .string()
  .trim()
  .min(1)
  .regex(
    /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/,
    "doc_key must be a lowercase slug (letters, digits, ._-)",
  );

export const SchemeDocumentInput = z.object({
  doc_key: DocKey,
  label_en: z.string().trim().min(1),
  label_mr: z.string().trim().min(1).nullish(),
  validator: z.string().trim().min(1).nullish(),
  is_required: z.boolean(),
});
export type SchemeDocumentInput = z.infer<typeof SchemeDocumentInput>;

export const SchemeProfile = z.object({
  /** Agent-filled harvested fields (H). Computed X columns live in coverage.ts. */
  name: z.string().trim().min(1),
  vernacular_name: z.string().trim().min(1),
  department: z.string().trim().min(1),
  category: SchemeCategory,
  description: z.string().trim().min(1),
  eligibility_text: EligibilityText,

  // Marathi / i18n mirrors (preserved verbatim from the source).
  name_i18n: z.record(z.string(), z.string()).nullish(),
  description_i18n: z.record(z.string(), z.string()).nullish(),
  eligibility_text_mr: z.string().trim().min(1).nullish(),

  // Benefit facts — unknown allowed, never guessed.
  benefit_amount: UnknownNumber.optional(),
  grant_amount: UnknownNumber.optional(),
  benefit_type: UnknownText.optional(),
  cutoff: UnknownText.optional(),
  income_limit: UnknownNumber.optional(),
  income_limit_formatted: UnknownText.optional(),
  domicile_years: UnknownNumber.optional(),

  // Window / deadline facts — unknown allowed (null = round-the-year / unstated).
  deadline: UnknownText.optional(),
  window_opens_at: UnknownText.optional(),
  application_deadline: UnknownText.optional(),

  // How-to-apply facts.
  application_mode: UnknownText.optional(),
  apply_url: UnknownText.optional(),
  how_to_apply: UnknownText.optional(),
  official_form_name: UnknownText.optional(),
  official_form_url: UnknownText.optional(),

  // Provenance back to the official source the agent read.
  resolution_no: UnknownText.optional(),
  source_url: z.string().trim().min(1).url(),

  // Document checklist harvested from the source.
  documents: z.array(SchemeDocumentInput).min(1),
});
export type SchemeProfile = z.infer<typeof SchemeProfile>;
