// Browser-side caller for the audit proxy route.
//
// The browser never talks to the audit service directly and never sees
// `AUDIT_SERVICE_TOKEN`: it posts one file to `/api/v1/audit/extract`, which the
// Next route handler forwards server-side.

import type { ExtractOutcome } from "./service-client.ts";

export const AUDIT_EXTRACT_ENDPOINT = "/api/v1/audit/extract";

export interface BrowserExtractInput {
  bytes: Uint8Array | Blob;
  fileName: string;
  mimeType: string;
  sessionId: string;
  documentId: string;
}

/** POST one file to the proxy and return the same typed outcome the service client uses. */
export async function extractViaProxy(
  input: BrowserExtractInput,
  fetchImpl: typeof fetch = fetch
): Promise<ExtractOutcome> {
  const form = new FormData();
  const part =
    input.bytes instanceof Blob
      ? input.bytes
      : new Blob([toArrayBuffer(input.bytes)], { type: input.mimeType });
  form.set("file", part, input.fileName);
  form.set("session_id", input.sessionId);
  form.set("document_id", input.documentId);

  let response: Response;
  try {
    response = await fetchImpl(AUDIT_EXTRACT_ENDPOINT, { method: "POST", body: form });
  } catch (error) {
    // Network failure between the browser and our own route: treat as offline.
    return {
      available: false,
      reason: "unreachable",
      detail: error instanceof Error ? error.message : String(error)
    };
  }

  try {
    return (await response.json()) as ExtractOutcome;
  } catch {
    return {
      available: true,
      ok: false,
      status: response.status,
      error: "malformed_response",
      detail: "The audit proxy returned a body that was not JSON."
    };
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
