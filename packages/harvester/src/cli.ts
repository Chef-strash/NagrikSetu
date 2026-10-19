#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isAllowlistedUrl, loadConfig } from "./config.js";
import { getSupabaseClient, supabaseHost, type SupabaseClient } from "./supabase/client.js";
import { validateProfile } from "./check/validate.js";
import { applyProfile, createInMemoryDb, createSupabaseDb, type DbPort } from "./apply/apply.js";
import { createInMemoryRuns, createSupabaseRuns, statusFor, coverageDetails, type RunsPort } from "./report/runs.js";
import { LISTING_API_BASE, parseWatchlist, type WatchlistEntry } from "./sources/registry.js";
import { fetchWithPolicy, type FetchImpl } from "./sources/http.js";
import {
  buildSourceDocument,
  isSchemeCircular,
  parseListingPage,
  type ListingNode,
  type SourceDocumentRow,
} from "./discover/feeds.js";
import {
  createInMemoryWardWriter,
  createSupabaseWardWriter,
  mapWardNodes,
  type WardOfficeWriter,
} from "./reference/wards.js";
import {
  createInMemoryHospitalWriter,
  createSupabaseHospitalWriter,
  mapHospitalNodes,
  type HospitalWriter,
} from "./reference/hospitals.js";
import {
  createUnpdfReader,
  readPdfPages,
  scanPagesToUserImages,
  textPagesToSourceText,
  type PdfPage,
} from "./content/pdf.js";
import { runProfiler, type ProfilerDeps, type ProfilerInput, type ProfilerOutput } from "./agent/profiler.js";

export interface CliOptions {
  stage: "reference" | "discover" | "profile" | "all";
  scheme?: string | undefined;
  offline: boolean;
  demo: boolean;
  dryRun: boolean;
  allowFixtureWrites: boolean;
}

export function parseArgs(argv: string[]): CliOptions {
  const o: CliOptions = { stage: "all", offline: false, demo: false, dryRun: false, allowFixtureWrites: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === "harvest") continue;
    else if (a === "--stage") o.stage = (argv[++i] as CliOptions["stage"]) ?? "all";
    else if (a.startsWith("--stage=")) o.stage = a.split("=")[1] as CliOptions["stage"];
    else if (a === "--scheme") o.scheme = argv[++i] as string;
    else if (a.startsWith("--scheme=")) o.scheme = a.split("=")[1] as string;
    else if (a === "--offline") o.offline = true;
    else if (a === "--demo") { o.demo = true; o.offline = true; }
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--allow-fixture-writes") o.allowFixtureWrites = true;
  }
  if (!["reference", "discover", "profile", "all"].includes(o.stage)) throw new Error("bad --stage " + o.stage);
  return o;
}

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..");
const PMC_HOST = "https://webadmin.pmc.gov.in";

function readFixture(name: string): string | undefined {
  const candidates = [
    join(pkgRoot, "fixtures", name),
    join(pkgRoot, "..", "..", "packages", "harvester", "fixtures", name),
  ];
  for (const p of candidates) {
    try { return readFileSync(p, "utf8"); } catch { /* try next */ }
  }
  return undefined;
}

function absolutePmc(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return PMC_HOST + (url.startsWith("/") ? url : `/${url}`);
}

/**
 * Live PMC listing fetch. The documented `per_page`/`page` params are ignored
 * by the live API (it always returns the first 8 items); it honours `limit`.
 * We request `limit` and stop as soon as a page adds no new nids, so a server
 * that does paginate is still followed safely.
 */
export interface ListingFetchOptions {
  perPage?: number;
  maxPages?: number;
  offline?: boolean;
  fixtureText?: (page: number) => string | undefined;
  /** Server-side `title=` substring filter (the only filter the live API honours). */
  title?: string;
  /** Test seam: overrides the network fetch. */
  fetchImpl?: FetchImpl;
}

