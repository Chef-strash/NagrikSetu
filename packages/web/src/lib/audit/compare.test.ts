import test from "node:test";
import assert from "node:assert/strict";
import { compareValues, dateKey, maskValue, normalizeText } from "./compare.ts";

test("normalizeText folds case, accents and punctuation", () => {
  assert.equal(normalizeText("  Patil,  Ramesh "), "patil ramesh");
  assert.equal(normalizeText("RAMÉSH"), "ramesh");
});

test("NORMALIZED_TEXT ignores word order — Indian documents reorder names", () => {
  const outcome = compareValues("NORMALIZED_TEXT", "Ramesh Dnyaneshwar Patil", "Patil Ramesh Dnyaneshwar");
  assert.equal(outcome.equal, true);
});

test("NORMALIZED_TEXT still catches a genuinely different name", () => {
  assert.equal(compareValues("NORMALIZED_TEXT", "Ramesh Patil", "Ramesh Patel").equal, false);
  assert.equal(compareValues("NORMALIZED_TEXT", "Ramesh Patil", "Ramesh").equal, false);
});

test("IDENTIFIER ignores spacing and punctuation but not digits", () => {
  assert.equal(compareValues("IDENTIFIER", "CNRB0005012", "CNRB 0005 012").equal, true);
  assert.equal(compareValues("IDENTIFIER", "1234 5678 9012", "1234-5678-9012").equal, true);
  assert.equal(compareValues("IDENTIFIER", "CNRB0005012", "CNRB0005013").equal, false);
});

test("DATE understands the formats that appear on municipal paperwork", () => {
  assert.equal(dateKey("12/01/1998"), "1998-01-12");
  assert.equal(dateKey("12-01-1998"), "1998-01-12");
  assert.equal(dateKey("1998-01-12"), "1998-01-12");
  assert.equal(dateKey("12 Jan 1998"), "1998-01-12");
  assert.equal(dateKey("January 12, 1998"), "1998-01-12");
  assert.equal(dateKey("not a date"), null);
  assert.equal(compareValues("DATE", "12/01/1998", "12 January 1998").equal, true);
  assert.equal(compareValues("DATE", "12/01/1998", "13/01/1998").equal, false);
});

test("EXACT is whitespace-tolerant but case-sensitive", () => {
  assert.equal(compareValues("EXACT", "Pune  Municipal", "Pune Municipal").equal, true);
  assert.equal(compareValues("EXACT", "pune", "Pune").equal, false);
});

test("an unreadable or missing value returns equal:null, never a match", () => {
  assert.equal(compareValues("NORMALIZED_TEXT", "", "Ramesh").equal, null);
  assert.equal(compareValues("NORMALIZED_TEXT", "Ramesh", "").equal, null);
  assert.equal(compareValues("IDENTIFIER", "---", "CNRB0005012").equal, null);
  assert.equal(compareValues("DATE", "??/??/????", "1998-01-12").equal, null);
});

test("maskValue keeps only the last four characters", () => {
  const masked = maskValue("123456789012");
  assert.equal(masked.endsWith("9012"), true);
  assert.equal(masked.includes("1234"), false);
});
