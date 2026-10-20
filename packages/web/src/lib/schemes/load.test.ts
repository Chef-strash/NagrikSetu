import test from "node:test";
import assert from "node:assert/strict";
import { mapDbScheme, shown, counterLabel, NOT_PUBLISHED } from "./load.ts";

test("missing columns are not invented", () => {
  const s = mapDbScheme({ id: "x1", slug: "x", name: "X" }, [], []);
  assert.equal(s.deadline, "");
  assert.equal(s.incomeLimit, 0);
  assert.equal(s.counterLocation.office, "");
  assert.equal(s.officialFormUrl, "");
  assert.equal(shown(s.deadline), NOT_PUBLISHED);
  assert.equal(counterLabel(s), "");
});

test("ward office and tips map through", () => {
  const s = mapDbScheme(
    { id: "u", slug: "sl", name: "N", income_limit: "100000", official_form_url: "#", ward_offices: { ward_name: "W", counter_number: "C2" } },
    [{ id: "t", scheme_id: "u", author: "a", role: "r", counter: "c", tip: "tip", helpful_count: 0 }],
    []
  );
  assert.equal(s.id, "sl");
  assert.equal(s.incomeLimit, 100000);
  assert.equal(s.officialFormUrl, "");
  assert.equal(counterLabel(s), "W, C2");
  assert.equal(s.communityTips[0].helpfulCount, 1);
});

import { categoryBlurb, submissionSentence } from "./load.ts";

test("categoryBlurb derives from data", () => {
  const list = [
    { category: "education" as const, benefitAmount: "Rs. 1" },
    { category: "education" as const, benefitAmount: "Rs. 2" }
  ];
  assert.match(categoryBlurb(list, "education"), /^2 PMC schemes .* Rs\. 1 and Rs\. 2\.$/);
  assert.doesNotMatch(categoryBlurb([], "healthcare"), /\d/);
});

test("submissionSentence empty when counter unknown", () => {
  assert.equal(submissionSentence({ counterLocation: { office: "", desk: "", hours: "", address: "" } }), "");
});
