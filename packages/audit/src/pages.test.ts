/**
 * U4 test scenarios: magic-byte type detection, the 10 MB and 3-page caps, the
 * text / mojibake / scan routing, and "no file reaches the temp folder".
 *
 * PDFs come from `./testing/pdf.js`, which builds real PDFs byte by byte, so
 * the suite needs nothing from the untracked synthetic corpus on a clean
 * checkout.
 */
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AuditInputError, detectDocumentKind, prepareDocument } from "./pages.js";
import {
  JPEG_BYTES,
  MOJIBAKE_PAGE,
  PNG_BYTES,
  TEXT_PAGE,
  buildPdf,
} from "./testing/pdf.js";

describe("detectDocumentKind", () => {
  it("detects by magic bytes, not by file name", () => {
    expect(detectDocumentKind(buildPdf([undefined]))).toBe("pdf");
    expect(detectDocumentKind(JPEG_BYTES)).toBe("jpeg");
    expect(detectDocumentKind(PNG_BYTES)).toBe("png");
  });

  it("returns undefined for a text file that claims to be a PDF", () => {
    const textFile = new Uint8Array(Buffer.from("%!NOT-A-PDF\nhello world"));
    expect(detectDocumentKind(textFile)).toBeUndefined();
  });
});

describe("prepareDocument", () => {
  it("reads a text PDF: 1 page, real text kept, plus a rendered PNG", async () => {
    const doc = await prepareDocument(buildPdf([TEXT_PAGE]));
    expect(doc.kind).toBe("pdf");
    expect(doc.pagesRead).toBe(1);
    expect(doc.pagesTotal).toBe(1);
    expect(doc.truncated).toBe(false);
    expect(doc.pages[0]?.text).toContain("Sandip Ramchandra Kamble");
    expect(doc.pages[0]?.image?.startsWith("data:image/png;base64,")).toBe(true);
  }, 30_000);

  it("reads a scan PDF: 1 page, empty text, a PNG to read instead", async () => {
    const doc = await prepareDocument(buildPdf([undefined]));
    expect(doc.pagesRead).toBe(1);
    expect(doc.pages[0]?.text).toBe("");
    expect(doc.pages[0]?.image?.startsWith("data:image/png;base64,")).toBe(true);
  }, 30_000);

  it("routes legacy-font mojibake to the image path instead of gibberish text", async () => {
    const doc = await prepareDocument(buildPdf([MOJIBAKE_PAGE]));
    expect(doc.pages[0]?.text).toBe("");
    expect(doc.pages[0]?.image?.startsWith("data:image/png;base64,")).toBe(true);
  }, 30_000);

  it("caps a 5-page PDF at 3 pages and reports pages_read of pages_total", async () => {
    const doc = await prepareDocument(
      buildPdf([TEXT_PAGE, undefined, TEXT_PAGE, undefined, undefined]),
    );
    expect(doc.pagesRead).toBe(3);
    expect(doc.pagesTotal).toBe(5);
    expect(doc.truncated).toBe(true);
    expect(doc.pages.map((page) => page.page)).toEqual([1, 2, 3]);
  }, 60_000);

  it("passes a JPEG through as one image page with no reader at all", async () => {
    const doc = await prepareDocument(JPEG_BYTES);
    expect(doc.kind).toBe("jpeg");
    expect(doc.pagesRead).toBe(1);
    expect(doc.pagesTotal).toBe(1);
    expect(doc.pages[0]?.text).toBe("");
    expect(doc.pages[0]?.image?.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("rejects a text file renamed .pdf with a typed unsupported_type error", async () => {
    const renamed = new Uint8Array(Buffer.from("just some text, not a PDF"));
    await expect(prepareDocument(renamed)).rejects.toThrowError(AuditInputError);
    await expect(prepareDocument(renamed)).rejects.toMatchObject({
      code: "unsupported_type",
    });
  });

  it("rejects an 11 MB buffer with a typed oversize error", async () => {
    const oversize = new Uint8Array(11 * 1024 * 1024);
    oversize.set([0x25, 0x50, 0x44, 0x46]);
    await expect(prepareDocument(oversize)).rejects.toMatchObject({
      code: "oversize",
    });
  });

  it("rejects an empty buffer with a typed empty_input error", async () => {
    await expect(prepareDocument(new Uint8Array(0))).rejects.toMatchObject({
      code: "empty_input",
    });
  });

  it("writes nothing to the temp folder while reading and rendering", async () => {
    const scratch = await mkdtemp(join(tmpdir(), "audit-scratch-"));
    const previous = process.env["TMPDIR"];
    process.env["TMPDIR"] = scratch;
    try {
      await prepareDocument(buildPdf([TEXT_PAGE, undefined]));
      expect(await readdir(scratch)).toEqual([]);
    } finally {
      if (previous === undefined) delete process.env["TMPDIR"];
      else process.env["TMPDIR"] = previous;
      await rm(scratch, { recursive: true, force: true });
    }
  }, 30_000);
});

describe("prepareDocument with an injected reader", () => {
  it("counts pages without rendering when the reader has no renderer", async () => {
    const doc = await prepareDocument(buildPdf([TEXT_PAGE]), {
      reader: { pageCount: async () => 1, extractText: async () => "" },
    });
    expect(doc.pages[0]?.image).toBeUndefined();
    expect(doc.pages[0]?.notices.join(" ")).toContain("no renderer available");
  });
});
