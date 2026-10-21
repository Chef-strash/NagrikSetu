// Web search tool (optional).
//
// Disabled unless a search provider key is configured, so the default behaviour
// stays "official sources only". Providers supported (env):
//   SERPER_API_KEY  -> google.serper.dev
//   TAVILY_API_KEY  -> api.tavily.com
//   BRAVE_API_KEY   -> api.search.brave.com
//
// NOTE: the repository rule (AGENTS.md Protocol 3) says scheme FACTS must come from
// official government sources. Use web search only for general context, never as
// the source of eligibility/amounts/deadlines.

export function isWebSearchConfigured(): boolean {
  return Boolean(
    process.env.SERPER_API_KEY || process.env.TAVILY_API_KEY || process.env.BRAVE_API_KEY
  );
}

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

function env(name: string): string {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : "";
}

async function serper(query: string, key: string): Promise<WebResult[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query }),
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error(`serper ${res.status}`);
  const data = (await res.json()) as { organic?: Array<{ title?: string; link?: string; snippet?: string }> };
  return (data.organic ?? []).map((r) => ({ title: r.title ?? "", url: r.link ?? "", snippet: r.snippet ?? "" }));
}

async function tavily(query: string, key: string): Promise<WebResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key, query, max_results: 5 }),
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error(`tavily ${res.status}`);
  const data = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> };
  return (data.results ?? []).map((r) => ({ title: r.title ?? "", url: r.url ?? "", snippet: r.content ?? "" }));
}

async function brave(query: string, key: string): Promise<WebResult[]> {
  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}`,
    {
      headers: { "X-Subscription-Token": key, Accept: "application/json" },
      signal: AbortSignal.timeout(15000)
    }
  );
  if (!res.ok) throw new Error(`brave ${res.status}`);
  const data = (await res.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };
  return (data.web?.results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: r.description ?? ""
  }));
}

export async function webSearch(query: string): Promise<WebResult[]> {
  const q = query.trim();
  if (!q) return [];

  const serperKey = env("SERPER_API_KEY");
  if (serperKey) return serper(q, serperKey);

  const tavilyKey = env("TAVILY_API_KEY");
  if (tavilyKey) return tavily(q, tavilyKey);

  const braveKey = env("BRAVE_API_KEY");
  if (braveKey) return brave(q, braveKey);

  return [];
}

/** Human-readable result string for the tool loop. */
export async function webSearchText(query: string): Promise<string> {
  if (!isWebSearchConfigured()) {
    return "Web search is not configured on this deployment.";
  }
  try {
    const results = await webSearch(query);
    if (results.length === 0) return "No web results found.";
    return results
      .slice(0, 5)
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
      .join("\n");
  } catch (error) {
    return `Web search failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}