// Supabase clients, shared by every feature.
//
// Two clients, memoised lazily:
//   * getAnonClient()   - public key; reads are subject to RLS policies.
//   * getAdminClient()  - service-role key; trusted writes, bypasses RLS.
//   * getReadClient()   - convenience for public reads: prefers the anon client
//                         so RLS stays in force, falls back to the service role
//                         only when no anon key is configured.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSettings, hasAdminAccess, hasAnonAccess } from "./config.ts";

let anonClient: SupabaseClient | null | undefined;
let adminClient: SupabaseClient | null | undefined;

function makeClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export function getAnonClient(): SupabaseClient | null {
  if (anonClient !== undefined) return anonClient;
  const settings = getSettings();
  anonClient = hasAnonAccess(settings)
    ? makeClient(settings.supabaseUrl, settings.supabaseAnonKey)
    : null;
  return anonClient;
}

export function getAdminClient(): SupabaseClient | null {
  if (adminClient !== undefined) return adminClient;
  const settings = getSettings();
  adminClient = hasAdminAccess(settings)
    ? makeClient(settings.supabaseUrl, settings.supabaseServiceRoleKey)
    : null;
  return adminClient;
}

/** Public-read client: anon (RLS-enforced) when available, else service role. */
export function getReadClient(): SupabaseClient | null {
  return getAnonClient() ?? getAdminClient();
}

/** Reset memoised clients (used by tests when the environment changes). */
export function resetSupabaseClients(): void {
  anonClient = undefined;
  adminClient = undefined;
}