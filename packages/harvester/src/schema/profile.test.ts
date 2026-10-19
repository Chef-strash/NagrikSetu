import { describe, expect, it } from "vitest";
import { SchemeProfile } from "./profile.js";

const BASE = {
  name: "Maulana Azad Class 10 Scholarship",
  vernacular_name: "मौलाना आझाद इयत्ता १० वी शिष्यवृत्ती",
  department: "समाज विकास विभाग",
  category: "education",
  description: "Scholarship for Class 10 students.",
  eligibility_text: "Must be a PMC resident\nMust be in Class 10",
  source_url: "https://webadmin.pmc.gov.in/api/listing-api/circular/1",
  documents: [{ doc_key: "aadhaar", label_en: "Aadhaar card", is_required: true }],
} as const;

describe("SchemeProfile", () => {
  it("accepts a complete profile with one-condition-per-line eligibility", () => {
    const r = SchemeProfile.safeParse({ ...BASE });
    expect(r.success).toBe(true);
  });

  it("accepts unknown instead of a guess when the source states no amount", () => {
    const r = SchemeProfile.safeParse({
      ...BASE,
      benefit_amount: "unknown",
      income_limit: null,
      cutoff: "unknown",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.benefit_amount).toBe("unknown");
      expect(r.data.income_limit).toBeNull();
    }
  });

  it("rejects blank lines inside eligibility_text", () => {
    const r = SchemeProfile.safeParse({
      ...BASE,
      eligibility_text: "Must be a PMC resident\n\nMust be in Class 10",
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty eligibility_text", () => {
    const r = SchemeProfile.safeParse({ ...BASE, eligibility_text: "   " });
    expect(r.success).toBe(false);
  });

  it("preserves Marathi originals in vernacular_name", () => {
    const r = SchemeProfile.safeParse({ ...BASE });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.vernacular_name).toContain("मौलाना");
  });

  it("sets no defaults: optional facts stay undefined", () => {
    const r = SchemeProfile.safeParse({ ...BASE });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.benefit_amount).toBeUndefined();
      expect(r.data.income_limit).toBeUndefined();
      expect(r.data.deadline).toBeUndefined();
    }
  });

  it("requires at least one document", () => {
    const r = SchemeProfile.safeParse({ ...BASE, documents: [] });
    expect(r.success).toBe(false);
  });
});
