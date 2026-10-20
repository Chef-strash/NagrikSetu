// Optional server-side document storage + masked extraction metadata.
// Zero-PII rule: files are processed in RAM
// only, so storage is OFF unless DOCUMENT_STORAGE_ENABLED=true.

export interface StorageDeps {
  getUser: (token: string) => Promise<{ id: string } | null>;
  upload: (path: string, bytes: ArrayBuffer, contentType: string) => Promise<{ error: unknown | null }>;
  enabled: boolean;
  uuid: () => string;
}

export function safeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "").slice(0, 80) || "file";
}

export async function handleDocumentUpload(
  request: Request,
  deps: StorageDeps
): Promise<{ status: number; body?: Record<string, unknown> }> {
  if (!deps.enabled) {
    return { status: 204 }; // storage disabled by policy (process in RAM only)
  }
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { status: 401, body: { error: "unauthorized" } };
  const user = await deps.getUser(token);
  if (!user) return { status: 401, body: { error: "unauthorized" } };

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { status: 400, body: { error: "invalid_form" } };
  }
  const file = form.get("file");
  const session = safeFileName(String(form.get("session_id") ?? "none"));
  if (!(file instanceof Blob)) return { status: 400, body: { error: "file_required" } };

  const name = safeFileName((file as File).name ?? "file");
  const path = `${user.id}/${session}/${deps.uuid()}-${name}`;
  const { error } = await deps.upload(path, await file.arrayBuffer(), file.type || "application/octet-stream");
  if (error) return { status: 502, body: { error: "storage_failed" } };
  return { status: 201, body: { path } };
}

export interface ExtractionRow {
  sessionId: string;
  documentId: string;
  modelId: string;
  documentTypeGuess?: string;
  needsReview?: boolean;
  pagesRead?: number;
  pagesTotal?: number;
  /** Already-masked audit response. Never raw values. */
  result: unknown;
}

/** Saves masked extraction metadata. Returns false (never throws) on any problem. */
export async function saveExtraction(
  insert: (table: string, row: Record<string, unknown>) => Promise<{ error: unknown | null }>,
  row: ExtractionRow
): Promise<boolean> {
  const text = JSON.stringify(row.result ?? {});
  // Same shapes the DB CHECK constraints reject; refuse before sending.
  if (/\d{9,}/.test(text) || /[A-Z]{5}\d{4}[A-Z]/.test(text)) return false;
  try {
    const { error } = await insert("document_extractions", {
      session_id: row.sessionId,
      document_id: row.documentId,
      model_id: row.modelId,
      document_type_guess: row.documentTypeGuess ?? "",
      needs_review: row.needsReview ?? true,
      pages_read: row.pagesRead ?? 0,
      pages_total: row.pagesTotal ?? 0,
      result: row.result
    });
    return !error;
  } catch {
    return false;
  }
}

export interface ExtractionSaveDeps {
  getUser: (token: string) => Promise<{ id: string } | null>;
  insert: (table: string, row: Record<string, unknown>) => Promise<{ error: unknown | null }>;
}

/**
 * POST body: { sessionId, documentId, response } where `response` is the already
 * masked audit-service response. Requires a valid user token; refuses (422) any
 * payload that looks unmasked. Always safe to ignore failures client-side.
 */
export async function handleExtractionSave(
  request: Request,
  deps: ExtractionSaveDeps
): Promise<{ status: number; body?: Record<string, unknown> }> {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { status: 401, body: { error: "unauthorized" } };
  const user = await deps.getUser(token);
  if (!user) return { status: 401, body: { error: "unauthorized" } };

  let body: { sessionId?: unknown; documentId?: unknown; response?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return { status: 400, body: { error: "invalid_json" } };
  }
  const resp = body.response as Record<string, unknown> | null | undefined;
  if (typeof body.sessionId !== "string" || typeof body.documentId !== "string" || !resp || typeof resp !== "object") {
    return { status: 400, body: { error: "invalid_payload" } };
  }

  const ok = await saveExtraction(deps.insert, {
    sessionId: body.sessionId.slice(0, 80),
    documentId: body.documentId.slice(0, 80),
    modelId: typeof resp.model === "string" ? resp.model : "",
    documentTypeGuess: typeof resp.document_type_guess === "string" ? resp.document_type_guess : "",
    needsReview: typeof resp.needs_review === "boolean" ? resp.needs_review : true,
    pagesRead: typeof resp.pages_read === "number" ? resp.pages_read : 0,
    pagesTotal: typeof resp.pages_total === "number" ? resp.pages_total : 0,
    result: resp
  });
  return ok ? { status: 201 } : { status: 422, body: { error: "not_saved" } };
}

/** Browser side: fire-and-forget. Never throws; resolves false on any problem. */
export async function postExtraction(
  token: string,
  payload: { sessionId: string; documentId: string; response: unknown },
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  try {
    const res = await fetchImpl("/api/v1/documents/extraction", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    return res.status === 201;
  } catch {
    return false;
  }
}
