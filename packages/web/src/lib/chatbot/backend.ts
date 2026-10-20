// Server-only helper: forwards chatbot requests to the Layer-2 backend.
//
// The backend URL never reaches the browser. When the backend is unreachable we
// return a typed `offline` error (Protocol 5) so the UI can degrade gracefully.

const DEFAULT_BACKEND_URL = "http://localhost:8000";
const TIMEOUT_MS = 20000;

export function backendBaseUrl(): string {
  const configured =
    process.env.NAGRIKSETU_API_URL?.trim() || process.env.BACKEND_API_URL?.trim() || DEFAULT_BACKEND_URL;
  return configured.replace(/\/+$/, "");
}

export interface ProxyResult {
  status: number;
  body: unknown;
}

/** POST a JSON body to a backend path and mirror its status and body. */
export async function proxyPost(path: string, payload: unknown): Promise<ProxyResult> {
  try {
    const res = await fetch(`${backendBaseUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  } catch {
    return {
      status: 503,
      body: { error: "Scheme assistant service is unavailable.", offline: true }
    };
  }
}