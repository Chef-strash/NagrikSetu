// Shared types for the read-only citizen feedback system.
// FAQs are maintained records (`scheme_faqs`); reviews are existing,
// moderator-approved rows in `peer_intel_reviews`. Neither portal writes.

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
  helpfulCount: number;
  createdAt: string | null;
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

export interface SchemeFeedbackBundle {
  schemeSlug: string;
  schemeName: string;
  officialUrl: string | null;
  faqs: Faq[];
  reviews: SchemeReview[];
}