export async function fetchListing(
  contentType: string,
  options: ListingFetchOptions = {},
): Promise<{ nodes: ListingNode[]; pages: number; totalItems: number }> {
  const perPage = options.perPage ?? 100;
  const maxPages = options.maxPages ?? 3;
  const offline = options.offline ?? false;
  const maxPage = offline ? 1 : maxPages;
  const seen = new Set<string>();
  const nodes: ListingNode[] = [];
  let pages = 0;
  let totalItems = 0;
  for (let page = 1; page <= maxPage; page += 1) {
    // LIVE API FACTS (verified 2026-10-04): `limit=<n>` sets page size and IS honoured;
    // `page` is IGNORED (always returns the first `limit` items); `title=<substr>`
    // filters server-side. So we request by `limit` (+ optional `title`) and rely on
    // the no-new-nids break, which also makes real paginators safe.
    const url =
      LISTING_API_BASE +
      "/" +
      contentType +
      "?limit=" +
      perPage +
      (options.title !== undefined ? "&title=" + encodeURIComponent(options.title) : "");
    const fixtureText = options.fixtureText ? options.fixtureText(page) : undefined;
    const policy = fixtureText === undefined ? { offline } : { offline, fixtureText };
    const res = await fetchWithPolicy(url, options.fetchImpl ? { ...policy, fetchImpl: options.fetchImpl } : policy);
    if (!res.ok || res.text === undefined) {
      throw new Error("listing " + contentType + " page " + page + " failed: " + (res.error ?? String(res.status)));
    }
    const parsed = parseListingPage(JSON.parse(res.text) as unknown);
    totalItems = parsed.meta.total_items;
    pages += 1;
    const before = nodes.length;
    for (const node of parsed.nodes) {
      const id = node.nid !== undefined && node.nid !== null ? String(node.nid) : JSON.stringify(node);
      if (seen.has(id)) continue;
      seen.add(id);
      nodes.push(node);
    }
    if (nodes.length === before || parsed.nodes.length === 0) break;
  }
  return { nodes, pages, totalItems };
}

/** English + Marathi candidate terms (review fix 1); `isSchemeCircular` is the canonical Marathi filter. */
export const CIRCULAR_TERMS: readonly string[] = [
  "scheme", "yojana", "scholarship", "assistance", "financial aid", "financial assistance",
  "grant", "subsidy", "health", "hospital", "education", "social development", "hawker",
  "vendor", "women", "divyang", "student", "welfare", "pension",
  "योजना", "अर्थसहाय्य", "शिष्यवृत्ती", "अनुदान", "सहाय्य", "वसतिगृह", "आरोग्य", "शिक्षण", "महिला", "विकास",
];
export const CIRCULAR_DEPARTMENTS_EN: readonly string[] = [
  "social development", "education", "health", "land acquisition", "encroachment",
  "livelihood", "welfare", "women", "urban development",
];

export function isCandidateCircular(node: ListingNode): boolean {
  if (isSchemeCircular(node)) return true;
  const dept = (node.department ?? "").toLowerCase();
  if (CIRCULAR_DEPARTMENTS_EN.some((d) => dept.includes(d))) return true;
  const title = (node.title ?? "").toLowerCase();
  return CIRCULAR_TERMS.some((k) => title.includes(k));
}

/**
 * Live discovery sweep. The listing API ignores `page` and caps unfiltered
 * results, so we union several server-side `title=<term>` queries (each
 * `limit=100`) and dedupe by nid. This is the only mechanism that surfaces real
 * scheme circulars from the 9,416-item feed.
 */
export async function fetchCircularCandidates(options: {
  offline?: boolean;
  perPage?: number;
  terms?: readonly string[];
  fetchImpl?: FetchImpl;
  fixtureText?: (page: number) => string | undefined;
} = {}): Promise<{ nodes: ListingNode[]; terms: readonly string[] }> {
  const terms = options.terms ?? CIRCULAR_TERMS;
  const perPage = options.perPage ?? 100;
  const offline = options.offline ?? false;
  const seen = new Set<string>();
  const nodes: ListingNode[] = [];
  for (const term of terms) {
    const r = await fetchListing("circular", {
      perPage,
      maxPages: 1,
      offline,
      title: term,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      ...(options.fixtureText ? { fixtureText: options.fixtureText } : {}),
    });
    for (const node of r.nodes) {
      const id = node.nid !== undefined && node.nid !== null ? String(node.nid) : JSON.stringify(node);
      if (seen.has(id)) continue;
      seen.add(id);
      nodes.push(node);
    }
  }
  return { nodes, terms };
}

