# PMC Source Verification — 2026-10-04

What PMC's official endpoints actually return, verified by direct HTTP probing of the official hosts on 2026-10-04. This is the source of truth for the harvester's source registry (`src/sources/registry.ts`) and for the counts used in the demo. It supersedes unverified claims in `civic_intelligence_cline_analysis.md`.

**Method:** direct `curl` against official government hosts only. No news, aggregator, or search source was used.

## 1. Hosts

| Host | Role | Notes |
| :--- | :--- | :--- |
| `webadmin.pmc.gov.in` | PMC CMS — **Drupal 11** | Primary structured JSON surface (the listing API); file store for PDFs |
| `www.pmc.gov.in` | PMC public site — **Next.js** | `sitemap.xml` + sub-sitemaps; some pages client-rendered |
| `dbt.pmc.gov.in` | PMC DBT portal — **AngularJS SPA** | Serves `/app/index.html#!/`; deeper API behind redirects |

`robots.txt` on `www.pmc.gov.in` is permissive (`User-agent: *` / `Disallow:`), with `Sitemap: https://www.pmc.gov.in/sitemap.xml`.

## 2. The CMS JSON listing API (primary discovery surface)

Base: `https://webadmin.pmc.gov.in/api/listing-api/<content_type>?per_page=<n>&page=<n>`

Response shape: `{ meta: { total_items, total_pages, current_page, per_page, content_type }, meta_tags, data: { content_type_name, nodes: [ ... ] } }`.

**Critical:** the content-type token is **singular** where it matters — `circular` returns data; `circulars` returns 0.

### Verified content types and counts (2026-10-04)

| `content_type` | total_items | Use |
| :--- | ---: | :--- |
| `circular` | **9,416** | Primary discovery + scheme facts (filter by department / title) |
| `committee_decisions` | 2,344 | Standing-committee agenda (context; deferred) |
| `press_note` | 253 | Discovery |
| `page` | 167 | Discovery |
| `online_services` | 154 | Discovery |
| `crematoriums` | 109 | Reference (deferred) |
| `pmc_hospitals` | 74 | Reference loader |
| `pmc_initiatives` | 38 | Discovery |
| `citizen_charter` | 37 | Context |
| `ward_offices` | 15 | Reference loader |
| `general_information` | 7 | Context |
| `schemes` | **1** | Seed only — one row (`Dr. Babasaheb Ambedkar Shram Safalya Awas Yojana`) |
| `news` | 150 | Not a scheme source (excluded) |
| `circulars`, `charter`, `tenders`, `awards`, `press`, `release`, `events` | 0 | Empty |

Because `schemes` holds only 1 item, scheme discovery must run off `circular` (filtered by Marathi department / title terms) plus the watch list — **not** the `schemes` feed.

### Node field shape (observed)

`nid`, `title`, `display_date`, `end_date`, `file`, `file_size`, `file_type`, `changed`, `department`, `ward_name`, `address`, `location` (WKT, e.g. `POINT (73.868 18.467)`), `url` (`/node/<nid>` or slug), `link`, `external_link`, plus content-type-specific fields (`circular_no`, `applicable_status`, etc.).

## 3. Document store

Linked documents (circulars, forms) resolve to:

```
https://webadmin.pmc.gov.in/sites/default/files/<YYYY-MM>/<name>.pdf
```

Confirmed via the `www.pmc.gov.in/l/circular` page linking `webadmin.pmc.gov.in/sites/default/files/2025-09/STQC_Certificate.pdf`. Many circulars are **scanned** — text extraction alone is insufficient; page images must be provided to the model.

## 4. DBT portal

`https://dbt.pmc.gov.in/` root → `404`; `/` redirects to `/app/index.html#!/` (AngularJS SPA). API-style paths (`/api`, `/api/scheme`) return `302`. The DBT host's CORS header advertises `Access-Control-Allow-Origin: http://103.249.97.52:8091`, corroborating the `103.249.97.52:8091/api/Scheme/*` service cited in the harvester plan. Reachability is undetermined until `scripts/capture-fixtures.sh` runs.

## 5. Open items

- Confirm `103.249.97.52:8091/api/Scheme/*` responds from the build network.
- Confirm the `circular` department field reliably carries the Marathi department values used by the discovery filter.
- Confirm `www.pmc.gov.in/schemes/*` is client-rendered (needs Playwright).
