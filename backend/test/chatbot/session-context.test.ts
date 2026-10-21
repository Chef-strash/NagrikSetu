process.env.NAGRIKSETU_DISABLE_DB = "1";
process.env.NAGRIKSETU_DISABLE_LLM = "1";

import test from "node:test";
import assert from "node:assert/strict";
import {
  appendTurn,
  buildContextBlock,
  createBudget,
  BudgetExceededError,
  recentMessages,
  sanitiseAudit,
  shouldRerunEligibility,
  looksLikeFacts,
  MAX_TURNS
} from "../../src/features/chatbot/session-context.ts";
import { runToolAgent } from "../../src/core/tool-agent.ts";
import { pickTopReviews } from "../../src/features/chatbot/tools.ts";
import { EMPTY_FACTS, type ChatSessionState } from "../../src/features/chatbot/types.ts";
import type { SchemeRecord } from "../../src/core/schemes.ts";

function state(): ChatSessionState {
  return {
    decomposition: {} as never, decompositionSource: "rules", matches: [], selectedSlug: "s",
    facts: { ...EMPTY_FACTS, income: 200000 }, location: "Kothrud Ward 14", history: [], turns: [],
    summary: "", lang: "hi", profile: { ward: "14", category: "OBC", rationCard: null, disabilityStatus: null, dbtEnabled: true, incomeBand: null },
    verdict: { verdict: "need_more_info", reasons: ["income ok"], quotedLines: [], missingInfo: ["category"], questions: [], source: "rules" },
    audit: null, tips: []
  };
}

test("history is windowed to the last 8 turns, capped at 40, with a summary of older turns", () => {
  const s = state();
  for (let i = 0; i < 50; i += 1) appendTurn(s, `q${i}`, `a${i}`, i);
  assert.equal(s.turns.length, MAX_TURNS);
  const msgs = recentMessages(s);
  assert.equal(msgs.length, 16);
  assert.deepEqual(msgs[0], { role: "user", content: "q42" });
  assert.deepEqual(msgs[15], { role: "assistant", content: "a49" });
  assert.match(s.summary, /q10/);
  assert.doesNotMatch(s.summary, /q45/);
});

test("runToolAgent inserts history before the current question", async () => {
  let seen: Array<{ role: string; content: string }> = [];
  await runToolAgent({
    system: "sys", user: "now?", tools: [], execute: async () => "",
    messages: [{ role: "user", content: "before" }, { role: "assistant", content: "reply" }],
    complete: async (m) => { seen = m; return JSON.stringify({ answer: "ok" }); }
  });
  assert.deepEqual(seen.map((m) => m.role), ["system", "user", "assistant", "user"]);
  assert.equal(seen[3].content, "now?");
});

test("context block carries scheme, facts, verdict, profile, audit and language", () => {
  const s = state();
  s.audit = sanitiseAudit({ documents: [{ name: "Income certificate", status: "MISSING", rows: [] }] });
  const scheme = { name: "Azad Scheme", benefitAmount: "Rs 5000", deadline: "2026-12-31", requiredDocuments: ["Marksheet"], officialFormUrl: "https://x.test" } as SchemeRecord;
  const block = buildContextBlock(scheme, s, "hi");
  for (const needle of ["Azad Scheme", "Rs 5000", "2026-12-31", "Marksheet", "https://x.test", "income=200000", "need_more_info", "category OBC", "Income certificate: MISSING", "Reply language: hi"]) {
    assert.ok(block.includes(needle), needle);
  }
});

test("audit sanitising keeps labels only, drops values, masks ID numbers", () => {
  const audit = sanitiseAudit({
    documents: [
      { name: "Aadhaar 1234 5678 9012", status: "uploaded", value: "SECRET", rows: [
        { label: "Name", status: "ok", reason: "matches 123456789012", value: "Ravi Kumar" },
        { label: "", status: "x", reason: "" }
      ] },
      { name: "Bad", status: "WEIRD", rows: [] }
    ]
  })!;
  assert.equal(audit.documents.length, 1);
  const json = JSON.stringify(audit);
  assert.ok(!json.includes("SECRET") && !json.includes("Ravi") && !json.includes("1234 5678") && !json.includes("123456789012"));
  assert.equal(audit.documents[0].rows.length, 1);
  assert.equal(sanitiseAudit({ documents: [] }), null);
  assert.equal(sanitiseAudit("x"), null);
});

test("eligibility re-runs only when facts change or no verdict exists", () => {
  const s = state();
  const a = { ...EMPTY_FACTS, income: 1 };
  assert.equal(shouldRerunEligibility(s, a, { ...a }), false);
  assert.equal(shouldRerunEligibility(s, a, { ...a, age: 20 }), true);
  assert.equal(shouldRerunEligibility({ verdict: null }, a, a), true);
  assert.equal(looksLikeFacts("our income is 2 lakh"), true);
  assert.equal(looksLikeFacts("where is the office"), false);
});

test("budget rejects once exhausted", async () => {
  let t = 0;
  const b = createBudget(100, () => t);
  assert.equal(await b.run(async () => 1), 1);
  t = 200;
  await assert.rejects(() => b.run(async () => 1), BudgetExceededError);
});

test("pickTopReviews prefers location match, falls back to scheme-wide by helpful count", () => {
  const rs = [
    { counter: "Aundh Ward 9", helpfulCount: 9 }, { counter: "Kothrud Ward 14", helpfulCount: 1 },
    { counter: null, helpfulCount: 5 }, { counter: "Baner", helpfulCount: 2 }
  ];
  assert.deepEqual(pickTopReviews(rs, "Kothrud Ward 14").picked.map((r) => r.helpfulCount), [1]);
  const fb = pickTopReviews(rs, "Nowhere 77");
  assert.equal(fb.locationMatched, false);
  assert.deepEqual(fb.picked.map((r) => r.helpfulCount), [9, 5, 2]);
  assert.equal(pickTopReviews(rs, null).picked.length, 3);
});
