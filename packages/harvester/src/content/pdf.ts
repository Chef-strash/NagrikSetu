/**
 * PDF content helpers — now the shared `@nagriksetu/documents` layer (KTD4).
 *
 * Contract (unchanged): text flows through the `read_source` tool; rendered
 * scan images feed `userImages` on the profiler turn — tools never return
 * images. Reading, rendering and the legacy-font (mojibake) detector live in
 * `@nagriksetu/documents`; this module only re-exports them so existing harvester
 * imports keep working. `readPdfPages` is called without `maxPages`, so all
 * pages are still read.
 */
export {
  createUnpdfReader,
  looksLikeRealText,
  readPdfPages,
  scanPagesToUserImages,
  textPagesToSourceText,
  type PdfPage,
  type PdfReader,
  type ReadPdfPagesOptions,
  type Uint8ArrayToPages,
} from "@nagriksetu/documents";
