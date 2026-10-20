/**
 * Evaluation (R15, U8): score the pipeline over the synthetic corpus and
 * `ground_truth.json`.
 *
 * Three things about the corpus shape this module:
 * 1. **Reference values are unmasked.** Comparing them raw would score every
 *    ID/account field as a miss, so the reference is masked the same way the
 *    response was before anything is compared.
 * 2. **The defects are mixed.** `name_mismatch` and
 *    `income_above_typical_limit` belong to the deferred cross-document checks,
 *    so they are excluded from the pass condition instead of counted as misses
 *    (`DEFERRED_DEFECTS`).
 * 3. **121 files at 30-60 s per live call.** `limit` caps the number of runs
 *    and the report always prints the full-set expectation, so a green gate
 *    names the subset it actually scored.
 */
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { maskValue } from "@nagriksetu/documents";
import type { AuditConfig } from "./config.js";
import { runAudit, type AuditRunResult } from "./extract.js";
import { findUnmaskedPii } from "./verify/mask.js";
import {
  checkAadhaar,
  digitsOf,
  findMergedBank,
  isAadhaarShaped,
  isPastDate,
  type BankMerger,
} from "./verify/validators.js";
import { FLAG_KINDS, ACCOUNT_KEY_RE, type AuditResponse } from "./verify/verify.js";

/** Default subset size: 6 runs is roughly 3-6 minutes of live model calls. */
export const DEFAULT_EVAL_LIMIT = 6;

/** Deliberately excluded: deferred cross-document checks, not misses. */
export const DEFERRED_DEFECTS: readonly string[] = [
  "name_mismatch",
  "income_above_typical_limit",
];

/** Corpus defect name -> the flag kind(s) that satisfy it. */
export const DEFECT_FLAGS: Readonly<Record<string, readonly string[]>> = {
  expired: [FLAG_KINDS.validityExpired],
  missing_signature_and_seal: [
    FLAG_KINDS.missingSignature,
    FLAG_KINDS.missingSeal,
  ],
  ifsc_prefix_from_merged_bank: [FLAG_KINDS.ifscMergedBank],
};

export interface TruthEntry {
  kind: string;
  language: string;
  defects: string[];
  note?: string;
  truth: Record<string, unknown>;
  files: string[];
}

export type GroundTruth = Record<string, TruthEntry>;

/* -------------------------------------------------------------------------- */
/* Scoring                                                                    */
/* -------------------------------------------------------------------------- */

/** Compact a value for comparison: ASCII digits, lowercase, alphanumerics only. */
export function compactValue(value: string): string {
  return digitsOf(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097f]/g, "");
}

/**
 * Truth keys the response carries as a **document-level fact**, not as a field
 * (R8). The corpus writes `signed: true`, and the contract answers that with
 * `has_signature`; comparing it against `fields` would book a miss for a fact
 * the audit does report.
 */
export const DOCUMENT_FACT_KEYS: Readonly<
  Record<string, "has_signature" | "has_seal">
> = {
  signed: "has_signature",
  has_signature: "has_signature",
  has_seal: "has_seal",
};

/** Which variant a corpus file is: base, scan, phone or blur. */
export function variantOf(filename: string): string {
  const stem = filename.replace(/\.[a-z0-9]+$/i, "");
  const index = stem.indexOf("__");
  return index < 0 ? "base" : stem.slice(index + 2);
}

/** Expected values keyed by field key, with nested `fields` flattened. */
export function expectedValues(truth: Record<string, unknown>): Map<string, string> {
  const expected = new Map<string, string>();
  for (const [key, value] of Object.entries(truth)) {
    if (key === "fields" && value && typeof value === "object" && !Array.isArray(value)) {
      for (const [inner, innerValue] of Object.entries(value as Record<string, unknown>)) {
        const text = renderExpected(innerValue);
        if (text) expected.set(inner, text);
      }
      continue;
    }
    const text = renderExpected(value);
    if (text) expected.set(key, text);
  }
  return expected;
}

function renderExpected(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((entry) => String(entry)).join(" ");
  return String(value);
}

