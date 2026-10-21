// Provider-agnostic LLM client. Zero dependencies — uses global fetch.
//
// Configure via environment (backend/.env or repo-root .env):
//   ANTHROPIC_API_KEY      -> Anthropic  (default model: claude-3-5-sonnet-latest)
//   OPENAI_API_KEY         -> OpenAI     (default model: gpt-4o-mini)
//   [OPENAI_BASE_URL]      -> any OpenAI-compatible endpoint (Groq, Together, Sarvam, OpenRouter…)
//   [LLM_API_KEY] / [LLM_BASE_URL] / [LLM_MODEL] -> generic OpenAI-compatible provider
//   [LLM_PROVIDER]         -> force "anthropic" | "openai"
//
// If nothing is configured, `getLlmConfig()` returns null and callers fall back to
// their deterministic behaviour (so the service still works offline / in tests).

import { clineComplete } from "./cline-llm.ts";

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_ANTHROPIC_MODEL = "claude-3-5-sonnet-latest";

export type LlmProviderKind = "openai" | "anthropic" | "cline";

export interface LlmProviderConfig {
  provider: LlmProviderKind;
  apiKey: string;
  model: string;
  baseUrl: string;
}

function isTruthy(value: string): boolean {
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmOptions {
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmError";
  }
}

function env(name: string): string {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : "";
}

export function getLlmConfig(): LlmProviderConfig | null {
  if (isTruthy(env("NAGRIKSETU_DISABLE_LLM"))) return null;

  const forced = env("LLM_PROVIDER").toLowerCase();

  // Cline SDK route (no provider API key): opt in via LLM_PROVIDER=cline or CLINE_MODEL_ID.
  if (forced === "cline" || env("CLINE_MODEL_ID")) {
    return {
      provider: "cline",
      apiKey: "",
      model: env("CLINE_MODEL_ID") || "cline-pass/deepseek-v4.1-flash",
      baseUrl: ""
    };
  }

  const anthropicKey = env("ANTHROPIC_API_KEY");
  const openaiKey = env("OPENAI_API_KEY");
  const genericKey = env("LLM_API_KEY");

  if (forced === "anthropic" || (!forced && anthropicKey && !openaiKey && !genericKey)) {
    if (!anthropicKey) return null;
    return {
      provider: "anthropic",
      apiKey: anthropicKey,
      model: env("ANTHROPIC_MODEL") || DEFAULT_ANTHROPIC_MODEL,
      baseUrl: env("ANTHROPIC_BASE_URL") || "https://api.anthropic.com"
    };
  }

  const key = openaiKey || genericKey;
  if (!key) return null;
  return {
    provider: "openai",
    apiKey: key,
    model: env("OPENAI_MODEL") || env("LLM_MODEL") || DEFAULT_OPENAI_MODEL,
    baseUrl: (env("OPENAI_BASE_URL") || env("LLM_BASE_URL") || "https://api.openai.com/v1").replace(/\/+$/, "")
  };
}

export function isLlmConfigured(): boolean {
  return getLlmConfig() !== null;
}

async function callOpenAi(config: LlmProviderConfig, messages: LlmMessage[], options: LlmOptions): Promise<string> {
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: options.temperature ?? 0
  };
  if (options.maxTokens) body.max_tokens = options.maxTokens;
  if (options.json) body.response_format = { type: "json_object" };

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs ?? 20000)
  });
  if (!res.ok) throw new LlmError(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new LlmError("Empty LLM response");
  return content;
}

async function callAnthropic(
  config: LlmProviderConfig,
  messages: LlmMessage[],
  options: LlmOptions
): Promise<string> {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const conversation = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const res = await fetch(`${config.baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0,
      system,
      messages: conversation
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 20000)
  });
  if (!res.ok) throw new LlmError(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  const text = data.content?.map((c) => c.text ?? "").join("");
  if (!text) throw new LlmError("Empty LLM response");
  return text;
}

export async function llmComplete(messages: LlmMessage[], options: LlmOptions = {}): Promise<string> {
  const config = getLlmConfig();
  if (!config) throw new LlmError("No LLM provider configured");
  if (config.provider === "cline") return clineComplete(messages);
  return config.provider === "anthropic"
    ? callAnthropic(config, messages, options)
    : callOpenAi(config, messages, options);
}

/** Extract the first JSON object/array from a possibly fenced model response. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.search(/[[{]/);
    const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new LlmError("LLM did not return JSON");
  }
}

export async function llmCompleteJson<T = unknown>(
  messages: LlmMessage[],
  options: LlmOptions = {}
): Promise<T> {
  const text = await llmComplete(messages, { ...options, json: true });
  return extractJson(text) as T;
}