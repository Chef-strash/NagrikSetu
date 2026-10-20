// POST /api/v1/chatbot/audit-summary
//
// Same-origin proxy: asks the Layer-2 backend to phrase a completed document audit
// for the chat thread. The audit itself is decided in this app; the backend only
// writes the summary, and returns { summary: null } when no LLM is configured.

import { NextResponse } from "next/server";
import { proxyPost } from "@/lib/chatbot/backend";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!Array.isArray(payload.documents) && !Array.isArray(payload.fields)) {
    return NextResponse.json(
      { error: "A documents or fields list is required." },
      { status: 400 }
    );
  }

  const { status, body } = await proxyPost("/api/v1/chatbot/audit-summary", payload);
  return NextResponse.json(body, { status });
}
