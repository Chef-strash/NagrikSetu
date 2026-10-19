import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { ClineCore } from "@cline/sdk";
import { describe, expect, it } from "vitest";
import { createTool, emptyInputSchema } from "./tools.js";
import {
  AgentSessionError,
  HARNESS_DATA_DIR_PREFIX,
  runAgentSession,
  type ClineCoreLike,
  type CoreFactory,
} from "./session.js";
import { DEFAULT_MODEL_ID, DEFAULT_VISION_MODEL_ID } from "./models.js";

/** 1x1 PNG — stands in for an uploaded page image. */
const IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
/** The base64 payload as the SDK stores it in the session artifact. */
const IMAGE_BASE64 = IMAGE.slice("data:image/png;base64,".length);

type ToolStub = { name: string; execute: (input: unknown) => unknown };

function makeTools() {
  const store: { submitted: unknown } = { submitted: undefined };
  const tools = [
    createTool({
      name: "record_field",
      description: "Record one field.",
      inputSchema: emptyInputSchema,
      async execute() {
        return { recorded: true };
      },
    }),
    createTool({
      name: "submit",
      description: "Submit the extraction and end the run.",
      inputSchema: emptyInputSchema,
      lifecycle: { completesRun: true },
      async execute(input: Record<string, unknown>) {
        store.submitted = input;
        return { submitted: true };
      },
    }),
  ];
  return { store, tools };
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(full);
    }
  };
  walk(dir);
  return out;
}

function filesContaining(dir: string, needle: string): string[] {
  return listFiles(dir).filter((file) => {
    try {
      return readFileSync(file, "utf8").includes(needle);
    } catch {
      return false;
    }
  });
}

/**
 * The SDK persists the session messages artifact fire-and-forget
 * (`void this.invoke("persistSessionMessages", ...)` in local-runtime-host.ts),
 * so the prompt can land a few milliseconds after `start()` resolves. Wait for
 * it — the run is still open at this point, so the purge has not run yet.
 */
async function waitForMarker(
  dir: string,
  marker: string,
  timeoutMs = 5_000,
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let hits = filesContaining(dir, marker).length;
  while (hits === 0 && Date.now() < deadline) {
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    hits = filesContaining(dir, marker).length;
  }
  return hits;
}