export interface SourceDocWriter {
  upsert(rows: SourceDocumentRow[]): Promise<{ inserted: number; updated: number }>;
}

export function toSourceDocPayload(row: SourceDocumentRow): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    source_system: row.source_system,
    title: row.title,
    source_url: row.source_url,
    content_hash: row.content_hash,
  };
  if (row.external_id !== undefined) payload["external_id"] = row.external_id;
  if (row.published_at !== undefined) payload["published_at"] = row.published_at;
  if (row.file_url !== undefined) payload["file_url"] = row.file_url;
  return payload;
}

export function createInMemorySourceDocWriter(
  initial: SourceDocumentRow[] = [],
): SourceDocWriter & { rows: Map<string, SourceDocumentRow> } {
  const rows = new Map<string, SourceDocumentRow>();
  for (const r of initial) rows.set(r.source_system + "|" + r.source_url, { ...r });
  return {
    rows,
    async upsert(batch) {
      let inserted = 0;
      let updated = 0;
      for (const r of batch) {
        const key = r.source_system + "|" + r.source_url;
        if (rows.has(key)) updated += 1; else inserted += 1;
        rows.set(key, { ...r });
      }
      return { inserted, updated };
    },
  };
}

export function createSupabaseSourceDocWriter(client: SupabaseClient): SourceDocWriter {
  return {
    async upsert(batch) {
      if (batch.length === 0) return { inserted: 0, updated: 0 };
      const { error } = await client
        .from("source_documents")
        .upsert(batch.map(toSourceDocPayload), { onConflict: "source_system,source_url" });
      if (error) throw new Error("source_documents upsert failed: " + error.message);
      return { inserted: batch.length, updated: 0 };
    },
  };
}

export interface RunDeps {
  db?: DbPort;
  runs?: RunsPort;
  client?: SupabaseClient | null;
  env?: NodeJS.ProcessEnv;
  supabaseHost?: string;
  log?: (m: string) => void;
  wardWriter?: WardOfficeWriter;
  hospitalWriter?: HospitalWriter;
  sourceDocWriter?: SourceDocWriter;
  profiler?: (input: ProfilerInput, deps?: ProfilerDeps) => Promise<ProfilerOutput>;
  download?: (url: string) => Promise<Uint8Array | null>;
  readPdf?: (bytes: Uint8Array) => Promise<PdfPage[]>;
  watchlist?: WatchlistEntry[];
  nowIso?: string;
}

function loadWatchlist(): WatchlistEntry[] {
  const candidates = [
    join(pkgRoot, "src", "sources", "watchlist.json"),
    join(pkgRoot, "..", "..", "packages", "harvester", "src", "sources", "watchlist.json"),
  ];
  for (const p of candidates) {
    try { return parseWatchlist(readFileSync(p, "utf8")); } catch { /* try next */ }
  }
  return [];
}

function stripFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? (fenced[1] as string) : text).trim();
}

/**
 * Escape raw control characters that appear INSIDE JSON string literals.
 *
 * The model is asked for `eligibility_text` with one condition per line, and
 * then writes literal newlines into the JSON string instead of `\n` escapes,
 * which is not valid JSON ("Bad control character in string literal"). Escaping
 * every raw control character inside a string - and leaving the whitespace
 * between tokens untouched, so the document's own formatting still parses.
 */
export function escapeRawControlCharsInStrings(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }
    if (escaped) { out += ch; escaped = false; continue; }
    if (ch === "\\") { out += ch; escaped = true; continue; }
    if (ch === '"') { out += ch; inString = false; continue; }
    if (code < 0x20) {
      if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "\\r";
      else if (ch === "\t") out += "\\t";
      else if (ch === "\b") out += "\\b";
      else if (ch === "\f") out += "\\f";
      else out += "\\u" + code.toString(16).padStart(4, "0");
      continue;
    }
    out += ch;
  }
  return out;
}

