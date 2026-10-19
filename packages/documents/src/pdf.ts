/**
 * PDF content helpers (KTD4): text-layer read + scan PNG renderer + the
 * legacy-font (mojibake) detector that routes unusable text to the image path.
 *
 * Extracted verbatim from `packages/harvester/src/content/pdf.ts`, with one
 * addition: `readPdfPages` takes `maxPages`, so a caller can cap the page count
 * *before* the render loop. Without it, a caller that wants the first three
 * pages of a 10 MB scan would rasterise every page first (measured: about
 * 0.5 s and 1.9 MB of base64 per scanned page) and slice afterwards.
 *
 * `createUnpdfReader` is the real, pure-JS reader backed by `unpdf`, rendering
 * through `renderPageAsImage` + `@napi-rs/canvas`.
 */
import { extractText, getDocumentProxy, renderPageAsImage } from "unpdf";

/** One rendered page: extracted text plus optional scan image (data URL). */
export interface PdfPage {
  page: number;
  /** Text-layer content; empty string when the page is scan-only. */
  text: string;
  /** PNG data URL for scan-only pages; undefined for text pages. */
  scanImage?: string;
}

/** Minimal PDF reader surface (mock-friendly; no binary dep in the slice). */
export interface PdfReader {
  pageCount: Uint8ArrayToPages;
  extractText: (pdf: Uint8Array, page: number) => Promise<string>;
  renderPng?: (pdf: Uint8Array, page: number) => Promise<string>;
}

export type Uint8ArrayToPages = (pdf: Uint8Array) => Promise<number>;

export interface ReadPdfPagesOptions {
  /**
   * Read at most this many pages, counted from page 1. Applied before the
   * render loop, so pages beyond the cap are never rasterised. Omitted,
   * non-finite or greater than the page count means "all pages".
   */
  maxPages?: number | undefined;
}

type UnpdfDocument = Awaited<ReturnType<typeof getDocumentProxy>>;

/**
 * Build a `PdfReader` backed by `unpdf` (pure JS; canvas only for rendering).
 *
 * Parsed documents/text arrays are memoised per buffer identity (WeakMap), so
 * a single buffer passed page-by-page is only decoded once.
 */
export function createUnpdfReader(): PdfReader {
  const documents = new WeakMap<Uint8Array, Promise<UnpdfDocument>>();
  const pageTexts = new WeakMap<Uint8Array, Promise<string[]>>();

  const documentOf = (pdf: Uint8Array): Promise<UnpdfDocument> => {
    let pending = documents.get(pdf);
    if (!pending) {
      pending = getDocumentProxy(pdf);
      documents.set(pdf, pending);
    }
    return pending;
  };

  const textsOf = (pdf: Uint8Array): Promise<string[]> => {
    let pending = pageTexts.get(pdf);
    if (!pending) {
      pending = documentOf(pdf).then(async (doc) => {
        const { text } = await extractText(doc, { mergePages: false });
        return text;
      });
      pageTexts.set(pdf, pending);
    }
    return pending;
  };

  return {
    async pageCount(pdf: Uint8Array): Promise<number> {
      return (await documentOf(pdf)).numPages;
    },
    async extractText(pdf: Uint8Array, page: number): Promise<string> {
      const texts = await textsOf(pdf);
      return texts[page - 1] ?? "";
    },
    /**
     * Rasterise one page to a PNG data URL for the vision path.
     */
    async renderPng(pdf: Uint8Array, page: number): Promise<string> {
      const canvasModule = await import("@napi-rs/canvas");
      const bytes = new Uint8Array(pdf); // defensive copy (unpdf may transfer)
      const ab = await renderPageAsImage(bytes, page, {
        canvasImport: async () => canvasModule,
        scale: 2,
      });
      return "data:image/png;base64," + Buffer.from(ab as ArrayBuffer).toString("base64");
    },
  };
}

/**
 * Heuristic: does an extracted text layer hold REAL text, or the garbled
 * Latin mojibake produced by legacy non-Unicode fonts (Kruti Dev / Shivaji)?
 * Legacy-font PDFs are common in Indian government circulars; feeding their
 * gibberish to the model is worse than sending the page image.
 */
export function looksLikeRealText(text: string): boolean {
  const t = text.trim();
  if (t.length < 20) return false;
  const devanagari = (t.match(/[\u0900-\u097F]/g) ?? []).length;
  // Any real Devanagari volume -> genuine Marathi/Hindi text.
  if (devanagari >= 5 && devanagari / t.length > 0.05) return true;
  // Otherwise judge Latin word-likeness: tokens of letters with a vowel.
  const tokens = t.split(/\s+/).filter((w) => w.length >= 3);
  if (tokens.length === 0) return false;
  const wordLike = tokens.filter(
    (w) => /^[A-Za-z][A-Za-z.,()/'-]*$/.test(w) && /[aeiouAEIOU]/.test(w),
  ).length;
  return wordLike / tokens.length >= 0.4;
}

/** Resolve `maxPages` against the real page count (never negative, never > total). */
function resolvePageCap(maxPages: number | undefined, total: number): number {
  if (maxPages === undefined || !Number.isFinite(maxPages)) return total;
  return Math.min(Math.max(Math.floor(maxPages), 0), total);
}

/**
 * Split a PDF buffer into pages, rendering scan-only / garbled pages to PNG.
 * At most `options.maxPages` pages are read and rendered.
 */
export async function readPdfPages(
  pdf: Uint8Array,
  reader: PdfReader,
  options: ReadPdfPagesOptions = {},
): Promise<PdfPage[]> {
  // Text extraction transfers the PDF bytes to the pdfjs worker, detaching the
  // original buffer. Keep an independent copy for the image path.
  const renderBytes = reader.renderPng ? new Uint8Array(pdf) : undefined;
  const total = await reader.pageCount(pdf);
  // The cap is applied to the loop bound, before any page is rasterised.
  const cap = resolvePageCap(options.maxPages, total);
  const pages: PdfPage[] = [];
  for (let page = 1; page <= cap; page += 1) {
    const text = await reader.extractText(pdf, page);
    if (looksLikeRealText(text)) {
      pages.push({ page, text });
    } else if (reader.renderPng && renderBytes) {
      // No usable text layer (true scan, or legacy-font garbage) -> image.
      pages.push({ page, text: "", scanImage: await reader.renderPng(renderBytes, page) });
    } else {
      pages.push({ page, text: "" });
    }
  }
  return pages;
}

/** Collect scan PNG data URLs in page order for `userImages` on the turn. */
export function scanPagesToUserImages(pages: PdfPage[]): string[] {
  return pages.filter((p) => p.scanImage).map((p) => p.scanImage as string);
}

/** Join text-layer pages for a `read_source`-style tool payload. */
export function textPagesToSourceText(pages: PdfPage[]): string {
  return pages
    .filter((p) => p.text.trim().length > 0)
    .map((p) => `[page ${p.page}]\n${p.text}`)
    .join("\n\n");
}

