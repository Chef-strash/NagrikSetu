import { describe, expect, it } from "vitest";
import { coverageDetails, createInMemoryRuns, createSupabaseRuns, statusFor } from "./runs.js";
import type { SupabaseClient } from "../supabase/client.js";

describe("runs", () => {
  it("opens running and closes with totals + coverage details", async () => {
    const r = createInMemoryRuns();
    const id = await r.open("harvest");
    const rec = await r.close(id, {
      status: "succeeded",
      totals: { seen: 3, isNew: 1, changed: 1, failed: 0 },
      summary: "ok",
      details: coverageDetails({ "pmc-x": ["desk_type:fallback"] }),
    });
    expect(rec.status).toBe("succeeded");
    expect(rec.totals).toEqual({ seen: 3, isNew: 1, changed: 1, failed: 0 });
    expect(rec.details).toEqual({ coverage: { "pmc-x": ["desk_type:fallback"] } });
  });

  it("statusFor maps failed/partial", () => {
    expect(statusFor({ seen: 1, isNew: 0, changed: 0, failed: 1 })).toBe("failed");
    expect(statusFor({ seen: 2, isNew: 1, changed: 0, failed: 1 })).toBe("partial");
    expect(statusFor({ seen: 1, isNew: 1, changed: 0, failed: 0 })).toBe("succeeded");
  });

  it("supabase close writes items_seen/new/changed/failed + details", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const client = {
      from: (table: string) => ({
        insert: () => ({
          select: () => ({ maybeSingle: async () => ({ data: { id: `${table}-1` }, error: null }) }),
        }),
        update: (patch: Record<string, unknown>) => {
          updates.push(patch);
          return { eq: async () => ({ error: null }) };
        },
      }),
    } as unknown as SupabaseClient;
    const runs = createSupabaseRuns(client);
    const id = await runs.open("harvest");
    await runs.close(id, {
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
  });
});
