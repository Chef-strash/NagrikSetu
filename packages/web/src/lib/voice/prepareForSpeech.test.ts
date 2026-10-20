import test from "node:test";
import assert from "node:assert/strict";
import { cleanForSpeech, splitForSpeech, MAX_CHUNK_CHARS } from "./prepareForSpeech.ts";

test("reads rupee amounts as words in English and Marathi", () => {
  assert.equal(cleanForSpeech("You get ₹15,000.", "en"), "You get 15,000 rupees.");
  assert.equal(cleanForSpeech("Rs. 2,50,000 limit", "en"), "2,50,000 rupees limit");
  assert.equal(cleanForSpeech("₹15,000 मिळतील", "mr"), "15,000 रुपये मिळतील");
});

test("strips markdown, links and URLs", () => {
  const out = cleanForSpeech("# Heading\n**Bold** see [the form](https://pmc.gov.in/x) or https://example.com", "en");
  assert.equal(out.includes("#"), false);
  assert.equal(out.includes("**"), false);
  assert.equal(out.includes("http"), false);
  assert.ok(out.includes("the form"));
});

test("splits Marathi text at the danda", () => {
  const chunks = splitForSpeech("पहिले वाक्य। दुसरे वाक्य।", 15);
  assert.deepEqual(chunks, ["पहिले वाक्य।", "दुसरे वाक्य।"]);
});

test("keeps every chunk within the limit and does not cut sentences", () => {
  const sentence = "This is one complete sentence about the ward counter. ";
  const long = sentence.repeat(100);
  const chunks = splitForSpeech(long);
  assert.ok(chunks.length > 1);
  for (const c of chunks) {
    assert.ok(c.length <= MAX_CHUNK_CHARS);
    assert.ok(c.endsWith("."));
  }
});

test("cuts a single over-long sentence at a space", () => {
  const word = "word ";
  const chunks = splitForSpeech(word.repeat(400).trim(), 1200);
  for (const c of chunks) assert.ok(c.length <= 1200);
  assert.equal(chunks.join(" ").split(" ").length, 400);
});
