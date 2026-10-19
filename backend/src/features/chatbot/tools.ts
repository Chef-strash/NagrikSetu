// The three tools the answering LLM may call after a scheme is selected:
//   faq_lookup      - maintained (official) FAQs for THIS scheme
//   reviews_lookup  - citizen reviews for THIS scheme, filtered by the citizen's location
//   web_search      - general web lookup (optional provider)
//
// Every tool is scoped to the selected scheme, so the LLM can never pull facts for
// a different scheme.

import type { ToolExecutor, ToolSpec } from "../../core/tool-agent.ts";
import { webSearchText } from "../../core/web-search.ts";
import { getFaqs, getReviews, locationsMatch } from "../feedback/service.ts";
import { rankFaqs } from "../feedback/answer.ts";

export interface SchemeToolOptions {
  schemeSlug: string;
  location: string | null;
  lang: string | null;
  /** Renders the saved zero-PII document audit (audit_status tool). */
  auditStatus?: () => string;
}

/** Top reviews: location matches first, then scheme-wide, each by helpful_count. */
export function pickTopReviews<T extends { counter: string | null; helpfulCount: number }>(
  reviews: T[],
  location: string | null,
  max = 3
): { picked: T[]; locationMatched: boolean } {
  const byHelpful = (a: T, b: T) => b.helpfulCount - a.helpfulCount;
  const matched = location
    ? reviews.filter((r) => locationsMatch(location, r.counter)).sort(byHelpful)
    : [];
  if (matched.length > 0) return { picked: matched.slice(0, max), locationMatched: true };
  return { picked: [...reviews].sort(byHelpful).slice(0, max), locationMatched: false };
}

export function buildSchemeToolSpecs(): ToolSpec[] {
  return [
    {
      name: "faq_lookup",
      description:
        "Look up the maintained, official FAQs for this scheme. Use this FIRST for any scheme-information question (documents, benefit, deadline, eligibility, where to apply).",
      parameters: { query: "the citizen's question, used to match FAQs" }
    },
    {
      name: "reviews_lookup",
      description:
        "Look up citizen-reported counter reviews for this scheme, filtered to the citizen's location. Use for practical, on-the-ground tips (photocopies, clerk demands, timings).",
      parameters: {}
    },
    {
      name: "audit_status",
      description:
        "Read the citizen's saved document-audit result (which documents are uploaded, missing, or need review). Use for any question about their documents or checklist.",
      parameters: {}
    },
    {
      name: "web_search",
      description:
        "Search the web for general background not covered by the FAQs. Do NOT use it as the source of scheme amounts, deadlines, or eligibility.",
      parameters: { query: "search terms" }
    }
  ];
}

export function buildSchemeToolExecutor(options: SchemeToolOptions): ToolExecutor {
  return async (name, args) => {
    if (name === "faq_lookup") {
      const query = String(args.query ?? "").trim();
      const list = await getFaqs(options.schemeSlug, options.lang);
      const ranked = rankFaqs(list.faqs, query, 4);
      if (ranked.length === 0) {
        return "No maintained FAQ matches that question for this scheme.";
      }
      return ranked
        .map((r) => `Q: ${r.faq.question}\nA: ${r.faq.answer}`)
        .join("\n\n");
    }

    if (name === "reviews_lookup") {
      const list = await getReviews(options.schemeSlug, 20);
      const { picked, locationMatched } = pickTopReviews(list.reviews, options.location, 3);
      if (picked.length === 0) return "No citizen reviews exist for this scheme yet.";
      const note = locationMatched
        ? ""
        : "(No reviews at the citizen's location; these are scheme-wide reports.)\n";
      return (
        note +
        picked
          .map((r) => `[${r.counter ?? "unknown counter"}] ${r.text} (helpful ${r.helpfulCount})`)
          .join("\n")
      );
    }

    if (name === "audit_status") {
      return options.auditStatus ? options.auditStatus() : "No document audit has been run in this session.";
    }

    if (name === "web_search") {
      return webSearchText(String(args.query ?? ""));
    }

    return `Unknown tool: ${name}`;
  };
}