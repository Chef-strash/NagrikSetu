/** Single source of truth for ward and empaneled-hospital lists.
 *  Used as the offline fallback; Supabase `ward_offices` / `empaneled_hospitals`
 *  override it when reachable (see lib/data/wards-remote.ts). */
export const WARDS: string[] = [
  "Ward 14: Kothrud - Bawdhan",
  "Ward 7: Kasba - Vishrambaugwada",
  "Ward 9: Bhavani Peth",
  "Ward 2: Shivajinagar - Ghole Road",
  "Ward 4: Nagar Road - Vadgaon Sheri",
];

export interface Hospital {
  name: string;
  area: string;
  type: string;
}

export const HOSPITALS: Hospital[] = [
  { name: "Poona Hospital & Research Centre", area: "Sadashiv Peth", type: "Private Empaneled (50% Concession)" },
  { name: "Sahyadri Super Specialty Hospital", area: "Deccan Gymkhana", type: "Private Empaneled (Critical Care)" },
  { name: "Kamla Nehru Municipal Hospital", area: "Mangalwar Peth", type: "PMC Civic Hospital (100% Free)" },
  { name: "KEM Hospital Pune", area: "Rasta Peth", type: "Private Empaneled" },
  { name: "Bharati Vidyapeeth Medical Foundation", area: "Dhankawadi", type: "Private Empaneled" },
  { name: "Deenanath Mangeshkar Hospital", area: "Erandwane", type: "Private Empaneled" },
];
