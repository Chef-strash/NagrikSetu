import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getAdminClient } from "@/lib/supabase-admin";
import { handleDocumentUpload } from "@/lib/documents/storage";

export const dynamic = "force-dynamic";

// POST /api/v1/documents/upload (multipart: file, session_id)
// Disabled (204) unless DOCUMENT_STORAGE_ENABLED=true - zero-PII default.
export async function POST(request: Request) {
  const enabled = process.env.DOCUMENT_STORAGE_ENABLED === "true";
  const admin = getAdminClient();
  if (enabled && !admin) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const result = await handleDocumentUpload(request, {
    enabled,
    uuid: randomUUID,
    getUser: async (token) => {
      const { data, error } = await admin!.auth.getUser(token);
      return error || !data.user ? null : { id: data.user.id };
    },
    upload: async (path, bytes, contentType) =>
      admin!.storage.from("documents").upload(path, bytes, { contentType, upsert: false })
  });

  if (result.status === 204) {
    return new NextResponse(null, { status: 204, headers: { "X-Storage": "disabled-zero-pii" } });
  }
  return NextResponse.json(result.body ?? {}, { status: result.status });
}
