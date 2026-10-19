import { describe, expect, it } from "vitest";
import {
  createInMemoryHospitalWriter,
  createSupabaseHospitalWriter,
  loadHospitals,
  mapHospitalNode,
  parsePointWkt,
  toHospitalPayload,
  type HospitalRow,
} from "./hospitals.js";
import type { SupabaseClient } from "../supabase/client.js";

describe("reference hospitals (plan §12 reference)", () => {
  it("parses POINT (lon lat) into latitude/longitude order", () => {
    expect(parsePointWkt("POINT (73.868 18.467)")).toEqual({ latitude: 18.467, longitude: 73.868 });
    expect(parsePointWkt(null)).toBeNull();
    expect(parsePointWkt("garbage")).toBeNull();
  });

  it("maps nodes keyed on nid with the correct lat/lon and the live `ward` field", async () => {
    const row = mapHospitalNode({
      nid: 7,
      title: "PMC Hospital",
      location: "POINT (73.868 18.467)",
      ward: "Bibwewadi Ward Office",
      address: null,
      url: "/pmc-hospital",
    });
    expect(row?.external_id).toBe("7");
    expect(row?.latitude).toBe(18.467);
    expect(row?.longitude).toBe(73.868);
    expect(row?.ward_name).toBe("Bibwewadi Ward Office");
    expect(row?.source_url).toBe("https://webadmin.pmc.gov.in/pmc-hospital");
    expect(row?.address).toBeUndefined();
    expect(mapHospitalNode({ title: "no nid" })).toBeNull();
    // The live feed has no nid: the URL slug becomes the stable external id.
    const slugRow = mapHospitalNode({ title: "H", url: "/late-premchand-oswal-hospital" });
    expect(slugRow?.external_id).toBe("late-premchand-oswal-hospital");
    expect(slugRow?.source_url).toBe("https://webadmin.pmc.gov.in/late-premchand-oswal-hospital");
    const out = await loadHospitals(
      [{ nid: 1, title: "H", location: "POINT (73 18)" }],
      { upsert: async (rows) => ({ inserted: rows.length, updated: 0 }) },
    );
    expect(out).toEqual({ seen: 1, written: 1 });
  });

  it("payload maps real columns and omits unknown values (no explicit null)", () => {
    const row = mapHospitalNode({ nid: 7, title: "PMC Hospital", location: "POINT (73.868 18.467)", ward: "Bibwewadi", url: "/h" }, "2026-10-04T00:00:00.000Z") as HospitalRow;
    const payload = toHospitalPayload(row);
    expect(payload["ulb_code"]).toBe("PMC-001");
    expect(payload["name"]).toBe("PMC Hospital");
    expect(payload["ward_name"]).toBe("Bibwewadi");
    expect(payload["latitude"]).toBe(18.467);
    expect(payload["longitude"]).toBe(73.868);
    expect("area" in payload).toBe(false);
    expect("address" in payload).toBe(false);
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
    const writer = createSupabaseHospitalWriter(client);
    const row = mapHospitalNode({ nid: 1, title: "H", location: "POINT (73 18)" }) as HospitalRow;
    expect(await writer.upsert([row])).toEqual({ inserted: 1, updated: 0 });
    expect(calls[0]?.table).toBe("empaneled_hospitals");
    expect(calls[0]?.op).toBe("insert");
    existing = { id: "h-1" };
    expect(await writer.upsert([row])).toEqual({ inserted: 0, updated: 1 });
    expect(calls[1]?.op).toBe("update");
  });

  it("in-memory writer is idempotent on external_id", async () => {
    const writer = createInMemoryHospitalWriter();
    const row = mapHospitalNode({ nid: 1, title: "H", location: "POINT (73 18)" }) as HospitalRow;
    expect(await writer.upsert([row])).toEqual({ inserted: 1, updated: 0 });
    expect(await writer.upsert([row])).toEqual({ inserted: 0, updated: 1 });
    expect(writer.rows.size).toBe(1);
  });
});