export interface CaseScore {
  correct: number;
  attempted: number;
  /** Keys the model did not record at all, or recorded differently. */
  wrong_keys: string[];
  missing_keys: string[];
}

/**
 * Score one response against one truth block, on the keys they share. The
 * reference is masked before comparison (see the module note), and only
 * non-empty reference values count toward the total — a blank form (all empty
 * strings) scores 0/0 rather than 0/n.
 */
export function scoreTruth(
  truth: Record<string, unknown>,
  response: AuditResponse,
  maskReference: (key: string, value: string) => string,
): CaseScore {
  const expected = expectedValues(truth);
  const byKey = new Map(
    response.fields.map((field) => [field.key, field] as const),
  );
  let correct = 0;
  const wrong: string[] = [];
  const missing: string[] = [];
  for (const [key, raw] of expected) {
    // A document-level fact (signature, seal) is answered by the response's own
    // facts, not by a field, so it is compared there and never masked.
    const factKey = DOCUMENT_FACT_KEYS[key];
    if (factKey !== undefined) {
      const actual = response[factKey];
      if (actual === null) {
        missing.push(key);
      } else if (String(actual) === raw.trim().toLowerCase()) {
        correct += 1;
      } else {
        wrong.push(key);
      }
      continue;
    }
    const reference = compactValue(maskReference(key, raw));
    const field = byKey.get(key);
    if (!field) {
      missing.push(key);
      continue;
    }
    const got = compactValue(field.normalized) || compactValue(field.value);
    const matches =
      got === reference ||
      // An address or a multi-word value may be split across fields.
      (reference.length > 3 && got.includes(reference)) ||
      (got.length > 3 && reference.includes(got));
    if (matches) correct += 1;
    else wrong.push(key);
  }
  return { correct, attempted: expected.size, wrong_keys: wrong, missing_keys: missing };
}

/** Flag kinds the corpus's own values require, independent of `defects`. */
export function expectedFlagKinds(
  entry: TruthEntry,
  options: { now: Date; mergers: readonly BankMerger[] },
): string[] {
  const kinds = new Set<string>();
  for (const defect of entry.defects) {
    for (const flag of DEFECT_FLAGS[defect] ?? []) kinds.add(flag);
  }
  for (const [key, value] of Object.entries(entry.truth)) {
    const text = renderExpected(value);
    if (!text) continue;
    // The corpus's `id_card_*` numbers start with 0, which the first-digit rule
    // rejects — those documents demonstrate the checksum flag (Success Criteria).
    // Account-shaped keys are excluded exactly as the verifier excludes them: a
    // 12-digit bank account is not an Aadhaar attempt, so expecting the flag
    // there would book a false miss.
    if (
      !ACCOUNT_KEY_RE.test(key) &&
      isAadhaarShaped(text) &&
      !checkAadhaar(text).valid
    ) {
      kinds.add(FLAG_KINDS.aadhaarChecksum);
    }
    if (/(valid|expiry|valid_until)/i.test(key) && isPastDate(text, options.now)) {
      kinds.add(FLAG_KINDS.validityExpired);
    }
    if (key === "signed" && value === false) kinds.add(FLAG_KINDS.missingSignature);
    if (key === "ifsc" && findMergedBank(text, options.mergers)) {
      kinds.add(FLAG_KINDS.ifscMergedBank);
    }
  }
  return [...kinds];
}

/* -------------------------------------------------------------------------- */
/* Running the corpus                                                         */
/* -------------------------------------------------------------------------- */

export interface EvalCaseResult {
  key: string;
  file: string;
  variant: string;
  status: "ok" | "error" | "skipped";
  error: string | undefined;
  correct: number;
  attempted: number;
  missing_keys: string[];
  wrong_keys: string[];
  expected_flags: string[];
  hit_flags: string[];
  missed_flags: string[];
  /** True when the response (and its stored form) carried no unmasked value. */
  masked: boolean;
  needs_review: boolean;
  durationMs: number;
}

