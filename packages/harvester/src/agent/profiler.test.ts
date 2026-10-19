import { describe, expect, it } from "vitest";
import { PROFILER_SYSTEM_PROMPT, runProfiler } from "./profiler.js";

const CONFIG = {
  supabaseUrl: undefined,
  supabaseServiceRoleKey: undefined,
  anthropicApiKey: "k",
  scraperMode: "fixture" as const,
  hasLiveSupabase: false,
  hasLlmKey: true,
};

describe("profiler", () => {
  it("system prompt carries official-sources-only + unknown-over-guessing", () => {
    expect(PROFILER_SYSTEM_PROMPT).toContain("official sources only");
    expect(PROFILER_SYSTEM_PROMPT).toContain("unknown");
  });

  it("creates nagriksetu-harvester local core, runs to completion, returns store.submitted", async () => {
    let createOptions: Record<string, unknown> = {};
    let startInput: Record<string, unknown> = {};
    let listener: ((e: unknown) => void) | null = null;
    let submittedValue: string | null = null;
    const fakeCore = {
      subscribe: (fn: (e: unknown) => void) => {
        listener = fn;
        return () => {};
      },
      start: async (input: Record<string, unknown>) => {
        startInput = input;
        listener?.({ type: "chunk" });
        // Simulate the model calling submit_profile (a completesRun tool).
        const config = input["config"] as { extraTools: Array<{ name: string; execute: Function }> };
        const submit = config.extraTools.find((t) => t.name === "submit_profile")!;
        await submit.execute({ profile_json: '{"slug":"pmc-svanidhi-hawker"}' });
        return { sessionId: "sess-1" };
      },
    };
    const out = await runProfiler(
      { prompt: "Profile s1", userImages: ["data:image/png;base64,AAA"] },
      {
        config: CONFIG,
        env: {},
        createCore: async (options: Record<string, unknown>) => {
          createOptions = options;
          return fakeCore;
        },
      },
    );
    submittedValue = out.submitted;
    expect(out.sessionId).toBe("sess-1");
    expect(out.submitted).toBe('{"slug":"pmc-svanidhi-hawker"}');
    expect(submittedValue).toBe('{"slug":"pmc-svanidhi-hawker"}');
    expect(out.events).toEqual([{ type: "chunk" }]);
    expect(createOptions).toMatchObject({
      clientName: "nagriksetu-harvester",
      backendMode: "local",
    });
    const config = startInput["config"] as Record<string, unknown>;
    expect(startInput["userImages"]).toEqual(["data:image/png;base64,AAA"]);
    expect(config).toMatchObject({
      providerId: "cline-pass",
      modelId: "cline-pass/glm-5.3",
      enableTools: false,
      enableSpawnAgent: false,
      enableAgentTeams: false,
      maxIterations: 25,
    });
    expect(Array.isArray(config["extraTools"])).toBe(true);
    expect((config["extraTools"] as unknown[]).length).toBe(6);
    expect(String(config["systemPrompt"])).toContain("unknown");
  });

  it("reads provider/model from HARVESTER_* env with defaults", async () => {
    let startInput: Record<string, unknown> = {};
    const fakeCore = {
      subscribe: () => () => {},
      start: async (input: Record<string, unknown>) => {
        startInput = input;
        // The shared runner requires the completesRun tool to end the run.
        const config = input["config"] as { extraTools: Array<{ name: string; execute: Function }> };
        const submit = config.extraTools.find((t) => t.name === "submit_profile")!;
        await submit.execute({ profile_json: '{"slug":"pmc-svanidhi-hawker"}' });
        return { sessionId: "sess-2" };
      },
    };
    await runProfiler(
      { prompt: "Profile s2" },
      {
        config: { ...CONFIG },
        env: { HARVESTER_PROVIDER_ID: "openai-compatible", HARVESTER_MODEL_ID: "gpt-5" },
        createCore: async () => fakeCore,
      },
    );
    const config = startInput["config"] as Record<string, unknown>;
    expect(config["providerId"]).toBe("openai-compatible");
    expect(config["modelId"]).toBe("gpt-5");
  });
});

