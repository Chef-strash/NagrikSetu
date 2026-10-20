"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { prepareForSpeech, type VoiceLang } from "./prepareForSpeech";

// Read text aloud through /api/v1/voice/tts. Long text is split into chunks;
// chunk N+1 is fetched while chunk N plays. Only one thing plays at a time.

export type ReadAloudState = "idle" | "loading" | "playing";

const cache = new Map<string, string>();

async function fetchChunk(text: string, lang: VoiceLang): Promise<string> {
  const key = `${lang}:${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const res = await fetch("/api/v1/voice/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, language: lang })
  });
  if (!res.ok) throw new Error(String(res.status));
  const data = (await res.json()) as { audio_base64?: string; mime?: string };
  if (!data.audio_base64) throw new Error("no audio");
  const url = `data:${data.mime ?? "audio/wav"};base64,${data.audio_base64}`;
  cache.set(key, url);
  return url;
}

export function useReadAloud() {
  const [state, setState] = useState<ReadAloudState>("idle");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const runRef = useRef(0);

  const stop = useCallback(() => {
    runRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    setState("idle");
    setActiveId(null);
  }, []);

  const play = useCallback(
    async (id: string, text: string, lang: VoiceLang) => {
      stop();
      const run = runRef.current;
      setError(null);
      setActiveId(id);
      setState("loading");

      const chunks = prepareForSpeech(text, lang);
      if (chunks.length === 0) {
        stop();
        return;
      }

      try {
        let next: Promise<string> = fetchChunk(chunks[0], lang);
        for (let i = 0; i < chunks.length; i++) {
          const url = await next;
          if (run !== runRef.current) return;
          if (i + 1 < chunks.length) next = fetchChunk(chunks[i + 1], lang);

          const audio = new Audio(url);
          audioRef.current = audio;
          setState("playing");
          await new Promise<void>((resolve, reject) => {
            audio.onended = () => resolve();
            audio.onerror = () => reject(new Error("playback"));
            audio.play().catch(reject);
          });
          if (run !== runRef.current) return;
        }
        stop();
      } catch {
        if (run !== runRef.current) return;
        stop();
        setError("Couldn't play audio right now.");
      }
    },
    [stop]
  );

  useEffect(() => () => stop(), [stop]);

  return { state, activeId, error, play, stop };
}