/** Fence-strip plus control-character repair, ready for `JSON.parse`. */
function parseModelJson(text: string): unknown {
  const cleaned = escapeRawControlCharsInStrings(stripFences(text));
  try {
    return JSON.parse(cleaned);
  } catch (first) {
    // Last resort: some models wrap the object in an extra prose sentence.
    const braced = cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1);
    if (braced.length > 2) return JSON.parse(braced);
    throw first;
  }
}

function isPdfUrl(url: string): boolean {
  return /\.pdf(\?|#|$)/i.test(url) || /\/static\/uploads\//i.test(url);
}

/**
 * The watchlist stores URLs that are already percent-encoded - Marathi PMC PDF
 * filenames are full of `%E0%A4%...` and spaces arrive as `%20`. `encodeURI`
 * re-encodes the `%` of `%20` into `%2520`, which the server answers with 404,
 * so normalise through `URL` instead: it preserves existing encoding and only
 * escapes characters that are genuinely unsafe.
 */
export function normaliseUrl(url: string): string {
  try { return new URL(url).href; } catch { return url; }
}

async function downloadBytes(url: string): Promise<Uint8Array | null> {
  if (!isAllowlistedUrl(url)) throw new Error("refused: host not on official allowlist: " + url);
  const res = await fetch(normaliseUrl(url));
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}

function buildProfilePrompt(slug: string, sourceText: string, sourceUrl: string): string {
  const schema = [
    "{",
    '  "name": "<scheme name, from the source>",',
    '  "vernacular_name": "<Marathi title, from the source>",',
    '  "department": "<issuing department, from the source>",',
    '  "category": "education" | "healthcare" | "livelihood",',
    '  "description": "<one short plain-language paragraph>",',
    '  "eligibility_text": "<each eligibility condition on its own line, copied from the source; \\"unknown\\" if none>",',
    '  "source_url": "' + sourceUrl + '",',
    '  "benefit_amount": <number in rupees, or omit if not stated>,',
    '  "cutoff": "<one-line main condition, or omit>",',
    '  "income_limit": <number, or omit>,',
    '  "domicile_years": <number, or omit>,',
    '  "deadline": "<as written, or omit>",',
    '  "application_mode": "online" | "offline" | "both",',
    '  "apply_url": "<url, or omit>",',
    '  "official_form_name": "<form name, or omit>",',
    '  "official_form_url": "<url, or omit>",',
    '  "resolution_no": "<GR/resolution number, or omit>",',
    '  "documents": [ { "doc_key": "aadhaar", "label_en": "Aadhaar Card", "is_required": true } ]',
    "}",
  ].join("\n");
  return [
    "Profile the PMC / central welfare scheme '" + slug + "' from the official source text below.",
    "Call submit_profile with profile_json set to a JSON object EXACTLY in this shape:",
    schema,
    "",
    "Rules:",
    "- documents MUST be a non-empty array of OBJECTS with doc_key/label_en/is_required (never plain strings).",
    "- NEVER put a raw line break inside a JSON string: write multi-line eligibility_text with \\n escapes on one line.",
    "- category MUST be exactly one of: education, healthcare, livelihood.",
    "- eligibility_text: ONE condition per line, copied from the source; no blank lines.",
    "- benefit_amount must be a NUMBER in rupees (e.g. 15000), not text.",
    "- Every number/date you include MUST appear in the source text; OMIT any field the source does not state (never guess).",
    "- source_url must be exactly: " + sourceUrl,
    "- Reply ONLY by calling submit_profile. Do not write prose.",
    "",
    "--- OFFICIAL SOURCE TEXT ---",
    sourceText.slice(0, 60000),
  ].join("\n");
}

export async function runHarvest(opts: CliOptions, deps?: RunDeps): Promise<number> {
  const log = deps?.log ?? ((m: string) => console.log(m));
  const env = deps?.env ?? process.env;
  const clientProvided = deps !== undefined && "client" in deps;
  const client = clientProvided ? (deps?.client ?? null) : getSupabaseClient(env);
  const isLive = client !== null;
  const host = deps?.supabaseHost ?? supabaseHost(env) ?? "unknown-host";
  log(isLive ? "database: live supabase " + host : "database: in-memory (no keys)");

  if (isLive && (opts.offline || opts.demo) && !opts.allowFixtureWrites) {
    log("refused: fixture/demo run would write to the live supabase " + host + "; pass --allow-fixture-writes to override");
    return 1;
  }

  const db: DbPort = deps?.db ?? (isLive && client ? createSupabaseDb(client) : createInMemoryDb());
  const runs: RunsPort = deps?.runs ?? (isLive && client ? createSupabaseRuns(client) : createInMemoryRuns());
  const wardWriter: WardOfficeWriter = deps?.wardWriter ?? (isLive && client ? createSupabaseWardWriter(client) : createInMemoryWardWriter());
  const hospitalWriter: HospitalWriter = deps?.hospitalWriter ?? (isLive && client ? createSupabaseHospitalWriter(client) : createInMemoryHospitalWriter());
  const sourceDocWriter: SourceDocWriter = deps?.sourceDocWriter ?? (isLive && client ? createSupabaseSourceDocWriter(client) : createInMemorySourceDocWriter());
  const nowIso = deps?.nowIso ?? new Date().toISOString();
  const offline = opts.offline || loadConfig().scraperMode === "fixture";
  const totals = { seen: 0, isNew: 0, changed: 0, failed: 0 };
  const coverageGaps: Record<string, string[]> = {};
  const runId = await runs.open("harvest");
  let failedStage: string | null = null;
  try {
    if (!failedStage && (opts.stage === "reference" || opts.stage === "all")) {
      try {
        const wardListing = await fetchListing("ward_offices", {
          perPage: 100, maxPages: 3, offline,
          ...(offline ? { fixtureText: () => readFixture("listing-ward_offices-p1.json") } : {}),
        });
        const hospListing = await fetchListing("pmc_hospitals", {
          perPage: 100, maxPages: 3, offline,
          ...(offline ? { fixtureText: () => readFixture("listing-pmc_hospitals-p1.json") } : {}),
        });
        const wardRows = mapWardNodes(wardListing.nodes, nowIso);
        const hospRows = mapHospitalNodes(hospListing.nodes, nowIso);
        totals.seen += wardRows.length + hospRows.length;
        if (!opts.dryRun) {
          const wr = wardRows.length > 0 ? await wardWriter.upsert(wardRows) : { inserted: 0, updated: 0 };
          const hr = hospRows.length > 0 ? await hospitalWriter.upsert(hospRows) : { inserted: 0, updated: 0 };
          totals.isNew += wr.inserted + hr.inserted;
          totals.changed += wr.updated + hr.updated;
        }
        log("reference: wards=" + wardRows.length + " hospitals=" + hospRows.length + (opts.dryRun ? " (dry-run, no writes)" : " (upserted)"));
      } catch (e) { failedStage = "reference"; totals.failed += 1; log("reference FAILED: " + (e as Error).message); }
    }

    if (!failedStage && (opts.stage === "discover" || opts.stage === "all")) {
      try {
        const listing = offline
          ? await fetchListing("circular", { perPage: 100, maxPages: 1, offline: true, fixtureText: () => readFixture("listing-circular-p1.json") })
          : await fetchCircularCandidates({ perPage: 100 });
        const candidates = listing.nodes.filter(isCandidateCircular);
        const docs: SourceDocumentRow[] = candidates.map((node) => {
          const row = buildSourceDocument(node, "circular");
          return { ...row, source_url: absolutePmc(row.source_url) ?? row.source_url, file_url: absolutePmc(row.file_url) };
        });
        totals.seen += candidates.length;
        if (!opts.dryRun && docs.length > 0) {
          const r = await sourceDocWriter.upsert(docs);
          totals.isNew += r.inserted;
          totals.changed += r.updated;
        }
        log("discover: fetched=" + listing.nodes.length + " candidates=" + candidates.length + (opts.dryRun ? " (dry-run, no writes)" : " (upserted source_documents)"));
        for (const node of candidates.slice(0, 10)) {
          log("  candidate: " + (node.title ?? "(untitled)") + " [" + (node.department ?? "?") + "] " + absolutePmc(node.url));
        }
      } catch (e) { failedStage = "discover"; totals.failed += 1; log("discover FAILED: " + (e as Error).message); }
    }

    if (!failedStage && (opts.stage === "profile" || opts.stage === "all")) {
      try {
        const watchlist = deps?.watchlist ?? loadWatchlist();
        const wanted = opts.scheme ? watchlist.filter((e) => e.slug === opts.scheme) : watchlist;
        if (opts.scheme && wanted.length === 0) throw new Error("unknown scheme slug " + opts.scheme);
        const reader = createUnpdfReader();
        for (const entry of wanted) {
          const fileStem = entry.slug.replace(/^pmc-/, "");
          if (offline) {
            const raw = readFixture("profile-" + fileStem + ".json");
            if (!raw) { log("profile " + entry.slug + ": no fixture, skipped (offline)"); continue; }
            const fx = JSON.parse(raw) as { profile: unknown; sourceText?: string | null; scanOnly?: boolean };
            const v = validateProfile(fx.profile, {
              sourceText: fx.sourceText ?? null,
              ...(typeof fx.scanOnly === "boolean" ? { scanOnly: fx.scanOnly } : {}),
            });
            totals.seen += 1;
            if (!v.ok || !v.profile) { totals.failed += 1; coverageGaps[entry.slug] = v.issues; log("profile " + entry.slug + ": INVALID " + v.issues.join("; ")); continue; }
            const res = await applyProfile(db, v.profile, { slug: entry.slug, dryRun: opts.dryRun, checkStatus: v.needsReview ? "needs_review" : "verified" });
            if (res.action === "inserted") totals.isNew += 1; else if (res.action === "updated") totals.changed += 1;
            if (res.coverageGaps.length > 0) coverageGaps[res.slug] = res.coverageGaps;
            log("apply " + res.slug + ": " + res.action + " verification=" + res.verification_status + (opts.dryRun ? " (dry-run)" : ""));
            continue;
          }
          const pages: PdfPage[] = [];
          let htmlText = "";
          let sourceDocId: string | null = null;
          let downloadedUrl: string | null = null;
          for (const url of entry.urls) {
            if (isPdfUrl(url)) {
              const bytes = deps?.download ? await deps.download(url) : await downloadBytes(url);
              if (!bytes) { log("profile " + entry.slug + ": download failed " + url); continue; }
              downloadedUrl = url;
              const read = deps?.readPdf ?? ((b: Uint8Array) => readPdfPages(b, reader));
              pages.push(...await read(bytes));
            } else {
              const r = await fetchWithPolicy(url, { offline: false });
              if (r.ok && r.text) { htmlText += "\n" + r.text; downloadedUrl = downloadedUrl ?? url; }
            }
          }
          // A download that failed is NOT the same as a scanned page. With no
          // bytes and no HTML there is nothing to read, and profiling the empty
          // source makes the agent invent a placeholder row (name "unknown",
          // eligibility "unknown"), which then passes the Zod gate and lands in
          // the database. Refuse the scheme instead.
          if (pages.length === 0 && htmlText.trim().length === 0) {
            totals.failed += 1;
            coverageGaps[entry.slug] = ["no source content retrieved (every URL failed to download)"];
            log("profile " + entry.slug + ": NO SOURCE CONTENT retrieved; refusing to profile an empty source");
            continue;
          }
          // Record the fetched document in source_documents and capture its id,
          // so the applied scheme row can carry source_doc_id (review acceptance).
          if (isLive && client && !opts.dryRun && downloadedUrl) {
            const docText = [textPagesToSourceText(pages), htmlText].join("\n");
            await sourceDocWriter.upsert([{
              source_system: "central_scheme_guideline",
              external_id: entry.slug,
              title: entry.slug,
              published_at: nowIso,
              source_url: downloadedUrl,
              file_url: downloadedUrl,
              content_hash: createHash("sha256").update(docText, "utf8").digest("hex"),
            }]);
            const { data: docRow } = await client.from("source_documents").select("id").eq("source_url", downloadedUrl).maybeSingle();
            sourceDocId = (docRow as { id?: string } | null)?.id ?? null;
          }
          const text = [textPagesToSourceText(pages), htmlText].filter((s) => s.trim().length > 0).join("\n\n");
          const scanOnly = text.trim().length === 0 && pages.length > 0;
          const primaryUrl = entry.urls[0] ?? "https://www.mohua.gov.in";
          const prompt = buildProfilePrompt(entry.slug, text.trim().length > 0 ? text : "(no text layer; pages are scanned)", primaryUrl);
          const sources = [{ id: entry.slug, kind: "official_document", text: text.trim().length > 0 ? text : "(scanned document; see attached page images)" }];
          const out = await (deps?.profiler ?? runProfiler)({ prompt, sources, userImages: scanPagesToUserImages(pages) });
          totals.seen += 1;
          if (!out.submitted) { totals.failed += 1; coverageGaps[entry.slug] = ["agent did not submit"]; log("profile " + entry.slug + ": no submission"); continue; }
          let parsed: unknown;
          try { parsed = parseModelJson(out.submitted); } catch (e) { totals.failed += 1; log("profile " + entry.slug + ": bad JSON " + (e as Error).message); continue; }
          // The official source URL is known to us — never let the model guess it.
          if (parsed && typeof parsed === "object" && !(parsed as Record<string, unknown>)["source_url"]) {
            (parsed as Record<string, unknown>)["source_url"] = primaryUrl;
          }
          const v = validateProfile(parsed, {
            sourceText: text.trim().length > 0 ? text : null,
            ...(scanOnly ? { scanOnly: true } : {}),
          });
          if (!v.ok || !v.profile) { totals.failed += 1; coverageGaps[entry.slug] = v.issues; log("profile " + entry.slug + ": INVALID " + v.issues.join("; ")); continue; }
          const res = await applyProfile(db, v.profile, {
            slug: entry.slug,
            ...(sourceDocId ? { sourceDocId } : {}),
            dryRun: opts.dryRun,
            checkStatus: v.needsReview ? "needs_review" : "verified",
          });
          if (res.action === "inserted") totals.isNew += 1; else if (res.action === "updated") totals.changed += 1;
          if (res.coverageGaps.length > 0) coverageGaps[res.slug] = res.coverageGaps;
          log("apply " + res.slug + ": " + res.action + " verification=" + res.verification_status + (opts.dryRun ? " (dry-run)" : ""));
        }
        if (opts.demo) {
          if (isLive) log("demo: synthetic change event skipped (never write synthetic rows to a live database)");
          else {
            const label = "LABELLed synthetic change event (demo only, not from an official source)";
            await db.insertChangeEvent("pmc-demo-scheme", { change_type: "updated", field: "benefit_amount", old_value: 10000, new_value: 15000, applied: false, source_doc_id: null, synthetic: true, note: label });
            totals.changed += 1;
            log("demo: " + label);
          }
        }
      } catch (e) { failedStage = "profile"; totals.failed += 1; log("profile FAILED: " + (e as Error).message); }
    }
  } finally {
    const status = failedStage ? "failed" : statusFor(totals);
    await runs.close(runId, { status, totals, summary: failedStage ? "stage failed: " + failedStage : "harvest done", details: coverageDetails(coverageGaps) });
  }
  if (failedStage) { log("harvest FAILED at stage " + failedStage); return 1; }
  log("harvest done seen=" + totals.seen + " new=" + totals.isNew + " changed=" + totals.changed + " failed=" + totals.failed);
  if (totals.failed > 0 && totals.isNew + totals.changed === 0) return 1;
  return 0;
}

export function ensureDemoFixtures(): void {
  const dir = join(pkgRoot, "fixtures");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const circ = join(dir, "listing-circular-p1.json");
  if (!existsSync(circ)) {
    const nodes = [{ nid: "101", title: "शिष्यवृत्ती योजना", display_date: "1 October 2026", department: "Social Development", file: null, url: "/node/101" }];
    writeFileSync(circ, JSON.stringify({ meta: { total_items: 1, total_pages: 1, current_page: 1, per_page: 8, content_type: "circular" }, data: { nodes } }, null, 2));
  }
}

if (process.argv[1]?.endsWith("cli.js") || process.argv[1]?.endsWith("cli.ts")) {
  ensureDemoFixtures();
  runHarvest(parseArgs(process.argv.slice(2))).then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
}
