// Feedback service layer: resolves schemes and reads FAQs/reviews.
// Live path: Supabase via the shared read client (anon key -> RLS-enforced).
// Fallback path: bundled fixtures so the API needs no network.
// FAQ answers are always extractive (answer.ts).

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient, getReadClient } from "../../core/supabase.ts";
import { getActiveSchemes } from "../../core/schemes.ts";
import { isLlmConfigured } from "../../core/llm.ts";
import {
  buildGroundedAnswer,
  GUIDANCE_TEXT,
  languageFallbacks,
  normalizeLang,
  rankFaqs,
  selectByLanguage
} from "./answer.ts";
import { answerFaqWithLlm, type AnswerMode } from "./answer-llm.ts";
import { validateReview, type ReviewSubmission } from "./review-input.ts";
import { FAQ_FIXTURES, REVIEW_FIXTURES, SCHEME_FIXTURES } from "./fixtures.ts";
import type {
  AnswerReviewRef,
  Faq,
  FaqAnswerResponse,
  FaqListResponse,
  ReviewListResponse,
  SchemeBrief,
  SchemeReview
} from "./types.ts";

export class SchemeNotFoundError extends Error {
  constructor(slug: string) {
    super(`Scheme not found: ${slug}`);
    this.name = "SchemeNotFoundError";
  }
}

export interface ResolvedScheme {
  id: string | null;
  slug: string;
  name: string;
  officialUrl: string | null;
}

interface SchemeRow {
  id: string;
  slug: string;
  name: string;
  official_form_url: string | null;
  apply_url: string | null;
  source_url: string | null;
}

interface FaqRow {
  id: string;
  scheme_id: string;
  question: string;
  answer: string;
  language_code: string;
  display_order: number;
  published_at: string | null;
}

interface ReviewRow {
  id: string;
  scheme_id: string;
  tip: string;
  friction_tag: string | null;
  severity_level: string | null;
  counter: string | null;
  helpful_count: number;
  created_at: string | null;
}

function toFaq(row: FaqRow): Faq {
  return {
    id: row.id,
    schemeId: row.scheme_id,
    question: row.question,
    answer: row.answer,
    languageCode: (row.language_code || "en").toLowerCase(),
    displayOrder: row.display_order ?? 0,
    publishedAt: row.published_at
  };
}

function toReview(row: ReviewRow): SchemeReview {
  return {
    id: row.id,
    schemeId: row.scheme_id,
    text: row.tip,
    frictionTag: row.friction_tag,
    severityLevel: row.severity_level,
    counter: row.counter ?? null,
    helpfulCount: row.helpful_count ?? 0,
    createdAt: row.created_at
  };
}

function brief(scheme: ResolvedScheme | null): SchemeBrief | null {
  return scheme ? { slug: scheme.slug, name: scheme.name } : null;
}

function fixtureScheme(slug: string): ResolvedScheme | null {
  const meta = SCHEME_FIXTURES[slug];
  if (meta) {
    return { id: null, slug, name: meta.name, officialUrl: meta.officialUrl };
  }
  if (slug in FAQ_FIXTURES || slug in REVIEW_FIXTURES) {
    return { id: null, slug, name: slug, officialUrl: null };
  }
  return null;
}

export async function resolveScheme(slug: string): Promise<ResolvedScheme | null> {
  const db: SupabaseClient | null = getReadClient();
  if (db) {
    try {
      const { data, error } = await db
        .from("schemes")
        .select("id, slug, name, official_form_url, apply_url, source_url")
        .eq("slug", slug)
        .limit(1)
        .maybeSingle();
      if (!error && data) {
        const row = data as unknown as SchemeRow;
        return {
          id: row.id,
          slug: row.slug,
          name: row.name,
          officialUrl: row.official_form_url || row.apply_url || row.source_url || null
        };
      }
    } catch {
      // fall through to fixtures
    }
  }
  return fixtureScheme(slug);
}

async function fetchFaqs(
  slug: string,
  scheme: ResolvedScheme,
  langs: string[]
): Promise<Faq[]> {
  const db: SupabaseClient | null = getReadClient();
  if (db && scheme.id) {
    try {
      const { data, error } = await db
        .from("scheme_faqs")
        .select("id, scheme_id, question, answer, language_code, display_order, published_at")
        .eq("scheme_id", scheme.id)
        .eq("status", "PUBLISHED")
        .in("language_code", langs)
        .order("display_order", { ascending: true });
      if (!error && data && data.length > 0) {
        return selectByLanguage((data as unknown as FaqRow[]).map(toFaq), langs[0]);
      }
    } catch {
      // fall through to fixtures
    }
  }
  return selectByLanguage(FAQ_FIXTURES[slug] ?? [], langs[0]);
}

