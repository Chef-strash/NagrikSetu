/**
 * Lightweight triage agent (task_0004): stateless SDK `Agent` that decides
 * whether a harvested page is a scheme and proposes a slug + confidence.
 */
import { z } from "zod";
import { Agent, resolveModelConfig, type TriageAgentLike } from "./sdk.js";
import { HARVESTER_ENV_PREFIX, resolveProviderKey } from "../config.js";

export const TriageResultSchema = z.object({
  isScheme: z.boolean(),
  slug: z.string(),
  confidence: z.number().min(0).max(1),
});

export type TriageResult = z.infer<typeof TriageResultSchema>;

type AgentCtor = new (options: Record<string, unknown>) => TriageAgentLike;

export interface TriageDeps {
  agentCtor?: AgentCtor;
  apiKey?: string;
  /** Model env override for tests; defaults to process.env. */
  env?: NodeJS.ProcessEnv;
}

/**
 * Extract the JSON object from a model reply that may be wrapped in a
 * markdown code fence (```json ... ```) and/or preceded by prose.
 */
export function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first !== -1 && last > first) return raw.slice(first, last + 1);
  return raw.trim();
}

/** Run triage over a page excerpt; returns the zod-validated verdict. */
export async function triagePage(
  excerpt: string,
  deps: TriageDeps = {},
): Promise<TriageResult> {
  const Ctor = (deps.agentCtor ?? Agent) as AgentCtor;
  const env = deps.env ?? process.env;
  const model = resolveModelConfig(env, HARVESTER_ENV_PREFIX);
  const agent = new Ctor({
    providerId: model.providerId,
    modelId: model.modelId,
    apiKey: deps.apiKey ?? resolveProviderKey(env, model.providerId, HARVESTER_ENV_PREFIX),
    systemPrompt:
      "Triage municipal pages. Reply with JSON only: {isScheme, slug, confidence}. Official sources only.",
    tools: [],
  });
  const result = await agent.run(
    `Is this a welfare scheme page? Reply JSON only. Excerpt: ${excerpt.slice(0, 2000)}`,
  );
  return TriageResultSchema.parse(JSON.parse(extractJson(result.outputText)));
}
