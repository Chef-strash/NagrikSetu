// Copied from backend/src/features/feedback/review-input.ts so the web API validates the same way.
// Validation + sanitisation for citizen-submitted reviews.
//
// Pure and dependency-free so it is unit-tested directly. A submitted review is
// rejected if it contains PII (Aadhaar-style or long digit runs), links, or is too
// short/long. The DPDP Act 2023 rules apply: never store PII in a public review.

export interface ReviewSubmission {
  text?: unknown;
  author?: unknown;
  role?: unknown;
  counter?: unknown;
  ward?: unknown;
  frictionTag?: unknown;
  severityLevel?: unknown;
}

export interface SanitisedReview {
  text: string;
  author: string;
  role: string;
  counter: string;
  frictionTag: string | null;
  severityLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface ReviewValidation {
  ok: boolean;
  errors: string[];
  value?: SanitisedReview;
}

const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const PII_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "Aadhaar-like number", re: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/ },
  { label: "long digit run", re: /\b\d{10,}\b/ },
  { label: "email address", re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i },
  { label: "URL", re: /https?:\/\/|www\./i }
];

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clamp(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function detectPii(text: string): string[] {
  return PII_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.label);
}

export function validateReview(input: ReviewSubmission): ReviewValidation {
  const errors: string[] = [];
  const text = asString(input.text);

  if (text.length < 10) errors.push("Review text must be at least 10 characters.");
  if (text.length > 1000) errors.push("Review text must be at most 1000 characters.");

  const pii = detectPii(text);
  if (pii.length > 0) {
    errors.push(`Remove personal/sensitive content before posting: ${pii.join(", ")}.`);
  }

  if (errors.length > 0) return { ok: false, errors };

  const severityRaw = asString(input.severityLevel).toUpperCase();
  const severityLevel = (SEVERITIES as readonly string[]).includes(severityRaw)
    ? (severityRaw as SanitisedReview["severityLevel"])
    : "MEDIUM";

  const frictionRaw = asString(input.frictionTag).toUpperCase().replace(/[^A-Z0-9_]/g, "");

  return {
    ok: true,
    errors: [],
    value: {
      text,
      author: clamp(asString(input.author) || "Citizen Applicant", 80),
      role: clamp(asString(input.role) || "Citizen Applicant", 80),
      counter: clamp(
        asString(input.counter) || asString(input.ward) || "Citizen-reported",
        128
      ),
      frictionTag: frictionRaw ? clamp(frictionRaw, 64) : null,
      severityLevel
    }
  };
}