// Route LLM calls through the Cline SDK, using the locally authenticated Cline
// account (OAuth) instead of a provider API key.
//
// `@cline/llms` is heavy and optional, so it is imported DYNAMICALLY and only when
// the Cline provider is selected (LLM_PROVIDER=cline or CLINE_MODEL_ID set). Any
// failure — package missing, not signed in, gateway "Unauthorized" — throws, so
// callers fall back to the API-key providers or the deterministic paths.
//
// Env:
//   LLM_PROVIDER=cline              enable the Cline route
//   CLINE_PROVIDER_ID=cline         "cline" | "cline-pass" (default "cline")
//   CLINE_MODEL_ID=cline-pass/...   model id (default "cline-pass/deepseek-v4.1-flash")

import type { LlmMessage } from "./llm.ts";

export class ClineLlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClineLlmError";
  }
}

interface ClineLlmChunk {
  type?: string;
  text?: string;
  success?: boolean;
  error?: string;
}

interface ClineLlmHandler {
  createMessage(
    system: string,
    messages: Array<{ role: string; content: Array<{ type: string; text: string }> }>
  ): AsyncIterable<ClineLlmChunk>;
}

interface ClineLlmModule {
  createHandler(config: { providerId: string; modelId: string }): ClineLlmHandler;
}

export interface ClineLlmConfig {
  providerId: string;
  modelId: string;
  /**
   * Explicit key, used when the machine has no local Cline sign-in.
   *
   * `createHandler` falls back to the OAuth token in
   * `~/.cline/data/settings/providers.json`, which only exists on a developer
   * machine that has run `cline` and signed in. On a fresh checkout - an
   * evaluator's laptop, CI, a container - that file is absent, so the key is
   * supplied through `CLINE_API_KEY` instead.
   */
  apiKey?: string | undefined;
}

function env(name: string): string {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : "";
}

/** Returns config when the Cline route is opted in, else null. */
export function getClineLlmConfig(): ClineLlmConfig | null {
  const provider = env("LLM_PROVIDER").toLowerCase();
  const modelId = env("CLINE_MODEL_ID");
  if (provider !== "cline" && !modelId) return null;
  return {
    providerId: env("CLINE_PROVIDER_ID") || "cline",
    modelId: modelId || "cline-pass/deepseek-v4.1-flash",
    apiKey: env("CLINE_API_KEY") || undefined
  };
}

let modulePromise: Promise<ClineLlmModule> | null = null;

/**
 * `@cline/llms` pulls in `@ai-sdk/openai`, which reads `OPENAI_BASE_URL` (and the
 * other provider variables) while its module graph is evaluated. Docker Compose
 * and the `.env` templates supply those keys as EMPTY strings rather than leaving
 * them unset, and an empty value makes `createOpenAI` throw
 * "baseURL must be a non-empty string" - which takes the whole Cline route down and
 * silently degrades every answer to the extractive path. The rest of this service
 * already treats "" as absent (`env()` and `firstEnv()` both skip blanks), so drop
 * the empties before the SDK is imported.
 */
const EMPTY_PROVIDER_VARS = ["OPENAI_BASE_URL", "OPENAI_API_KEY", "OPENAI_MODEL", "ANTHROPIC_API_KEY"];

function dropEmptyProviderVars(): void {
  for (const key of EMPTY_PROVIDER_VARS) {
    const value = process.env[key];
    if (value !== undefined && value.trim() === "") delete process.env[key];
  }
}

function loadModule(): Promise<ClineLlmModule> {
  if (!modulePromise) {
    dropEmptyProviderVars();
    modulePromise = import("@cline/llms").then(
      (mod) => mod as unknown as ClineLlmModule
    );
  }
  return modulePromise;
}

function toConversation(messages: LlmMessage[]) {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: [{ type: "text", text: m.content }] }));
}

function systemOf(messages: LlmMessage[]): string {
  return messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
}

/**
 * Run a completion through the Cline provider. Throws `ClineLlmError` on any
 * failure so the caller can fall back.
 */
export async function clineComplete(messages: LlmMessage[]): Promise<string> {
  const config = getClineLlmConfig();
  if (!config) throw new ClineLlmError("Cline LLM route is not enabled");

  let handler: ClineLlmHandler;
  try {
    const mod = await loadModule();
    handler = mod.createHandler({
      providerId: config.providerId,
      modelId: config.modelId,
      ...(config.apiKey ? { apiKey: config.apiKey } : {})
    });
  } catch (error) {
    throw new ClineLlmError(
      `Failed to load @cline/llms: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  let text = "";
  try {
    for await (const chunk of handler.createMessage(systemOf(messages), toConversation(messages))) {
      if (chunk?.type === "text" && chunk.text) text += chunk.text;
      if (chunk?.type === "done" && chunk.success === false) {
        throw new ClineLlmError(chunk.error || "Cline LLM call failed");
      }
    }
  } catch (error) {
    if (error instanceof ClineLlmError) throw error;
    throw new ClineLlmError(error instanceof Error ? error.message : String(error));
  }

  const trimmed = text.trim();
  if (!trimmed) throw new ClineLlmError("Cline LLM returned an empty response");
  return trimmed;
}