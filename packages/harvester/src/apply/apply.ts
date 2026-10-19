import { createHash } from "node:crypto";
import type { SupabaseClient } from "../supabase/client.js";
import type { SchemeProfile } from "../schema/profile.js";
import { assertCoverage, buildRequiredDocuments, buildStapleOrder, computeCoverage } from "./coverage.js";

export type VerificationStatus = "verified" | "needs_review";

export interface ChangeEvent {
  change_type: "created" | "updated" | "verified";
  field: string | null;
  old_value: unknown;
  new_value: unknown;
  applied: boolean;
  source_doc_id: string | null;
  synthetic?: boolean;
  note?: string;
}

export type SchemeRow = Record<string, unknown> & { slug: string; source_hash?: string };

export interface SchemeDocumentRow {
  doc_key: string;
  label_en: string;
  label_mr?: string | null;
  validator?: string | null;
  is_required: boolean;
  display_order: number;
}

export interface DbPort {
  getScheme(slug: string): Promise<SchemeRow | null>;
  upsertScheme(row: SchemeRow): Promise<void>;
  replaceDocuments(slug: string, docs: SchemeDocumentRow[]): Promise<void>;
  insertChangeEvent(slug: string, event: ChangeEvent): Promise<void>;
}

export interface ApplyOptions {
  /** Slug from the watchlist/triage — never derived from the English name. */
  slug: string;
  /** Real `ward_offices.id` UUID; omit (default) when unknown. */
  wardOfficeId?: string | null;
  /** Real `source_documents.id` UUID; omit (default) when unknown. */
  sourceDocId?: string | null;
  checkStatus?: VerificationStatus;
  nowIso?: string;
  dryRun?: boolean;
}

const TRACKED = ["name","vernacular_name","department","category","description","eligibility_text","benefit_amount","grant_amount","benefit_type","cutoff","income_limit","deadline","application_mode","apply_url","resolution_no","source_url","required_documents","staple_order"] as const;

function canon(v: unknown): string { return createHash("sha256").update(JSON.stringify(v), "utf8").digest("hex"); }
function same(a: unknown, b: unknown): boolean { return JSON.stringify(a ?? null) === JSON.stringify(b ?? null); }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: unknown): v is string { return typeof v === "string" && UUID_RE.test(v.trim()); }

/** Numeric fact: a finite number, else null (null/undefined/"unknown"). */
function knownNumber(v: unknown): number | null { return typeof v === "number" && Number.isFinite(v) ? v : null; }

/** Optional text fact: null for null/undefined/""/"unknown". */
function knownText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t.length === 0 || t.toLowerCase() === "unknown") return null;
  return t;
}

/** Indian digit grouping: 15000 -> "15,000", 100000 -> "1,00,000". */
export function formatIndianNumber(n: number): string {
  const digits = String(Math.round(n));
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return rest + "," + last3;
}

/** Frontend table expects text like "Rs. 15,000"; null when the amount is unknown. */
export function formatBenefitAmount(v: unknown): string | null {
  const n = knownNumber(v);
  return n === null ? null : `Rs. ${formatIndianNumber(n)}`;
}

