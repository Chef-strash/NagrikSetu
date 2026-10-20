/**
 * U7 test scenarios: grounding decides review, and the whole-response tests the
 * HTTP Contract promises stay honest.
 *
 * Grounding is per field and ordered text layer > OCR > model (R9). Masking is
 * deliberately not applied here — `verify/mask.ts` is the single choke point.
 */
import { describe, expect, it } from "vitest";
import type { AuditPage } from "../pages.js";
import { BUNDLED_BANK_MERGERS } from "./validators.js";
import {
  FLAG_KINDS,
  groundValue,
  matchesSource,
  numericRuns,
  verifyExtraction,
  visionOnlyFields,
  type AuditField,
  type AuditFlag,
  type RawField,
  type VerifyInput,
} from "./verify.js";

const NOW = new Date("2026-10-04T00:00:00Z");

function page(number: number, text: string): AuditPage {
  return { page: number, text, image: `data:image/png;base64,AAAA`, notices: [] };
}

function field(overrides: Partial<RawField> = {}): RawField {
  return {
    key: "name",
    label: "Name",
    value: "Sandip Ramchandra Kamble",
    normalized: "Sandip Ramchandra Kamble",
    type: "text",
    page: 1,
    handwritten: false,
    ...overrides,
  };
}

function verify(overrides: Partial<VerifyInput> = {}) {
  return verifyExtraction({
    fields: [],
    facts: {
      document_type_guess: "income_certificate",
      language: "en",
      issuer: "Pune Municipal Corporation",
      has_signature: true,
      has_seal: true,
    },
    pages: [page(1, "")],
    ocrText: new Map(),
    pagesRead: 1,
    pagesTotal: 1,
    model: "cline-pass/qwen3.7-plus",
    withheldPages: [],
    now: NOW,
    bankMergers: BUNDLED_BANK_MERGERS,
    ...overrides,
  });
}

function kindOf(
  response: { flags: ReadonlyArray<AuditFlag> },
  kind: string,
): AuditFlag | undefined {
  return response.flags.find((flag) => flag.kind === kind);
}

describe("groundValue", () => {
  it("grounds a value found in the text layer as text", () => {
    expect(
      groundValue(["Sandip Ramchandra Kamble"], {
        textLayer: "Name: Sandip Ramchandra Kamble",
        ocr: "",
      }),
    ).toBe("text");
  });

  it("grounds a value found only in OCR as ocr", () => {
    expect(
      groundValue(["180000"], {
        textLayer: "",
        ocr: "Annual income Rs. 1,80,000",
      }),
    ).toBe("ocr");
  });

  it("grounds a value no source carries as vision", () => {
    expect(
      groundValue(["Sandip Ramchandra Kamble"], { textLayer: "", ocr: "" }),
    ).toBe("vision");
  });

  it("prefers the text layer when both sources carry the value", () => {
    expect(
      groundValue(["Yerwada"], {
        textLayer: "Branch: Yerwada",
        ocr: "Branch Yerwada",
      }),
    ).toBe("text");
  });

  it("matches the corpus's Aadhaar grouping and Indian digit grouping", () => {
    expect(matchesSource("0123 4567 8901", "आधार क्रमांक 0123 4567 8901")).toBe(true);
    expect(matchesSource("180000", "1,80,000 रुपये")).toBe(true);
    expect(numericRuns("1,80,000")).toContain("180000");
  });

  it("does not let 1500 match a source holding only 15000", () => {
    expect(matchesSource("1500", "Income 15000")).toBe(false);
    expect(matchesSource("15000", "Income 15000")).toBe(true);
  });

  it("does not ground a name that is absent from both sources", () => {
    expect(matchesSource("Priya Kamble", "Name: Sandip Kamble")).toBe(false);
  });
});

describe("verifyExtraction: review decisions", () => {
  it("grounds per field and keeps an OCR-grounded document out of review", () => {
    const response = verify({
      fields: [
        field({ key: "name", value: "Sandip Ramchandra Kamble" }),
        field({
          key: "annual_income",
          label: "Annual income",
          value: "180000",
          normalized: "180000",
          type: "amount",
        }),
      ],
      pages: [page(1, "Name: Sandip Ramchandra Kamble")],
      ocrText: new Map([[1, "Annual income Rs. 1,80,000"]]),
    });
    expect(response.fields.map((entry) => entry.grounding)).toEqual(["text", "ocr"]);
    expect(response.needs_review).toBe(false);
    expect(visionOnlyFields(response)).toEqual([]);
  });

  it("forces needs_review when a value is only what the model saw", () => {
    const response = verify({
      fields: [field({ key: "issuer_name", value: "Ward Office Yerwada" })],
    });
    expect(response.fields[0]?.grounding).toBe("vision");
    expect(response.needs_review).toBe(true);
    expect(visionOnlyFields(response).map((entry) => entry.key)).toEqual([
      "issuer_name",
    ]);
  });

  it("forces needs_review for a handwritten value whatever its grounding", () => {
    const response = verify({
      fields: [field({ handwritten: true })],
      pages: [page(1, "Name: Sandip Ramchandra Kamble")],
    });
    const [entry] = response.fields as AuditField[];
    expect(entry?.grounding).toBe("text");
    expect(response.needs_review).toBe(true);
  });

  it("flags a document that recorded no fields at all", () => {
    const response = verify();
    expect(kindOf(response, FLAG_KINDS.agentFlagged)).toBeDefined();
    expect(response.needs_review).toBe(true);
  });

  it("keeps an agent-raised flag and marks the document for review", () => {
    const response = verify({
      agentFlags: [{ kind: "torn_page", detail: "Top-right corner is torn" }],
      fields: [field()],
      pages: [page(1, "Name: Sandip Ramchandra Kamble")],
    });
    expect(kindOf(response, "torn_page")?.detail).toContain("torn");
    expect(response.needs_review).toBe(true);
  });

  it("notes a withheld page image and puts the document in review (R12)", () => {
    const response = verify({
      fields: [field()],
      pages: [page(1, "Name: Sandip Ramchandra Kamble")],
      withheldPages: [1],
    });
    expect(response.needs_review).toBe(true);
    expect(response.notices.join(" ")).toContain("withheld from the model");
  });

  it("reports text-only mode in a notice", () => {
    const response = verify({
      fields: [field()],
      pages: [page(1, "Name: Sandip Ramchandra Kamble")],
      textOnly: true,
    });
    expect(response.notices.join(" ")).toContain("Text-only mode");
  });

  it("carries the contract's page counts and model through", () => {
    const response = verify({ pagesRead: 2, pagesTotal: 5 });
    expect(response.pages_read).toBe(2);
    expect(response.pages_total).toBe(5);
    expect(response.model).toBe("cline-pass/qwen3.7-plus");
  });
});

