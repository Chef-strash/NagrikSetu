// POST /api/v1/chatbot/session
//
// Same-origin proxy for the Layer-2 chatbot: decomposes the citizen's query once
// (intent, category, pillar, applicant facts) and returns ranked scheme matches.

import { NextResponse } from "next/server";
import { proxyPost } from "../../../../../lib/chatbot/backend";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const query = typeof payload.query === "string" ? payload.query.trim() : "";
  if (query.length < 3 || query.length > 500) {
    return NextResponse.json(
      { error: "Query must be between 3 and 500 characters." },
      { status: 400 }
    );
  }

  const { status, body } = await proxyPost("/api/v1/chatbot/session", { ...payload, query });
  return NextResponse.json(body, { status });
}