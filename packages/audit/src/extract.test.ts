/**
 * The pipeline end to end (U7): bytes -> pages -> OCR -> session -> verify ->
 * mask, over real PDFs built byte by byte and a mocked session. The live path is
 * exercised by the CLI, not here.
 *
 * The last test is the plan's mandatory one: scan the whole response payload for
 * unmasked Aadhaar, account and PAN shapes and fail if any survive.
 */
import type { ClineCoreLike, CoreFactory } from "@nagriksetu/agents";
import { describe, expect, it } from "vitest";
import { loadAuditConfig, type AuditConfig } from "./config.js";
import { runAudit } from "./extract.js";
import type { OcrEngine } from "./ocr.js";
import { buildPdf } from "./testing/pdf.js";
import { findUnmaskedPii } from "./verify/mask.js";
import type { AuditResponse } from "./verify/verify.js";

const TEXT_PAGE =
  "Income Certificate Name Sandip Ramchandra Kamble annual income 180000 valid until 2027-06-11";

interface ToolStub {
  name: string;
  execute: (input: unknown) => Promise<unknown>;
}

interface SessionStart {
  userImages: string[];
  prompt: string;
}

function fieldInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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

function mockCore(
  behaviour: (tools: ToolStub[], start: SessionStart) => Promise<void>,
): { createCore: CoreFactory; started: () => SessionStart } {
  let started: SessionStart | undefined;
  return {
    started: () => started as SessionStart,
    createCore: async (): Promise<ClineCoreLike> => ({
      subscribe: () => () => {},
      start: async (input) => {
        started = input as unknown as SessionStart;
        const tools = ((input as { config?: { extraTools?: ToolStub[] } }).config
          ?.extraTools ?? []) as ToolStub[];
        await behaviour(tools, started);
        return { sessionId: "mock-session" };
      },
    }),
  };
}

function tool(tools: readonly ToolStub[], name: string): ToolStub {
  const found = tools.find((entry) => entry.name === name);
  if (!found) throw new Error(`tool ${name} was not supplied`);
  return found;
}

function config(overrides: Partial<AuditConfig> = {}): AuditConfig {
  return { ...loadAuditConfig({ AUDIT_API_KEY: "test-key" }), ...overrides };
}

function fakeOcr(text: string): () => Promise<OcrEngine> {
  return async () => ({
    recognize: async () => ({ text, confidence: 82 }),
    terminate: async () => undefined,
  });
}

/** Every test asserts the response is clean before it is inspected. */
async function audit(
  bytes: Uint8Array,
  deps: Parameters<typeof runAudit>[1],
): Promise<AuditResponse> {
  const run = await runAudit(
    { bytes, sessionId: "session-1", documentId: "doc-1" },
    deps,
  );
  expect(run.unmasked).toEqual([]);
  expect(findUnmaskedPii(run.response)).toEqual([]);
  return run.response;
}

