// LLM FAQ answering: FAQ-first, general-intelligence fallback, plus location-matched reviews.
//
// Answer policy (per the product rule):
//   1. If the maintained FAQs cover the question -> answer ONLY from those FAQs.
//   2. If no FAQ covers it -> fall back to the model's general knowledge.
//   3. Citizen reviews for THE SAME scheme may be included, but only those whose
//      location matches the citizen's location.
//
// When no LLM provider is configured (or the call fails) this returns null and the
// caller falls back to the extractive answer, so the API never depends on the network.

import { isLlmConfigured, llmComplete, type LlmMessage } from "../../core/llm.ts";
import type { AnswerReviewRef, Faq } from "./types.ts";

export type AnswerMode = "faq_only" | "general";

export interface LlmAnswerContext {
  schemeName: string;
  benefitAmount: string | null;
  eligibilityText: string;
  requiredDocuments: string[];
  officialUrl: string | null;
  question: string;
  language: string | null;
  /** "faq_only" = strict FAQ grounding; "general" = FAQs lack the answer. */
  mode: AnswerMode;
  /** Retrieved maintained FAQs (source of truth when present). */
  faqs: Faq[];
  /** Location-matched citizen reviews for the same scheme (may be empty). */
  reviews: AnswerReviewRef[];
  /** The citizen's ward/ULB, used to match reviews. */
  location: string | null;
  /** Prior turns as real chat messages (oldest first). */
  history?: LlmMessage[];
  /** Compact session context block (scheme, facts, verdict, audit, language). */
  sessionContext?: string;
}

export type TextCompleter = (messages: LlmMessage[]) => Promise<string>;

export interface AnswerFaqWithLlmOptions {
  /** Inject a completer (tests). Otherwise the real client is used if configured. */
  complete?: TextCompleter;
}

const FAQ_ONLY_SYSTEM = `You are NagrikSetu's citizen help assistant for Pune municipal welfare schemes.
Answer the citizen's question about ONE scheme.

The MAINTAINED FAQs below are the ONLY source you may use for this answer. Do not add outside
knowledge, opinions, or general facts. If the FAQs do not fully answer the question, say so plainly
and point the citizen to the official link — do not guess.

Style: 1-3 short sentences, plain language, no markdown, no bullet lists. Do not mention that you
are an AI or refer to "the FAQs". ALWAYS write in the requested session language (en/hi/mr, default English).`;

const GENERAL_SYSTEM = `You are NagrikSetu's citizen help assistant for Pune municipal welfare schemes.
Answer the citizen's question about ONE scheme.

The maintained FAQs do not cover this question, so you may use your general knowledge of Indian
municipal welfare schemes and the citizen REVIEWS below. Still, you MUST NOT invent scheme-specific
figures or rules — amounts, deadlines, eligibility criteria, required documents, or addresses. If a
specific figure is needed and is not in the scheme fields below, say it is not published and point
to the official link.

Treat reviews as citizen-reported experiences, not official policy. If a review conflicts with the
scheme fields, prefer the scheme fields.

Style: 1-3 short sentences, plain language, no markdown, no bullet lists. Do not mention that you
are an AI. ALWAYS write in the requested session language (en/hi/mr, default English).`;

function faqBlock(faqs: Faq[]): string {
  if (faqs.length === 0) return "(no maintained FAQs available)";
  return faqs.map((f, i) => `Q${i + 1}: ${f.question}\nA${i + 1}: ${f.answer}`).join("\n\n");
}

function reviewBlock(reviews: AnswerReviewRef[], location: string | null): string {
  if (reviews.length === 0) {
    return location
      ? "(no citizen reviews for this scheme at your location)"
      : "(no location provided, so no reviews were matched)";
  }
  return reviews
    .map(
      (r, i) =>
        `R${i + 1}${r.counter ? ` [${r.counter}]` : ""} (helpful ${r.helpfulCount}): ${r.text}`
    )
    .join("\n");
}

export function buildSystemPrompt(context: LlmAnswerContext): string {
  const base = context.mode === "faq_only" ? FAQ_ONLY_SYSTEM : GENERAL_SYSTEM;
  return context.sessionContext ? `${base}\n\n${context.sessionContext}` : base;
}

export function buildUserPrompt(context: LlmAnswerContext): string {
  const docs =
    context.requiredDocuments.length > 0 ? context.requiredDocuments.join("; ") : "(not listed)";

  return [
    `Scheme: ${context.schemeName}`,
    `Benefit: ${context.benefitAmount ?? "(not published)"}`,
    `Official link: ${context.officialUrl ?? "(none)"}`,
    `Eligibility (official text): ${context.eligibilityText || "(not published)"}`,
    `Required documents: ${docs}`,
    "",
    "MAINTAINED FAQs (official scheme information):",
    faqBlock(context.faqs),
    "",
    `CITIZEN REVIEWS (scheme-scoped, location "${context.location ?? "unknown"}"):`,
    reviewBlock(context.reviews, context.location),
    "",
    `Citizen question: ${context.question}`,
    `Respond in language: ${context.language ?? "en"}`,
    "",
    "Answer:"
  ].join("\n");
}

export function buildAnswerMessages(context: LlmAnswerContext): LlmMessage[] {
  return [
    { role: "system", content: buildSystemPrompt(context) },
    ...(context.history ?? []).filter((m) => m.role !== "system"),
    { role: "user", content: buildUserPrompt(context) }
  ];
}

/** Returns the LLM's grounded answer, or null when unavailable/failed. */
export async function answerFaqWithLlm(
  context: LlmAnswerContext,
  options: AnswerFaqWithLlmOptions = {}
): Promise<string | null> {
  const completer: TextCompleter | null =
    options.complete ??
    (isLlmConfigured()
      ? (messages) => llmComplete(messages, { temperature: 0.2, maxTokens: 400 })
      : null);

  if (!completer) return null;

  try {
    const text = await completer(buildAnswerMessages(context));
    const trimmed = text.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}