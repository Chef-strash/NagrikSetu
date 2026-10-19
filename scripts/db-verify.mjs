// Verify the database through the REST API, as the app sees it.
//   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/db-verify.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (and SUPABASE_SERVICE_ROLE_KEY).");
  process.exit(1);
}
const opts = { auth: { persistSession: false } };
const anon = createClient(url, anonKey, opts);
const service = serviceKey ? createClient(url, serviceKey, opts) : null;

// [table, anon should read rows?]
const TABLES = [
  ["schemes", true], ["scheme_faqs", true], ["peer_intel_reviews", true], ["ward_offices", true],
  ["empaneled_hospitals", true], ["bank_merger_map", true],
  ["user_profiles", false], ["active_sessions", false], ["document_extractions", false],
];
let bad = 0;
const count = async (c, t) => {
  const { count: n, error } = await c.from(t).select("*", { count: "exact", head: true });
  return error ? `ERR(${error.code || error.message})` : n;
};
console.log("table".padEnd(24), "anon".padEnd(10), "service");
for (const [t, anonReads] of TABLES) {
  const a = await count(anon, t);
  const s = service ? await count(service, t) : "-";
  const okAnon = anonReads ? typeof a === "number" && a > 0 : a === 0 || String(a).startsWith("ERR");
  const okSvc = !service || (typeof s === "number");
  if (!okAnon || !okSvc) bad++;
  console.log(t.padEnd(24), String(a).padEnd(10), String(s), okAnon && okSvc ? "" : "  <-- UNEXPECTED");
}
const { data: sch } = await anon.from("schemes").select("id").limit(1);
const sid = sch?.[0]?.id;
if (sid) {
  const r = await anon.rpc("search_scheme_faqs", { p_scheme_id: sid, p_query: "documents", p_languages: ["en"] });
  console.log("rpc search_scheme_faqs", r.error ? `ERR ${r.error.message}` : `ok (${r.data?.length ?? 0} rows)`);
  if (r.error) bad++;
}
const up = await anon.rpc("upvote_peer_review", { review_id: "00000000-0000-0000-0000-000000000000" });
console.log("rpc upvote_peer_review", up.error ? `ERR ${up.error.message}` : "ok (no-op id)");
if (up.error) bad++;
console.log(bad ? `\n${bad} problem(s).` : "\nAll checks passed.");
process.exit(bad ? 1 : 0);
