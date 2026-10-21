import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAuditSummaryPrompt,
  normaliseAuditSummaryRequest,
  normaliseAuditSummaryText,
  writeAuditSummary
} from "../../src/features/chatbot/audit-summary-llm.ts";
import type { LlmMessage } from "../../src/core/llm.ts";

const BODY = {
  schemeName: "Maulana Azad Class 10 Grant",
  lang: "en",
  documents: [
    { name: "Student Aadhaar Card", status: "UPLOADED" },
    { name: "Income Certificate", status: "MISSING" }
  ],
  fields: [
    { label: "Date of Birth", status: "MISMATCH", reason: "The dates are different days." },
    { label: "Name of Applicant", status: "MATCH", reason: "Matches after ignoring case." }
  ],
  failedCount: 1,
  counterLocation: "Kothrud Ward Office No. 14, Counter No. 5"
};

test("no provider configured -> null, so the caller keeps its deterministic report", async () => {
  const input = normaliseAuditSummaryRequest(BODY);
  assert.ok(input);
  // No completer injected and no LLM env configured in tests.
  assert.equal(await writeAuditSummary(input, { complete: undefined }), null);
});

test("an injected completer produces the summary", async () => {
  const input = normaliseAuditSummaryRequest(BODY);
  assert.ok(input);

  let seen: LlmMessage[] = [];
  const summary = await writeAuditSummary(input, {
    complete: async (messages) => {
      seen = messages;
      return "Your income certificate is missing.\nThe date of birth does not match.\nEverything else looks fine.";
    }
  });

  assert.match(summary ?? "", /income certificate is missing/);
  assert.equal(seen[0].role, "system");
  assert.equal(seen[1].role, "user");
});

test("a failing provider falls back to null instead of throwing", async () => {
  const input = normaliseAuditSummaryRequest(BODY);
  assert.ok(input);

  const summary = await writeAuditSummary(input, {
    complete: async () => {
      throw new Error("provider down");
    }
  });
  assert.equal(summary, null);
});

test("PRIVACY: values smuggled into the payload never reach the model", () => {
  const input = normaliseAuditSummaryRequest({
    documents: [{ name: "Aadhaar Card", status: "UPLOADED", value: "XXXX-XXXX-9012" }],
    fields: [
      { label: "Aadhaar Number", status: "MATCH", value: "RAMESH PATIL", reason: "Identifiers match." }
    ]
  });
  assert.ok(input);

  const prompt = buildAuditSummaryPrompt(input)
    .map((message) => message.content)
    .join("\n");

  // The whitelist keeps only name / label / status / reason.
  assert.ok(!prompt.includes("XXXX-XXXX-9012"), "a masked value must not be sent");
  assert.ok(!prompt.includes("RAMESH PATIL"), "a name must not be sent");
  assert.match(prompt, /Aadhaar Number/);
  assert.match(prompt, /Identifiers match\./);
});

test("the request is validated and bounded", () => {
  assert.equal(normaliseAuditSummaryRequest(null), null);
  assert.equal(normaliseAuditSummaryRequest({}), null);
  assert.equal(normaliseAuditSummaryRequest({ documents: [], fields: [] }), null);
  assert.equal(normaliseAuditSummaryRequest({ documents: [{ name: "x" }] }), null, "status is required");

  const many = {
    documents: Array.from({ length: 60 }, (_, i) => ({ name: `Doc ${i}`, status: "UPLOADED" })),
    fields: []
  };
  const capped = normaliseAuditSummaryRequest(many);
  assert.ok(capped);
  assert.equal(capped.documents.length, 25, "rows must be capped");

  const long = normaliseAuditSummaryRequest({
    documents: [{ name: "A".repeat(500), status: "UPLOADED" }],
    fields: []
  });
  assert.ok(long);
  assert.ok(long.documents[0].name.length <= 160);
});

test("the model reply is trimmed into something chat-safe", () => {
  assert.equal(normaliseAuditSummaryText(""), null);
  assert.equal(normaliseAuditSummaryText("too short"), null);
  assert.equal(normaliseAuditSummaryText(null), null);

  const fenced = normaliseAuditSummaryText(
    "```\nYour income certificate is missing.\n\n\n\nPlease upload it before visiting the counter.\n```"
  );
  assert.ok(fenced);
  assert.ok(!fenced.includes("```"));
  assert.ok(!fenced.includes("\n\n\n"), "excess blank lines are collapsed");

  const bullets = normaliseAuditSummaryText("- First line of a real summary here.\n- Second line here too.");
  assert.ok(bullets);
  assert.match(bullets, /^First line/);

  const long = normaliseAuditSummaryText("X".repeat(5000));
  assert.ok(long);
  assert.ok(long.length <= 900);
});

test("the prompt states how many things need attention", () => {
  const input = normaliseAuditSummaryRequest(BODY);
  assert.ok(input);
  const prompt = buildAuditSummaryPrompt(input)
    .map((message) => message.content)
    .join("\n");

  assert.match(prompt, /2 checked, 1 need attention/);
  assert.match(prompt, /1 file\(s\) could not be read/);
});
