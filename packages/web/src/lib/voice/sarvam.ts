// Server-only Sarvam client used by /api/v1/voice/*. The API key never reaches
// the browser: it is read from SARVAM_API_KEY on the server.

const SARVAM_BASE = "https://api.sarvam.ai";

export const LANGUAGE_CODES: Record<string, string> = {
  en: "en-IN",
  hi: "hi-IN",
  mr: "mr-IN",
  auto: "unknown"
};

export class SarvamError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string
  ) {
    super(message);
  }
}

function apiKey(): string {
  const key = process.env.SARVAM_API_KEY?.trim();
  if (!key) throw new SarvamError("Voice is not configured (SARVAM_API_KEY missing).", 503, "not_configured");
  return key;
}

async function call(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${SARVAM_BASE}${path}`, {
      ...init,
      headers: { "api-subscription-key": apiKey(), ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(40_000)
    });
  } catch (err) {
    if (err instanceof SarvamError) throw err;
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new SarvamError(
      timedOut ? "Voice service timed out." : "Voice service unreachable.",
      timedOut ? 504 : 502,
      timedOut ? "provider_timeout" : "provider_failed"
    );
  }
}

export interface Transcript {
  transcript: string;
  languageCode: string | null;
  confidence: number | null;
  requestId: string | null;
}

export async function transcribe(audio: Blob, filename: string, language: string): Promise<Transcript> {
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", process.env.SARVAM_STT_MODEL?.trim() || "saaras:v4");
  form.append("mode", "transcribe");
  form.append("language_code", LANGUAGE_CODES[language] ?? "unknown");

  const res = await call("/speech-to-text", { method: "POST", body: form });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
    console.error(`[voice/stt] sarvam ${res.status}: ${detail}`);
    throw new SarvamError(`Speech-to-text failed (${res.status}). ${detail}`.trim(), 502, "provider_failed");
  }
  const json = (await res.json()) as {
    transcript?: string;
    language_code?: string | null;
    language_probability?: number | null;
    request_id?: string | null;
  };
  return {
    transcript: json.transcript ?? "",
    languageCode: json.language_code ?? null,
    confidence: typeof json.language_probability === "number" ? json.language_probability : null,
    requestId: json.request_id ?? null
  };
}

export async function synthesize(text: string, language: string): Promise<string> {
  const speaker = process.env.SARVAM_TTS_SPEAKER?.trim();
  const request = (withSpeaker: boolean) =>
    call("/text-to-speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        target_language_code: LANGUAGE_CODES[language] ?? "en-IN",
        model: process.env.SARVAM_TTS_MODEL?.trim() || "bulbul:v3",
        ...(withSpeaker && speaker ? { speaker } : {})
      })
    });
  let res = await request(true);
  // An unknown speaker name must never break read-aloud: retry with the model default.
  if (res.status === 400 && speaker) res = await request(false);
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
    console.error(`[voice/tts] sarvam ${res.status}: ${detail}`);
    throw new SarvamError(`Text-to-speech failed (${res.status}). ${detail}`.trim(), 502, "provider_failed");
  }
  const json = (await res.json()) as { audios?: string[] };
  const audio = json.audios?.[0];
  if (!audio) throw new SarvamError("Text-to-speech returned no audio.", 502, "provider_failed");
  return audio;
}
