import { NextResponse } from "next/server";
import { requestExtraction } from "@/lib/audit/service-client";

export const dynamic = "force-dynamic";

// /extract on the audit service runs a 40-60s vision call per document, so this
// route must not be pre-rendered or cached, and it needs headroom well past the
// default. The service's own run timeout is 120s.
export const maxDuration = 300;

/**
 * POST /api/v1/audit/extract
 *
 * Server-side proxy to the audit service (packages/audit, KTD7). The browser sends
 * one file per request; the shared secret (`AUDIT_SERVICE_TOKEN`) is read from the
 * server environment here and never leaves it.
 *
 * Every outcome is returned as a typed body with status 200 so the client has a
 * single parse path:
 *   { available: true, ok: true, response }            -> a masked extraction
 *   { available: true, ok: false, error, ... }         -> the service refused/failed
 *   { available: false, reason: "unconfigured" | "unreachable" } -> use the offline path
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { available: true, ok: false, error: "invalid_multipart" },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { available: true, ok: false, error: "file_required" },
      { status: 400 }
    );
  }

  const sessionId = String(form.get("session_id") ?? "").trim() || "web-session";
  const documentId = String(form.get("document_id") ?? "").trim() || "web-document";

  const outcome = await requestExtraction({
    bytes: new Uint8Array(await file.arrayBuffer()),
    fileName: file.name || "document",
    mimeType: file.type || "application/octet-stream",
    sessionId,
    documentId
  });

  return NextResponse.json(outcome);
}
