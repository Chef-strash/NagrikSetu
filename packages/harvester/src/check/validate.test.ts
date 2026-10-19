import { describe, expect, it } from "vitest";
import { validateProfile } from "./validate.js";

const BASE = {
  name: "PM SVANidhi Hawker Support",
  vernacular_name: "पीएम स्वनिधी विक्रेता सहाय्य",
  department: "Urban Livelihood Mission",
  category: "livelihood",
  description: "Working capital loan for street vendors.",
  eligibility_text: "Must be a street vendor\nMust hold a vending certificate",
  benefit_amount: 10000,
  source_url: "https://pmsvanidhi.mohua.gov.in/Home/Index",
  documents: [{ doc_key: "vending-cert", label_en: "Vending certificate", is_required: true }],
};

describe("validateProfile", () => {
  it("passes when every number appears in the cited source text", () => {
    const r = validateProfile(BASE, {
      sourceText: "First tranche Rs. 10,000 for vendors.",
    });
    expect(r.ok).toBe(true);
    expect(r.needsReview).toBe(false);
    expect(r.grounding).toBe("text");
    expect(r.profile).toBeDefined();
  });

  it("forces needs_review when a number is absent from the source", () => {
    const r = validateProfile(BASE, {
      sourceText: "First tranche Rs. 15,000 for vendors.",
    });
    // The profile is kept (row still written) but flagged needs_review.
    expect(r.ok).toBe(true);
    expect(r.needsReview).toBe(true);
    expect(r.issues.some((i) => i.includes("benefit_amount"))).toBe(true);
  });

  it("accepts a scan-only source via vision grounding but flags needs_review", () => {
    const r = validateProfile(BASE, { sourceText: null, scanOnly: true });
    expect(r.ok).toBe(true);
    expect(r.needsReview).toBe(true);
    expect(r.grounding).toBe("vision");
    expect(r.issues).toContain("grounding:vision");
  });

  it("never lets a Zod failure reach apply (no profile returned)", () => {
    const r = validateProfile(
      { ...BASE, eligibility_text: "line one\n\nline three" },
      { sourceText: "Rs. 10,000" },
    );
    expect(r.ok).toBe(false);
    expect(r.profile).toBeUndefined();
    expect(r.needsReview).toBe(true);
  });
});
