/**
 * Official PMC source registry — contract for the harvester pipeline.
 *
 * Authority: docs/PMC_SOURCE_VERIFICATION_2026-10-04.md (verified 2026-10-04).
 * Official government sources only. No news, aggregators, or web search.
 *
 * Host allowlisting lives in `src/config.ts` (`PMC_ALLOWLIST_HOSTS`,
 * `isAllowlistedUrl`) — this module imports it, never duplicates it.
 */
import { PMC_ALLOWLIST_HOSTS } from "../config.js";

/** Content-type tokens for the CMS listing API. `circular` is singular — `circulars` returns 0. */
export const LISTING_CONTENT_TYPES = [
  "circular",
  "schemes",
  "press_note",
  "pmc_initiatives",
  "online_services",
  "general_information",
  "page",
  "ward_offices",
  "pmc_hospitals",
  "citizen_charter",
] as const;

export type ListingContentType = (typeof LISTING_CONTENT_TYPES)[number];

/** Base URL of the primary discovery surface (Drupal 11 CMS JSON listing API). */
export const LISTING_API_BASE =
  "https://webadmin.pmc.gov.in/api/listing-api";

/** Build a paginated listing-API URL for a content type. */
export function listingUrl(
  contentType: ListingContentType,
  page = 1,
  perPage = 20,
): string {
  return `${LISTING_API_BASE}/${contentType}?per_page=${perPage}&page=${page}`;
}

/**
 * Department values the `circular` discovery filter keys on.
 *
 * The live CMS `department` field is English (e.g. `"Health Department"`,
 * `"Land Acquisition"`), while the seed/fixtures use Marathi department names.
 * Both are listed so discovery matches reality on either surface (review
 * 2026-10-04 Required fix 1). Matching is case-insensitive substring.
 */
export const CIRCULAR_DEPARTMENTS: readonly string[] = [
  // Marathi (official PMC department names)
  "समाज विकास",
  "आरोग्य",
  "शिक्षण",
  "नागरवस्ती विकास योजना",
  "अतिक्रमण",
  // English (live CMS department values)
  "social development",
  "education",
  "health",
  "medical",
  "women",
  "child",
  "welfare",
  "hawker",
  "vendor",
  "street vendor",
  "encroachment",
  "disability",
  "social welfare",
  "urban poor",
  "slum",
  "rehabilitation",
] as const;

/** Marathi title terms — Devanagari has no ASCII `\b` boundary, so match substrings. */
export const CIRCULAR_TITLE_MR = "योजना|अर्थसहाय्य|शिष्यवृत्ती|अनुदान|सहाय्य";

/** English title terms — matched as whole words so `grant` ≠ `granted`. */
export const CIRCULAR_TITLE_EN_WORDS = [
  "scheme",
  "yojana",
  "scholarship",
  "assistance",
  "financial aid",
  "grant",
  "subsidy",
  "loan",
  "health",
  "hospital",
  "education",
  "stipend",
  "welfare",
] as const;

/** Title terms (Marathi substring + English whole-word) marking a candidate scheme circular. */
export const CIRCULAR_TITLE_PATTERN =
  CIRCULAR_TITLE_MR + "|\\b(?:" + CIRCULAR_TITLE_EN_WORDS.join("|") + ")\\b";

/** Case-insensitive (English terms are capitalised in the live feed). */
export function circularTitleRegex(): RegExp {
  return new RegExp(CIRCULAR_TITLE_PATTERN, "i");
}

/** True when a department string matches any discovered department term. */
export function isSchemeDepartment(dept: string | null | undefined): boolean {
  const value = (dept ?? "").trim().toLowerCase();
  if (value === "") return false;
  return CIRCULAR_DEPARTMENTS.some((term) =>
    value.includes(term.toLowerCase()),
  );
}

/** True when a title matches the circular title pattern. */
export function isSchemeTitle(title: string | null | undefined): boolean {
  return circularTitleRegex().test(title ?? "");
}

export interface SourceDef {
  id: string;
  access: string;
  usedFor: string;
  /** Listing-API content types served by this source, if any. */
  contentTypes?: readonly ListingContentType[];
  endpoint?: string;
  /** True when Playwright rendering is needed (stretch — not required for demo). */
  needsRender?: boolean;
}

export const SOURCE_REGISTRY: readonly SourceDef[] = [
  {
    id: "pmc_circular",
    access: "JSON + PDF",
    usedFor: "discovery, scheme facts",
    contentTypes: ["circular"],
    endpoint: `${LISTING_API_BASE}/circular`,
  },
  {
    id: "pmc_content",
    access: "JSON",
    usedFor: "discovery",
    contentTypes: [
      "schemes",
      "press_note",
      "pmc_initiatives",
      "online_services",
      "general_information",
      "page",
    ],
  },
  {
    id: "pmc_page",
    access: "Playwright render (stretch)",
    usedFor: "scheme facts",
    endpoint: "https://www.pmc.gov.in/schemes/*",
    needsRender: true,
  },
  {
    id: "pmc_dbt",
    access: "JSON if reachable, else Playwright",
    usedFor: "education and divyang scheme facts",
    endpoint: "https://dbt.pmc.gov.in",
  },
  {
    id: "pmc_ward_offices",
    access: "JSON",
    usedFor: "reference loader",
    contentTypes: ["ward_offices"],
    endpoint: `${LISTING_API_BASE}/ward_offices`,
  },
  {
    id: "pmc_hospitals",
    access: "JSON",
    usedFor: "reference loader",
    contentTypes: ["pmc_hospitals"],
    endpoint: `${LISTING_API_BASE}/pmc_hospitals`,
  },
  {
    id: "central",
    access: "HTML/PDF",
    usedFor: "scheme facts (centrally funded schemes delivered by PMC)",
    endpoint: "https://pmsvanidhi.mohua.gov.in",
  },
] as const;

/** Official hosts reference (re-exported view over the config allowlist). */
export const OFFICIAL_HOSTS: readonly string[] = PMC_ALLOWLIST_HOSTS;

export interface WatchlistEntry {
  slug: string;
  urls: string[];
  /** Human note justifying each official document URL. */
  note?: string;
}

/** Parse and minimally validate watchlist.json text (slug -> official URLs). */
export function parseWatchlist(jsonText: string): WatchlistEntry[] {
  const parsed: unknown = JSON.parse(jsonText);
  if (!Array.isArray(parsed)) throw new Error("watchlist must be a JSON array");
  return parsed.map((entry) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as { slug?: unknown }).slug !== "string" ||
      !Array.isArray((entry as { urls?: unknown }).urls)
    ) {
      throw new Error("watchlist entry must have { slug: string, urls: string[] }");
    }
    return entry as WatchlistEntry;
  });
}
