/**
 * Tool construction for the NagrikSetu agent platform.
 *
 * Consumers build custom tools with `createTool` and close them over their own
 * in-memory store (`makeProfilerTools(store)` in the harvester, and the audit's
 * `record_field` / `flag_issue` / `submit_extraction`), then hand the array to
 * `runAgentSession`. `runAgentSession` finds the completion tool through
 * `lifecycle.completesRun` (KTD1) and treats its input as the run's submission.
 */
import { z } from "zod";

export { createTool } from "@cline/sdk";
export type { AgentTool } from "@cline/sdk";

/** Input schema for tools that take no arguments. */
export const emptyInputSchema = z.object({});

/**
 * Structural view of the one tool per session that ends the run and carries the
 * payload the caller wants back (`lifecycle.completesRun`, KTD1).
 */
export interface CompletionToolLike {
  name: string;
  lifecycle: { completesRun?: boolean };
  execute: (...args: unknown[]) => unknown;
}

/** True for a tool carrying `lifecycle.completesRun === true`. */
export function isCompletionTool(tool: unknown): tool is CompletionToolLike {
  if (!tool || typeof tool !== "object") return false;
  const record = tool as {
    name?: unknown;
    lifecycle?: unknown;
    execute?: unknown;
  };
  if (typeof record.name !== "string" || typeof record.execute !== "function") {
    return false;
  }
  const lifecycle = record.lifecycle;
  if (!lifecycle || typeof lifecycle !== "object") return false;
  return (lifecycle as { completesRun?: unknown }).completesRun === true;
}

/** The first completion tool in the array, or `undefined` when there is none. */
export function findCompletionTool(
  tools: readonly unknown[],
): CompletionToolLike | undefined {
  return tools.find(isCompletionTool);
}
