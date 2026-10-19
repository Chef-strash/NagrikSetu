/**
 * `agent_runs` bookkeeping, shared by every NagrikSetu agent feature.
 *
 * The harvester opens a `harvest` run and closes it with totals; the audit
 * opens and closes its own runs. The Supabase client is taken through a minimal
 * structural interface so this package does not depend on
 * `@supabase/supabase-js` and either feature can pass its own client (or a mock).
 */

export type RunStatus = "running" | "succeeded" | "partial" | "failed";

export interface RunTotals {
  seen: number;
  isNew: number;
  changed: number;
  failed: number;
}

export interface RunRecord {
  id: string;
  run_type: string;
  status: RunStatus;
  totals: RunTotals;
  summary?: string | undefined;
  details: Record<string, unknown>;
}

export interface RunClosePatch {
  status: RunStatus;
  totals: RunTotals;
  summary?: string | undefined;
  details?: Record<string, unknown> | undefined;
}

export interface RunsPort {
  open(runType: string): Promise<string>;
  close(id: string, patch: RunClosePatch): Promise<RunRecord>;
  list(): RunRecord[];
}

/** The `insert(...).select(cols).maybeSingle()` leg of a Supabase query. */
export interface RunsInsertQuery {
  select(columns: string): {
    maybeSingle(): PromiseLike<{
      data: unknown;
      error: { message: string } | null;
    }>;
  };
}

/** The `update(...).eq(col, value)` leg of a Supabase query. */
export interface RunsUpdateQuery {
  eq(
    column: string,
    value: string,
  ): PromiseLike<{ error: { message: string } | null }>;
}

/**
 * The slice of a Supabase client `agent_runs` needs. Declared with method
 * shorthand so the real client's builder chains satisfy it structurally.
 */
export interface RunsTableClient {
  from(table: string): {
    insert(values: Record<string, unknown>): RunsInsertQuery;
    update(values: Record<string, unknown>): RunsUpdateQuery;
  };
}

let runSequence = 0;

/** In-memory runs port — the offline/demo path and the test double. */
export function createInMemoryRuns(): RunsPort & {
  runs: Map<string, RunRecord>;
} {
  const runs = new Map<string, RunRecord>();
  return {
    runs,
    open: async (runType: string) => {
      runSequence += 1;
      const id = "run-" + String(runSequence).padStart(4, "0");
      runs.set(id, {
        id,
        run_type: runType,
        status: "running",
        totals: { seen: 0, isNew: 0, changed: 0, failed: 0 },
        details: {},
      });
      return id;
    },
    close: async (id: string, patch: RunClosePatch) => {
      const record = runs.get(id);
      if (!record) throw new Error("unknown run " + id);
      record.status = patch.status;
      record.totals = patch.totals;
      if (patch.summary !== undefined) record.summary = patch.summary;
      if (patch.details !== undefined) record.details = patch.details;
      return { ...record };
    },
    list: () => [...runs.values()],
  };
}

/** Wrap per-source coverage gaps for the `details` column. */
export function coverageDetails(
  coverageGaps: Record<string, string[]>,
): Record<string, unknown> {
  return { coverage: coverageGaps };
}

/** `partial` when something failed but something else landed; `failed` when nothing did. */
export function statusFor(totals: RunTotals): RunStatus {
  if (totals.failed > 0 && totals.isNew + totals.changed > 0) return "partial";
  if (totals.failed > 0) return "failed";
  return "succeeded";
}

/** `agent_runs`-backed runs port; falls back to in-memory ids when a row is not returned. */
export function createSupabaseRuns(client: RunsTableClient): RunsPort {
  const memory = createInMemoryRuns();
  const runTypes = new Map<string, string>();
  return {
    open: async (runType: string) => {
      const { data, error } = await client
        .from("agent_runs")
        .insert({ run_type: runType, status: "running" })
        .select("id")
        .maybeSingle();
      if (error) throw new Error("agent_runs open failed: " + error.message);
      const id = (data as { id?: string } | null)?.id;
      if (!id) return memory.open(runType);
      runTypes.set(id, runType);
      return id;
    },
    close: async (id: string, patch: RunClosePatch) => {
      const { error } = await client
        .from("agent_runs")
        .update({
          status: patch.status,
          items_seen: patch.totals.seen,
          items_new: patch.totals.isNew,
          items_changed: patch.totals.changed,
          items_failed: patch.totals.failed,
          summary: patch.summary ?? null,
          details: patch.details ?? {},
          finished_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw new Error("agent_runs close failed: " + error.message);
      const record: RunRecord = {
        id,
        run_type: runTypes.get(id) ?? "unknown",
        status: patch.status,
        totals: patch.totals,
        details: patch.details ?? {},
      };
      if (patch.summary !== undefined) record.summary = patch.summary;
      return record;
    },
    list: () => memory.list(),
  };
}
