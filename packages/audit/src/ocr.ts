/**
 * OCR cross-check (U5) — per-page text in English, Hindi and Marathi, as
 * **corroboration only** (KTD9). The agent reads the page images; OCR text is
 * used to (a) confirm a value the model recorded and (b) supply text for a page
 * whose image is withheld under R12.
 *
 * Behaviour that matters for a demo:
 * - A page whose text layer already counts as real text is never OCR'd.
 * - Language data is loaded from a local directory when `AUDIT_TESSDATA_DIR` is
 *   set (`<lang>.traineddata` files), so a demo needs no network.
 * - If OCR cannot run at all — no data, no network, a broken binary — the run
 *   **degrades loudly**: `degraded: true` plus a notice naming the error. It
 *   never throws and never silently pretends a page was cross-checked.
 */
import { tmpdir } from "node:os";
import { looksLikeRealText } from "@nagriksetu/documents";
import type { AuditPage } from "./pages.js";

/** Languages tesseract.js is asked for (U5 step 1). */
export const OCR_LANGUAGES = "eng+hin+mar";

export interface OcrPageResult {
  page: number;
  text: string;
  /** Tesseract's mean confidence, 0-100; 0 when the page was skipped. */
  confidence: number;
  skipped: boolean;
  /** Why the page was skipped (real text layer, no image). */
  skipReason: string | undefined;
}

export interface OcrResult {
  languages: string;
  pages: OcrPageResult[];
  /** True when OCR could not run; text came from the text layer alone. */
  degraded: boolean;
  /** Loud, user-visible notes (degradation, skipped pages worth naming). */
  notices: string[];
}

/** One recognition call. Kept tiny so tests can supply a fake engine. */
export interface OcrEngine {
  recognize(
    image: Buffer,
    page: number,
  ): Promise<{ text: string; confidence: number }>;
  terminate(): Promise<void>;
}

export interface OcrEngineOptions {
  languages: string;
  tessdataDir: string | undefined;
  tessdataCacheDir: string;
}

/** Test seam: build the engine (default: tesseract.js). */
export type OcrEngineFactory = (options: OcrEngineOptions) => Promise<OcrEngine>;

export interface OcrOptions {
  languages?: string | undefined;
  tessdataDir?: string | undefined;
  tessdataCacheDir?: string | undefined;
  engineFactory?: OcrEngineFactory | undefined;
}

const DATA_URL_RE = /^data:([a-z]+\/[a-z0-9.+-]+)?;base64,(.*)$/i;

/**
 * Decode a `data:` URL to bytes. Everything stays in RAM: the buffer is handed
 * to the OCR worker and dropped when the call returns.
 */
export function decodeDataUrl(dataUrl: string): Buffer {
  const match = DATA_URL_RE.exec(dataUrl.trim());
  if (!match?.[2]) {
    throw new Error("page image is not a base64 data URL");
  }
  return Buffer.from(match[2], "base64");
}

/** A page with a usable text layer needs no OCR (U5 step 2). */
export function needsOcr(page: AuditPage): boolean {
  if (page.image === undefined) return false;
  return !looksLikeRealText(page.text);
}

/** Failure notice text — deliberately explicit about the consequence. */
export function degradationNotice(error: unknown, options: OcrOptions): string {
  const detail = error instanceof Error ? error.message : String(error);
  return [
    `OCR unavailable (${detail}).`,
    "Values are corroborated against the PDF text layer only;",
    "a scanned page with no text layer cannot be cross-checked (KTD9).",
    options.tessdataDir
      ? `Language data was requested from ${options.tessdataDir}.`
      : "Set AUDIT_TESSDATA_DIR to a directory of eng/hin/mar .traineddata files to run OCR with no network.",
  ].join(" ");
}

/**
 * OCR every page that has no usable text layer. Never throws; failures come
 * back as `degraded: true` with a notice.
 */
