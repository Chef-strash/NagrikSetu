import type { Scheme, CommunityTip } from "../data/schemes";

export const NOT_PUBLISHED = "Not published";

/** Display text for a possibly-missing scheme field. */
export function shown(value: string | null | undefined): string {
  return value && value.trim() ? value : NOT_PUBLISHED;
}

/** One `schemes` row (with its joined ward office) as returned by Supabase. */
export interface DbSchemeRow {
  id: string;
  slug?: string;
  category?: "education" | "healthcare" | "livelihood";
  category_label?: string;
  name: string;
  vernacular_name?: { mr?: string; hi?: string } | null;
  department?: string;
  resolution_no?: string;
  benefit_amount?: string;
  grant_amount?: number;
  benefit_type?: string;
  deadline?: string;
  cutoff?: string;
  income_limit?: number | string | null;
  income_limit_formatted?: string;
  domicile_years?: number;
  description?: string;
  eligibility_text?: string;
  ward_offices?: {
    ward_name?: string;
    counter_number?: string;
    operating_hours?: string;
    physical_address?: string;
  } | null;
  required_documents?: string[];
  staple_order?: string[];
  official_form_name?: string;
  official_form_url?: string;
}

export interface DbTipRow {
  id: string;
  scheme_id: string;
  author: string;
  role: string;
  counter: string;
  tip: string;
  helpful_count: number;
}

/**
 * Map a DB row to a Scheme. Missing columns stay empty ("" / 0) rather than being
 * filled with invented values; the UI shows "Not published" for them.
 */
export function mapDbScheme(row: DbSchemeRow, tipRows: DbTipRow[], fallback: Scheme[]): Scheme {
  const slug = row.slug || row.id;
  const local = fallback.find((s) => s.id === slug);
  const tips: CommunityTip[] = tipRows
    .filter((t) => t.scheme_id === row.id)
    .map((t) => ({
      id: t.id,
      author: t.author,
      role: t.role,
      date: "Recently",
      counter: t.counter,
      tip: t.tip,
      helpfulCount: t.helpful_count || 1
    }));
  const income = Number(row.income_limit) || 0;
  const grant = row.grant_amount ? `Rs. ${row.grant_amount}` : "";
  const form = row.official_form_url && row.official_form_url !== "#" ? row.official_form_url : "";
  return {
    id: slug,
    category: row.category || "education",
    categoryLabel: row.category_label || "",
    name: row.name,
    vernacularName: row.vernacular_name?.mr || row.name,
    department: row.department || "",
    resolutionNo: row.resolution_no || "",
    benefitAmount: row.benefit_amount || grant,
    benefitType: row.benefit_type || "",
    deadline: row.deadline || "",
    cutoff: row.cutoff || "",
    incomeLimit: income,
    incomeLimitFormatted: row.income_limit_formatted || (income ? `Under Rs. ${income}` : ""),
    domicileYears: row.domicile_years || 0,
    description: row.description || "",
    eligibility: row.eligibility_text || local?.eligibility || "",
    counterLocation: {
      office: row.ward_offices?.ward_name || "",
      desk: row.ward_offices?.counter_number || "",
      hours: row.ward_offices?.operating_hours || "",
      address: row.ward_offices?.physical_address || ""
    },
    requiredDocuments: row.required_documents || [],
    stapleOrder: row.staple_order || [],
    officialFormName: row.official_form_name || "",
    officialFormUrl: form,
    communityTips: tips.length > 0 ? tips : local?.communityTips || []
  };
}

/** "Office, Desk" joined for display, skipping blanks. */
export function counterLabel(s: Pick<Scheme, "counterLocation">): string {
  return [s.counterLocation.office, s.counterLocation.desk].filter(Boolean).join(", ");
}

/** Fetch live schemes (client). Returns null when unavailable so callers keep the fallback. */
export async function loadSchemes(
  client: { from: (t: string) => any } | null, // eslint-disable-line @typescript-eslint/no-explicit-any
  fallback: Scheme[]
): Promise<Scheme[] | null> {
  if (!client) return null;
  const { data, error } = await client
    .from("schemes")
    .select("*, ward_offices(*)")
    .order("grant_amount", { ascending: false });
  if (error || !data || data.length === 0) return null;
  const { data: tips } = await client
    .from("peer_intel_reviews")
    .select("*")
    .not("scheme_id", "is", null)
    .eq("verified_by_moderator", true)
    .order("helpful_count", { ascending: false });
  return (data as DbSchemeRow[]).map((r) => mapDbScheme(r, (tips || []) as DbTipRow[], fallback));
}

/** "Submission is at X (hours)." or an empty string when the counter is unknown. */
export function submissionSentence(s: Pick<Scheme, "counterLocation">): string {
  const where = counterLabel(s);
  if (!where) return "";
  const hours = s.counterLocation.hours ? ` (${s.counterLocation.hours})` : "";
  return `Submission is at ${where}${hours}. `;
}

/** Home-page category copy derived from the loaded schemes (no hardcoded figures). */
export function categoryBlurb(
  schemes: Pick<Scheme, "category" | "benefitAmount">[],
  category: Scheme["category"],
  language: "en" | "mr" = "en"
): string {
  const inCat = schemes.filter((s) => s.category === category);
  const n = inCat.length;
  const topic: Record<Scheme["category"], string> = {
    education: "education grants and scholarships",
    healthcare: "health and hospital care support",
    livelihood: "livelihood and self-employment support"
  };
  if (n === 0) return `Browse ${topic[category]} from Pune Municipal Corporation.`;
  const amounts = Array.from(new Set(inCat.map((s) => s.benefitAmount).filter(Boolean))).slice(0, 2);
  const base = `${n} PMC ${n === 1 ? "scheme" : "schemes"} offering ${topic[category]}`;
  void language;
  return amounts.length ? `${base}, including ${amounts.join(" and ")}.` : `${base}.`;
}
