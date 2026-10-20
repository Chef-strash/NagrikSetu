// Pure, dependency-free retrieval logic for the FAQ answer flow.
// A deliberate port of `packages/web/src/lib/feedback/answer.ts` so the backend
// and the web app answer identically. There is no I/O here: every function is
// directly unit-testable, and the answer is *extractive* (the top FAQ's stored
// answer verbatim) so the service can never invent eligibility criteria.

import type { Faq, FaqReference, GroundedAnswer } from "./types.ts";

export const GUIDANCE_TEXT =
  "This is guidance from maintained scheme information, not an official decision. Confirm details at the ward office before you travel.";

const DEFAULT_FALLBACK = ["en"];

/** Ordered preference list: requested language first, then English. */
export function languageFallbacks(raw: string | null | undefined): string[] {
  const lang = (raw ?? "").trim().toLowerCase();
  if (!lang || lang === "en") return DEFAULT_FALLBACK;
  return [lang, "en"];
}

export function normalizeLang(raw: string | null | undefined): string {
  const lang = (raw ?? "en").trim().toLowerCase();
  return /^[a-z]{2}(-[a-z]{2})?$/.test(lang) ? lang : "en";
}

/** Keep only FAQs whose language is in the fallback list, requested language first. */
export function selectByLanguage(faqs: Faq[], raw: string | null | undefined): Faq[] {
  const order = languageFallbacks(raw);
  return faqs
    .filter((f) => order.includes(f.languageCode))
    .sort((a, b) => order.indexOf(a.languageCode) - order.indexOf(b.languageCode));
}

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "am", "was", "were", "be", "to", "of", "for",
  "and", "or", "in", "on", "at", "by", "with", "as", "it", "this", "that",
  "these", "those", "i", "my", "me", "we", "our", "you", "your", "do", "does",
  "did", "can", "could", "should", "will", "would", "what", "which", "who",
  "whom", "how", "when", "where", "why", "please", "tell", "give", "about",
  "there", "here", "from", "into", "need", "have", "has", "get"
]);

/** Raw word tokens (stopwords included) — used for topic detection. */
function scanTokens(text: string): string[] {
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
  return tokens;
}

/** Lowercase word tokens; Unicode-aware, keeps letters, digits and combining
 * marks (Devanagari matras) so Indic words stay intact. */
