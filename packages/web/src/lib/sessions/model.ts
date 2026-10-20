// Pure helpers for session persistence (no React, no network) so they are testable.

export interface StoredMessage {
  id: string;
  sender: "assistant" | "user";
  text: string;
  /** ISO-8601 for new messages; legacy values (e.g. "Just now") may still appear. */
  timestamp: string;
}

export interface StoredSession {
  id: string;
  schemeId: string;
  schemeName: string;
  beneficiaryName: string;
  targetBenefit: string;
  counterLocation: string;
  counterHours: string;
  status: "in_progress" | "completed";
  documentsLeft: number;
  lastActivity: string;
  documents: unknown[];
  conversation: StoredMessage[];
  chatSessionId?: string;
}

export interface SessionRow {
  id: string;
  scheme_id: string | null;
  scheme_name: string | null;
  beneficiary_name: string | null;
  target_benefit: string | null;
  counter_location: string | null;
  counter_hours: string | null;
  status: "in_progress" | "completed" | null;
  documents_left: number | null;
  last_activity: string | null;
  documents: unknown[] | null;
  conversation: StoredMessage[] | null;
  chat_session_id: string | null;
}

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function toRow(s: StoredSession): Omit<SessionRow, "id"> {
  return {
    scheme_id: s.schemeId,
    scheme_name: s.schemeName,
    beneficiary_name: s.beneficiaryName,
    target_benefit: s.targetBenefit,
    counter_location: s.counterLocation,
    counter_hours: s.counterHours,
    status: s.status,
    documents_left: s.documentsLeft,
    last_activity: s.lastActivity,
    documents: s.documents,
    conversation: s.conversation,
    chat_session_id: s.chatSessionId ?? null
  };
}

export function fromRow(r: SessionRow): StoredSession {
  return {
    id: r.id,
    schemeId: r.scheme_id ?? "",
    schemeName: r.scheme_name ?? "",
    beneficiaryName: r.beneficiary_name ?? "",
    targetBenefit: r.target_benefit ?? "",
    counterLocation: r.counter_location ?? "",
    counterHours: r.counter_hours ?? "",
    status: r.status === "completed" ? "completed" : "in_progress",
    documentsLeft: r.documents_left ?? 0,
    lastActivity: r.last_activity ?? "",
    documents: r.documents ?? [],
    conversation: r.conversation ?? [],
    chatSessionId: r.chat_session_id ?? undefined
  };
}

/** "Just now", "2 min ago", "3 h ago", or a date; legacy non-ISO strings pass through. */
export function formatTimestamp(value: string, now: number = Date.now()): string {
  const t = Date.parse(value);
  if (Number.isNaN(t) || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return value;
  const sec = Math.max(0, Math.round((now - t) / 1000));
  if (sec < 45) return "Just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} h ago`;
  return new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Last N user/assistant turns, shaped for the backend `history` field. */
export function recentHistory(
  conversation: StoredMessage[],
  limit = 6
): Array<{ role: "user" | "assistant"; text: string }> {
  return conversation
    .filter((m) => m.text && m.text.trim())
    .slice(-limit)
    .map((m) => ({ role: m.sender, text: m.text }));
}

/** Parse "Bearer <token>" from an Authorization header. */
export function bearerToken(header: string | null | undefined): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  return m ? m[1] : null;
}

