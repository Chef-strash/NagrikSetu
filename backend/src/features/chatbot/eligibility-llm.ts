// LLM eligibility check.
//
// Runs when a citizen SELECTS a scheme: the scheme's official eligibility text plus
// the decomposed applicant facts are handed to the model, which decides whether the
// citizen fulfils the requirements and asks for anything still missing.
//
// Grounding rules: use ONLY the supplied requirements, and every quoted line must
// actually appear in `eligibilityText` (enforced in code below, so a hallucinated
// quote is dropped). The result is guidance, never a binding decision.
//
// When no LLM is configured/failing this returns null and the caller falls back to
// the deterministic `assessScheme`.

import { extractJson, isLlmConfigured, llmComplete, type LlmMessage } from "../../core/llm.ts";
import type { ApplicantFacts, EligibilityCheck, EligibilityVerdict } from "./types.ts";

export interface EligibilityContext {
  schemeName: string;
  eligibilityText: string;
  benefitAmount: string | null;
  incomeLimit: number | null;
  cutoff: string | null;
  domicileYears: number | null;
  facts: ApplicantFacts;
  /** The citizen's original request, for context. */
  rawQuery: string | null;
  /** Session language (en/hi/mr) for reasons and questions. */
  language?: string | null;
}

export type JsonCompleter = (messages: LlmMessage[]) => Promise<unknown>;

export interface EligibilityLlmOptions {
  /** Inject a completer (tests). Otherwise the real client is used if configured. */
  complete?: JsonCompleter;
}

const VERDICTS: EligibilityVerdict[] = ["likely_eligible", "not_eligible", "need_more_info"];

const SYSTEM_PROMPT = `You are NagrikSetu's eligibility assistant for Pune municipal welfare schemes.

You are given ONE scheme's official eligibility requirements and what is known about the citizen.
Decide whether the citizen likely fulfils those requirements.

Return STRICT JSON only (no prose, no markdown), exactly this shape:
{
  "verdict": "likely_eligible" | "not_eligible" | "need_more_info",
  "reasons": ["short reason"],
  "quoted_lines": ["an EXACT line copied from the requirements below"],
  "missing_info": ["income", "marksPercent"],
  "questions": ["a short question to ask the citizen to fill a gap"]
}

RULES:
- Use ONLY the requirements supplied below. Never invent rules, thresholds, or amounts.
- "quoted_lines" MUST be copied verbatim from the requirements text; do not paraphrase.
- If a required fact is unknown, set verdict "need_more_info" and ask concise "questions".
- If a stated fact clearly fails a requirement, set verdict "not_eligible" and explain.
- ALWAYS write "reasons" and "questions" in the session language given below (en/hi/mr); keep JSON keys and verdict values in English.
- Judge each condition, but remember this is guidance the citizen confirms at the ward office.`;

function factLines(facts: ApplicantFacts): { known: string[]; unknown: string[] } {
  const known: string[] = [];
  const unknown: string[] = [];
  for (const [key, value] of Object.entries(facts)) {
    if (value === null || value === undefined) unknown.push(key);
    else known.push(`${key}: ${String(value)}`);
  }
  return { known, unknown };
}

function buildUserPrompt(context: EligibilityContext): string {
  const { known, unknown } = factLines(context.facts);
  return [
    `Scheme: ${context.schemeName}`,
    `Benefit: ${context.benefitAmount ?? "(not published)"}`,
    `Income ceiling: ${context.incomeLimit ?? "(not published)"}`,
    `Domicile requirement: ${context.domicileYears ?? "(not published)"} years`,
    `Cutoff: ${context.cutoff ?? "(not published)"}`,
    "",
    "OFFICIAL ELIGIBILITY REQUIREMENTS (source of truth):",
    context.eligibilityText || "(not published)",
    "",
    "KNOWN ABOUT THE CITIZEN:",
    known.length > 0 ? known.join("\n") : "(nothing known)",
    "",
    `UNKNOWN: ${unknown.join(", ") || "(none)"}`,
    context.rawQuery ? `\nCitizen's request: ${context.rawQuery}` : "",
    "",
    `Session language: ${context.language ?? "en"}`,
    "Return the JSON object only."
  ].join("\n");
}

function asStringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim())
    .slice(0, max);
}

/** Keep only quotes that actually appear in the official text (anti-hallucination). */
function groundQuotes(quotes: string[], eligibilityText: string): string[] {
  const haystack = eligibilityText.toLowerCase();
  return quotes.filter((q) => q.length > 3 && haystack.includes(q.toLowerCase())).slice(0, 6);
}

/**
 * Validate/normalise the model's JSON into an EligibilityCheck.
 * Returns null if the shape is unusable.
 */
export function normaliseEligibility(raw: unknown, eligibilityText: string): EligibilityCheck | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  const verdictRaw = typeof obj.verdict === "string" ? obj.verdict.trim().toLowerCase() : "";
  const verdict = (VERDICTS as string[]).includes(verdictRaw)
    ? (verdictRaw as EligibilityVerdict)
    : null;
  if (!verdict) return null;

  const reasons = asStringArray(obj.reasons, 8);
  const quotedLines = groundQuotes(asStringArray(obj.quoted_lines ?? obj.quotedLines, 8), eligibilityText);
  const missingInfo = asStringArray(obj.missing_info ?? obj.missingInfo, 10);
  const questions = asStringArray(obj.questions, 5);

  return { verdict, reasons, quotedLines, missingInfo, questions, source: "llm" };
}

export async function checkEligibilityWithLlm(
  context: EligibilityContext,
  options: EligibilityLlmOptions = {}
): Promise<EligibilityCheck | null> {
  const completer: JsonCompleter | null =
    options.complete ??
    (isLlmConfigured()
      ? async (messages) => extractJson(await llmComplete(messages, { json: true, temperature: 0 }))
      : null);

  if (!completer) return null;

  try {
    const messages: LlmMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(context) }
    ];
    const raw = await completer(messages);
    return normaliseEligibility(raw, context.eligibilityText);
  } catch {
    return null;
  }
}