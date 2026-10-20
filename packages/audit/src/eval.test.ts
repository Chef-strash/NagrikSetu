/**
 * U8 test scenarios: scoring against `ground_truth.json` on masked references,
 * the pass/fail line for "no unmasked numbers", a missing variant reported as
 * skipped, and the full-set runtime expectation the subset run prints.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadAuditConfig, type AuditConfig } from "./config.js";
import {
  DEFAULT_EVAL_LIMIT,
  DEFERRED_DEFECTS,
  DOCUMENT_FACT_KEYS,
  buildTasks,
  compactValue,
  expectedFlagKinds,
  expectedValues,
  formatEvalReport,
  maskReference,
  runEval,
  variantOf,
  type GroundTruth,
  type TruthEntry,
} from "./eval.js";
import type { AuditRunResult } from "./extract.js";
import { BUNDLED_BANK_MERGERS } from "./verify/validators.js";
import type { AuditField, AuditResponse } from "./verify/verify.js";

const NOW = new Date("2026-10-04T00:00:00Z");

function config(): AuditConfig {
  return { ...loadAuditConfig({ AUDIT_API_KEY: "k" }), supabaseUrl: undefined };
}

function field(overrides: Partial<AuditField> = {}): AuditField {
  return {
    key: "name",
    label: "Name",
    value: "Sandip Ramchandra Kamble",
    normalized: "Sandip Ramchandra Kamble",
    type: "text",
    page: 1,
    handwritten: false,
    grounding: "text",
    ...overrides,
  };
}

function response(
  fields: AuditField[],
  flags: AuditResponse["flags"] = [],
  facts: Partial<AuditResponse> = {},
): AuditResponse {
  return {
    document_type_guess: "income_certificate",
    language: "en",
    issuer: "",
    has_signature: true,
    has_seal: true,
    pages_read: 1,
    pages_total: 1,
    needs_review: false,
    model: "cline-pass/glm-5.3",
    fields,
    flags,
    notices: [],
    ...facts,
  };
}

function result(payload: AuditResponse): AuditRunResult {
  return {
    response: payload,
    unmasked: [],
    meta: {
      sessionId: "s",
      documentId: "d",
      kind: "pdf",
      pagesRead: 1,
      pagesTotal: 1,
      truncated: false,
      providerId: "cline-pass",
      modelId: "cline-pass/glm-5.3",
      ocrLanguages: "",
      ocrDegraded: false,
      textOnly: false,
      withheldPages: [],
      durationMs: 5,
    },
  };
}

interface CaseFixture {
  key: string;
  truth: Record<string, unknown>;
  files: string[];
  defects?: string[];
}

/** A throwaway corpus: `ground_truth.json` plus the files it declares. */
async function corpus(cases: CaseFixture[], extra: { writeAll?: boolean } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "audit-eval-"));
  const groundTruth: GroundTruth = {};
  for (const entry of cases) {
    groundTruth[entry.key] = {
      kind: "income_certificate",
      language: "en",
      defects: entry.defects ?? [],
      truth: entry.truth,
      files: entry.files,
    } satisfies TruthEntry;
    for (const file of entry.files) {
      if (extra.writeAll === false) continue;
      await writeFile(join(directory, file), "x", "utf8");
    }
  }
  await writeFile(
    join(directory, "ground_truth.json"),
    JSON.stringify(groundTruth),
    "utf8",
  );
  return directory;
}

