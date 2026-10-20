/**
 * Extraction tools (U6 step 1) — three tools closing over **one in-memory draft
 * store**: `record_field`, `flag_issue` and `submit_extraction` (the last
 * carries `lifecycle.completesRun`, so `runAgentSession` treats its input as
 * the run's submission).
 *
 * R6/R7 are the point of this file: there is **no per-document-type schema**.
 * The agent records whatever fields the document actually contains, under
 * whatever keys fit; `SUGGESTED_FIELD_KEYS` is a naming convention offered in
 * the prompt so the same fact tends to get the same key across documents, and
 * an agent is free to invent a clear snake_case key for anything not on it.
 */
import { z } from "zod";
import { createTool } from "@nagriksetu/agents";
import { FIELD_TYPES, type FieldType } from "../verify/verify.js";

/** One field the agent recorded, before grounding. */
export interface DraftField {
  key: string;
  label: string;
  value: string;
  normalized: string;
  type: FieldType;
  page: number;
  handwritten: boolean;
}

/** One issue the agent noticed while reading (code-side flags come later). */
export interface DraftFlag {
  kind: string;
  detail: string;
  field_key?: string;
}

/** Document-level facts (R8), filled by `submit_extraction`. */
export interface DraftFacts {
  document_type_guess: string;
  language: string;
  issuer: string;
  has_signature: boolean | null;
  has_seal: boolean | null;
}

/** The single in-memory store all three tools write into. */
export interface ExtractionDraft {
  fields: DraftField[];
  flags: DraftFlag[];
  facts: DraftFacts;
  submitted: boolean;
}

export function createExtractionDraft(): ExtractionDraft {
  return {
    fields: [],
    flags: [],
    facts: {
      document_type_guess: "",
      language: "",
      issuer: "",
      has_signature: null,
      has_seal: null,
    },
    submitted: false,
  };
}

/**
 * Suggested key names (R7). Offering a list keeps the same fact under the same
 * key across documents — it is a *suggestion*, not a schema: nothing here is
 * enforced, and the prompt tells the agent to invent a clear snake_case key for
 * any fact this list does not cover.
 */
export const SUGGESTED_FIELD_KEYS: readonly string[] = [
  "certificate_no",
  "name",
  "name_mr",
  "father",
  "mother",
  "address",
  "dob",
  "gender",
  "age",
  "id_number",
  "account_no",
  "ifsc",
  "branch",
  "bank_name",
  "holder",
  "consumer_no",
  "billing_month",
  "amount",
  "annual_income",
  "issue_date",
  "valid_until",
  "signed",
  "category",
  "card_no",
  "card_type",
  "head",
  "members",
  "student",
  "cls",
  "academic_year",
  "gr_no",
  "vendor",
  "mobile",
  "patient",
  "hospital",
  "total",
  "course",
  "percentage",
  "documents_checked",
];

/** `First Name` / `certificate-no` / `सर्टिफिकेट क्रमांक` -> a stable snake_case key. */
export function normalizeFieldKey(raw: string): string {
  const ascii = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return ascii.length > 0 ? ascii : raw.trim();
}

/* -------------------------------------------------------------------------- */
/* Tool schemas                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `record_field`: every part of R6 — key, label and value as printed, a
 * normalised value, a type, the page, and whether it is handwritten.
 */
export const recordFieldSchema = z.object({
  key: z
    .string()
    .min(1)
    .describe(
      "snake_case key for this fact. Use a suggested key when it fits; invent a clear snake_case key otherwise.",
    ),
  label: z
    .string()
    .min(1)
    .describe("The label exactly as printed on the document, in its own language."),
  value: z.string().min(1).describe("The value exactly as printed on the document."),
  normalized: z
    .string()
    .min(1)
    .describe(
      "The value normalised for comparison: dates as YYYY-MM-DD, amounts as digits only, names kept as printed.",
    ),
  type: z.enum(FIELD_TYPES).describe("What kind of value this is."),
  page: z.number().int().min(1).describe("1-based page number the value is on."),
  handwritten: z
    .boolean()
    .describe("True when the value is written by hand rather than printed."),
});

export const flagIssueSchema = z.object({
  kind: z
    .string()
    .min(1)
    .describe("Short snake_case kind, e.g. missing_seal, torn_page, value_overwritten."),
  detail: z.string().min(1).describe("What you saw, in one sentence."),
  field_key: z
    .string()
    .min(1)
    .optional()
    .describe("The key of the field this issue concerns, when there is one."),
});

