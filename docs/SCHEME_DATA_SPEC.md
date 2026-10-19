# NagrikSetu: Final Scheme Data Spec (what the database must hold)

_Contract between the harvester (writes scheme data) and the citizen app (reads it). Model decided 2026-10-04: **one consistent user profile + one eligibility text per scheme, assessed by the LLM**; scheme data from **official government sources only**. Schema = `SUPABASE_SETUP.sql` + `migrations/002_schema_v2.sql`._

**Fill modes**: **H** = harvester agent from official sources, **D** = deterministic load from a structured official feed, **M** = manual / curated, **C** = crowdsourced in-app, **X** = computed.

## 0. Frontend coverage contract (every field the app reads)
Checked against `packages/web/src/lib/data/schemes.ts` (`Scheme`) and the hydration in `AppContext.tsx`. **Every row the harvester writes must satisfy the "Required" column**; the harvester's apply stage checks this per scheme and logs gaps in `agent_runs.details.coverage`.

| Frontend field (`Scheme`) | DB column | Required on write? | Who fills |
| :--- | :--- | :--- | :--- |
| `id` | `slug` | yes | X: kebab-case of English name, prefixed `pmc-` |
| `category`, `categoryLabel` | `category`, `category_label` (+ `pillar`) | yes | H classifies; X maps label and pillar (`livelihood` -> `AGRICULTURE_LIVELIHOOD`) |
| `name` | `name` | yes | H |
| `vernacularName` | `vernacular_name.mr` | yes | H (Marathi title from the source) |
| `department` | `department` | yes | H |
| `description` | `description` | yes | H |
| `eligibility` | `eligibility_text` | yes | H |
| `benefitAmount`, `benefitType` | `benefit_amount`, `benefit_type` | if stated | H |
| `cutoff` | `cutoff` | if stated | H (one-line summary of the main condition) |
| `incomeLimit`, `incomeLimitFormatted` | `income_limit`, `income_limit_formatted` | if stated | H |
| `domicileYears` | `domicile_years` | if stated | H |
| `deadline` | `deadline` (+ `application_deadline`, `window_opens_at`) | if stated | H |
| `resolutionNo` | `resolution_no` | if stated | H |
| `officialFormName`, `officialFormUrl` | `official_form_name`, `official_form_url` | if stated | H (real URL only) |
| `counterLocation.office/address` | `ward_offices.ward_name`, `physical_address` via `schemes.ward_office_id` | yes | X: `desk_type` from department, then the Ward 14 counter with that desk type |
| `counterLocation.desk/hours` | `ward_offices.counter_number`, `operating_hours` | via the counter row | M (seeded for Ward 14) |
| `requiredDocuments` | `required_documents` (JSON array) **and** `scheme_documents` rows | yes (non-empty) | H; apply writes both |
| `stapleOrder` | `staple_order` | yes | X default: "1. Application form" followed by `required_documents` in order; M/C can refine |
| `communityTips` | `peer_intel_reviews` | no | C |
| (internal) | `scheme_code`, `source_url`, `verification_status`, `last_verified_at`, `is_active` | yes | X |

**Department -> desk type** (X): समाज विकास / Social Development / education departments -> `EDU_DBT` (Counter 3); आरोग्य / Health -> `HEALTH` (Counter 1); urban livelihood / encroachment / hawker -> `VENDOR` (Counter 5); anything else -> `EDU_DBT` and flagged in coverage.

**Teammate**: hydration should skip `is_active = false` rows, and should show "Not published" for NULL optional fields instead of the current invented defaults.

## 1. `schemes` (one row per scheme)
| Column | Frontend use | Fill | Notes |
| :--- | :--- | :--- | :--- |
| `slug`, `scheme_code` | URL id | X | |
| `name`, `name_i18n`, `vernacular_name` | title, Marathi subtitle | H | |
| `department` | badge | H | |
| `pillar`, `category`, `category_label` | filters | H | categories: `education`, `healthcare`, `livelihood` |
| `description`, `description_i18n` | detail page | H | plain-language summary of the official text |
| **`eligibility_text`**, `eligibility_text_mr` | "Who qualifies"; input to the LLM eligibility check | H | **all conditions, one per line**, as written in the official source |
| `benefit_amount`, `grant_amount`, `benefit_type` | benefit box, sorting | H | |
| `cutoff` | list card summary | H | short line; full detail lives in `eligibility_text` |
| `income_limit`, `income_limit_formatted` | income filter | H | NULL when not stated |
| `domicile_years` | - | H | NULL when not stated |
| `deadline`, `window_opens_at`, `application_deadline` | deadline badge | H | NULL for round-the-year |
| `application_mode`, `apply_url`, `how_to_apply` | how to apply | H | |
| `official_form_name`, `official_form_url` | download button | H | NULL rather than invented |
| `resolution_no`, `source_url` | citation line | H | `source_url` = the official page/PDF the row came from |
| `required_documents`, `staple_order` | checklists | H documents; X default staple order, M/C refine | apply writes the JSON arrays and `scheme_documents` |
| `ward_office_id`, `desk_type` | where to submit | X from department (Ward 14 counters) | counter details themselves are M |
| `verification_status`, `last_verified_at`, `source_doc_id`, `source_hash` | "last checked" line | X | `verified` = harvested from an official source; `seed_unverified` = hand-written seed |
| `is_active` | hide expired | X | |

## 2. `user_profiles` (same shape for every scheme)
Columns: `name`, `mobile`, `ward`, `income`, `domicile_years`, `category`, `ration_card`, `has_produce_vendor`, `children_count`, `third_child_after_2001`, `empaneled_hospitals`, plus **`facts` JSON** for beneficiary details: `beneficiary_name`, `relation`, `age`, `gender`, `class_level`, `marks_percent`, `school_type`, `course_type`, `disability_percent`, `parent_occupation`, `is_orphan`, `is_street_vendor`, `has_vending_certificate`. The LLM asks for any fact a scheme's text needs that the profile lacks.

## 3. Eligibility assessment (citizen app)
Input: profile + `eligibility_text`. Output stored in `active_sessions.eligibility_result`:
`{ verdict: "likely_eligible" | "not_eligible" | "need_more_info", reasons: [...], quoted_lines: [...], missing_info: [...] }`.
Rules: use only conditions in the text; quote the lines relied on; present as guidance with "confirm at the ward office".

## 4. `scheme_documents`
`doc_key`, `label_en`, `label_mr`, `validator`, `is_required`, `staple_position`, `display_order`. Fill: H for the list, M/C for staple position.

## 5. Reference tables
| Table | Fill | Source |
| :--- | :--- | :--- |
| `ward_offices` | D name, address, external id (15 rows); M counters, desk type, hours | `webadmin.pmc.gov.in/api/listing-api/ward_offices` |
| `empaneled_hospitals` | D 74 municipal facilities (ward, coordinates); M private SGAY empanelment | `listing-api/pmc_hospitals` |
| `bank_merger_map` | M (seeded) | RBI merger notifications |

## 6. Harvester bookkeeping
`source_documents` (what was fetched and its hash, for change detection), `scheme_change_events` (what changed), `agent_runs` (each run), `scraper_logs` (selector repairs, stretch).

## 7. App-owned (teammate)
`user_profiles`, `active_sessions`, `application_dockets`, `peer_intel_reviews`.

## 8. Not used any more
`scheme_criteria_rules` (kept in the database, marked deprecated); per-field evidence and trust tiers (dropped from the design).