describe("scoring helpers", () => {
  it("reads the variant from a corpus file name", () => {
    expect(variantOf("income_certificate_en.pdf")).toBe("base");
    expect(variantOf("income_certificate_en__scan.jpg")).toBe("scan");
    expect(variantOf("id_card_father__blur.jpg")).toBe("blur");
    expect(variantOf("bank_passbook_en_old_ifsc__phone.jpg")).toBe("phone");
  });

  it("flattens the corpus's nested `fields` block", () => {
    const expected = expectedValues({
      certificate_no: "SPEC/INC/2026/000123",
      fields: { name: "Priya Sandip Kamble", ifsc: "XSPC0000123" },
      documents_checked: ["Income certificate", "Residence proof"],
    });
    expect([...expected.keys()]).toEqual([
      "certificate_no",
      "name",
      "ifsc",
      "documents_checked",
    ]);
    expect(compactValue("1,80,000")).toBe("180000");
  });

  it("masks the reference before it is compared (R11)", () => {
    // Raw comparison would score every ID and account field as a miss.
    expect(maskReference("account_no", "000123456789")).toBe("XXXX-XXXX-6789");
    expect(maskReference("id_number", "0123 4567 8901")).not.toContain("0123");
  });

  it("derives the flags the corpus's own values require", () => {
    const entry = {
      kind: "bank_passbook",
      language: "en",
      defects: ["ifsc_prefix_from_merged_bank", "expired"],
      truth: { ifsc: "SYNB0000123", valid_until: "2025-04-01", signed: false },
      files: [],
    } satisfies TruthEntry;
    const kinds = expectedFlagKinds(entry, { now: NOW, mergers: BUNDLED_BANK_MERGERS });
    expect(kinds).toContain("ifsc_merged_bank");
    expect(kinds).toContain("validity_expired");
    expect(kinds).toContain("missing_signature");
  });

  it("knows the corpus's id_card number fails its checksum rule", () => {
    const kinds = expectedFlagKinds(
      {
        kind: "id_card",
        language: "bi",
        defects: [],
        truth: { id_number: "0123 4567 8901" },
        files: [],
      },
      { now: NOW, mergers: BUNDLED_BANK_MERGERS },
    );
    expect(kinds).toContain("aadhaar_checksum");
  });

  it("does not expect an Aadhaar flag for a 12-digit bank account", () => {
    // The passbook's account number is 12 digits and fails the first-digit rule,
    // but the verifier skips the Aadhaar check for account keys on purpose, so
    // the expectation must match — otherwise the passbook books a false miss.
    const kinds = expectedFlagKinds(
      {
        kind: "bank_passbook",
        language: "en",
        defects: [],
        truth: { account_no: "000123456789" },
        files: [],
      },
      { now: NOW, mergers: BUNDLED_BANK_MERGERS },
    );
    expect(kinds).toEqual([]);
  });

  it("lists the deferred cross-document defects it will not count", () => {
    expect(DEFERRED_DEFECTS).toEqual(["name_mismatch", "income_above_typical_limit"]);
    expect(DEFAULT_EVAL_LIMIT).toBeGreaterThan(0);
  });

  it("maps the corpus's document-level truth keys onto the response's facts", () => {
    expect(DOCUMENT_FACT_KEYS["signed"]).toBe("has_signature");
  });

  it("builds one task per declared file", () => {
    const tasks = buildTasks({
      a: { kind: "k", language: "en", defects: [], truth: {}, files: ["a.pdf", "a__scan.jpg"] },
      b: { kind: "k", language: "en", defects: [], truth: {}, files: ["b.pdf"] },
    });
    expect(tasks.map((task) => task.file)).toEqual(["a.pdf", "a__scan.jpg", "b.pdf"]);
  });
});

