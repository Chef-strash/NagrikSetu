import { NextResponse } from "next/server";
import { SarvamError, synthesize } from "@/lib/voice/sarvam";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_TEXT_CHARS = 2000;
const LANGS = new Set(["en", "hi", "mr"]);

// POST /api/v1/voice/tts  { text, language } -> { audio_base64, mime }
export async function POST(request: Request) {
  let body: { text?: unknown; language?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "empty_text" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const language = typeof body.language === "string" ? body.language : "en";

  if (!text) return NextResponse.json({ error: "empty_text" }, { status: 400 });
  if (text.length > MAX_TEXT_CHARS) return NextResponse.json({ error: "too_long" }, { status: 400 });
  if (!LANGS.has(language)) return NextResponse.json({ error: "unsupported_language" }, { status: 400 });

  try {
    const audio = await synthesize(text, language);
    return NextResponse.json({ audio_base64: audio, mime: "audio/wav" });
  } catch (err) {
    const e = err instanceof SarvamError ? err : new SarvamError("Voice failed.", 502, "provider_failed");
    console.error(`[voice/tts] ${e.code} status=${e.status}`);
    return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
  }
}
