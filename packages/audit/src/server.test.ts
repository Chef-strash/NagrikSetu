/**
 * U7 test scenarios for the service: the HTTP Contract, the fail-closed token,
 * the body/concurrency caps, and the promise that no request body reaches a log.
 *
 * The pipeline is injected, so these tests exercise routing, auth and masking
 * without a model call.
 */
import { describe, expect, it } from "vitest";
import { loadAuditConfig, type AuditConfig } from "./config.js";
import { AuditMaskingError, type AuditRunInput, type AuditRunResult } from "./extract.js";
import { AuditInputError } from "./pages.js";
import {
  errorResponse,
  multipartBoundary,
  parseMultipart,
  readExtractRequest,
  startAuditServer,
  withTimeout,
} from "./server.js";
import { createInMemoryExtractionStore } from "./store.js";
import type { AuditResponse } from "./verify/verify.js";

const TOKEN = "test-service-token";
const BOUNDARY = "----nagriksetu-audit-test";

function config(overrides: Partial<AuditConfig> = {}): AuditConfig {
  return {
    ...loadAuditConfig({
      AUDIT_API_KEY: "test-key",
      AUDIT_SERVICE_TOKEN: TOKEN,
      AUDIT_PROVIDER_ID: "cline-pass",
      AUDIT_MODEL_ID: "cline-pass/glm-5.3",
      AUDIT_VISION_MODEL_ID: "cline-pass/qwen3.7-plus",
    }),
    port: 0,
    ...overrides,
  };
}

function multipart(
  parts: Array<{ name: string; value?: string; filename?: string; data?: Buffer }>,
): { body: Buffer; contentType: string } {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    const filename = part.filename ? `; filename="${part.filename}"` : "";
    chunks.push(
      Buffer.from(
        `--${BOUNDARY}\r\ncontent-disposition: form-data; name="${part.name}"${filename}\r\n`,
      ),
    );
    if (part.filename) chunks.push(Buffer.from("content-type: application/pdf\r\n"));
    chunks.push(Buffer.from("\r\n"));
    chunks.push(part.data ?? Buffer.from(part.value ?? "", "utf8"));
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${BOUNDARY}`,
  };
}

function maskedResponse(overrides: Partial<AuditResponse> = {}): AuditResponse {
  return {
    document_type_guess: "income_certificate",
    language: "en",
    issuer: "Pune Municipal Corporation",
    has_signature: true,
    has_seal: true,
    pages_read: 1,
    pages_total: 1,
    needs_review: false,
    model: "cline-pass/glm-5.3",
    fields: [
      {
        key: "account_no",
        label: "Account No",
        value: "6789",
        normalized: "6789",
        type: "account_number",
        page: 1,
        handwritten: false,
        grounding: "text",
      },
    ],
    flags: [],
    notices: [],
    ...overrides,
  };
}

function runResult(response: AuditResponse): AuditRunResult {
  return {
    response,
    unmasked: [],
    meta: {
      sessionId: "s-1",
      documentId: "d-1",
      kind: "pdf",
      pagesRead: response.pages_read,
      pagesTotal: response.pages_total,
      truncated: false,
      providerId: "cline-pass",
      modelId: response.model,
      ocrLanguages: "eng+hin+mar",
      ocrDegraded: false,
      textOnly: false,
      withheldPages: [],
      durationMs: 12,
    },
  };
}

async function withServer(
  overrides: {
    config?: Partial<AuditConfig>;
    run?: (input: AuditRunInput) => Promise<AuditRunResult>;
    logs?: string[];
  },
  body: (url: string) => Promise<void>,
): Promise<void> {
  const logs = overrides.logs ?? [];
  const store = createInMemoryExtractionStore();
  const server = await startAuditServer({
    config: config(overrides.config),
    store,
    run: overrides.run ?? (async () => runResult(maskedResponse())),
    logger: (line) => logs.push(line),
  });
  try {
    await body(server.url);
  } finally {
    await server.close();
  }
}

function post(
  url: string,
  payload: { body: Buffer; contentType: string },
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${url}/extract`, {
    method: "POST",
    headers: { "content-type": payload.contentType, ...headers },
    body: new Uint8Array(payload.body),
  });
}

const FILE = { name: "file", filename: "doc.pdf", data: Buffer.from("%PDF-1.4 fake") };

