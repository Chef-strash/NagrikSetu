// Database population report.
//
// Counts rows in every table in the Supabase `public` schema and writes a JSON
// artifact so you can see which tables are populated and which are empty.
//
//   cd backend && npm run db:report
//   -> backend/results/db-status.results.json
//
// Requires a Supabase personal access token (SB_TOKEN) because exact per-table
// counts need the Management API (PostgREST cannot run dynamic SQL).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "..", "results");
const outFile = resolve(outDir, "db-status.results.json");

const ref = process.env.PROJECT_REF || "slqtpxocaphvwdkivkfj";
const token = process.env.SB_TOKEN;

if (!token) {
  console.error("Missing SB_TOKEN (Supabase personal access token, starts with sbp_).");
  process.exit(1);
}

// Exact row count per public table via query_to_xml (runs count(*) per table).
const SQL = `
select
  c.relname as table_name,
  coalesce(s.n_live_tup, 0) as est_rows,
  (xpath('/row/cnt/text()',
     query_to_xml(format('select count(*) as cnt from %I.%I', 'public', c.relname),
                  false, true, '')))[1]::text::int as row_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_stat_user_tables s on s.relid = c.oid
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;
`;

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: SQL })
});

if (!res.ok) {
  console.error(`Query failed (${res.status}): ${(await res.text()).slice(0, 400)}`);
  process.exit(1);
}

const rows = await res.json();
const tables = rows.map((r) => ({
  table: r.table_name,
  rows: Number(r.row_count ?? 0),
  estimatedRows: Number(r.est_rows ?? 0),
  populated: Number(r.row_count ?? 0) > 0
}));

const populated = tables.filter((t) => t.populated);
const empty = tables.filter((t) => !t.populated);

const payload = {
  generatedAt: new Date().toISOString(),
  project: ref,
  schema: "public",
  summary: {
    tables: tables.length,
    populated: populated.length,
    empty: empty.length,
    totalRows: tables.reduce((sum, t) => sum + t.rows, 0)
  },
  emptyTables: empty.map((t) => t.table),
  tables
};

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify(payload, null, 2), "utf8");

console.log(`Tables: ${tables.length} | populated: ${populated.length} | empty: ${empty.length}\n`);
for (const t of tables) {
  console.log(`${t.populated ? "POPULATED" : "EMPTY    "}  ${t.table.padEnd(24)} ${t.rows}`);
}
console.log(`\nWrote ${outFile}`);
