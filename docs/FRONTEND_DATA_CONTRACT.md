# NagrikSetu: Frontend <-> Data Contract & Gap Review

_Reviewed 2026-10-04 (night before the Stage 2 build). Source of truth for what each screen needs, what is real vs mocked, and what the database must provide. Live Supabase state could not be queried during this review (network blocked); everything below compares `docs/SUPABASE_SETUP.sql` with `packages/web`. Confirm live with the SQL editor before relying on it._

## 1. What is real vs mocked today

| Screen | Real | Mocked / wrong |
| :--- | :--- | :--- |
| `/` Home | Category cards, resume banner | Search is `String.includes` over scheme text. Voice button fakes a transcript after 2s. No-match falls back to `schemes[0]` silently. Session is created for beneficiary "Applicant" (name never asked) |
| `/schemes` | Category + text filter; income filter (fixed 2026-10-04: shows schemes the family's income still qualifies for) | - |
| `/schemes/[id]` | Detail layout, tips list; "Who Qualifies" now renders the scheme's `eligibility` text | Unknown id silently shows `schemes[0]`. Add-tip and Helpful only change local React state |
| `/sessions` | List UI | Sessions live only in React state; a browser refresh loses new ones |
| `/assistant` | Split layout | Replies are a keyword if/else (hours, photo, digilocker, bank, child). "Listen" and mic are fake. **Check ignores the uploaded file** and always returns account `*******4912`, IFSC `SYNB0005012 -> CNRB0005012` and Aadhaar `XXXX-XXXX-4912` |
| `/audit` | Layout | Same fake Check as `/assistant` (duplicate of its checklist) |
| `/profile` | Form | Save updates React state only. Hospital list is hard-coded (6 names), not read from `empaneled_hospitals` |
| Header | Nav, language toggle | Only labels are translated. Sign-in modal just sets a name; no auth |
| Supabase hydration | Schemes, tips, profile, sessions are read when env is set | Overwrites fixtures with DB rows; tips all show "Recently"; profile = first row of the table |

## 2. Data the screens need vs what the schema has

| Need | Today | Gap |
| :--- | :--- | :--- |
| Eligibility conditions per scheme ("Who qualifies" and the LLM check) | `scheme_criteria_rules` exists (3 rules), never read | **Done in 002**: `schemes.eligibility_text` (one block per scheme). The detail page now renders it |
| Facts about the **beneficiary** (marks %, class, gender, course, school type, disability, orphan) | Nowhere | **Done in 002**: `user_profiles.facts` JSON + `children_count`, `third_child_after_2001` |
| Eligibility result per session | none | `active_sessions.eligibility_result` (LLM verdict, quoted lines, missing info) |
| Required documents with a type key so each can be validated differently | `required_documents` is `string[]` | New `scheme_documents` table (`doc_key`, labels EN/MR, validator, staple position) |
| Counter routing by citizen ward and scheme desk | `ward_offices` has Ward 14 only (one row per counter); profile offers 5 wards; PMC has 15 | Add `desk_type`; seed other wards via the ward-contacts harvester |
| Bilingual content | `vernacular_name` only | Marathi for description, cutoff, doc labels, tips. Add `*_i18n JSONB` |
| IFSC merger resolution | Nothing (logic was a string constant) | `bank_merger_map` reference table. **Caution**: swapping the 4-letter bank prefix and keeping the rest (SYNB0005012 -> CNRB0005012) is not reliably how merged branches were re-coded. Resolve against a branch-level IFSC dataset before claiming it in the demo |
| Hospitals shown in profile | 5 seeded, UI hard-codes 6 (`Bharati Vidyapeeth Medical Foundation` vs seed `Bharati Hospital & Research Centre`; Deenanath Mangeshkar not seeded) | Read the table; seed Deenanath; normalise names |
| Scheme list parity | Frontend fixtures have 6 schemes; DB seed has 5 (**Savitribai Phule girls scheme missing**), so live hydration silently drops it | Seed it (in migration 002) |
| Application window for alerts | `deadline` text, `application_deadline` | Add `window_opens_at` |
| Semantic search | `schemes.embedding` is NULL for all rows; the app never calls the RPC; 1536-dim implies an OpenAI-style embedder we do not have | Do not depend on pgvector tomorrow. Use LLM intent extraction -> structured filters -> deterministic rules |
| Provenance (is this number real?) | `source_url`, `resolution_no` are unverified seeds | Harvester sets `source_url`, `verification_status='verified'`, `last_verified_at`. Seed resolution numbers and form URLs are **not confirmed against PMC**; show them only once harvested |
| Ingestion / monitoring (agents) | `scraper_logs` is selector-repair shaped | New `source_documents`, `scheme_change_events`, `agent_runs` |

## 2b. Teammate notes (current)
- **Eligibility**: build the LLM check as described in [`SCHEME_DATA_SPEC.md`](SCHEME_DATA_SPEC.md) section 3: profile + `eligibility_text` in, verdict + quoted lines + missing info out, shown as guidance.
- **Done in this commit**: pillar renamed to Livelihood, 7/12 scheme and land fields removed, `Scheme.eligibility` added and rendered on `/schemes/[id]`, income filter fixed (shows schemes the family's income still qualifies for).
- **Still yours**: after migration 002, `income_limit`, `domicile_years`, `deadline`, `cutoff`, `official_form_*` can be NULL; `AppContext` still replaces NULL with invented defaults (`|| 250000`, `|| 3`, `|| "October 31, 2026"`). Show "Not published" instead. Read profile `facts` for beneficiary details.

## 3. Decisions adopted
1. **Scope**: PMC only. Ward 14 deep, other wards from the ward-offices feed.
2. **Eligibility**: one consistent profile + one eligibility text per scheme; the LLM assesses and cites the lines it used. No rules engine.
3. **Sources**: official government sources only (PMC portals/APIs/PDFs, central scheme sites for centrally funded schemes). No news, no aggregators, no web search.
4. **Truth**: seed rows are `seed_unverified` until the harvester refreshes them from an official source.
5. **Sessions and profile** are local-first for the demo.
6. **IFSC** resolves through a lookup table plus branch-level data, never string replacement.
7. **Pillars**: Education, Healthcare, Livelihood & Self-Employment.
