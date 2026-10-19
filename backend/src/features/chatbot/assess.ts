// Deterministic eligibility *signal* for a scheme against known facts.
//
// This is guidance, not a decision. It compares the facts we have against the
// scheme's own eligibility_text and reports what matched and what is still
// unknown. It never blocks or grants; the verdict is a soft hint for ranking.

import type { SchemeRecord } from "../../core/schemes.ts";
import type { ApplicantFacts, Assessment } from "./types.ts";

const inr = (n: number): string => `Rs. ${n.toLocaleString("en-IN")}`;

export function assessScheme(
  scheme: SchemeRecord,
  facts: ApplicantFacts
): Assessment {
  const elig = scheme.eligibilityText.toLowerCase();
  const reasons: string[] = [];
  const missingFacts: string[] = [];
  const mismatches: string[] = [];
  let passed = 0;

  // Income ceiling
  if (scheme.incomeLimit != null) {
    if (facts.income != null) {
      if (facts.income <= scheme.incomeLimit) {
        passed += 1;
        reasons.push(`Income within the ${inr(scheme.incomeLimit)} ceiling`);
      } else {
        mismatches.push(`Income exceeds the ${inr(scheme.incomeLimit)} ceiling`);
      }
    } else {
      missingFacts.push("income");
    }
  }

  // Education level
  const mentionsSchoolLevel = /class\s*1[02]|ssc|hsc/.test(elig);
  if (mentionsSchoolLevel) {
    if (facts.classLevel === "12TH_PASS" && /class\s*12|hsc/.test(elig)) {
      passed += 1;
      reasons.push("Class 12 (HSC) requirement met");
    } else if (facts.classLevel === "10TH_PASS" && /class\s*10|ssc/.test(elig)) {
      passed += 1;
      reasons.push("Class 10 (SSC) requirement met");
    } else if (facts.classLevel != null) {
      mismatches.push("School level stated in the query may not match this scheme");
    } else {
      missingFacts.push("classLevel");
    }
  }

  // Girls-only schemes
  if (/\bgirl|female|women\b/.test(elig)) {
    if (facts.gender === "female") {
      passed += 1;
      reasons.push("Open to girl students");
    } else if (facts.gender == null) {
      missingFacts.push("gender");
    } else {
      mismatches.push("This scheme is for girl students");
    }
  }

  // Social category (informational)
  if (facts.category) {
    reasons.push(`Applicant category noted: ${facts.category}`);
  } else {
    missingFacts.push("category");
  }

  // Street vendors
  if (/vendor|hawker/.test(elig)) {
    if (facts.isStreetVendor) {
      passed += 1;
      reasons.push("Vendor criterion noted");
    } else {
      missingFacts.push("isStreetVendor");
    }
  }

  let verdict: Assessment["verdict"];
  if (mismatches.length > 0) {
    verdict = "possible_match";
  } else if (passed >= 2) {
    verdict = "likely_match";
  } else if (passed >= 1) {
    verdict = "possible_match";
  } else {
    verdict = "not_enough_information";
  }

  return {
    verdict,
    reasons: [...reasons, ...mismatches.map((m) => `Check: ${m}`)],
    missingFacts: [...new Set(missingFacts)]
  };
}