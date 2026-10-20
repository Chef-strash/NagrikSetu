// Client-side validation for document uploads.
//
// Zero-PII note: the file is never read, uploaded or persisted by this app — only
// its NAME is kept on the session. This module is therefore purely a guard rail so
// citizens don't sit waiting on an unreadable scan or a wrongly-typed file.

/** What the file picker accepts (mirrors what ward counters actually scan). */
export const UPLOAD_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";

/** 5 MB — a phone photo or a scanned PDF is comfortably below this. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const ACCEPTED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);
const ACCEPTED_EXT = /\.(png|jpe?g|webp|pdf)$/i;

export interface UploadFileLike {
  name: string;
  size: number;
  type: string;
}

export interface UploadVerdict {
  ok: boolean;
  /** Citizen-facing reason when `ok` is false. */
  error?: string;
}

/** Validate a picked file before we record it on the session. */
export function validateUpload(file: UploadFileLike): UploadVerdict {
  const label = file.name || "That file";

  if (file.size === 0) {
    return { ok: false, error: `${label} looks empty. Please re-scan or choose another file.` };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: `${label} is larger than 5 MB. Please upload a smaller scan.` };
  }

  // Some browsers report an empty MIME type for camera captures, so fall back to
  // the extension before rejecting.
  const typeOk = file.type ? ACCEPTED_MIME.has(file.type) : ACCEPTED_EXT.test(file.name);
  if (!typeOk) {
    return { ok: false, error: `${label} must be a PDF or an image (PNG, JPEG or WebP).` };
  }

  return { ok: true };
}

/** Human-readable size, for the file chip. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}