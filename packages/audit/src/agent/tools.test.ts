/**
 * U6 test scenarios: three tools over one draft store, and the schema guard that
 * keeps a half-formed field out of it.
 *
 * R6/R7 are the reason the key assertions here are open-ended: nothing in this
 * file enumerates document types, and `record_field` accepts a key the agent
 * invented as readily as a suggested one.
 */
import { describe, expect, it } from "vitest";
import {
  EXTRACTION_COMPLETION_TOOL,
  SUGGESTED_FIELD_KEYS,
  createExtractionDraft,
  makeExtractionTools,
  normalizeFieldKey,
  recordFieldSchema,
  type ExtractionDraft,
} from "./tools.js";

/** The tools as this test drives them: `execute(input)` with a cast. */
interface ToolLike {
  name: string;
  description: string;
  lifecycle?: { completesRun?: boolean };
  execute: (input: unknown, context?: unknown) => Promise<unknown>;
}

function toolsOf(draft: ExtractionDraft): Record<string, ToolLike> {
  const tools = makeExtractionTools(draft) as unknown as ToolLike[];
  return Object.fromEntries(tools.map((tool) => [tool.name, tool]));
}

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    key: "name",
    label: "Name",
    value: "Sandip Ramchandra Kamble",
    normalized: "Sandip Ramchandra Kamble",
    type: "text",
    page: 1,
    handwritten: false,
    ...overrides,
  };
}

describe("makeExtractionTools", () => {
  it("builds exactly the three tools, with submit as the completion tool", () => {
    const tools = makeExtractionTools(createExtractionDraft());
    expect(tools.map((tool) => tool.name)).toEqual([
      "record_field",
      "flag_issue",
      "submit_extraction",
    ]);
    const submit = tools[2] as unknown as ToolLike;
    expect(submit.lifecycle?.completesRun).toBe(true);
    expect(EXTRACTION_COMPLETION_TOOL).toBe("submit_extraction");
  });

  it("records a field with every part R6 asks for", async () => {
    const draft = createExtractionDraft();
    const tools = toolsOf(draft);
    const result = await tools["record_field"]?.execute(
      validInput({
        key: "Certificate No.",
        label: "Certificate No.",
        value: "SPEC/INC/2026/000123",
      }),
    );
    expect(result).toEqual({ recorded: 1, key: "certificate_no" });
    expect(draft.fields[0]).toEqual({
      key: "certificate_no",
      label: "Certificate No.",
      value: "SPEC/INC/2026/000123",
      normalized: "Sandip Ramchandra Kamble",
      type: "text",
      page: 1,
      handwritten: false,
    });
  });

  it("accepts a key the agent invented, because no per-document-type schema exists", async () => {
    const draft = createExtractionDraft();
    const tools = toolsOf(draft);
    expect(SUGGESTED_FIELD_KEYS).not.toContain("shop_licence_no");
    await tools["record_field"]?.execute(
      validInput({ key: "shop_licence_no", label: "Shop Licence No", value: "PMC/SL/2026/77" }),
    );
    expect(draft.fields[0]?.key).toBe("shop_licence_no");
    // The zod schema is open-ended: any non-empty key passes.
    expect(recordFieldSchema.safeParse(validInput({ key: "invented_key" })).success).toBe(true);
  });

  it("rejects an empty key or an empty value and writes nothing", async () => {
    const draft = createExtractionDraft();
    const tools = toolsOf(draft);
    const emptyKey = await tools["record_field"]?.execute(validInput({ key: "" }));
    expect(emptyKey).toMatchObject({ error: expect.stringContaining("record_field rejected") });
    const emptyValue = await tools["record_field"]?.execute(validInput({ value: "" }));
    expect(emptyValue).toMatchObject({ error: expect.stringContaining("record_field rejected") });
    expect(draft.fields).toEqual([]);
  });

  it("rejects an unknown type and a page number below 1", async () => {
    const draft = createExtractionDraft();
    const tools = toolsOf(draft);
    await tools["record_field"]?.execute(validInput({ type: "mystery" }));
    await tools["record_field"]?.execute(validInput({ page: 0 }));
    expect(draft.fields).toEqual([]);
  });

  it("keeps a handwritten flag and its page, which decide review later", async () => {
    const draft = createExtractionDraft();
    const tools = toolsOf(draft);
    await tools["record_field"]?.execute(
      validInput({ page: 2, handwritten: true, type: "date", normalized: "2009-05-21" }),
    );
    expect(draft.fields[0]).toMatchObject({
      page: 2,
      handwritten: true,
      normalized: "2009-05-21",
    });
  });
});

