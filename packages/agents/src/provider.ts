/**
 * Provider key resolution (KTD2).
 *
 * Order, first hit wins:
 *   1. `<PREFIX>_API_KEY`   — `HARVESTER_API_KEY` for the harvester, `AUDIT_API_KEY`
 *                             for the citizen document audit.
 *   2. `CLINE_API_KEY`, then the Cline OAuth token written by the Cline sign-in
 *      at `<CLINE_DATA_DIR>/settings/providers.json` (only for `cline*` providers).
 *   3. `ANTHROPIC_API_KEY` for the `anthropic` provider.
 *   4. `<PROVIDER>_API_KEY` for any other provider.
 *
 * Keys come from env or the Cline credential store only — never from source.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_ENV_PREFIX, DEFAULT_PROVIDER_ID } from "./models.js";
import { envName } from "./env.js";

/** The harness credential dir, honouring the same env the Cline SDK uses. */
export function resolveClineDataDir(env: NodeJS.ProcessEnv = process.env): string {
  return env["CLINE_DATA_DIR"]?.trim() || join(homedir(), ".cline", "data");
}

/**
 * Cline account token from the Cline harness credential store
 * (`<dataDir>/settings/providers.json`), written when you sign in to Cline.
 * Lets ClinePass / Cline-billed models run without a separate provider key.
 *
 * `dataDir` is explicit rather than inferred so a caller that has redirected
 * `CLINE_DATA_DIR` for a run (see `runAgentSession`) can still read the real
 * credential store.
 */
export function readClineStoredToken(
  env: NodeJS.ProcessEnv = process.env,
  dataDir: string = resolveClineDataDir(env),
): string | undefined {
  try {
    const raw = readFileSync(join(dataDir, "settings", "providers.json"), "utf8");
    const parsed = JSON.parse(raw) as {
      providers?: Record<
        string,
        { settings?: { auth?: { accessToken?: unknown } } }
      >;
    };
    const providers = parsed.providers ?? {};
    for (const id of ["cline-pass", "cline"]) {
      const token = providers[id]?.settings?.auth?.accessToken;
      if (typeof token === "string" && token.trim().length > 0) {
        return token.trim();
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve the API key for the chosen provider.
 *
 * `prefix` is the caller's own variable prefix. It defaults to `HARVESTER` so
 * the harvester's `HARVESTER_API_KEY` precedence is preserved until the
 * harvester passes its prefix explicitly.
 */
export function resolveProviderKey(
  env: NodeJS.ProcessEnv = process.env,
  providerId: string = DEFAULT_PROVIDER_ID,
  prefix: string = DEFAULT_ENV_PREFIX,
): string | undefined {
  const prefixedName = envName(prefix, "API_KEY");
  const prefixed = prefixedName ? env[prefixedName]?.trim() : undefined;
  if (prefixed) return prefixed;

  const pid = (providerId || DEFAULT_PROVIDER_ID).toLowerCase();
  if (pid.startsWith("cline")) {
    return env["CLINE_API_KEY"]?.trim() || readClineStoredToken(env);
  }
  if (pid === "anthropic") {
    return env["ANTHROPIC_API_KEY"]?.trim() || undefined;
  }
  const providerName = envName(pid, "API_KEY");
  const providerKey = providerName ? env[providerName]?.trim() : undefined;
  return providerKey || undefined;
}
