/**
 * Test-only PDF builder.
 *
 * The synthetic corpus is untracked, so the audit suite builds the PDFs it
 * needs, byte by byte, and stays self-contained on a clean checkout. These are
 * real PDFs: `unpdf` parses them and `@napi-rs/canvas` renders them.
 *
 * This module is compiled with the package (it imports nothing and writes
 * nothing), which keeps `tsc --noEmit` covering the fixtures too.
 */

/** Escape a PDF literal string. */
export function pdfString(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * Build a minimal, valid PDF: one page per entry, in order. `undefined` means
 * "no text layer" (what a scan looks like to a text extractor); a string means
 * a text layer holding exactly that text.
 */
export function buildPdf(pageTexts: Array<string | undefined>): Uint8Array {
  const pageCount = pageTexts.length;
  const fontObjNum = 3 + pageCount * 2;
  const offsets: number[] = [];
  let out = "%PDF-1.4\n";
  const push = (objNum: number, body: string): void => {
    offsets[objNum] = Buffer.byteLength(out, "latin1");
    out += `${objNum} 0 obj\n${body}\nendobj\n`;
  };

  const kids = pageTexts.map((_value, index) => `${3 + index * 2} 0 R`).join(" ");
  push(1, "<< /Type /Catalog /Pages 2 0 R >>");
  push(2, `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`);
  for (let index = 0; index < pageCount; index += 1) {
    const pageObj = 3 + index * 2;
    const contentObj = pageObj + 1;
    const text = pageTexts[index];
    const resources = `<< /Font << /F1 ${fontObjNum} 0 R >> >>`;
    const stream =
      text === undefined ? "" : `BT /F1 12 Tf 20 100 Td (${pdfString(text)}) Tj ET`;
    // The page box is deliberately wide: pdf.js clips extracted text to it, so
    // a narrow MediaBox silently truncates a long fixture line.
    push(
      pageObj,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1400 300] /Resources ${resources} /Contents ${contentObj} 0 R >>`,
    );
    push(
      contentObj,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  }
  push(fontObjNum, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const xrefOffset = Buffer.byteLength(out, "latin1");
  let xref = `xref\n0 ${fontObjNum + 1}\n0000000000 65535 f \n`;
  for (let objNum = 1; objNum <= fontObjNum; objNum += 1) {
    xref += `${String(offsets[objNum]).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${fontObjNum + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out + xref + trailer, "latin1"));
}

/** A page of dense, real English text, long enough to look like a document. */
export const TEXT_PAGE =
  "INCOME CERTIFICATE Sandip Ramchandra Kamble annual income 180000 valid until 2027-06-11";
/** No vowels and no Devanagari: the shape legacy-font mojibake has. */
export const MOJIBAKE_PAGE =
  "Hkjdf Lkjhg Bnvcxz Qwrtp Zxcvb Plmok Njiuh Bgyvt Fcdxs Wqazp";

/** A tiny but genuinely JPEG-magic buffer (not a decodable image). */
export const JPEG_BYTES = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);

/** The eight PNG magic bytes followed by a few payload bytes. */
export const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
