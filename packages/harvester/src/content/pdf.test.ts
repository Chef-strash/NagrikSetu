import { describe, expect, it } from "vitest";
import {
  createUnpdfReader,
  looksLikeRealText,
  readPdfPages,
  scanPagesToUserImages,
  textPagesToSourceText,
  type PdfReader,
} from "./pdf.js";

/**
 * Builds a minimal, valid single-page PDF (Helvetica text) without any native
 * dependency, so the real `createUnpdfReader` path can be exercised in-test.
 */
function buildSinglePagePdf(text: string): Uint8Array {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R " +
      "/Resources << /Font << /F1 5 0 R >> >> >>",
    (() => {
      const stream = `BT /F1 24 Tf 72 700 Td (${text}) Tj ET`;
      return `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    })(),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefPos}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

const reader: PdfReader = {
  pageCount: async () => 3,
  extractText: async (_pdf, page) =>
    page === 2 ? "   " : `Scheme eligibility condition number ${page} for street vendors`,
  renderPng: async (_pdf, page) => `data:image/png;base64,P${page}`,
};

describe("pdf content", () => {
  it("reads text pages and renders scan-only pages to userImages", async () => {
    const pdf = new Uint8Array([1, 2, 3]);
    const pages = await readPdfPages(pdf, reader);
    expect(pages[0]?.text).toContain("condition number 1");
    expect(pages[1]).toEqual({ page: 2, text: "", scanImage: "data:image/png;base64,P2" });
    expect(pages[2]?.text).toContain("condition number 3");
    expect(scanPagesToUserImages(pages)).toEqual(["data:image/png;base64,P2"]);
    const text = textPagesToSourceText(pages);
    expect(text).toContain("condition number 1");
    expect(text).not.toContain("data:image");
  });

  it("reads a real PDF buffer through the unpdf reader", async () => {
    const pdf = buildSinglePagePdf("Hello Harvester scheme for street vendors");
    const pages = await readPdfPages(pdf, createUnpdfReader());
    expect(pages).toHaveLength(1);
    expect(pages[0]?.text).toContain("Hello Harvester");
    expect(pages[0]?.scanImage).toBeUndefined();
    expect(textPagesToSourceText(pages)).toContain("[page 1]");
    expect(scanPagesToUserImages(pages)).toEqual([]);
  });

  it("treats a text-less page as a scan when renderPng is absent", async () => {
    const pdf = new Uint8Array([0]);
    const scanReader: PdfReader = {
      pageCount: async () => 1,
      extractText: async () => "   ",
    };
    const pages = await readPdfPages(pdf, scanReader);
    expect(pages).toEqual([{ page: 1, text: "" }]);
    expect(scanPagesToUserImages(pages)).toEqual([]);
  });
});

describe("looksLikeRealText (legacy-font / scan detection)", () => {
  it("accepts real English text", () => {
    expect(
      looksLikeRealText(
        "The target beneficiaries of the scheme are street vendors vending in urban areas before the implementation of the scheme.",
      ),
    ).toBe(true);
  });

  it("accepts real Devanagari (Marathi) text", () => {
    expect(
      looksLikeRealText(
        "पुण्यश्लोक अहिल्यादेवी होळकर शेतकरी कर्जमुक्ती योजना अंतर्गत लाभ देण्यात येत आहे.",
      ),
    ).toBe(true);
  });

  it("rejects legacy-font mojibake (real PMC circular output)", () => {
    // Verbatim from GAIP Deduction.pdf — garbage Latin, no Devanagari.
    expect(
      looksLikeRealText(
        "q-{rqftrr 3n5.r,raiffi gt q{rrrRqrF{r.r Efl\"F6 5.- q3lr\\q:ir I { o o fui+ - 991 o zl aorJr' qgE ffifi BrqErkr frsr frqqr qrffiq, T{tuft fiskt+.<t{rq-d.",
      ),
    ).toBe(false);
  });

  it("rejects the short/empty text of a true scan", () => {
    expect(looksLikeRealText("")).toBe(false);
    expect(looksLikeRealText("   ")).toBe(false);
  });
});


