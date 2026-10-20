import type { UserProfile } from "../context/AppContext";

export const EMPTY_PROFILE: UserProfile = {
  name: "",
  mobile: "",
  ward: "",
  income: 0,
  domicileYears: 0,
  category: "Open / General",
  rationCard: "None",
  hasProduceVendor: false,
  empaneledHospitals: [],
  dbtEnabled: true,
  disabilityStatus: "None",
};

type Row = Record<string, unknown>;

export function rowToProfile(row: Row): UserProfile {
  return {
    name: String(row.name ?? ""),
    mobile: String(row.mobile ?? ""),
    ward: String(row.ward ?? ""),
    income: Number(row.income ?? 0) || 0,
    domicileYears: Number(row.domicile_years ?? 0) || 0,
    category: String(row.category ?? EMPTY_PROFILE.category),
    rationCard: String(row.ration_card ?? EMPTY_PROFILE.rationCard),
    hasProduceVendor: Boolean(row.has_produce_vendor),
    empaneledHospitals: Array.isArray(row.empaneled_hospitals) ? (row.empaneled_hospitals as string[]) : [],
    dbtEnabled: row.dbt_enabled === undefined || row.dbt_enabled === null ? true : Boolean(row.dbt_enabled),
    disabilityStatus: String(row.disability_status ?? "None"),
  };
}

export function profileToRow(p: UserProfile, userId: string, email?: string | null): Row {
  return {
    user_id: userId,
    email: email ?? null,
    name: p.name,
    mobile: p.mobile,
    ward: p.ward,
    income: p.income,
    domicile_years: p.domicileYears,
    category: p.category,
    ration_card: p.rationCard,
    has_produce_vendor: p.hasProduceVendor,
    empaneled_hospitals: p.empaneledHospitals,
    dbt_enabled: p.dbtEnabled,
    disability_status: p.disabilityStatus,
  };
}
