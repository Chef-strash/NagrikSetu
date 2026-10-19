/**
 * Reference loader: `listing-api/pmc_hospitals` (74 rows) -> empaneled_hospitals.
 * Deterministic, no LLM. Idempotent on the FULL unique constraint
 * `empaneled_hospitals (ulb_code, external_id)` (see docs/migrations/003).
 *
 * Feed `location` is WKT `POINT (lon lat)` — parses to latitude=lat,
 * longitude=lon (order matters; covered by test). The live feed names the ward
 * field `ward` (not `ward_name`); unknown values are omitted, never null.
 */
import type { SupabaseClient } from "../supabase/client.js";
import type { ListingNode } from "../discover/feeds.js";
import { absolutizePmcUrl, PMC_ULB_CODE } from "./wards.js";
import { createHash } from "node:crypto";

/**
 * Stable external id for a hospital feed node. The live `pmc_hospitals` feed
 * has no `nid`; its stable identifier is the Drupal URL slug. When present we
 * still prefer `nid` (VARCHAR(64)); long slugs get a short deterministic hash
 * suffix so re-runs produce the same id.
 */
export function hospitalExternalId(node: ListingNode): string | undefined {
  if (node.nid !== undefined && node.nid !== null && node.nid !== "") {
    return String(node.nid);
  }
  const raw = typeof node.url === "string" ? node.url.trim() : "";
  const slug = raw.replace(/^https?:\/\/[^/]+/i, "").replace(/^\/+/, "");
  if (slug.length === 0) return undefined;
  if (slug.length <= 64) return slug;
  const suffix = createHash("sha1").update(slug).digest("hex").slice(0, 8);
  return slug.slice(0, 55) + "-" + suffix;
}


export interface HospitalRow {
  ulb_code: string;
  external_id: string;
  name: string;
  area: string | undefined;
  ward_name: string | undefined;
  address: string | undefined;
  latitude: number | undefined;
  longitude: number | undefined;
  source_url: string;
  last_verified_at: string;
}

export function parsePointWkt(
  wkt: string | null | undefined,
): { latitude: number; longitude: number } | null {
  if (!wkt) return null;
  const m = wkt.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
  if (!m) return null;
  const lon = Number.parseFloat(m[1] as string);
  const lat = Number.parseFloat(m[2] as string);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return { latitude: lat, longitude: lon };
}

function optionalString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v : undefined;
}

export function mapHospitalNode(
  node: ListingNode,
  nowIso: string = new Date().toISOString(),
): HospitalRow | null {
  const external_id = hospitalExternalId(node);
  if (external_id === undefined) {
    return null;
  }
  const point = parsePointWkt(node.location);
  const raw = node as Record<string, unknown>;
  const wardName = optionalString(raw["ward"]) ?? optionalString(node.ward_name);
  return {
    ulb_code: PMC_ULB_CODE,
    external_id,
    name: node.title ?? `Hospital ${external_id}`,
    area: optionalString(raw["area"]),
    ward_name: wardName,
    address: optionalString(node.address),
    latitude: point?.latitude,
    longitude: point?.longitude,
    source_url: absolutizePmcUrl(node.url || `/node/${external_id}`),
    last_verified_at: nowIso,
  };
}

export function mapHospitalNodes(
  nodes: ListingNode[],
  nowIso: string = new Date().toISOString(),
): HospitalRow[] {
  const rows: HospitalRow[] = [];
  for (const node of nodes) {
    const row = mapHospitalNode(node, nowIso);
    if (row) rows.push(row);
  }
  return rows;
}

export function diffHospitalRows(
  rows: HospitalRow[],
  existing: Map<string, HospitalRow>,
): HospitalRow[] {
  return rows.filter((row) => {
    const prev = existing.get(row.external_id);
    if (!prev) return true;
    return (
      prev.name !== row.name ||
      prev.address !== row.address ||
      prev.latitude !== row.latitude ||
      prev.longitude !== row.longitude
    );
  });
}

export interface HospitalUpsertResult {
  inserted: number;
  updated: number;
}

export interface HospitalWriter {
  upsert(rows: HospitalRow[]): Promise<HospitalUpsertResult>;
}

/** Row -> Supabase payload: real columns only; omit undefined (unknown) values. */
export function toHospitalPayload(row: HospitalRow): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ulb_code: row.ulb_code,
    external_id: row.external_id,
    name: row.name,
    source_url: row.source_url,
    last_verified_at: row.last_verified_at,
  };
  if (row.area !== undefined) payload["area"] = row.area;
  if (row.ward_name !== undefined) payload["ward_name"] = row.ward_name;
  if (row.address !== undefined) payload["address"] = row.address;
  if (row.latitude !== undefined) payload["latitude"] = row.latitude;
  if (row.longitude !== undefined) payload["longitude"] = row.longitude;
  return payload;
}

/** In-memory writer for tests / keyless runs (no persistence). */
export function createInMemoryHospitalWriter(
  initial: HospitalRow[] = [],
): HospitalWriter & { rows: Map<string, HospitalRow> } {
  const rows = new Map<string, HospitalRow>();
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
export function createSupabaseHospitalWriter(client: SupabaseClient): HospitalWriter {
  return {
    async upsert(batch) {
      if (batch.length === 0) return { inserted: 0, updated: 0 };
      let inserted = 0;
      let updated = 0;
      for (const row of batch) {
        const payload = toHospitalPayload(row);
        const { data, error } = await client
          .from("empaneled_hospitals")
          .select("id")
          .eq("ulb_code", row.ulb_code)
          .eq("external_id", row.external_id)
          .maybeSingle();
        if (error) throw new Error("empaneled_hospitals lookup failed: " + error.message);
        const existing = (data as { id?: string } | null)?.id;
        if (existing) {
          const upd = await client.from("empaneled_hospitals").update(payload).eq("id", existing);
          if (upd.error) throw new Error("empaneled_hospitals update failed: " + upd.error.message);
          updated += 1;
        } else {
          const ins = await client.from("empaneled_hospitals").insert(payload);
          if (ins.error) throw new Error("empaneled_hospitals insert failed: " + ins.error.message);
          inserted += 1;
        }
      }
      return { inserted, updated };
    },
  };
}

export async function loadHospitals(
  nodes: ListingNode[],
  writer: HospitalWriter,
  nowIso: string = new Date().toISOString(),
): Promise<{ seen: number; written: number }> {
  const rows = mapHospitalNodes(nodes, nowIso);
  if (rows.length === 0) return { seen: nodes.length, written: 0 };
  const { inserted, updated } = await writer.upsert(rows);
  return { seen: nodes.length, written: inserted + updated };
}
