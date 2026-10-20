import test from "node:test";
import assert from "node:assert/strict";
import { toChatProfile } from "./profile.ts";

test("maps a filled profile and derives an income band", () => {
  const p = toChatProfile({
    ward: "Ward 12",
    category: "OBC",
    rationCard: "Yellow",
    disabilityStatus: "None",
    dbtEnabled: false,
    income: 180000
  });
  assert.deepEqual(p, {
    ward: "Ward 12",
    category: "OBC",
    rationCard: "Yellow",
    disabilityStatus: "None",
    dbtEnabled: false,
    income: 180000,
    incomeBand: "Rs 180000 per year"
  });
});

test("empty profile yields undefined", () => {
  assert.equal(toChatProfile(undefined), undefined);
  assert.equal(toChatProfile({ ward: " ", dbtEnabled: true, income: 0 }), undefined);
});
