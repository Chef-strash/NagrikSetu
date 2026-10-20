import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only Supabase client with the service-role key, used for citizen
// review writes. Import only from route handlers; never from client components.

let cached: SupabaseClient | null | undefined;

export function getAdminClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  cached =
    url.startsWith("http") && key
      ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
      : null;
  return cached;
}
