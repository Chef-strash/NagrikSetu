// Tests for the tool-calling answer layer: the generic loop (runToolAgent) and the
// three scheme tools (faq_lookup / reviews_lookup / web_search). Runs fully offline
// with an injected fake model, so it is deterministic and needs no LLM key.

process.env.NAGRIKSETU_DISABLE_DB = "1";
process.env.NAGRIKSETU_DISABLE_LLM = "1";
delete process.env.SERPER_API_KEY;
delete process.env.TAVILY_API_KEY;
delete process.env.BRAVE_API_KEY;

import test from "node:test";
import assert from "node:assert/strict";
import { runToolAgent, buildToolSystemPrompt, type ToolSpec } from "../../src/core/tool-agent.ts";
import { isWebSearchConfigured, webSearchText } from "../../src/core/web-search.ts";
import { buildSchemeToolExecutor, buildSchemeToolSpecs } from "../../src/features/chatbot/tools.ts";
import type { LlmMessage } from "../../src/core/llm.ts";

/** A fake model that replays a fixed script of raw text responses. */
function scriptedModel(replies: string[]) {
  let i = 0;
  return async (_messages: LlmMessage[]): Promise<string> => {
    const reply = replies[Math.min(i, replies.length - 1)];
    i += 1;
    return reply;
  };
}

const TOOLS: ToolSpec[] = [
  { name: "faq_lookup", description: "look up FAQs", parameters: { query: "the question" } }
];

test("the tool-loop prompt lists the tools and the JSON protocol", () => {
  const prompt = buildToolSystemPrompt("You are helpful.", TOOLS);
  assert.match(prompt, /AVAILABLE TOOLS/);
  assert.match(prompt, /faq_lookup/);
  assert.match(prompt, /"tool"/);
  assert.match(prompt, /"answer"/);
});

test("runToolAgent calls a tool, feeds the result back, then answers", async () => {
  const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
  const result = await runToolAgent({
    system: "sys",
    user: "which documents are required?",
    tools: TOOLS,
    execute: async (name, args) => {
      calls.push({ tool: name, args });
      return "Q: Which documents? A: marksheet + income certificate.";
    },
    complete: scriptedModel([
      JSON.stringify({ tool: "faq_lookup", args: { query: "documents" } }),
      JSON.stringify({ answer: "Bring your marksheet and income certificate." })
    ])
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].tool, "faq_lookup");
  assert.deepEqual(calls[0].args, { query: "documents" });
  assert.equal(result.steps.length, 1);
  assert.match(result.steps[0].result, /marksheet/);
  assert.equal(result.answer, "Bring your marksheet and income certificate.");
});

test("runToolAgent answers directly when the model needs no tool", async () => {
  const result = await runToolAgent({
    system: "sys",
    user: "hi",
    tools: TOOLS,
    execute: async () => "should not run",
    complete: scriptedModel([JSON.stringify({ answer: "Hello!" })])
  });
  assert.equal(result.answer, "Hello!");
  assert.equal(result.steps.length, 0);
});

test("runToolAgent accepts plain prose as an answer and stops at maxSteps", async () => {
  const prose = await runToolAgent({
    system: "sys",
    user: "hi",
    tools: TOOLS,
    execute: async () => "x",
    complete: scriptedModel(["Just a plain sentence."])
  });
  assert.equal(prose.answer, "Just a plain sentence.");

  // A model that only ever calls tools must stop after maxSteps.
  let count = 0;
  const looping = await runToolAgent({
    system: "sys",
    user: "hi",
    tools: TOOLS,
    maxSteps: 2,
    execute: async () => {
      count += 1;
      return "result";
    },
    complete: scriptedModel([JSON.stringify({ tool: "faq_lookup", args: {} })])
  });
  assert.equal(count, 2);
  assert.equal(looping.answer, "");
});

test("faq_lookup returns a matching maintained FAQ for the scheme", async () => {
  const execute = buildSchemeToolExecutor({
    schemeSlug: "pmc-azad-class10",
    location: null,
    lang: null
  });
  const out = await execute("faq_lookup", { query: "which documents are required" });
  assert.match(out, /documents/i);
  assert.match(out, /marksheet/i);
});

test("faq_lookup reports when nothing matches", async () => {
  const execute = buildSchemeToolExecutor({
    schemeSlug: "pmc-azad-class10",
    location: null,
    lang: null
  });
  const out = await execute("faq_lookup", { query: "zzzz qqqq" });
  assert.match(out, /No maintained FAQ matches/);
});

test("reviews_lookup filters citizen reviews by the citizen's location", async () => {
  const execute = buildSchemeToolExecutor({
    schemeSlug: "pmc-azad-class10",
    location: "Kothrud Ward 14",
    lang: null
  });
  const matched = await execute("reviews_lookup", {});
  assert.match(matched, /Kothrud Ward 14/);

  const elsewhere = buildSchemeToolExecutor({
    schemeSlug: "pmc-azad-class10",
    location: "Somewhere Else Ward 99",
    lang: null
  });
  const none = await elsewhere("reviews_lookup", {});
  assert.match(none, /scheme-wide/);
});

test("web_search reports unavailable until a provider key is configured", async () => {
  assert.equal(isWebSearchConfigured(), false);
  const out = await webSearchText("pmc scholarship documents");
  assert.match(out, /not configured/);
});

test("buildSchemeToolSpecs exposes the scheme tools", () => {
  const names = buildSchemeToolSpecs().map((t) => t.name);
  assert.deepEqual(names, ["faq_lookup", "reviews_lookup", "audit_status", "web_search"]);
});

test("an unknown tool name is reported, not executed", async () => {
  const execute = buildSchemeToolExecutor({
    schemeSlug: "pmc-azad-class10",
    location: null,
    lang: null
  });
  const out = await execute("delete_everything", {});
  assert.match(out, /Unknown tool: delete_everything/);
});