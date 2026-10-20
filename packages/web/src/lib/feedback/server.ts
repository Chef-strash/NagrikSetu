import { supabase } from "../supabase";
import { SCHEMES } from "../data/schemes";
import { getFixtureFaqs } from "../data/faqs";
import { buildGroundedAnswer, languageFallbacks, selectByLanguage } from "./answer";
import type { Faq, GroundedAnswer, SchemeReview } from "./types";

// Server-side data access for the read-only feedback features.
// Reads happen through RLS (published FAQs, approved reviews); no writes.
// If Supabase is unconfigured or unreachable, bundled fixtures are used.

export interface ResolvedScheme {
  id: string;
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

function fixtureScheme(slug: string) {
  const local = SCHEMES.find((s) => s.id === slug);
  if (!local) return null;
  return {
    id: slug,
    slug,
    name: local.name,
    officialUrl: local.officialFormUrl && local.officialFormUrl !== "#" ? local.officialFormUrl : null
  };
}

function fixtureReviews(slug: string): SchemeReview[] {
  const local = SCHEMES.find((s) => s.id === slug);
  if (!local) return [];
  return local.communityTips.map((t) => ({
    id: t.id,
    schemeId: slug,
    text: t.tip,
    frictionTag: null,
    severityLevel: null,
    helpfulCount: t.helpfulCount,
    createdAt: null
  }));
}

export async function resolveScheme(slug: string): Promise<ResolvedScheme | null> {
  if (supabase) {
    const { data, error } = await supabase
      .from("schemes")
      .select("id, slug, name, official_form_url, apply_url, source_url")
      .eq("slug", slug)
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      const row = data as SchemeRow;
      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        officialUrl: row.official_form_url || row.apply_url || row.source_url || null
      };
    }
  }
  return fixtureScheme(slug);
}

/** Published FAQs for one scheme, filtered/preferred by language. */
export async function getPublishedFaqs(slug: string, lang: string | null): Promise<Faq[]> {
  const fallbacks = languageFallbacks(lang);

  if (supabase) {
    const scheme = await resolveScheme(slug);
    if (scheme) {
      const { data, error } = await supabase
        .from("scheme_faqs")
        .select("id, scheme_id, question, answer, language_code, display_order, published_at")
        .eq("scheme_id", scheme.id)
        .eq("status", "PUBLISHED")
        .in("language_code", fallbacks)
        .order("display_order", { ascending: true });

      if (!error && data && data.length > 0) {
        return selectByLanguage((data as FaqRow[]).map(toFaq), lang);
      }
    }
  }

  return selectByLanguage(getFixtureFaqs(slug), lang);
}

/** Approved, scheme-linked reviews. Never location-filtered. */
export async function getApprovedReviews(slug: string, limit = 20): Promise<SchemeReview[]> {
  if (supabase) {
    const scheme = await resolveScheme(slug);
    if (scheme) {
      const { data, error } = await supabase
        .from("peer_intel_reviews")
        .select("id, scheme_id, tip, friction_tag, severity_level, helpful_count, created_at")
        .eq("scheme_id", scheme.id)
        .eq("verified_by_moderator", true)
        .order("helpful_count", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);

      if (!error && data) {
        return (data as ReviewRow[]).map((r) => ({
          id: r.id,
          schemeId: r.scheme_id,
          text: r.tip,
          frictionTag: r.friction_tag,
          severityLevel: r.severity_level,
          helpfulCount: r.helpful_count ?? 0,
          createdAt: r.created_at
        }));
      }
    }
  }

  return fixtureReviews(slug).slice(0, limit);
}

function isFaqRowArray(value: unknown): value is FaqRow[] {
  return Array.isArray(value);
}

/** Answer a free-text question from maintained FAQs only (grounded, extractive). */
export async function answerFaqQuestion(
  slug: string,
  question: string,
  lang: string | null
): Promise<GroundedAnswer> {
  const scheme = await resolveScheme(slug);
  const officialUrl = scheme?.officialUrl ?? null;
  const fallbacks = languageFallbacks(lang);

  // Preferred path: ranked full-text retrieval via the SQL function.
  if (supabase && scheme) {
    const { data, error } = await supabase.rpc("search_scheme_faqs", {
      p_scheme_id: scheme.id,
      p_query: question,
      p_languages: fallbacks
    });
    if (!error && isFaqRowArray(data) && data.length > 0) {
      return buildGroundedAnswer(data.map(toFaq), question, officialUrl);
    }
  }

  // Fallback path: lexical ranking over the published set (or fixtures).
  const faqs = await getPublishedFaqs(slug, lang);
  return buildGroundedAnswer(faqs, question, officialUrl);
}
