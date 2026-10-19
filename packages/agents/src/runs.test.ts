import { describe, expect, it } from "vitest";
import {
  coverageDetails,
  createInMemoryRuns,
  createSupabaseRuns,
  statusFor,
  type RunsTableClient,
} from "./runs.js";

describe("runs", () => {
  it("opens running and closes with totals + coverage details", async () => {
    const runs = createInMemoryRuns();
    const id = await runs.open("harvest");
    const record = await runs.close(id, {
      status: "succeeded",
      totals: { seen: 3, isNew: 1, changed: 1, failed: 0 },
      summary: "ok",
      details: coverageDetails({ "pmc-x": ["desk_type:fallback"] }),
    });
    expect(record.run_type).toBe("harvest");
    expect(record.status).toBe("succeeded");
    expect(record.totals).toEqual({ seen: 3, isNew: 1, changed: 1, failed: 0 });
    expect(record.details).toEqual({
      coverage: { "pmc-x": ["desk_type:fallback"] },
    });
  });

  it("statusFor maps failed/partial", () => {
    expect(statusFor({ seen: 1, isNew: 0, changed: 0, failed: 1 })).toBe("failed");
    expect(statusFor({ seen: 2, isNew: 1, changed: 0, failed: 1 })).toBe("partial");
    expect(statusFor({ seen: 1, isNew: 1, changed: 0, failed: 0 })).toBe("succeeded");
  });

  it("rejects closing an unknown run", async () => {
    const runs = createInMemoryRuns();
    await expect(
      runs.close("run-9999", {
        status: "failed",
        totals: { seen: 0, isNew: 0, changed: 0, failed: 0 },
      }),
    ).rejects.toThrow("unknown run run-9999");
  });

  it("supabase close writes items_seen/new/changed/failed + details", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const client: RunsTableClient = {
      from: (table: string) => ({
        insert: () => ({
          select: () => ({
            maybeSingle: async () => ({
              data: { id: `${table}-1` },
              error: null,
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => {
          updates.push(patch);
          return { eq: async () => ({ error: null }) };
        },
      }),
    };
    const runs = createSupabaseRuns(client);
    const id = await runs.open("harvest");
    expect(id).toBe("agent_runs-1");
    const record = await runs.close(id, {
      status: "partial",
      totals: { seen: 9, isNew: 5, changed: 2, failed: 1 },
      summary: "done",
      details: coverageDetails({}),
    });
    const patch = updates[0] as Record<string, unknown>;
    expect(patch["items_seen"]).toBe(9);
    expect(patch["items_new"]).toBe(5);
    expect(patch["items_changed"]).toBe(2);
    expect(patch["items_failed"]).toBe(1);
    expect(patch["status"]).toBe("partial");
    expect(patch["details"]).toEqual({ coverage: {} });
    expect(typeof patch["finished_at"]).toBe("string");
    expect(record.run_type).toBe("harvest");
  });

  it("supabase open raises the table error message", async () => {
    const client: RunsTableClient = {
      from: () => ({
        insert: () => ({
          select: () => ({
            maybeSingle: async () => ({
              data: null,
              error: { message: "permission denied" },
            }),
          }),
        }),
        update: () => ({ eq: async () => ({ error: null }) }),
      }),
    };
    await expect(createSupabaseRuns(client).open("harvest")).rejects.toThrow(
      "agent_runs open failed: permission denied",
    );
  });

  it("supabase open falls back to an in-memory id when no row comes back", async () => {
    const client: RunsTableClient = {
      from: () => ({
        insert: () => ({
          select: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
        update: () => ({ eq: async () => ({ error: null }) }),
      }),
    };
    expect(await createSupabaseRuns(client).open("audit")).toMatch(/^run-\d+$/);
  });
});
