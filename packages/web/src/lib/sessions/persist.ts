// Client-side persistence for sessions via the /api/v1/sessions routes.
// Everything degrades silently to in-memory when not signed in or Supabase is missing.

import { supabase } from "../supabase";
import { fromRow, toRow, type SessionRow, type StoredSession } from "./model";

async function authHeader(): Promise<Record<string, string> | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : null;
  } catch {
    return null;
  }
}

export async function loadStoredSessions(): Promise<StoredSession[] | null> {
  const auth = await authHeader();
  if (!auth) return null;
  try {
    const res = await fetch("/api/v1/sessions", { headers: auth });
    if (!res.ok) return null;
    const body = (await res.json()) as { sessions?: SessionRow[] };
    return (body.sessions ?? []).map(fromRow);
  } catch {
    return null;
  }
}

async function saveNow(session: StoredSession): Promise<void> {
  const auth = await authHeader();
  if (!auth) return;
  try {
    await fetch(`/api/v1/sessions/${encodeURIComponent(session.id)}`, {
      method: "PUT",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify(toRow(session))
    });
  } catch {
    // stay in-memory
  }
}

export async function deleteStoredSession(id: string): Promise<void> {
  const auth = await authHeader();
  if (!auth) return;
  try {
    await fetch(`/api/v1/sessions/${encodeURIComponent(id)}`, { method: "DELETE", headers: auth });
  } catch {
    // ignore
  }
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const seen = new Map<string, StoredSession>();

/** Debounced save of every session whose object identity changed since last call. */
export function scheduleSessionSaves(sessions: StoredSession[], delayMs = 800): void {
  for (const s of sessions) {
    if (seen.get(s.id) === s) continue;
    seen.set(s.id, s);
    const prev = timers.get(s.id);
    if (prev) clearTimeout(prev);
    timers.set(
      s.id,
      setTimeout(() => {
        timers.delete(s.id);
        void saveNow(seen.get(s.id) ?? s);
      }, delayMs)
    );
  }
}

/** Mark sessions as already persisted (e.g. just loaded) so they are not re-saved. */
export function markSessionsSynced(sessions: StoredSession[]): void {
  for (const s of sessions) seen.set(s.id, s);
}
