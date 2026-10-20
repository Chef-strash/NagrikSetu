import test from "node:test";
import assert from "node:assert/strict";
import { MAX_UPLOAD_BYTES, formatBytes, validateUpload } from "./upload.ts";

test("accepts a scanned PDF and a phone photo", () => {
  assert.deepEqual(validateUpload({ name: "marksheet.pdf", size: 240_000, type: "application/pdf" }), {
    ok: true
  });
  assert.deepEqual(validateUpload({ name: "passbook.jpg", size: 1_200_000, type: "image/jpeg" }), {
    ok: true
  });
});

test("accepts a camera capture when the browser reports no MIME type", () => {
  const verdict = validateUpload({ name: "IMG_4821.jpeg", size: 900_000, type: "" });
  assert.equal(verdict.ok, true);
});

test("rejects an unsupported file type", () => {
  const verdict = validateUpload({ name: "installer.exe", size: 1000, type: "application/x-msdownload" });
  assert.equal(verdict.ok, false);
  assert.match(verdict.error ?? "", /must be a PDF or an image/);
});

test("rejects a file larger than 5 MB", () => {
  const verdict = validateUpload({ name: "huge.pdf", size: MAX_UPLOAD_BYTES + 1, type: "application/pdf" });
  assert.equal(verdict.ok, false);
  assert.match(verdict.error ?? "", /larger than 5 MB/);
});

test("rejects an empty file", () => {
  const verdict = validateUpload({ name: "empty.pdf", size: 0, type: "application/pdf" });
  assert.equal(verdict.ok, false);
  assert.match(verdict.error ?? "", /looks empty/);
});

test("names the offending file in the error so the citizen knows which one", () => {
  const verdict = validateUpload({ name: "wrong.docx", size: 500, type: "application/msword" });
  assert.match(verdict.error ?? "", /wrong\.docx/);
});

test("formats bytes for the file chip", () => {
  assert.equal(formatBytes(0), "0 KB");
  assert.equal(formatBytes(2048), "2 KB");
  assert.equal(formatBytes(3 * 1024 * 1024), "3.0 MB");
});
