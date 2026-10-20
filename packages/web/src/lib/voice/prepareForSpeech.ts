// Turn an assistant reply into text that sounds right when spoken, then split it
// into chunks small enough for one Sarvam text-to-speech call each.
// Pure functions: unit-tested in prepareForSpeech.test.ts.

export type VoiceLang = "en" | "hi" | "mr";

export const MAX_CHUNK_CHARS = 1200;

/** Strip markdown, links and URLs; read currency as words. */
export function cleanForSpeech(text: string, lang: VoiceLang): string {
  const rupees = lang === "en" ? "rupees" : "रुपये";
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+|www\.\S+/g, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\*\*|__|\*|_/g, "")
    .replace(/(?:₹|\bRs\.?|\bINR)\s*([\d,]+(?:\.\d+)?)/gi, `$1 ${rupees}`)
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** Split at sentence ends (., ?, !, ।, newline) into chunks of at most `max` characters. */
export function splitForSpeech(text: string, max = MAX_CHUNK_CHARS): string[] {
  const sentences = text.match(/[^.?!।\n]+[.?!।]*\s*|\n/g) ?? [text];
  const chunks: string[] = [];
  let current = "";

  const push = (piece: string) => {
    const trimmed = piece.trim();
    if (trimmed) chunks.push(trimmed);
  };

  for (const raw of sentences) {
    let sentence = raw;
    // A single sentence longer than the limit is cut at the last space before it.
    while (sentence.length > max) {
      const cut = sentence.lastIndexOf(" ", max);
      const at = cut > 0 ? cut : max;
      push(current);
      current = "";
      push(sentence.slice(0, at));
      sentence = sentence.slice(at);
    }
    if ((current + sentence).length > max) {
      push(current);
      current = sentence;
    } else {
      current += sentence;
    }
  }
  push(current);
  return chunks;
}

export function prepareForSpeech(text: string, lang: VoiceLang): string[] {
  return splitForSpeech(cleanForSpeech(text, lang));
}