/** TIMESTAMPTZ passthrough: ISO string only when the value parses as a date. */
function validDateIso(v: unknown): string | null {
  const raw = knownText(v);
  if (raw === null) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export interface BuiltSchemeRow { row: SchemeRow; docs: SchemeDocumentRow[]; coverageGaps: string[]; verificationStatus: VerificationStatus; sourceHash: string; }

/**
 * Build the `schemes` row. Columns are written only when a value is known:
 * a NOT NULL column with a default (`grant_amount`, `benefit_type`,
 * `name_i18n`, `description_i18n`, `cutoff_i18n`, `verification_status`) is
 * omitted rather than sent as explicit `null`, and nullable UUID columns
 * (`ward_office_id`, `source_doc_id`) are omitted unless the value is a real UUID.
 */
export function buildSchemeRow(profile: SchemeProfile, opts: ApplyOptions): BuiltSchemeRow {
  const computed = computeCoverage(profile, opts.slug);
  const coverage = assertCoverage(profile, computed);
  const required_documents = buildRequiredDocuments(profile);
  const staple_order = buildStapleOrder(required_documents);
  const verificationStatus: VerificationStatus = (opts.checkStatus === "needs_review" || !coverage.ok) ? "needs_review" : "verified";
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const docs: SchemeDocumentRow[] = profile.documents.map((d, i) => ({ doc_key: d.doc_key, label_en: d.label_en, label_mr: d.label_mr ?? null, validator: d.validator ?? "presence", is_required: d.is_required, display_order: i }));

  // Required columns (NOT NULL, no default) — always present.
  const row: SchemeRow = {
    slug: computed.slug, scheme_code: computed.scheme_code, name: profile.name, department: profile.department,
    pillar: computed.pillar, category: profile.category, category_label: computed.category_label,
    description: profile.description, eligibility_text: profile.eligibility_text,
    required_documents, staple_order, desk_type: computed.desk_type,
    is_active: true, verification_status: verificationStatus, last_verified_at: nowIso,
    source_url: profile.source_url,
  };

  // vernacular_name is JSONB; the frontend reads `vernacular_name?.mr`.
  row["vernacular_name"] = { mr: profile.vernacular_name };

  // i18n JSONB columns are NOT NULL DEFAULT '{}': write only when non-empty.
  const nameI18n = profile.name_i18n;
  if (nameI18n && Object.keys(nameI18n).length > 0) row["name_i18n"] = nameI18n;
  const descI18n = profile.description_i18n;
  if (descI18n && Object.keys(descI18n).length > 0) row["description_i18n"] = descI18n;

  const eligibilityTextMr = knownText(profile.eligibility_text_mr);
  if (eligibilityTextMr !== null) row["eligibility_text_mr"] = eligibilityTextMr;

  // Benefit facts. benefit_amount is text for the UI; grant_amount/benefit_type
  // keep their DB defaults when unknown, so they are omitted (never null).
  const benefitAmount = formatBenefitAmount(profile.benefit_amount);
  if (benefitAmount !== null) row["benefit_amount"] = benefitAmount;
  const grantAmount = knownNumber(profile.grant_amount);
  if (grantAmount !== null) row["grant_amount"] = grantAmount;
  const benefitType = knownText(profile.benefit_type);
  if (benefitType !== null) row["benefit_type"] = benefitType;
  const cutoff = knownText(profile.cutoff);
  if (cutoff !== null) row["cutoff"] = cutoff;
  const incomeLimit = knownNumber(profile.income_limit);
  if (incomeLimit !== null) row["income_limit"] = incomeLimit;
  const incomeLimitFormatted = knownText(profile.income_limit_formatted);
  if (incomeLimitFormatted !== null) row["income_limit_formatted"] = incomeLimitFormatted;
  const domicileYears = knownNumber(profile.domicile_years);
  if (domicileYears !== null) row["domicile_years"] = domicileYears;

  // Window / deadline: deadline is text; the TIMESTAMPTZ columns only when valid.
  const deadline = knownText(profile.deadline);
  if (deadline !== null) row["deadline"] = deadline;
  const windowOpensAt = validDateIso(profile.window_opens_at);
  if (windowOpensAt !== null) row["window_opens_at"] = windowOpensAt;
  const applicationDeadline = validDateIso(profile.application_deadline);
  if (applicationDeadline !== null) row["application_deadline"] = applicationDeadline;

  // How-to-apply.
  const applicationMode = knownText(profile.application_mode);
  if (applicationMode !== null) row["application_mode"] = applicationMode;
  const applyUrl = knownText(profile.apply_url);
  if (applyUrl !== null) row["apply_url"] = applyUrl;
  const howToApply = knownText(profile.how_to_apply);
  if (howToApply !== null) row["how_to_apply"] = howToApply;
  const officialFormName = knownText(profile.official_form_name);
  if (officialFormName !== null) row["official_form_name"] = officialFormName;
  const officialFormUrl = knownText(profile.official_form_url);
  if (officialFormUrl !== null) row["official_form_url"] = officialFormUrl;
  const resolutionNo = knownText(profile.resolution_no);
  if (resolutionNo !== null) row["resolution_no"] = resolutionNo;

  // UUID columns: only ever write a real UUID.
  if (isUuid(opts.wardOfficeId)) row["ward_office_id"] = opts.wardOfficeId.trim();
  if (isUuid(opts.sourceDocId)) row["source_doc_id"] = opts.sourceDocId.trim();

  const sourceHash = canon({ slug: row["slug"], name: row["name"], eligibility_text: row["eligibility_text"], benefit_amount: row["benefit_amount"] ?? null, required_documents });
  row["source_hash"] = sourceHash;
  return { row, docs, coverageGaps: coverage.gaps, verificationStatus, sourceHash };
}

export interface ApplyResult { slug: string; action: "inserted" | "updated" | "noop"; verification_status: VerificationStatus; coverageGaps: string[]; events: ChangeEvent[]; sourceHash: string; }

export function diffScheme(current: SchemeRow | null, next: SchemeRow): Array<{ field: string; old_value: unknown; new_value: unknown }> {
  if (!current) return (TRACKED as readonly string[]).filter((f) => next[f] !== undefined).map((f) => ({ field: f, old_value: null, new_value: next[f] }));
  if (typeof current["source_hash"] === "string" && typeof next["source_hash"] === "string" && current["source_hash"] === next["source_hash"]) return [];
  const out: Array<{ field: string; old_value: unknown; new_value: unknown }> = [];
  for (const field of TRACKED) { if (!same(current[field], next[field])) out.push({ field, old_value: current[field] ?? null, new_value: next[field] ?? null }); }
  return out;
}

export async function applyProfile(db: DbPort, profile: SchemeProfile, opts: ApplyOptions): Promise<ApplyResult> {
  const built = buildSchemeRow(profile, opts);
  const current = await db.getScheme(built.row.slug);
  const diffs = diffScheme(current, built.row);
  const sourceDocId = (built.row["source_doc_id"] as string | null) ?? null;
  if (current && diffs.length === 0) {
    const event: ChangeEvent = { change_type: "verified", field: null, old_value: null, new_value: null, applied: true, source_doc_id: sourceDocId };
    if (!opts.dryRun) await db.insertChangeEvent(built.row.slug, event);
    return { slug: built.row.slug, action: "noop", verification_status: built.verificationStatus, coverageGaps: built.coverageGaps, events: [event], sourceHash: built.sourceHash };
  }
  const events: ChangeEvent[] = current
    ? diffs.map((d) => ({ change_type: "updated" as const, field: d.field, old_value: d.old_value ?? null, new_value: d.new_value ?? null, applied: true, source_doc_id: sourceDocId }))
    : [{ change_type: "created" as const, field: null, old_value: null, new_value: { slug: built.row.slug, source_hash: built.sourceHash }, applied: true, source_doc_id: sourceDocId }];
  if (!opts.dryRun) {
    await db.upsertScheme(built.row);
    await db.replaceDocuments(built.row.slug, built.docs);
    for (const e of events) await db.insertChangeEvent(built.row.slug, e);
  }
  return { slug: built.row.slug, action: current ? "updated" : "inserted", verification_status: built.verificationStatus, coverageGaps: built.coverageGaps, events, sourceHash: built.sourceHash };
}

export function createInMemoryDb(initial: SchemeRow[] = []): DbPort & { schemes: Map<string, SchemeRow>; documents: Map<string, SchemeDocumentRow[]>; events: Array<{ slug: string; event: ChangeEvent }> } {
  const schemes = new Map<string, SchemeRow>();
  for (const r of initial) schemes.set(r.slug, { ...r });
  const documents = new Map<string, SchemeDocumentRow[]>();
  const events: Array<{ slug: string; event: ChangeEvent }> = [];
  return {
    schemes, documents, events,
    getScheme: async (slug: string) => schemes.get(slug) ?? null,
    upsertScheme: async (row: SchemeRow) => { schemes.set(row.slug, { ...row }); },
    replaceDocuments: async (slug: string, docs: SchemeDocumentRow[]) => { documents.set(slug, docs.map((d) => ({ ...d }))); },
    insertChangeEvent: async (slug: string, event: ChangeEvent) => { events.push({ slug, event: { ...event } }); },
  };
}

export function createSupabaseDb(client: SupabaseClient): DbPort {
  return {
    getScheme: async (slug: string) => {
      const { data, error } = await client.from("schemes").select("*").eq("slug", slug).maybeSingle();
      if (error) throw new Error("schemes select failed: " + error.message);
      return (data as SchemeRow | null) ?? null;
    },
    upsertScheme: async (row: SchemeRow) => {
      const { error } = await client.from("schemes").upsert(row, { onConflict: "slug" });
      if (error) throw new Error("schemes upsert failed: " + error.message);
    },
    replaceDocuments: async (slug: string, docs: SchemeDocumentRow[]) => {
      const { data, error } = await client.from("schemes").select("id").eq("slug", slug).maybeSingle();
      if (error) throw new Error("schemes id lookup failed: " + error.message);
      const schemeId = (data as { id?: string } | null)?.id;
      if (!schemeId) throw new Error("no scheme id for slug " + slug);
      const del = await client.from("scheme_documents").delete().eq("scheme_id", schemeId);
      if (del.error) throw new Error("scheme_documents delete failed: " + del.error.message);
      if (docs.length > 0) {
        const ins = await client.from("scheme_documents").upsert(docs.map((d) => ({ ...d, scheme_id: schemeId })), { onConflict: "scheme_id,doc_key" });
        if (ins.error) throw new Error("scheme_documents upsert failed: " + ins.error.message);
      }
    },
    insertChangeEvent: async (slug: string, event: ChangeEvent) => {
      const { data, error } = await client.from("schemes").select("id").eq("slug", slug).maybeSingle();
      if (error) throw new Error("schemes id lookup failed: " + error.message);
      const schemeId = (data as { id?: string } | null)?.id ?? null;
      const ins = await client.from("scheme_change_events").insert({ scheme_id: schemeId, source_doc_id: event.source_doc_id, change_type: event.change_type, field: event.field, old_value: event.old_value ?? null, new_value: event.new_value ?? null, applied: event.applied });
      if (ins.error) throw new Error("scheme_change_events insert failed: " + ins.error.message);
    },
  };
}
