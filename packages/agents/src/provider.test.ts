import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readClineStoredToken, resolveProviderKey } from "./provider.js";

const TOKEN = "stored-cline-oauth-token";

const tempDirs: string[] = [];

/** A throwaway `CLINE_DATA_DIR` holding a signed-in Cline credential store. */
function tokenDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "nagriksetu-agents-token-"));
  tempDirs.push(dir);
  mkdirSync(join(dir, "settings"), { recursive: true });
  writeFileSync(
    join(dir, "settings", "providers.json"),
    JSON.stringify({
      providers: {
        "cline-pass": { settings: { auth: { accessToken: TOKEN } } },
      },
    }),
  );
  return dir;
}

/** A data dir with no credential store, so the ambient machine token cannot leak in. */
const NO_TOKEN_ENV: NodeJS.ProcessEnv = {
  CLINE_DATA_DIR: "/nonexistent-nagriksetu-agents",
};

/**
 * Always merges the no-token data dir, so no assertion can ever resolve the
 * developer's real `~/.cline` token (and print it in a failure diff).
 */
function keyFor(
  values: Record<string, string>,
  providerId = "cline-pass",
  prefix = "AUDIT",
): string | undefined {
  return resolveProviderKey({ ...NO_TOKEN_ENV, ...values }, providerId, prefix);
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("resolveProviderKey (KTD2)", () => {
  it("prefers HARVESTER_API_KEY over CLINE_API_KEY", () => {
    expect(
      keyFor(
        { HARVESTER_API_KEY: "from-harvester", CLINE_API_KEY: "from-cline" },
        "cline-pass",
        "HARVESTER",
      ),
    ).toBe("from-harvester");
  });

  it("prefers AUDIT_API_KEY over CLINE_API_KEY", () => {
    expect(
      keyFor({ AUDIT_API_KEY: "from-audit", CLINE_API_KEY: "from-cline" }),
    ).toBe("from-audit");
  });

  it("defaults to the HARVESTER prefix so existing call sites keep precedence", () => {
    expect(
      resolveProviderKey(
        { ...NO_TOKEN_ENV, HARVESTER_API_KEY: "legacy" },
        "cline-pass",
      ),
    ).toBe("legacy");
  });

  it("does not read another caller's prefixed key", () => {
    expect(keyFor({ HARVESTER_API_KEY: "harvester-only" })).toBeUndefined();
  });

  it("uses CLINE_API_KEY when no prefixed key is set", () => {
    expect(keyFor({ CLINE_API_KEY: "cline-env" })).toBe("cline-env");
  });

  it("falls back to the stored Cline token under a temporary CLINE_DATA_DIR", () => {
    expect(keyFor({ CLINE_DATA_DIR: tokenDataDir() })).toBe(TOKEN);
  });

  it("returns undefined when no key and no stored token exist", () => {
    expect(keyFor({})).toBeUndefined();
  });

  it("uses ANTHROPIC_API_KEY for the anthropic provider", () => {
    expect(keyFor({ ANTHROPIC_API_KEY: "sk-ant" }, "anthropic")).toBe("sk-ant");
  });

  it("uses <PROVIDER>_API_KEY for any other provider", () => {
    expect(keyFor({ OPENAI_COMPATIBLE_API_KEY: "gateway-key" }, "openai-compatible")).toBe(
      "gateway-key",
    );
  });

  it("ignores blank values", () => {
    expect(keyFor({ HARVESTER_API_KEY: "   ", CLINE_API_KEY: "  " })).toBeUndefined();
  });
});

describe("readClineStoredToken", () => {
  it("reads the cline-pass access token from an explicit data dir", () => {
    expect(readClineStoredToken({}, tokenDataDir())).toBe(TOKEN);
  });

  it("returns undefined when the credential store is missing or malformed", () => {
    expect(readClineStoredToken({}, "/nonexistent-nagriksetu-agents")).toBeUndefined();
  });
});
