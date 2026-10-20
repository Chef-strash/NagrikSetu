// Shared types for the feedback feature.
// Response field names are camelCase to match the contract already used by the
// web app (`packages/web/src/app/api/v1/...`), so clients can switch between the
// Next.js routes and this service without changes.

export interface Faq {
  id: string;
  schemeId: string;
  question: string;
  answer: string;
  languageCode: string;
  displayOrder: number;
  publishedAt: string | null;
}

export interface SchemeReview {
  id: string;
  schemeId: string;
  /** Review body. The DB column is `tip`; exposed here as neutral text. */
  text: string;
  frictionTag: string | null;
  severityLevel: string | null;
  /** Counter/ward the reviewer visited, e.g. "Kothrud Ward 14, Counter 3". */
  counter: string | null;
  helpfulCount: number;
  createdAt: string | null;
}

/** A citizen review used to help answer a question (location-matched). */
export interface AnswerReviewRef {
  id: string;
  text: string;
  counter: string | null;
  helpfulCount: number;
}

export interface FaqReference {
  id: string;
  question: string;
}

export interface GroundedAnswer {
  answered: boolean;
  answer: string;
  references: FaqReference[];
  /** Official scheme/form page, when the scheme row publishes one. */
  officialUrl: string | null;
  /** Always-present reminder that this is guidance, not a binding decision. */
  guidance: string;
}

export interface SchemeBrief {
  slug: string;
  name: string;
}

export interface FaqListResponse {
  scheme: SchemeBrief | null;
  language: string;
  count: number;
  faqs: Faq[];
}

export interface ReviewListResponse {
  scheme: SchemeBrief | null;
  count: number;
  reviews: SchemeReview[];
}

export interface FaqAnswerResponse extends GroundedAnswer {
  scheme: SchemeBrief | null;
  language: string;
  /** Which source produced the answer (auditable). */
  answerSource: "faq" | "review" | "general" | "none";
  /** Location-matched citizen reviews used for this answer. */
  reviews: AnswerReviewRef[];
  /** True when the request carried a location used to match reviews. */
  locationMatched: boolean;
}