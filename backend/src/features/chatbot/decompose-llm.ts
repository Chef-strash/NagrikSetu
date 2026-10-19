// LLM query decomposition.
//
// The LLM extracts the structured search object; the result is then VALIDATED and
// normalised through the same typed schema the rule-based decomposer uses (allowed
// enums/categories, profile-merge, unknown-facts). On any LLM error, missing key,
// or invalid output we fall back to the deterministic `decompose()` so the feature
// keeps working offline and in tests.

import { extractJson, isLlmConfigured, llmComplete, type LlmMessage } from "../../core/llm.ts";
import { findSchemeSlug } from "../../core/schemes.ts";
import {
  categoryToPillar,
  computeUnknownFacts,
  detectCategory,
  decompose,
  KNOWN_CATEGORIES,
  type DecomposeContext
} from "./decompose.ts";
import {
  EMPTY_FACTS,
  type ApplicantCategory,
  type ApplicantFacts,
  type ChatIntent,
  type ClassLevel,
  type Gender,
  type QueryDecomposition
} from "./types.ts";

const INTENTS: ChatIntent[] = ["DISCOVER_SCHEMES", "ASK_SCHEME_INFO", "SCHEME_DETAIL", "OTHER"];
const PILLARS = ["EDUCATION", "HEALTHCARE", "AGRICULTURE_LIVELIHOOD"];
const CATEGORIES: ApplicantCategory[] = ["SC", "ST", "OBC", "VJNT", "EWS", "OPEN"];
const CLASS_LEVELS: ClassLevel[] = ["10TH_PASS", "12TH_PASS", "GRADUATE"];
const GENDERS: Gender[] = ["female", "male", "other"];

export type JsonCompleter = (messages: LlmMessage[], options: { json?: boolean }) => Promise<unknown>;

export interface DecomposeWithLlmOptions {
  /** Inject a completer (tests). When absent, the real client is used if configured. */
  complete?: JsonCompleter;
}

export interface DecomposeResult {
  decomposition: QueryDecomposition;
  source: "llm" | "rules";
}

