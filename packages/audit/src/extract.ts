/**
 * The audit pipeline: upload bytes -> pages -> OCR (corroboration) -> one agent
 * session -> verification -> **masking last** -> response.
 *
 * This is the only path that produces a response, so it is the only place that
 * needs to be trusted: `runAudit` masks the response and then proves nothing
 * survived (`findUnmaskedPii`). A payload that still holds an unmasked Aadhaar,
 * account number or PAN is never returned — the call fails instead.
 *
 * Nothing is written to disk anywhere in here, and the agent session's harness
 * store is redirected and purged by `runAgentSession` (KTD1a).
 */
import type { ClineCoreLike } from "@nagriksetu/agents";
import { runExtraction } from "./agent/extractor.js";
import type { AuditConfig } from "./config.js";
import { ocrPages, type OcrEngineFactory, type OcrResult } from "./ocr.js";
import {
  prepareDocument,
  type PreparedDocument,
  type PrepareDocumentOptions,
} from "./pages.js";
import { findUnmaskedPii, maskAuditResponse, type UnmaskedFinding } from "./verify/mask.js";
import type { BankMerger } from "./verify/validators.js";
import { verifyExtraction, type AuditResponse } from "./verify/verify.js";

/** Raised when masking did not cover everything — never returned to a caller. */
export class AuditMaskingError extends Error {
  readonly findings: UnmaskedFinding[];
  constructor(findings: UnmaskedFinding[]) {
    super(
      `masking failed: ${findings.length} value(s) still readable at ${findings
        .map((finding) => `${finding.path} (${finding.kind})`)
        .join(", ")}`,
    );
    this.name = "AuditMaskingError";
    this.findings = findings;
  }
}

export interface AuditRunInput {
  bytes: Uint8Array;
  sessionId: string;
  documentId: string;
  /** Skip OCR entirely (e.g. `--no-ocr`); corroboration is then text-only. */
  skipOcr?: boolean | undefined;
}

export interface AuditDeps {
  config: AuditConfig;
  createCore?: ((options: Record<string, unknown>) => Promise<ClineCoreLike>) | undefined;
  ocrEngineFactory?: OcrEngineFactory | undefined;
  /** Injectable PDF reader (tests). */
  reader?: PrepareDocumentOptions["reader"];
  bankMergers?: readonly BankMerger[] | undefined;
  now?: Date | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

export interface AuditRunMeta {
  sessionId: string;
  documentId: string;
  kind: PreparedDocument["kind"];
  pagesRead: number;
  pagesTotal: number;
  truncated: boolean;
  providerId: string;
  modelId: string;
  ocrLanguages: string;
  ocrDegraded: boolean;
  textOnly: boolean;
  withheldPages: number[];
  durationMs: number;
}

export interface AuditRunResult {
  /** The masked response: the only shape that ever leaves this process. */
  response: AuditResponse;
  meta: AuditRunMeta;
  /** Always empty — a non-empty list throws before returning (see above). */
  unmasked: UnmaskedFinding[];
}

/** Run one document through the whole pipeline. */
export async function runAudit(
  input: AuditRunInput,
  deps: AuditDeps,
): Promise<AuditRunResult> {
  const startedAt = Date.now();
  const document = await prepareDocument(input.bytes, {
    maxPages: deps.config.maxPages,
    maxUploadBytes: deps.config.maxUploadBytes,
    ...(deps.reader ? { reader: deps.reader } : {}),
  });

  const ocr: OcrResult = input.skipOcr === true
    ? { languages: "", pages: [], degraded: false, notices: ["OCR skipped for this run."] }
    : await ocrPages(document.pages, {
        tessdataDir: deps.config.tessdataDir,
        tessdataCacheDir: deps.config.tessdataCacheDir,
        ...(deps.ocrEngineFactory ? { engineFactory: deps.ocrEngineFactory } : {}),
      });

  const extraction = await runExtraction(
    {
      pages: document.pages,
      pagesTotal: document.pagesTotal,
      ocr,
      textOnly: deps.config.textOnly,
    },
    {
      ...(deps.createCore ? { createCore: deps.createCore } : {}),
      ...(deps.env ? { env: deps.env } : {}),
    },
  );

  const response = verifyExtraction({
    fields: extraction.draft.fields,
    agentFlags: extraction.draft.flags,
    facts: extraction.draft.facts,
    pages: document.pages,
    ocrText: new Map(
      ocr.pages
        .filter((page) => page.text.trim().length > 0)
        .map((page) => [page.page, page.text] as const),
    ),
    pagesRead: document.pagesRead,
    pagesTotal: document.pagesTotal,
    model: extraction.modelId,
    textOnly: extraction.textOnly,
    withheldPages: extraction.withheldPages,
    notices: ocr.notices,
    ...(deps.now ? { now: deps.now } : {}),
    ...(deps.bankMergers ? { bankMergers: deps.bankMergers } : {}),
  });

  // Masking is the last step, and it is proven, not assumed.
  const masked = maskAuditResponse(response);
  const unmasked = findUnmaskedPii(masked);
  if (unmasked.length > 0) {
    throw new AuditMaskingError(unmasked);
  }

  return {
    response: masked,
    unmasked,
    meta: {
      sessionId: input.sessionId,
      documentId: input.documentId,
      kind: document.kind,
      pagesRead: document.pagesRead,
      pagesTotal: document.pagesTotal,
      truncated: document.truncated,
      providerId: extraction.providerId,
      modelId: extraction.modelId,
      ocrLanguages: ocr.languages,
      ocrDegraded: ocr.degraded,
      textOnly: extraction.textOnly,
      withheldPages: extraction.withheldPages,
      durationMs: Date.now() - startedAt,
    },
  };
}
