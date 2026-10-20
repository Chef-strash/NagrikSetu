#!/usr/bin/env node
// Apply a SQL migration to a Supabase project via the Management API.
//
// Usage:
//   $env:SB_TOKEN='sbp_xxx'; node scripts/apply-migration.mjs docs/migrations/004_scheme_faqs_marathi.sql
//   SB_TOKEN=sbp_xxx node scripts/apply-migration.mjs docs/migrations/001_tighten_rls.sql
//
// Requires a Supabase *personal access token* (Dashboard -> Account -> Access Tokens,
// https://supabase.com/dashboard/account/tokens), NOT the anon/service-role keys.
// Only the Management API can execute DDL; the anon and service_role keys are JWTs
// for PostgREST/RLS and cannot create tables or policies.
//
// Project ref defaults to the NagrikSetu project and can be overridden:
//   PROJECT_REF=abcdefghijklmnop node scripts/apply-migration.mjs <file>
//
// The Management API returns only the LAST statement's result set; run a separate
// file if you want to inspect rows returned by a query.

import { readFileSync } from "node:fs";

const ref = process.env.PROJECT_REF || "slqtpxocaphvwdkivkfj";
const token = process.env.SB_TOKEN;
const file = process.argv[2];

if (!token) {
  console.error("Missing SB_TOKEN (a Supabase personal access token, starting with sbp_).");
  process.exit(1);
}
if (!file) {
  console.error("Usage: SB_TOKEN=sbp_... node scripts/apply-migration.mjs <sql-file>");
  process.exit(1);
}

const sql = readFileSync(file, "utf8");

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ query: sql })
});

const text = await res.text();

if (!res.ok) {
  console.error(`FAILED (${res.status}) ${file}`);
  console.error(text);
  process.exit(1);
}

console.log(`OK (${res.status}) applied ${file}`);
if (text && text !== "[]") {
  console.log(text.slice(0, 2000));
}