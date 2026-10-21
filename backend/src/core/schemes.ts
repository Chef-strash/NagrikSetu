// Scheme repository (shared domain data).
//
// Reads the `schemes` table through the shared read client (anon, RLS-enforced)
// and falls back to bundled fixtures so the API works offline. Used by any
// feature that needs scheme records (chatbot retrieval, feedback, and future
// features). Keep feature-specific logic out of this file.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getReadClient } from "./supabase.ts";

export interface SchemeRecord {
  id: string;
  slug: string;
  name: string;
  vernacularName: string | null;
  category: string;
  categoryLabel: string;
  pillar: string;
  department: string;
  description: string;
  benefitAmount: string | null;
  benefitType: string | null;
  incomeLimit: number | null;
  domicileYears: number | null;
  cutoff: string | null;
  deadline: string | null;
  eligibilityText: string;
  eligibilityTextMr: string | null;
  officialFormUrl: string | null;
  requiredDocuments: string[];
  isActive: boolean;
}

/** Short aliases so we can detect a scheme mentioned in free text. */
export const SCHEME_ALIASES: Record<string, string[]> = {
  "pmc-azad-class10": ["maulana azad", "abul kalam azad", "azad", "class 10", "ssc"],
  "pmc-sathe-class12": ["annabhau sathe", "sathe", "class 12", "hsc"],
  "pmc-savitribai-girls": ["savitribai", "savitribai phule", "girl students", "girls scheme"],
  "pmc-sgay-health": ["sgay", "shahari garib", "arogya", "health scheme", "hospital scheme"],
  "pmc-svanidhi-hawker": ["svanidhi", "pm svanidhi", "street vendor", "hawker"]
};

