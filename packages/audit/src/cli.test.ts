/**
 * U8 CLI scenarios: argument parsing, the extract command's exit codes, and the
 * one that matters most here — `serve` must keep running and answer requests
 * instead of resolving (and being killed by the bootstrap's `process.exit`).
 */
import { describe, expect, it } from "vitest";
import { loadAuditConfig } from "./config.js";
import { main, parseArgs } from "./cli.js";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("parseArgs", () => {
  it("reads the command and the extract options", () => {
    expect(parseArgs(["extract", "doc.pdf"])).toMatchObject({
      command: "extract",
      file: "doc.pdf",
      skipOcr: false,
      limit: undefined,
    });
    expect(parseArgs(["extract", "doc.pdf", "--no-ocr", "--document-id=doc-1"])).toMatchObject({
      file: "doc.pdf",
      skipOcr: true,
      documentId: "doc-1",
    });
    expect(parseArgs(["extract", "doc.pdf", "--session-id", "s-1"])).toMatchObject({
      sessionId: "s-1",
    });
  });

  it("reads the eval directory and --limit=N", () => {
    expect(parseArgs(["eval", "/corpus", "--limit=3"])).toMatchObject({
      command: "eval",
      directory: "/corpus",
      limit: 3,
    });
    // A non-numeric limit means "no limit", not NaN runs.
    expect(parseArgs(["eval", "/corpus", "--limit=abc"]).limit).toBeUndefined();
  });

  it("defaults to extract with a local session id", () => {
    expect(parseArgs([])).toMatchObject({
      command: "extract",
      sessionId: "local-session",
      pretty: true,
    });
    expect(parseArgs(["--compact"]).pretty).toBe(false);
  });
});

describe("main", () => {
  it("exits 2 with a usage line when extract has no file", async () => {
    expect(await main(["extract"])).toBe(2);
  });

  it("exits 2 with a usage line when eval has no directory", async () => {
    expect(await main(["eval"])).toBe(2);
  });

  it("keeps serving until told to stop, then closes the port", async () => {
    const previousPort = process.env["AUDIT_PORT"];
    const previousToken = process.env["AUDIT_SERVICE_TOKEN"];
    process.env["AUDIT_PORT"] = "8793";
    process.env["AUDIT_SERVICE_TOKEN"] = "cli-test-token";
    const shutdown = deferred();
    try {
      const finished = main(["serve"], { waitForShutdown: () => shutdown.promise });

      // The process must still be alive and answering while the service runs:
      // a `serve` that resolved early would already be dead here.
      let health: Response | undefined;
      for (let attempt = 0; attempt < 40 && health === undefined; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        health = await fetch("http://127.0.0.1:8793/health").catch(() => undefined);
      }
      expect(health?.status).toBe(200);
      expect(await health?.json()).toEqual({
        ok: true,
        database: "in-memory",
        model: loadAuditConfig({ ...process.env }).modelId,
      });

      shutdown.resolve();
      expect(await finished).toBe(0);
      await expect(fetch("http://127.0.0.1:8793/health")).rejects.toThrowError();
    } finally {
      if (previousPort === undefined) delete process.env["AUDIT_PORT"];
      else process.env["AUDIT_PORT"] = previousPort;
      if (previousToken === undefined) delete process.env["AUDIT_SERVICE_TOKEN"];
      else process.env["AUDIT_SERVICE_TOKEN"] = previousToken;
    }
  }, 20_000);
});
