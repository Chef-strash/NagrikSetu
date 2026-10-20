import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUDIT_ENV_PREFIX,
  AUDIT_TOKEN_ENV,
  DEFAULT_AUDIT_HOST,
  DEFAULT_AUDIT_PORT,
  DEFAULT_MAX_PAGES,
  DEFAULT_MAX_UPLOAD_BYTES,
  loadAuditConfig,
} from "./config.js";

describe("loadAuditConfig", () => {
  it("uses the AUDIT_* prefix for provider and models (KTD2, KTD3)", () => {
    const config = loadAuditConfig({
      AUDIT_PROVIDER_ID: "cline-pass",
      AUDIT_MODEL_ID: "cline-pass/glm-5.3",
      AUDIT_VISION_MODEL_ID: "cline-pass/qwen3.7-plus",
      AUDIT_API_KEY: "audit-key",
    });
    expect(AUDIT_ENV_PREFIX).toBe("AUDIT");
    expect(config.providerId).toBe("cline-pass");
    expect(config.modelId).toBe("cline-pass/glm-5.3");
    expect(config.visionModelId).toBe("cline-pass/qwen3.7-plus");
    expect(config.apiKey).toBe("audit-key");
  });

  it("falls back to the stored Cline token when it has no key of its own", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "audit-cline-dir-"));
    await mkdir(join(dataDir, "settings"), { recursive: true });
    await writeFile(
      join(dataDir, "settings", "providers.json"),
      JSON.stringify({
        providers: { cline: { settings: { auth: { accessToken: "fixture-token" } } } },
      }),
      "utf8",
    );
    try {
      const config = loadAuditConfig({ CLINE_DATA_DIR: dataDir });
      expect(config.providerId).toBe("cline-pass");
      expect(config.modelId).toBe("cline-pass/glm-5.3");
      expect(config.visionModelId).toBe("cline-pass/qwen3.7-plus");
      expect(config.apiKey).toBe("fixture-token");
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("ignores the harvester's prefix but honours CLINE_API_KEY", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "audit-cline-dir-"));
    try {
      // No stored token for this data dir, so only env variables can answer.
      expect(
        loadAuditConfig({
          HARVESTER_API_KEY: "harvester-key",
          CLINE_DATA_DIR: dataDir,
        }).apiKey,
      ).toBeUndefined();
      expect(
        loadAuditConfig({ CLINE_API_KEY: "cline-key", CLINE_DATA_DIR: dataDir })
          .apiKey,
      ).toBe("cline-key");
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("binds loopback with the documented defaults", () => {
    const config = loadAuditConfig({});
    expect(config.host).toBe(DEFAULT_AUDIT_HOST);
    expect(config.port).toBe(DEFAULT_AUDIT_PORT);
    expect(config.maxPages).toBe(DEFAULT_MAX_PAGES);
    expect(config.maxBodyBytes).toBe(DEFAULT_MAX_UPLOAD_BYTES + 1024 * 1024);
    expect(config.maxConcurrentRuns).toBeGreaterThan(0);
    expect(config.runTimeoutMs).toBeGreaterThan(0);
  });

  it("requires a service token to be configured out of band", () => {
    expect(loadAuditConfig({}).serviceToken).toBeUndefined();
    expect(
      loadAuditConfig({ [AUDIT_TOKEN_ENV]: "  s3cret  " }).serviceToken,
    ).toBe("s3cret");
  });

  it("reports Supabase as configured only with both url and key (R14)", () => {
    expect(loadAuditConfig({}).hasSupabase).toBe(false);
    expect(loadAuditConfig({ SUPABASE_URL: "https://x.supabase.co" }).hasSupabase).toBe(
      false,
    );
    expect(
      loadAuditConfig({
        SUPABASE_URL: "https://x.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "role-key",
      }).hasSupabase,
    ).toBe(true);
  });

  it("keeps the tesseract cache out of the working directory", () => {
    expect(loadAuditConfig({}).tessdataCacheDir).not.toBe(".");
    expect(
      loadAuditConfig({ AUDIT_TESSDATA_CACHE_DIR: "/tmp/nagriksetu-tessdata" })
        .tessdataCacheDir,
    ).toBe("/tmp/nagriksetu-tessdata");
    expect(
      loadAuditConfig({ AUDIT_TESSDATA_DIR: "/opt/tessdata" }).tessdataDir,
    ).toBe("/opt/tessdata");
  });

  it("ignores non-numeric caps rather than producing NaN limits", () => {
    const config = loadAuditConfig({ AUDIT_MAX_PAGES: "lots" });
    expect(config.maxPages).toBe(DEFAULT_MAX_PAGES);
  });

  it("reports text-only mode only when explicitly set", () => {
    expect(loadAuditConfig({}).textOnly).toBe(false);
    expect(loadAuditConfig({ AUDIT_TEXT_ONLY: "1" }).textOnly).toBe(true);
  });
});
