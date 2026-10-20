import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDocumentContext,
  composeMessageWithContext,
  MAX_CHAT_MESSAGE_CHARS
} from "./chat-context.ts";
import type { ExtractField, ExtractResponse } from "./adapt.ts";

function field(partial: Partial<ExtractField> & { key: string; value: string }): ExtractField {
  return {
    label: partial.key,
    normalized: "",
    type: "text",
    page: 1,
    handwritten: false,
    grounding: "text",
    ...partial
  };
}

function response(partial: Partial<ExtractResponse> = {}): ExtractResponse {
  return {
    document_type_guess: "Aadhaar Card",
    language: "en",
    issuer: "",
    has_signature: null,
    has_seal: null,
    pages_read: 1,
    pages_total: 1,
    needs_review: false,
    model: "test",
    fields: [],
    flags: [],
    notices: [],
    ...partial
  };
}

test("buildDocumentContext summarises the masked fields", () => {
  const context = buildDocumentContext(
    response({
      fields: [
        field({ key: "holder_name", value: "RAMESH PATIL" }),
        field({ key: "aadhaar_number", value: "XXXX-XXXX-9012" })
      ]
    }),
    "aadhaar.pdf"
  );

  assert.ok(context);
  assert.equal(context.documentType, "Aadhaar");
  assert.deepEqual(context.lines, ["holder name: RAMESH PATIL", "aadhaar number: XXXX-XXXX-9012"]);
  assert.match(context.contextBlock, /^\[Uploaded document — Aadhaar \(aadhaar\.pdf\):/);
  assert.match(context.contextBlock, /XXXX-XXXX-9012/);
});

test("only masked values are ever included", () => {
  const context = buildDocumentContext(
    response({ fields: [field({ key: "aadhaar_number", value: "XXXX-XXXX-9012" })] }),
    "a.pdf"
  );
  assert.ok(context);
  assert.ok(!/\d{4}[ -]?\d{4}[ -]?\d{4}/.test(context.contextBlock), "no 12-digit run may appear");
});

test("buildDocumentContext returns null when there is nothing usable", () => {
  assert.equal(buildDocumentContext(response({ fields: [] }), "blank.pdf"), null);
  assert.equal(
    buildDocumentContext(response({ fields: [field({ key: "notes", value: "   " })] }), "blank.pdf"),
    null
  );
});

test("it caps the field count and truncates long values", () => {
  const many = Array.from({ length: 20 }, (_, i) => field({ key: `f${i}`, value: `v${i}` }));
  const context = buildDocumentContext(response({ fields: many }), "x.pdf");
  assert.ok(context);
  assert.equal(context.lines.length, 8);

  const long = buildDocumentContext(
    response({ fields: [field({ key: "address", value: "A".repeat(300) })] }),
    "x.pdf"
  );
  assert.ok(long);
  assert.ok(long.lines[0].length < 100, "a long value must not be dumped verbatim");
});

test("no context leaves the question untouched", () => {
  assert.equal(composeMessageWithContext(" Where do I submit? ", null), "Where do I submit?");
});

test("the composed message always fits the backend's limit", () => {
  const context = buildDocumentContext(
    response({
      fields: Array.from({ length: 8 }, (_, i) => field({ key: `field_number_${i}`, value: "V".repeat(60) }))
    }),
    "long-name.pdf"
  );
  assert.ok(context);

  const composed = composeMessageWithContext("What documents do I need?", context.contextBlock);
  assert.ok(
    composed.length <= MAX_CHAT_MESSAGE_CHARS,
    `expected <= ${MAX_CHAT_MESSAGE_CHARS}, got ${composed.length}`
  );
  assert.ok(composed.endsWith("What documents do I need?"), "the question is never truncated");
});

test("a very long question wins the budget over the context", () => {
  const question = "Q".repeat(450);
  const composed = composeMessageWithContext(question, "[Uploaded document — Aadhaar: name: X]", 500);

  assert.ok(composed.length <= 500);
  assert.ok(composed.endsWith(question), "the question survives intact");
});

test("with no room for context, the question is sent alone", () => {
  const question = "Q".repeat(495);
  const composed = composeMessageWithContext(question, "[Uploaded document — Aadhaar: name: X]", 500);
  assert.equal(composed, question);
});
