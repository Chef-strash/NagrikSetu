import { describe, expect, it } from "vitest";
import {
  maskAadhaar,
  maskAccount,
  maskFields,
  maskPan,
  maskText,
  maskValue,
  toAsciiDigits,
} from "./mask.js";

describe("maskText — Aadhaar (R11)", () => {
  it("masks a grouped Aadhaar keeping the last 4", () => {
    expect(maskText("1234 5678 9012")).toBe("XXXX-XXXX-9012");
  });

  it("masks hyphens and ungrouped 12-digit runs", () => {
    expect(maskText("1234-5678-9012")).toBe("XXXX-XXXX-9012");
    expect(maskText("aadhaar 123456789012 issued")).toBe(
      "aadhaar XXXX-XXXX-9012 issued",
    );
  });

  it("masks Devanagari digits", () => {
    expect(maskText("१२३४ ५६७८ ९०१२")).toBe("XXXX-XXXX-9012");
    expect(toAsciiDigits("०१२३४५६७८९")).toBe("0123456789");
  });

  it("leaves numbers that are not Aadhaar-shaped alone", () => {
    expect(maskText("1234 5678 901")).toBe("1234 5678 901");
    expect(maskText("12345678901234")).toBe("XXXXXXXXXX1234"); // 14 digits = account
  });
});

describe("maskText — PAN and account (R11)", () => {
  it("masks a PAN to its last 4 characters", () => {
    expect(maskText("ABCDE1234F")).toBe("XXXXXX234F");
    expect(maskPan("PAN ABCDE1234F of the applicant")).toBe(
      "PAN XXXXXX234F of the applicant",
    );
  });

  it("masks a 16-digit account keeping only the last 4", () => {
    const masked = maskText("1234567890123456");
    expect(masked).toBe("XXXXXXXXXXXX3456");
    expect(masked).not.toContain("123456789012");
    expect(masked).not.toContain("1234567890123");
  });

  it("masks an 18-digit account and a 9-digit account", () => {
    expect(maskAccount("123456789012345678")).toBe("XXXXXXXXXXXXXX5678");
    expect(maskAccount("123456789")).toBe("XXXXX6789");
  });
});

describe("maskText — values that merely contain digits", () => {
  it("does not mangle an amount", () => {
    expect(maskText("1,80,000")).toBe("1,80,000");
    expect(maskText("Income limit Rs 1,80,000 per year")).toBe(
      "Income limit Rs 1,80,000 per year",
    );
  });

  it("does not mangle an IFSC (7 digits, 4 letters)", () => {
    expect(maskText("HDFC0001234")).toBe("HDFC0001234");
    expect(maskText("IFSC: SBIN0001234")).toBe("IFSC: SBIN0001234");
  });

  it("does not mangle short numbers or a date", () => {
    expect(maskText("valid till 31/12/2027")).toBe("valid till 31/12/2027");
    expect(maskText("ward 14, page 7")).toBe("ward 14, page 7");
  });

  it("is idempotent", () => {
    const once = maskText("Aadhaar 1234 5678 9012 and PAN ABCDE1234F");
    expect(maskText(once)).toBe(once);
    expect(once).toBe("Aadhaar XXXX-XXXX-9012 and PAN XXXXXX234F");
  });
});

describe("maskValue — key rules on top of the pattern pass (KTD6)", () => {
  it("masks an Aadhaar-shaped value under an unrelated key", () => {
    expect(maskValue("remarks", "ref 1234 5678 9012")).toBe("ref XXXX-XXXX-9012");
  });

  it("masks a PAN-shaped value under an unrelated key", () => {
    expect(maskValue("notes", "ABCDE1234F")).toBe("XXXXXX234F");
  });

  it("masks an account-shaped value under an unrelated key", () => {
    expect(maskValue("notes", "1234567890123456")).toBe("XXXXXXXXXXXX3456");
  });

  it("applies the account key rule to a run the pattern pass would skip", () => {
    expect(maskValue("bank_account_number", "12345678")).toBe("XXXX5678");
    expect(maskValue("aadhaar_number", "12345")).toBe("X2345");
  });

  it("masks a malformed PAN under a PAN key", () => {
    expect(maskValue("pan_number", "ABCDE1234")).toBe("XXXXX1234");
  });

  it("still leaves plain amounts and IFSCs alone under a neutral key", () => {
    expect(maskValue("monthly_income", "1,80,000")).toBe("1,80,000");
    expect(maskValue("bank_ifsc", "HDFC0001234")).toBe("HDFC0001234");
  });

  it("maskFields masks a whole record", () => {
    expect(
      maskFields({
        holder_name: "R Sharma",
        aadhaar_number: "1234 5678 9012",
        bank_account: "1234567890123456",
        pan: "ABCDE1234F",
        amount: "1,80,000",
      }),
    ).toEqual({
      holder_name: "R Sharma",
      aadhaar_number: "XXXX-XXXX-9012",
      bank_account: "XXXXXXXXXXXX3456",
      pan: "XXXXXX234F",
      amount: "1,80,000",
    });
  });

  it("maskAadhaar only touches Aadhaar shapes", () => {
    expect(maskAadhaar("1234 5678 9012 and 1234567890123456")).toBe(
      "XXXX-XXXX-9012 and 1234567890123456",
    );
  });
});
