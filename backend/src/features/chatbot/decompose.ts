// Query decomposition: turn a free-text request into a structured search object.
//
// DETERMINISTIC by design. The plan (my_plans/query_decomposition.md) describes an
// LLM extractor whose output is validated against a typed schema. This module is
// that typed schema + validation + a rule-based extractor, so the chatbot works
// with no LLM/network and every field is unit-testable. An LLM adapter can later
// produce the same QueryDecomposition and reuse the same validation.
//
// The decomposer extracts and normalizes what the user asked. It does NOT decide
// eligibility and never invents scheme facts.

import { findSchemeSlug } from "../../core/schemes.ts";
import {
  EMPTY_FACTS,
  type ApplicantCategory,
  type ApplicantFacts,
  type ChatIntent,
  type ClassLevel,
  type Gender,
  type LocationContext,
  type QueryDecomposition
} from "./types.ts";

/** Categories that actually exist in the catalog (validated against the DB). */
export const KNOWN_CATEGORIES = ["education", "healthcare", "livelihood"] as const;

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  education: [
    "scholarship", "scholarships", "study", "studies", "student", "students",
    "college", "school", "fee", "fees", "tuition", "education", "exam", "exams",
    "10th", "12th", "ssc", "hsc", "diploma", "iti", "polytechnic", "degree",
    "graduation", "graduate", "grant", "merit", "marksheet", "marks"
  ],
  healthcare: [
    "health", "hospital", "hospitals", "medical", "treatment", "surgery",
    "dialysis", "medicine", "medicines", "arogya", "sgay", "illness", "disease",
    "operation", "chemo", "chemotherapy", "patient"
  ],
  livelihood: [
    "vendor", "vendors", "hawker", "hawkers", "loan", "loans", "business",
    "self employment", "self-employment", "svanidhi", "shop", "stall",
    "street vendor", "market", "entrepreneur", "livelihood", "capital"
  ]
};

const PILLAR_BY_CATEGORY: Record<string, string> = {
  education: "EDUCATION",
  healthcare: "HEALTHCARE",
  livelihood: "AGRICULTURE_LIVELIHOOD"
};

const DISCOVERY_CUES = [
  "want", "need", "looking for", "help me", "help", "support", "find",
  "show", "which scheme", "what scheme", "scheme", "schemes", "benefit",
  "assistance", "apply", "eligible", "eligibility", "qualify"
];

const INFO_CUES = [
  "document", "documents", "required", "deadline", "last date", "benefit",
  "how much", "amount", "where", "how to apply", "process", "eligib", "about",
  "what is", "when", "which documents", "procedure"
];

export function detectCategory(text: string): string | null {
  const lower = text.toLowerCase();
  let best: { category: string; hits: number } | null = null;
  for (const [category, words] of Object.entries(CATEGORY_KEYWORDS)) {
    const hits = words.reduce((n, w) => (lower.includes(w) ? n + 1 : n), 0);
    if (hits > 0 && (!best || hits > best.hits)) best = { category, hits };
  }
  return best?.category ?? null;
}

export function categoryToPillar(category: string | null): string | null {
  if (!category) return null;
  return PILLAR_BY_CATEGORY[category] ?? null;
}

