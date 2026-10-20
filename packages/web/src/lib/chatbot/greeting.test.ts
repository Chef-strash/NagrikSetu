import test from "node:test";
import assert from "node:assert/strict";
import { buildSelectionMessage, buildCandidatePrompt } from "./greeting.ts";
import type { ChatEligibilityCheck, ChatScheme } from "./api.ts";

function scheme(partial: Partial<ChatScheme> = {}): ChatScheme {
  return {
    id: "pmc-azad-class10",
    slug: "pmc-azad-class10",
    name: "Bharat Ratna Maulana Abul Kalam Azad Educational Assistance Scheme",
    vernacularName: null,
    category: "education",
    categoryLabel: "Education Grants",
    pillar: "EDUCATION",
    description: "",
    benefitAmount: "Rs. 15,000",
    benefitType: null,
    deadline: null,
    cutoff: null,
    incomeLimit: null,
    domicileYears: null,
    eligibilityText: "",
    officialFormUrl: null,
    requiredDocuments: [],
    ...partial
  };
}

function eligibility(partial: Partial<ChatEligibilityCheck> = {}): ChatEligibilityCheck {
  return {
    verdict: "need_more_info",
    reasons: [],
    quotedLines: [],
    missingInfo: [],
    questions: [],
    source: "rules",
    ...partial
  };
}

const COUNTER = {
  office: "Kothrud - Bawdhan Ward Office No. 14",
  desk: "Counter No. 3 (Samaj Vikas DBT Desk)",
  hours: "Monday to Friday | 10:30 AM to 03:30 PM"
};

test("selection message names the chosen scheme and never greets again", () => {
  const message = buildSelectionMessage({ scheme: scheme(), counter: COUNTER });

  assert.match(message, /You selected the Bharat Ratna Maulana Abul Kalam Azad/);
  assert.match(message, /Rs\. 15,000/);
  // The candidate prompt already greeted the citizen; a second "Hello" is a bug.
  assert.doesNotMatch(message, /Hello/);
});

test("selection message renders the verdict, quoted lines and clarifying questions", () => {
  const message = buildSelectionMessage({
    scheme: scheme(),
    eligibility: eligibility({
      verdict: "likely_eligible",
      quotedLines: ["Passed Class 10 (SSC) and admitted to Class 11."],
      missingInfo: ["income"],
      questions: ["What is your family's total annual income?"]
    }),
    counter: COUNTER
  });

  assert.match(message, /Likely eligible/);
  assert.match(message, /- Passed Class 10 \(SSC\) and admitted to Class 11\./);
  assert.match(message, /Still needed: What is your family's total annual income\?/);
});

test("selection message falls back to reasons when no lines are quoted", () => {
  const message = buildSelectionMessage({
    scheme: scheme(),
    eligibility: eligibility({ verdict: "need_more_info", reasons: ["Class 10 (SSC) requirement met"] })
  });

  assert.match(message, /Need a few more details/);
  assert.match(message, /- Class 10 \(SSC\) requirement met/);
});

test("selection message includes the counter, document count and guidance caveat", () => {
  const message = buildSelectionMessage({
    scheme: scheme(),
    counter: COUNTER,
    documentCount: 7
  });

  assert.match(message, /Kothrud - Bawdhan Ward Office No\. 14/);
  assert.match(message, /Counter No\. 3 \(Samaj Vikas DBT Desk\)/);
  assert.match(message, /all 7 requirements/);
  assert.match(message, /not an official decision/);
});

test("selection message omits the 'Still needed' line when nothing is missing", () => {
  const message = buildSelectionMessage({
    scheme: scheme(),
    eligibility: eligibility({ verdict: "likely_eligible", missingInfo: [] }),
    counter: COUNTER
  });

  assert.doesNotMatch(message, /Still needed/);
});

test("candidate prompt lists each match and asks the citizen to choose", () => {
  const message = buildCandidatePrompt({
    citizenName: "Ramesh Patil",
    query: "scholarship after 12th",
    candidates: [
      { name: "Lokshahir Annabhau Sathe Educational Assistance Scheme", benefitAmount: "Rs. 25,000" },
      { name: "Krantijyoti Savitribai Phule Scheme for Girl Students", benefitAmount: "Rs. 25,000" }
    ]
  });

  assert.match(message, /Hello Ramesh Patil/);
  assert.match(message, /I found 2 PMC schemes/);
  assert.match(message, /1\. Lokshahir Annabhau Sathe Educational Assistance Scheme \(Rs\. 25,000\)/);
  assert.match(message, /2\. Krantijyoti Savitribai Phule Scheme for Girl Students \(Rs\. 25,000\)/);
  assert.match(message, /Choose the scheme you need on the right/);
});

test("candidate prompt uses the singular for a single match", () => {
  const message = buildCandidatePrompt({
    citizenName: "Ramesh Patil",
    query: "azad",
    candidates: [{ name: "Maulana Abul Kalam Azad Scheme", benefitAmount: "Rs. 15,000" }]
  });

  assert.match(message, /I found 1 PMC scheme that may fit/);
  assert.doesNotMatch(message, /1 PMC schemes/);
});

test("candidate prompt handles an empty candidate list", () => {
  const message = buildCandidatePrompt({
    citizenName: "Ramesh Patil",
    query: "unrelated",
    candidates: []
  });

  assert.match(message, /could not match/);
});

test("the candidate prompt greets exactly once in the whole thread opening", () => {
  const prompt = buildCandidatePrompt({
    citizenName: "Ramesh Patil",
    query: "scholarship",
    candidates: [{ name: "Scheme A", benefitAmount: "Rs. 1,000" }]
  });

  const hellos = prompt.match(/Hello/g) ?? [];
  assert.equal(hellos.length, 1);
});