export const SCHEME_FIXTURES: SchemeRecord[] = [
  {
    id: "pmc-azad-class10",
    slug: "pmc-azad-class10",
    name: "Bharat Ratna Maulana Abul Kalam Azad Educational Assistance Scheme",
    vernacularName: "भारतरत्न मौलाना अबुल कलाम आझाद शैक्षणिक अर्थसहाय्य योजना",
    category: "education",
    categoryLabel: "Education Grants",
    pillar: "EDUCATION",
    department: "PMC Social Development Department",
    description:
      "Financial assistance for meritorious students who passed Class 10 (SSC) and are admitted to Junior College (Class 11) or a recognised diploma course within Pune municipal limits.",
    benefitAmount: "Rs. 15,000",
    benefitType: "One-time Direct Bank Transfer (DBT)",
    incomeLimit: 250000,
    domicileYears: 3,
    cutoff: "Minimum 80.00% in Class 10 SSC",
    deadline: "October 31, 2026",
    eligibilityText:
      "Passed Class 10 (SSC) and admitted to Class 11 or a recognised diploma course.\nMinimum 80% marks in Class 10 (open category).\nMinimum 70% for backward-class students of state-government or PMC-aided schools.\nMinimum 65% for children of waste-pickers, construction or unorganised workers.\nMinimum 45% for students with more than 40% disability.\nResident within Pune Municipal Corporation limits.\nBank account in a nationalised bank, linked to Aadhaar.",
    eligibilityTextMr: null,
    officialFormUrl: "https://dbt.pmc.gov.in/forms/maulana_azad_ssc.pdf",
    requiredDocuments: [
      "Attested copy of Class 10 (SSC) Marksheet",
      "Tahsildar Family Income Certificate (FY 2025-26)",
      "Student Bank Passbook Copy (with active IFSC)",
      "Student Aadhaar Card",
      "Current Year Junior College / Diploma Fee Receipt or Bonafide",
      "Proof of 3-Year Continuous Residence in Pune Municipal Limits",
      "Small Family Undertaking Declaration Form"
    ],
    isActive: true
  },
  {
    id: "pmc-sathe-class12",
    slug: "pmc-sathe-class12",
    name: "Lokshahir Annabhau Sathe Educational Assistance Scheme",
    vernacularName: "लोकशाहीर अण्णाभाऊ साठे शैक्षणिक अर्थसहाय्य योजना",
    category: "education",
    categoryLabel: "Education Grants",
    pillar: "EDUCATION",
    department: "PMC Social Development Department",
    description:
      "One-time cash assistance grant for Pune students who successfully cleared Class 12 (HSC) and have enrolled into higher degree programs (Engineering, Medical, Commerce, Science, Arts, IT).",
    benefitAmount: "Rs. 25,000",
    benefitType: "One-time Direct Bank Transfer (DBT)",
    incomeLimit: 250000,
    domicileYears: 3,
    cutoff: "Minimum 80.00% in Class 12 HSC",
    deadline: "October 31, 2026",
    eligibilityText:
      "Passed Class 12 (HSC) and admitted to a degree course.\nMinimum 80% marks in Class 12 (open category).\nMinimum 70% for backward-class students of state-government or PMC-aided schools.\nMinimum 65% for children of waste-pickers, construction or unorganised workers.\nMinimum 45% for students with more than 40% disability.\nResident within Pune Municipal Corporation limits.\nBank account in a nationalised bank, linked to Aadhaar.",
    eligibilityTextMr: null,
    officialFormUrl: "https://dbt.pmc.gov.in/forms/annabhau_sathe_hsc.pdf",
    requiredDocuments: [
      "Attested copy of Class 12 (HSC) Marksheet",
      "Degree College Bonafide Certificate or First Term Fee Receipt",
      "Tahsildar Family Income Certificate",
      "Student Bank Passbook Copy",
      "Student Aadhaar Card",
      "Proof of 3 Years Pune Domicile"
    ],
    isActive: true
  },
  {
    id: "pmc-savitribai-girls",
    slug: "pmc-savitribai-girls",
    name: "Krantijyoti Savitribai Phule Scheme for Girl Students",
    vernacularName: "क्रांतिज्योती सावित्रीबाई फुले योजना (मुलींसाठी)",
    category: "education",
    categoryLabel: "Education Grants",
    pillar: "EDUCATION",
    department: "PMC Social Development Department",
    description:
      "Financial assistance toward technical training, nursing diplomas, and computer certification fees for female students residing in Pune municipal corporation wards.",
    benefitAmount: "Rs. 10,000 to Rs. 20,000",
    benefitType: "Course fee reimbursement",
    incomeLimit: 250000,
    domicileYears: null,
    cutoff: "Girl student in an ITI / polytechnic / nursing / computer diploma course",
    deadline: "October 31, 2026",
    eligibilityText:
      "Girl student enrolled in an ITI, polytechnic, nursing or computer diploma course.\nFamily annual income under Rs. 2,50,000 (waived for orphans).\nResident within Pune Municipal Corporation limits.",
    eligibilityTextMr: null,
    officialFormUrl: null,
    requiredDocuments: [
      "Admission Fee Receipt from accredited Technical / ITI Institute",
      "Class 10 or 12 Marksheet Copy",
      "Tahsildar Income Certificate",
      "Student Bank Passbook Copy",
      "Student Aadhaar Card"
    ],
    isActive: true
  },
  {
    id: "pmc-sgay-health",
    slug: "pmc-sgay-health",
    name: "Shahari Garib Arogya Yojana (SGAY)",
    vernacularName: "शहरी गरीब आरोग्य योजना",
    category: "healthcare",
    categoryLabel: "Health & Hospital Care",
    pillar: "HEALTHCARE",
    department: "PMC Health Department",
    description:
      "Provides 100% free treatment at municipal civic hospitals and 50% direct concession on CGHS billing rates across 50+ empaneled private hospitals in Pune. Covers general inpatient hospitalization, nephrology dialysis, and chemotherapy.",
    benefitAmount: "Rs. 1,00,000 to Rs. 2,00,000",
    benefitType: "Hospital treatment cover",
    incomeLimit: 160000,
    domicileYears: 3,
    cutoff: "Family annual income below Rs. 1,60,000",
    deadline: "Open Round-the-Year (Annual Membership)",
    eligibilityText:
      "Family annual income below Rs. 1,60,000.\nResident within Pune Municipal Corporation limits.\nYellow or Orange ration card holder.\nAnnual membership renewal required.",
    eligibilityTextMr: null,
    officialFormUrl: "https://sgy.pmc.gov.in/forms/sgay_registration.pdf",
    requiredDocuments: [
      "Copy of Yellow (BPL) or Orange (APL Low-Income) Ration Card",
      "Tahsildar Family Income Certificate (Under Rs. 1,60,000)",
      "Head of Family and Patient Aadhaar Cards",
      "Proof of 3 Years Residence in PMC limits",
      "Doctor's Treatment Estimation Certificate / Admission Advice",
      "Two Passport Sized Photographs of Patient"
    ],
    isActive: true
  },
  {
    id: "pmc-svanidhi-hawker",
    slug: "pmc-svanidhi-hawker",
    name: "PM SVANidhi Urban Farm Produce & Vegetable Vendor Scheme",
    vernacularName: "पंतप्रधान स्वनिधी योजना (फेरीवाले)",
    category: "livelihood",
    categoryLabel: "Livelihood & Self-Employment",
    pillar: "AGRICULTURE_LIVELIHOOD",
    department: "PMC Urban Livelihood Department",
    description:
      "Working capital loan for local street vendors who sell fresh farm produce, fruits, vegetables, and dairy in Pune municipal weekly markets (Athawadi Bajar) and roadside haats. 1st tranche: Rs. 10,000; 2nd: Rs. 20,000; 3rd: Rs. 50,000.",
    benefitAmount: "Rs. 10,000 to Rs. 50,000",
    benefitType: "Working capital loan",
    incomeLimit: 200000,
    domicileYears: null,
    cutoff: "Street vendor with a vending certificate or ward survey listing",
    deadline: "Open Round-the-Year",
    eligibilityText:
      "Street vendor selling in Pune municipal limits (vegetables, fruit, flowers, produce, dairy).\nHolds a Vending Certificate or Identity Card, or appears in the ward vendor survey, or has a recommendation letter from the Town Vending Committee or ward office.\nNext loan tranche available after repaying the previous one.",
    eligibilityTextMr: null,
    officialFormUrl: "https://pmsvanidhi.mohua.gov.in/forms/vendor_application.pdf",
    requiredDocuments: [
      "Vendor Identification Card (Vending Certificate or Ward Survey Slip)",
      "Bank Passbook Copy with active UPI QR linkage",
      "Aadhaar Card Copy",
      "Recommendation Letter from Local Ward Hawkers Committee or Market Supervisor"
    ],
    isActive: true
  }
];

