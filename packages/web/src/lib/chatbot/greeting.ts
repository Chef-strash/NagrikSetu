// Builds the assistant's copy for the application page:
//  - buildCandidatePrompt  : the "here are your matches, pick one" opener
//  - buildSelectionMessage : the post-choice eligibility summary (no greeting)
// Both are pure so they are directly unit-testable.

import type { ChatEligibilityCheck, ChatScheme } from "./api";

const VERDICT_LABEL: Record<string, string> = {
  likely_eligible: "Likely eligible",
  not_eligible: "Probably not eligible",
  need_more_info: "Need a few more details"
};

export interface SelectionMessageInput {
  scheme: ChatScheme;
  eligibility?: ChatEligibilityCheck | null;
  /** Counter details live in the web Scheme catalog (the backend has no counter data). */
  counter?: { office: string; desk: string; hours: string } | null;
  documentCount?: number;
}

/**
 * Follow-up shown AFTER the citizen picks a scheme.
 *
 * Deliberately has no greeting and does not repeat the query: the citizen's own
 * message and the candidate prompt are already in the thread above, so another
 * "Hello ..." would read as the start of a second conversation.
 */
export function buildSelectionMessage(input: SelectionMessageInput): string {
  const { scheme, eligibility, counter, documentCount } = input;
  const paragraphs: string[] = [];

  paragraphs.push(
    `You selected the ${scheme.name}${scheme.benefitAmount ? ` (${scheme.benefitAmount})` : ""}.`
  );

  if (eligibility) {
    const label = VERDICT_LABEL[eligibility.verdict] ?? eligibility.verdict;
    const bullets =
      eligibility.quotedLines.length > 0 ? eligibility.quotedLines : eligibility.reasons;
    paragraphs.push(
      bullets.length > 0 ? [label + ".", ...bullets.map((line) => `- ${line}`)].join("\n") : `${label}.`
    );
  }

  if (eligibility && eligibility.missingInfo.length > 0) {
    const asks =
      eligibility.questions.length > 0
        ? eligibility.questions
        : eligibility.missingInfo.map((key) => `your ${key.replace(/([A-Z])/g, " $1").toLowerCase()}`);
    paragraphs.push(`Still needed: ${asks.join(" ")}`);
  }

  if (counter) {
    paragraphs.push(
      `Submit in person at ${counter.office}, ${counter.desk} (${counter.hours}). ` +
        `Upload your documents on the right and click Check to verify bank details` +
        `${documentCount ? ` for all ${documentCount} requirements` : ""} before visiting the counter.`
    );
  }

  paragraphs.push(
    "This is guidance from the scheme's official eligibility text, not an official decision. Confirm at the ward counter."
  );

  return paragraphs.join("\n\n");
}

export interface CandidatePromptInput {
  citizenName: string;
  query: string;
  candidates: Array<{ name: string; benefitAmount?: string | null }>;
}

/**
 * Opening message for a session that still needs the citizen to pick a scheme.
 * The document checklist stays hidden until they choose.
 */
export function buildCandidatePrompt(input: CandidatePromptInput): string {
  const name = input.citizenName?.trim() || "Citizen";
  const { candidates, query } = input;

  if (candidates.length === 0) {
    return `Hello ${name}. I could not match "${query}" to a listed PMC scheme yet. Try rephrasing, or browse the full scheme list.`;
  }

  const list = candidates
    .map(
      (candidate, index) =>
        `${index + 1}. ${candidate.name}${candidate.benefitAmount ? ` (${candidate.benefitAmount})` : ""}`
    )
    .join("\n");

  return [
    `Hello ${name}. From your request - "${query}" - I found ${candidates.length} PMC scheme${
      candidates.length === 1 ? "" : "s"
    } that may fit:`,
    list,
    `Choose the scheme you need on the right. I will then check your eligibility against its official rules and list the exact documents required.`
  ].join("\n\n");
}