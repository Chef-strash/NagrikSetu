import { describe, expect, it } from "vitest";
import { isAllowlistedUrl, loadConfig } from "./config.js";
import { getSupabaseClient } from "./supabase/client.js";

describe("harvester scaffold contracts", () => {
  it("defaults to live mode with no live clients or LLM key", () => {
    // Point the Cline store at a nonexistent dir so the ambient machine token
    // (~/.cline) does not leak into the assertion.
    const env = { CLINE_DATA_DIR: "/nonexistent-cline-data" } as unknown as NodeJS.ProcessEnv;
    const config = loadConfig(env);
    expect(config.scraperMode).toBe("live");
    expect(config.hasLiveSupabase).toBe(false);
    expect(config.hasLlmKey).toBe(false);
    expect(getSupabaseClient({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it("rejects non-allowlist hosts before any request", () => {
    expect(
      isAllowlistedUrl("https://webadmin.pmc.gov.in/api/listing-api/circular"),
    ).toBe(true);
    expect(isAllowlistedUrl("https://example.com/schemes")).toBe(false);
    expect(isAllowlistedUrl("not-a-url")).toBe(false);
  });
});