interface SchemeRow {
  id: string;
  slug: string;
  name: string;
  vernacular_name: { mr?: string } | null;
  category: string;
  category_label: string;
  pillar: string;
  department: string;
  description: string;
  benefit_amount: string | null;
  benefit_type: string | null;
  income_limit: number | string | null;
  domicile_years: number | null;
  cutoff: string | null;
  deadline: string | null;
  eligibility_text: string | null;
  eligibility_text_mr: string | null;
  official_form_url: string | null;
  required_documents: string[] | null;
  is_active: boolean;
}

const SELECT_COLUMNS =
  "id, slug, name, vernacular_name, category, category_label, pillar, department, description, benefit_amount, benefit_type, income_limit, domicile_years, cutoff, deadline, eligibility_text, eligibility_text_mr, official_form_url, required_documents, is_active";

function toRecord(row: SchemeRow): SchemeRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    vernacularName: row.vernacular_name?.mr ?? null,
    category: row.category,
    categoryLabel: row.category_label,
    pillar: row.pillar,
    department: row.department,
    description: row.description,
    benefitAmount: row.benefit_amount,
    benefitType: row.benefit_type,
    incomeLimit: row.income_limit == null ? null : Number(row.income_limit),
    domicileYears: row.domicile_years,
    cutoff: row.cutoff,
    deadline: row.deadline,
    eligibilityText: row.eligibility_text ?? "",
    eligibilityTextMr: row.eligibility_text_mr,
    officialFormUrl: row.official_form_url,
    requiredDocuments: row.required_documents ?? [],
    isActive: row.is_active
  };
}

/** Active schemes from the DB, or bundled fixtures when the DB is unavailable. */
export async function getActiveSchemes(): Promise<SchemeRecord[]> {
  const db: SupabaseClient | null = getReadClient();
  if (db) {
    try {
      const { data, error } = await db
        .from("schemes")
        .select(SELECT_COLUMNS)
        .eq("is_active", true);
      if (!error && data && data.length > 0) {
        return (data as unknown as SchemeRow[]).map(toRecord);
      }
    } catch {
      // fall through to fixtures
    }
  }
  return SCHEME_FIXTURES;
}

/** Slug of the first scheme whose alias appears in the text, or null. */
export function findSchemeSlug(text: string): string | null {
  const lower = text.toLowerCase();
  for (const slug of Object.keys(SCHEME_ALIASES)) {
    if (SCHEME_ALIASES[slug].some((alias) => lower.includes(alias))) return slug;
  }
  return null;
}