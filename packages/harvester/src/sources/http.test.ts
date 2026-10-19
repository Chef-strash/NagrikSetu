import { describe, expect, it, vi } from "vitest";
import { encodeUrlPath, fetchWithPolicy, type FetchImpl } from "./http.js";
import { isAllowlistedUrl, loadConfig } from "../config.js";
import { getSupabaseClient } from "../supabase/client.js";

const ALLOW = "https://webadmin.pmc.gov.in/api/listing-api/circular?per_page=20&page=1";

describe("http fetch policy (plan §12 discover)", () => {
  it("uses scaffold config contracts", () => {
    expect(loadConfig({} as NodeJS.ProcessEnv).scraperMode).toBe("live");
    expect(getSupabaseClient({} as NodeJS.ProcessEnv)).toBeNull();
    expect(isAllowlistedUrl(ALLOW)).toBe(true);
  });

  it("rejects non-allowlist hosts before any request", async () => {
    const fetchImpl = vi.fn();
    const res = await fetchWithPolicy("https://example.com/schemes", {
      fetchImpl: fetchImpl as never,
    });
    expect(res.ok).toBe(false);
    expect(res.rejected).toBe("non-allowlist-host");
    expect(res.attempts).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("offline + fixture returns fixture text without network", async () => {
    const fetchImpl = vi.fn();
    const res = await fetchWithPolicy(ALLOW, {
      offline: true,
      fixtureText: '{"ok":true}',
      fetchImpl: fetchImpl as never,
    });
    expect(res.ok).toBe(true);
    expect(res.fromFixture).toBe(true);
    expect(res.text).toBe('{"ok":true}');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("offline without fixture fails cleanly", async () => {
    const res = await fetchWithPolicy(ALLOW, {
      offline: true,
      fetchImpl: (async () => {
        throw new Error("must not be called");
      }) as never,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/no fixture/);
  });

  it("falls back to fixture text after 5xx retries", async () => {
    let calls = 0;
    const res = await fetchWithPolicy(ALLOW, {
      maxRetries: 1,
      timeoutMs: 1000,
      fixtureText: "FIXTURE",
      fetchImpl: (async () => {
        calls += 1;
        return { ok: false, status: 503, text: async () => "" };
      }) as never,
    });
    expect(res.ok).toBe(true);
    expect(res.fromFixture).toBe(true);
    expect(res.text).toBe("FIXTURE");
    expect(calls).toBe(2);
  });

  it("percent-encodes the URL path but preserves the query (review fix 2)", async () => {
    let seen = "";
    const res = await fetchWithPolicy(
      "https://webadmin.pmc.gov.in/sites/default/files/circular/My Circular.pdf?x=1",
      {
        fetchImpl: (async (url: string) => {
          seen = url;
          return {
            ok: true,
            status: 200,
            text: async () => "ok",
            arrayBuffer: async () => new ArrayBuffer(0),
          };
        }) as never,
      },
    );
    expect(res.ok).toBe(true);
    expect(seen).toBe(
      "https://webadmin.pmc.gov.in/sites/default/files/circular/My%20Circular.pdf?x=1",
    );
    // already-encoded escapes are not double-encoded
    expect(
      encodeUrlPath(
        "https://webadmin.pmc.gov.in/sites/default/files/circular/CODE%20OF%20CONDUCT.pdf",
      ),
    ).toBe(
      "https://webadmin.pmc.gov.in/sites/default/files/circular/CODE%20OF%20CONDUCT.pdf",
    );
  });

  it("FetchImpl contract exposes arrayBuffer for PDF bytes (review fix 2)", async () => {
    // Compile-time proof that arrayBuffer() is part of the FetchImpl contract.
    const impl: FetchImpl = async () => ({
      ok: true,
      status: 200,
      text: async () => "%PDF-1.4",
      arrayBuffer: async () => new Uint8Array([37, 80, 68, 70]).buffer,
    });
    const res = await impl("https://webadmin.pmc.gov.in/x.pdf");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes)).toEqual([37, 80, 68, 70]);
    expect(await res.text()).toBe("%PDF-1.4");
  });
});
