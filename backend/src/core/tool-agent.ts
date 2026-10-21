// Provider-agnostic tool-calling loop (ReAct-style over a JSON protocol).
//
// Works with ANY text LLM client (Cline SDK, OpenAI, Anthropic): the model is told
// the available tools and must reply with STRICT JSON — either a tool call or the
// final answer. The loop runs the tool, feeds the result back, and repeats.
//
//   { "tool": "<name>", "args": { ... } }   -> execute, feed result back
//   { "answer": "<text>" }                  -> done

import { extractJson, type LlmMessage } from "./llm.ts";

export interface ToolSpec {
  name: string;
  description: string;
  /** arg name -> what it means (rendered into the prompt). */
  parameters: Record<string, string>;
}

export type ToolExecutor = (name: string, args: Record<string, unknown>) => Promise<string>;

export interface ToolStep {
  tool: string;
  args: Record<string, unknown>;
  result: string;
}

export interface ToolAgentResult {
  answer: string;
  steps: ToolStep[];
}

export interface ToolAgentOptions {
  system: string;
  user: string;
  tools: ToolSpec[];
  execute: ToolExecutor;
  complete: (messages: LlmMessage[]) => Promise<string>;
  maxSteps?: number;
  /** Prior conversation turns, inserted as real messages before the current question. */
  messages?: LlmMessage[];
}

const PROTOCOL = `You may call the tools below to gather information before answering.
Reply with STRICT JSON only, exactly one of:
  { "tool": "<tool_name>", "args": { ... } }   // to call a tool
  { "answer": "<final answer>" }               // when you are ready to answer
Call a tool only when it helps. Never invent tool names or arguments.`;

function renderTools(tools: ToolSpec[]): string {
  return tools
    .map((t) => {
      const params = Object.entries(t.parameters)
        .map(([k, v]) => `${k} (${v})`)
        .join(", ");
      return `- ${t.name}${params ? `(${params})` : "()"}: ${t.description}`;
    })
    .join("\n");
}

export function buildToolSystemPrompt(system: string, tools: ToolSpec[]): string {
  return `${system}\n\nAVAILABLE TOOLS:\n${renderTools(tools)}\n\n${PROTOCOL}`;
}

export async function runToolAgent(options: ToolAgentOptions): Promise<ToolAgentResult> {
  const maxSteps = options.maxSteps ?? 4;
  const messages: LlmMessage[] = [
    { role: "system", content: buildToolSystemPrompt(options.system, options.tools) },
    ...(options.messages ?? []).filter((m) => m.role !== "system"),
    { role: "user", content: options.user }
  ];
  const steps: ToolStep[] = [];

  for (let i = 0; i < maxSteps; i += 1) {
    const raw = await options.complete(messages);

    let parsed: unknown = null;
    try {
      parsed = extractJson(raw);
    } catch {
      parsed = null;
    }

    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;

      if (typeof obj.tool === "string" && obj.tool) {
        const args =
          obj.args && typeof obj.args === "object"
            ? (obj.args as Record<string, unknown>)
            : {};
        const result = await options.execute(obj.tool, args);
        steps.push({ tool: obj.tool, args, result });
        messages.push({ role: "assistant", content: raw });
        messages.push({ role: "user", content: `TOOL RESULT (${obj.tool}):\n${result}` });
        continue;
      }

      if (typeof obj.answer === "string" && obj.answer.trim()) {
        return { answer: obj.answer.trim(), steps };
      }
    }

    // Not usable JSON: accept plain prose as the answer, else stop.
    const trimmed = raw.trim();
    if (trimmed && !trimmed.startsWith("{")) return { answer: trimmed, steps };
    break;
  }

  return { answer: "", steps };
}