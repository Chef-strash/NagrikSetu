// Query-decomposition report.
//
// Runs the decomposer over a sample set and writes a JSON artifact you can inspect:
//   cd backend && npm run decompose:report
//   -> backend/results/query-decomposition.results.json
//
// Uses the LLM when a provider is enabled (LLM_PROVIDER=cline or an API key);
// otherwise the deterministic decomposer. Each row records which source was used
// (`llm` | `rules`), so you can see the LLM effect flip on once auth works.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "..", "results");
const outFile = resolve(outDir, "query-decomposition.results.json");

const SAMPLES = [
  "i am a 22 year old female just passed 12th grade and want some scholarship to support my studies",
  "I'm SC, my family income is around 2 lakh a year, and I want help paying for engineering college",
  "my father needs dialysis treatment in hospital, we are a low income family",
  "i sell vegetables on the street and need a loan for my stall",
  "which documents are required for the maulana azad scholarship?",
  "tell me the details of the SGAY scheme",
  "i am a girl studying nursing diploma, income 1.5 lakh",
  "what is the weather in london today"
];

const { decomposeWithLlm } = await import("../src/features/chatbot/decompose-llm.ts");
const { rankSchemes } = await import("../src/features/chatbot/retrieve.ts");
const { getActiveSchemes } = await import("../src/core/schemes.ts");
const { isLlmConfigured } = await import("../src/core/llm.ts");

const llmEnabled = isLlmConfigured();
const schemes = await getActiveSchemes();
console.log(`LLM enabled: ${llmEnabled} | schemes loaded: ${schemes.length}\n`);

const results = [];
for (const query of SAMPLES) {
  const { decomposition, source } = await decomposeWithLlm(query);
  const candidates =
    decomposition.intent === "DISCOVER_SCHEMES"
      ? rankSchemes(schemes, decomposition, 5).map((m) => ({
          slug: m.scheme.slug,
          score: m.score,
          verdict: m.assessment.verdict
        }))
      : [];

  results.push({ query, source, decomposition, candidates });

  console.log(`Q: ${query}`);
  console.log(
    `  intent=${decomposition.intent} category=${decomposition.schemeCategory} ` +
      `pillar=${decomposition.pillar} source=${source}`
  );
  console.log(`  facts=${JSON.stringify(decomposition.applicantFacts)}`);
  console.log(`  unknown=${decomposition.unknownFacts.join(", ") || "(none)"}`);
  if (candidates.length) console.log(`  candidates=${candidates.map((c) => c.slug).join(" > ")}`);
  console.log("");
}

mkdirSync(outDir, { recursive: true });
const payload = {
  generatedAt: new Date().toISOString(),
  llmEnabled,
  llmConfig: llmEnabled ? "enabled" : "disabled (deterministic fallback)",
  sampleCount: SAMPLES.length,
  results
};
writeFileSync(outFile, JSON.stringify(payload, null, 2), "utf8");
console.log(`Wrote ${results.length} results -> ${outFile}`);
