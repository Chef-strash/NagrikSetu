import { describe, expect, it } from "vitest";
import {
  dateAppearsInSource,
  normaliseText,
  numberAppearsInSource,
} from "./normalise.js";

describe("normalise", () => {
  it("treats ₹10,000, Rs.10,000 and 10,000 as equal", () => {
    expect(normaliseText("₹10,000")).toBe(normaliseText("Rs.10,000"));
    expect(normaliseText("Rs. 10,000")).toBe(normaliseText("10,000"));
  });

  it("converts Devanagari digits", () => {
    expect(normaliseText("रु. १०,०००")).toContain("10000");
  });

  it("expands lakh forms", () => {
    expect(normaliseText("2 lakh")).toContain("200000");
    expect(normaliseText("2.5 lakhs")).toContain("250000");
    expect(normaliseText("२ लाख")).toContain("200000");
  });

  it("grounds numbers across format variance", () => {
    expect(numberAppearsInSource(10000, "First tranche Rs. 10,000")).toBe(true);
    expect(numberAppearsInSource(10000, "लाभ ₹१०,०००")).toBe(true);
    expect(numberAppearsInSource(15000, "First tranche Rs. 10,000")).toBe(false);
  });

  it("matches numbers on word boundaries (1500 must not match 15000)", () => {
    expect(numberAppearsInSource(1500, "Rs. 15000 for vendors")).toBe(false);
    expect(numberAppearsInSource(15000, "Rs. 15000 for vendors")).toBe(true);
    expect(numberAppearsInSource(1500, "Rs. 1,500 for vendors")).toBe(true);
    expect(numberAppearsInSource(100, "limit 1000")).toBe(false);
  });

  it("replaces the Marathi month मे only when it stands alone", () => {
    expect(normaliseText("31 मे 2026")).toContain("may");
    // The मे inside these words must be left untouched.
    expect(normaliseText("मेळावा")).not.toContain("may");
    expect(normaliseText("मेहनत")).not.toContain("may");
  });

  it("grounds Marathi month dates", () => {
    expect(dateAppearsInSource("31 ऑक्टोबर 2026", "अर्ज 31 October 2026 पर्यंत")).toBe(
      true,
    );
    expect(dateAppearsInSource("31 December 2026", "अर्ज 31 October 2026 पर्यंत")).toBe(
      false,
    );
  });
});
