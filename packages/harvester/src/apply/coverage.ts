import type { SchemeCategory, SchemeProfile } from "../schema/profile.js";

/**
 * Frontend coverage contract (docs/SCHEME_DATA_SPEC.md §0).
 * Apply fills these computed (X) fields before writing, then asserts the
 * required columns are non-null. Exported for the apply stream (task_0005).
 */

export const PILLAR_BY_CATEGORY: Record<SchemeCategory, string> = {
  education: "EDUCATION",
  healthcare: "HEALTHCARE",
  livelihood: "AGRICULTURE_LIVELIHOOD",
};

export const CATEGORY_LABEL_BY_CATEGORY: Record<SchemeCategory, string> = {
  education: "Education",
  healthcare: "Healthcare",
  livelihood: "Livelihood & Self-Employment",
};

export type DeskType = "EDU_DBT" | "HEALTH" | "VENDOR";

/** Ward 14 counter ids seeded manually (counter details themselves are M). */
export const WARD_14_COUNTER_BY_DESK: Record<DeskType, string> = {
  EDU_DBT: "ward-14-counter-3",
  HEALTH: "ward-14-counter-1",
  VENDOR: "ward-14-counter-5",
};

/** Department -> desk type (spec §0); returns whether the fallback fired. */
export function deskTypeForDepartment(department: string): {
  deskType: DeskType;
  fallback: boolean;
} {
  const d = department.toLowerCase();
  if (
    d.includes("समाज विकास") ||
    d.includes("social development") ||
    d.includes("शिक्षण") ||
    d.includes("education")
  ) {
    return { deskType: "EDU_DBT", fallback: false };
  }
  if (d.includes("आरोग्य") || d.includes("health")) {
    return { deskType: "HEALTH", fallback: false };
  }
  if (
    d.includes("livelihood") ||
    d.includes("नागरवस्ती") ||
    d.includes("अतिक्रमण") ||
    d.includes("hawker") ||
    d.includes("vendor") ||
    d.includes("encroachment")
  ) {
    return { deskType: "VENDOR", fallback: false };
  }
  return { deskType: "EDU_DBT", fallback: true };
}

export function makeSlug(name: string): string {
  const kebab = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return kebab.startsWith("pmc-") ? kebab : `pmc-${kebab}`;
}

export function makeSchemeCode(slug: string): string {
  return slug.toUpperCase().replace(/-/g, "_");
}

/** `required_documents` JSON array (EN labels in source order). */
export function buildRequiredDocuments(profile: SchemeProfile): string[] {
  return profile.documents
    .filter((d) => d.is_required)
    .map((d) => d.label_en);
}

/** Default staple order: "1. Application form" + required docs in order. */
export function buildStapleOrder(requiredDocuments: string[]): string[] {
  return ["1. Application form", ...requiredDocuments];
}

/** `schemes.slug` is VARCHAR(64); longer slugs must be truncated to fit. */
export const MAX_SLUG_LENGTH = 64;

/**
 * Length guard for a caller-supplied slug (from the watchlist/triage).
 * Truncates to `MAX_SLUG_LENGTH`, trims a dangling separator, and reports
 * whether truncation happened so the caller can log a coverage gap.
 */
export function guardSlug(slug: string): { slug: string; truncated: boolean } {
  // Defensive: callers through untyped JS may pass undefined.
  const trimmed = (typeof slug === "string" ? slug : "").trim();
  if (trimmed.length <= MAX_SLUG_LENGTH) return { slug: trimmed, truncated: false };
  const cut = trimmed.slice(0, MAX_SLUG_LENGTH).replace(/[-_.]+$/g, "");
  return { slug: cut, truncated: true };
}

export interface ComputedCoverage {
  slug: string;
  /** True when the caller's slug was longer than 64 chars and got truncated. */
  slug_truncated: boolean;
  scheme_code: string;
  pillar: string;
  category_label: string;
  desk_type: DeskType;
  ward_office_id: string;
  staple_order: string[];
  required_documents: string[];
  /** True when the department -> desk fallback fired (flagged in coverage). */
  desk_fallback: boolean;
}

/**
 * Compute the X columns for a scheme. `slug` is supplied by the caller
 * (watchlist/triage) — it is no longer derived from the English name.
 */
export function computeCoverage(profile: SchemeProfile, slug: string): ComputedCoverage {
  const guarded = guardSlug(slug);
  const { deskType, fallback } = deskTypeForDepartment(profile.department);
  const required_documents = buildRequiredDocuments(profile);
  return {
    slug: guarded.slug,
    slug_truncated: guarded.truncated,
    scheme_code: makeSchemeCode(guarded.slug),
    pillar: PILLAR_BY_CATEGORY[profile.category],
    category_label: CATEGORY_LABEL_BY_CATEGORY[profile.category],
    desk_type: deskType,
    ward_office_id: WARD_14_COUNTER_BY_DESK[deskType],
    staple_order: buildStapleOrder(required_documents),
    required_documents,
    desk_fallback: fallback,
  };
}

export interface CoverageAssertion {
  ok: boolean;
  gaps: string[];
}

/**
 * Required-column assertion per SCHEME_DATA_SPEC §0: name,
 * vernacular_name.mr, department, description, eligibility_text, category,
 * non-empty required_documents, ward_office_id.
 */
export function assertCoverage(
  profile: SchemeProfile,
  computed: ComputedCoverage,
): CoverageAssertion {
  const gaps: string[] = [];
  if (profile.name.trim().length === 0) gaps.push("name");
  if (profile.vernacular_name.trim().length === 0) gaps.push("vernacular_name.mr");
  if (profile.department.trim().length === 0) gaps.push("department");
  if (profile.description.trim().length === 0) gaps.push("description");
  if (profile.eligibility_text.trim().length === 0) gaps.push("eligibility_text");
  if (computed.required_documents.length === 0) gaps.push("required_documents");
  if (computed.ward_office_id.trim().length === 0) gaps.push("ward_office_id");
  if (computed.desk_fallback) gaps.push("desk_type:fallback");
  if (computed.slug_truncated) gaps.push("slug:truncated");
  return { ok: gaps.length === 0, gaps };
}
