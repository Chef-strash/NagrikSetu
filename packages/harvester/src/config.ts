/**
 * Harvester runtime config — contract-first exports for sibling streams.
 *
 * Reads secrets from env only (never from files). When Supabase keys are
 * absent, callers must use the fixture/mock path (see `src/supabase/client.ts`).
 *
 * Provider key resolution (KTD2) and the provider/model/vision-model defaults
 * (KTD3) live in the shared `@nagriksetu/agents` package; they are re-exported
 * here so existing harvester imports keep working.
 */

import { resolveModelConfig, resolveProviderKey } from "@nagriksetu/agents";

export {
  DEFAULT_MODEL_ID,
  DEFAULT_PROVIDER_ID,
  DEFAULT_VISION_MODEL_ID,
  readClineStoredToken,
  resolveProviderKey,
} from "@nagriksetu/agents";

/**
 * The harvester's own env prefix for shared key/model resolution (KTD2): the
 * shared package reads `HARVESTER_API_KEY` / `HARVESTER_PROVIDER_ID` /
 * `HARVESTER_MODEL_ID` / `HARVESTER_VISION_MODEL_ID` when it is passed.
 */
export const HARVESTER_ENV_PREFIX = "HARVESTER";

export type ScraperMode = "live" | "fixture";

/** Official PMC allowlist hosts. Requests to any other host must be rejected. */
export const PMC_ALLOWLIST_HOSTS: readonly string[] = [
  "webadmin.pmc.gov.in",
  "www.pmc.gov.in",
  "pmc.gov.in",
  "dbt.pmc.gov.in",
  "103.249.97.52",
  "pmsvanidhi.mohua.gov.in",
  // Central ministry host serving the verified PM SVANidhi guideline PDFs
  // (review 2026-10-04 Required fix 6; source: docs/PMC_SOURCE_VERIFICATION_2026-10-04.md).
  "www.mohua.gov.in",
] as const;

/** Harvester runtime config, filled by `loadConfig`. */
export interface HarvesterConfig {
  supabaseUrl: string | undefined;
  supabaseServiceRoleKey: string | undefined;
  /** Anthropic key (only needed when providerId is anthropic). */
  anthropicApiKey: string | undefined;
  /**
   * Resolved API key for the active provider (Cline token for cline*).
   * Optional so sibling config literals stay valid; `loadConfig` always fills it.
   */
  llmApiKey?: string | undefined;
  scraperMode: ScraperMode;
  /**
   * Cline SDK provider id for LLM stages (env `HARVESTER_PROVIDER_ID`).
   * Optional so sibling config literals stay valid; `loadConfig` always fills
   * it (default `cline-pass`).
   */
  providerId?: string;
  /**
   * Cline SDK model id for LLM stages (env `HARVESTER_MODEL_ID`).
   * Optional so sibling config literals stay valid; `loadConfig` always fills
   * it (default `anthropic/claude-sonnet-4.6`).
   */
  modelId?: string;
  /**
   * Vision-capable model used when scanned page images are attached
   * (env `HARVESTER_VISION_MODEL_ID`). Defaults to the one vision ClinePass model.
   */
  visionModelId?: string;
  /** True when live Supabase access is configured (URL + service-role key). */
  hasLiveSupabase: boolean;
  /** True when an LLM key is available for the configured provider. */
  hasLlmKey: boolean;
}

function parseScraperMode(raw: string | undefined): ScraperMode {
  // Live is the default (the harvester exists to fetch real documents);
  // SCRAPER_MODE=fixture forces the offline fixture path.
  return raw === "fixture" ? "fixture" : "live";
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): HarvesterConfig {
  const supabaseUrl = env["SUPABASE_URL"]?.trim() || undefined;
  const supabaseServiceRoleKey =
    env["SUPABASE_SERVICE_ROLE_KEY"]?.trim() || undefined;
  const anthropicApiKey = env["ANTHROPIC_API_KEY"]?.trim() || undefined;
  const scraperMode = parseScraperMode(env["SCRAPER_MODE"]?.trim());
  // Shared defaults + `HARVESTER_*` overrides (KTD3); the prefix is explicit so
  // the harvester never picks up another consumer's variables.
  const { providerId, modelId, visionModelId } = resolveModelConfig(
    env,
    HARVESTER_ENV_PREFIX,
  );
  const llmApiKey = resolveProviderKey(env, providerId, HARVESTER_ENV_PREFIX);
  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    anthropicApiKey,
    llmApiKey,
    scraperMode,
    providerId,
    modelId,
    visionModelId,
    hasLiveSupabase: Boolean(supabaseUrl && supabaseServiceRoleKey),
    hasLlmKey: Boolean(llmApiKey),
  };
}

/** Returns true iff the URL's hostname is on the official-source allowlist. */
export function isAllowlistedUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return PMC_ALLOWLIST_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}
