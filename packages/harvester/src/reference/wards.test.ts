import { describe, expect, it } from "vitest";
import {
  createInMemoryWardWriter,
  createSupabaseWardWriter,
  diffWardRows,
  loadWardOffices,
  mapWardNode,
  toWardPayload,
  type WardOfficeRow,
} from "./wards.js";
import type { ListingNode } from "../discover/feeds.js";
import type { SupabaseClient } from "../supabase/client.js";

function wardNode(nid: number, ward_name = `Ward ${nid}`): ListingNode {
  return { nid, ward_name, address: `${ward_name} office`, url: `/node/${nid}` };
}

describe("reference wards (plan §12 reference)", () => {
  it("yields rows keyed on external_id = nid with absolute urls", () => {
    const nodes = Array.from({ length: 15 }, (_, i) => wardNode(i + 1));
    const rows = nodes
      .map((n) => mapWardNode(n, "2026-10-04T00:00:00.000Z"))
      .filter((r): r is WardOfficeRow => r !== null);
    expect(rows).toHaveLength(15);
    expect(new Set(rows.map((r) => r.external_id)).size).toBe(15);
    expect(rows[0]?.ward_name).toBe("Ward 1");
    expect(rows[0]?.source_url).toBe("https://webadmin.pmc.gov.in/node/1");
  });

  it("returns null without nid and re-run diff writes nothing", async () => {
    expect(mapWardNode({ title: "no nid" })).toBeNull();
    const nodes = [wardNode(1), wardNode(2)];
    const seen = new Map<string, WardOfficeRow>();
    const first = await loadWardOffices(nodes, {
      upsert: async (rows) => {
        for (const r of rows) seen.set(r.external_id, r);
        return { inserted: rows.length, updated: 0 };
      },
    });
    expect(first).toEqual({ seen: 2, written: 2 });
    const again = diffWardRows(
      nodes
        .map((n) => mapWardNode(n, "2026-10-04T00:00:00.000Z"))
        .filter((r): r is WardOfficeRow => r !== null),
      new Map([...seen.values()].map((r) => [r.external_id, r])),
    );
    expect(again).toHaveLength(0);
  });

  it("payload maps real columns and omits unknown values (no explicit null)", () => {
    const row = mapWardNode(
      { nid: 9756, title: "Aundh - Baner Ward Office", ward_name: "Aundh Baner Ward Office", address: "Aundh, Pune", url: "/node/9756" },
      "2026-10-04T00:00:00.000Z",
    );
    const payload = toWardPayload(row as WardOfficeRow);
    expect(payload["ulb_code"]).toBe("PMC-001");
    expect(payload["external_id"]).toBe("9756");
    expect(payload["ward_name"]).toBe("Aundh Baner Ward Office");
    expect(payload["physical_address"]).toBe("Aundh, Pune");
    expect(payload["source_url"]).toBe("https://webadmin.pmc.gov.in/node/9756");
    expect(payload["last_verified_at"]).toBe("2026-10-04T00:00:00.000Z");
    // No ward number in the live feed and no desk type here: omit, never null.
    expect("ward_number" in payload).toBe(false);
    expect("desk_type" in payload).toBe(false);
  });

  it("supabase writer inserts new rows and updates existing ones (no ON CONFLICT)", async () => {
    const calls: Array<{ table: string; op: string }> = [];
    let existing: { id: string } | null = null;
    const client = {
      from: (table: string) => ({
        select: () => {
          const chain = {
            eq: () => chain,
            maybeSingle: async () => ({ data: existing, error: null }),
          };
          return chain;
        },
        insert: async () => {
          calls.push({ table, op: "insert" });
          return { error: null };
        },
        update: () => ({
          eq: async () => {
            calls.push({ table, op: "update" });
            return { error: null };
          },
        }),
      }),
    } as unknown as SupabaseClient;
    const writer = createSupabaseWardWriter(client);
    const row = mapWardNode({ nid: 1, title: "W", ward_name: "W", address: "A", url: "/node/1" }, "2026-10-04T00:00:00.000Z") as WardOfficeRow;
    expect(await writer.upsert([row])).toEqual({ inserted: 1, updated: 0 });
    expect(calls[0]?.table).toBe("ward_offices");
    expect(calls[0]?.op).toBe("insert");
    existing = { id: "u-1" };
    expect(await writer.upsert([row])).toEqual({ inserted: 0, updated: 1 });
    expect(calls[1]?.op).toBe("update");
  });

  it("in-memory writer is idempotent on external_id", async () => {
    const writer = createInMemoryWardWriter();
    const row = mapWardNode(wardNode(1)) as WardOfficeRow;
    expect(await writer.upsert([row])).toEqual({ inserted: 1, updated: 0 });
    expect(await writer.upsert([row])).toEqual({ inserted: 0, updated: 1 });
    expect(writer.rows.size).toBe(1);
  });
});
