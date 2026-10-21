// Tests for LLM FAQ answering (with an injected fake completer).

import test from "node:test";
import assert from "node:assert/strict";
import {
  answerFaqWithLlm,
  buildAnswerMessages,
  buildSystemPrompt,
  type LlmAnswerContext
} from "../../src/features/feedback/answer-llm.ts";

const CONTEXT: LlmAnswerContext = {
  schemeName: "Lokshahir Annabhau Sathe Educational Assistance Scheme",
  benefitAmount: "Rs. 25,000",
  eligibilityText: "Passed Class 12 (HSC) and admitted to a degree course.",
  requiredDocuments: ["Attested copy of Class 12 (HSC) Marksheet"],
  officialUrl: "https://dbt.pmc.gov.in/forms/annabhau_sathe_hsc.pdf",
  question: "which documents are required?",
  language: "en",
  mode: "faq_only",
  location: null,
  reviews: [],
  faqs: [
    {
      id: "f1",
      schemeId: "s1",
      question: "Which documents are required?",
      answer: "Marksheet and income certificate.",
      languageCode: "en",
      displayOrder: 1,
      publishedAt: null
    }
  ]
};

test("returns the trimmed LLM answer when a completer is provided", async () => {
  const answer = await answerFaqWithLlm(CONTEXT, {
    complete: async () => "  Bring your Class 12 marksheet and income certificate.  "
  });
  assert.equal(answer, "Bring your Class 12 marksheet and income certificate.");
});

test("returns null when the LLM throws so the caller can fall back", async () => {
  const answer = await answerFaqWithLlm(CONTEXT, {
    complete: async () => {
      throw new Error("provider down");
    }
  });
  assert.equal(answer, null);
});

test("the prompt grounds the model in the maintained FAQs", () => {
  const messages = buildAnswerMessages(CONTEXT);
  assert.equal(messages[0].role, "system");
  assert.match(messages[1].content, /Which documents are required\?/);
  assert.match(messages[1].content, /Attested copy of Class 12/);
});

test("faq_only uses the strict prompt; general uses the fallback prompt", () => {
  const strict = buildSystemPrompt({ ...CONTEXT, mode: "faq_only" });
  const general = buildSystemPrompt({ ...CONTEXT, mode: "general" });
  assert.match(strict, /ONLY source you may use/i);
  assert.match(general, /may use your general knowledge/i);
  assert.notEqual(strict, general);
});

test("location-matched reviews are included in the prompt, labelled as reviews", () => {
  const messages = buildAnswerMessages({
    ...CONTEXT,
    mode: "general",
    location: "Ward 14: Kothrud",
    reviews: [{ id: "r1", text: "Clerk asked for 2 photos.", counter: "Kothrud Ward 14, Counter 3", helpfulCount: 9 }]
  });
  assert.match(messages[1].content, /CITIZEN REVIEWS/);
  assert.match(messages[1].content, /Clerk asked for 2 photos/);
  assert.match(messages[1].content, /Kothrud Ward 14, Counter 3/);
});