/**
 * U6 test scenarios: one session per document, the page plan that decides what
 * the model is allowed to see (R12), and the failure mode of a run that never
 * submits.
 *
 * The core is mocked through `runAgentSession`'s injectable seam, so these tests
 * never spend a model call — the live path is proven separately by the CLI run
 * recorded in the README.
 */
import {
  DEFAULT_MODEL_ID,
  DEFAULT_VISION_MODEL_ID,
  type ClineCoreLike,
  type CoreFactory,
} from "@nagriksetu/agents";
import { describe, expect, it } from "vitest";
import type { OcrResult } from "../ocr.js";
import type { AuditPage } from "../pages.js";
import {
  EXTRACTION_MAX_ITERATIONS,
  EXTRACTION_SYSTEM_PROMPT,
  buildExtractionPrompt,
  planPages,
  runExtraction,
} from "./extractor.js";
import { SUGGESTED_FIELD_KEYS } from "./tools.js";

const IMAGE = "data:image/png;base64,AAAA";

function page(number: number, text: string, image: string | undefined = IMAGE): AuditPage {
  return { page: number, text, image, notices: [] };
}

function ocr(pages: Array<[number, string]>): OcrResult {
  return {
    languages: "eng+hin+mar",
    degraded: false,
    notices: [],
    pages: pages.map(([number, text]) => ({
      page: number,
      text,
      confidence: 80,
      skipped: false,
      skipReason: undefined,
    })),
  };
}

interface ToolStub {
  name: string;
  execute: (input: unknown, context?: unknown) => Promise<unknown>;
}

interface SessionStart {
  prompt: string;
  userImages: string[];
  config: {
    providerId: string;
    modelId: string;
    apiKey: string | undefined;
    systemPrompt: string;
    enableTools: boolean;
    enableSpawnAgent: boolean;
    enableAgentTeams: boolean;
    maxIterations: number;
    extraTools: ToolStub[];
  };
}

/** A core that runs `behaviour` when the session starts. */
function mockCore(behaviour: (tools: ToolStub[], start: SessionStart) => Promise<void>): {
  createCore: CoreFactory;
  started: () => SessionStart | undefined;
} {
  let started: SessionStart | undefined;
  return {
    started: () => started,
    createCore: async (): Promise<ClineCoreLike> => ({
      subscribe: () => () => {},
      start: async (input) => {
        started = input as unknown as SessionStart;
        await behaviour(started.config.extraTools, started);
        return { sessionId: "mock-session" };
      },
    }),
  };
}

function tool(tools: readonly ToolStub[], name: string): ToolStub {
  const found = tools.find((entry) => entry.name === name);
  if (!found) throw new Error(`tool ${name} was not supplied to the session`);
  return found;
}

const ENV = { AUDIT_API_KEY: "test-key" };

describe("planPages (R12)", () => {
  it("attaches a clean page and marks nothing sensitive", () => {
    const [plan] = planPages([page(1, "Name: Sandip Ramchandra Kamble")], undefined, false);
    expect(plan).toMatchObject({ sensitive: false, attached: true, ocrText: "" });
  });

  it("withholds a page whose text layer carries an Aadhaar-shaped number", () => {
    const [plan] = planPages([page(1, "Aadhaar 9341 0195 7774")], undefined, false);
    expect(plan?.sensitive).toBe(true);
    expect(plan?.attached).toBe(false);
  });

  it("withholds a scanned page whose OCR text carries an account number", () => {
    const [plan] = planPages(
      [page(1, "")],
      ocr([[1, "A/C No 000123456789 IFSC XSPC0000123"]]),
      false,
    );
    expect(plan?.sensitive).toBe(true);
    expect(plan?.attached).toBe(false);
    expect(plan?.ocrText).toContain("000123456789");
  });

  it("attaches nothing at all in text-only mode", () => {
    const plan = planPages(
      [page(1, "Name: Sandip Ramchandra Kamble"), page(2, "Amount 1640")],
      undefined,
      true,
    );
    expect(plan.map((entry) => entry.attached)).toEqual([false, false]);
    expect(plan.map((entry) => entry.sensitive)).toEqual([false, false]);
  });
});

describe("buildExtractionPrompt", () => {
  it("carries both text sources, the suggested keys and the page marks", () => {
    const plan = planPages(
      [page(1, "Name: Sandip Ramchandra Kamble"), page(2, "Aadhaar 9341 0195 7774")],
      ocr([[1, "Name Sandip Ramchandra Kamble"]]),
      false,
    );
    const prompt = buildExtractionPrompt(plan, 3);
    expect(prompt).toContain(`Suggested keys`);
    expect(prompt).toContain(SUGGESTED_FIELD_KEYS[0] as string);
    expect(prompt).toContain("[text layer] Name: Sandip Ramchandra Kamble");
    expect(prompt).toContain("[ocr text] Name Sandip Ramchandra Kamble");
    expect(prompt).toContain("(image attached");
    expect(prompt).toContain("image withheld");
    expect(prompt).toContain("of 3");
  });

  it("says so plainly when no image is attached", () => {
    const plan = planPages([page(1, "Name: Sandip Ramchandra Kamble")], undefined, true);
    const prompt = buildExtractionPrompt(plan, 1);
    expect(prompt).toContain("No page images are attached");
  });
});

