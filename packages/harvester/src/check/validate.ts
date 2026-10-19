import { SchemeProfile, type SchemeProfile as SchemeProfileT } from "../schema/profile.js";
import { dateAppearsInSource, numberAppearsInSource } from "../schema/normalise.js";

export type Grounding = "text" | "vision";

export interface ValidateOptions {
  /**
   * Official source text the agent read. `null` when the source is
   * scan-only (no text layer) — the sprint exception below applies.
   */
  sourceText: string | null;
  /** True when the source is a scanned PDF with no text layer. */
  scanOnly?: boolean;
}

export interface ValidateResult {
  ok: boolean;
  /** Parsed profile when Zod passed; undefined otherwise (never reaches apply). */
  profile?: SchemeProfileT;
  /** Human-readable failure / review reasons. */
  issues: string[];
  /** How numeric/date facts were grounded. */
  grounding: Grounding;
  /** True when the scheme must be written as `needs_review` (or not applied). */
  needsReview: boolean;
}

function isKnownNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isKnownText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().toLowerCase() !== "unknown"
  );
}

/**
 * Grounding gate (plan §7): Zod must pass, and every numeric/date value in
 * the profile must appear (after normalisation) in the cited source text.
 *
 * Sprint exception: a scan-only source has no text layer, so the agent's
 * vision read is accepted — `grounding: "vision"` is recorded and review
 * is NOT forced solely for missing text.
 */
export function validateProfile(
  input: unknown,
  opts: ValidateOptions,
): ValidateResult {
  const parsed = SchemeProfile.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map(
        (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
      ),
      grounding: "text",
      needsReview: true,
    };
  }
  const profile = parsed.data;

  // Scan-only exception: no text layer to check against. The vision read is
  // accepted (grounding: "vision"), but the row must be written as
  // `needs_review` — grounding could not be verified against text.
  if (opts.sourceText === null) {
    return { ok: true, profile, issues: ["grounding:vision"], grounding: "vision", needsReview: true };
  }
  const sourceText = opts.sourceText;
  if (opts.scanOnly === true && sourceText.trim().length === 0) {
    return { ok: true, profile, issues: ["grounding:vision"], grounding: "vision", needsReview: true };
  }

  const issues: string[] = [];
  const numericFacts: Array<[string, number]> = [];
  if (isKnownNumber(profile.benefit_amount)) numericFacts.push(["benefit_amount", profile.benefit_amount]);
  if (isKnownNumber(profile.grant_amount)) numericFacts.push(["grant_amount", profile.grant_amount]);
  if (isKnownNumber(profile.income_limit)) numericFacts.push(["income_limit", profile.income_limit]);
  if (isKnownNumber(profile.domicile_years)) numericFacts.push(["domicile_years", profile.domicile_years]);

  for (const [field, value] of numericFacts) {
    if (!numberAppearsInSource(value, sourceText)) {
      issues.push(`${field}=${value} not found in cited source text`);
    }
  }

  const dateFacts: Array<[string, string]> = [];
  if (isKnownText(profile.deadline)) dateFacts.push(["deadline", profile.deadline as string]);
  if (isKnownText(profile.window_opens_at)) dateFacts.push(["window_opens_at", profile.window_opens_at as string]);
  if (isKnownText(profile.application_deadline)) {
    dateFacts.push(["application_deadline", profile.application_deadline as string]);
  }
  for (const [field, value] of dateFacts) {
    if (!dateAppearsInSource(value, sourceText)) {
      issues.push(`${field}="${value}" not found in cited source text`);
    }
  }

  if (issues.length > 0) {
    // Zod passed, but a number/date could not be grounded. Keep the profile so
    // the row is still written — marked needs_review (review §7 + sprint posture:
    // prefer a flagged row over losing the scheme entirely).
    return { ok: true, profile, issues, grounding: "text", needsReview: true };
  }
  return { ok: true, profile, issues: [], grounding: "text", needsReview: false };
}
