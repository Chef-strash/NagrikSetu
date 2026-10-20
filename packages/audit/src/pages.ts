/**
 * Page preparation (U4) — an uploaded buffer in, up to 3 pages out, each with
 * its text and an image, entirely in memory (R4, R5).
 *
 * - Type comes from **magic bytes**, never the file name: a text file renamed
 *   `.pdf` is rejected as unsupported (U4 test scenario).
 * - The 10 MB cap and the 3-page cap are enforced here; the page cap is passed
 *   into the shared reader as `maxPages`, so pages beyond it are never
 *   rasterised (KTD4/KTD5 rationale in `@nagriksetu/documents/src/pdf.ts`).
 * - A JPEG or PNG upload becomes one image page — no PDF reader involved.
 * - Nothing is written anywhere: buffers stay in RAM and are dereferenced when
 *   the caller drops the returned document.
 *
 * `readPdfPages` routes a page to the image path when its text layer is empty
 * (a true scan) or unusable (legacy-font mojibake). Every page additionally
 * gets a rendered image, because R12's "send text, not the image" rule only
 * makes sense if the image would otherwise have been attached.
 */
import {
  createUnpdfReader,
  readPdfPages,
  type PdfPage,
  type PdfReader,
} from "@nagriksetu/documents";
import { DEFAULT_MAX_PAGES, DEFAULT_MAX_UPLOAD_BYTES } from "./config.js";

export type DocumentKind = "pdf" | "jpeg" | "png";

/** Why an upload could not be prepared. */
export type AuditInputErrorCode = "empty_input" | "unsupported_type" | "oversize";

/** Typed input rejection (U4 step 3): unsupported type, oversize, empty. */
export class AuditInputError extends Error {
  readonly code: AuditInputErrorCode;
  constructor(code: AuditInputErrorCode, message: string) {
    super(message);
    this.name = "AuditInputError";
    this.code = code;
  }
}

/** One prepared page. `image` is a data URL; `text` is usable text-layer text. */
export interface AuditPage {
  page: number;
  /** Text-layer text when it is real text; `""` for a scan or mojibake page. */
  text: string;
  /**
   * PNG data URL for a PDF page; for a JPEG/PNG upload, the upload's own bytes
   * as a data URL. `undefined` only when no renderer was supplied (tests).
   */
  image: string | undefined;
  /** Per-page notes worth surfacing (missing renderer, and so on). */
  notices: string[];
}

export interface PreparedDocument {
  kind: DocumentKind;
  /** Pages actually read (<= the cap). */
  pagesRead: number;
  /** Pages in the upload, before the cap (1 for a JPEG/PNG). */
  pagesTotal: number;
  /** True when the upload had more pages than the cap allowed. */
  truncated: boolean;
  pages: AuditPage[];
}

export interface PrepareDocumentOptions {
  /** Injectable reader (tests); defaults to the real `unpdf` reader. */
  reader?: PdfReader | undefined;
  maxPages?: number | undefined;
  maxUploadBytes?: number | undefined;
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46] as const; // %PDF
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const JPEG_MAGIC = [0xff, 0xd8, 0xff] as const;

function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
  if (bytes.byteLength < magic.length) return false;
  for (let i = 0; i < magic.length; i += 1) {
    if (bytes[i] !== magic[i]) return false;
  }
  return true;
}

/** Detect the real container from its leading bytes (R4). */
export function detectDocumentKind(bytes: Uint8Array): DocumentKind | undefined {
  if (startsWith(bytes, PDF_MAGIC)) return "pdf";
  if (startsWith(bytes, PNG_MAGIC)) return "png";
  if (startsWith(bytes, JPEG_MAGIC)) return "jpeg";
  return undefined;
}

/** `data:` URL for an uploaded image, decoded from bytes held in RAM. */
export function imageDataUrl(kind: DocumentKind, bytes: Uint8Array): string {
  const media = kind === "jpeg" ? "image/jpeg" : "image/png";
  return `data:${media};base64,${Buffer.from(bytes).toString("base64")}`;
}

/**
 * Turn an uploaded buffer into pages (R4, R5). Throws `AuditInputError` for an
 * empty, unsupported or oversize buffer.
 */
export async function prepareDocument(
  bytes: Uint8Array,
  options: PrepareDocumentOptions = {},
): Promise<PreparedDocument> {
  const maxBytes = options.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
  if (bytes.byteLength === 0) {
    throw new AuditInputError("empty_input", "upload is empty; nothing to read");
  }
  if (bytes.byteLength > maxBytes) {
    throw new AuditInputError(
      "oversize",
      `upload is ${bytes.byteLength} bytes; the limit is ${maxBytes} bytes`,
    );
  }
  const kind = detectDocumentKind(bytes);
  if (kind === undefined) {
    throw new AuditInputError(
      "unsupported_type",
      "upload is not a PDF, JPEG or PNG (checked by content, not by file name)",
    );
  }

  if (kind !== "pdf") {
    // A JPEG or PNG is a single image page: nothing to extract, render or slice.
    const page: AuditPage = {
      page: 1,
      text: "",
      image: imageDataUrl(kind, bytes),
      notices: [],
    };
    return { kind, pagesTotal: 1, pagesRead: 1, truncated: false, pages: [page] };
  }

  const reader = options.reader ?? createUnpdfReader();
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  // `getDocumentProxy` hands the bytes to the pdfjs worker, which DETACHES the
  // ArrayBuffer it is given (KTD5) — `pageCount` and text extraction both do
  // it. So the bytes the reader parses and the bytes the renderer draws from
  // are two separate copies, and only the reader's copy may be detached.
  const readerBytes = new Uint8Array(bytes);
  const renderBytes = new Uint8Array(bytes);
  const pagesTotal = await reader.pageCount(readerBytes);
  const routed = await readPdfPages(new Uint8Array(bytes), reader, { maxPages });

  const pages: AuditPage[] = [];
  for (const routedPage of routed) {
    pages.push(await toAuditPage(routedPage, reader, renderBytes));
  }
  return {
    kind,
    pagesTotal,
    pagesRead: pages.length,
    truncated: pages.length < pagesTotal,
    pages,
  };
}

async function toAuditPage(
  page: PdfPage,
  reader: PdfReader,
  renderBytes: Uint8Array,
): Promise<AuditPage> {
  const notices: string[] = [];
  // A scan/mojibake page already carries its rendering; a text page still gets
  // one, because R12 withholds images that would otherwise ride the turn.
  let image = page.scanImage;
  if (image === undefined) {
    if (reader.renderPng) {
      image = await reader.renderPng(renderBytes, page.page);
    } else {
      notices.push(
        `page ${page.page}: no renderer available; the model sees text only`,
      );
    }
  }
  if (page.text.trim().length === 0 && image === undefined) {
    notices.push(`page ${page.page}: no text layer and no rendering available`);
  }
  return { page: page.page, text: page.text, image, notices };
}
