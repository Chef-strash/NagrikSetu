#!/usr/bin/env node
// Prints a sign-in code for a demo user, with no email delivery.
//   npm run demo:otp -- you@example.com [--profile]
//
// The code comes from `auth.admin.generateLink`, which issues an 8-digit OTP
// regardless of the project's configured "Email OTP Length". The sign-in form
// accepts 6 to 8 digits so that this code and a normally emailed one both work.
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from packages/web/.env.local.
// Service-role key stays on this machine; never commit it.

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export function parseArgs(argv) {
  const out = { email: "", profile: false, error: "" };
  for (const arg of argv) {
    if (arg === "--profile") out.profile = true;
    else if (arg.startsWith("--")) out.error = `Unknown flag ${arg}`;
    else if (!out.email) out.email = arg.trim();
    else out.error = `Unexpected argument ${arg}`;
  }
  if (!out.error && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) {
    out.error = "Usage: npm run demo:otp -- you@example.com [--profile]";
  }
  return out;
}

export function parseEnvFile(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return env;
}

export const DEMO_PROFILE = {
  name: "Ramesh Patil",
  mobile: "9800000001",
  ward: "Ward 14: Kothrud - Bawdhan",
  income: 180000,
  domicile_years: 12,
  category: "OBC",
  ration_card: "Yellow",
  has_produce_vendor: false,
  empaneled_hospitals: [],
  dbt_enabled: true,
  disability_status: "None"
};

/** `admin` is a supabase-js client created with the service-role key. */
export async function issueOtp(admin, { email, profile }) {
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  // "already registered" is fine; any other failure is not.
  if (created.error && !/already|registered|exists/i.test(created.error.message ?? "")) {
    throw new Error(`createUser failed: ${created.error.message}`);
  }
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw new Error(`generateLink failed: ${link.error.message}`);
  const otp = link.data?.properties?.email_otp;
  const userId = link.data?.user?.id ?? created.data?.user?.id;
  if (!otp) throw new Error("Supabase returned no email_otp.");

  if (profile) {
    if (!userId) throw new Error("Could not determine the user id for the profile row.");
    const { error } = await admin
      .from("user_profiles")
      .upsert({ user_id: userId, email, ...DEMO_PROFILE }, { onConflict: "user_id" });
    if (error) throw new Error(`profile insert failed: ${error.message}`);
  }
  return { otp, userId };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    console.error(args.error);
    process.exit(2);
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const envPath = resolve(root, "packages/web/.env.local");
  if (!existsSync(envPath)) {
    console.error("packages/web/.env.local not found. Run `npm run demo:setup` first.");
    process.exit(1);
  }
  const env = parseEnvFile(readFileSync(envPath, "utf8"));
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in packages/web/.env.local.");
    process.exit(1);
  }
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { otp } = await issueOtp(admin, args);
    console.log(`\nSign in at http://localhost:3000/auth/signin as ${args.email}`);
    console.log(`Sign-in code (${otp.length} digits): ${otp}\n(valid for about an hour; no email is sent)`);
    if (args.profile) console.log("Demo profile (Ramesh Patil, Kothrud ward) saved.");
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
