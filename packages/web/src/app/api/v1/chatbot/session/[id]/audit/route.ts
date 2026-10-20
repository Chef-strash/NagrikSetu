// POST /api/v1/chatbot/session/:id/audit
//
// Same-origin proxy: saves a completed document audit (labels and statuses only,
// no field values) on the chat session so the assistant can discuss it.

import { NextResponse } from "next/server";
import { proxyPost } from "../../../../../../../lib/chatbot/backend";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!Array.isArray(payload.documents) || payload.documents.length === 0) {
    return NextResponse.json({ error: "documents[] is required." }, { status: 400 });
  }

  const { status, body } = await proxyPost(
    `/api/v1/chatbot/session/${encodeURIComponent(params.id)}/audit`,
    { documents: payload.documents, summary: payload.summary }
  );
  return NextResponse.json(body, { status });
}
