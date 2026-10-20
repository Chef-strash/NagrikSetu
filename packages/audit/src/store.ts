/**
 * The masked-result store (R14, KTD8, U7 step 5).
 *
 * Only the **masked** response is ever written, together with the session id,
 * document id, model id and timestamps. There is no column for a file, a page
 * image, a text layer or an unmasked value — `docs/migrations/004_document_extractions.sql`
 * has a CHECK constraint that rejects a row containing an unmasked Aadhaar,
 * account or PAN shape, so a bug here cannot leak one into the database.
 *
 * `store.save` re-runs the zero-PII assertion on the record before writing and
 * throws rather than sending a leaking row (defence in depth: the pipeline
 * already proved the response clean).
 *
 * With Supabase unconfigured the caller gets the in-memory store and the audit
 * still returns a result (R14).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AuditConfig } from "./config.js";
import { findUnmaskedPii } from "./verify/mask.js";
import {
  BUNDLED_BANK_MERGERS,
  type BankMerger,
} from "./verify/validators.js";
import type { AuditResponse } from "./verify/verify.js";

/** The only record this service stores. Everything in it is already masked. */
export interface ExtractionRecord {
  session_id: string;
  document_id: string;
  model_id: string;
  document_type_guess: string;
  needs_review: boolean;
  pages_read: number;
  pages_total: number;
  /** Masked response (R11). Never a file, never a page image, never raw text. */
  result: AuditResponse;
  created_at: string;
  completed_at: string;
}

export interface ExtractionStore {
  readonly kind: "supabase" | "in-memory";
  save(record: ExtractionRecord): Promise<void>;
  /** Rows written this process (in-memory) or a bounded read-back (Supabase). */
  list(): Promise<ExtractionRecord[]>;
}

/** Raised when a record would put an unmasked value in the store. */
export class StoreMaskingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreMaskingError";
  }
}

function assertMasked(record: ExtractionRecord): void {
  const findings = findUnmaskedPii(record.result);
  if (findings.length > 0) {
    throw new StoreMaskingError(
      `refusing to store an unmasked value at ${findings
        .map((finding) => `${finding.path} (${finding.kind})`)
        .join(", ")}`,
    );
  }
}

/** Offline/demo store and the test double. */
export function createInMemoryExtractionStore(): ExtractionStore & {
  records: ExtractionRecord[];
} {
  const records: ExtractionRecord[] = [];
  return {
    kind: "in-memory",
    records,
    async save(record) {
      assertMasked(record);
      records.push(record);
    },
    async list() {
      return [...records];
    },
  };
}

/** The slice of a Supabase client this store needs (mock-friendly). */
export interface ExtractionTableClient {
  from(table: string): {
    insert(values: Record<string, unknown>): {
      select(columns: string): {
        maybeSingle(): PromiseLike<{
          data: unknown;
          error: { message: string } | null;
        }>;
      };
    };
    select(columns: string): {
      order(
        column: string,
        options?: Record<string, unknown>,
      ): {
        limit(count: number): PromiseLike<{
          data: unknown;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

/** Supabase-backed store: service-role only, masked JSON only. */
export function createSupabaseExtractionStore(
  client: ExtractionTableClient,
): ExtractionStore {
  return {
    kind: "supabase",
    async save(record) {
      assertMasked(record);
      const { error } = await client
        .from("document_extractions")
        .insert({
          session_id: record.session_id,
          document_id: record.document_id,
          model_id: record.model_id,
          document_type_guess: record.document_type_guess,
          needs_review: record.needs_review,
          pages_read: record.pages_read,
          pages_total: record.pages_total,
          result: record.result,
          created_at: record.created_at,
          completed_at: record.completed_at,
        })
        .select("id")
        .maybeSingle();
      if (error) {
        throw new Error(`document_extractions insert failed: ${error.message}`);
      }
    },
    async list() {
      const { data, error } = await client
        .from("document_extractions")
        .select("result")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        throw new Error(`document_extractions read failed: ${error.message}`);
      }
      return (data as ExtractionRecord[] | null) ?? [];
    },
  };
}

/** The bank-merger table's slice (`bank_merger_map`). */
export interface BankMergerTableClient {
  from(table: string): {
    select(columns: string): PromiseLike<{
      data: unknown;
      error: { message: string } | null;
    }>;
  };
}

/**
 * The merged-bank rows: from `bank_merger_map` when Supabase is configured,
 * else the bundled copy of the same rows (U7 step 2). A failed read falls back
 * to the bundle and reports the reason — a validator must not go silent.
 */
export async function loadBankMergers(
  client: BankMergerTableClient | undefined,
): Promise<{ mergers: readonly BankMerger[]; notice: string | undefined }> {
  if (!client) {
    return { mergers: BUNDLED_BANK_MERGERS, notice: undefined };
  }
  try {
    const { data, error } = await client
      .from("bank_merger_map")
      .select("old_bank_code,new_bank_code,old_bank_name,new_bank_name,merged_on");
    if (error) throw new Error(error.message);
    const rows = (data as BankMerger[] | null) ?? [];
    if (rows.length === 0) throw new Error("bank_merger_map is empty");
    return { mergers: rows, notice: undefined };
  } catch (error) {
    return {
      mergers: BUNDLED_BANK_MERGERS,
      notice: `bank_merger_map read failed (${
        error instanceof Error ? error.message : String(error)
      }); using the bundled copy of the same rows`,
    };
  }
}

/** Service-role Supabase client, or `undefined` when not configured (R14). */
export function createSupabaseClient(
  config: AuditConfig,
): SupabaseClient | undefined {
  if (!config.hasSupabase) return undefined;
  return createClient(
    config.supabaseUrl as string,
    config.supabaseServiceRoleKey as string,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * The store to use for this configuration: Supabase when configured, the
 * in-memory store otherwise. The audit returns its result either way (R14).
 */
export function createExtractionStore(config: AuditConfig): ExtractionStore {
  const client = createSupabaseClient(config);
  if (!client) return createInMemoryExtractionStore();
  return createSupabaseExtractionStore(
    client as unknown as ExtractionTableClient,
  );
}
