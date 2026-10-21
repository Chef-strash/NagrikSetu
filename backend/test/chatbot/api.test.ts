// API tests for the session-based chatbot flow. Runs fully offline (fixtures).

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

async function post(path: string, body: unknown) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function startSession(query: string) {
  return post("/api/v1/chatbot/session", { query });
}

test("starting a session decomposes once and ranks schemes", async () => {
  const { status, body } = await startSession(
    "i am a 22 year old female just passed 12th grade and want some scholarship to support my studies"
  );
  assert.equal(status, 201);
  assert.equal(typeof body.sessionId, "string");

  const decomposition = body.decomposition as {
    schemeCategory: string;
    applicantFacts: { age: number; gender: string; classLevel: string };
    unknownFacts: string[];
  };
  assert.equal(decomposition.schemeCategory, "education");
  assert.equal(decomposition.applicantFacts.age, 22);
  assert.equal(decomposition.applicantFacts.gender, "female");
  assert.equal(decomposition.applicantFacts.classLevel, "12TH_PASS");

  const schemes = body.schemes as Array<{ scheme: { slug: string } }>;
  assert.ok(schemes.length >= 2);
  assert.equal(schemes[0].scheme.slug, "pmc-sathe-class12");
  assert.equal(body.selectedSlug, null);
});

test("the stored decomposition is reused on later reads (runs once)", async () => {
  const { body } = await startSession("i am a 22 year old female just passed 12th grade looking for a scholarship");
  const id = body.sessionId as string;

  const res = await fetch(`${base}/api/v1/chatbot/session/${id}`);
  assert.equal(res.status, 200);
  const view = (await res.json()) as { sessionId: string; decomposition: { schemeCategory: string } };
  assert.equal(view.sessionId, id);
  assert.equal(view.decomposition.schemeCategory, "education");
});

test("selecting a scheme returns its published FAQs", async () => {
  const { body } = await startSession("scholarship for studies after 12th");
  const id = body.sessionId as string;

  const { status, body: selected } = await post(`/api/v1/chatbot/session/${id}/select`, {
    schemeSlug: "pmc-sathe-class12"
  });
  assert.equal(status, 200);
  assert.equal(selected.selectedSlug, "pmc-sathe-class12");
  const faqs = selected.faqs as Array<{ question: string }>;
  assert.ok(faqs.length >= 4);
  assert.ok(faqs.some((f) => f.question === "Which documents are required?"));

  // Eligibility check is returned on selection.
  const eligibility = selected.eligibility as {
    verdict: string;
    source: string;
    questions: string[];
  };
  assert.ok(["likely_eligible", "not_eligible", "need_more_info"].includes(eligibility.verdict));
  assert.equal(eligibility.source, "rules"); // tests run with the LLM disabled
});

test("asking a question is answered from the selected scheme's FAQs", async () => {
  const { body } = await startSession("scholarship for studies after 12th");
  const id = body.sessionId as string;

  await post(`/api/v1/chatbot/session/${id}/select`, { schemeSlug: "pmc-sathe-class12" });

  const { status, body: answer } = await post(`/api/v1/chatbot/session/${id}/ask`, {
    question: "which documents are required?"
  });
  assert.equal(status, 200);
  assert.equal(answer.schemeSlug, "pmc-sathe-class12");
  const faq = answer.faq as { answered: boolean; answer: string; officialUrl: string | null };
  assert.equal(faq.answered, true);
  assert.match(faq.answer.toLowerCase(), /marksheet/);
  assert.equal(faq.officialUrl, "https://dbt.pmc.gov.in/forms/annabhau_sathe_hsc.pdf");
});

test("asking before selecting a scheme is a 409", async () => {
  const { body } = await startSession("scholarship for studies");
  const id = body.sessionId as string;
  const { status } = await post(`/api/v1/chatbot/session/${id}/ask`, { question: "which documents?" });
  assert.equal(status, 409);
});

test("unknown session ids are 404", async () => {
  const res = await fetch(`${base}/api/v1/chatbot/session/does-not-exist`);
  assert.equal(res.status, 404);
  const { status } = await post("/api/v1/chatbot/session/does-not-exist/select", {
    schemeSlug: "pmc-sathe-class12"
  });
  assert.equal(status, 404);
});

test("selecting an unknown scheme is a 404", async () => {
  const { body } = await startSession("scholarship for studies");
  const id = body.sessionId as string;
  const { status } = await post(`/api/v1/chatbot/session/${id}/select`, { schemeSlug: "nope" });
  assert.equal(status, 404);
});

test("too-short queries are rejected", async () => {
  const { status } = await startSession("hi");
  assert.equal(status, 400);
});

// --- Selected-scheme rule --------------------------------------------------

test("after selecting a scheme, an unrelated message is still scheme-info", async () => {
  const { body } = await startSession("scholarship for studies after 12th");
  const id = body.sessionId as string;
  await post(`/api/v1/chatbot/session/${id}/select`, { schemeSlug: "pmc-sathe-class12" });

  const { status, body: msg } = await post(`/api/v1/chatbot/session/${id}/message`, {
    text: "what is the weather in london today"
  });
  assert.equal(status, 200);
  assert.equal(msg.forcedIntent, true);
  assert.equal(msg.selectedSlug, "pmc-sathe-class12");
  assert.equal(msg.kind, "faq_answer");
  const decomposition = msg.decomposition as { intent: string; schemeQuery: string };
  assert.equal(decomposition.intent, "ASK_SCHEME_INFO");
  assert.equal(decomposition.schemeQuery, "pmc-sathe-class12");
});

test("after selecting a scheme, naming a different scheme does not switch", async () => {
  const { body } = await startSession("scholarship for studies after 12th");
  const id = body.sessionId as string;
  await post(`/api/v1/chatbot/session/${id}/select`, { schemeSlug: "pmc-sathe-class12" });

  const { body: msg } = await post(`/api/v1/chatbot/session/${id}/message`, {
    text: "tell me about the svanidhi vendor scheme"
  });
  assert.equal(msg.selectedSlug, "pmc-sathe-class12");
  assert.equal(msg.forcedIntent, true);
  const faq = msg.faq as { officialUrl: string | null };
  assert.equal(faq.officialUrl, "https://dbt.pmc.gov.in/forms/annabhau_sathe_hsc.pdf");
});

test("before selecting, a message can still discover schemes", async () => {
  const { body } = await startSession("i need help");
  const id = body.sessionId as string;
  const { body: msg } = await post(`/api/v1/chatbot/session/${id}/message`, {
    text: "i want a scholarship for college studies"
  });
  assert.equal(msg.forcedIntent, false);
  assert.equal(msg.kind, "schemes");
  assert.ok((msg.schemes as unknown[]).length > 0);
});