export async function ocrPages(
  pages: readonly AuditPage[],
  options: OcrOptions = {},
): Promise<OcrResult> {
  const languages = options.languages ?? OCR_LANGUAGES;
  const results: OcrPageResult[] = [];
  const notices: string[] = [];
  const targets = pages.filter(needsOcr);

  for (const page of pages) {
    if (!needsOcr(page)) {
      results.push({
        page: page.page,
        text: "",
        confidence: 0,
        skipped: true,
        skipReason:
          page.image === undefined
            ? "no page image to read"
            : "text layer is already usable",
      });
    }
  }
  if (targets.length === 0) {
    return { languages, pages: byPage(results), degraded: false, notices };
  }

  const factory = options.engineFactory ?? createTesseractEngine;
  let engine: OcrEngine | undefined;
  try {
    engine = await factory({
      languages,
      tessdataDir: options.tessdataDir,
      tessdataCacheDir: options.tessdataCacheDir ?? tmpdir() + "/nagriksetu-tessdata",
    });
    for (const page of targets) {
      const recognised = await engine.recognize(
        decodeDataUrl(page.image as string),
        page.page,
      );
      results.push({
        page: page.page,
        text: recognised.text,
        confidence: recognised.confidence,
        skipped: false,
        skipReason: undefined,
      });
    }
    return { languages, pages: byPage(results), degraded: false, notices };
  } catch (error) {
    notices.push(degradationNotice(error, options));
    for (const page of targets) {
      if (results.some((result) => result.page === page.page)) continue;
      results.push({
        page: page.page,
        text: "",
        confidence: 0,
        skipped: true,
        skipReason: "OCR unavailable",
      });
    }
    return { languages, pages: byPage(results), degraded: true, notices };
  } finally {
    // Free the worker (and its wasm heap) as soon as the pages are done.
    await engine?.terminate().catch(() => undefined);
  }
}

function byPage(pages: OcrPageResult[]): OcrPageResult[] {
  return [...pages].sort((a, b) => a.page - b.page);
}

/** The slice of tesseract.js this module uses, mirroring its `index.d.ts`. */
interface TesseractModule {
  createWorker(
    langs: string,
    oem: number,
    options: Record<string, unknown>,
  ): Promise<TesseractWorker>;
  OEM: { LSTM_ONLY: number };
}

interface TesseractWorker {
  recognize(image: Buffer): Promise<{
    data: { text: string; confidence: number };
  }>;
  terminate(): Promise<unknown>;
}

/**
 * Real engine: one tesseract.js worker reused for every page — loading language
 * data is the expensive part, so it happens once per run.
 */
export async function createTesseractEngine(
  options: OcrEngineOptions,
): Promise<OcrEngine> {
  // Signatures verified against `tesseract.js@7.0.0/src/index.d.ts`:
  // `createWorker(langs, oem, options)`, with `langPath` accepted as a local
  // filesystem path in Node. `cacheMethod: "none"` stops the library reading or
  // writing `<cachePath>/<lang>.traineddata`, so a local tessdata directory is
  // used read-only and nothing is written next to the source tree.
  const tesseract = (await import("tesseract.js")) as unknown as TesseractModule;
  const localData = options.tessdataDir !== undefined;
  const worker = await tesseract.createWorker(
    options.languages,
    tesseract.OEM.LSTM_ONLY,
    {
      // A local directory holds plain `<lang>.traineddata`; the CDN serves gzip.
      langPath: options.tessdataDir,
      gzip: !localData,
      cachePath: options.tessdataCacheDir,
      cacheMethod: localData ? "none" : "write",
      workerBlobURL: false,
      logger: () => undefined,
      errorHandler: () => undefined,
    },
  );
  return {
    async recognize(image: Buffer, _page: number) {
      const { data } = await worker.recognize(image);
      return { text: data.text ?? "", confidence: data.confidence ?? 0 };
    },
    terminate: async () => {
      await worker.terminate();
    },
  };
}