describe("runAgentSession", () => {
  it("returns the submitted payload when the completion tool runs", async () => {
    const { tools, store } = makeTools();
    let startInput: Record<string, unknown> = {};
    let listener: ((event: unknown) => void) | null = null;
    let dirDuringRun: string | undefined;
    let existedDuringRun = false;
    const core: ClineCoreLike = {
      subscribe: (fn) => {
        listener = fn;
        return () => {};
      },
      start: async (input) => {
        startInput = input;
        dirDuringRun = process.env["CLINE_DATA_DIR"];
        existedDuringRun = Boolean(dirDuringRun) && existsSync(dirDuringRun as string);
        listener?.({ type: "chunk" });
        const config = input["config"] as { extraTools: ToolStub[] };
        const submit = config.extraTools.find((tool) => tool.name === "submit");
        await submit?.execute({ document_type_guess: "aadhaar" });
        return { sessionId: "sess-1" };
      },
    };

    const envBefore = process.env["CLINE_DATA_DIR"];
    const out = await runAgentSession({
      systemPrompt: "audit rules",
      prompt: "read this document",
      userImages: [IMAGE],
      tools,
      env: ISOLATED_ENV,
      prefix: "AUDIT",
      createCore: async () => core,
    });

    // The submission is what the completion tool received, and the store too.
    expect(out.submitted).toEqual({ document_type_guess: "aadhaar" });
    expect(store.submitted).toEqual({ document_type_guess: "aadhaar" });
    expect(out.sessionId).toBe("sess-1");
    expect(out.events).toEqual([{ type: "chunk" }]);

    // The harness store was redirected into a volatile dir for the run...
    expect(existedDuringRun).toBe(true);
    expect((dirDuringRun as string).startsWith(tmpdir())).toBe(true);
    expect(
      basename(dirDuringRun as string).startsWith(HARNESS_DATA_DIR_PREFIX),
    ).toBe(true);
    // ...and removed afterwards, with the ambient env restored.
    expect(existsSync(out.harnessDataDir)).toBe(false);
    expect(process.env["CLINE_DATA_DIR"]).toBe(envBefore);

    // Session config: built-ins off, extraTools passed, images on the turn.
    const config = startInput["config"] as Record<string, unknown>;
    expect(startInput["prompt"]).toBe("read this document");
    expect(startInput["userImages"]).toEqual([IMAGE]);
    expect(config).toMatchObject({
      providerId: "cline-pass",
      modelId: DEFAULT_VISION_MODEL_ID,
      systemPrompt: "audit rules",
      enableTools: false,
      enableSpawnAgent: false,
      enableAgentTeams: false,
      maxIterations: 25,
    });
    expect((config["extraTools"] as unknown[]).length).toBe(2);
  });

  it("uses the text model when no images are attached", async () => {
    const { tools } = makeTools();
    let modelId: unknown;
    const core: ClineCoreLike = {
      subscribe: () => () => {},
      start: async (input) => {
        modelId = (input["config"] as Record<string, unknown>)["modelId"];
        const config = input["config"] as { extraTools: ToolStub[] };
        await config.extraTools.find((tool) => tool.name === "submit")?.execute({});
        return { sessionId: "sess-text" };
      },
    };
    const out = await runAgentSession({
      systemPrompt: "s",
      prompt: "p",
      tools,
      env: ISOLATED_ENV,
      createCore: async () => core,
    });
    expect(modelId).toBe(DEFAULT_MODEL_ID);
    expect(out.modelId).toBe(DEFAULT_MODEL_ID);
  });

  it("reports a clear error when the run ends without a submission", async () => {
    const { tools } = makeTools();
    let dirDuringRun: string | undefined;
    const core: ClineCoreLike = {
      subscribe: () => () => {},
      start: async () => {
        dirDuringRun = process.env["CLINE_DATA_DIR"];
        return { sessionId: "sess-2" };
      },
    };

    const error = await runAgentSession({
      systemPrompt: "s",
      prompt: "p",
      tools,
      env: ISOLATED_ENV,
      createCore: async () => core,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AgentSessionError);
    expect((error as Error).message).toContain(
      'ended without calling the completion tool "submit"',
    );
    // The volatile dir is purged on the failure path too.
    expect(dirDuringRun).toBeDefined();
    expect(existsSync(dirDuringRun as string)).toBe(false);
  });

  it("refuses to run without a completesRun tool", async () => {
    const { tools } = makeTools();
    const createCore: CoreFactory = async () => {
      throw new Error("the core must not be created");
    };
    await expect(
      runAgentSession({
        systemPrompt: "s",
        prompt: "p",
        tools: tools.filter((tool) => tool.name !== "submit"),
        env: ISOLATED_ENV,
        createCore,
      }),
    ).rejects.toThrow(/needs exactly one tool with lifecycle\.completesRun/);
  });
});

/** Env for key/model resolution: no Cline credential store, no ambient key. */
const ISOLATED_ENV: NodeJS.ProcessEnv = {
  CLINE_DATA_DIR: "/nonexistent-nagriksetu-agents",
};


/**
 * KTD1a — the whole point of the redirect. This test drives the REAL
 * `@cline/sdk` core (no mock), so it observes what the SDK actually does.
 */
describe("KTD1a: the harness session store does not retain a request", () => {
  it(
    "writes the prompt and attached image inside the volatile run dir, and leaves nothing behind",
    async () => {
      const { tools } = makeTools();
      const marker = `KTD1A-MARKER-${Date.now()}-must-not-survive`;
      let dirDuringRun: string | undefined;
      let residueDuringRun: string[] = [];
      let markerHitsDuringRun: string[] = [];
      let imageHitsDuringRun: string[] = [];

      // Wrap the real factory so the residue can be snapshotted *before*
      // runAgentSession's finally purges the directory.
      const createRealCore: CoreFactory = async (options) => {
        const real = await (
          ClineCore.create as unknown as (
            options: Record<string, unknown>,
          ) => Promise<ClineCoreLike>
        )(options);
        return {
          subscribe: (listener) => real.subscribe(listener),
          start: async (input) => {
            const dir = process.env["CLINE_DATA_DIR"];
            dirDuringRun = dir;
            try {
              const started = await real.start(input);
              if (dir) await waitForMarker(dir, marker);
              return started;
            } finally {
              residueDuringRun = dir ? listFiles(dir) : [];
              markerHitsDuringRun = dir ? filesContaining(dir, marker) : [];
              imageHitsDuringRun = dir ? filesContaining(dir, IMAGE_BASE64) : [];
            }
          },
        };
      };

      // An invalid key makes the provider call fail fast; the SDK still writes
      // the session artifact, which is exactly what this test is about.
      const ambientDataDirBefore = process.env["CLINE_DATA_DIR"];
      const failure = await runAgentSession({
        systemPrompt: "KTD1a probe",
        prompt: marker,
        userImages: [IMAGE],
        tools,
        apiKey: "invalid-key",
        maxIterations: 1,
        env: ISOLATED_ENV,
        clientName: "nagriksetu-agents-ktd1a-test",
        createCore: createRealCore,
      }).catch((caught: unknown) => caught);

      // 1. The run really did go through the real SDK, in the volatile dir.
      expect(dirDuringRun).toBeDefined();
      expect((dirDuringRun as string).startsWith(tmpdir())).toBe(true);
      expect(
        basename(dirDuringRun as string).startsWith(HARNESS_DATA_DIR_PREFIX),
      ).toBe(true);

      // 2. Proof the SDK wrote the prompt and the image to disk while running.
      //    (The hits are captured during the run, because the purge has already
      //    deleted the paths by the time these assertions execute.)
      expect(residueDuringRun.length).toBeGreaterThan(0);
      expect(markerHitsDuringRun.length).toBeGreaterThan(0);
      expect(imageHitsDuringRun.length).toBeGreaterThan(0);

      // 3. Nothing survives the call: the run dir is gone, and the ambient
      //    process env (the real harness store) is back where it was.
      expect(existsSync(dirDuringRun as string)).toBe(false);
      expect(process.env["CLINE_DATA_DIR"]).toBe(ambientDataDirBefore);
      expect(process.env["CLINE_SESSION_DATA_DIR"]).toBe(undefined);

      // 4. Nothing is left in any volatile run dir under the OS temp folder...
      const leftovers = readdirSync(tmpdir())
        .filter((name) => name.startsWith(HARNESS_DATA_DIR_PREFIX))
        .map((name) => join(tmpdir(), name))
        .filter((dir) => filesContaining(dir, marker).length > 0);
      expect(leftovers).toEqual([]);

      // 5. ...and nothing reached the real harness session/credential store.
      expect(
        filesContaining(join(homedir(), ".cline", "data", "sessions"), marker),
      ).toEqual([]);
      expect(
        filesContaining(join(homedir(), ".cline", "data", "db"), marker).filter(
          (file) => file.endsWith("sessions.db"),
        ),
      ).toEqual([]);

      // The run reports the missing submission (the model never answered).
      expect(failure).toBeInstanceOf(AgentSessionError);
    },
    120_000,
  );
});
