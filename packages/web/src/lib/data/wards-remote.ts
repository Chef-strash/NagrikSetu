import { supabase } from "../supabase";
import { WARDS, HOSPITALS, type Hospital } from "./wards";

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : "");

/** Pure: map raw ward_offices rows to ward labels; empty -> fallback. */
export function mapWardRows(rows: Row[] | null | undefined): string[] {
  const out = (rows || [])
    .map((r) => str(r.ward_name) || str(r.ward) || str(r.name))
    .filter(Boolean);
  return out.length ? Array.from(new Set(out)) : WARDS;
}

/** hospital_type is an enum-like code (e.g. PRIVATE_EMPANELED); show a readable label. */
function typeLabel(r: Row): string {
  const t = str(r.hospital_type) || str(r.type) || str(r.empanelment_type);
  if (!t) return "Private Empaneled";
  const label = t.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const pct = typeof r.concession_percentage === "number" ? ` (${r.concession_percentage}% Concession)` : "";
  return label + pct;
}

/** Pure: map raw empaneled_hospitals rows; empty -> fallback. */
export function mapHospitalRows(rows: Row[] | null | undefined): Hospital[] {
  const out = (rows || [])
    .map((r) => ({
      name: str(r.name) || str(r.hospital_name),
      area: str(r.area) || str(r.locality),
      type: typeLabel(r),
    }))
    .filter((h) => h.name);
  return out.length ? out : HOSPITALS;
}

export async function loadWards(): Promise<string[]> {
  if (!supabase) return WARDS;
  try {
    const { data, error } = await supabase.from("ward_offices").select("*");
    if (error) return WARDS;
    return mapWardRows(data as Row[]);
  } catch {
    return WARDS;
  }
}

export async function loadHospitals(): Promise<Hospital[]> {
  if (!supabase) return HOSPITALS;
  try {
    const { data, error } = await supabase.from("empaneled_hospitals").select("*");
    if (error) return HOSPITALS;
    return mapHospitalRows(data as Row[]);
  } catch {
    return HOSPITALS;
  }
}
