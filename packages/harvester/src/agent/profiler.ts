/**
 * Harvester profiler (task_0004, wired in task_0002): one shared
 * `runAgentSession` (KTD1) — a full `ClineCore` session with built-ins disabled
 * (`enableTools: false`) and harvester `extraTools` only. Scanned PDF pages ride
 * `userImages` on the turn; text goes through tools. The session runs to
 * completion (`submit_profile` has `lifecycle.completesRun`), and the submitted
 * profile is returned.
 */
import {
  resolveModelConfig,
  resolveProviderKey,
  runAgentSession,
  type ClineCoreLike,
} from "@nagriksetu/agents";
import {
  HARVESTER_ENV_PREFIX,
  loadConfig,
  type HarvesterConfig,
} from "../config.js";
import { createProfileStore, makeProfilerTools } from "./tools.js";

export const PROFILER_MAX_ITERATIONS = 25;

export const PROFILER_SYSTEM_PROMPT = [
  "You profile PMC welfare schemes from official sources only.",
  "Rules: official-sources-only; prefer 'unknown' over guessing;",
  "numbers and dates must appear in the source text you quote.",
  "Read text via read_source; scanned pages arrive as turn images.",
  "Finish by calling submit_profile exactly once.",
].join(" ");

export interface ProfilerInput {
  prompt: string;
  /**
   * Official source documents (already downloaded + text-extracted) the agent
   * may read via `list_sources` / `read_source`. Seeded into the draft store.
   */
  sources?: Array<{ id: string; kind: string; text: string }>;
  /** Data-URL PNGs of scanned pages; attached to the turn, not tools. */
  userImages?: string[];
  cwd?: string;
  workspaceRoot?: string;
}

export interface ProfilerDeps {
  createCore?: (options: Record<string, unknown>) => Promise<ClineCoreLike>;
  config?: HarvesterConfig;
  /** Model env override for tests; defaults to process.env. */
  env?: NodeJS.ProcessEnv;
}

export interface ProfilerOutput {
  sessionId: string;
  /** The raw `profile_json` string from `submit_profile`, or null if not submitted. */
  submitted: string | null;
  events: unknown[];
}

/** Start one profiler session, run to completion, and return the submission. */
export async function runProfiler(
  input: ProfilerInput,
  deps: ProfilerDeps = {},
): Promise<ProfilerOutput> {
  const cfg = deps.config ?? loadConfig();
  const env = deps.env ?? process.env;
  const envModel = resolveModelConfig(env, HARVESTER_ENV_PREFIX);
  const providerId = cfg.providerId ?? envModel.providerId;
  // Scan pages are attached as images; glm-5.3 is text-only, so switch to the
  // vision-capable model whenever images ride the turn.
  const hasImages = (input.userImages?.length ?? 0) > 0;
  const modelId = hasImages
    ? (cfg.visionModelId ?? envModel.modelId)
    : (cfg.modelId ?? envModel.modelId);
  const apiKey =
    cfg.llmApiKey ??
    cfg.anthropicApiKey ??
    resolveProviderKey(env, providerId, HARVESTER_ENV_PREFIX);
  const store = createProfileStore();
  store.sources = input.sources ?? [];
  const tools = makeProfilerTools(store);
  const cwd = input.cwd ?? process.cwd();
  const session = await runAgentSession({
    systemPrompt: PROFILER_SYSTEM_PROMPT,
    prompt: input.prompt,
    userImages: input.userImages ?? [],
    tools,
    providerId,
    modelId,
    apiKey,
    maxIterations: PROFILER_MAX_ITERATIONS,
    cwd,
    workspaceRoot: input.workspaceRoot ?? cwd,
    clientName: "nagriksetu-harvester",
    env,
    prefix: HARVESTER_ENV_PREFIX,
    createCore: deps.createCore,
  });
  return { sessionId: session.sessionId, submitted: store.submitted, events: session.events };
}

