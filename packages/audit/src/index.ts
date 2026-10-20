/**
 * `@nagriksetu/audit` — the citizen document audit (R6-R15).
 *
 * Upload bytes in, masked JSON out: page preparation (magic bytes, 10 MB,
 * 3 pages), OCR corroboration, one Cline-SDK extraction session with tools that
 * record whatever fields the document actually contains, code-side
 * verification, pattern-first masking last, and an optional masked-result store.
 *
 * Zero-PII: no upload, page image or unmasked identity number is written to
 * disk, a log, a response or a database row.
 */
export * from "./config.js";
export * from "./pages.js";
export * from "./ocr.js";
export * from "./agent/tools.js";
export * from "./agent/extractor.js";
export * from "./verify/validators.js";
export * from "./verify/verify.js";
export * from "./verify/mask.js";
export * from "./extract.js";
export * from "./store.js";
export * from "./server.js";
export * from "./eval.js";
