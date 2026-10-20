// Turns a masked /extract response into a compact, chat-usable context block.
//
// Why the context goes into the message TEXT rather than a new API field:
// the Layer-2 backend's `POST /chatbot/session/:id/message` accepts only
// `{ text, lang }`, and its handler runs `decomposeWithLlm(text)` which merges
// extracted applicant facts into the session state before answering. Putting the
// document facts in the text therefore genuinely reaches both the fact extractor
// and the answering agent. A first-class `context` field on the backend would be
// cleaner and is the natural follow-up.
//
// Privacy: only masked values ever reach here — /extract masks before returning,
// so a document's Aadhaar arrives as `XXXX-XXXX-1234` and stays that way.

import { guessDocumentType, type ExtractResponse } from "./adapt.ts";

/** The backend rejects a message outside [2, 500] characters. */
export const MAX_CHAT_MESSAGE_CHARS = 500;

/** Field values are summarised, never dumped: a document can carry dozens. */
const MAX_CONTEXT_FIELDS = 8;
const MAX_FIELD_VALUE_CHARS = 60;

export interface DocumentContext {
  fileName: string;
  /** Readable label for the document, e.g. "Aadhaar Card". */
  documentType: string;
  /** Human-readable `key: value` lines, for the UI chip. */
  lines: string[];
  /** The single-line block embedded into the chat message. */
  contextBlock: string;
}

function readableType(response: ExtractResponse): string {
  const guessed = guessDocumentType(response.document_type_guess);
  if (guessed !== "UNKNOWN") return guessed.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return response.document_type_guess?.trim() || "Document";
}

function truncate(value: string, max: number): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

/** Summarise one masked extraction into chat context, or null when it has no usable fields. */
export function buildDocumentContext(
  response: ExtractResponse,
  fileName: string
): DocumentContext | null {
  const fields = (response.fields ?? [])
    .filter((field) => (field.value ?? "").trim().length > 0)
    .slice(0, MAX_CONTEXT_FIELDS);

  if (fields.length === 0) return null;

  const documentType = readableType(response);
  const lines = fields.map((field) => {
    const label = (field.label || field.key || "field").replace(/_+/g, " ").trim();
    return `${label}: ${truncate(field.value, MAX_FIELD_VALUE_CHARS)}`;
  });

  return {
    fileName,
    documentType,
    lines,
    contextBlock: `[Uploaded document — ${documentType} (${fileName}): ${lines.join("; ")}]`
  };
}

/**
 * Put the document context in front of the question without ever truncating the
 * question itself. If the whole thing will not fit the backend's limit, the
 * CONTEXT is trimmed first.
 */
export function composeMessageWithContext(
  question: string,
  contextBlock: string | null,
  maxLength: number = MAX_CHAT_MESSAGE_CHARS
): string {
  const trimmedQuestion = question.trim();
  if (!contextBlock) return trimmedQuestion.slice(0, maxLength);

  const separator = "\n";
  const budget = maxLength - trimmedQuestion.length - separator.length;

  // No room for context at all: send the question alone rather than a mangled one.
  if (budget < 20) return trimmedQuestion.slice(0, maxLength);

  const block =
    contextBlock.length <= budget ? contextBlock : `${contextBlock.slice(0, budget - 1)}…`;

  return `${block}${separator}${trimmedQuestion}`;
}
