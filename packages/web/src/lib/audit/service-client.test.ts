import test from "node:test";
import assert from "node:assert/strict";
import {
  AUDIT_SERVICE_TOKEN_ENV,
  AUDIT_SERVICE_URL_ENV,
  AUDIT_TOKEN_HEADER,
  requestExtraction
} from "./service-client.ts";

const MINIMAL_RESPONSE = {
  document_type_guess: "Aadhaar Card",
  language: "mr",
  issuer: "UIDAI",
  has_signature: null,
  has_seal: true,
  pages_read: 1,
  pages_total: 1,
  needs_review: false,
  model: "cline-pass/glm-5.3",
  fields: [{ key: "name", label: "Name", value: "RAMESH PATIL", normalized: "", type: "text", page: 1, handwritten: false, grounding: "text" }],
  flags: [],
  notices: []
};

const INPUT = {
  bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
  fileName: "aadhaar.pdf",
  mimeType: "application/pdf",
  sessionId: "sess-1",
  documentId: "doc-1"
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

test("no token configured -> unconfigured, and the service is never called", async () => {
  let called = false;
  const outcome = await requestExtraction(INPUT, {
    env: {},
    fetchImpl: (async () => {
      called = true;
      return jsonResponse(MINIMAL_RESPONSE);
    }) as unknown as typeof fetch
  });

  assert.equal(outcome.available, false);
  assert.equal(outcome.available === false && outcome.reason, "unconfigured");
  assert.equal(called, false, "must not touch the network without a token");
});

test("an unreachable service falls back instead of throwing", async () => {
  const outcome = await requestExtraction(INPUT, {
    env: { [AUDIT_SERVICE_TOKEN_ENV]: "test-token" },
    fetchImpl: (async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:8787");
    }) as unknown as typeof fetch
  });

  assert.equal(outcome.available, false);
  assert.equal(outcome.available === false && outcome.reason, "unreachable");
});

test("a successful extraction returns the masked AuditResponse", async () => {
  const outcome = await requestExtraction(INPUT, {
    env: { [AUDIT_SERVICE_TOKEN_ENV]: "test-token" },
    fetchImpl: (async () => jsonResponse(MINIMAL_RESPONSE)) as unknown as typeof fetch
  });

  assert.equal(outcome.available, true);
  assert.equal(outcome.available === true && outcome.ok, true);
  assert.equal(outcome.available === true && outcome.ok === true && outcome.response.fields[0].value, "RAMESH PATIL");
});

test("it sends the token header and the service's exact multipart field names", async () => {
  let seenUrl = "";
  let seenInit: RequestInit | undefined;

  await requestExtraction(INPUT, {
    env: { [AUDIT_SERVICE_TOKEN_ENV]: "secret-token" },
    fetchImpl: (async (url: string, init: RequestInit) => {
      seenUrl = String(url);
      seenInit = init;
      return jsonResponse(MINIMAL_RESPONSE);
    }) as unknown as typeof fetch
  });

  assert.equal(seenUrl, "http://127.0.0.1:8787/extract");
  const headers = seenInit?.headers as Record<string, string>;
  assert.equal(headers[AUDIT_TOKEN_HEADER], "secret-token");

  const body = seenInit?.body as FormData;
  assert.ok(body instanceof FormData);
  assert.equal(body.get("session_id"), "sess-1");
  assert.equal(body.get("document_id"), "doc-1");
  assert.ok(body.get("file"), "the file part must be present");
});

test("a custom service URL is honoured and trailing slashes are trimmed", async () => {
  let seenUrl = "";
  await requestExtraction(INPUT, {
    env: { [AUDIT_SERVICE_TOKEN_ENV]: "t", [AUDIT_SERVICE_URL_ENV]: "http://127.0.0.1:9999/" },
    fetchImpl: (async (url: string) => {
      seenUrl = String(url);
      return jsonResponse(MINIMAL_RESPONSE);
    }) as unknown as typeof fetch
  });

  assert.equal(seenUrl, "http://127.0.0.1:9999/extract");
});

test("a service error is reported, not disguised as a success", async () => {
  const outcome = await requestExtraction(INPUT, {
    env: { [AUDIT_SERVICE_TOKEN_ENV]: "wrong-token" },
    fetchImpl: (async () => jsonResponse({ error: "unauthorized" }, 401)) as unknown as typeof fetch
  });

  assert.equal(outcome.available, true);
  assert.equal(outcome.available === true && outcome.ok, false);
  assert.equal(outcome.available === true && outcome.ok === false && outcome.status, 401);
  assert.equal(outcome.available === true && outcome.ok === false && outcome.error, "unauthorized");
});

test("a 200 without a fields array is treated as malformed", async () => {
  const outcome = await requestExtraction(INPUT, {
    env: { [AUDIT_SERVICE_TOKEN_ENV]: "t" },
    fetchImpl: (async () => jsonResponse({ unexpected: true })) as unknown as typeof fetch
  });

  assert.equal(outcome.available === true && outcome.ok, false);
  assert.equal(outcome.available === true && outcome.ok === false && outcome.error, "malformed_response");
});