describe("flag_issue", () => {
  it("records a normalised kind, a detail and an optional field key", async () => {
    const draft = createExtractionDraft();
    const result = await toolsOf(draft)["flag_issue"]?.execute({
      kind: "Missing Seal",
      detail: "No seal near the signature line.",
      field_key: "valid_until",
    });
    expect(result).toEqual({ flagged: 1, kind: "missing_seal" });
    expect(draft.flags[0]).toEqual({
      kind: "missing_seal",
      detail: "No seal near the signature line.",
      field_key: "valid_until",
    });
  });

  it("omits field_key entirely when the agent does not supply one", async () => {
    const draft = createExtractionDraft();
    await toolsOf(draft)["flag_issue"]?.execute({
      kind: "torn_page",
      detail: "Top-right corner is torn.",
    });
    expect(draft.flags[0]).not.toHaveProperty("field_key");
  });

  it("rejects an empty detail", async () => {
    const draft = createExtractionDraft();
    const result = await toolsOf(draft)["flag_issue"]?.execute({
      kind: "torn_page",
      detail: "",
    });
    expect(result).toMatchObject({ error: expect.stringContaining("flag_issue rejected") });
    expect(draft.flags).toEqual([]);
  });
});

describe("submit_extraction", () => {
  it("fills the document facts and marks the draft submitted", async () => {
    const draft = createExtractionDraft();
    const result = await toolsOf(draft)["submit_extraction"]?.execute({
      document_type_guess: "Income Certificate",
      language: "en",
      issuer: "Pune Municipal Corporation",
      has_signature: true,
      has_seal: true,
    });
    expect(result).toEqual({ submitted: true, fields: 0 });
    expect(draft.submitted).toBe(true);
    expect(draft.facts).toEqual({
      document_type_guess: "income_certificate",
      language: "en",
      issuer: "Pune Municipal Corporation",
      has_signature: true,
      has_seal: true,
    });
  });

  it("leaves signature and seal null when the agent omits them", async () => {
    const draft = createExtractionDraft();
    await toolsOf(draft)["submit_extraction"]?.execute({
      document_type_guess: "id_card",
      language: "bi",
      issuer: "",
    });
    expect(draft.facts.has_signature).toBeNull();
    expect(draft.facts.has_seal).toBeNull();
    expect(draft.submitted).toBe(true);
  });

  it("rejects a submission with no document type", async () => {
    const draft = createExtractionDraft();
    const result = await toolsOf(draft)["submit_extraction"]?.execute({
      document_type_guess: "",
      language: "en",
      issuer: "",
    });
    expect(result).toMatchObject({
      error: expect.stringContaining("submit_extraction rejected"),
    });
    expect(draft.submitted).toBe(false);
  });
});

describe("createExtractionDraft / normalizeFieldKey", () => {
  it("starts empty and unsubmitted", () => {
    const draft = createExtractionDraft();
    expect(draft).toEqual({
      fields: [],
      flags: [],
      facts: {
        document_type_guess: "",
        language: "",
        issuer: "",
        has_signature: null,
        has_seal: null,
      },
      submitted: false,
    });
  });

  it("turns a printed label into a stable snake_case key", () => {
    expect(normalizeFieldKey("Certificate No.")).toBe("certificate_no");
    expect(normalizeFieldKey("  Bank Account Number ")).toBe("bank_account_number");
    expect(normalizeFieldKey("certificate-no")).toBe("certificate_no");
  });

  it("keeps a Devanagari label that has no ASCII to normalise", () => {
    // Nothing is invented for a script this normaliser does not transliterate:
    // the label is kept, so the agent's own key still identifies the fact.
    expect(normalizeFieldKey("सर्टिफिकेट क्रमांक")).toBe("सर्टिफिकेट क्रमांक");
  });
});
