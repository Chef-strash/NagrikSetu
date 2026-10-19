import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  CIRCULAR_DEPARTMENTS,
  CIRCULAR_TITLE_PATTERN,
  circularTitleRegex,
  isSchemeDepartment,
  isSchemeTitle,
  LISTING_API_BASE,
  listingUrl,
  parseWatchlist,
  SOURCE_REGISTRY,
} from "./registry.js";
import { isAllowlistedUrl, loadConfig } from "../config.js";

const here = dirname(fileURLToPath(import.meta.url));
const watchlistText = readFileSync(join(here, "watchlist.json"), "utf8");

describe("source registry (plan §§4,12)", () => {
  it("builds listing-api URLs with singular content-type token", () => {
    expect(listingUrl("circular", 2, 20)).toBe(
      `${LISTING_API_BASE}/circular?per_page=20&page=2`,
    );
  });

  it("keeps the Marathi department filter + title regex", () => {
    expect(CIRCULAR_DEPARTMENTS).toContain("समाज विकास");
    expect(CIRCULAR_TITLE_PATTERN).toMatch("योजना");
    expect(circularTitleRegex().test("शिष्यवृत्ती योजना")).toBe(true);
    expect(circularTitleRegex().test("road repair tender")).toBe(false);
  });

  it("adds English department + title terms (review fix 1)", () => {
    for (const term of [
      "social development",
      "education",
      "health",
      "hawker",
      "street vendor",
      "encroachment",
      "disability",
      "urban poor",
      "slum",
      "rehabilitation",
    ]) {
      expect(CIRCULAR_DEPARTMENTS).toContain(term);
    }
    for (const term of [
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
    ]) {
      expect(CIRCULAR_TITLE_PATTERN).toContain(term);
    }
  });

  it("matches live English departments case-insensitively (substring)", () => {
    expect(isSchemeDepartment("Health Department")).toBe(true);
    expect(isSchemeDepartment("Social Development")).toBe(true);
    expect(isSchemeDepartment("Land Acquisition")).toBe(false);
    expect(isSchemeTitle("Scholarship for girl students")).toBe(true);
    expect(isSchemeTitle("road repair tender")).toBe(false);
    // whole-word matching: "granted" must not match the "grant" term
    expect(
      isSchemeTitle(
        "NOC from the Land Acquisition Department before building permission is granted",
      ),
    ).toBe(false);
    expect(isSchemeTitle("One-time grant of Rs 15,000")).toBe(true);
  });

  it("watchlist slugs are on official hosts with document URLs + notes", () => {
    const entries = parseWatchlist(watchlistText);
    // The curated baseline that must always survive. The list grows as more
    // official PMC pages are added, so assert presence rather than a count.
    expect(entries.length).toBeGreaterThanOrEqual(7);
    const slugs = entries.map((e) => e.slug);
    for (const slug of [
      "pmc-shram-safalya-awas",
      "pmc-azad-class10",
      "pmc-sathe-class12",
      "pmc-sgay-health",
      "pmc-svanidhi-hawker",
      "pmc-savitribai-girls",
      "pmc-divyang-welfare",
    ]) {
      expect(slugs).toContain(slug);
    }
    for (const e of entries) {
      expect(e.slug).toMatch(/^pmc-/);
      expect(e.urls.length).toBeGreaterThan(0);
      expect(typeof e.note).toBe("string");
      for (const url of e.urls) {
        expect(url).toMatch(/^https:\/\//);
        expect(isAllowlistedUrl(url)).toBe(true);
      }
    }
  });

  it("puts the SVANidhi guideline PDF on an allowlisted mohua host (fix 6)", () => {
    const entries = parseWatchlist(watchlistText);
    const svanidhi = entries.find((e) => e.slug === "pmc-svanidhi-hawker");
    const pdf =
      "https://www.mohua.gov.in/static/uploads/2026/01/bde957bc3a87fb001c05ddd09484edda.pdf";
    expect(svanidhi?.urls).toEqual([pdf]);
    expect(isAllowlistedUrl(pdf)).toBe(true);
    expect(new URL(pdf).hostname).toBe("www.mohua.gov.in");
    expect(
      loadConfig({} as NodeJS.ProcessEnv).modelId,
    ).toBe("cline-pass/glm-5.3");
  });

  it("marks the Playwright page source as stretch", () => {
    const page = SOURCE_REGISTRY.find((s) => s.id === "pmc_page");
    expect(page?.needsRender).toBe(true);
    expect(page?.access).toMatch(/stretch/i);
  });
});