/**
 * `submit_extraction`: the document-level facts (R8). Carries
 * `lifecycle.completesRun`, which is how `runAgentSession` learns the run is
 * over and what was submitted.
 */
export const submitExtractionSchema = z.object({
  document_type_guess: z
    .string()
    .min(1)
    .describe(
      "Best guess at what this document is, e.g. income_certificate, bank_passbook, id_card, application_form.",
    ),
  language: z
    .string()
    .min(1)
    .describe("Language(s) the document is written in: en, mr, hi, or bi for bilingual."),
  issuer: z
    .string()
    .describe("The office or authority printed on the document, or an empty string."),
  has_signature: z
    .boolean()
    .optional()
    .describe(
      "True only if a signature is visible. False when the signature space is blank. Omit only if the page is unreadable.",
    ),
  has_seal: z
    .boolean()
    .optional()
    .describe(
      "True only if a seal or stamp is visible. False when there is none. Omit only if the page is unreadable.",
    ),
});

/* -------------------------------------------------------------------------- */
/* Tool construction                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Build the three extraction tools, each closing over `draft`. This is the only
 * supported construction path — there is no ambient store lookup.
 *
 * The tools also validate their own input before recording, so a rejected call
 * returns an `error` to the model instead of writing a half-formed field.
 */
export function makeExtractionTools(draft: ExtractionDraft) {
  const recordFieldTool = createTool({
    name: "record_field",
    description:
      "Record one field the document actually contains. Call once per field. Use the exact label and value as printed. Never record a value you cannot see.",
    inputSchema: recordFieldSchema,
    async execute(input: z.infer<typeof recordFieldSchema>) {
      const parsed = recordFieldSchema.safeParse(input);
      if (!parsed.success) {
        return { error: `record_field rejected: ${parsed.error.issues[0]?.message ?? "invalid input"}` };
      }
      const field: DraftField = {
        key: normalizeFieldKey(parsed.data.key),
        label: parsed.data.label.trim(),
        value: parsed.data.value.trim(),
        normalized: parsed.data.normalized.trim(),
        type: parsed.data.type,
        page: parsed.data.page,
        handwritten: parsed.data.handwritten,
      };
      draft.fields.push(field);
      return { recorded: draft.fields.length, key: field.key };
    },
  });

  const flagIssueTool = createTool({
    name: "flag_issue",
    description:
      "Flag a problem you can see on the document: a missing seal, a torn page, a value crossed out, a blurry region. Not for statutory rules — those are checked in code.",
    inputSchema: flagIssueSchema,
    async execute(input: z.infer<typeof flagIssueSchema>) {
      const parsed = flagIssueSchema.safeParse(input);
      if (!parsed.success) {
        return { error: `flag_issue rejected: ${parsed.error.issues[0]?.message ?? "invalid input"}` };
      }
      const flag: DraftFlag = {
        kind: normalizeFieldKey(parsed.data.kind),
        detail: parsed.data.detail.trim(),
      };
      if (parsed.data.field_key !== undefined) {
        flag.field_key = normalizeFieldKey(parsed.data.field_key);
      }
      draft.flags.push(flag);
      return { flagged: draft.flags.length, kind: flag.kind };
    },
  });

  const submitExtractionTool = createTool({
    name: "submit_extraction",
    description:
      "Submit the document-level facts and end the run. Call exactly once, after every field has been recorded.",
    inputSchema: submitExtractionSchema,
    lifecycle: { completesRun: true },
    async execute(input: z.infer<typeof submitExtractionSchema>) {
      const parsed = submitExtractionSchema.safeParse(input);
      if (!parsed.success) {
        return { error: `submit_extraction rejected: ${parsed.error.issues[0]?.message ?? "invalid input"}` };
      }
      draft.facts = {
        document_type_guess: normalizeFieldKey(parsed.data.document_type_guess),
        language: parsed.data.language.trim(),
        issuer: parsed.data.issuer.trim(),
        has_signature: parsed.data.has_signature ?? null,
        has_seal: parsed.data.has_seal ?? null,
      };
      draft.submitted = true;
      return { submitted: true, fields: draft.fields.length };
    },
  });

  return [recordFieldTool, flagIssueTool, submitExtractionTool];
}

/** The completion tool's name, used when reporting a run that never submitted. */
export const EXTRACTION_COMPLETION_TOOL = "submit_extraction";
