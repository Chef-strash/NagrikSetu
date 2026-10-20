// POST /api/v1/chatbot/session/:id/message
//
// Same-origin proxy: asks a question about the scheme already selected on that
// session. The backend locks the session to the selected scheme and answers from
// its maintained FAQs (never inventing scheme facts).

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

  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (text.length < 2 || text.length > 1000) {
    return NextResponse.json(
      { error: "Message must be between 2 and 1000 characters." },
      { status: 400 }
    );
  }

  const { status, body } = await proxyPost(
    `/api/v1/chatbot/session/${encodeURIComponent(params.id)}/message`,
    {
      text,
      lang: payload.lang,
      profile: payload.profile,
      profileWard: payload.profileWard
    }
  );
  return NextResponse.json(body, { status });
}