describe("runAudit", () => {
  it("reads a text PDF, grounds its fields and masks the response", async () => {
    const core = mockCore(async (tools) => {
      await tool(tools, "record_field").execute(fieldInput());
      await tool(tools, "record_field").execute(
        fieldInput({
          key: "annual_income",
          label: "Income",
          value: "180000",
          normalized: "180000",
          type: "amount",
        }),
      );
      // Nothing on the page carries this: it is what the model alone saw.
      await tool(tools, "record_field").execute(
        fieldInput({
          key: "issuer_desk",
          label: "Desk",
          value: "Ward Office Yerwada",
          normalized: "Ward Office Yerwada",
        }),
      );
      await tool(tools, "submit_extraction").execute({
        document_type_guess: "income_certificate",
        language: "en",
        issuer: "",
        has_signature: true,
        has_seal: true,
      });
    });

    const response = await audit(buildPdf([TEXT_PAGE]), {
      config: config(),
      createCore: core.createCore,
      ocrEngineFactory: fakeOcr("unused"),
      env: { AUDIT_API_KEY: "test-key" },
    });

    expect(response.document_type_guess).toBe("income_certificate");
    expect(response.pages_read).toBe(1);
    expect(response.pages_total).toBe(1);
    expect(response.fields.map((entry) => entry.grounding)).toEqual([
      "text",
      "text",
      "vision",
    ]);
    expect(response.needs_review).toBe(true); // one value rested on the model
    expect(response.model).toContain("cline-pass/");
  });

  it("grounds a scanned page from OCR and keeps it out of review", async () => {
    const core = mockCore(async (tools) => {
      await tool(tools, "record_field").execute(fieldInput());
      await tool(tools, "submit_extraction").execute({
        document_type_guess: "id_card",
        language: "en",
        issuer: "",
        has_signature: true,
        has_seal: true,
      });
    });

    const response = await audit(buildPdf([undefined]), {
      config: config(),
      createCore: core.createCore,
      ocrEngineFactory: fakeOcr("Name Sandip Ramchandra Kamble"),
      env: { AUDIT_API_KEY: "test-key" },
    });

    expect(response.fields[0]?.grounding).toBe("ocr");
    expect(response.needs_review).toBe(false);
    expect(response.notices).toEqual([]);
  });

  it("withholds a page image whose text carries an Aadhaar number (R12)", async () => {
    const core = mockCore(async (tools) => {
      await tool(tools, "submit_extraction").execute({
        document_type_guess: "id_card",
        language: "bi",
        issuer: "",
        has_signature: true,
        has_seal: true,
      });
    });

    await audit(buildPdf(["Aadhaar 9341 0195 7774 Name Sandip"]), {
      config: config(),
      createCore: core.createCore,
      ocrEngineFactory: fakeOcr("unused"),
      env: { AUDIT_API_KEY: "test-key" },
    });

    const start = core.started();
    expect(start.userImages).toEqual([]);
    expect(start.prompt).toContain("NOT attached");
  });

  it("degrades loudly when OCR cannot run, and still returns a result", async () => {
    const core = mockCore(async (tools) => {
      await tool(tools, "record_field").execute(fieldInput());
      await tool(tools, "submit_extraction").execute({
        document_type_guess: "id_card",
        language: "en",
        issuer: "",
        has_signature: true,
        has_seal: true,
      });
    });

    const response = await audit(buildPdf([undefined]), {
      config: config(),
      createCore: core.createCore,
      ocrEngineFactory: async () => {
        throw new Error("ENOENT: no such file or directory, open 'eng.traineddata'");
      },
      env: { AUDIT_API_KEY: "test-key" },
    });

    expect(response.notices.join(" ")).toContain("OCR unavailable");
    expect(response.fields[0]?.grounding).toBe("vision");
    expect(response.needs_review).toBe(true);
  });

  it("scans the whole payload for unmasked Aadhaar, account and PAN shapes", async () => {
    const core = mockCore(async (tools) => {
      await tool(tools, "record_field").execute(
        fieldInput({
          key: "id_number",
          label: "Aadhaar Number",
          value: "9341 0195 7774",
          normalized: "934101957774",
          type: "id_number",
        }),
      );
      await tool(tools, "record_field").execute(
        fieldInput({
          key: "account_no",
          label: "Account No",
          value: "000123456789",
          normalized: "000123456789",
          type: "account_number",
        }),
      );
      await tool(tools, "record_field").execute(
        fieldInput({
          key: "pan",
          label: "PAN",
          value: "ABCDE1234F",
          normalized: "ABCDE1234F",
          type: "pan",
        }),
      );
      await tool(tools, "flag_issue").execute({
        kind: "missing_seal",
        detail: "No seal, and the Aadhaar 9341 0195 7774 is crossed out.",
      });
      await tool(tools, "submit_extraction").execute({
        document_type_guess: "id_card",
        language: "en",
        issuer: "",
        has_signature: true,
        has_seal: false,
      });
    });

    const response = await audit(
      buildPdf(["Aadhaar 9341 0195 7774 Account 000123456789 PAN ABCDE1234F"]),
      {
        config: config(),
        createCore: core.createCore,
        ocrEngineFactory: fakeOcr("unused"),
        env: { AUDIT_API_KEY: "test-key" },
      },
    );

    const payload = JSON.stringify(response);
    expect(findUnmaskedPii(response)).toEqual([]);
    expect(payload).not.toMatch(/[0-9]{12}/);
    expect(payload).not.toMatch(/[A-Z]{5}[0-9]{4}[A-Z]/);
    // The values survive only as tails.
    const byKey = new Map(response.fields.map((entry) => [entry.key, entry.value]));
    expect(byKey.get("id_number")).toContain("7774");
    expect(byKey.get("id_number")).not.toContain("9341");
    expect(byKey.get("account_no")).not.toContain("000123456789");
    expect(byKey.get("pan")).toBe("XXXXXX234F");
    const sealFlag = response.flags.find((flag) => flag.kind === "missing_seal");
    expect(sealFlag).toBeDefined();
    expect(sealFlag?.detail).not.toContain("9341");
    expect(response.has_seal).toBe(false);
  });
});
