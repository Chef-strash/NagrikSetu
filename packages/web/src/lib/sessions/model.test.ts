import test from "node:test";
import assert from "node:assert/strict";
import { bearerToken, formatTimestamp, fromRow, recentHistory, toRow, type StoredSession } from "./model.ts";

test("formatTimestamp renders relative time and passes legacy strings", () => {
  const now = Date.parse("2026-10-04T10:00:00Z");
  assert.equal(formatTimestamp("2026-10-04T09:58:00Z", now), "2 min ago");
  assert.equal(formatTimestamp("2026-10-04T09:59:50Z", now), "Just now");
  assert.equal(formatTimestamp("2026-10-04T07:00:00Z", now), "3 h ago");
  assert.equal(formatTimestamp("10:14 AM", now), "10:14 AM");
});

test("row round trip", () => {
  const s: StoredSession = {
    id: "a", schemeId: "s", schemeName: "n", beneficiaryName: "b", targetBenefit: "t",
    counterLocation: "c", counterHours: "h", status: "completed", documentsLeft: 0,
    lastActivity: "x", documents: [{ id: "d" }], conversation: [], chatSessionId: "chat"
  };
  assert.deepEqual(fromRow({ id: "a", ...toRow(s) }), s);
});

test("recentHistory keeps last turns only", () => {
  const conv = Array.from({ length: 10 }, (_, i) => ({
    id: String(i), sender: (i % 2 ? "assistant" : "user") as "user" | "assistant", text: `m${i}`, timestamp: ""
  }));
  const h = recentHistory(conv, 3);
  assert.equal(h.length, 3);
  assert.equal(h[2].text, "m9");
});

test("bearerToken", () => {
  assert.equal(bearerToken("Bearer abc"), "abc");
  assert.equal(bearerToken("abc"), null);
  assert.equal(bearerToken(null), null);
});