export interface EvalReport {
  directory: string;
  cases: EvalCaseResult[];
  byVariant: Array<{
    variant: string;
    runs: number;
    correct: number;
    attempted: number;
    percent: number;
  }>;
  defects: Array<{
    defect: string;
    documents: number;
    hit: number;
    missed: number;
  }>;
  totals: {
    runs: number;
    ok: number;
    skipped: number;
    errors: number;
    correct: number;
    attempted: number;
    percent: number;
  };
  unmaskedRuns: number;
  limit: number | undefined;
  runtime: {
    totalMs: number;
    perRunMs: number;
    fullSetRuns: number;
    fullSetMinutes: number;
  };
  passed: boolean;
  failedReasons: string[];
}

export interface EvalOptions {
  config: AuditConfig;
  /** Max number of runs; the report still prints the full-set expectation. */
  limit?: number | undefined;
  mergers?: readonly BankMerger[] | undefined;
  now?: Date | undefined;
  /** Progress line sink (stderr in the CLI). */
  onProgress?: ((line: string) => void) | undefined;
  /** Injectable single-file runner: tests score hand-made results. */
  runFile?:
    | ((file: string, key: string) => Promise<{ result: AuditRunResult }>)
    | undefined;
}

/** Read `ground_truth.json` from the corpus directory. */
export function loadGroundTruth(directory: string): GroundTruth {
  const raw = readFileSync(join(directory, "ground_truth.json"), "utf8");
  const parsed = JSON.parse(raw) as GroundTruth;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("ground_truth.json is not an object");
  }
  return parsed;
}

/** One corpus file to run. */
export interface EvalTask {
  key: string;
  entry: TruthEntry;
  file: string;
}

/** Every task in a deterministic order: ground-truth key, then declared files. */
export function buildTasks(groundTruth: GroundTruth): EvalTask[] {
  return Object.entries(groundTruth).flatMap(([key, entry]) =>
    entry.files.map((file) => ({ key, entry, file })),
  );
}

function percent(correct: number, attempted: number): number {
  return attempted === 0 ? 0 : Math.round((correct / attempted) * 100);
}

