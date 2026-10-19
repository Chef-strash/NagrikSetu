// Scheme retrieval scoring (structured + lexical).
//
// NOTE: vector search is intentionally NOT used. `schemes.embedding` is NULL for
// every row and there is no embedder configured, so `match_schemes_hybrid` cannot
// rank. Instead we score on structured fields (category/pillar/income) plus
// keyword overlap between the user's "need" and each scheme's text. Once an
// embedder exists, add a `semanticScore` term here without changing the callers.

import type { SchemeRecord } from "../../core/schemes.ts";
import { assessScheme } from "./assess.ts";
import type { QueryDecomposition, SchemeMatch } from "./types.ts";

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "am", "was", "were", "be", "to", "of", "for",
  "and", "or", "in", "on", "at", "by", "with", "as", "it", "this", "that",
  "these", "those", "i", "my", "me", "we", "our", "you", "your", "do", "does",
  "want", "need", "some", "just", "very", "can", "could", "please", "help",
  "support", "give", "get", "for", "about", "there", "here", "from", "into"
]);

export function tokenize(text: string): string[] {
  if (!text) return [];
  const tokens: string[] = [];
  let current = "";
  for (const ch of text.toLowerCase()) {
    if (/[\p{L}\p{N}\p{M}]/u.test(ch)) {
      current += ch;
    } else if (current) {
      tokens.push(current);
      current = "";
    }
  }
  if (current) tokens.push(current);
  return tokens.filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

interface Scored {
  scheme: SchemeRecord;
  score: number;
  reasons: string[];
}

function haystackOf(scheme: SchemeRecord): string {
  return `${scheme.name} ${scheme.categoryLabel} ${scheme.description} ${scheme.eligibilityText}`.toLowerCase();
}

export function scoreScheme(scheme: SchemeRecord, decomp: QueryDecomposition): Scored {
  const facts = decomp.applicantFacts;
  const haystack = haystackOf(scheme);
  const reasons: string[] = [];
  let score = 0;

  // Topic
  if (decomp.schemeCategory && scheme.category === decomp.schemeCategory) {
    score += 50;
    reasons.push(`Topic match: ${scheme.categoryLabel}`);
  }
  if (decomp.pillar && scheme.pillar === decomp.pillar) {
    score += 15;
  }

  // Education level
  if (facts.classLevel === "12TH_PASS") {
    if (/class\s*12|hsc|12th/.test(haystack)) {
      score += 30;
      reasons.push("Matches Class 12 (HSC)");
    } else if (/class\s*10|ssc|10th/.test(haystack)) {
      score -= 20;
    }
  }
  if (facts.classLevel === "10TH_PASS") {
    if (/class\s*10|ssc|10th/.test(haystack)) {
      score += 30;
      reasons.push("Matches Class 10 (SSC)");
    } else if (/class\s*12|hsc|12th/.test(haystack)) {
      score -= 20;
    }
  }

  // Gender
  if (/\bgirl|female|women\b/.test(haystack)) {
    if (facts.gender === "female") {
      score += 25;
      reasons.push("For girl students");
    } else if (facts.gender === "male") {
      score -= 30;
    }
  }

  // Income ceiling
  if (facts.income != null && scheme.incomeLimit != null) {
    if (facts.income <= scheme.incomeLimit) {
      score += 20;
      reasons.push(`Within the Rs. ${scheme.incomeLimit.toLocaleString("en-IN")} income ceiling`);
    } else {
      score -= 40;
      reasons.push(`Income above the Rs. ${scheme.incomeLimit.toLocaleString("en-IN")} ceiling`);
    }
  }

  // Course type
  if (facts.courseType && haystack.includes(facts.courseType)) {
    score += 10;
    reasons.push(`Course mentioned: ${facts.courseType}`);
  }

  // Street vendors
  if (facts.isStreetVendor && /\bvendor|hawker\b/.test(haystack)) {
    score += 40;
    reasons.push("For street vendors");
  }

  // Lexical overlap with the user's "need"
  const needTokens = new Set(tokenize(decomp.semanticQuery ?? ""));
  let overlap = 0;
  for (const token of needTokens) {
    if (token.length > 2 && haystack.includes(token)) overlap += 1;
  }
  if (overlap > 0) score += Math.min(overlap * 2, 12);

  return { scheme, score, reasons };
}

export function rankSchemes(
  schemes: SchemeRecord[],
  decomp: QueryDecomposition,
  limit = 5
): SchemeMatch[] {
  return schemes
    .map((scheme) => scoreScheme(scheme, decomp))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, limit))
    .map((s) => ({
      scheme: s.scheme,
      score: s.score,
      reasons: s.reasons,
      assessment: assessScheme(s.scheme, decomp.applicantFacts)
    }));
}