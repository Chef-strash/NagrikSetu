// Server-side client for the audit service (packages/audit, KTD7).
//
// The service is a separate, loopback-bound process that refuses to run without
// `AUDIT_SERVICE_TOKEN`. This module is the only place that ever reads that token,
// and it is imported only by the Next route handler — never by a client component —
// so the token cannot leak into the browser bundle.
//
// Offline resilience (Protocol 5): an unreachable or unconfigured service is a
// normal, typed outcome (`available: false`), not a thrown error, so the caller
// can fall back to the local deterministic audit instead of breaking the demo.

import type { ExtractResponse } from "./adapt.ts";

/** Where the service listens by default (packages/audit/src/config.ts). */
export const DEFAULT_AUDIT_SERVICE_URL = "http://127.0.0.1:8787";
export const AUDIT_TOKEN_HEADER = "x-audit-token";
export const AUDIT_SERVICE_TOKEN_ENV = "AUDIT_SERVICE_TOKEN";
export const AUDIT_SERVICE_URL_ENV = "AUDIT_SERVICE_URL";

/**
 * The service's own run timeout is 120s (DEFAULT_RUN_TIMEOUT_MS); we wait a little
 * longer so the service's clearer error wins the race rather than our abort.
 */
export const EXTRACT_TIMEOUT_MS = 150_000;

export interface ExtractRequestInput {
  bytes: Uint8Array | Blob;
  fileName: string;
  mimeType: string;
  /** Citizen session id — required by the service's contract. */
  sessionId: string;
  /** Caller-side document id, echoed into the stored extraction record. */
  documentId: string;
}

export type ExtractOutcome =
  | { available: true; ok: true; response: ExtractResponse }
  | { available: true; ok: false; status: number; error: string; detail?: string }
  /** Offline path: run the local fallback audit instead. */
  | { available: false; reason: "unconfigured" | "unreachable"; detail?: string };

export interface ExtractDeps {
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
}

function resolveEnv(deps: ExtractDeps | undefined): Record<string, string | undefined> {
  return deps?.env ?? process.env;
}

/**
 * Call `POST /extract` with one file. Returns a typed outcome for every case —
 * unconfigured, unreachable, service error, or a masked `AuditResponse`.
 */
export async function requestExtraction(
  input: ExtractRequestInput,
  deps?: ExtractDeps
): Promise<ExtractOutcome> {
  const env = resolveEnv(deps);
  const token = env[AUDIT_SERVICE_TOKEN_ENV];
  if (!token) {
    return {
      available: false,
      reason: "unconfigured",
      detail: `${AUDIT_SERVICE_TOKEN_ENV} is not set, so the audit service is not used.`
    };
  }

  const baseUrl = (env[AUDIT_SERVICE_URL_ENV] ?? DEFAULT_AUDIT_SERVICE_URL).replace(/\/+$/, "");

  const form = new FormData();
  form.set("file", toBlob(input.bytes, input.mimeType), input.fileName);
  form.set("session_id", input.sessionId);
  form.set("document_id", input.documentId);

  const doFetch = deps?.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTRACT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await doFetch(`${baseUrl}/extract`, {
      method: "POST",
      headers: { [AUDIT_TOKEN_HEADER]: token },
      body: form,
      signal: controller.signal
    });
  } catch (error) {
    // The service is down, blocked, or timed out — fall back, don't fail the app.
    return {
      available: false,
      reason: "unreachable",
      detail: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await safeJson(response);
    return {
      available: true,
      ok: false,
      status: response.status,
      error: typeof body?.error === "string" ? body.error : "extract_failed",
      ...(typeof body?.detail === "string" ? { detail: body.detail } : {})
    };
  }

  const payload = await safeJson(response);
  if (!payload || !Array.isArray(payload.fields)) {
    return {
      available: true,
      ok: false,
      status: response.status,
      error: "malformed_response",
      detail: "The audit service returned a payload without a fields array."
    };
  }

  return { available: true, ok: true, response: payload as unknown as ExtractResponse };
}

async function safeJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Wrap bytes as a Blob part. A Uint8Array may be a view over a shared or larger
 * buffer, so it is copied into its own ArrayBuffer first — both for type-correctness
 * (BlobPart needs a real ArrayBuffer) and so the caller's buffer is never aliased.
 */
function toBlob(bytes: Uint8Array | Blob, mimeType: string): Blob {
  if (bytes instanceof Blob) return bytes;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: mimeType });
}
