/**
 * Reference loader: `listing-api/ward_offices` (15 rows) -> `ward_offices`.
 * Deterministic, no LLM. Idempotent on the FULL unique constraint
 * `ward_offices (ulb_code, external_id)` (see docs/migrations/003).
 *
 * Column map (real schema: docs/SUPABASE_SETUP.sql + 002):
 *   ulb_code, external_id, ward_number, ward_name, physical_address,
 *   source_url, last_verified_at, desk_type. Unknown values are omitted, never
 *   written as explicit null (NOT NULL / defaulted columns reject null).
 */
import type { SupabaseClient } from "../supabase/client.js";
import type { ListingNode } from "../discover/feeds.js";

export const PMC_ULB_CODE = "PMC-001";
const PMC_HOST = "https://webadmin.pmc.gov.in";

/** Make a feed-relative `/node/123` URL absolute against the PMC CMS host. */
export function absolutizePmcUrl(url: string | null | undefined): string {
  if (!url) return PMC_HOST;
  if (/^https?:\/\//i.test(url)) return url;
  return PMC_HOST + (url.startsWith("/") ? url : `/${url}`);
}

export interface WardOfficeRow {
  ulb_code: string;
  external_id: string;
  ward_number: number | undefined;
  ward_name: string;
  physical_address: string | undefined;
  source_url: string;
  last_verified_at: string;
  desk_type?: string | undefined;
}

export function parseWardNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const m = value.match(/\d+/);
    if (m) return Number.parseInt(m[0] as string, 10);
  }
  return undefined;
}

/** Map one feed node to a ward_offices row. Returns null when nid is missing. */
export function mapWardNode(
  node: ListingNode,
  nowIso: string = new Date().toISOString(),
): WardOfficeRow | null {
  if (node.nid === undefined || node.nid === null || node.nid === "") {
    return null;
  }
  const external_id = String(node.nid);
  const wardName = node.ward_name ?? node.title ?? `Ward ${external_id}`;
  return {
    ulb_code: PMC_ULB_CODE,
    external_id,
    ward_number: parseWardNumber(
      (node as Record<string, unknown>)["ward_number"] ?? wardName,
    ),
    ward_name: wardName,
    physical_address: node.address ?? undefined,
    source_url: absolutizePmcUrl(node.url || `/node/${external_id}`),
    last_verified_at: nowIso,
  };
}

/** Map a full node list; skips nodes without nid. */
export function mapWardNodes(
  nodes: ListingNode[],
  nowIso: string = new Date().toISOString(),
): WardOfficeRow[] {
  const rows: WardOfficeRow[] = [];
  for (const node of nodes) {
    const row = mapWardNode(node, nowIso);
    if (row) rows.push(row);
  }
  return rows;
}

/**
 * Diff rows against existing rows keyed by external_id: returns only rows
 * that are new or whose content changed, so a re-run writes nothing.
 */
export function diffWardRows(
  rows: WardOfficeRow[],
  existing: Map<string, WardOfficeRow>,
): WardOfficeRow[] {
  return rows.filter((row) => {
    const prev = existing.get(row.external_id);
    if (!prev) return true;
    return (
      prev.ward_number !== row.ward_number ||
      prev.ward_name !== row.ward_name ||
      prev.physical_address !== row.physical_address
    );
  });
}

export interface WardUpsertResult {
  inserted: number;
  updated: number;
}

export interface WardOfficeWriter {
  upsert(rows: WardOfficeRow[]): Promise<WardUpsertResult>;
}

/** Row -> Supabase payload: real columns only; omit undefined (unknown) values. */
export function toWardPayload(row: WardOfficeRow): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ulb_code: row.ulb_code,
    external_id: row.external_id,
    ward_name: row.ward_name,
    source_url: row.source_url,
    last_verified_at: row.last_verified_at,
  };
  if (row.ward_number !== undefined) payload["ward_number"] = row.ward_number;
  if (row.physical_address !== undefined) payload["physical_address"] = row.physical_address;
  if (row.desk_type !== undefined) payload["desk_type"] = row.desk_type;
  return payload;
}

/** In-memory writer for tests / keyless runs (no persistence). */
export function createInMemoryWardWriter(
  initial: WardOfficeRow[] = [],
): WardOfficeWriter & { rows: Map<string, WardOfficeRow> } {
  const rows = new Map<string, WardOfficeRow>();
  for (const r of initial) rows.set(r.external_id, { ...r });
  return {
    rows,
    async upsert(batch) {
      let inserted = 0;
      let updated = 0;
      for (const r of batch) {
        if (rows.has(r.external_id)) updated += 1;
        else inserted += 1;
        rows.set(r.external_id, { ...r });
      }
      return { inserted, updated };
    },
  };
}

/**
 * Supabase writer: select-then-update/insert keyed on (ulb_code, external_id).
 * Uses a lookup instead of `ON CONFLICT` so it works whether the full unique
 * constraint (migration 003) is applied or only the 002 partial index exists.
 */
export function createSupabaseWardWriter(client: SupabaseClient): WardOfficeWriter {
  return {
    async upsert(batch) {
      if (batch.length === 0) return { inserted: 0, updated: 0 };
      let inserted = 0;
      let updated = 0;
      for (const row of batch) {
        const payload = toWardPayload(row);
        const { data, error } = await client
          .from("ward_offices")
          .select("id")
          .eq("ulb_code", row.ulb_code)
          .eq("external_id", row.external_id)
          .maybeSingle();
        if (error) throw new Error("ward_offices lookup failed: " + error.message);
        const existing = (data as { id?: string } | null)?.id;
        if (existing) {
          const upd = await client.from("ward_offices").update(payload).eq("id", existing);
          if (upd.error) throw new Error("ward_offices update failed: " + upd.error.message);
          updated += 1;
        } else {
          const ins = await client.from("ward_offices").insert(payload);
          if (ins.error) throw new Error("ward_offices insert failed: " + ins.error.message);
          inserted += 1;
        }
      }
      return { inserted, updated };
    },
  };
}

export async function loadWardOffices(
  nodes: ListingNode[],
  writer: WardOfficeWriter,
  nowIso: string = new Date().toISOString(),
): Promise<{ seen: number; written: number }> {
  const rows = mapWardNodes(nodes, nowIso);
  if (rows.length === 0) return { seen: nodes.length, written: 0 };
  const { inserted, updated } = await writer.upsert(rows);
  return { seen: nodes.length, written: inserted + updated };
}