const SYSTEM_PROMPT = `You are a query-decomposition engine for NagrikSetu, a municipal welfare scheme
assistant for Pune, India. You convert a citizen's free-text request into a structured search object.

Return STRICT JSON only (no prose, no markdown), matching exactly this shape:
{
  "intent": "DISCOVER_SCHEMES" | "ASK_SCHEME_INFO" | "SCHEME_DETAIL" | "OTHER",
  "scheme_query": string | null,
  "scheme_category": "education" | "healthcare" | "livelihood" | null,
  "pillar": "EDUCATION" | "HEALTHCARE" | "AGRICULTURE_LIVELIHOOD" | null,
  "semantic_query": string | null,
  "applicant_facts": {
    "age": number | null,
    "gender": "female" | "male" | "other" | null,
    "category": "SC" | "ST" | "OBC" | "VJNT" | "EWS" | "OPEN" | null,
    "income": number | null,
    "domicile_years": number | null,
    "class_level": "10TH_PASS" | "12TH_PASS" | "GRADUATE" | null,
    "course_type": string | null,
    "marks_percent": number | null,
    "disability_percent": number | null,
    "is_orphan": boolean | null,
    "is_street_vendor": boolean | null
  },
  "location": { "explicitly_stated": string | null }
}

RULES:
- DISCOVER_SCHEMES: the citizen wants schemes. ASK_SCHEME_INFO: a question about a NAMED scheme.
  SCHEME_DETAIL: wants a named scheme's stored details. OTHER: unrelated.
- Extract ONLY facts stated in the query. Never guess age/gender/category/income.
- "scheme_category" is the TOPIC (education/healthcare/livelihood), one of those three or null.
  Do NOT put the applicant's social category there.
- Normalise annual money to a number in rupees ("2 lakh a year" -> 200000). Never convert an
  unqualified monthly amount to annual.
- Map synonyms: "Scheduled Caste" -> SC, "girl/woman/female" -> female, "passed 12th/HSC" -> 12TH_PASS.
- Do NOT infer Booleans from vague words (do not set is_orphan from "poor").
- "semantic_query" is the citizen's NEED with demographics removed (topic + benefit wanted).
- Use null for anything unknown. Do not invent scheme facts.`;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number.parseFloat(value.replace(/[, ]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asBool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function pickEnum<T extends string>(value: unknown, allowed: T[]): T | null {
  const s = asString(value);
  if (!s) return null;
  const upper = s.toUpperCase();
  return allowed.find((a) => a.toUpperCase() === upper) ?? null;
}

function normaliseFacts(raw: unknown): ApplicantFacts {
  const f = asRecord(raw);
  return {
    age: asNumber(f.age),
    gender: pickEnum(f.gender, GENDERS),
    category: pickEnum(f.category, CATEGORIES),
    income: asNumber(f.income),
    domicileYears: asNumber(f.domicile_years ?? f.domicileYears),
    classLevel: pickEnum(f.class_level ?? f.classLevel, CLASS_LEVELS),
    courseType: asString(f.course_type ?? f.courseType),
    marksPercent: asNumber(f.marks_percent ?? f.marksPercent),
    disabilityPercent: asNumber(f.disability_percent ?? f.disabilityPercent),
    isOrphan: asBool(f.is_orphan ?? f.isOrphan),
    isStreetVendor: asBool(f.is_street_vendor ?? f.isStreetVendor)
  };
}

function nonNull<T extends object>(source: Partial<T> | undefined): Partial<T> {
  const out: Partial<T> = {};
  if (!source) return out;
  const target = out as Record<string, unknown>;
  for (const [key, value] of Object.entries(source)) {
    if (value !== null && value !== undefined) target[key] = value;
  }
  return out;
}

/** Validate/normalise an LLM JSON object into a QueryDecomposition. */
export function normaliseDecomposition(
  raw: unknown,
  rawQuery: string,
  context: DecomposeContext = {}
): QueryDecomposition {
  const obj = asRecord(raw);
  const lower = rawQuery.toLowerCase();

  const factsRaw = normaliseFacts(obj.applicant_facts);
  const applicantFacts: ApplicantFacts = {
    ...EMPTY_FACTS,
    ...nonNull(context.profile),
    ...nonNull(factsRaw)
  };

  const schemeQuery = asString(obj.scheme_query) ?? findSchemeSlug(lower);

  const llmCategory = asString(obj.scheme_category);
  const schemeCategory =
    llmCategory && KNOWN_CATEGORIES.includes(llmCategory as (typeof KNOWN_CATEGORIES)[number])
      ? llmCategory
      : detectCategory(lower);

  const llmPillar = pickEnum(obj.pillar, PILLARS);
  const pillar = llmPillar ?? categoryToPillar(schemeCategory);

  const intent = pickEnum(obj.intent, INTENTS) ?? "OTHER";
  const semanticQuery = asString(obj.semantic_query) ?? rawQuery.trim();
  const locationRaw = asRecord(obj.location);

  return {
    intent,
    schemeQuery,
    schemeCategory,
    pillar,
    semanticQuery,
    applicantFacts,
    unknownFacts: computeUnknownFacts(schemeCategory, applicantFacts),
    location: {
      explicitlyStated: asString(locationRaw.explicitly_stated),
      profileWard: context.profileWard ?? null,
      resolvedUlbCode: context.ulbCode ?? null
    },
    rawQuery
  };
}

function buildMessages(rawQuery: string, context: DecomposeContext = {}): LlmMessage[] {
  const extra = [
    context.lastBotQuestion ? `Assistant's previous question: "${context.lastBotQuestion}" (the request may be a short answer to it)` : "",
    context.profileSummary ? `Known citizen profile: ${context.profileSummary}` : ""
  ].filter(Boolean);
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `${extra.length ? `${extra.join("\n")}\n\n` : ""}Citizen request:\n"""${rawQuery}"""\n\nReturn only the JSON object.`
    }
  ];
}

/**
 * Decompose a query with the LLM (validated), falling back to the deterministic
 * decomposer when no provider is configured or the model output is unusable.
 */
export async function decomposeWithLlm(
  rawQuery: string,
  context: DecomposeContext = {},
  options: DecomposeWithLlmOptions = {}
): Promise<DecomposeResult> {
  const completer: JsonCompleter | null =
    options.complete ??
    (isLlmConfigured()
      ? async (messages, opts) =>
          extractJson(await llmComplete(messages, { json: opts.json, temperature: 0 }))
      : null);

  if (!completer) {
    return { decomposition: decompose(rawQuery, context), source: "rules" };
  }

  try {
    const raw = await completer(buildMessages(rawQuery, context), { json: true });
    const decomposition = normaliseDecomposition(raw, rawQuery, context);
    return { decomposition, source: "llm" };
  } catch {
    return { decomposition: decompose(rawQuery, context), source: "rules" };
  }
}