describe("runExtraction", () => {
  it("records fields through the tools and returns the draft with its facts", async () => {
    const core = mockCore(async (tools) => {
      await tool(tools, "record_field").execute({
        key: "Name",
        label: "Name",
        value: "Sandip Ramchandra Kamble",
        normalized: "Sandip Ramchandra Kamble",
        type: "text",
        page: 1,
        handwritten: false,
      });
      await tool(tools, "record_field").execute({
        key: "annual_income",
        label: "Annual income",
        value: "1,80,000",
        normalized: "180000",
        type: "amount",
        page: 1,
        handwritten: false,
      });
      await tool(tools, "flag_issue").execute({
        kind: "missing_seal",
        detail: "No seal is visible.",
      });
      await tool(tools, "submit_extraction").execute({
        document_type_guess: "income_certificate",
        language: "en",
        issuer: "Pune Municipal Corporation",
        has_signature: true,
        has_seal: false,
      });
    });

    const result = await runExtraction(
      { pages: [page(1, "Name: Sandip Ramchandra Kamble")], pagesTotal: 1 },
      { createCore: core.createCore, env: ENV },
    );

    expect(result.sessionId).toBe("mock-session");
    expect(result.draft.fields.map((field) => field.key)).toEqual([
      "name",
      "annual_income",
    ]);
    expect(result.draft.flags[0]?.kind).toBe("missing_seal");
    expect(result.draft.facts).toEqual({
      document_type_guess: "income_certificate",
      language: "en",
      issuer: "Pune Municipal Corporation",
      has_signature: true,
      has_seal: false,
    });
    expect(result.imagePages).toEqual([1]);
    expect(result.withheldPages).toEqual([]);
    expect(result.textOnly).toBe(false);
  });

  it("starts with no image for a page carrying an Aadhaar-shaped number", async () => {
    const core = mockCore(async (tools) => {
      await tool(tools, "submit_extraction").execute({
        document_type_guess: "id_card",
        language: "bi",
        issuer: "",
      });
    });

    const result = await runExtraction(
      {
        pages: [page(1, "Name: Sandip Ramchandra Kamble"), page(2, "Aadhaar 9341 0195 7774")],
        pagesTotal: 2,
      },
      { createCore: core.createCore, env: ENV },
    );

    const start = core.started() as SessionStart;
    expect(start.userImages).toEqual([IMAGE]); // only page 1
    expect(result.imagePages).toEqual([1]);
    expect(result.withheldPages).toEqual([2]);
    expect(start.prompt).toContain("NOT attached");
    expect(start.prompt).toContain("Use their text");
  });

  it("goes text-only when a scanned ID page is the whole document", async () => {
    const core = mockCore(async (tools) => {
      await tool(tools, "submit_extraction").execute({
        document_type_guess: "id_card",
        language: "en",
        issuer: "",
      });
    });

    const result = await runExtraction(
      { pages: [page(1, "")], pagesTotal: 1, ocr: ocr([[1, "Aadhaar 9341 0195 7774"]]) },
      { createCore: core.createCore, env: ENV },
    );

    const start = core.started() as SessionStart;
    expect(start.userImages).toEqual([]);
    expect(result.textOnly).toBe(true);
    expect(result.withheldPages).toEqual([1]);
    // No images: the run must fall back to the text model, not the vision one.
    expect(start.config.modelId).toBe(DEFAULT_MODEL_ID);
  });

  it("asks for the vision model when page images ride the turn", async () => {
    const core = mockCore(async (tools) => {
      await tool(tools, "submit_extraction").execute({
        document_type_guess: "bank_passbook",
        language: "en",
        issuer: "",
      });
    });

    await runExtraction(
      { pages: [page(1, "Bank Passbook")], pagesTotal: 1 },
      { createCore: core.createCore, env: ENV },
    );

    const start = core.started() as SessionStart;
    expect(start.config.modelId).toBe(DEFAULT_VISION_MODEL_ID);
  });

  it("runs with the audit's own system prompt and the SDK's built-ins off", async () => {
    const core = mockCore(async (tools) => {
      await tool(tools, "submit_extraction").execute({
        document_type_guess: "application_form",
        language: "en",
        issuer: "",
      });
    });

    await runExtraction(
      { pages: [page(1, "Application Form")], pagesTotal: 1 },
      { createCore: core.createCore, env: ENV },
    );

    const start = core.started() as SessionStart;
    expect(start.config.systemPrompt).toBe(EXTRACTION_SYSTEM_PROMPT);
    expect(start.config.enableTools).toBe(false);
    expect(start.config.enableSpawnAgent).toBe(false);
    expect(start.config.enableAgentTeams).toBe(false);
    expect(start.config.maxIterations).toBe(EXTRACTION_MAX_ITERATIONS);
    expect(start.config.apiKey).toBe("test-key");
    expect(start.config.providerId).toBe("cline-pass");
  });

  it("errors naming the missing submission when a run never submits", async () => {
    const core = mockCore(async (tools) => {
      await tool(tools, "record_field").execute({
        key: "name",
        label: "Name",
        value: "Sandip Ramchandra Kamble",
        normalized: "Sandip Ramchandra Kamble",
        type: "text",
        page: 1,
        handwritten: false,
      });
    });

    await expect(
      runExtraction(
        { pages: [page(1, "Name: Sandip Ramchandra Kamble")], pagesTotal: 1 },
        { createCore: core.createCore, env: ENV },
      ),
    ).rejects.toThrowError(/submit_extraction.*nothing was submitted/s);
  });
});