export async function getFaqs(slug: string, lang: string | null): Promise<FaqListResponse> {
  const language = normalizeLang(lang);
  const scheme = await resolveScheme(slug);
  if (!scheme) {
    return { scheme: null, language, count: 0, faqs: [] };
  }
  const faqs = await fetchFaqs(slug, scheme, languageFallbacks(language));
  return { scheme: brief(scheme), language, count: faqs.length, faqs };
}
export async function getReviews(slug: string, limit = 20): Promise<ReviewListResponse> {
  const scheme = await resolveScheme(slug);
  if (!scheme) {
    return { scheme: null, count: 0, reviews: [] };
  }

  let reviews: SchemeReview[] = [];
  const db: SupabaseClient | null = getReadClient();
  if (db && scheme.id) {
    try {
      const { data, error } = await db
        .from("peer_intel_reviews")
        .select("id, scheme_id, tip, friction_tag, severity_level, counter, helpful_count, created_at")
        .eq("scheme_id", scheme.id)
        .eq("verified_by_moderator", true)
        .order("helpful_count", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);
      if (!error && data) {
        reviews = (data as unknown as ReviewRow[]).map(toReview);
      }
    } catch {
      reviews = [];
    }
  }

  if (reviews.length === 0) {
    reviews = REVIEW_FIXTURES[slug] ?? [];
  }

  return {
    scheme: brief(scheme),
    count: reviews.length,
    reviews: reviews.slice(0, limit)
  };
}

export interface FaqAnswerOptions {
  /** Citizen's ward/ULB, used to match reviews by location. */
  location?: string | null;
  /** Session memory for the LLM path. */
  history?: import("../../core/llm.ts").LlmMessage[];
  sessionContext?: string;
  /** Skip the LLM (time budget exhausted) and answer extractively. */
  skipLlm?: boolean;
}

const LOCATION_STOPWORDS = new Set([
  "ward", "counter", "no", "number", "office", "pmc", "municipal", "corporation",
  "road", "street", "the", "and"
]);

function locationTokens(value: string | null | undefined): string[] {
  if (!value) return [];
  return (value.toLowerCase().match(/[a-z]+|\d+/g) ?? []).filter(
    (t) => (t.length >= 3 || /^\d+$/.test(t)) && !LOCATION_STOPWORDS.has(t)
  );
}

/** True when the two location strings share a meaningful token (ward no. / place). */
export function locationsMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const ta = new Set(locationTokens(a));
  const tb = new Set(locationTokens(b));
  if (ta.size === 0 || tb.size === 0) return false;
  for (const token of ta) if (tb.has(token)) return true;
  return false;
}

function toAnswerReview(review: SchemeReview): AnswerReviewRef {
  return {
    id: review.id,
    text: review.text,
    counter: review.counter,
    helpfulCount: review.helpfulCount
  };
}

/**
 * Answer a question about ONE scheme.
 *
 * Policy:
 *   1. If the maintained FAQs cover the question -> answer ONLY from those FAQs.
 *   2. Otherwise -> the model may use general knowledge.
 *   3. Reviews for the same scheme are included only when their location matches
 *      the citizen's location.
 * When no LLM is configured/failing, a purely extractive FAQ answer is returned.
 */
