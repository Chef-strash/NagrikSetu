import test from "node:test";
import assert from "node:assert/strict";
import { handleDocumentUpload, saveExtraction, safeFileName } from "./storage.ts";

function req(token?: string) {
  const form = new FormData();
  form.set("file", new Blob(["x"], { type: "image/png" }), "a b.png");
  form.set("session_id", "s1");
  return new Request("http://x/upload", {
    method: "POST",
    body: form,
    headers: token ? { authorization: `Bearer ${token}` } : {}
  });
}

test("disabled returns 204 and never uploads", async () => {
  let called = false;
  const r = await handleDocumentUpload(req("t"), {
    enabled: false, uuid: () => "u", getUser: async () => ({ id: "x" }),
    upload: async () => { called = true; return { error: null }; }
  });
  assert.equal(r.status, 204);
  assert.equal(called, false);
});

test("enabled stores under user/session/uuid-name", async () => {
  let path = "";
  const r = await handleDocumentUpload(req("t"), {
    enabled: true, uuid: () => "u1", getUser: async () => ({ id: "user1" }),
    upload: async (p) => { path = p; return { error: null }; }
  });
  assert.equal(r.status, 201);
  assert.equal(path, "user1/s1/u1-a_b.png");
});

test("enabled without valid token is 401", async () => {
  const r = await handleDocumentUpload(req(), {
    enabled: true, uuid: () => "u", getUser: async () => null, upload: async () => ({ error: null })
  });
  assert.equal(r.status, 401);
});

test("saveExtraction stores masked rows and refuses raw shapes", async () => {
  const rows: Record<string, unknown>[] = [];
  const insert = async (_t: string, row: Record<string, unknown>) => { rows.push(row); return { error: null }; };
  const base = { sessionId: "s", documentId: "d", modelId: "m" };
  assert.equal(await saveExtraction(insert, { ...base, result: { aadhaar: "XXXX-XXXX-1234" } }), true);
  assert.equal(await saveExtraction(insert, { ...base, result: { aadhaar: "123456789012" } }), false);
  assert.equal(rows.length, 1);
  assert.equal(safeFileName("../é.pdf"), "__.pdf");
});

import { handleExtractionSave, postExtraction } from "./storage.ts";

function jreq(body: unknown, token?: string) {
  return new Request("http://x/e", {
    method: "POST",
    body: JSON.stringify(body),
    headers: token ? { authorization: `Bearer ${token}` } : {}
  });
}

test("extraction save needs a user, inserts masked rows, refuses unmasked", async () => {
  const rows: Record<string, unknown>[] = [];
  const deps = {
    getUser: async (t: string) => (t === "good" ? { id: "u" } : null),
    insert: async (_t: string, row: Record<string, unknown>) => { rows.push(row); return { error: null }; }
  };
  const response = { model: "m", document_type_guess: "AADHAAR", needs_review: false, pages_read: 1, pages_total: 1, fields: [{ value: "XXXX-XXXX-1234" }] };
  assert.equal((await handleExtractionSave(jreq({ sessionId: "s", documentId: "d", response }), deps)).status, 401);
  assert.equal((await handleExtractionSave(jreq({ sessionId: "s", documentId: "d", response }, "bad"), deps)).status, 401);
  assert.equal((await handleExtractionSave(jreq({ sessionId: "s", documentId: "d", response }, "good"), deps)).status, 201);
  assert.equal(rows[0].document_type_guess, "AADHAAR");
  const leak = { ...response, fields: [{ value: "123456789012" }] };
  assert.equal((await handleExtractionSave(jreq({ sessionId: "s", documentId: "d", response: leak }, "good"), deps)).status, 422);
  assert.equal(rows.length, 1);
});

test("postExtraction never throws", async () => {
  assert.equal(await postExtraction("t", { sessionId: "s", documentId: "d", response: {} }, (async () => { throw new Error("x"); }) as never), false);
  assert.equal(await postExtraction("t", { sessionId: "s", documentId: "d", response: {} }, (async () => new Response(null, { status: 201 })) as never), true);
});
