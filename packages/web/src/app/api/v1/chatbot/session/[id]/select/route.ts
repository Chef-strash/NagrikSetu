// POST /api/v1/chatbot/session/:id/select
//
// Same-origin proxy: selects one candidate scheme and returns its eligibility
// check (LLM grounded in the official eligibility text) plus its published FAQs.

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

  const schemeSlug = typeof payload.schemeSlug === "string" ? payload.schemeSlug.trim() : "";
  if (!schemeSlug) {
    return NextResponse.json({ error: "schemeSlug is required." }, { status: 400 });
  }

  const { status, body } = await proxyPost(
    `/api/v1/chatbot/session/${encodeURIComponent(params.id)}/select`,
    { ...payload, schemeSlug }
  );
  return NextResponse.json(body, { status });
}