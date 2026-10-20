import test from "node:test";
import assert from "node:assert/strict";
import { rowToProfile, profileToRow, EMPTY_PROFILE } from "./profile-map.ts";

test("rowToProfile / profileToRow roundtrip", () => {
  const p = { ...EMPTY_PROFILE, name: "A", income: 5, domicileYears: 3, empaneledHospitals: ["H"] };
  const row = profileToRow(p, "uid", "a@b.c");
  assert.equal(row.user_id, "uid");
  assert.deepEqual(rowToProfile(row), p);
});

test("rowToProfile defaults", () => {
  const p = rowToProfile({});
  assert.equal(p.dbtEnabled, true);
  assert.equal(p.name, "");
});
