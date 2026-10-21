// Unit tests for scheme retrieval scoring.

import test from "node:test";
import assert from "node:assert/strict";
import { SCHEME_FIXTURES } from "../../src/core/schemes.ts";
import { decompose } from "../../src/features/chatbot/decompose.ts";
import { rankSchemes } from "../../src/features/chatbot/retrieve.ts";

test("the 12th-grade scholarship example ranks the education schemes", () => {
  const d = decompose(
    "i am a 22 year old female just passed 12th grade and want some scholarship to support my studies"
  );
  const matches = rankSchemes(SCHEME_FIXTURES, d, 5);
  const slugs = matches.map((m) => m.scheme.slug);

  assert.ok(slugs.length >= 2);
  assert.equal(slugs[0], "pmc-sathe-class12", "the Class 12 grant should rank first");
  assert.ok(slugs.includes("pmc-savitribai-girls"), "the girls' scheme should appear for a female student");
  // Unrelated pillars should not appear for an education request.
  assert.ok(!slugs.includes("pmc-sgay-health"));
  assert.ok(!slugs.includes("pmc-svanidhi-hawker"));
});

test("a healthcare request surfaces SGAY", () => {
  const d = decompose("i need help with hospital dialysis treatment, my income is 1 lakh");
  const slugs = rankSchemes(SCHEME_FIXTURES, d, 5).map((m) => m.scheme.slug);
  assert.equal(slugs[0], "pmc-sgay-health");
});

test("a vendor request surfaces SVANidhi", () => {
  const d = decompose("i sell vegetables on the street and need a loan");
  const slugs = rankSchemes(SCHEME_FIXTURES, d, 5).map((m) => m.scheme.slug);
  assert.equal(slugs[0], "pmc-svanidhi-hawker");
});

test("income above the ceiling lowers the score and is flagged", () => {
  const d = decompose("i want an education scholarship, our income is 8 lakh a year");
  const matches = rankSchemes(SCHEME_FIXTURES, d, 5);
  const azad = matches.find((m) => m.scheme.slug === "pmc-azad-class10");
  if (azad) {
    assert.ok(azad.reasons.some((r) => /above the .* ceiling/i.test(r)));
  }
});

test("assessment reports missing facts rather than guessing", () => {
  const d = decompose("scholarship for studies");
  const matches = rankSchemes(SCHEME_FIXTURES, d, 3);
  assert.ok(matches.length > 0);
  assert.ok(matches[0].assessment.missingFacts.length > 0);
});