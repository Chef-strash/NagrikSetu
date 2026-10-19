import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadConfig } from "../config.js";

/**
 * Service-role Supabase client for the harvester apply stage.
 *
 * Returns `null` when `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are absent
 * (this env has no keys) so callers fall back to the fixture/mock path.
 * Never throws for missing env; never reads secrets from files.
 */
export function getSupabaseClient(
  env: NodeJS.ProcessEnv = process.env,
): SupabaseClient | null {
  const config = loadConfig(env);
  if (!config.hasLiveSupabase) return null;
  return createClient(
    config.supabaseUrl as string,
    config.supabaseServiceRoleKey as string,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** Host of a Supabase URL, for the start-up "which database" banner. */
export function supabaseHost(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const url = env["SUPABASE_URL"]?.trim();
  if (!url) return undefined;
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

export type { SupabaseClient };

