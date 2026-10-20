"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toWav } from "./wav";

// Push-to-record: tap to start, tap to stop (auto-stops at 25 s).
// The recording goes to /api/v1/voice/stt and the transcript is handed back
// through onTranscript. Nothing is sent to the chat automatically.

export type VoiceInputState = "idle" | "requesting" | "recording" | "transcribing";

const MAX_SECONDS = 25;
const MIN_BYTES = 2000;

interface Options {
  language: string;
  onTranscript: (text: string, lowConfidence: boolean) => void;
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

export function useVoiceInput({ language, onTranscript }: Options) {
  const [state, setState] = useState<VoiceInputState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const releaseMic = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const upload = useCallback(
    async (blob: Blob) => {
      if (blob.size < MIN_BYTES) {
        setState("idle");
        setError("Didn't catch that, try again.");
        return;
      }
      setState("transcribing");
      try {
        // Send WAV: the recorder's WebM/Opus is not a format Sarvam accepts.
        const wav = await toWav(blob);
        const form = new FormData();
        form.append("audio", wav, "clip.wav");
        form.append("language", language);
        const res = await fetch("/api/v1/voice/stt", { method: "POST", body: form });
        if (!res.ok) {
          // Surface what the route actually said. "Voice is unavailable" cannot
          // tell a missing key apart from an over-long clip or a provider refusal.
          const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
          throw new Error(
            body.error === "not_configured"
              ? "Voice key missing on the server (SARVAM_API_KEY). Restart the web server."
              : body.message || String(res.status)
          );
        }
        const data = (await res.json()) as { transcript?: string; confidence?: number | null };
        const text = (data.transcript ?? "").trim();
        if (!text) {
          setError("Didn't catch that, try again.");
        } else {
          onTranscriptRef.current(text, typeof data.confidence === "number" && data.confidence < 0.6);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        setError(
          msg && !/^\d+$/.test(msg)
            ? `${msg} You can type instead.`
            : "Voice isn't available right now. You can type instead."
        );
      } finally {
        setState("idle");
      }
    },
    [language]
  );

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const start = useCallback(async () => {
    setError(null);
    // A secure context is required: getUserMedia is undefined on plain http
    // origins. localhost and 127.0.0.1 count as secure, a LAN IP does not.
    // Without this check the failure is silent and looks like a blocked mic.
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError("Voice input needs a secure page (https or localhost). You can type instead.");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Voice input isn't supported in this browser. You can type instead.");
      return;
    }
    setState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      let rec: MediaRecorder;
      try {
        rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      } catch {
        // Some browsers reject a type that isTypeSupported() accepted. Falling
        // back to the default keeps the recording usable instead of reporting
        // a microphone problem that does not exist.
        rec = new MediaRecorder(stream);
      }
      recorderRef.current = rec;
      chunksRef.current = [];
      cancelledRef.current = false;

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        releaseMic();
        if (cancelledRef.current) return;
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || mimeType || "audio/webm" });
        void upload(blob);
      };

      rec.start();
      setSeconds(0);
      setState("recording");
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) stop();
          return s + 1;
        });
      }, 1000);
    } catch (err) {
      releaseMic();
      setState("idle");
      // Report the real cause. A single "blocked" message cannot tell a denied
      // permission apart from a missing device, a busy microphone, or a
      // recorder failure, and the fix is different for each.
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setError("Microphone permission was denied. Enable it for this site in the browser, then reload. You can type instead.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setError("No microphone was found on this device. You can type instead.");
      } else if (name === "NotReadableError" || name === "AbortError") {
        setError("The microphone is in use by another app. Close it and try again. You can type instead.");
      } else {
        setError(`Voice input failed${name ? ` (${name})` : ""}. You can type instead.`);
      }
    }
  }, [stop, upload]);

  const toggle = useCallback(() => {
    if (state === "recording") stop();
    else if (state === "idle") void start();
  }, [state, start, stop]);

  // Never leave the microphone open when the component goes away.
  useEffect(
    () => () => {
      cancelledRef.current = true;
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
      releaseMic();
    },
    []
  );

  return { state, error, seconds, toggle, clearError: () => setError(null) };
}
