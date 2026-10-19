// Apply docs/demo-setup.sql then docs/seed.sql to a Postgres/Supabase database.
//   DATABASE_URL=postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres node scripts/db-setup.mjs
// Each file runs in its own transaction (all-or-nothing). Safe to re-run.
import pg from "pg";
import { readFileSync } from "node:fs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL (Supabase: Project Settings > Database > Connection string).");
  process.exit(1);
}
const FILES = ["docs/demo-setup.sql", "docs/seed.sql"];
const TABLES = ["schemes", "scheme_documents", "scheme_faqs", "peer_intel_reviews", "ward_offices",
  "empaneled_hospitals", "bank_merger_map", "document_extractions", "user_profiles", "active_sessions"];

const client = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
await client.connect();
try {
  for (const f of FILES) {
    // seed.sql carries its own BEGIN/COMMIT; strip so our transaction wrapper owns it.
    const sql = readFileSync(new URL("../" + f, import.meta.url), "utf8").replace(/^\s*(BEGIN|COMMIT);\s*$/gim, "");
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("COMMIT");
      console.log(`applied ${f}`);
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(`FAILED ${f}: ${e.message}`);
      process.exitCode = 1;
      break;
    }
  }
  if (!process.exitCode) {
    for (const t of TABLES) {
      const r = await client.query(`select count(*)::int as n from public.${t}`);
      console.log(`  ${t.padEnd(22)} ${r.rows[0].n}`);
    }
  }
} finally {
  await client.end();
}
