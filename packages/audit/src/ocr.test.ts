/**
 * U5 test scenarios: skip a page whose text layer is already usable, return
 * text and confidence for a scan, and report a missing language directory
 * clearly instead of crashing.
 *
 * The tesseract.js engine is injectable (`engineFactory`), so everything except
 * the two live tests runs with no language data and no network. The live tests
 * run only with `AUDIT_TESSDATA_DIR` set to a directory of
 * `eng.traineddata` / `hin.traineddata` / `mar.traineddata` — see the README.
 */
import { describe, expect, it, vi } from "vitest";
import {
  OCR_LANGUAGES,
  createTesseractEngine,
  decodeDataUrl,
  degradationNotice,
  needsOcr,
  ocrPages,
  type OcrEngine,
  type OcrEngineOptions,
} from "./ocr.js";
import { prepareDocument, type AuditPage } from "./pages.js";
import { TEXT_PAGE, buildPdf } from "./testing/pdf.js";

const IMAGE_BYTES = Buffer.from("fake-png-bytes-for-the-fake-engine", "utf8");
const DATA_URL = `data:image/png;base64,${IMAGE_BYTES.toString("base64")}`;

function scanPage(page = 1): AuditPage {
  return { page, text: "", image: DATA_URL, notices: [] };
}

function textPage(text: string, page = 1): AuditPage {
  return { page, text, image: DATA_URL, notices: [] };
}

/** A fake engine that records what it was handed. */
function fakeEngine(
  recognise: (image: Buffer, page: number) => { text: string; confidence: number },
): { engine: OcrEngine; seen: Buffer[]; terminated: () => boolean } {
  const seen: Buffer[] = [];
  let terminated = false;
  return {
    seen,
    terminated: () => terminated,
    engine: {
      async recognize(image: Buffer, page: number) {
        seen.push(image);
        return recognise(image, page);
      },
      async terminate() {
        terminated = true;
      },
    },
  };
}

describe("decodeDataUrl", () => {
  it("returns the exact bytes the data URL carries", () => {
    expect(decodeDataUrl(DATA_URL).equals(IMAGE_BYTES)).toBe(true);
  });

  it("rejects something that is not a base64 data URL", () => {
    expect(() => decodeDataUrl("just a filename.png")).toThrow(/data URL/);
  });
});

describe("needsOcr", () => {
  it("skips a page whose text layer is real text", () => {
    expect(needsOcr(textPage(TEXT_PAGE))).toBe(false);
  });

  it("OCRs a scan page and a mojibake page", () => {
    expect(needsOcr(scanPage())).toBe(true);
    expect(needsOcr(textPage("Hkjdf Lkjhg Bnvcxz Qwrtp"))).toBe(true);
  });
});

