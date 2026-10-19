// Types for the chatbot feature.
//
// Flow: free-text query -> decomposition (structured search object) -> scheme
// retrieval (structured + lexical; no embeddings available) -> per-scheme
// assessment -> optional FAQ answer for a named scheme.

import type { SchemeRecord } from "../../core/schemes.ts";
import type { ToolStep } from "../../core/tool-agent.ts";
import type { AnswerReviewRef, Faq } from "../feedback/types.ts";

/** Where an answer came from (auditable). */
export type AnswerSource = "faq" | "review" | "general" | "none" | "tools";

export type ChatIntent = "DISCOVER_SCHEMES" | "ASK_SCHEME_INFO" | "SCHEME_DETAIL" | "OTHER";

export type ApplicantCategory = "SC" | "ST" | "OBC" | "VJNT" | "EWS" | "OPEN";
export type ClassLevel = "10TH_PASS" | "12TH_PASS" | "GRADUATE";
export type Gender = "female" | "male" | "other";

export interface ApplicantFacts {
  age: number | null;
  gender: Gender | null;
  category: ApplicantCategory | null;
  /** Annual household income in INR. */
  income: number | null;
  domicileYears: number | null;
  classLevel: ClassLevel | null;
  courseType: string | null;
  marksPercent: number | null;
  disabilityPercent: number | null;
  isOrphan: boolean | null;
  isStreetVendor: boolean | null;
}

export const EMPTY_FACTS: ApplicantFacts = {
  age: null,
  gender: null,
  category: null,
  income: null,
  domicileYears: null,
  classLevel: null,
  courseType: null,
  marksPercent: null,
  disabilityPercent: null,
  isOrphan: null,
  isStreetVendor: null
};

export interface LocationContext {
  explicitlyStated: string | null;
  profileWard: string | null;
  resolvedUlbCode: string | null;
}

export interface QueryDecomposition {
  intent: ChatIntent;
  /** Matched scheme slug when the user names a scheme (else null). */
  schemeQuery: string | null;
  /** Validated against the categories that actually exist in the catalog. */
  schemeCategory: string | null;
  pillar: string | null;
  /** The user's "need", with demographic facts stripped out. */
  semanticQuery: string | null;
  applicantFacts: ApplicantFacts;
  unknownFacts: string[];
  location: LocationContext;
  rawQuery: string;
}

export interface Assessment {
  verdict: "likely_match" | "possible_match" | "not_enough_information";
  reasons: string[];
  missingFacts: string[];
}

export type EligibilityVerdict = "likely_eligible" | "not_eligible" | "need_more_info";

/** Result of checking one scheme's requirements against the citizen's facts. */
export interface EligibilityCheck {
  verdict: EligibilityVerdict;
  reasons: string[];
  /** Exact lines from `eligibility_text` the verdict relied on. */
  quotedLines: string[];
  /** Fact keys still needed to decide. */
  missingInfo: string[];
  /** Clarifying questions to ask the citizen. */
  questions: string[];
  source: "llm" | "rules";
}

export interface SchemeMatch {
  scheme: SchemeRecord;
  score: number;
  reasons: string[];
  assessment: Assessment;
}

export interface FaqAnswerView {
  answered: boolean;
  answer: string;
  references: Array<{ id: string; question: string }>;
  officialUrl: string | null;
  guidance: string;
}

export interface ChatResponse {
  kind: "schemes" | "faq_answer" | "scheme_detail" | "other";
  message: string;
  decomposition: QueryDecomposition;
  schemes: SchemeMatch[];
  faq: FaqAnswerView | null;
  followUpQuestions: string[];
}

// --- Session-based flow -----------------------------------------------------
// The decomposition runs ONCE when the session starts; later steps reuse it.

export interface SessionHistoryEntry {
  question: string;
  answered: boolean;
  at: number;
}

export type SessionLang = "en" | "hi" | "mr";
export type AuditDocStatus = "UPLOADED" | "MISSING" | "NEEDS_REVIEW";

/** Zero-PII audit result: labels and statuses only, never field values. */
export interface AuditState {
  documents: Array<{
    name: string;
    status: AuditDocStatus;
    rows: Array<{ label: string; status: string; reason: string }>;
  }>;
  summary: string | null;
  savedAt: number;
}

export interface SessionProfile {
  ward: string | null;
  category: string | null;
  rationCard: string | null;
  disabilityStatus: string | null;
  dbtEnabled: boolean | null;
  incomeBand: string | null;
}

export interface SessionTurn {
  user: string;
  assistant: string;
  at: number;
}

export interface ChatSessionState {
  decomposition: QueryDecomposition;
  decompositionSource: "llm" | "rules";
  matches: SchemeMatch[];
  selectedSlug: string | null;
  /** Accumulated applicant facts (decomposition + later answers). */
  facts: ApplicantFacts;
  /** Citizen location (ward/ULB) used to match reviews. */
  location: string | null;
  history: SessionHistoryEntry[];
  /** Full turns (user text + assistant reply), capped. */
  turns: SessionTurn[];
  /** Deterministic rolling summary of turns older than the message window. */
  summary: string;
  lang: SessionLang;
  profile: SessionProfile | null;
  /** Latest eligibility verdict for the selected scheme. */
  verdict: EligibilityCheck | null;
  audit: AuditState | null;
  /** Post-audit reviews (max 3). */
  tips: AnswerReviewRef[];
}

export interface ChatSessionView {
  sessionId: string;
  decomposition: QueryDecomposition;
  decompositionSource: "llm" | "rules";
  schemes: SchemeMatch[];
  selectedSlug: string | null;
  followUpQuestions: string[];
  history: SessionHistoryEntry[];
  turns: SessionTurn[];
  lang: SessionLang;
  verdict: EligibilityCheck | null;
  audit: AuditState | null;
  tips: AnswerReviewRef[];
}

export interface SelectedSchemeView {
  sessionId: string;
  selectedSlug: string;
  scheme: SchemeRecord;
  faqs: Faq[];
  eligibility: EligibilityCheck;
} 

export interface ChatAnswerView {
  sessionId: string;
  schemeSlug: string;
  faq: FaqAnswerView;
  answerSource: AnswerSource;
  reviews: AnswerReviewRef[];
  toolSteps: ToolStep[];
}

/**
 * Unified reply for a message sent inside a session.
 * The "selected scheme" rule: when `selectedSlug` is set, `forcedIntent` is true
 * and every message is answered as scheme-info about that scheme.
 */
export interface SessionMessageView {
  sessionId: string;
  selectedSlug: string | null;
  forcedIntent: boolean;
  decomposition: QueryDecomposition;
  kind: "schemes" | "faq_answer" | "other";
  message: string;
  faq: FaqAnswerView | null;
  schemes: SchemeMatch[];
  followUpQuestions: string[];
  answerSource: AnswerSource;
  reviews: AnswerReviewRef[];
  /** Re-checked eligibility for the selected scheme (null before selection). */
  eligibility: EligibilityCheck | null;
  /** Tool calls the answering LLM made (faq_lookup / reviews_lookup / web_search). */
  toolSteps: ToolStep[];
  tips: AnswerReviewRef[];
}