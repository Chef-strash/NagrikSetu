/**
 * Typed SDK surface for the harvester agent stream (task_0004).
 *
 * Verified against the published `@cline/sdk` (0.0.90): `ClineCore.create`,
 * `start`, `subscribe`, `createTool`, `extraTools`, `userImages` on the turn,
 * `lifecycle: { completesRun: true }`, and stateless `Agent` for triage.
 * All agent code imports the SDK through this module so tests can inject
 * mocks without touching the real harness.
 *
 * Provider/model defaults, the vision default and `resolveModelConfig` now live
 * in the shared `@nagriksetu/agents` package (KTD3), alongside the session runner
 * (`runAgentSession`, KTD1). This module only re-exports, so the harvester keeps
 * a single import path for the SDK and model surface.
 */
export { Agent, ClineCore, createTool } from "@cline/sdk";

export {
  DEFAULT_MODEL_ID,
  DEFAULT_PROVIDER_ID,
  DEFAULT_VISION_MODEL_ID,
  REQUIRED_NODE_MAJOR,
  meetsNodeRequirement,
  resolveModelConfig,
  type ClineCoreLike,
} from "@nagriksetu/agents";

/** Minimal structural type for a stateless triage agent (mock-friendly). */
export interface TriageAgentLike {
  run: (input: string) => Promise<{ outputText: string }>;
}
