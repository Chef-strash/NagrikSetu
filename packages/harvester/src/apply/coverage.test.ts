import { describe, expect, it } from "vitest";
import { assertCoverage, computeCoverage } from "./coverage.js";
import type { SchemeProfile } from "../schema/profile.js";

const BASE: SchemeProfile = {
  name: "Savitribai Phule Girls Scholarship",
  vernacular_name: "सावित्रीबाई फुले मुलींची शिष्यवृत्ती",
  department: "शिक्षण विभाग",
  category: "education",
  description: "Scholarship for girl students.",
  eligibility_text: "Must be a girl student\nMust be a PMC resident",
  source_url: "https://webadmin.pmc.gov.in/api/listing-api/circular/2",
  documents: [
    { doc_key: "aadhaar", label_en: "Aadhaar card", is_required: true },
    { doc_key: "bonafide", label_en: "Bonafide certificate", is_required: true },
  ],
};

const SLUG = "pmc-savitribai-phule-girls-scholarship";

describe("coverage", () => {
  it("computes scheme_code, pillar, label, desk and staple order from the caller slug", () => {
    const c = computeCoverage(BASE, SLUG);
    expect(c.slug).toBe(SLUG);
    expect(c.slug_truncated).toBe(false);
    expect(c.scheme_code).toBe("PMC_SAVITRIBAI_PHULE_GIRLS_SCHOLARSHIP");
    expect(c.pillar).toBe("EDUCATION");
    expect(c.category_label).toBe("Education");
    expect(c.desk_type).toBe("EDU_DBT");
    expect(c.ward_office_id).toBe("ward-14-counter-3");
    expect(c.required_documents).toEqual(["Aadhaar card", "Bonafide certificate"]);
    expect(c.staple_order[0]).toBe("1. Application form");
  });

  it("routes health departments to the health counter", () => {
    const c = computeCoverage({ ...BASE, department: "आरोग्य विभाग" }, SLUG);
    expect(c.desk_type).toBe("HEALTH");
    expect(c.ward_office_id).toBe("ward-14-counter-1");
  });

  it("flags unknown departments with the EDU_DBT fallback", () => {
    const c = computeCoverage({ ...BASE, department: "Mystery Dept XYZ" }, SLUG);
    expect(c.desk_fallback).toBe(true);
    const a = assertCoverage(BASE, { ...c, desk_fallback: true });
    expect(a.ok).toBe(false);
    expect(a.gaps).toContain("desk_type:fallback");
  });

  it("passes the required-column assertion for a complete profile", () => {
    const c = computeCoverage(BASE, SLUG);
    expect(assertCoverage(BASE, c)).toEqual({ ok: true, gaps: [] });
  });

  it("truncates a slug longer than 64 chars and records a coverage gap", () => {
    const long = "pmc-" + "a".repeat(90);
    const c = computeCoverage(BASE, long);
    expect(c.slug.length).toBeLessThanOrEqual(64);
    expect(c.slug_truncated).toBe(true);
    const a = assertCoverage(BASE, c);
    expect(a.gaps).toContain("slug:truncated");
    expect(a.ok).toBe(false);
  });
});