function extractAge(lower: string): number | null {
  const m =
    lower.match(/\b(\d{1,2})\s*(?:years?|yrs?|y)[\s-]*old\b/) ??
    lower.match(/\bi am (?:a |an )?(\d{1,2})\b/) ??
    lower.match(/\bage[:\s]+(\d{1,2})\b/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 120 ? n : null;
}

function extractGender(lower: string): Gender | null {
  if (/\b(female|woman|women|girl|girls|lady|ladies)\b/.test(lower)) return "female";
  if (/\b(male|man|men|boy|boys)\b/.test(lower)) return "male";
  return null;
}

function extractCategoryValue(lower: string): ApplicantCategory | null {
  if (/\bscheduled caste\b|\bsc\b/.test(lower)) return "SC";
  if (/\bscheduled tribe\b|\bst\b/.test(lower)) return "ST";
  if (/\bobc\b|other backward/.test(lower)) return "OBC";
  if (/\bvjnt?\b|\bvj\b/.test(lower)) return "VJNT";
  if (/\bews\b/.test(lower)) return "EWS";
  if (/\bgeneral\b|\bopen\b/.test(lower)) return "OPEN";
  return null;
}

function extractIncome(lower: string): number | null {
  const lakh = lower.match(/(\d+(?:\.\d+)?)\s*(?:lakh|lakhs|lac|lacs|lpa)\b/);
  if (lakh) return Math.round(Number.parseFloat(lakh[1]) * 100000);

  const thousand = lower.match(/(\d+(?:\.\d+)?)\s*(?:k|thousand)\b/);
  if (thousand) return Math.round(Number.parseFloat(thousand[1]) * 1000);

  const rupee = lower.match(/(?:rs\.?|inr|₹)\s*([\d,]{4,})/);
  if (rupee) return Number(rupee[1].replace(/,/g, ""));

  if (/\bincome|salary|earning|earn\b/.test(lower)) {
    const plain = lower.match(/\b(\d{5,7})\b/);
    if (plain) return Number(plain[1]);
  }
  return null;
}

function extractClassLevel(lower: string): ClassLevel | null {
  if (/\b(12th|class\s*12|hsc|xii|std\s*12)\b/.test(lower) || /passed\s*12|12\s*pass/.test(lower)) {
    return "12TH_PASS";
  }
  if (/\b(10th|class\s*10|ssc|x\b|std\s*10)\b/.test(lower) || /passed\s*10|10\s*pass/.test(lower)) {
    return "10TH_PASS";
  }
  if (/\bgraduated|graduate|degree completed\b/.test(lower)) return "GRADUATE";
  return null;
}

function extractCourseType(lower: string): string | null {
  const courses = [
    "engineering", "medical", "nursing", "iti", "polytechnic", "diploma",
    "computer", "commerce", "science", "arts"
  ];
  return courses.find((c) => lower.includes(c)) ?? null;
}

function extractDomicileYears(lower: string): number | null {
  const m = lower.match(/(\d{1,2})\s*(?:years?|yrs?)\s*(?:in|of)\s*(?:pune|maharashtra)/);
  return m ? Number(m[1]) : null;
}

export function extractFacts(lower: string): ApplicantFacts {
  const percentMatches = [...lower.matchAll(/(\d{1,3}(?:\.\d+)?)\s*%/g)].map((m) =>
    Number.parseFloat(m[1])
  );
  const hasDisabilityWord = /disab|divyang/.test(lower);

  return {
    age: extractAge(lower),
    gender: extractGender(lower),
    category: extractCategoryValue(lower),
    income: extractIncome(lower),
    domicileYears: extractDomicileYears(lower),
    classLevel: extractClassLevel(lower),
    courseType: extractCourseType(lower),
    marksPercent:
      percentMatches.length > 0 && !hasDisabilityWord ? percentMatches[0] : null,
    disabilityPercent:
      percentMatches.length > 0 && hasDisabilityWord ? percentMatches[0] : null,
    isOrphan: /orphan|अनाथ/.test(lower) ? true : null,
    isStreetVendor: /vendor|hawker|पथविक्रेता|फेरीवाले/.test(lower) ? true : null
  };
}

/** Remove demographic facts from the query, leaving the user's "need". */
export function buildSemanticQuery(raw: string): string | null {
  let s = raw;
  const strip: RegExp[] = [
    /\b\d{1,2}\s*(?:years?|yrs?|y)[\s-]*old\b/gi,
    /\bi am (?:a |an )?\d{1,2}\b/gi,
    /\bi am (?:a |an )?\b/gi,
    /\b(?:female|male|woman|women|man|men|girl|girls|boy|boys|lady|ladies)\b/gi,
    /\b(?:\d+(?:\.\d+)?)\s*(?:lakh|lakhs|lac|lacs|lpa|thousand|k)\b/gi,
    /\b(?:rs\.?|inr|₹)\s*[\d,]+/gi,
    /\b(?:scheduled caste|scheduled tribe|other backward class)\b/gi,
    /\b(?:sc|st|obc|vjnt|ews|open|general)\b/gi
  ];
  for (const re of strip) s = s.replace(re, " ");
  const cleaned = s.replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : raw.trim();
}

function relevantFactKeys(category: string | null): string[] {
  const base = ["income", "category"];
  const byCategory: Record<string, string[]> = {
    education: ["classLevel", "marksPercent", "domicileYears"],
    healthcare: ["domicileYears"],
    livelihood: ["isStreetVendor"]
  };
  return [...base, ...(byCategory[category ?? ""] ?? [])];
}

export function computeUnknownFacts(
  category: string | null,
  facts: ApplicantFacts
): string[] {
  return relevantFactKeys(category).filter(
    (key) => facts[key as keyof ApplicantFacts] == null
  );
}

function classifyIntent(
  lower: string,
  schemeSlug: string | null,
  category: string | null
): ChatIntent {
  if (schemeSlug) {
    const infoHits = INFO_CUES.filter((c) => lower.includes(c)).length;
    const discoveryHits = DISCOVERY_CUES.filter((c) => lower.includes(c)).length;
    if (infoHits > 0 && infoHits >= discoveryHits) return "ASK_SCHEME_INFO";
    if (/\b(details?|full information)\b/.test(lower)) return "SCHEME_DETAIL";
    return "ASK_SCHEME_INFO";
  }
  const discoveryHits = DISCOVERY_CUES.filter((c) => lower.includes(c)).length;
  if (discoveryHits > 0 || category) return "DISCOVER_SCHEMES";
  return "OTHER";
}

function extractLocation(lower: string): string | null {
  if (/\bpune|pmc|kothrud|bavdhan|bawdhan\b/.test(lower)) return "Pune";
  if (/\bmumbai|bmc\b/.test(lower)) return "Mumbai";
  if (/\bnashik\b/.test(lower)) return "Nashik";
  return null;
}

function nonNull<T extends object>(source: T | undefined): Partial<T> {
  const out: Partial<T> = {};
  if (!source) return out;
  const target = out as Record<string, unknown>;
  for (const [key, value] of Object.entries(source)) {
    if (value !== null && value !== undefined) target[key] = value;
  }
  return out;
}

export interface DecomposeContext {
  /** Saved profile facts used as defaults; query facts override them. */
  profile?: Partial<ApplicantFacts>;
  profileWard?: string | null;
  ulbCode?: string | null;
  /** The assistant's previous question, so a short reply ("2 lakh") is read in context. */
  lastBotQuestion?: string | null;
  /** One-line citizen profile summary. */
  profileSummary?: string | null;
}

export function decompose(rawQuery: string, context: DecomposeContext = {}): QueryDecomposition {
  const lower = rawQuery.toLowerCase();

  const schemeQuery = findSchemeSlug(lower);
  const detected = detectCategory(lower);
  const schemeCategory =
    detected && KNOWN_CATEGORIES.includes(detected as (typeof KNOWN_CATEGORIES)[number])
      ? detected
      : null;
  const pillar = categoryToPillar(schemeCategory);

  const queryFacts = extractFacts(lower);
  const applicantFacts: ApplicantFacts = {
    ...EMPTY_FACTS,
    ...nonNull(context.profile),
    ...nonNull(queryFacts)
  };

  const location: LocationContext = {
    explicitlyStated: extractLocation(lower),
    profileWard: context.profileWard ?? null,
    resolvedUlbCode: context.ulbCode ?? null
  };

  return {
    intent: classifyIntent(lower, schemeQuery, schemeCategory),
    schemeQuery,
    schemeCategory,
    pillar,
    semanticQuery: buildSemanticQuery(rawQuery),
    applicantFacts,
    unknownFacts: computeUnknownFacts(schemeCategory, applicantFacts),
    location,
    rawQuery
  };
}