describe("GET /health", () => {
  it("reports the database and the model from the contract", async () => {
    await withServer({}, async (url) => {
      const response = await fetch(`${url}/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ok: true,
        database: "in-memory",
        model: "cline-pass/glm-5.3",
      });
    });
  });

  it("reports supabase when the store is the Supabase one", async () => {
    const store = {
      kind: "supabase" as const,
      save: async () => undefined,
      list: async () => [],
    };
    const server = await startAuditServer({ config: config(), store });
    try {
      const response = await fetch(`${server.url}/health`);
      expect(await response.json()).toMatchObject({ database: "supabase" });
    } finally {
      await server.close();
    }
  });
});

describe("POST /extract", () => {
  async function harness(overrides: {
    config?: Partial<AuditConfig>;
    run?: (input: AuditRunInput) => Promise<AuditRunResult>;
  } = {}) {
    const logs: string[] = [];
    const store = createInMemoryExtractionStore();
    const server = await startAuditServer({
      config: config(overrides.config),
      store,
      run: overrides.run ?? (async () => runResult(maskedResponse())),
      logger: (line) => logs.push(line),
    });
    return { url: server.url, store, logs, close: () => server.close() };
  }

  const form = [
    FILE,
    { name: "session_id", value: "session-1" },
    { name: "document_id", value: "doc-1" },
  ];

  it("returns the masked response and stores only the masked record", async () => {
    const app = await harness();
    try {
      const response = await post(app.url, multipart(form), { "x-audit-token": TOKEN });
      expect(response.status).toBe(200);
      const body = (await response.json()) as AuditResponse;
      expect(body.document_type_guess).toBe("income_certificate");
      expect(body.fields[0]?.value).toBe("6789");
      expect(body.pages_read).toBe(1);
      expect(body.model).toBe("cline-pass/glm-5.3");

      const [record] = await app.store.list();
      expect(record).toMatchObject({
        session_id: "session-1",
        document_id: "doc-1",
        model_id: "cline-pass/glm-5.3",
        document_type_guess: "income_certificate",
      });
      expect(record?.result.fields[0]?.value).toBe("6789");
    } finally {
      await app.close();
    }
  });

  it("never logs the request body or the document's contents", async () => {
    const app = await harness();
    try {
      await post(
        app.url,
        multipart([
          FILE,
          { name: "session_id", value: "session-secret" },
          { name: "document_id", value: "doc-secret" },
        ]),
        { "x-audit-token": TOKEN },
      );
      const logText = app.logs.join("\n");
      expect(logText).toContain("POST /extract -> 200");
      expect(logText).not.toContain("doc-secret");
      expect(logText).not.toContain("session-secret");
      expect(logText).not.toContain("%PDF-1.4");
    } finally {
      await app.close();
    }
  });

  it("refuses to run without a configured token (fail closed)", async () => {
    const app = await harness({ config: { serviceToken: undefined } });
    try {
      const response = await post(app.url, multipart(form), { "x-audit-token": TOKEN });
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: "service_token_unconfigured" });
    } finally {
      await app.close();
    }
  });

  it("rejects a missing or wrong token with 401", async () => {
    const app = await harness();
    try {
      expect((await post(app.url, multipart(form))).status).toBe(401);
      expect(
        (await post(app.url, multipart(form), { "x-audit-token": "nope" })).status,
      ).toBe(401);
    } finally {
      await app.close();
    }
  });

  it("rejects a non-multipart body with 415 and an unknown route with 404", async () => {
    const app = await harness();
    try {
      const notMultipart = await fetch(`${app.url}/extract`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-audit-token": TOKEN },
        body: "{}",
      });
      expect(notMultipart.status).toBe(415);
      expect((await fetch(`${app.url}/nope`)).status).toBe(404);
    } finally {
      await app.close();
    }
  });

  it("rejects a body over the cap with 413", async () => {
    const app = await harness({ config: { maxBodyBytes: 512 } });
    try {
      const payload = multipart([
        { name: "file", filename: "big.pdf", data: Buffer.alloc(4096, 1) },
        { name: "session_id", value: "s" },
        { name: "document_id", value: "d" },
      ]);
      const response = await post(app.url, payload, { "x-audit-token": TOKEN });
      expect(response.status).toBe(413);
      expect(await response.json()).toMatchObject({ error: "oversize" });
    } finally {
      await app.close();
    }
  });

  it("rejects a body missing session_id with 400", async () => {
    const app = await harness();
    try {
      const payload = multipart([FILE, { name: "document_id", value: "d" }]);
      const response = await post(app.url, payload, { "x-audit-token": TOKEN });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "empty_input" });
    } finally {
      await app.close();
    }
  });

  it("fails closed when masking did not cover everything", async () => {
    const app = await harness({
      run: async () => {
        throw new AuditMaskingError([
          { path: "$.fields[0].value", kind: "aadhaar", sample: "XXXX-XXXX-7774" },
        ]);
      },
    });
    try {
      const response = await post(app.url, multipart(form), { "x-audit-token": TOKEN });
      expect(response.status).toBe(500);
      const body = (await response.json()) as { error: string; detail: string };
      expect(body.error).toBe("masking_failed");
      expect(JSON.stringify(body)).not.toContain("9341");
    } finally {
      await app.close();
    }
  });

  it("caps concurrent runs and run time", async () => {
    const app = await harness({
      config: { maxConcurrentRuns: 1, runTimeoutMs: 30 },
      run: async () =>
        new Promise<AuditRunResult>((resolve) => {
          setTimeout(() => resolve(runResult(maskedResponse())), 150);
        }),
    });
    try {
      const first = post(app.url, multipart(form), { "x-audit-token": TOKEN });
      await new Promise((resolve) => setTimeout(resolve, 10));
      const second = await post(app.url, multipart(form), { "x-audit-token": TOKEN });
      expect(second.status).toBe(429);
      expect(await second.json()).toMatchObject({ error: "too_many_runs" });
      // The first run then exceeds its wall-clock budget and is reported.
      const timedOut = await first;
      expect(timedOut.status).toBe(500);
      expect(await timedOut.json()).toMatchObject({ error: "extraction_failed" });
    } finally {
      await app.close();
    }
  });

  it("returns the result even when the store fails (R14)", async () => {
    const logs: string[] = [];
    const failing = {
      kind: "supabase" as const,
      save: async () => {
        throw new Error("database unreachable");
      },
      list: async () => [],
    };
    const server = await startAuditServer({
      config: config(),
      store: failing,
      run: async () => runResult(maskedResponse()),
      logger: (line) => logs.push(line),
    });
    try {
      const response = await post(server.url, multipart(form), { "x-audit-token": TOKEN });
      expect(response.status).toBe(200);
      const body = (await response.json()) as AuditResponse;
      expect(body.notices.join(" ")).toContain("could not be saved");
      expect(logs.join(" ")).toContain("store failed");
    } finally {
      await server.close();
    }
  });
});

describe("multipart parsing and error mapping", () => {
  it("reads the boundary from quoted and unquoted content types", () => {
    expect(multipartBoundary('multipart/form-data; boundary="abc"')).toBe("abc");
    expect(multipartBoundary("multipart/form-data; boundary=abc; charset=utf-8")).toBe("abc");
    expect(multipartBoundary("application/json")).toBeUndefined();
  });

  it("parses the file and the two text fields from memory", () => {
    const { body, contentType } = multipart([
      { name: "session_id", value: "session-1" },
      { name: "document_id", value: "doc-1" },
      { name: "file", filename: "scan.jpg", data: Buffer.from([0xff, 0xd8, 0xff]) },
    ]);
    const parts = parseMultipart(body, contentType);
    expect(parts.map((part) => part.name).sort()).toEqual([
      "document_id",
      "file",
      "session_id",
    ]);
    const file = parts.find((part) => part.name === "file");
    expect(file?.filename).toBe("scan.jpg");
    expect(file?.data).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  });

  it("names the missing field instead of guessing", () => {
    const { body, contentType } = multipart([{ name: "file", filename: "a.pdf", data: Buffer.from("%PDF") }]);
    expect(() => readExtractRequest(parseMultipart(body, contentType))).toThrowError(
      /session_id/,
    );
    expect(() => readExtractRequest([])).toThrowError(AuditInputError);
  });

  it("maps each failure to the status the contract promises", () => {
    expect(errorResponse(new AuditInputError("oversize", "too big")).status).toBe(413);
    expect(errorResponse(new AuditInputError("unsupported_type", "no")).status).toBe(415);
    expect(errorResponse(new AuditInputError("empty_input", "no")).status).toBe(400);
    expect(
      errorResponse(new AuditMaskingError([])),
    ).toMatchObject({ status: 500, code: "masking_failed" });
    expect(errorResponse(new Error("boom"))).toMatchObject({
      status: 500,
      code: "extraction_failed",
    });
  });

  it("gives up on a run that exceeds its budget", async () => {
    await expect(
      withTimeout(new Promise(() => undefined), 10),
    ).rejects.toThrowError(/exceeded 10 ms/);
    await expect(withTimeout(Promise.resolve("ok"), 1_000)).resolves.toBe("ok");
  });
});
