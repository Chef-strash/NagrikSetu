/**
 * HTTP fetch policy for official PMC sources.
 *
 * - Non-allowlist hosts are rejected BEFORE any request (plan §12 discover).
 * - Retry with backoff on network errors / 5xx, AbortController timeout.
 * - Optional fixture fallback so `--offline` and demos never need network.
 *
 * Allowlist authority: `isAllowlistedUrl` from `src/config.ts`.
 */
import { isAllowlistedUrl } from "../config.js";

export type FetchImpl = (
  url: string,
  init?: RequestInit,
) => Promise<{
  ok: boolean;
  status: number;
  /** Decoded body text (JSON/HTML). */
  text: () => Promise<string>;
  /** Raw bytes — required to fetch/parse PDF binaries (review fix 2). */
  arrayBuffer: () => Promise<ArrayBuffer>;
}>;

const defaultFetch: FetchImpl = (url, init) =>
  fetch(url, init).then((res) => ({
    ok: res.ok,
    status: res.status,
    text: () => res.text(),
    arrayBuffer: () => res.arrayBuffer(),
  }));

/**
 * Percent-encode the path portion of a URL, preserving the query string and
 * any already-encoded `%XX` escapes. PMC file paths contain spaces and
 * Marathi glyphs (e.g. `/sites/default/files/circular/जाहीर प्रकटन.pdf`),
 * which `fetch` rejects unless the path is encoded. The query is left intact
 * because listing-API params are already URL-safe (review fix 2).
 */
export function encodeUrlPath(url: string): string {
  const qIndex = url.indexOf("?");
  const base = qIndex === -1 ? url : url.slice(0, qIndex);
  const query = qIndex === -1 ? "" : url.slice(qIndex);
  const encoded = encodeURI(base).replace(/%25([0-9A-Fa-f]{2})/g, "%$1");
  return encoded + query;
}

export interface FetchPolicyOptions {
  timeoutMs?: number;
  maxRetries?: number;
  /** Fixture text to return when live fetch fails or mode is fixture. */
  fixtureText?: string | undefined;
  /** Force fixture path without attempting network (offline mode). */
  offline?: boolean;
  fetchImpl?: FetchImpl;
  onAttempt?: (attempt: number, url: string) => void;
}

export interface FetchResult {
  ok: boolean;
  url: string;
  status: number | undefined;
  text: string | undefined;
  fromFixture: boolean;
  attempts: number;
  /** Set when rejected without any request (non-allowlist host). */
  rejected?: "non-allowlist-host";
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithPolicy(
  url: string,
  options: FetchPolicyOptions = {},
): Promise<FetchResult> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    fixtureText,
    offline = false,
    fetchImpl = defaultFetch,
    onAttempt,
  } = options;

  if (!isAllowlistedUrl(url)) {
    return {
      ok: false,
      url,
      status: undefined,
      text: undefined,
      fromFixture: false,
      attempts: 0,
      rejected: "non-allowlist-host",
      error: `refused: host not on official allowlist: ${url}`,
    };
  }

  const requestUrl = encodeUrlPath(url);

  if (offline) {
    if (fixtureText !== undefined) {
      return {
        ok: true,
        url,
        status: undefined,
        text: fixtureText,
        fromFixture: true,
        attempts: 0,
      };
    }
    return {
      ok: false,
      url,
      status: undefined,
      text: undefined,
      fromFixture: false,
      attempts: 0,
      error: "offline with no fixture available",
    };
  }

  let lastError = "unknown fetch error";
  let lastStatus: number | undefined;
  const totalAttempts = maxRetries + 1;
  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    onAttempt?.(attempt, requestUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(requestUrl, { signal: controller.signal });
      lastStatus = res.status;
      if (res.ok) {
        const text = await res.text();
        return {
          ok: true,
          url: requestUrl,
          status: res.status,
          text,
          fromFixture: false,
          attempts: attempt,
        };
      }
      lastError = `HTTP ${res.status}`;
      // Retry only on 5xx; 4xx is terminal (except fixture fallback below).
      if (res.status < 500 || res.status > 599) break;
    } catch (err) {
      lastError =
        err instanceof Error ? err.message : "unknown fetch error";
    } finally {
      clearTimeout(timer);
    }
    if (attempt < totalAttempts) await sleep(500 * attempt);
  }

  if (fixtureText !== undefined) {
    return {
      ok: true,
      url,
      status: lastStatus,
      text: fixtureText,
      fromFixture: true,
      attempts: totalAttempts,
    };
  }
  return {
    ok: false,
    url: requestUrl,
    status: lastStatus,
    text: undefined,
    fromFixture: false,
    attempts: totalAttempts,
    error: lastError,
  };
}