describe("ocrPages", () => {
  it("OCRs a scan page and returns text plus confidence", async () => {
    const { engine, seen, terminated } = fakeEngine(() => ({
      text: "Sandip Ramchandra Kamble 1,80,000",
      confidence: 88,
    }));
    const result = await ocrPages([scanPage()], {
      engineFactory: async () => engine,
    });
    expect(result.degraded).toBe(false);
    expect(result.notices).toEqual([]);
    expect(result.languages).toBe(OCR_LANGUAGES);
    expect(result.pages[0]?.skipped).toBe(false);
    expect(result.pages[0]?.text).toContain("Sandip Ramchandra Kamble");
    expect(result.pages[0]?.confidence).toBe(88);
    expect(seen[0]?.equals(IMAGE_BYTES)).toBe(true);
    expect(terminated()).toBe(true);
  });

  it("does not send a page with a substantial text layer to OCR (U5 step 2)", async () => {
    const factory = vi.fn(async () => {
      throw new Error("must not be built");
    });
    const result = await ocrPages([textPage(TEXT_PAGE)], {
      engineFactory: factory,
    });
    expect(factory).not.toHaveBeenCalled();
    expect(result.degraded).toBe(false);
    expect(result.pages[0]?.skipped).toBe(true);
    expect(result.pages[0]?.skipReason).toBe("text layer is already usable");
  });

  it("skips a page with no image at all", async () => {
    const page: AuditPage = { page: 1, text: "", image: undefined, notices: [] };
    const result = await ocrPages([page], {
      engineFactory: async () => {
        throw new Error("must not be built");
      },
    });
    expect(result.degraded).toBe(false);
    expect(result.pages[0]?.skipReason).toBe("no page image to read");
  });

  it("degrades loudly when the language directory is missing, and never throws", async () => {
    const missingDir = "/nonexistent/tessdata-nagriksetu";
    const result = await ocrPages([scanPage()], {
      tessdataDir: missingDir,
      engineFactory: async (options: OcrEngineOptions) => {
        expect(options.tessdataDir).toBe(missingDir);
        expect(options.languages).toBe(OCR_LANGUAGES);
        throw new Error(
          `ENOENT: no such file or directory, open '${missingDir}/eng.traineddata'`,
        );
      },
    });
    expect(result.degraded).toBe(true);
    expect(result.pages[0]?.skipped).toBe(true);
    expect(result.pages[0]?.skipReason).toBe("OCR unavailable");
    expect(result.pages[0]?.text).toBe("");
    expect(result.notices).toHaveLength(1);
    expect(result.notices[0]).toContain("OCR unavailable (ENOENT");
    expect(result.notices[0]).toContain(missingDir);
    expect(result.notices[0]).toContain("cannot be cross-checked");
  });

  it("degrades when a recognise call fails midway, keeping pages already read", async () => {
    let calls = 0;
    const { engine, terminated } = fakeEngine(() => {
      calls += 1;
      if (calls === 2) throw new Error("wasm heap exhausted");
      return { text: "first page text", confidence: 70 };
    });
    const result = await ocrPages([scanPage(1), scanPage(2)], {
      engineFactory: async () => engine,
    });
    expect(result.degraded).toBe(true);
    expect(result.notices[0]).toContain("wasm heap exhausted");
    expect(result.pages[0]?.text).toBe("first page text");
    expect(result.pages[1]?.skipReason).toBe("OCR unavailable");
    expect(terminated()).toBe(true);
  });

  it("names the env var that would make OCR work offline", () => {
    const notice = degradationNotice(new Error("network unreachable"), {});
    expect(notice).toContain("AUDIT_TESSDATA_DIR");
    expect(notice).toContain("no network");
  });

  it("uses the cache directory it was given, never the working directory", async () => {
    const { engine } = fakeEngine(() => ({ text: "x", confidence: 1 }));
    const factory = vi.fn(async (options: OcrEngineOptions) => {
      expect(options.tessdataCacheDir).toBe("/tmp/nagriksetu-tessdata-test");
      return engine;
    });
    await ocrPages([scanPage()], {
      engineFactory: factory,
      tessdataCacheDir: "/tmp/nagriksetu-tessdata-test",
    });
    expect(factory).toHaveBeenCalledTimes(1);
  });
});

/**
 * Real tesseract.js, real language data, real rendered page. Skipped unless
 * `AUDIT_TESSDATA_DIR` points at a directory holding the three
 * `.traineddata` files, so `npm test` stays offline and fast by default.
 */
const tessdataDir = process.env["AUDIT_TESSDATA_DIR"];
const liveIt = tessdataDir ? it : it.skip;

describe("createTesseractEngine (live, needs AUDIT_TESSDATA_DIR)", () => {
  liveIt(
    "reads a rendered English page with eng+hin+mar loaded from disk",
    async () => {
      const doc = await prepareDocument(buildPdf([TEXT_PAGE]));
      const engine = await createTesseractEngine({
        languages: OCR_LANGUAGES,
        tessdataDir,
        tessdataCacheDir: `${tessdataDir}/cache`,
      });
      try {
        const image = decodeDataUrl(doc.pages[0]?.image as string);
        const { text, confidence } = await engine.recognize(image, 1);
        expect(text).toContain("Kamble");
        expect(text).toMatch(/180000|1,80,000/);
        expect(confidence).toBeGreaterThan(50);
      } finally {
        await engine.terminate();
      }
    },
    120_000,
  );

  liveIt(
    "runs through ocrPages end to end for a scan page",
    async () => {
      const doc = await prepareDocument(buildPdf([undefined]));
      const result = await ocrPages(doc.pages, { tessdataDir });
      expect(result.degraded).toBe(false);
      expect(result.pages[0]?.skipped).toBe(false);
    },
    120_000,
  );
});
