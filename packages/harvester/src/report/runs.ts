/**
 * `agent_runs` bookkeeping — now the shared `@nagriksetu/agents` run logging.
 *
 * The shared implementation takes a structural client (the `from` / `insert` /
 * `update` slice it actually uses) instead of Supabase's `SupabaseClient`, so
 * the real service-role client in `src/supabase/client.ts` is passed straight
 * through. Re-exported here so existing harvester imports keep working.
 */
export {
  coverageDetails,
  createInMemoryRuns,
  createSupabaseRuns,
  statusFor,
  type RunClosePatch,
  type RunRecord,
  type RunStatus,
  type RunTotals,
  type RunsPort,
  type RunsTableClient,
} from "@nagriksetu/agents";