export function tokenize(text: string): string[] {
  return scanTokens(text).filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Canonical topics a citizen question can be about, with their cue words.
 * Deliberately conservative: only words that clearly *signal* the topic, so an
 * incidental mention (e.g. "Counter No. 3" inside an answer) cannot hijack it.
 */
const TOPIC_CUES: Record<string, string[]> = {
  eligibility: ["eligible", "eligibility", "qualify", "qualified", "criteria", "criterion"],
  documents: [
    "document", "documents", "docs", "paper", "papers",
    "marksheet", "marksheets", "certificate", "certificates", "xerox", "photocopy"
  ],
  benefit: ["amount", "benefit", "grant", "scholarship", "rupees", "money"],
  deadline: ["deadline", "lastdate", "expiry", "expires", "expire"],
  location: ["submit", "submission", "address", "office", "ward", "portal"],
  hours: ["hours", "hour", "timing", "timings", "open", "opening", "opens", "closed", "lunch"]
};

/** Topics a question is about, e.g. "counter hours?" -> ["hours"]. */
export function detectTopics(text: string): string[] {
  const present = new Set(scanTokens(text));
  const topics: string[] = [];
  for (const [topic, cues] of Object.entries(TOPIC_CUES)) {
    if (cues.some((cue) => present.has(cue))) topics.push(topic);
  }
  return topics;
}

/** One hit in the FAQ question is worth this many answer hits. */
const QUESTION_WEIGHT = 3;
const ANSWER_WEIGHT = 1;
/** Bonus when the FAQ's question is about the same topic the citizen asked about. */
const TOPIC_BONUS = 3;
/** Weight given to a token that appears in no FAQ at all. */
const UNSEEN_IDF = 1.2;
/** Candidates scoring below this share of the best score are dropped. */
const MIN_RELATIVE_SCORE = 0.34;

/** Inverse document frequency per token across the FAQ corpus (rare words matter more). */
function idfByToken(faqs: Faq[]): Map<string, number> {
  const df = new Map<string, number>();
  const docs = faqs.map((faq) => new Set([...tokenize(faq.question), ...tokenize(faq.answer)]));
  for (const tokens of docs) {
    for (const token of tokens) df.set(token, (df.get(token) ?? 0) + 1);
  }
  const total = Math.max(1, docs.length);
  const idf = new Map<string, number>();
  for (const [token, count] of df) {
    idf.set(token, 1 + Math.log(1 + total / (1 + count)));
  }
  return idf;
}

/**
 * Score one FAQ against the query.
 * - a hit in the FAQ QUESTION outweighs a hit in its ANSWER
 * - rare tokens outweigh ubiquitous ones (idf)
 * - a FAQ whose question is about the SAME TOPIC as the query gets a bonus, so
 *   "counter hours?" prefers an hours FAQ over one whose answer merely contains
 *   the word "counter"
 */
export function scoreFaq(
  faq: Faq,
  queryTokens: string[],
  idf: Map<string, number> = new Map(),
  queryTopics: string[] = []
): number {
  const weight = (token: string) => idf.get(token) ?? UNSEEN_IDF;
  const questionTokens = new Set(tokenize(faq.question));
  const answerTokens = new Set(tokenize(faq.answer));

  let score = 0;
  for (const token of new Set(queryTokens)) {
    if (questionTokens.has(token)) score += QUESTION_WEIGHT * weight(token);
    else if (answerTokens.has(token)) score += ANSWER_WEIGHT * weight(token);
  }

  if (queryTopics.length > 0) {
    const faqTopics = detectTopics(faq.question);
    if (queryTopics.some((topic) => faqTopics.includes(topic))) score += TOPIC_BONUS;
  }

  return score;
}

export interface RankedFaq {
  faq: Faq;
  score: number;
}

/**
 * Rank FAQs by topic-aligned lexical overlap.
 *
 * When the query names a topic this scheme's FAQs recognise (documents, hours,
 * deadline, ...), only FAQs about one of those topics are considered. If the query
 * is squarely about a topic the scheme does not cover at all (e.g. "counter hours?"
 * where no hours FAQ exists), we return nothing so the caller answers "not covered"
 * — a plausible-but-wrong answer is worse than an honest gap.
 */
export function rankFaqs(faqs: Faq[], query: string, limit = 3): RankedFaq[] {
  const queryTokens = tokenize(query);
  const queryTopics = detectTopics(query);

  let candidates = faqs;
  if (queryTopics.length > 0) {
    const aligned = faqs.filter((faq) => {
      const topics = detectTopics(faq.question);
      return queryTopics.some((topic) => topics.includes(topic));
    });
    if (aligned.length === 0) return [];
    candidates = aligned;
  }

  const idf = idfByToken(faqs);
  const scored = candidates
    .map((faq) => ({ faq, score: scoreFaq(faq, queryTokens, idf, queryTopics) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.faq.displayOrder - b.faq.displayOrder;
    });

  if (scored.length === 0) return [];
  const best = scored[0].score;
  return scored
    .filter((r) => r.score >= best * MIN_RELATIVE_SCORE)
    .slice(0, Math.max(0, limit));
}

function references(ranked: RankedFaq[]): FaqReference[] {
  return ranked.map((r) => ({ id: r.faq.id, question: r.faq.question }));
}

/**
 * Build a grounded answer from maintained FAQ rows only.
 * Extractive by design: the returned text is the top FAQ's stored answer, so the
 * service can never invent eligibility criteria. If nothing matches, it says so
 * and points at the official scheme page.
 */
export function buildGroundedAnswer(
  faqs: Faq[],
  query: string,
  officialUrl: string | null
): GroundedAnswer {
  const ranked = rankFaqs(faqs, query, 3);

  if (ranked.length === 0) {
    return {
      answered: false,
      answer:
        "No maintained FAQ entry matches that question yet. Please check the scheme's official page, or ask at the ward office before you travel.",
      references: [],
      officialUrl,
      guidance: GUIDANCE_TEXT
    };
  }

  return {
    answered: true,
    answer: ranked[0].faq.answer,
    references: references(ranked),
    officialUrl,
    guidance: GUIDANCE_TEXT
  };
}