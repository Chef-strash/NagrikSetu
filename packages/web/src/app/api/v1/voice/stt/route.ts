import { NextResponse } from "next/server";
import { LANGUAGE_CODES, SarvamError, transcribe } from "@/lib/voice/sarvam";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

/** Sarvam reads the decoder from the part's filename, so keep the suffix honest. */
function filenameFor(type: string): string {
  const known: Array<[string, string]> = [
    ["wav", "clip.wav"],
    ["mpeg", "clip.mp3"],
    ["mp3", "clip.mp3"],
    ["mp4", "clip.m4a"],
    ["ogg", "clip.ogg"]
  ];
  for (const [needle, name] of known) {
    if (type.includes(needle)) return name;
  }
  return "clip.wav";
}

// POST /api/v1/voice/stt  (multipart: audio, language)
// Audio is held in memory for the Sarvam call only; it is never stored or logged.
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "empty_audio" }, { status: 400 });
  }

  const audio = form.get("audio");
  const language = String(form.get("language") ?? "auto");

  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: "empty_audio" }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 400 });
  }
  if (!(language in LANGUAGE_CODES)) {
    return NextResponse.json({ error: "unsupported_language" }, { status: 400 });
  }

  const type = audio.type || "audio/webm";
  if (type.includes("webm")) {
    // Sarvam accepts MP3/WAV/PCM only. Browsers record WebM by default, so say
    // so here rather than letting the provider return an opaque 400.
    return NextResponse.json(
      { error: "unsupported_audio_format", message: "Send MP3, WAV or PCM audio (WebM is not accepted)." },
      { status: 400 }
    );
  }
  const filename = filenameFor(type);

  try {
    const result = await transcribe(audio, filename, language);
    return NextResponse.json({
      transcript: result.transcript,
      language_code: result.languageCode,
      confidence: result.confidence,
      request_id: result.requestId
    });
  } catch (err) {
    const e = err instanceof SarvamError ? err : new SarvamError("Voice failed.", 502, "provider_failed");
    console.error(`[voice/stt] ${e.code} status=${e.status}`);
    return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
  }
}
