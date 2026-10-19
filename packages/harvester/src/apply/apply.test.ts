import { describe, expect, it } from "vitest";
import { applyProfile, buildSchemeRow, createInMemoryDb, formatBenefitAmount } from "./apply.js";
import type { SchemeProfile } from "../schema/profile.js";
const BASE: SchemeProfile = { name: "Savitribai Phule Girls Scholarship", vernacular_name: "\u0938\u093e\u0935\u093f\u0924\u094d\u0930\u0940", department: "\u0936\u093f\u0915\u094d\u0937\u0923 \u0935\u093f\u092d\u093e\u0917", category: "education", description: "Scholarship.", eligibility_text: "Must be a girl student\nMust be a PMC resident", benefit_amount: 10000, source_url: "https://webadmin.pmc.gov.in/node/101", documents: [{ doc_key: "aadhaar", label_en: "Aadhaar card", is_required: true }] };
const SLUG = "pmc-savitribai-phule-girls-scholarship";
const OPTS = { slug: SLUG };
const WARD_UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const DOC_UUID = "de305d54-75b4-431b-adb2-eb6b9e546014";

describe("apply", () => {
  it("inserts on first run with provenance + docs", async () => {
    const db = createInMemoryDb();
    const r = await applyProfile(db, BASE, OPTS);
    expect(r.action).toBe("inserted");
    expect(r.slug).toBe(SLUG);
    expect(r.verification_status).toBe("verified");
    expect(r.events[0]?.change_type).toBe("created");
    const row = await db.getScheme(r.slug);
    expect(row?.["verification_status"]).toBe("verified");
    expect(row?.["source_url"]).toBe(BASE.source_url);
    expect(typeof row?.["last_verified_at"]).toBe("string");
    expect(typeof row?.["source_hash"]).toBe("string");
    expect(db.documents.get(r.slug)).toHaveLength(1);
  });
  it("no-ops on identical re-run with a verified event", async () => {
    const db = createInMemoryDb();
    const a = await applyProfile(db, BASE, OPTS);
    const n = db.events.length;
    const b = await applyProfile(db, BASE, OPTS);
    expect(b.action).toBe("noop");
    expect(b.events[0]?.change_type).toBe("verified");
    expect(db.events.length).toBe(n + 1);
    expect(a.sourceHash).toBe(b.sourceHash);
  });
  it("changed amount writes exactly one updated event with old/new", async () => {
    const db = createInMemoryDb();
    await applyProfile(db, BASE, OPTS);
    const r = await applyProfile(db, { ...BASE, benefit_amount: 15000 }, OPTS);
    expect(r.action).toBe("updated");
    const upd = r.events.filter((e) => e.change_type === "updated");
    expect(upd).toHaveLength(1);
    expect(upd[0]?.field).toBe("benefit_amount");
    expect(upd[0]?.old_value).toBe("Rs. 10,000");
    expect(upd[0]?.new_value).toBe("Rs. 15,000");
  });
  it("coverage gap forces needs_review + logged gaps", async () => {
    const db = createInMemoryDb();
    const r = await applyProfile(db, { ...BASE, department: "Mystery Dept XYZ" }, OPTS);
    expect(r.verification_status).toBe("needs_review");
    expect(r.coverageGaps).toContain("desk_type:fallback");
    expect((await db.getScheme(r.slug))?.["verification_status"]).toBe("needs_review");
  });
  it("dry-run diffs without writing", async () => {
    const db = createInMemoryDb();
    const r = await applyProfile(db, BASE, { ...OPTS, dryRun: true });
    expect(r.action).toBe("inserted");
    expect(await db.getScheme(r.slug)).toBeNull();
    expect(db.events).toHaveLength(0);
  });
  it("buildSchemeRow carries provenance columns for a real UUID source doc", () => {
    const b = buildSchemeRow(BASE, { ...OPTS, sourceDocId: DOC_UUID, wardOfficeId: WARD_UUID, nowIso: "2026-10-04T00:00:00.000Z" });
    expect(b.row["source_doc_id"]).toBe(DOC_UUID);
    expect(b.row["ward_office_id"]).toBe(WARD_UUID);
    expect(b.row["last_verified_at"]).toBe("2026-10-04T00:00:00.000Z");
  });
  it("writes benefit_amount as Indian-grouped text and vernacular_name as { mr }", () => {
    const b = buildSchemeRow(BASE, OPTS);
    expect(b.row["benefit_amount"]).toBe("Rs. 10,000");
    expect(b.row["vernacular_name"]).toEqual({ mr: BASE.vernacular_name });
    expect(formatBenefitAmount(100000)).toBe("Rs. 1,00,000");
  });
  it("omits unknown NOT NULL/DEFAULT columns instead of sending null", () => {
    const b = buildSchemeRow({ ...BASE, benefit_amount: null, grant_amount: null, benefit_type: null, name_i18n: null, description_i18n: null, cutoff: null }, OPTS);
    // Columns with a DB default/NOT NULL must be absent, never explicit null.
    for (const key of ["grant_amount", "benefit_type", "name_i18n", "description_i18n", "benefit_amount", "cutoff"]) {
      expect(Object.prototype.hasOwnProperty.call(b.row, key)).toBe(false);
    }
    // Required columns are always present.
    for (const key of ["slug", "scheme_code", "name", "department", "description", "is_active"]) {
      expect(b.row[key]).not.toBeUndefined();
    }
  });
  it("omits ward_office_id unless a real UUID is supplied", () => {
    const bad = buildSchemeRow(BASE, { ...OPTS, wardOfficeId: "ward-14-counter-3" });
    expect(Object.prototype.hasOwnProperty.call(bad.row, "ward_office_id")).toBe(false);
    const good = buildSchemeRow(BASE, { ...OPTS, wardOfficeId: WARD_UUID });
    expect(good.row["ward_office_id"]).toBe(WARD_UUID);
  });
  it("writes application_deadline only when the value parses as a date", () => {
    const invalid = buildSchemeRow({ ...BASE, application_deadline: "sometime soon" }, OPTS);
    expect(Object.prototype.hasOwnProperty.call(invalid.row, "application_deadline")).toBe(false);
    const valid = buildSchemeRow({ ...BASE, application_deadline: "October 31, 2026" }, OPTS);
    expect(typeof valid.row["application_deadline"]).toBe("string");
    // Converted to an ISO timestamp (exact offset depends on the host timezone).
    expect(Number.isNaN(Date.parse(String(valid.row["application_deadline"])))).toBe(false);
    expect(String(valid.row["application_deadline"])).toMatch(/^2026-10-3/);
  });
});