export async function getFaqAnswer(
  slug: string,
  question: string,
  lang: string | null,
  options: FaqAnswerOptions = {}
): Promise<FaqAnswerResponse> {
  const language = normalizeLang(lang);
  const scheme = await resolveScheme(slug);
  if (!scheme) {
    throw new SchemeNotFoundError(slug);
  }

  const location = options.location ?? null;

  // 1) Retrieval: full FAQ set + the subset that actually matches the question.
  const corpus = await fetchFaqs(slug, scheme, languageFallbacks(language));

  // Coverage is decided by the SQL full-text search when the DB is available
  // (strict). Only when the DB/RPC is unavailable do we fall back to the looser
  // lexical ranker. `null` means "RPC not attempted".
  let matched: Faq[] | null = null;
  const db: SupabaseClient | null = getReadClient();
  if (db && scheme.id) {
    try {
      const { data, error } = await db.rpc("search_scheme_faqs", {
        p_scheme_id: scheme.id,
        p_query: question,
        p_languages: languageFallbacks(language)
      });
      if (!error) {
        matched = Array.isArray(data) ? (data as unknown as FaqRow[]).map(toFaq) : [];
      }
    } catch {
      matched = null;
    }
  }
  if (matched === null) {
    matched = rankFaqs(corpus, question, 5).map((r) => r.faq);
  }

  const faqCovers = matched.length > 0;
  const mode: AnswerMode = faqCovers ? "faq_only" : "general";
  const faqsForAnswer = faqCovers ? matched : corpus;

  // 2) Reviews: same scheme, filtered to the citizen's location.
  const schemeReviews = await getReviews(slug, 20);
  const matchedReviews = location
    ? schemeReviews.reviews.filter((r) => locationsMatch(location, r.counter))
    : [];
  const reviewsUsed = matchedReviews.slice(0, 3).map(toAnswerReview);
  const locationMatched = Boolean(location) && reviewsUsed.length > 0;

  // 3) Generate with the LLM (FAQ-first, general fallback, + location-matched reviews).
  if (!options.skipLlm && isLlmConfigured() && (faqsForAnswer.length > 0 || reviewsUsed.length > 0)) {
    const fullScheme = (await getActiveSchemes()).find((s) => s.slug === slug);
    const llmAnswer = await answerFaqWithLlm({
      schemeName: fullScheme?.name ?? scheme.name,
      benefitAmount: fullScheme?.benefitAmount ?? null,
      eligibilityText: fullScheme?.eligibilityText ?? "",
      requiredDocuments: fullScheme?.requiredDocuments ?? [],
      officialUrl: scheme.officialUrl,
      question,
      language,
      mode,
      faqs: faqsForAnswer,
      reviews: reviewsUsed,
      location,
      history: options.history,
      sessionContext: options.sessionContext
    });
    if (llmAnswer) {
      return {
        scheme: brief(scheme),
        language,
        answered: true,
        answer: llmAnswer,
        references: faqsForAnswer.slice(0, 3).map((faq) => ({ id: faq.id, question: faq.question })),
        officialUrl: scheme.officialUrl,
        guidance: GUIDANCE_TEXT,
        answerSource: faqCovers ? "faq" : reviewsUsed.length > 0 ? "review" : "general",
        reviews: reviewsUsed,
        locationMatched
      };
    }
  }

  // Extractive fallback (no LLM): answer strictly from the FAQs.
  const result = buildGroundedAnswer(faqsForAnswer, question, scheme.officialUrl);
  return {
    scheme: brief(scheme),
    language,
    answered: result.answered,
    answer: result.answer,
    references: result.references,
    officialUrl: result.officialUrl,
    guidance: result.guidance,
    answerSource: result.answered ? "faq" : "none",
    reviews: reviewsUsed,
    locationMatched
  };
}

export interface SubmitReviewResult {
  ok: boolean;
  review?: SchemeReview;
  errors: string[];
  /** True when no trusted write path exists (DB disabled / fixture mode). */
  unavailable?: boolean;
}

/**
 * Submit a citizen review for a scheme.
 *
 * Writes go through the SERVICE ROLE (trusted) because the anon role is
 * read-only on `peer_intel_reviews`. Input is validated/sanitised first (length,
 * no PII, no links) and the review is published (`verified_by_moderator = true`)
 * after passing validation.
 */
export async function submitReview(
  slug: string,
  input: ReviewSubmission
): Promise<SubmitReviewResult> {
  const validation = validateReview(input);
  if (!validation.ok || !validation.value) {
    return { ok: false, errors: validation.errors };
  }

  const scheme = await resolveScheme(slug);
  if (!scheme) {
    throw new SchemeNotFoundError(slug);
  }

  const admin: SupabaseClient | null = getAdminClient();
  if (!admin || !scheme.id) {
    return { ok: false, errors: [], unavailable: true };
  }

  const value = validation.value;
  const { data, error } = await admin
    .from("peer_intel_reviews")
    .insert({
      scheme_id: scheme.id,
      author: value.author,
      role: value.role,
      counter: value.counter,
      tip: value.text,
      friction_tag: value.frictionTag,
      severity_level: value.severityLevel,
      helpful_count: 1,
      verified_by_moderator: true
    })
    .select("id, scheme_id, tip, friction_tag, severity_level, counter, helpful_count, created_at")
    .single();

  if (error || !data) {
    return { ok: false, errors: [error?.message ?? "Could not save the review."] };
  }

  return { ok: true, errors: [], review: toReview(data as unknown as ReviewRow) };
}