// Runtime configuration for the NagrikSetu backend.
//
// Credentials come from the environment: `backend/.env` is loaded first, then the
// repository-root `.env`, so the same Supabase project used by the web app is
// reused without duplicating secrets.
//
// Recognised keys (same names the web app / Supabase dashboard uses):
//   NEXT_PUBLIC_SUPABASE_URL       - project URL
//   NEXT_PUBLIC_SUPABASE_ANON_KEY  - public key; reads are RLS-enforced
//   SUPABASE_SERVICE_ROLE_KEY      - server-only key; trusted writes, bypasses RLS
//
// Set NAGRIKSETU_DISABLE_DB=1 to force the offline fixture path (tests / demos).

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CORE_DIR = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = resolve(CORE_DIR, "..", "..");
const REPO_ROOT = resolve(BACKEND_DIR, "..");

function loadDotEnv(path: string): void {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const eq = line.indexOf("=");
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv(resolve(BACKEND_DIR, ".env"));
loadDotEnv(resolve(REPO_ROOT, ".env"));

function firstEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return "";
}

function isTruthy(value: string): boolean {
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export interface Settings {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  disableDb: boolean;
  port: number;
}

export function getSettings(): Settings {
  const port = Number.parseInt(firstEnv("PORT") || "8000", 10);
  return {
    supabaseUrl: firstEnv("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: firstEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    supabaseServiceRoleKey: firstEnv("SUPABASE_SERVICE_ROLE_KEY"),
    disableDb: isTruthy(firstEnv("NAGRIKSETU_DISABLE_DB")),
    port: Number.isFinite(port) && port > 0 ? port : 8000
  };
}

/** True when a public (anon, RLS-enforced) read client can be created. */
export function hasAnonAccess(settings: Settings): boolean {
  return Boolean(settings.supabaseUrl && settings.supabaseAnonKey) && !settings.disableDb;
}

/** True when the admin (service-role) client can be created for trusted writes. */
export function hasAdminAccess(settings: Settings): boolean {
  return Boolean(settings.supabaseUrl && settings.supabaseServiceRoleKey) && !settings.disableDb;
}

/** True when any database access (anon or service-role) is available. */
export function isDbEnabled(settings: Settings): boolean {
  return hasAnonAccess(settings) || hasAdminAccess(settings);
}