// Browser-side client for the NagrikSetu chatbot (query decomposition) API.
//
// The browser always talks to the SAME-ORIGIN Next.js proxy routes under
// `/api/v1/chatbot/...`, which forward to the Layer-2 backend. This keeps the
// backend URL server-side and lets us fail gracefully when it is offline.

export type EligibilityVerdict = "likely_eligible" | "not_eligible" | "need_more_info";

export interface ChatScheme {
  id: string;
  slug: string;
  name: string;
  vernacularName: string | null;
  category: string;
  categoryLabel: string;
  pillar: string;
  description: string;
  benefitAmount: string | null;
  benefitType: string | null;
  deadline: string | null;
  cutoff: string | null;
  incomeLimit: number | null;
  domicileYears: number | null;
  eligibilityText: string;
  officialFormUrl: string | null;
  requiredDocuments: string[];
}

export interface ChatAssessment {
  verdict: "likely_match" | "possible_match" | "not_enough_information";
  reasons: string[];
  missingFacts: string[];
}

export interface ChatSchemeMatch {
  scheme: ChatScheme;
  score: number;
  reasons: string[];
  assessment: ChatAssessment;
}

export interface ChatLocation {
  explicitlyStated: string | null;
  profileWard: string | null;
  resolvedUlbCode: string | null;
}

export interface ChatDecomposition {
  intent: string;
  schemeQuery: string | null;
  schemeCategory: string | null;
  pillar: string | null;
  semanticQuery: string | null;
  applicantFacts: Record<string, unknown>;
  unknownFacts: string[];
  location: ChatLocation;
  rawQuery: string;
}

export interface ChatEligibilityCheck {
  verdict: EligibilityVerdict;
  reasons: string[];
  /** Exact lines from the scheme's official eligibility text. */
  quotedLines: string[];
  missingInfo: string[];
  questions: string[];
  source: "llm" | "rules";
}

export interface ChatSessionResponse {
  sessionId: string;
  decomposition: ChatDecomposition;
  decompositionSource: "llm" | "rules";
  schemes: ChatSchemeMatch[];
  selectedSlug: string | null;
  followUpQuestions: string[];
}

export interface ChatSelectionResponse {
  sessionId: string;
  selectedSlug: string;
  scheme: ChatScheme;
  faqs: unknown[];
  eligibility: ChatEligibilityCheck;
}

/** Thrown when the decomposition service cannot be reached or rejects the query. */
export class ChatbotApiError extends Error {
  readonly status: number;
  /** True when the backend itself was unreachable (offline fallback territory). */
  readonly offline: boolean;

  constructor(message: string, status: number, offline = false) {
    super(message);
    this.name = "ChatbotApiError";
    this.status = status;
    this.offline = offline;
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch {
    throw new ChatbotApiError("Could not reach the scheme assistant.", 0, true);
  }

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof data.error === "string" ? data.error : `Request failed (${res.status}).`;
    throw new ChatbotApiError(message, res.status, data.offline === true);
  }
  return data as T;
}

import type { ChatProfile } from "./profile.ts";

export type Language = "en" | "mr";

export interface StartSessionInput {
  query: string;
  lang?: Language;
  profileWard?: string | null;
  /** Coarse eligibility facts from the signed-in profile (see profile.ts). */
  profile?: ChatProfile;
  /** Prior turns to replay when recreating a session (backend may ignore). */
  history?: Array<{ role: "user" | "assistant"; text: string }>;
}

/** Decompose the citizen's free-text query once and rank candidate schemes. */
export function startChatSession(input: StartSessionInput): Promise<ChatSessionResponse> {
  return postJson<ChatSessionResponse>("/api/v1/chatbot/session", {
    query: input.query,
    lang: input.lang ?? "en",
    profileWard: input.profileWard ?? null,
    ...(input.profile ? { profile: input.profile } : {}),
    ...(input.history && input.history.length > 0 ? { history: input.history } : {})
  });
}

/** Select a candidate scheme and get its eligibility check + published FAQs. */
export function selectChatScheme(
  sessionId: string,
  schemeSlug: string,
  lang: Language = "en"
): Promise<ChatSelectionResponse> {
  return postJson<ChatSelectionResponse>(
    `/api/v1/chatbot/session/${encodeURIComponent(sessionId)}/select`,
    { schemeSlug, lang }
  );
}

export interface ChatFaqReference {
  id: string;
  question: string;
}

export interface ChatFaqAnswer {
  answered: boolean;
  answer: string;
  references: ChatFaqReference[];
  officialUrl: string | null;
  /** Always-present reminder that this is guidance, not a binding decision. */
  guidance: string;
}

export interface ChatReviewRef {
  id: string;
  text: string;
  counter: string | null;
  helpfulCount: number;
}

export type AnswerSource = "faq" | "review" | "general" | "none" | "tools";

/** Reply to a message sent inside the selected-scheme session. */
export interface ChatMessageResponse {
  sessionId: string;
  selectedSlug: string | null;
  forcedIntent: boolean;
  kind: "schemes" | "faq_answer" | "other";
  message: string;
  faq: ChatFaqAnswer | null;
  answerSource: AnswerSource;
  reviews: ChatReviewRef[];
  eligibility: ChatEligibilityCheck | null;
}

/**
 * Ask a question about the SELECTED scheme. The backend locks the session to that
 * scheme and answers from its maintained FAQs (falling back to general guidance).
 */
export function sendChatMessage(
  sessionId: string,
  text: string,
  lang: Language = "en",
  profile?: ChatProfile
): Promise<ChatMessageResponse> {
  return postJson<ChatMessageResponse>(
    `/api/v1/chatbot/session/${encodeURIComponent(sessionId)}/message`,
    { text, lang, ...(profile ? { profile } : {}) }
  );
}