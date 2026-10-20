import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl.startsWith("http")
);

/** True only when explicitly opted in AND Supabase is not configured. */
export const isDemoAuth =
  !process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_DEMO_AUTH === "true";

let projectRef = "local";
try {
  if (supabaseUrl) projectRef = new URL(supabaseUrl).hostname.split(".")[0];
} catch {
  /* ignore */
}
export const authStorageKey = `sb-${projectRef}-auth-token`;

/* The session lives in localStorage; a small marker cookie named like the
   standard Supabase auth cookie lets middleware.ts detect signed-in visitors.
   It grants nothing: all data access is still enforced by RLS. */
const cookieStorage = {
  getItem(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
      document.cookie = `${key}=1; Path=/; Max-Age=31536000; SameSite=Lax`;
    } catch {
      /* ignore */
    }
  },
  removeItem(key: string) {
    try {
      window.localStorage.removeItem(key);
      document.cookie = `${key}=; Path=/; Max-Age=0; SameSite=Lax`;
    } catch {
      /* ignore */
    }
  },
};

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storageKey: authStorageKey,
        storage: typeof window !== "undefined" ? cookieStorage : undefined,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;
