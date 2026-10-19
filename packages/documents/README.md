# @nagriksetu/documents

The shared document layer: PDF text reading, page rendering to PNG,
detection of unusable (legacy-font) text, and PII masking. `unpdf` and
`@napi-rs/canvas` are dependencies *here*, so the harvester and the citizen
document audit do not each carry their own PDF reader.

## Exports

| Module | What it gives you |
| :--- | :--- |
| `pdf.ts` | `PdfPage`, `PdfReader`, `createUnpdfReader`, `looksLikeRealText`, `readPdfPages`, `scanPagesToUserImages`, `textPagesToSourceText` |
| `mask.ts` | `maskText`, `maskValue`, `maskFields`, `maskAadhaar`, `maskPan`, `maskAccount`, `toAsciiDigits` |

## Reading a PDF

```ts
import { createUnpdfReader, readPdfPages, scanPagesToUserImages } from "@nagriksetu/documents";

const reader = createUnpdfReader();
const pages = await readPdfPages(buffer, reader, { maxPages: 3 });
// -> [{ page: 1, text: "..." }, { page: 2, text: "", scanImage: "data:image/png;base64,..." }]
const images = scanPagesToUserImages(pages); // what rides `userImages` on the agent turn
```

`readPdfPages` keeps a page whose text is real, and rasterises a page whose text
layer is empty *or* is legacy-font mojibake (`looksLikeRealText`). A page with
no usable text and no renderer stays as `{ page, text: "" }`.

**`maxPages` is applied before the render loop**, not to the result. A caller
that wants three pages out of a 10 MB scan gets three rasterised pages, not
ten: rendering costs roughly 0.5 s and 1.9 MB of base64 per scanned page.
Omitted, non-finite or larger-than-the-document values mean "all pages"; `0`
returns no pages.

**Two renderings need two buffers.** `unpdf` transfers the bytes to the
pdfjs worker during text extraction, detaching the caller's `Uint8Array`, so
`createUnpdfReader().renderPng` renders from an independent copy. Without it
you get a `DataCloneError` — this is the fix already proven in
`packages/harvester/src/content/pdf.ts`, and
`src/pdf.test.ts` renders a blank page after extracting text from page 1 to
keep it proven.

## Masking — pattern-first, value-second

```ts
maskText("Aadhaar 1234 5678 9012, PAN ABCDE1234F");
// "Aadhaar XXXX-XXXX-9012, PAN XXXXXX234F"

maskValue("bank_account_number", "12345678"); // "XXXX5678"
maskValue("remarks", "ref 1234 5678 9012");   // "ref XXXX-XXXX-9012"
```

| Shape | Matches | Result |
| :--- | :--- | :--- |
| Aadhaar | 12 digits, grouped `4-4-4` with spaces/hyphens or ungrouped, ASCII or Devanagari digits | `XXXX-XXXX-1234` |
| PAN | `[A-Z]{5}[0-9]{4}[A-Z]` | last 4 kept, rest `X` (`XXXXXX234F`) |
| Account | 9-18 consecutive digits | last 4 kept, rest `X` (`XXXXXXXXXXXX3456`) |

Order inside `maskText`: Aadhaar (most specific), then PAN, then account. The
rules are bounded on both sides, so a 16-digit account is never mistaken for an
Aadhaar, and `maskText` is idempotent.

**Values that merely contain digits are left alone.** `1,80,000` (an amount)
and `HDFC0001234` (an IFSC, seven digits) pass through unchanged — the account
rule needs nine or more consecutive digits.

**The key never decides *whether* to mask, only how much more to mask**
(`maskValue(key, value)`): the pattern pass runs first, so an Aadhaar-shaped
number under `remarks` is still masked; the key pass then applies relaxed
thresholds for identity field names (`aadhaar_number`, `pan_number`,
`bank_account`, `khata`, `passbook`), catching short or malformed values the
shape rules would skip. IFSC keys are exempt from the key pass on purpose:
mangling an IFSC would break the format and merged-bank-prefix checks.

**Known limits.** Masking is pattern matching, not authentication. A number
split across lines or written with unusual separators is not detected, and the
account rule deliberately errs toward masking, so a bare 10-digit mobile number
masks as an account. There is no Aadhaar checksum here — that belongs to the
audit's validators.

## Commands

```bash
npm run build      # tsc -p tsconfig.json
npm test           # vitest run
npx tsc --noEmit   # type check
```
