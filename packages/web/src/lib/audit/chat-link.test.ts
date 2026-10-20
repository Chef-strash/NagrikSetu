import test from "node:test";
import assert from "node:assert/strict";
import { buildAuditChatPayload, postAuditToChat } from "./chat-link.ts";
import type { AuditResult } from "./types.ts";

const audit: AuditResult = {
  requiredDocuments: [{ name: "Aadhaar", status: "UPLOADED", reason: "ok" }],
  fieldChecks: [
    {
      fieldKey: "n",
      formLabel: "Name",
      status: "MISMATCH",
      formValue: "Pooja Patil",
      evidence: { documentId: "d", documentType: "AADHAAR", value: "Pooja Patl" },
      reason: 'Form says "Pooja Patil" but id 1234 5678 9012 differs.'
    }
  ],
  summary: { matches: 0, mismatches: 1, manualChecks: 0, uploaded: 1, missing: 0, needsReview: 0 }
};

test("payload carries no values", () => {
  const json = JSON.stringify(buildAuditChatPayload(audit));
  assert.ok(!json.includes("Pooja"));
  assert.ok(!json.includes("1234"));
  assert.ok(json.includes("Name"));
});

test("returns tips message and posts to the session route", async () => {
  let url = "";
  const fake = (async (u: string) => {
    url = u;
    return new Response(JSON.stringify({ tips: ["Carry two photos"] }), { status: 200 });
  }) as unknown as typeof fetch;
  const msg = await postAuditToChat("abc", audit, fake);
  assert.equal(url, "/api/v1/chatbot/session/abc/audit");
  assert.match(msg ?? "", /tips from other citizens/);
  assert.match(msg ?? "", /Carry two photos/);
});

test("null on failure or no tips", async () => {
  assert.equal(await postAuditToChat("a", audit, (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch), null);
  assert.equal(await postAuditToChat("a", audit, (async () => { throw new Error("x"); }) as unknown as typeof fetch), null);
});