describe("verifyExtraction: each validator flag (R10)", () => {
  const flagsFor = (entry: RawField, facts: Partial<VerifyInput["facts"]> = {}) =>
    verify({
      fields: [entry],
      facts: {
        document_type_guess: "id_card",
        language: "en",
        issuer: "",
        has_signature: true,
        has_seal: true,
        ...facts,
      },
      pages: [page(1, entry.value)],
    });

  it("flags the corpus's Aadhaar-format number on its checksum rule", () => {
    const response = flagsFor(
      field({
        key: "id_number",
        label: "Aadhaar",
        value: "0123 4567 8901",
        normalized: "0123 4567 8901",
        type: "id_number",
      }),
    );
    const flag = kindOf(response, FLAG_KINDS.aadhaarChecksum);
    expect(flag?.field_key).toBe("id_number");
    expect(flag?.detail).toContain("first digit is 0");
  });

  it("does not flag a Verhoeff-valid Aadhaar", () => {
    const response = flagsFor(
      field({
        key: "id_number",
        value: "9341 0195 7774",
        normalized: "934101957774",
        type: "id_number",
      }),
    );
    expect(kindOf(response, FLAG_KINDS.aadhaarChecksum)).toBeUndefined();
  });

  it("flags the corpus's old Syndicate Bank IFSC as merged", () => {
    const response = flagsFor(
      field({
        key: "ifsc",
        label: "IFSC",
        value: "SYNB0000123",
        normalized: "SYNB0000123",
        type: "ifsc",
      }),
    );
    const flag = kindOf(response, FLAG_KINDS.ifscMergedBank);
    expect(flag?.detail).toContain("Syndicate Bank");
    expect(flag?.detail).toContain("Canara Bank");
    expect(kindOf(response, FLAG_KINDS.ifscFormat)).toBeUndefined();
  });

  it("does not flag an IFSC whose bank never merged", () => {
    const response = flagsFor(
      field({
        key: "ifsc",
        value: "XSPC0000123",
        normalized: "XSPC0000123",
        type: "ifsc",
      }),
    );
    expect(kindOf(response, FLAG_KINDS.ifscMergedBank)).toBeUndefined();
  });

  it("flags a malformed IFSC and a malformed PAN", () => {
    const ifsc = flagsFor(
      field({ key: "ifsc", value: "SBIN1000001", normalized: "SBIN1000001", type: "ifsc" }),
    );
    expect(kindOf(ifsc, FLAG_KINDS.ifscFormat)?.detail).toContain("SBIN1000001");
    const pan = flagsFor(
      field({ key: "pan", value: "ABCDE1234", normalized: "ABCDE1234", type: "pan" }),
    );
    expect(kindOf(pan, FLAG_KINDS.panFormat)).toBeDefined();
  });

  it("flags the corpus's expired validity date with days past", () => {
    const response = flagsFor(
      field({
        key: "valid_until",
        label: "Valid until",
        value: "2025-04-01",
        normalized: "2025-04-01",
        type: "date",
      }),
    );
    const flag = kindOf(response, FLAG_KINDS.validityExpired);
    expect(flag?.detail).toContain("2025-04-01");
    expect(flag?.detail).toMatch(/passed \d+ day\(s\) ago/);
  });

  it("does not flag a future validity date", () => {
    const response = flagsFor(
      field({
        key: "valid_until",
        value: "2027-06-11",
        normalized: "2027-06-11",
        type: "date",
      }),
    );
    expect(kindOf(response, FLAG_KINDS.validityExpired)).toBeUndefined();
  });

  it("flags the unsigned and unsealed corpus variant", () => {
    const response = flagsFor(field(), {
      has_signature: false,
      has_seal: false,
    });
    expect(kindOf(response, FLAG_KINDS.missingSignature)).toBeDefined();
    expect(kindOf(response, FLAG_KINDS.missingSeal)).toBeDefined();
    // Missing signature/seal is evidence, not a grounding doubt: no vision field
    // here, so review is driven by the agent flag path only.
    expect(kindOf(response, FLAG_KINDS.agentFlagged)).toBeUndefined();
  });

  it("raises nothing when the document is clean and grounded", () => {
    const response = verify({
      fields: [
        field({
          key: "valid_until",
          value: "2027-06-11",
          normalized: "2027-06-11",
          type: "date",
        }),
      ],
      pages: [page(1, "Valid until 2027-06-11")],
    });
    expect(response.flags).toEqual([]);
    expect(response.needs_review).toBe(false);
  });
});
