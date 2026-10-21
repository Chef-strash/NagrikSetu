// Unit tests for the deterministic query decomposer.

import test from "node:test";
import assert from "node:assert/strict";
import { decompose, extractFacts, detectCategory } from "../../src/features/chatbot/decompose.ts";

test("the flagship example decomposes into the expected fields", () => {
  const d = decompose(
    "i am a 22 year old female just passed 12th grade and want some scholarship to support my studies"
  );
  assert.equal(d.intent, "DISCOVER_SCHEMES");
  assert.equal(d.schemeCategory, "education");
  assert.equal(d.pillar, "EDUCATION");
  assert.equal(d.applicantFacts.age, 22);
  assert.equal(d.applicantFacts.gender, "female");
  assert.equal(d.applicantFacts.classLevel, "12TH_PASS");
  assert.ok(d.unknownFacts.includes("income"));
  assert.ok(d.unknownFacts.includes("category"));
  // The "need" excludes demographics
  assert.ok(!/\bfemale\b/i.test(d.semanticQuery ?? ""));
  assert.ok(!/\b22\b/.test(d.semanticQuery ?? ""));
});

test("category detection distinguishes topics", () => {
  assert.equal(detectCategory("i need a hospital for dialysis"), "healthcare");
  assert.equal(detectCategory("loan for my vegetable stall"), "livelihood");
  assert.equal(detectCategory("scholarship for college fees"), "education");
});

test("income normalisation handles lakh and rupees", () => {
  assert.equal(extractFacts("our income is 2 lakh a year").income, 200000);
  assert.equal(extractFacts("family income ₹1,60,000").income, 160000);
  assert.equal(extractFacts("income 25000 per month").income, 25000);
});

test("a named scheme asks for info, not discovery", () => {
  const d = decompose("which documents are required for the maulana azad scholarship?");
  assert.equal(d.schemeQuery, "pmc-azad-class10");
  assert.equal(d.intent, "ASK_SCHEME_INFO");
});

test("SC/ST/OBC are captured and not confused with topic", () => {
  const d = decompose("i am SC and want help paying engineering college fees");
  assert.equal(d.applicantFacts.category, "SC");
  assert.equal(d.applicantFacts.courseType, "engineering");
  assert.equal(d.schemeCategory, "education");
});

test("profile facts are used as defaults and query overrides them", () => {
  const d = decompose("i need a scholarship", {
    profile: { income: 150000, category: "OBC" },
    profileWard: "Ward 14: Kothrud - Bawdhan",
    ulbCode: "PMC-001"
  });
  assert.equal(d.applicantFacts.income, 150000);
  assert.equal(d.applicantFacts.category, "OBC");
  assert.equal(d.location.resolvedUlbCode, "PMC-001");
});

test("unrelated text is OTHER with no category", () => {
  const d = decompose("what is the weather in london today");
  assert.equal(d.intent, "OTHER");
  assert.equal(d.schemeCategory, null);
});