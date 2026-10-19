import { describe, expect, it, vi } from "vitest";
import {
  createUnpdfReader,
  looksLikeRealText,
  readPdfPages,
  scanPagesToUserImages,
  textPagesToSourceText,
  type PdfReader,
} from "./pdf.js";

/**
 * Builds a minimal, valid multi-page PDF (Helvetica text) without any native
 * dependency. An empty string produces a page with no content stream, i.e. a
 * blank page that routes to the image path.
 */
function buildPdf(pageTexts: string[]): Uint8Array {
  const fontRef = 3 + 2 * pageTexts.length;
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageTexts
      .map((_, i) => `${3 + 2 * i} 0 R`)
      .join(" ")}] /Count ${pageTexts.length} >>`,
  ];
  for (const [i, text] of pageTexts.entries()) {
    const contents = text ? ` /Contents ${4 + 2 * i} 0 R` : "";
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]${contents} ` +
        `/Resources << /Font << /F1 ${fontRef} 0 R >> >> >>`,
    );
    const stream = `BT /F1 24 Tf 72 700 Td (${text}) Tj ET`;
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

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

/** Three pages: text, blank, text. */
const mixedReader: PdfReader = {
  pageCount: async () => 3,
  extractText: async (_pdf, page) =>
    page === 2 ? "   " : `Scheme eligibility condition number ${page} for street vendors`,
  renderPng: async (_pdf, page) => `data:image/png;base64,P${page}`,
};

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

describe("readPdfPages", () => {
  it("reads text pages and renders scan-only pages to userImages", async () => {
    const pages = await readPdfPages(new Uint8Array([1, 2, 3]), mixedReader);
    expect(pages[0]?.text).toContain("condition number 1");
    expect(pages[1]).toEqual({
      page: 2,
      text: "",
      scanImage: "data:image/png;base64,P2",
    });
    expect(pages[2]?.text).toContain("condition number 3");
    expect(scanPagesToUserImages(pages)).toEqual(["data:image/png;base64,P2"]);
    const text = textPagesToSourceText(pages);
    expect(text).toContain("condition number 1");
    expect(text).toContain("[page 1]");
    expect(text).not.toContain("data:image");
  });

  it("treats a text-less page as a scan when renderPng is absent", async () => {
    const scanReader: PdfReader = {
      pageCount: async () => 1,
      extractText: async () => "   ",
    };
    expect(await readPdfPages(new Uint8Array([0]), scanReader)).toEqual([
      { page: 1, text: "" },
    ]);
  });

  it("caps pages BEFORE rendering (maxPages)", async () => {
    const rendered: number[] = [];
    const reader: PdfReader = {
      pageCount: async () => 5,
      extractText: async () => "   ", // every page is a scan
      renderPng: async (_pdf, page) => {
        rendered.push(page);
        return `data:image/png;base64,P${page}`;
      },
    };
    const pages = await readPdfPages(new Uint8Array([9]), reader, { maxPages: 3 });
    expect(pages.map((page) => page.page)).toEqual([1, 2, 3]);
    // The renderer never saw pages 4 and 5: the cap is applied to the loop.
    expect(rendered).toEqual([1, 2, 3]);
  });

  it("caps text pages without rendering them", async () => {
    const renderPng = vi.fn(async (_pdf: Uint8Array, page: number) => `P${page}`);
    const reader: PdfReader = {
      pageCount: async () => 5,
      extractText: async (_pdf, page) => `Eligibility condition number ${page} of the scheme`,
      renderPng,
    };
    const pages = await readPdfPages(new Uint8Array([9]), reader, { maxPages: 3 });
    expect(pages).toHaveLength(3);
    expect(renderPng).not.toHaveBeenCalled();
  });

  it("ignores a cap larger than the document; a zero cap produces nothing", async () => {
    const reader: PdfReader = {
      pageCount: async () => 3,
      extractText: async (_pdf, page) => `Eligibility condition number ${page} of the scheme`,
    };
    expect(await readPdfPages(new Uint8Array([1]), reader, { maxPages: 99 })).toHaveLength(3);
    expect(await readPdfPages(new Uint8Array([1]), reader, { maxPages: 0 })).toEqual([]);
  });

  it("reads a real PDF buffer through the unpdf reader", async () => {
    const pdf = buildPdf(["Hello Harvester scheme for street vendors"]);
    const pages = await readPdfPages(pdf, createUnpdfReader());
    expect(pages).toHaveLength(1);
    expect(pages[0]?.text).toContain("Hello Harvester");
    expect(pages[0]?.scanImage).toBeUndefined();
    expect(textPagesToSourceText(pages)).toContain("[page 1]");
    expect(scanPagesToUserImages(pages)).toEqual([]);
  });

  it("renders a blank page after text extraction without throwing (KTD5 buffer copy)", async () => {
    // Two pages: text then blank. The blank page forces the render path, which
    // needs a buffer that survived text extraction (unpdf transfers the bytes).
    const pdf = buildPdf([
      "Pune Municipal Corporation welfare scheme eligibility conditions for citizens",
      "",
    ]);
    const pages = await readPdfPages(pdf, createUnpdfReader(), { maxPages: 2 });
    expect(pages).toHaveLength(2);
    expect(pages[0]?.text).toContain("Pune Municipal Corporation");
    const scan = pages[1]?.scanImage;
    expect(scan?.startsWith("data:image/png;base64,")).toBe(true);
    expect((scan as string).length).toBeGreaterThan(100);
  });
});


  it("rejects the short/empty text of a true scan", () => {
    expect(looksLikeRealText("")).toBe(false);
    expect(looksLikeRealText("   ")).toBe(false);
  });
});
