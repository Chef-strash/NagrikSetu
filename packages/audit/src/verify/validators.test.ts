/**
 * U7 test scenarios, code-side: each validator raises the flag it owns.
 *
 * The Aadhaar fixtures are the numbers the corpus uses (`0123 4567 8901`, whose
 * leading `0` the first-digit rule rejects) plus a Verhoeff-valid 12-digit
 * number, so the checksum test proves both verdicts rather than only the
 * rejection.
 */
import { describe, expect, it } from "vitest";
import {
  BUNDLED_BANK_MERGERS,
  bankPrefixOf,
  checkAadhaar,
  daysPast,
  digitsOf,
  findMergedBank,
  isAadhaarShaped,
  isIfscLike,
  isMalformedIfsc,
  isMalformedPan,
  isPanLike,
  isPastDate,
  isValidityKey,
  parseDateValue,
  verhoeffValid,
} from "./validators.js";

/** Verhoeff-valid, first digit 9 (starts the way a real Aadhaar may). */
const VALID_AADHAAR = "934101957774";
/** The corpus's ID-card number: 12 digits, but it starts with 0. */
const CORPUS_ID_NUMBER = "0123 4567 8901";

describe("verhoeffValid", () => {
  it("accepts a Verhoeff-valid number and rejects a transposed one", () => {
    expect(verhoeffValid(VALID_AADHAAR)).toBe(true);
    // One digit swapped: the checksum must notice.
    expect(verhoeffValid("934101957747")).toBe(false);
    expect(verhoeffValid("")).toBe(false);
  });
});

describe("checkAadhaar", () => {
  it("passes a 12-digit number whose first digit is 2-9 and checksum holds", () => {
    expect(checkAadhaar(VALID_AADHAAR)).toMatchObject({
      shaped: true,
      valid: true,
    });
  });

  it("rejects the corpus id_card number on its first digit", () => {
    const check = checkAadhaar(CORPUS_ID_NUMBER);
    expect(check.shaped).toBe(true);
    expect(check.valid).toBe(false);
    expect(check.reason).toContain("first digit is 0");
  });

  it("reports a checksum failure when the first digit is fine", () => {
    const check = checkAadhaar("934101957747");
    expect(check.valid).toBe(false);
    expect(check.reason).toBe("Verhoeff checksum failed");
  });

  it("does not call a 10-digit number Aadhaar-shaped", () => {
    expect(checkAadhaar("1234567890").shaped).toBe(false);
  });
});

describe("isAadhaarShaped / digitsOf", () => {
  it("accepts 4-4-4 grouping and Devanagari digits", () => {
    expect(isAadhaarShaped("9341 0195 7774")).toBe(true);
    expect(isAadhaarShaped("९३४१ ०१९५ ७७७४")).toBe(true);
    expect(digitsOf("९३४१ ०१९५ ७७७४")).toBe(VALID_AADHAAR);
  });

  it("rejects a 12-digit run glued to letters", () => {
    expect(isAadhaarShaped("AADHAAR-934101957774")).toBe(false);
  });
});

describe("PAN validators", () => {
  it("accepts AAAAA9999A and flags the common missing-letter form", () => {
    expect(isPanLike("ABCDE1234F")).toBe(true);
    expect(isMalformedPan("ABCDE1234F")).toBe(false);
    expect(isMalformedPan("ABCDE1234")).toBe(true);
    expect(isPanLike("abcde1234f")).toBe(true); // case-normalised
  });

  it("ignores values that are not PAN attempts at all", () => {
    expect(isPanLike("12345")).toBe(false);
    expect(isMalformedPan("Sandip Kamble")).toBe(false);
  });
});

describe("IFSC validators", () => {
  it("accepts AAAA0XXXXXX", () => {
    expect(isMalformedIfsc("XSPC0000123")).toBe(false);
    expect(isMalformedIfsc("SYNB0000123")).toBe(false);
  });

  it("flags an IFSC-shaped value whose fifth character is not 0", () => {
    expect(isIfscLike("SBIN1000001")).toBe(true);
    expect(isMalformedIfsc("SBIN1000001")).toBe(true);
  });

  it("ignores a branch name or a short code", () => {
    expect(isIfscLike("Yerwada")).toBe(false);
    expect(isMalformedIfsc("XSPC123")).toBe(false);
  });
});

describe("merged-bank lookup", () => {
  it("maps the corpus's old Syndicate Bank prefix to Canara Bank", () => {
    const merger = findMergedBank("SYNB0000123");
    expect(bankPrefixOf("SYNB0000123")).toBe("SYNB");
    expect(merger).toMatchObject({
      old_bank_name: "Syndicate Bank",
      new_bank_name: "Canara Bank",
      new_bank_code: "CNRB",
    });
  });

  it("returns nothing for a prefix that never merged", () => {
    expect(findMergedBank("XSPC0000123")).toBeUndefined();
  });

  it("accepts an injected merger list (Supabase when configured)", () => {
    expect(findMergedBank("XSPC0000123", BUNDLED_BANK_MERGERS)).toBeUndefined();
    expect(
      findMergedBank("XSPC0000123", [
        {
          old_bank_code: "XSPC",
          new_bank_code: "CNRB",
          old_bank_name: "Specimen Bank",
          new_bank_name: "Canara Bank",
          merged_on: "2021-01-01",
        },
      ]),
    ).toMatchObject({ new_bank_name: "Canara Bank" });
  });
});

describe("validity dates", () => {
  const now = new Date("2026-10-04T00:00:00Z");

  it("flags the corpus's expired certificate date", () => {
    expect(isValidityKey("valid_until")).toBe(true);
    expect(isValidityKey("expiry_date")).toBe(true);
    expect(isValidityKey("issue_date")).toBe(false);
    expect(isPastDate("2025-04-01", now)).toBe(true);
    expect(daysPast("2025-04-01", now)).toBeGreaterThan(500);
  });

  it("keeps a future date valid", () => {
    expect(isPastDate("2027-06-11", now)).toBe(false);
    expect(daysPast("2027-06-11", now)).toBe(0);
  });

  it("reads DD/MM/YYYY and Devanagari digits", () => {
    expect(parseDateValue("11/06/2027")?.toISOString()).toBe(
      "2027-06-11T00:00:00.000Z",
    );
    expect(parseDateValue("११/०६/२०२७")?.toISOString()).toBe(
      "2027-06-11T00:00:00.000Z",
    );
  });

  it("raises no flag for an unreadable or impossible date", () => {
    expect(isPastDate("not a date", now)).toBeUndefined();
    expect(parseDateValue("31/02/2027")).toBeUndefined();
    expect(isPastDate("31/02/2027", now)).toBeUndefined();
  });
});
