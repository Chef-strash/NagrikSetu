/**
 * Schema-contract test (review fix 8). Guards the row we build against the
 * REAL `schemes` table in docs/SUPABASE_SETUP.sql + docs/migrations/002_schema_v2.sql,
 * so a live Supabase insert cannot fail on an unknown column, a missing
 * NOT-NULL column, or an explicit null into a NOT-NULL-with-default column.
 */
import { describe, expect, it } from "vitest";
import { buildSchemeRow } from "./apply.js";
import type { SchemeProfile } from "../schema/profile.js";

/** Columns of public.schemes after migration 002. */
const SCHEMES_COLUMNS = new Set<string>([
  "id", "slug", "ulb_code", "ulb_name", "department", "pillar", "category",
  "category_label", "scheme_code", "name", "vernacular_name", "description",
  "benefit_amount", "benefit_type", "grant_amount", "deadline",
  "application_deadline", "cutoff", "income_limit", "income_limit_formatted",
  "domicile_years", "resolution_no", "gazette_gr_number", "gazette_date",
  "source_url", "ward_office_id", "required_documents", "staple_order",
  "official_form_name", "official_form_url", "is_active", "embedding",
  "created_at", "updated_at",
  // added in 002:
  "desk_type", "name_i18n", "description_i18n", "cutoff_i18n", "window_opens_at",
  "verification_status", "last_verified_at", "source_hash", "source_doc_id",
  "eligibility_text", "eligibility_text_mr", "application_mode", "apply_url",
  "how_to_apply",
]);

/** NOT NULL with NO default -> the insert must provide a non-null value. */
const REQUIRED_NOT_NULL_NO_DEFAULT = ["slug", "scheme_code", "department", "name", "description"];

/** NOT NULL WITH a default -> the key must be OMITTED when unknown, never null. */
const NOT_NULL_WITH_DEFAULT = [
  "grant_amount", "benefit_type", "name_i18n", "description_i18n", "cutoff_i18n",
  "verification_status", "pillar", "category", "category_label",
  "required_documents", "staple_order", "is_active",
];

const profile: SchemeProfile = {
  name: "PM SVANidhi Street Vendor Loan",
  vernacular_name: "पंतप्रधान स्वनिधी योजना",
  department: "PMC Social Development Department",
  category: "livelihood",
  description: "Working-capital loans for street vendors in Pune.",
  eligibility_text: "Street vendor selling in Pune municipal limits.\nHolds a Vending Certificate or Identity Card.",
  benefit_amount: 15000,
  cutoff: "Street vendor with a vending certificate",
  source_url: "https://www.mohua.gov.in/static/uploads/2026/01/bde957bc3a87fb001c05ddd09484edda.pdf",
  documents: [
    { doc_key: "vendor_id", label_en: "Vending Certificate", is_required: true },
    { doc_key: "aadhaar", label_en: "Aadhaar Card", is_required: true },
  ],
};

describe("schemes row schema contract", () => {
  const built = buildSchemeRow(profile, { slug: "pmc-svanidhi-hawker" });

  it("every built-row key is a real public.schemes column", () => {
    for (const key of Object.keys(built.row)) {
      expect(SCHEMES_COLUMNS.has(key), `unknown column: ${key}`).toBe(true);
    }
  });

  it("every NOT-NULL-without-default column is present and non-null", () => {
    for (const col of REQUIRED_NOT_NULL_NO_DEFAULT) {
      expect(built.row[col], `missing ${col}`).toBeDefined();
      expect(built.row[col], `null ${col}`).not.toBeNull();
    }
  });

  it("NOT-NULL-with-default columns are omitted when unknown, never explicit null", () => {
    for (const col of NOT_NULL_WITH_DEFAULT) {
      if (col in built.row) {
        expect(built.row[col], `explicit null into ${col}`).not.toBeNull();
      }
    }
  });

  it("writes slug from the caller, benefit_amount as text, vernacular_name as { mr }", () => {
    expect(built.row["slug"]).toBe("pmc-svanidhi-hawker");
    expect(built.row["benefit_amount"]).toBe("Rs. 15,000");
    expect(built.row["vernacular_name"]).toEqual({ mr: "पंतप्रधान स्वनिधी योजना" });
  });

  it("omits ward_office_id unless a real UUID is supplied", () => {
    expect("ward_office_id" in built.row).toBe(false);
    const withWard = buildSchemeRow(profile, {
      slug: "pmc-svanidhi-hawker",
      wardOfficeId: "e1111111-1111-1111-1111-111111111111",
    });
    expect(withWard.row["ward_office_id"]).toBe("e1111111-1111-1111-1111-111111111111");
  });
});
