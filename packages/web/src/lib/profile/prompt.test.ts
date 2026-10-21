import test from "node:test";
import assert from "node:assert/strict";
import {
  missingProfileFacts,
  shouldPromptProfile,
  PROFILE_PROMPT_STORAGE_KEY
} from "./prompt.ts";

const filled = { ward: "Ward 14: Kothrud - Bawdhan", income: 180000, category: "OBC" };

test("missingProfileFacts reports nothing for a filled profile", () => {
  assert.deepEqual(missingProfileFacts(filled), []);
});

test("missingProfileFacts names every absent fact, in a stable order", () => {
  assert.deepEqual(missingProfileFacts({ ward: "", income: 0, category: "" }), [
    "ward",
    "income",
    "category"
  ]);
});

test("missingProfileFacts treats blank strings and whitespace as missing", () => {
  assert.deepEqual(missingProfileFacts({ ...filled, ward: "   " }), ["ward"]);
  assert.deepEqual(missingProfileFacts({ ...filled, category: " " }), ["category"]);
});

test("missingProfileFacts treats a zero or negative income as missing", () => {
  assert.deepEqual(missingProfileFacts({ ...filled, income: 0 }), ["income"]);
  assert.deepEqual(missingProfileFacts({ ...filled, income: -1 }), ["income"]);
});

test("missingProfileFacts reports only the facts that are absent", () => {
  assert.deepEqual(missingProfileFacts({ ...filled, income: 0 }), ["income"]);
});

test("shouldPromptProfile never prompts an anonymous visitor", () => {
  assert.equal(shouldPromptProfile({ isAuthenticated: false, dismissed: false }), false);
});

test("shouldPromptProfile never prompts a dismissed visitor", () => {
  assert.equal(shouldPromptProfile({ isAuthenticated: true, dismissed: true }), false);
  assert.equal(shouldPromptProfile({ isAuthenticated: false, dismissed: true }), false);
});

test("shouldPromptProfile prompts a signed-in visitor who has not dismissed it", () => {
  assert.equal(shouldPromptProfile({ isAuthenticated: true, dismissed: false }), true);
});

test("the dismissal key is namespaced to this app", () => {
  assert.match(PROFILE_PROMPT_STORAGE_KEY, /^nagriksetu\./);
});
