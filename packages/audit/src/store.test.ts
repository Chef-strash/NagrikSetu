/**
 * U7 test scenarios for the masked-result store (R14, KTD8): only the masked
 * record is written, a leaking record is refused, and the merged-bank lookup
 * falls back to the bundled rows with a notice rather than going silent.
 */
import { describe, expect, it } from "vitest";
import { loadAuditConfig, type AuditConfig } from "./config.js";
import {
  StoreMaskingError,
  createExtractionStore,
  createInMemoryExtractionStore,
  createSupabaseExtractionStore,
  loadBankMergers,
  type ExtractionRecord,
  type ExtractionTableClient,
} from "./store.js";
import { BUNDLED_BANK_MERGERS } from "./verify/validators.js";
import type { AuditField, AuditResponse } from "./verify/verify.js";

function firstField(): AuditField {
  return {
    key: "account_no",
    label: "Account No",
    value: "6789",
    normalized: "6789",
    type: "account_number",
    page: 1,
    handwritten: false,
    grounding: "text",
  };
}

function maskedResponse(): AuditResponse {
  return {
    document_type_guess: "bank_passbook",
    language: "en",
    issuer: "",
    has_signature: true,
    has_seal: true,
    pages_read: 1,
    pages_total: 1,
    needs_review: false,
    model: "cline-pass/qwen3.7-plus",
    fields: [firstField()],
    flags: [],
    notices: [],
  };
}

function leakingResponse(value: string): AuditResponse {
  const response = maskedResponse();
  response.fields = [{ ...firstField(), value, normalized: value }];
  return response;
}

function record(response: AuditResponse = maskedResponse()): ExtractionRecord {
  return {
    session_id: "session-1",
    document_id: "doc-1",
    model_id: "cline-pass/qwen3.7-plus",
    document_type_guess: response.document_type_guess,
    needs_review: response.needs_review,
    pages_read: response.pages_read,
    pages_total: response.pages_total,
    result: response,
    created_at: "2026-10-04T10:00:00.000Z",
    completed_at: "2026-10-04T10:01:00.000Z",
  };
}

function config(overrides: Partial<AuditConfig> = {}): AuditConfig {
  return { ...loadAuditConfig({ AUDIT_API_KEY: "k" }), ...overrides };
}

describe("createExtractionStore", () => {
  it("uses the in-memory store when Supabase is not configured", () => {
    expect(createExtractionStore(config()).kind).toBe("in-memory");
  });

  it("uses the Supabase store when Supabase is configured", () => {
    const store = createExtractionStore(
      config({
        supabaseUrl: "https://example.supabase.co",
        supabaseServiceRoleKey: "service-role",
        hasSupabase: true,
      }),
    );
    expect(store.kind).toBe("supabase");
  });
});

describe("in-memory store", () => {
  it("round-trips a masked record", async () => {
    const store = createInMemoryExtractionStore();
    await store.save(record());
    const [saved] = await store.list();
    expect(saved?.session_id).toBe("session-1");
    expect(saved?.result.fields[0]?.value).toBe("6789");
    expect(store.records).toHaveLength(1);
  });

  it("refuses to store a record whose response still carries a value", async () => {
    const store = createInMemoryExtractionStore();
    await expect(store.save(record(leakingResponse("000123456789")))).rejects.toThrowError(
      StoreMaskingError,
    );
    await expect(store.save(record(leakingResponse("000123456789")))).rejects.toThrowError(
      /refusing to store/,
    );
    expect(store.records).toEqual([]);
  });
});

describe("Supabase store", () => {
  function tableClient(
    rows: unknown = null,
    error: string | undefined = undefined,
  ): {
    client: ExtractionTableClient;
    inserts: Array<{ table: string; values: Record<string, unknown> }>;
    selected: string[];
  } {
    const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];
    const selected: string[] = [];
    const client: ExtractionTableClient = {
      from(table) {
        return {
          insert(values) {
            inserts.push({ table, values });
            return {
              select(columns) {
                selected.push(columns);
                return {
                  maybeSingle: async () => ({ data: { id: "row-1" }, error: null }),
                };
              },
            };
          },
          select(columns) {
            selected.push(columns);
            return {
              order: () => ({
                limit: async () => ({
                  data: rows,
                  error: error ? { message: error } : null,
                }),
              }),
            };
          },
        };
      },
    };
    return { client, inserts, selected };
  }

  it("writes only the masked payload and its identifiers", async () => {
    const { client, inserts, selected } = tableClient();
    const store = createSupabaseExtractionStore(client);
    await store.save(record());

    expect(store.kind).toBe("supabase");
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.table).toBe("document_extractions");
    const values = inserts[0]?.values as Record<string, unknown>;
    expect(Object.keys(values).sort()).toEqual([
      "completed_at",
      "created_at",
      "document_id",
      "document_type_guess",
      "model_id",
      "needs_review",
      "pages_read",
      "pages_total",
      "result",
      "session_id",
    ]);
    // No column can hold an upload, a page image or raw text.
    for (const banned of ["file", "image", "images", "raw_text", "text", "ocr"]) {
      expect(values).not.toHaveProperty(banned);
    }
    expect((values["result"] as AuditResponse).fields[0]?.value).toBe("6789");
    expect(selected).toEqual(["id"]);
  });

  it("refuses to insert an unmasked record", async () => {
    const { client, inserts } = tableClient();
    const store = createSupabaseExtractionStore(client);
    await expect(store.save(record(leakingResponse("ABCDE1234F")))).rejects.toThrowError(
      StoreMaskingError,
    );
    expect(inserts).toEqual([]);
  });

  it("reads back recent masked rows and reports a read failure", async () => {
    const { client } = tableClient([record()]);
    await expect(createSupabaseExtractionStore(client).list()).resolves.toHaveLength(1);
    const failing = tableClient(null, "permission denied");
    await expect(
      createSupabaseExtractionStore(failing.client).list(),
    ).rejects.toThrowError(/permission denied/);
  });
});

describe("loadBankMergers", () => {
  it("uses the bundled rows when Supabase is not configured", async () => {
    const { mergers, notice } = await loadBankMergers(undefined);
    expect(mergers).toBe(BUNDLED_BANK_MERGERS);
    expect(notice).toBeUndefined();
  });

  it("prefers the table's rows when the read works", async () => {
    const rows = [
      {
        old_bank_code: "XSPC",
        new_bank_code: "CNRB",
        old_bank_name: "Specimen Bank",
        new_bank_name: "Canara Bank",
        merged_on: "2021-01-01",
      },
    ];
    const client = { from: () => ({ select: async () => ({ data: rows, error: null }) }) };
    const { mergers, notice } = await loadBankMergers(client);
    expect(mergers).toEqual(rows);
    expect(notice).toBeUndefined();
  });

  it("falls back to the bundled rows and says why", async () => {
    const failing = {
      from: () => ({
        select: async () => ({ data: null, error: { message: "connection refused" } }),
      }),
    };
    const first = await loadBankMergers(failing);
    expect(first.mergers).toBe(BUNDLED_BANK_MERGERS);
    expect(first.notice).toContain("connection refused");

    const empty = { from: () => ({ select: async () => ({ data: [], error: null }) }) };
    const second = await loadBankMergers(empty);
    expect(second.notice).toContain("bank_merger_map is empty");
    expect(second.mergers.some((row) => row.old_bank_code === "SYNB")).toBe(true);
  });
});
