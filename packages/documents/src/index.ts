/**
 * `@nagriksetu/documents` — the shared document layer (R3).
 *
 * PDF text reading, page rendering to PNG, detection of unusable (legacy-font)
 * text, and PII masking. No agent or scheme code lives here.
 */
export * from "./mask.js";
export * from "./pdf.js";
