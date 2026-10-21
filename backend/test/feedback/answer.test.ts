// Unit tests for the pure FAQ retrieval logic (ports of the web app's tests).

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGroundedAnswer,
  detectTopics,
  languageFallbacks,
  normalizeLang,
  rankFaqs,
  selectByLanguage,
  tokenize,
  type RankedFaq
} from "../../src/features/feedback/answer.ts";
import type { Faq } from "../../src/features/feedback/types.ts";

function faq(question: string, answer: string, extra: Partial<Faq> = {}): Faq {
  return {
    id: extra.id ?? "f1",
    schemeId: extra.schemeId ?? "s1",
    question,
    answer,
    languageCode: extra.languageCode ?? "en",
    displayOrder: extra.displayOrder ?? 0,
    publishedAt: extra.publishedAt ?? null
  };
}

const FAQS: Faq[] = [
  faq("Who is eligible?", "Minimum 80% marks in Class 10 and resident within Pune.", {
    id: "elig",
    displayOrder: 1
  }),
  faq("How much is the benefit?", "Rs. 15,000 paid by Direct Bank Transfer.", {
    id: "money",
    displayOrder: 2
  }),
  faq("Which documents are required?", "Marksheet, income certificate and bank passbook.", {
    id: "docs",
    displayOrder: 3
  }),
  faq("पात्रता कोणाला आहे?", "किमान 80% गुण.", { id: "mr1", languageCode: "mr", displayOrder: 1 })
];

test("tokenize drops stopwords and keeps meaningful tokens", () => {
  const tokens = tokenize("What are the documents I need for this scheme?");
  assert.ok(tokens.includes("documents"));
  assert.ok(!tokens.includes("the"));
  assert.ok(!tokens.includes("what"));
});

test("tokenize keeps Devanagari words intact", () => {
  assert.ok(tokenize("पात्रता कोणाला आहे?").includes("पात्रता"));
});

test("languageFallbacks keeps requested language then english", () => {
  assert.deepEqual(languageFallbacks("mr"), ["mr", "en"]);
  assert.deepEqual(languageFallbacks("en"), ["en"]);
  assert.deepEqual(languageFallbacks(null), ["en"]);
});

test("normalizeLang falls back to en for junk input", () => {
  assert.equal(normalizeLang("EN"), "en");
  assert.equal(normalizeLang("mr"), "mr");
  assert.equal(normalizeLang("<script>"), "en");
});

test("selectByLanguage prefers the requested language but keeps english", () => {
  const selected = selectByLanguage(FAQS, "mr");
  assert.equal(selected[0].languageCode, "mr");
  assert.ok(selected.some((f) => f.languageCode === "en"));
});

test("rankFaqs matches the most relevant FAQ and ignores unrelated queries", () => {
  const ranked: RankedFaq[] = rankFaqs(FAQS, "which documents are required", 3);
  assert.equal(ranked[0].faq.id, "docs");
  assert.deepEqual(rankFaqs(FAQS, "weather in london", 3), []);
});

// --- topic-aligned ranking ---------------------------------------------------
// The regression this guards: asking about "counter hours" used to return the
// SUBMISSION LOCATION FAQ, because its answer text happens to contain "Counter No. 3".

const SCHEME_FAQS: Faq[] = [
  faq("Who is eligible?", "Minimum 80% marks and resident within Pune.", { id: "elig", displayOrder: 1 }),
  faq("Which documents are required?", "Marksheet, income certificate and bank passbook.", { id: "docs", displayOrder: 2 }),
  faq("Where do I submit the application?", "Submit at Kothrud Ward Office No. 14, Counter No. 3.", {
    id: "submit",
    displayOrder: 3
  })
];

const WITH_HOURS: Faq[] = [
  ...SCHEME_FAQS,
  faq("What are the counter hours?", "Monday to Friday, 10:30 AM to 03:30 PM.", { id: "hours", displayOrder: 4 })
];

test("detectTopics recognises the topic a citizen is asking about", () => {
  assert.deepEqual(detectTopics("counter hours?"), ["hours"]);
  assert.deepEqual(detectTopics("what are the timings"), ["hours"]);
  assert.deepEqual(detectTopics("where do I submit"), ["location"]);
  assert.deepEqual(detectTopics("which documents are required"), ["documents"]);
  assert.deepEqual(detectTopics("what is the deadline"), ["deadline"]);
  assert.deepEqual(detectTopics("weather in london"), []);
});

test("a topic this scheme does not cover returns nothing instead of a wrong FAQ", () => {
  // No hours FAQ exists -> an honest "not covered", never the location answer.
  assert.deepEqual(rankFaqs(SCHEME_FAQS, "counter hours?", 3), []);
});

test("an hours question picks the hours FAQ, not the one mentioning 'counter'", () => {
  const ranked = rankFaqs(WITH_HOURS, "counter hours?", 3);
  assert.equal(ranked[0].faq.id, "hours");
});

test("topic alignment still routes the covered questions correctly", () => {
  assert.equal(rankFaqs(SCHEME_FAQS, "where do I submit the application", 3)[0].faq.id, "submit");
  assert.equal(rankFaqs(SCHEME_FAQS, "which documents are required", 3)[0].faq.id, "docs");
  assert.equal(rankFaqs(SCHEME_FAQS, "who is eligible", 3)[0].faq.id, "elig");
});

test("buildGroundedAnswer returns the top FAQ answer verbatim with references", () => {
  const result = buildGroundedAnswer(
    FAQS,
    "how much money do I get",
    "https://example.gov.in/form.pdf"
  );
  assert.equal(result.answered, true);
  assert.equal(result.answer, "Rs. 15,000 paid by Direct Bank Transfer.");
  assert.equal(result.references[0].id, "money");
  assert.equal(result.officialUrl, "https://example.gov.in/form.pdf");
  assert.ok(result.guidance.length > 0);
});

test("buildGroundedAnswer never answers from nothing when no FAQ matches", () => {
  const result = buildGroundedAnswer(FAQS, "does this cover helicopter rides", null);
  assert.equal(result.answered, false);
  assert.deepEqual(result.references, []);
  assert.match(result.answer, /No maintained FAQ entry/);
});