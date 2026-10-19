/**
 * Playwright render for client-rendered pages (`www.pmc.gov.in/schemes/*`).
 *
 * STRETCH — not required for the demo (plan sections 4, 8, 13). The demo
 * passes on JSON + PDF sources and offline fixtures alone. This stub keeps
 * the module boundary so the profiler can import it, but throws a
 * descriptive error until a sibling stream implements it.
 */
export interface RenderOptions {
  timeoutMs?: number;
}

export interface RenderedPage {
  url: string;
  html: string;
  renderedAt: string;
}

export async function renderPage(
  _url: string,
  _options: RenderOptions = {},
): Promise<RenderedPage> {
  throw new Error(
    "renderPage is stretch work (Playwright) and is not implemented in this slice; use JSON/PDF sources or fixtures",
  );
}

export function isRenderAvailable(): boolean {
  return false;
}
