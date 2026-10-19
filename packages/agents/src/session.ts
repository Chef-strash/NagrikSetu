/**
 * One Cline SDK agent session (KTD1), with the harness store confined to a
 * volatile per-run directory (KTD1a).
 *
 * ## What this does
 * `ClineCore.create` -> `start` -> `subscribe`, with built-in tools disabled
 * (`enableTools: false`, `enableSpawnAgent: false`, `enableAgentTeams: false`),
 * custom tools passed as `extraTools`, and the run ended by the one tool that
 * carries `lifecycle.completesRun`. This is the shape proven in
 * `packages/harvester/src/agent/profiler.ts`.
 *
 * ## KTD1a — why the harness data dir is redirected
 * `@cline/core`'s local backend persists every session under the harness data
 * dir: `<dataDir>/sessions/<id>/<id>.messages.json` and
 * `<dataDir>/db/sessions.db` hold the FULL prompt, and any `userImages` as
 * base64 `data:` URLs. For the citizen document audit that is a citizen's
 * Aadhaar or passbook photograph landing on persistent disk.
 *
 * `@cline/shared/storage` resolves that location at call time, in this order:
 *   - sessions dir: `CLINE_SESSION_DATA_DIR` -> else `<CLINE_DATA_DIR>/sessions`
 *   - sqlite db:    `CLINE_DB_DATA_DIR`      -> else `<CLINE_DATA_DIR>/db`
 *   - `<CLINE_DATA_DIR>` itself              -> else `<HOME>/.cline/data`
 * and `ClineCore.create` reads it while constructing the local session backend.
 * So `runAgentSession` sets all three variables to a fresh directory under
 * `os.tmpdir()` before creating the core, and deletes that directory in a
 * `finally` once the run is over. Nothing survives the call, on success or on
 * failure. `session.test.ts` asserts this against the real SDK.
 */
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClineCore } from "@cline/sdk";
import { resolveProviderKey } from "./provider.js";
import {
  DEFAULT_ENV_PREFIX,
  chooseModelId,
  imagesAttached,
  resolveModelConfig,
} from "./models.js";
import {
  findCompletionTool,
  isCompletionTool,
  type CompletionToolLike,
} from "./tools.js";

/** Iterations allowed before the harness gives up on a turn. */
export const DEFAULT_MAX_ITERATIONS = 25;

/** Prefix of the volatile per-run harness directory (assertable in tests). */
export const HARNESS_DATA_DIR_PREFIX = "nagriksetu-agent-run-";

/** Delete attempts before `runAgentSession` reports residue. */
export const HARNESS_PURGE_ATTEMPTS = 4;

/** Gap between purge attempts (ms) — lets an in-flight SDK write settle. */
export const HARNESS_PURGE_DELAY_MS = 100;

/**
 * The env variables that decide where the Cline SDK's local backend writes
 * (verified against `@cline/shared/storage` 0.0.90). All three are redirected:
 * `CLINE_SESSION_DATA_DIR` / `CLINE_DB_DATA_DIR` take precedence over
 * `CLINE_DATA_DIR`, so leaving them set would let a run escape the redirect.
 */
export const HARNESS_DATA_ENV_VARS = [
  "CLINE_DATA_DIR",
  "CLINE_SESSION_DATA_DIR",
  "CLINE_DB_DATA_DIR",
] as const;

/** Minimal structural type for a started core (mock-friendly). */
export interface ClineCoreLike {
  start: (
    input: Record<string, unknown>,
  ) => Promise<{ sessionId: string } & Record<string, unknown>>;
  subscribe: (
    listener: (event: unknown) => void,
    options?: Record<string, unknown>,
  ) => unknown;
}

/** Injectable core factory — the seam tests use to run without the real SDK. */
export type CoreFactory = (
  options: Record<string, unknown>,
) => Promise<ClineCoreLike>;

export interface AgentSessionInput {
  /** System prompt for the run (the profiler's rules block, the audit's rules). */
  systemPrompt: string;
  /** The user turn. Never logged. */
  prompt: string;
  /** Rendered page images as `data:image/png;base64,...` URLs (turn images). */
  userImages?: readonly string[] | undefined;
  /** Custom tools; exactly one must carry `lifecycle.completesRun`. */
  tools?: readonly unknown[] | undefined;
  providerId?: string | undefined;
  modelId?: string | undefined;
  visionModelId?: string | undefined;
  apiKey?: string | undefined;
  maxIterations?: number | undefined;
  cwd?: string | undefined;
  workspaceRoot?: string | undefined;
  clientName?: string | undefined;
  /** Env used for key/model resolution; defaults to `process.env`. */
  env?: NodeJS.ProcessEnv | undefined;
  /** Caller's env prefix (`HARVESTER`, `AUDIT`). */
  prefix?: string | undefined;
  createCore?: CoreFactory | undefined;
}

export interface AgentSessionResult {
  sessionId: string;
  /** Input passed to the completion tool; a missing submission throws instead. */
  submitted: unknown;
  events: unknown[];
  providerId: string;
  modelId: string;
  /** Volatile harness dir used for this run — already removed when this resolves. */
  harnessDataDir: string;
}

/** Raised when a run cannot be started or ends without a submission. */
export class AgentSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentSessionError";
  }
}

/** A fresh volatile directory for one run's harness state. */
export function createHarnessDataDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), HARNESS_DATA_DIR_PREFIX));
}

/**
 * Point the Cline SDK's local backend at `dir` and return a restore function.
 * Always applies to `process.env`: the SDK reads `process.env` directly, so a
 * caller-supplied env object would not move the store.
 */