/** Does this corpus file exist? A missing variant is skipped, never a crash. */
function exists(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Reference masking: the same function the response goes through (R11). */
export function maskReference(key: string, value: string): string {
  return maskValue(key, value);
}

/**
 * Score the corpus. Each run goes through the real pipeline (`runAudit`) unless
 * `runFile` is injected; a file absent from the corpus is reported as skipped,
 * not as a crash.
 */
export async function runEval(
  directory: string,
  options: EvalOptions,
): Promise<EvalReport> {
  const groundTruth = loadGroundTruth(directory);
  const allTasks = buildTasks(groundTruth);
  const limit = options.limit;
  const tasks =
    limit === undefined ? allTasks : allTasks.slice(0, Math.max(0, limit));
  const now = options.now ?? new Date();
  const mergers = options.mergers ?? [];
  const startedAt = Date.now();
  const cases: EvalCaseResult[] = [];
  const defectTally = new Map<string, { documents: number; hit: number }>();

  for (const task of tasks) {
    const variant = variantOf(task.file);
    const path = join(directory, task.file);
    const caseStarted = Date.now();
    if (!exists(path)) {
      cases.push(skippedCase(task, variant));
      options.onProgress?.(`skip ${task.file} (not in the corpus)`);
      continue;
    }
    try {
      let result: AuditRunResult;
      if (options.runFile) {
        result = (await options.runFile(path, task.key)).result;
      } else {
        result = await runAudit(
          {
            bytes: new Uint8Array(readFileSync(path)),
            sessionId: `eval-${task.key}`,
            documentId: task.file,
          },
          {
            config: options.config,
            now,
            ...(mergers.length > 0 ? { bankMergers: mergers } : {}),
          },
        );
      }
      const response = result.response;
      const score = scoreTruth(task.entry.truth, response, maskReference);
      const expected = expectedFlagKinds(task.entry, { now, mergers });
      const hit = expected.filter((kind) =>
        response.flags.some((flag) => flag.kind === kind),
      );
      const missed = expected.filter((kind) => !hit.includes(kind));
      for (const defect of task.entry.defects) {
        if (DEFERRED_DEFECTS.includes(defect)) continue;
        const kinds = DEFECT_FLAGS[defect] ?? [];
        const tally = defectTally.get(defect) ?? { documents: 0, hit: 0 };
        tally.documents += 1;
        if (kinds.some((kind) => hit.includes(kind))) tally.hit += 1;
        defectTally.set(defect, tally);
      }
      cases.push({
        key: task.key,
        file: task.file,
        variant,
        status: "ok",
        error: undefined,
        correct: score.correct,
        attempted: score.attempted,
        missing_keys: score.missing_keys,
        wrong_keys: score.wrong_keys,
        expected_flags: expected,
        hit_flags: hit,
        missed_flags: missed,
        masked: findUnmaskedPii(response).length === 0,
        needs_review: response.needs_review,
        durationMs: Date.now() - caseStarted,
      });
      options.onProgress?.(
        `${task.file} [${variant}] ${score.correct}/${score.attempted} fields, ` +
          `flags ${hit.length}/${expected.length}, review=${response.needs_review}`,
      );
    } catch (error) {
      cases.push({
        ...skippedCase(task, variant),
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        masked: false,
        needs_review: true,
        durationMs: Date.now() - caseStarted,
      });
      options.onProgress?.(
        `error ${task.file}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return summarise({
    directory,
    cases,
    allTasks,
    startedAt,
    limit,
    defectTally,
  });
}

function skippedCase(task: EvalTask, variant: string): EvalCaseResult {
  return {
    key: task.key,
    file: task.file,
    variant,
    status: "skipped",
    error: "file not present in the corpus",
    correct: 0,
    attempted: 0,
    missing_keys: [],
    wrong_keys: [],
    expected_flags: [],
    hit_flags: [],
    missed_flags: [],
    masked: true,
    needs_review: false,
    durationMs: 0,
  };
}

function summarise(input: {
  directory: string;
  cases: EvalCaseResult[];
  allTasks: EvalTask[];
  startedAt: number;
  limit: number | undefined;
  defectTally: Map<string, { documents: number; hit: number }>;
}): EvalReport {
  const { cases, allTasks, defectTally } = input;
  const scored = cases.filter((entry) => entry.status === "ok");
  const total = (pick: (entry: EvalCaseResult) => number): number =>
    scored.reduce((sum, entry) => sum + pick(entry), 0);
  const correct = total((entry) => entry.correct);
  const attempted = total((entry) => entry.attempted);
  const totalMs = Date.now() - input.startedAt;
  const perRunMs = scored.length > 0 ? totalMs / scored.length : 0;

  const byVariant = [...new Set(cases.map((entry) => entry.variant))]
    .sort()
    .map((variant) => {
      const subset = scored.filter((entry) => entry.variant === variant);
      const subsetCorrect = subset.reduce((sum, entry) => sum + entry.correct, 0);
      const subsetAttempted = subset.reduce((sum, entry) => sum + entry.attempted, 0);
      return {
        variant,
        runs: subset.length,
        correct: subsetCorrect,
        attempted: subsetAttempted,
        percent: percent(subsetCorrect, subsetAttempted),
      };
    });

  const defects = [...defectTally.entries()]
    .map(([defect, tally]) => ({
      defect,
      documents: tally.documents,
      hit: tally.hit,
      missed: tally.documents - tally.hit,
    }))
    .sort((a, b) => a.defect.localeCompare(b.defect));

  // Only runs that actually returned a payload can leak one. An errored run
  // produced no output at all (the caller gets an error, not data), so counting
  // it here would make a green masking gate meaningless — it is counted as an
  // error below instead.
  const unmaskedRuns = scored.filter((entry) => !entry.masked).length;
  const errored = cases.filter((entry) => entry.status === "error");
  const missedDefects = defects.filter((entry) => entry.missed > 0);
  const failedReasons: string[] = [];
  if (unmaskedRuns > 0) {
    failedReasons.push(`${unmaskedRuns} run(s) returned an unmasked number`);
  }
  if (missedDefects.length > 0) {
    failedReasons.push(
      `defects not flagged: ${missedDefects
        .map((entry) => `${entry.defect} (${entry.missed})`)
        .join(", ")}`,
    );
  }
  if (errored.length > 0) {
    failedReasons.push(`${errored.length} run(s) errored`);
  }
  if (attempted > 0 && correct / attempted < 0.5) {
    failedReasons.push(
      `field accuracy ${percent(correct, attempted)}% is below 50%`,
    );
  }

  return {
    directory: input.directory,
    cases,
    byVariant,
    defects,
    totals: {
      runs: cases.length,
      ok: scored.length,
      skipped: cases.filter((entry) => entry.status === "skipped").length,
      errors: errored.length,
      correct,
      attempted,
      percent: percent(correct, attempted),
    },
    unmaskedRuns,
    limit: input.limit,
    runtime: {
      totalMs,
      perRunMs,
      fullSetRuns: allTasks.length,
      fullSetMinutes: (perRunMs * allTasks.length) / 60_000,
    },
    passed: failedReasons.length === 0,
    failedReasons,
  };
}

/** Human-readable report: per-variant table, defects, then the pass/fail line. */
export function formatEvalReport(report: EvalReport): string {
  const lines: string[] = [];
  lines.push(`corpus: ${report.directory}`);
  lines.push(
    report.limit === undefined
      ? `runs: ${report.totals.runs} (whole corpus)`
      : `runs: ${report.totals.runs} of ${report.runtime.fullSetRuns} (--limit=${report.limit})`,
  );
  lines.push("");
  lines.push("variant   runs  fields   correct   percent");
  lines.push("-------   ----  ------   -------   -------");
  for (const variant of report.byVariant) {
    lines.push(
      `${variant.variant.padEnd(9)} ${String(variant.runs).padStart(4)}  ` +
        `${String(variant.attempted).padStart(6)}   ${String(variant.correct).padStart(7)}   ` +
        `${String(variant.percent).padStart(6)}%`,
    );
  }
  lines.push("");
  lines.push(
    `overall: ${report.totals.correct}/${report.totals.attempted} fields correct ` +
      `(${report.totals.percent}%), ${report.totals.ok} ok, ` +
      `${report.totals.skipped} skipped, ${report.totals.errors} errored`,
  );
  lines.push("");
  lines.push("defect flags (deferred cross-document checks excluded):");
  if (report.defects.length === 0) lines.push("  (none declared in this subset)");
  for (const defect of report.defects) {
    lines.push(
      `  ${defect.defect.padEnd(30)} ${defect.hit}/${defect.documents} flagged` +
        `${defect.missed > 0 ? `  MISSED ${defect.missed}` : ""}`,
    );
  }
  lines.push("");
  lines.push("per-document:");
  for (const entry of report.cases) {
    if (entry.status === "skipped") {
      lines.push(`  SKIP  ${entry.file} (${entry.error ?? "missing"})`);
      continue;
    }
    if (entry.status === "error") {
      lines.push(`  ERR   ${entry.file}: ${entry.error ?? "unknown error"}`);
      continue;
    }
    const bits = [
      `${entry.correct}/${entry.attempted}`,
      entry.missed_flags.length > 0
        ? `MISSED FLAGS ${entry.missed_flags.join(",")}`
        : `flags ${entry.hit_flags.join(",") || "-"}`,
      entry.needs_review ? "needs_review" : "confirmed",
      entry.masked ? "masked" : "UNMASKED!",
      `${entry.durationMs}ms`,
    ];
    lines.push(`  ok    ${entry.file}: ${bits.join(" | ")}`);
  }
  lines.push("");
  lines.push(
    `no unmasked numbers: ${report.unmaskedRuns === 0 ? "PASS" : `FAIL (${report.unmaskedRuns} run(s))`}`,
  );
  lines.push(
    `full set: ${report.runtime.fullSetRuns} runs at ${Math.round(report.runtime.perRunMs)}ms/run ` +
      `~ ${report.runtime.fullSetMinutes.toFixed(1)} minutes (measured over ${report.totals.ok} run(s))`,
  );
  lines.push(
    report.passed
      ? `RESULT: PASS (${report.totals.runs} run(s) scored)`
      : `RESULT: FAIL — ${report.failedReasons.join("; ")}`,
  );
  return lines.join("\n");
}