describe("runEval", () => {
  it("scores 2 of 3 fields correct as 67%", async () => {
    const directory = await corpus([
      {
        key: "doc",
        truth: {
          name: "Sandip Ramchandra Kamble",
          dob: "1984-08-17",
          address: "Plot 7, Bhimnagar Vasahat, Yerwada, Pune - 411006",
        },
        files: ["doc.pdf"],
      },
    ]);
    try {
      const report = await runEval(directory, {
        config: config(),
        now: NOW,
        runFile: async () => ({
          result: result(
            response([
              field(),
              field({ key: "dob", label: "DOB", value: "1984-08-17", normalized: "1984-08-17" }),
              field({
                key: "address",
                label: "Address",
                value: "Somewhere else entirely",
                normalized: "Somewhere else entirely",
              }),
            ]),
          ),
        }),
      });
      expect(report.totals).toMatchObject({ runs: 1, ok: 1, correct: 2, attempted: 3 });
      expect(report.totals.percent).toBe(67);
      expect(report.cases[0]?.wrong_keys).toEqual(["address"]);
      expect(report.passed).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("counts an account field correct when the reference is masked first", async () => {
    const directory = await corpus([
      {
        key: "bank_passbook_en",
        truth: { account_no: "000123456789", ifsc: "XSPC0000123" },
        files: ["bank_passbook_en.pdf"],
      },
    ]);
    try {
      const report = await runEval(directory, {
        config: config(),
        now: NOW,
        runFile: async () => ({
          result: result(
            response([
              field({
                key: "account_no",
                label: "Account No",
                value: "XXXX-XXXX-6789",
                normalized: "XXXX-XXXX-6789",
                type: "account_number",
              }),
              field({
                key: "ifsc",
                label: "IFSC",
                value: "XSPC0000123",
                normalized: "XSPC0000123",
                type: "ifsc",
              }),
            ]),
          ),
        }),
      });
      expect(report.totals.percent).toBe(100);
      expect(report.passed).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("scores the corpus's `signed` key against the response's document facts", async () => {
    const directory = await corpus([
      {
        key: "income_certificate_en",
        truth: { certificate_no: "SPEC/INC/2026/000123", signed: true },
        files: ["doc.pdf"],
      },
    ]);
    try {
      const score = async (hasSignature: boolean) =>
        runEval(directory, {
          config: config(),
          now: NOW,
          runFile: async () => ({
            result: result(
              response(
                [
                  field({
                    key: "certificate_no",
                    label: "Certificate No.",
                    value: "SPEC/INC/2026/000123",
                    normalized: "SPEC/INC/2026/000123",
                    type: "id_number",
                  }),
                ],
                [],
                { has_signature: hasSignature },
              ),
            ),
          }),
        });
      const signed = await score(true);
      expect(signed.totals).toMatchObject({ correct: 2, attempted: 2, percent: 100 });
      expect(signed.cases[0]?.wrong_keys).toEqual([]);

      // An unsigned page must not be scored as if the fact were confirmed.
      const unsigned = await score(false);
      expect(unsigned.totals.percent).toBe(50);
      expect(unsigned.cases[0]?.wrong_keys).toEqual(["signed"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("fails the masking check when the response carries an unmasked number", async () => {
    const directory = await corpus([
      {
        key: "id_card_father",
        truth: { id_number: "0123 4567 8901" },
        files: ["id_card_father.pdf"],
      },
    ]);
    try {
      const report = await runEval(directory, {
        config: config(),
        now: NOW,
        runFile: async () => ({
          result: result(
            response([
              field({
                key: "id_number",
                label: "Aadhaar",
                value: "934101957774",
                normalized: "934101957774",
                type: "id_number",
              }),
            ]),
          ),
        }),
      });
      expect(report.unmaskedRuns).toBe(1);
      expect(report.passed).toBe(false);
      expect(report.failedReasons.join(" ")).toContain("unmasked number");
      const text = formatEvalReport(report);
      expect(text).toContain("no unmasked numbers: FAIL (1 run(s))");
      expect(text).toContain("RESULT: FAIL");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("reports a missing variant file as skipped, not a crash", async () => {
    const directory = await corpus(
      [
        {
          key: "doc",
          truth: { name: "Sandip Ramchandra Kamble" },
          files: ["doc.pdf", "doc__blur.jpg"],
        },
      ],
      { writeAll: false },
    );
    try {
      await writeFile(join(directory, "doc.pdf"), "x", "utf8");
      const report = await runEval(directory, {
        config: config(),
        now: NOW,
        runFile: async () => ({ result: result(response([field()])) }),
      });
      expect(report.cases.filter((entry) => entry.status === "skipped").map((entry) => entry.file)).toEqual([
        "doc__blur.jpg",
      ]);
      expect(report.totals).toMatchObject({ runs: 2, ok: 1, skipped: 1, errors: 0 });
      expect(formatEvalReport(report)).toContain("SKIP  doc__blur.jpg");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("records a run that throws as an error rather than losing the case", async () => {
    const directory = await corpus([
      { key: "doc", truth: { name: "Sandip Ramchandra Kamble" }, files: ["doc.pdf"] },
    ]);
    try {
      const report = await runEval(directory, {
        config: config(),
        now: NOW,
        runFile: async () => {
          throw new Error("model call failed");
        },
      });
      expect(report.totals.errors).toBe(1);
      expect(report.passed).toBe(false);
      expect(report.failedReasons.join(" ")).toContain("1 run(s) errored");
      expect(report.cases[0]?.error).toContain("model call failed");
      // An errored run returned no payload, so it is not a masking failure: the
      // gate must stay meaningful, and the error is reported on its own.
      expect(report.unmaskedRuns).toBe(0);
      expect(report.failedReasons.join(" ")).not.toContain("unmasked number");
      expect(formatEvalReport(report)).toContain("no unmasked numbers: PASS");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
