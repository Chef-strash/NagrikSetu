// API tests for the feedback endpoints. Runs fully offline (fixture path).
// The disable flag is set before any request, so no Supabase call is made.

process.env.NAGRIKSETU_DISABLE_DB = "1";
process.env.NAGRIKSETU_DISABLE_LLM = "1";

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../../src/app.ts";

let server: Server;
let base = "";

before(async () => {
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

after(() => {
  server?.close();
});

test("health endpoint responds ok", async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { status: string };
  assert.equal(body.status, "ok");
});

test("faqs returns published entries for a known scheme", async () => {
  const res = await fetch(`${base}/api/v1/schemes/pmc-azad-class10/faqs?lang=en`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    scheme: { slug: string };
    language: string;
    count: number;
    faqs: Array<{ question: string; languageCode: string }>;
  };
  assert.equal(body.scheme.slug, "pmc-azad-class10");
  assert.equal(body.language, "en");
  assert.ok(body.count >= 5);
  assert.ok(body.faqs.some((f) => f.question === "Which documents are required?"));
});

test("faqs prefers the requested language", async () => {
  const res = await fetch(`${base}/api/v1/schemes/pmc-azad-class10/faqs?lang=mr`);
  const body = (await res.json()) as { faqs: Array<{ languageCode: string }> };
  assert.equal(body.faqs[0].languageCode, "mr");
});

test("reviews are scheme-level, read-only and ordered by helpful count", async () => {
  const res = await fetch(`${base}/api/v1/schemes/pmc-azad-class10/reviews?limit=20`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    count: number;
    reviews: Array<{ helpfulCount: number; text: string }>;
  };
  assert.equal(body.count, 3);
  const counts = body.reviews.map((r) => r.helpfulCount);
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a));
  assert.ok(body.reviews.every((r) => typeof r.text === "string" && r.text.length > 0));
});

test("reviews for an unknown scheme are empty", async () => {
  const res = await fetch(`${base}/api/v1/schemes/does-not-exist/reviews`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { scheme: null, count: 0, reviews: [] });
});

test("faq-answer is grounded in the matching FAQ", async () => {
  const res = await fetch(`${base}/api/v1/schemes/pmc-azad-class10/faq-answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "which documents are required?", lang: "en" })
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    answered: boolean;
    answer: string;
    references: unknown[];
    officialUrl: string | null;
    guidance: string;
  };
  assert.equal(body.answered, true);
  assert.match(body.answer.toLowerCase(), /attested copy of class 10/);
  assert.ok(body.references.length > 0);
  assert.equal(body.officialUrl, "https://dbt.pmc.gov.in/forms/maulana_azad_ssc.pdf");
  assert.ok(body.guidance.length > 0);
});

test("faq-answer says it cannot answer when no FAQ matches", async () => {
  const res = await fetch(`${base}/api/v1/schemes/pmc-azad-class10/faq-answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "does this cover helicopter rides" })
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { answered: boolean; references: unknown[] };
  assert.equal(body.answered, false);
  assert.equal(body.references.length, 0);
});

test("faq-answer rejects too-short questions", async () => {
  const res = await fetch(`${base}/api/v1/schemes/pmc-azad-class10/faq-answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "hi" })
  });
  assert.equal(res.status, 400);
});

test("faq-answer for an unknown scheme is 404", async () => {
  const res = await fetch(`${base}/api/v1/schemes/does-not-exist/faq-answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "who is eligible?" })
  });
  assert.equal(res.status, 404);
});

// --- Review submission ------------------------------------------------------

test("submitting an invalid review is rejected with 400", async () => {
  const res = await fetch(`${base}/api/v1/schemes/pmc-azad-class10/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "bad" })
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { errors: string[] };
  assert.ok(body.errors.length > 0);
});

test("a review containing PII is rejected with 400", async () => {
  const res = await fetch(`${base}/api/v1/schemes/pmc-azad-class10/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "My aadhaar is 1234 5678 9012, the clerk checked it." })
  });
  assert.equal(res.status, 400);
});

test("a valid review is 503 when no database write path is available", async () => {
  const res = await fetch(`${base}/api/v1/schemes/pmc-azad-class10/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Bring two passport photos clipped to the form." })
  });
  // Tests run with the DB disabled, so the trusted write path is unavailable.
  assert.equal(res.status, 503);
});