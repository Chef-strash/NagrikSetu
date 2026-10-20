/**
 * U7/R11 test scenarios: masking happens last, and a whole response payload is
 * scanned for unmasked Aadhaar, account and PAN shapes — the check the plan's
 * Verification Contract calls "Masking".
 */
import { describe, expect, it } from "vitest";
import {
  containsSensitiveNumber,
  findUnmaskedPii,
  isMasked,
  maskAuditResponse,
  maskField,
  maskFlag,
} from "./mask.js";
import type { AuditResponse } from "./verify.js";

function response(overrides: Partial<AuditResponse> = {}): AuditResponse {
  return {
    document_type_guess: "bank_passbook",
    language: "en",
    issuer: "",
    has_signature: true,
    has_seal: true,
    pages_read: 1,
    pages_total: 1,
    needs_review: false,
    model: "cline-pass/qwen3.7-plus",
    fields: [],
    flags: [],
    notices: [],
    ...overrides,
  };
}

describe("maskAuditResponse", () => {
  it("masks Aadhaar to XXXX-XXXX-NNNN and account/PAN to the last four", () => {
    const masked = maskAuditResponse(
      response({
        fields: [
          {
            key: "id_number",
            label: "Aadhaar Number",
            value: "9341 0195 7774",
            normalized: "934101957774",
            type: "id_number",
            page: 1,
            handwritten: false,
            grounding: "text",
          },
          {
            key: "account_no",
            label: "Account No",
            value: "000123456789",
            normalized: "000123456789",
            type: "account_number",
            page: 1,
            handwritten: false,
            grounding: "text",
          },
          {
            key: "pan",
            label: "PAN",
            value: "ABCDE1234F",
            normalized: "ABCDE1234F",
            type: "pan",
            page: 1,
            handwritten: false,
            grounding: "text",
          },
        ],
      }),
    );
    const [id, account, pan] = masked.fields;
    expect(id?.value).toContain("7774");
    expect(id?.value).not.toContain("9341");
    expect(account?.value).not.toContain("000123456789");
    expect(account?.value.endsWith("6789")).toBe(true);
    // R11: a PAN keeps its last 4 *characters*, so the final letter survives.
    expect(pan?.value).toBe("XXXXXX234F");
    expect(findUnmaskedPii(masked)).toEqual([]);
  });

  it("masks a value that sits under an unexpected key (pattern-first)", () => {
    const field = maskField({
      key: "some_unexpected_key",
      label: "Reference",
      value: "0123 4567 8901",
      normalized: "012345678901",
      type: "other",
      page: 1,
      handwritten: false,
      grounding: "ocr",
    });
    expect(field.value).not.toContain("0123");
    expect(findUnmaskedPii(field)).toEqual([]);
  });

  it("masks flag details and notices, which may quote a value", () => {
    const masked = maskAuditResponse(
      response({
        flags: [
          {
            kind: "aadhaar_checksum",
            detail: "Aadhaar-style number 0123 4567 8901 is invalid",
          },
        ],
        notices: ["Compared against account 000123456789 on page 1"],
      }),
    );
    expect(masked.flags[0]?.detail).not.toContain("0123");
    expect(masked.notices[0]).not.toContain("000123456789");
    expect(findUnmaskedPii(masked)).toEqual([]);
  });

  it("masks a single flag without touching its kind", () => {
    const flag = maskFlag({
      kind: "ifsc_merged_bank",
      detail: "IFSC SYNB0000123 belongs to Syndicate Bank",
      field_key: "ifsc",
    });
    expect(flag.kind).toBe("ifsc_merged_bank");
    expect(flag.field_key).toBe("ifsc");
  });
});

describe("findUnmaskedPii", () => {
  it("finds an unmasked Aadhaar anywhere in a nested payload", () => {
    const findings = findUnmaskedPii(
      response({
        fields: [
          {
            key: "id_number",
            label: "ID",
            value: "934101957774",
            normalized: "934101957774",
            type: "id_number",
            page: 1,
            handwritten: false,
            grounding: "vision",
          },
        ],
      }),
    );
    // A 12-digit run is Aadhaar-shaped, so the value and its normalised twin are
    // both reported; the report itself must not carry the number.
    expect(findings.map((finding) => finding.path)).toEqual([
      "$.fields[0].value",
      "$.fields[0].normalized",
    ]);
    expect(findings.every((finding) => finding.kind === "aadhaar")).toBe(true);
    expect(findings[0]?.sample).toBe("XXXX-XXXX-7774");
  });

  it("finds an unmasked account number and an unmasked PAN", () => {
    expect(
      findUnmaskedPii({ nested: { account_no: "00012345678900" } })[0],
    ).toMatchObject({ kind: "account", path: "$.nested.account_no" });
    expect(findUnmaskedPii(["ABCDE1234F"])[0]).toMatchObject({
      kind: "pan",
      path: "$[0]",
    });
  });

  it("passes a properly masked payload", () => {
    expect(
      findUnmaskedPii({
        fields: [
          { key: "id_number", value: "XXXX-XXXX-7774" },
          { key: "account_no", value: "6789" },
          { key: "pan", value: "1234" },
        ],
      }),
    ).toEqual([]);
  });

  it("does not flag a short number, a year or a four-digit tail", () => {
    expect(findUnmaskedPii({ pages_read: 3, year: "2027", tail: "6789" })).toEqual([]);
    expect(findUnmaskedPii({ phone: "00000 00000" })).toEqual([]);
  });
});

describe("isMasked", () => {
  it("sees masked values as safe and unmasked ones as not", () => {
    expect(isMasked("XXXX-XXXX-7774")).toBe(true);
    expect(isMasked("6789")).toBe(true);
    expect(isMasked("934101957774")).toBe(false);
  });
});

describe("containsSensitiveNumber (R12)", () => {
  it("catches an Aadhaar-shaped number in a text layer", () => {
    expect(containsSensitiveNumber("Aadhaar 9341 0195 7774 issued")).toBe(true);
  });

  it("catches an Aadhaar-shaped number written in Devanagari digits", () => {
    expect(containsSensitiveNumber("आधार ९३४१ ०१९५ ७७७४")).toBe(true);
  });

  it("catches an account number and a PAN in OCR text", () => {
    expect(containsSensitiveNumber("A/C 000123456789")).toBe(true);
    expect(containsSensitiveNumber("PAN ABCDE1234F")).toBe(true);
  });

  it("leaves ordinary text alone", () => {
    expect(containsSensitiveNumber("Income Rs.1,80,000 for 2026")).toBe(false);
    expect(containsSensitiveNumber("")).toBe(false);
  });
});
