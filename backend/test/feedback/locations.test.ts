// Location matching for reviews used in FAQ answers.

import test from "node:test";
import assert from "node:assert/strict";
import { locationsMatch } from "../../src/features/feedback/service.ts";

test("matches when the ward number appears in both strings", () => {
  assert.equal(locationsMatch("Ward 14: Kothrud - Bawdhan", "Kothrud Ward 14, Counter 3"), true);
});

test("matches on a shared place name", () => {
  assert.equal(locationsMatch("Kothrud", "Kothrud Ward 14, Counter 3"), true);
});

test("does not match a different ward", () => {
  assert.equal(locationsMatch("Ward 14: Kothrud", "Yerawada Ward 5, Counter 1"), false);
});

test("no match when either side is unknown", () => {
  assert.equal(locationsMatch(null, "Kothrud Ward 14"), false);
  assert.equal(locationsMatch("Ward 14: Kothrud", null), false);
  assert.equal(locationsMatch("", ""), false);
});