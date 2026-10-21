// Sample-based decomposition tests: a quick, readable check of what the
// decomposer extracts for realistic citizen queries.

process.env.NAGRIKSETU_DISABLE_LLM = "1";

import test from "node:test";
import assert from "node:assert/strict";
import { decompose } from "../../src/features/chatbot/decompose.ts";
import { SCHEME_FIXTURES } from "../../src/core/schemes.ts";
import { rankSchemes } from "../../src/features/chatbot/retrieve.ts";

interface Case {
  query: string;
  intent: string;
  category: string | null;
  facts?: Record<string, unknown>;
  topScheme?: string;
}

const CASES: Case[] = [
  {
    query:
      "i am a 22 year old female just passed 12th grade and want some scholarship to support my studies",
    intent: "DISCOVER_SCHEMES",
    category: "education",
    facts: { age: 22, gender: "female", classLevel: "12TH_PASS" },
    topScheme: "pmc-sathe-class12"
  },
  {
    query: "I'm SC, my family income is around 2 lakh a year, and I want help paying for engineering college",
    intent: "DISCOVER_SCHEMES",
    category: "education",
    facts: { category: "SC", income: 200000, courseType: "engineering" }
  },
  {
    query: "my father needs dialysis treatment in hospital, low income family",
    intent: "DISCOVER_SCHEMES",
    category: "healthcare",
    topScheme: "pmc-sgay-health"
  },
  {
    query: "i sell vegetables on the street and need a loan for my stall",
    intent: "DISCOVER_SCHEMES",
    category: "livelihood",
    topScheme: "pmc-svanidhi-hawker"
  },
  {
    query: "which documents are required for the maulana azad scholarship?",
    intent: "ASK_SCHEME_INFO",
    category: "education"
  },
  {
    query: "what is the weather in london today",
    intent: "OTHER",
    category: null
  }
];

for (const c of CASES) {
  test(`decompose: "${c.query.slice(0, 50)}..."`, () => {
    const d = decompose(c.query);
    assert.equal(d.intent, c.intent, "intent");
    assert.equal(d.schemeCategory, c.category, "scheme_category");
    for (const [key, value] of Object.entries(c.facts ?? {})) {
      assert.equal(
        (d.applicantFacts as unknown as Record<string, unknown>)[key],
        value,
        `applicant_facts.${key}`
      );
    }
    if (c.topScheme) {
      const ranked = rankSchemes(SCHEME_FIXTURES, d, 5);
      assert.equal(ranked[0]?.scheme.slug, c.topScheme, "top ranked scheme");
    }
  });
}