/**
 * The extraction session (U6). One Cline SDK session per document, through the
 * shared `runAgentSession` (KTD1), which also redirects and purges the harness
 * session store (KTD1a) — so the prompt and the page images never outlive the
 * run on disk.
 *
 * Two rules shape the request:
 * - **R12**: a page whose text layer *or* OCR text carries an ID- or
 *   account-shaped number is not attached as an image; its text is sent
 *   instead. Evaluated against both sources, so a scanned Aadhaar (no text
 *   layer at all) is still withheld.
 * - **R6/R7**: the prompt offers suggested key names and nothing else. No
 *   per-document-type schema exists, and the agent invents keys as needed.
 */
import { runAgentSession, type ClineCoreLike } from "@nagriksetu/agents";
import type { OcrResult } from "../ocr.js";
import type { AuditPage } from "../pages.js";
import { containsSensitiveNumber } from "../verify/mask.js";
import {
  EXTRACTION_COMPLETION_TOOL,
  SUGGESTED_FIELD_KEYS,
  createExtractionDraft,
  makeExtractionTools,
  type ExtractionDraft,
} from "./tools.js";

/** Iterations allowed for a document read; documents are short. */
export const EXTRACTION_MAX_ITERATIONS = 25;

export const EXTRACTION_SYSTEM_PROMPT = [
  "You audit one citizen document for a municipal welfare application, in India.",
  "Read every page you are given, then record what the document actually says.",
  "Rules:",
  "record only values you can see — never guess or complete a value from context;",
  "copy the label and the value exactly as printed, in the document's own language;",
  "give a normalised value as well (dates as YYYY-MM-DD, amounts as digits only);",
  "mark a value handwritten when it is written by hand rather than printed;",
  "there is no fixed list of fields: record whatever facts this document contains,",
  "using a suggested key when one fits and a clear snake_case key otherwise;",
  "do not judge statutory eligibility — flag only what you can see (a blank",
  "signature space, a broken seal, a crossed-out entry) with flag_issue;",
  `and finish by calling ${EXTRACTION_COMPLETION_TOOL} exactly once with the document facts.`,
].join(" ");

export interface ExtractionInput {
  /** Pages read from the upload, in order, with images in RAM only. */
  pages: readonly AuditPage[];
  pagesTotal: number;
  /** OCR text per page, used for corroboration and for the R12 test. */
  ocr?: OcrResult | undefined;
  /** Force text-only mode: no page images ride the turn. */
  textOnly?: boolean | undefined;
}

export interface ExtractionDeps {
  /** Injectable core factory (tests run with no model call). */
  createCore?: ((options: Record<string, unknown>) => Promise<ClineCoreLike>) | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

export interface ExtractionResult {
  sessionId: string;
  providerId: string;
  modelId: string;
  draft: ExtractionDraft;
  /** Pages NOT attached as images because their text carries an ID number. */
  withheldPages: number[];
  /** Pages attached as images, in the order they were attached. */
  imagePages: number[];
  /** True when no image was attached at all. */
  textOnly: boolean;
  events: unknown[];
}

interface PagePlan {
  page: AuditPage;
  ocrText: string;
  sensitive: boolean;
  attached: boolean;
}

/** Decide per page what the model sees (R12), before any request is built. */
export function planPages(
  pages: readonly AuditPage[],
  ocr: OcrResult | undefined,
  textOnly: boolean,
): PagePlan[] {
  const ocrByPage = new Map(
    (ocr?.pages ?? []).map((result) => [result.page, result.text] as const),
  );
  return pages.map((page) => {
    const ocrText = ocrByPage.get(page.page) ?? "";
    // R12: both sources are tested, so a scan with no text layer at all is
    // still caught by its OCR text.
    const sensitive =
      containsSensitiveNumber(page.text) || containsSensitiveNumber(ocrText);
    return {
      page,
      ocrText,
      sensitive,
      attached: !textOnly && !sensitive && page.image !== undefined,
    };
  });
}

/** The user turn: page text (both sources), attached pages, and the rules. */
export function buildExtractionPrompt(
  plan: readonly PagePlan[],
  pagesTotal: number,
): string {
  const attached = plan
    .filter((entry) => entry.attached)
    .map((entry) => entry.page.page);
  const withheld = plan
    .filter((entry) => !entry.attached && entry.sensitive)
    .map((entry) => entry.page.page);
  const lines: string[] = [
    `Audit this document. Read page(s) 1..${plan.length} of ${pagesTotal}${plan.length < pagesTotal ? " (only these were read)" : ""}.`,
    attached.length > 0
      ? `Attached images, in this order: ${attached.map((page) => `page ${page}`).join(", ")}.`
      : "No page images are attached; use the text below.",
  ];
  if (withheld.length > 0) {
    lines.push(
      `Pages ${withheld.join(", ")} are NOT attached as images because their text contains an ID or account number, which must not be sent as an image. Use their text.`,
    );
  }
  lines.push(
    "",
    `Suggested keys (use one when it fits the fact; invent a clear snake_case key otherwise): ${SUGGESTED_FIELD_KEYS.join(", ")}.`,
    "",
  );
  for (const entry of plan) {
    const marks = [
      entry.attached ? "image attached" : undefined,
      entry.sensitive ? "image withheld, ID/account number on page" : undefined,
    ].filter((mark): mark is string => mark !== undefined);
    lines.push(
      `--- page ${entry.page.page}${marks.length > 0 ? ` (${marks.join("; ")})` : ""} ---`,
    );
    lines.push(`[text layer] ${entry.page.text.trim() || "(none)"}`);
    lines.push(`[ocr text] ${entry.ocrText.trim() || "(none)"}`);
    for (const notice of entry.page.notices) lines.push(`[note] ${notice}`);
    lines.push("");
  }
  lines.push(
    "Record every field with record_field, then call submit_extraction once with the document-level facts.",
  );
  return lines.join("\n");
}

/**
 * Run one extraction session. Returns the draft store the tools filled; a run
 * that never calls `submit_extraction` throws through `runAgentSession` with a
 * message naming the missing submission.
 */
export async function runExtraction(
  input: ExtractionInput,
  deps: ExtractionDeps = {},
): Promise<ExtractionResult> {
  const textOnly = input.textOnly ?? false;
  const plan = planPages(input.pages, input.ocr, textOnly);
  const images = plan
    .filter((entry) => entry.attached)
    .map((entry) => entry.page.image as string);
  const draft = createExtractionDraft();
  const session = await runAgentSession({
    systemPrompt: EXTRACTION_SYSTEM_PROMPT,
    prompt: buildExtractionPrompt(plan, input.pagesTotal),
    userImages: images,
    tools: makeExtractionTools(draft),
    prefix: "AUDIT",
    clientName: "nagriksetu-audit",
    maxIterations: EXTRACTION_MAX_ITERATIONS,
    ...(deps.createCore ? { createCore: deps.createCore } : {}),
    ...(deps.env ? { env: deps.env } : {}),
  });
  return {
    sessionId: session.sessionId,
    providerId: session.providerId,
    modelId: session.modelId,
    draft,
    withheldPages: plan
      .filter((entry) => entry.sensitive)
      .map((entry) => entry.page.page),
    imagePages: plan
      .filter((entry) => entry.attached)
      .map((entry) => entry.page.page),
    textOnly: images.length === 0,
    events: session.events,
  };
}