export function redirectHarnessDataDir(
  dir: string,
  env: NodeJS.ProcessEnv = process.env,
): () => void {
  const previous = HARNESS_DATA_ENV_VARS.map(
    (name) => [name, env[name]] as const,
  );
  env["CLINE_DATA_DIR"] = dir;
  env["CLINE_SESSION_DATA_DIR"] = join(dir, "sessions");
  env["CLINE_DB_DATA_DIR"] = join(dir, "db");
  return () => {
    for (const [name, value] of previous) {
      if (value === undefined) delete env[name];
      else env[name] = value;
    }
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Delete the volatile harness dir and confirm it stays deleted.
 *
 * One `rm -rf` is not sufficient on its own. The SDK persists session messages
 * fire-and-forget (`local-runtime-host.ts`: `void this.invoke(
 * "persistSessionMessages", ...)`), and `SessionManifestStore
 * .persistSessionMessages` does `mkdirSync` before `writeFileSync` — so a write
 * still in flight when the run settles would recreate the directory with the
 * prompt and the base64 page images inside it. This deletes, lets the event
 * loop drain, and re-checks, reporting `false` when the directory refuses to
 * stay gone.
 */
export async function purgeHarnessDataDir(
  dir: string,
  attempts: number = HARNESS_PURGE_ATTEMPTS,
  delayMs: number = HARNESS_PURGE_DELAY_MS,
): Promise<boolean> {
  const rounds = Math.max(1, Math.floor(attempts));
  for (let round = 0; round < rounds; round += 1) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    await sleep(delayMs);
    if (!existsSync(dir)) return true;
  }
  return false;
}

/** Wrap the completion tool so its input becomes the run's submission. */
function wrapCompletionTool(
  tool: CompletionToolLike,
  onSubmitted: (input: unknown) => void,
): unknown {
  const original = tool as unknown as Record<string, unknown>;
  return {
    ...original,
    execute: async (...args: unknown[]) => {
      onSubmitted(args[0]);
      return await tool.execute(...args);
    },
  };
}

const defaultCreateCore: CoreFactory = (options) =>
  // `ClineCore.create` is the real factory; the cast keeps the structural
  // `ClineCoreLike` seam so tests can inject a mock (same as the profiler).
  ClineCore.create.bind(ClineCore)(options) as unknown as Promise<ClineCoreLike>;

/**
 * Run one agent session to completion and return the submission.
 *
 * The api key is resolved BEFORE the harness data dir is redirected: the Cline
 * OAuth token lives under the real data dir, not the volatile one.
 */
export async function runAgentSession(
  input: AgentSessionInput,
): Promise<AgentSessionResult> {
  const env = input.env ?? process.env;
  const prefix = input.prefix ?? DEFAULT_ENV_PREFIX;
  const modelConfig = resolveModelConfig(env, prefix);
  const providerId = input.providerId ?? modelConfig.providerId;
  const attached = imagesAttached(input.userImages);
  const modelId =
    input.modelId ??
    chooseModelId(
      {
        modelId: modelConfig.modelId,
        visionModelId: input.visionModelId ?? modelConfig.visionModelId,
      },
      attached,
    );
  const apiKey = input.apiKey ?? resolveProviderKey(env, providerId, prefix);

  const tools = input.tools ?? [];
  const completionIndex = tools.findIndex(isCompletionTool);
  if (completionIndex < 0) {
    throw new AgentSessionError(
      "runAgentSession needs exactly one tool with lifecycle.completesRun to end the run; none was supplied",
    );
  }
  const completion = tools[completionIndex] as CompletionToolLike;
  let submitted: unknown;
  let hasSubmission = false;
  const extraTools = tools.map((tool, index) =>
    index === completionIndex
      ? wrapCompletionTool(completion, (value) => {
          submitted = value;
          hasSubmission = true;
        })
      : tool,
  );

  const harnessDataDir = await createHarnessDataDir();
  const restoreEnv = redirectHarnessDataDir(harnessDataDir);
  let result: AgentSessionResult | undefined;
  let runError: unknown;
  let purged = false;
  try {
    try {
      const create = input.createCore ?? defaultCreateCore;
      const core = await create({
        clientName: input.clientName ?? "nagriksetu-agents",
        backendMode: "local",
      });
      const events: unknown[] = [];
      core.subscribe((event: unknown) => {
        events.push(event);
      });
      const cwd = input.cwd ?? process.cwd();
      const session = await core.start({
        prompt: input.prompt,
        userImages: [...(input.userImages ?? [])],
        config: {
          providerId,
          modelId,
          apiKey,
          systemPrompt: input.systemPrompt,
          cwd,
          workspaceRoot: input.workspaceRoot ?? cwd,
          enableTools: false,
          enableSpawnAgent: false,
          enableAgentTeams: false,
          extraTools,
          maxIterations: input.maxIterations ?? DEFAULT_MAX_ITERATIONS,
        },
      });
      if (!hasSubmission) {
        throw new AgentSessionError(
          `agent session ${session.sessionId} ended without calling the completion tool "${completion.name}"; nothing was submitted`,
        );
      }
      result = {
        sessionId: session.sessionId,
        submitted,
        events,
        providerId,
        modelId,
        harnessDataDir,
      };
    } finally {
      restoreEnv();
      purged = await purgeHarnessDataDir(harnessDataDir);
    }
  } catch (error) {
    runError = error;
  }
  if (!purged) {
    // Residue outranks whatever else happened: this is the KTD1a stop condition.
    const detail =
      runError instanceof Error ? ` (original failure: ${runError.message})` : "";
    throw new AgentSessionError(
      `harness data dir ${harnessDataDir} survived the purge; session artifacts may remain on disk${detail}`,
    );
  }
  if (result === undefined) {
    throw runError ??
      new AgentSessionError("agent session ended without a result or an error");
  }
  return result;
}

export { findCompletionTool };

