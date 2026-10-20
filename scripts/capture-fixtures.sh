#!/usr/bin/env bash
# Capture real feed JSON into packages/harvester/fixtures/ (allowlist-guarded).
#
# Usage:
#   SCRAPER_MODE=live ./scripts/capture-fixtures.sh          # fetch + save
#   ./scripts/capture-fixtures.sh                            # fixture mode: no-op
#
# Only official government hosts may be fetched. Nothing is written outside
# packages/harvester/fixtures/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/packages/harvester/fixtures"
MODE="${SCRAPER_MODE:-fixture}"
APIBASE="https://webadmin.pmc.gov.in/api/listing-api"

if [ "$MODE" != "live" ]; then
  echo "SCRAPER_MODE=$MODE: fixture mode, nothing to fetch (offline-safe)."
  exit 0
fi

allow() { case "$1" in
  https://webadmin.pmc.gov.in/*|https://www.pmc.gov.in/*|https://pmc.gov.in/*|https://dbt.pmc.gov.in/*|https://www.mohua.gov.in/*|https://pmsvanidhi.mohua.gov.in/*) return 0;;
  *) echo "refused (not allowlisted): $1" >&2; return 1;;
esac; }

get() { url="$1"; out="$2"; allow "$url" || exit 1; curl -fsSL --max-time 30 "$url" -o "$out"; echo "saved $out"; }

mkdir -p "$OUT"
# The live listing API honours `limit` (it ignores `per_page`) and returns the
# first N items; capture the maximum useful page.
get "$APIBASE/circular?limit=100&page=1"       "$OUT/listing-circular-p1.json"
get "$APIBASE/ward_offices?limit=100&page=1"   "$OUT/listing-ward_offices-p1.json"
get "$APIBASE/pmc_hospitals?limit=100&page=1"  "$OUT/listing-pmc_hospitals-p1.json"
